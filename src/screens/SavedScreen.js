import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, Image, TouchableOpacity, RefreshControl, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getSavedEvents, unsaveEvent, getUserEvents, deleteEvent } from '../services/eventService';
import { getBatchEventAnalytics } from '../services/analyticsService';
import EventDetailsModal from '../components/EventDetailsModal';
import i18n from '../i18n';
import { isOngoing, eventDateText } from '../utils/eventDisplay';
import { parseEventDate } from '../utils/dates';

// Saved events and the user's own posted events, in two sections.
// Open on "My Events" with navigation.navigate('Saved', { section: 'posted' }).

// Filter out past events and sort by date. Ongoing events (no fixed date)
// never expire and are listed after the dated ones.
const filterAndSortEvents = (events) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Start of today

  const dated = events
    .filter(event => {
      if (isOngoing(event) || !event.date) return false;
      const eventDate = parseEventDate(event.date);
      return eventDate && eventDate >= now;
    })
    .sort((a, b) => {
      const dateA = parseEventDate(a.date);
      const dateB = parseEventDate(b.date);
      return (dateA || 0) - (dateB || 0);
    });
  return [...dated, ...events.filter(isOngoing)];
};

// Get valid image URL (handles blob: URLs that don't work on mobile)
const getImageUri = (event) => {
  if (!event?.image || event.image.startsWith('blob:')) {
    return `https://picsum.photos/400/300?random=${event?.id || Math.random()}`;
  }
  return event.image;
};

// "Today", "In 3 days", … for a dated event
const getDaysUntil = (dateString) => {
  const eventDate = parseEventDate(dateString);
  if (!eventDate) return i18n.t('time.dateTBD');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return i18n.t('time.today');
  if (diffDays === 1) return i18n.t('time.tomorrow');
  if (diffDays < 7) return i18n.t('time.inDays', { count: diffDays });
  if (diffDays < 30) return i18n.t('time.inWeeks', { count: Math.floor(diffDays / 7) });
  return i18n.t('time.inMonths', { count: Math.floor(diffDays / 30) });
};

