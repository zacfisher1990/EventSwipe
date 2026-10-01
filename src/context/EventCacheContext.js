import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { getEvents, normalizeCategory, migrateFilters } from '../services/eventService';
import { useAuth } from './AuthContext';
import { perfMark } from '../utils/perf';
import { updateSearchArea } from '../services/notificationService';

const EventCacheContext = createContext(null);

const DEFAULT_FILTERS = {
  distance: 25,
  timeRange: 'month',
  categories: null,
  location: null,
  isCustomLocation: false,
};

const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;
const LAST_KNOWN_MAX_AGE_MS = 30 * 60 * 1000;

// Cards at and just behind the top of the deck stay put when new results are
// merged in, so nothing changes under the user's finger.
const VISIBLE_CARDS = 3;

const eventIds = (event) => event.groupedIds || [event.id];

const cacheKey = (userId) => `events_cache_${userId}`;

const prefetchImages = (eventList, fromIndex, count) => {
  eventList.slice(fromIndex, fromIndex + count).forEach(event => {
    if (event?.image) Image.prefetch(event.image).catch(() => {});
  });
};

export function EventCacheProvider({ children }) {
  // Only mounts after auth resolves — the location + fetch chain cannot start
  // any earlier than this point.
  perfMark('cache:provider-mounted');

  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [fetchId, setFetchId] = useState(0);

  const locationCacheRef = useRef(null);
  const fetchTokenRef = useRef(0);
  const filtersRef = useRef(DEFAULT_FILTERS);

  // The deck as the swiper sees it, and how far into it the user has swiped
  // (kept in step with CardSwiper's index via markSwiped/unmarkSwiped).
  const deckRef = useRef([]);
  const deckPosRef = useRef(0);
  const sessionSwipedRef = useRef(new Set());

  // Start a fresh deck: CardSwiper remounts (fetchId) at index 0.
  const replaceDeck = useCallback((list) => {
    deckRef.current = list;
    deckPosRef.current = 0;
    setEvents(list);
    setFetchId(prev => prev + 1);
    prefetchImages(list, 0, 5);
  }, []);

  // Fold new results into the current deck without disturbing what's on
  // screen: keep the swiped + visible cards, replace everything behind them.
  const mergeIntoDeck = useCallback((fresh) => {
    const deck = deckRef.current;
    const pos = deckPosRef.current;
    const swiped = sessionSwipedRef.current;
    const notSwiped = (e) => !eventIds(e).some(id => swiped.has(id));

    if (pos >= deck.length) {
      // Deck exhausted (or empty) — nothing on screen to preserve
      replaceDeck(fresh.filter(notSwiped));
      return;
    }

    const kept = deck.slice(0, pos + VISIBLE_CARDS);
    const keptIds = new Set(kept.flatMap(eventIds));
    const rest = fresh.filter(e => notSwiped(e) && !eventIds(e).some(id => keptIds.has(id)));
    const merged = [...kept, ...rest];
    deckRef.current = merged;
    setEvents(merged);
  }, [replaceDeck]);

  const persistCache = useCallback(async (userId, eventList, currentFilters) => {
    try {
      await AsyncStorage.setItem(cacheKey(userId), JSON.stringify({
        events: eventList,
        filters: currentFilters,
        savedAt: Date.now(),
      }));
    } catch {
      // Non-critical — ignore storage failures
    }
  }, []);

  // Keep the disk cache in step with swiping, so the next launch doesn't
  // open on cards the user already swiped.
  const persistTimerRef = useRef(null);
  const schedulePersistDeck = useCallback(() => {
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      if (user?.uid) {
        persistCache(user.uid, deckRef.current.slice(deckPosRef.current), filtersRef.current);
      }
    }, 1000);
  }, [user, persistCache]);

  const markSwiped = useCallback((event) => {
    eventIds(event).forEach(id => sessionSwipedRef.current.add(id));
    deckPosRef.current += 1;
    schedulePersistDeck();
  }, [schedulePersistDeck]);

  const unmarkSwiped = useCallback((event) => {
    eventIds(event).forEach(id => sessionSwipedRef.current.delete(id));
    deckPosRef.current = Math.max(0, deckPosRef.current - 1);
    schedulePersistDeck();
  }, [schedulePersistDeck]);

  const getLocation = useCallback(async (filterLocation) => {
    perfMark('location:start');

    if (filterLocation?.coords) {
      perfMark('location:acquired', { source: 'filter-override' });
      return {
        latitude: filterLocation.coords.latitude,
        longitude: filterLocation.coords.longitude,
      };
    }

    const cached = locationCacheRef.current;
    if (cached && Date.now() - cached.fetchedAt < LOCATION_CACHE_TTL_MS) {
      perfMark('location:acquired', { source: 'memory-cache' });
      return cached.coords;
    }

    try {
      // On a true first launch this blocks on the OS permission dialog —
      // i.e. on user reaction time, with the network request queued behind it.
      const { status } = await Location.requestForegroundPermissionsAsync();
      perfMark('location:permission-resolved', { status });

      if (status === 'granted') {
        // A recent last-known fix is instant and plenty accurate for a
        // multi-mile radius; only wait on a fresh GPS fix without one.
        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
        const position = lastKnown ?? await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        locationCacheRef.current = { coords, fetchedAt: Date.now() };
        perfMark('location:acquired', { source: lastKnown ? 'last-known' : 'gps-fix' });
        return coords;
      }
      perfMark('location:acquired', { source: 'denied', status });
    } catch (error) {
      perfMark('location:acquired', { source: 'error' });
      console.log('Could not get location:', error);
    }
    return null;
  }, []);


  const fetchEvents = useCallback(async (filtersOverride, { background = false } = {}) => {
    // A newer fetch (e.g. filters changed mid-refresh) supersedes this one
    const token = ++fetchTokenRef.current;
    const isCurrent = () => token === fetchTokenRef.current;

    const currentFilters = filtersOverride ?? filtersRef.current;

    if (background) {
      setBackgroundRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      perfMark('fetch:start', { background });
      const location = await getLocation(currentFilters.location);
      if (!isCurrent()) return;

      // Foreground fetches (first launch, new filters) start a new deck with
      // the first non-empty batch; everything after that merges in.
      let shown = false;
      const onUpdate = (list, { final }) => {
        if (!isCurrent()) return;
        if (!shown) {
          if (list.length === 0 && !final) return;
          shown = true;
          if (background) mergeIntoDeck(list); else replaceDeck(list);
          setLoading(false);
          perfMark('state:events-committed', { count: list.length, background, final });
        } else {
          mergeIntoDeck(list);
        }
      };

      if (!currentFilters.isCustomLocation) {
        updateSearchArea(user?.uid, location, currentFilters.distance);
      }

      perfMark('net:request-sent', { hasLocation: !!location });
      const result = await getEvents(user?.uid, location, currentFilters, onUpdate);
      perfMark('net:response-received', {
        ok: result.success,
        events: result.events?.length ?? 0,
      });

      if (result.success && isCurrent() && user?.uid) {
        persistCache(user.uid, result.events, currentFilters);
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setBackgroundRefreshing(false);
      }
    }
  }, [user, getLocation, persistCache, replaceDeck, mergeIntoDeck]);

  // On login: show disk cache instantly, then refresh in background
  useEffect(() => {
    if (!user) {
      setEvents([]);
      setFetchId(0);
      deckRef.current = [];
      deckPosRef.current = 0;
      sessionSwipedRef.current = new Set();
      locationCacheRef.current = null;
      return;
    }

    (async () => {
      try {
        perfMark('cache:disk-read-start');
        const raw = await AsyncStorage.getItem(cacheKey(user.uid));
        perfMark('cache:disk-read-done', { hit: !!raw, bytes: raw?.length ?? 0 });

        if (raw) {
          const { events: cachedEvents, filters: cachedFilters } = JSON.parse(raw);
          const activeFilters = migrateFilters(cachedFilters ?? DEFAULT_FILTERS);
          filtersRef.current = activeFilters;
          setFilters(activeFilters);
          replaceDeck((cachedEvents ?? []).map(e => ({ ...e, category: normalizeCategory(e.category) })));
          perfMark('cache:hydrated-from-disk', { count: cachedEvents?.length ?? 0 });
          // Silently refresh in background — user already sees content
          fetchEvents(activeFilters, { background: true });
        } else {
          // First-ever launch for this user — show loading spinner
          fetchEvents();
        }
      } catch {
        fetchEvents();
      }
    })();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = useCallback((newFilters) => {
    filtersRef.current = newFilters;
    setFilters(newFilters);
    fetchEvents(newFilters);
  }, [fetchEvents]);

  const refresh = useCallback((background = false) => {
    fetchEvents(undefined, { background });
  }, [fetchEvents]);

  const prefetchAhead = useCallback((currentIndex, count = 5) => {
    prefetchImages(events, currentIndex + 1, count);
  }, [events]);

  return (
    <EventCacheContext.Provider value={{
      events,
      loading,
      backgroundRefreshing,
      fetchId,
      filters,
      applyFilters,
      refresh,
      prefetchAhead,
      markSwiped,
      unmarkSwiped,
    }}>
      {children}
    </EventCacheContext.Provider>
  );
}

export const useEventCache = () => {
  const ctx = useContext(EventCacheContext);
  if (!ctx) throw new Error('useEventCache must be used within EventCacheProvider');
  return ctx;
};
