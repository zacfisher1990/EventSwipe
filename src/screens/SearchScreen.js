import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useEventCache } from '../context/EventCacheContext';
import { getSavedEvents, saveEvent, searchEvents } from '../services/eventService';
import { submitReport } from '../services/reportService';
import EventDetailsModal from '../components/EventDetailsModal';
import { eventDateText } from '../utils/eventDisplay';
import i18n from '../i18n';

// Find a specific event, artist or venue near the user. Swiping is for
// browsing; this is for when you already know what you're looking for.
export default function SearchScreen() {
  const { user } = useAuth();
  const { getSearchLocation, excludeFromDeck } = useEventCache();

  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(''); // the term the results are for
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'done' | 'error' | 'no-location'
  const [savedIds, setSavedIds] = useState(new Set());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const latestSearch = useRef(0);

  // Which results are already saved (also picks up changes made on other tabs)
  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) return;
      getSavedEvents(user.uid).then((result) => {
        setSavedIds(new Set((result.events || []).map((e) => e.id)));
      });
    }, [user?.uid])
  );

  const runSearch = async () => {
    const term = query.trim();
    if (term.length < 2) return;
    Keyboard.dismiss();

    const searchId = ++latestSearch.current;
    setStatus('loading');
    setSearched(term);

    const location = await getSearchLocation();
    if (searchId !== latestSearch.current) return;
    if (!location) {
      setResults([]);
      setStatus('no-location');
      return;
    }

    const result = await searchEvents(location, term);
    if (searchId !== latestSearch.current) return; // a newer search replaced this one
    setResults(result.events);
    setStatus(result.success ? 'done' : 'error');
  };

  const clearSearch = () => {
    latestSearch.current++;
    setQuery('');
    setSearched('');
    setResults([]);
    setStatus('idle');
  };

  const handleSave = async () => {
    const event = selectedEvent;
    setSelectedEvent(null);
    if (!event || !user?.uid) return;

    const result = await saveEvent(user.uid, event);
    if (result.success) {
      setSavedIds((prev) => new Set(prev).add(event.id));
      excludeFromDeck(event);
    }
  };

  const renderResult = ({ item }) => (
    <TouchableOpacity style={styles.result} onPress={() => setSelectedEvent(item)} activeOpacity={0.7}>
      <Image source={{ uri: item.image }} style={styles.resultImage} />
      <View style={styles.resultInfo}>
        <Text style={styles.resultCategory}>{item.category?.toUpperCase()}</Text>
        <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.resultDate} numberOfLines={1}>{eventDateText(item)}</Text>
        <Text style={styles.resultLocation} numberOfLines={1}>
          {[item.location, item.distance].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {savedIds.has(item.id) && (
        <Ionicons name="heart" size={20} color="#4ECDC4" style={styles.savedIcon} />
      )}
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (status === 'loading') {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#4ECDC4" />
        </View>
      );
    }
    const message = {
      idle: ['🔎', i18n.t('search.prompt'), i18n.t('search.promptText')],
      done: ['🤷', i18n.t('search.noResults'), i18n.t('search.noResultsText', { query: searched })],
      error: ['⚠️', i18n.t('common.error'), i18n.t('search.failed')],
      'no-location': ['📍', i18n.t('search.noLocation'), i18n.t('search.noLocationText')],
    }[status];
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>{message[0]}</Text>
        <Text style={styles.emptyTitle}>{message[1]}</Text>
        <Text style={styles.emptyText}>{message[2]}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{i18n.t('search.title')}</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={i18n.t('search.placeholder')}
            placeholderTextColor="#999"
            returnKeyType="search"
            onSubmitEditing={runSearch}
            autoCorrect={false}
            maxLength={60}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={clearSearch}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('common.close')}
            >
              <Ionicons name="close-circle" size={18} color="#bbb" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={status === 'loading' ? [] : results}
        renderItem={renderResult}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      <EventDetailsModal
        visible={selectedEvent !== null}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onSave={handleSave}
        onPass={() => {}}
        onReport={(event, reason, details) => submitReport(event.id, user.uid, reason, details, event)}
        // Already-saved results just get a close button
        isSavedView={!!selectedEvent && savedIds.has(selectedEvent.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 10,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  result: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultImage: {
    width: 100,
    height: 110,
  },
  resultInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  resultCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4ECDC4',
    marginBottom: 2,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  resultDate: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  resultLocation: {
    fontSize: 13,
    color: '#999',
  },
  savedIcon: {
    alignSelf: 'center',
    marginRight: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
});
