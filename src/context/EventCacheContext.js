import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { getEvents } from '../services/eventService';
import { useAuth } from './AuthContext';
import { perfMark } from '../utils/perf';

const EventCacheContext = createContext(null);

const DEFAULT_FILTERS = {
  distance: 25,
  timeRange: 'month',
  categories: null,
  location: null,
  isCustomLocation: false,
};

const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;

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
  const fetchInProgressRef = useRef(false);
  const filtersRef = useRef(DEFAULT_FILTERS);

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
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        locationCacheRef.current = { coords, fetchedAt: Date.now() };
        perfMark('location:acquired', { source: 'gps-fix' });
        return coords;
      }
      perfMark('location:acquired', { source: 'denied', status });
    } catch (error) {
      perfMark('location:acquired', { source: 'error' });
      console.log('Could not get location:', error);
    }
    return null;
  }, []);

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

  const fetchEvents = useCallback(async (filtersOverride, { background = false } = {}) => {
    if (fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;

    const currentFilters = filtersOverride ?? filtersRef.current;

    if (background) {
      setBackgroundRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      perfMark('fetch:start', { background });
      const location = await getLocation(currentFilters.location);

      perfMark('net:request-sent', { hasLocation: !!location });
      const result = await getEvents(user?.uid, location, currentFilters);
      perfMark('net:response-received', {
        ok: result.success,
        events: result.events?.length ?? 0,
      });

      if (result.success) {
        setEvents(result.events);
        setFetchId(prev => prev + 1);
        perfMark('state:events-committed', { count: result.events.length, background });
        prefetchImages(result.events, 0, 5);
        if (user?.uid) persistCache(user.uid, result.events, currentFilters);
      }
    } finally {
      fetchInProgressRef.current = false;
      setLoading(false);
      setBackgroundRefreshing(false);
    }
  }, [user, getLocation, persistCache]);

  // On login: show disk cache instantly, then refresh in background
  useEffect(() => {
    if (!user) {
      setEvents([]);
      setFetchId(0);
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
          const activeFilters = cachedFilters ?? DEFAULT_FILTERS;
          filtersRef.current = activeFilters;
          setFilters(activeFilters);
          setEvents(cachedEvents);
          setFetchId(prev => prev + 1);
          perfMark('cache:hydrated-from-disk', { count: cachedEvents?.length ?? 0 });
          prefetchImages(cachedEvents, 0, 5);
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
