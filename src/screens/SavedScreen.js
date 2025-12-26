import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, Image, TouchableOpacity, RefreshControl, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getSavedEvents, unsaveEvent } from '../services/eventService';
import EventDetailsModal from '../components/EventDetailsModal';

export default function SavedScreen() {
  const [savedEvents, setSavedEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const { user } = useAuth();

  const loadSavedEvents = async () => {
    if (user?.uid) {
      const events = await getSavedEvents(user.uid);
      setSavedEvents(events);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSavedEvents();
    }, [user])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSavedEvents();
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

  if (Platform.OS === 'web') {
    if (window.confirm(`Remove "${eventTitle}" from saved events?`)) {
      await doUnsave();
    }
  } else {
    Alert.alert(
      'Remove Event',
      `Remove "${eventTitle}" from saved events?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doUnsave },
      ]
    );
  }
};

const handleUnsaveFromModal = () => {
  if (selectedEvent) {
    handleUnsave(selectedEvent.id, selectedEvent.title);
  }
};
  const renderEvent = ({ item }) => (
    <TouchableOpacity 
      style={styles.eventCard}
      activeOpacity={0.9}
      onPress={() => setSelectedEvent(item)}
    >
      <Image source={{ uri: item.image }} style={styles.eventImage} />
      <TouchableOpacity 
        style={styles.unsaveButton}
        onPress={() => handleUnsave(item.id, item.title)}
      >
        <Ionicons name="trash-outline" size={24} color="#FF6B6B" />
      </TouchableOpacity>
      <View style={styles.eventInfo}>
        <Text style={styles.eventCategory}>{item.category?.toUpperCase()}</Text>
        <Text style={styles.eventTitle}>{item.title}</Text>
        <Text style={styles.eventDate}>{item.date} • {item.time}</Text>
        <Text style={styles.eventLocation}>{item.location}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>💾</Text>
      <Text style={styles.emptyTitle}>No saved events yet</Text>
      <Text style={styles.emptyText}>
        Swipe right on events you're interested in and they'll appear here.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Saved Events</Text>
      </View>
      <FlatList
        data={savedEvents}
        renderItem={renderEvent}
        keyExtractor={(item) => item.id}
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
        onPass={handleUnsaveFromModal}
        isSavedView={true}
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
  eventCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4ECDC4',
    textTransform: 'uppercase',
    marginBottom: 4,
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