export default function SavedScreen() {
  const [section, setSection] = useState('saved'); // 'saved' | 'posted'
  const [savedEvents, setSavedEvents] = useState([]);
  const [postedEvents, setPostedEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();

  // e.g. after editing a posted event
  useEffect(() => {
    if (route.params?.section) {
      setSection(route.params.section);
      navigation.setParams({ section: undefined });
    }
  }, [route.params?.section]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    if (!user?.uid) return;

    const savedResult = await getSavedEvents(user.uid);
    setSavedEvents(filterAndSortEvents(savedResult.success ? savedResult.events : []));

    // The user's posted events, with their stats
    const postedResult = await getUserEvents(user.uid);
    if (postedResult.success) {
      const events = postedResult.events;
      const analyticsMap = events.length > 0 ? await getBatchEventAnalytics(events.map(e => e.id)) : {};
      setPostedEvents(events.map(event => ({
        ...event,
        views: analyticsMap[event.id]?.views || 0,
        saves: analyticsMap[event.id]?.saves || 0,
        ticketTaps: analyticsMap[event.id]?.ticketTaps || 0,
      })));
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleUnsave = async (eventId, eventTitle = 'this event') => {
    const doUnsave = async () => {
      if (user?.uid) {
        const result = await unsaveEvent(user.uid, eventId);
        if (result.success) {
          setSavedEvents(prev => prev.filter(event => event.id !== eventId));
          setSelectedEvent(null);
        }
      }
    };

    const confirmMessage = i18n.t('saved.removeConfirm', { title: eventTitle });

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        await doUnsave();
      }
    } else {
      Alert.alert(
        i18n.t('saved.removeEvent'),
        confirmMessage,
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          { text: i18n.t('common.remove'), style: 'destructive', onPress: doUnsave },
        ]
      );
    }
  };

  const handleUnsaveFromModal = () => {
    if (selectedEvent) {
      handleUnsave(selectedEvent.id, selectedEvent.title);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (user?.uid) {
      const result = await deleteEvent(eventId, user.uid);
      if (result.success) {
        setPostedEvents(prev => prev.filter(e => e.id !== eventId));
      } else {
        Alert.alert(i18n.t('common.error'), result.error || i18n.t('errors.generic'));
      }
    }
  };

  const handleEditEvent = (event) => {
    setSelectedEvent(null);
    navigation.navigate('Post', { editEvent: event });
  };

  const renderSavedEvent = ({ item }) => (
    <TouchableOpacity
      style={styles.eventCard}
      activeOpacity={0.9}
      onPress={() => setSelectedEvent(item)}
    >
      <Image source={{ uri: getImageUri(item) }} style={styles.eventImage} />
      <TouchableOpacity
        style={styles.unsaveButton}
        onPress={() => handleUnsave(item.id, item.title)}
      >
        <Ionicons name="trash-outline" size={24} color="#FF6B6B" />
      </TouchableOpacity>
      <View style={styles.eventInfo}>
        <View style={styles.badgeRow}>
          <Text style={styles.eventCategory}>{item.category?.toUpperCase()}</Text>
          {!isOngoing(item) && (
            <View style={styles.countdownBadge}>
              <Ionicons name="time-outline" size={14} color="#4ECDC4" />
              <Text style={styles.countdownText}>{getDaysUntil(item.date)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.eventTitle}>{item.title}</Text>
        <Text style={styles.eventDate}>{eventDateText(item)}</Text>
        <Text style={styles.eventLocation}>{item.location}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderPostedEvent = ({ item }) => (
    <TouchableOpacity
      style={styles.postedCard}
      onPress={() => setSelectedEvent(item)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: getImageUri(item) }} style={styles.postedImage} />
      <View style={styles.postedInfo}>
        <Text style={styles.postedTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.postedDate}>{eventDateText(item)}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="eye-outline" size={16} color="#666" />
            <Text style={styles.statText}>{item.views || 0} {i18n.t('activity.views')}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="heart-outline" size={16} color="#FF6B6B" />
            <Text style={styles.statText}>{item.saves || 0} {i18n.t('activity.saves')}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="ticket-outline" size={16} color="#4ECDC4" />
            <Text style={styles.statText}>{item.ticketTaps || 0}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    section === 'saved' ? (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>💾</Text>
        <Text style={styles.emptyTitle}>{i18n.t('saved.noSaved')}</Text>
        <Text style={styles.emptyText}>{i18n.t('saved.noSavedText')}</Text>
      </View>
    ) : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>📝</Text>
        <Text style={styles.emptyTitle}>{i18n.t('activity.noPosted')}</Text>
        <Text style={styles.emptyText}>{i18n.t('activity.noPostedText')}</Text>
      </View>
    )
  );

  const sectionButton = (id, icon, label) => (
    <TouchableOpacity
      style={[styles.sectionTab, section === id && styles.sectionTabActive]}
      onPress={() => setSection(id)}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={section === id ? '#4ECDC4' : '#999'} />
      <Text style={[styles.sectionTabText, section === id && styles.sectionTabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{i18n.t('saved.title')}</Text>
      </View>

      <View style={styles.sectionTabs}>
        {sectionButton('saved', 'heart-outline', i18n.t('tabs.saved'))}
        {sectionButton('posted', 'megaphone-outline', i18n.t('activity.myEvents'))}
      </View>

      <FlatList
        key={section}
        data={section === 'saved' ? savedEvents : postedEvents}
        renderItem={section === 'saved' ? renderSavedEvent : renderPostedEvent}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4ECDC4"
          />
        }
      />

      <EventDetailsModal
        visible={selectedEvent !== null}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onSave={() => setSelectedEvent(null)}
        onPass={section === 'saved' ? handleUnsaveFromModal : () => setSelectedEvent(null)}
        isSavedView={section === 'saved'}
        isOwner={section === 'posted'}
        onDelete={handleDeleteEvent}
        onEdit={handleEditEvent}
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
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  sectionTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  sectionTabActive: {
    backgroundColor: '#E8FAF8',
  },
  sectionTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  sectionTabTextActive: {
    color: '#4ECDC4',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  eventImage: {
    width: '100%',
    height: 150,
  },
  unsaveButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 8,
  },
  eventInfo: {
    padding: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  eventCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4ECDC4',
    textTransform: 'uppercase',
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  eventDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 14,
    color: '#999',
  },
  postedCard: {
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
  postedImage: {
    width: 100,
    height: 100,
  },
  postedInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  postedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  postedDate: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
});
