import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getUserEvents, getSavedEvents } from '../services/eventService';

// Parse date string in multiple formats (YYYY-MM-DD, MM/DD/YYYY, etc.)
const parseEventDate = (dateString) => {
  if (!dateString) return null;
  
  // Try YYYY-MM-DD format first (API events)
  if (dateString.includes('-') && dateString.indexOf('-') === 4) {
    const [year, month, day] = dateString.split('-').map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day);
    }
  }
  
  // Try MM/DD/YYYY format (Firebase user-posted events)
  if (dateString.includes('/')) {
    const [month, day, year] = dateString.split('/').map(Number);
    if (month && day && year) {
      return new Date(year, month - 1, day);
    }
  }
  
  // Fallback: let JS try to parse it
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};

export default function ActivityScreen() {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [postedEvents, setPostedEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();

  const loadData = async () => {
    if (!user?.uid) return;

    // Load saved events (for upcoming reminders)
    const saved = await getSavedEvents(user.uid);
    console.log('Saved events from Firebase:', saved.length, saved);
    
    // Filter to only future events and sort by date
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    
    const upcoming = saved
      .filter(event => {
        if (!event.date) {
          console.log('Event has no date:', event.title);
          return false;
        }
        const eventDate = parseEventDate(event.date);
        console.log(`Event "${event.title}" date: ${event.date} -> parsed: ${eventDate}, now: ${now}, isFuture: ${eventDate && eventDate >= now}`);
        return eventDate && eventDate >= now;
      })
      .sort((a, b) => {
        const dateA = parseEventDate(a.date);
        const dateB = parseEventDate(b.date);
        return (dateA || 0) - (dateB || 0);
      });
    
    setUpcomingEvents(upcoming);

    // Load user's posted events
    const postedResult = await getUserEvents(user.uid);
    if (postedResult.success) {
      setPostedEvents(postedResult.events);
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

  const getDaysUntil = (dateString) => {
    const eventDate = parseEventDate(dateString);
    if (!eventDate) return 'Date TBD';
    
    const now = new Date();
    const diffTime = eventDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays} days`;
    if (diffDays < 30) return `In ${Math.floor(diffDays / 7)} weeks`;
    return `In ${Math.floor(diffDays / 30)} months`;
  };

  const renderUpcomingEvent = ({ item }) => (
    <View style={styles.eventCard}>
      <Image source={{ uri: item.image }} style={styles.eventImage} />
      <View style={styles.eventInfo}>
        <View style={styles.reminderBadge}>
          <Ionicons name="time-outline" size={14} color="#4ECDC4" />
          <Text style={styles.reminderText}>{getDaysUntil(item.date)}</Text>
        </View>
        <Text style={styles.eventTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.eventDate}>{item.date} • {item.time}</Text>
        <Text style={styles.eventLocation} numberOfLines={1}>{item.location}</Text>
      </View>
    </View>
  );

  const renderPostedEvent = ({ item }) => (
    <View style={styles.eventCard}>
      <Image source={{ uri: item.image }} style={styles.eventImage} />
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.eventDate}>{item.date} • {item.time}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="eye-outline" size={16} color="#666" />
            <Text style={styles.statText}>{item.views || 0} views</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="heart-outline" size={16} color="#FF6B6B" />
            <Text style={styles.statText}>{item.saves || 0} saves</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderEmptyUpcoming = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>📅</Text>
      <Text style={styles.emptyTitle}>No upcoming events</Text>
      <Text style={styles.emptyText}>
        Events you save will appear here as reminders.
      </Text>
    </View>
  );

  const renderEmptyPosted = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>📝</Text>
      <Text style={styles.emptyTitle}>No posted events</Text>
      <Text style={styles.emptyText}>
        Events you create will appear here with their stats.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity</Text>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Ionicons 
            name="calendar-outline" 
            size={18} 
            color={activeTab === 'upcoming' ? '#4ECDC4' : '#999'} 
          />
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.activeTabText]}>
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'posted' && styles.activeTab]}
          onPress={() => setActiveTab('posted')}
        >
          <Ionicons 
            name="megaphone-outline" 
            size={18} 
            color={activeTab === 'posted' ? '#4ECDC4' : '#999'} 
          />
          <Text style={[styles.tabText, activeTab === 'posted' && styles.activeTabText]}>
            My Events
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'upcoming' ? (
        <FlatList
          data={upcomingEvents}
          renderItem={renderUpcomingEvent}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyUpcoming}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4ECDC4"
            />
          }
        />
      ) : (
        <FlatList
          data={postedEvents}
          renderItem={renderPostedEvent}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyPosted}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4ECDC4"
            />
          }
        />
      )}
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#E8FAF8',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  activeTabText: {
    color: '#4ECDC4',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  eventCard: {
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
  eventImage: {
    width: 100,
    height: 100,
  },
  eventInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  reminderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  eventLocation: {
    fontSize: 13,
    color: '#999',
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
    fontSize: 20,
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