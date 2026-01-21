import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { saveEvent, getEvents, passEvent } from '../services/eventService';
import FilterModal from '../components/FilterModal';
import EventDetailsModal from '../components/EventDetailsModal';
import CardSwiper from '../components/CardSwiper';
import * as Location from 'expo-location';
import { submitReport } from '../services/reportService';

export default function HomeScreen() {
  const [events, setEvents] = useState([]);
  const [allSwiped, setAllSwiped] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [swiperKey, setSwiperKey] = useState(0); // For resetting swiper
  const [filters, setFilters] = useState({
    distance: 25,
    timeRange: 'month',
    categories: null,
    location: null,
    isCustomLocation: false,
  });
  const { user } = useAuth();

  const loadEvents = async (currentFilters = filters) => {
    setLoading(true);
    
    let location = null;
    
    // Check if we have a custom location set in filters
    if (currentFilters.location?.coords) {
      // Use the location from filters (either custom or previously fetched GPS)
      location = {
        latitude: currentFilters.location.coords.latitude,
        longitude: currentFilters.location.coords.longitude,
      };
      console.log('Using location from filters:', location, 
        currentFilters.isCustomLocation ? '(custom)' : '(GPS)');
    } else {
      // No location in filters yet, fetch GPS
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({});
          location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          console.log('Fetched GPS location:', location);
        }
      } catch (error) {
        console.log('Could not get location:', error);
      }
    }
    
    const result = await getEvents(user?.uid, location, currentFilters);
    if (result.success) {
      setEvents(result.events);
      setAllSwiped(result.events.length === 0);
      setSwiperKey(prev => prev + 1); // Reset swiper when events reload
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [user])
  );

  const onSwipedLeft = async (index, event) => {
    console.log('Passed on:', event?.title);
    
    if (user?.uid && event) {
      await passEvent(user.uid, event.id);
    }
  };

  const onSwipedRight = async (index, event) => {
    console.log('Saving:', event?.title);
    
    if (user?.uid && event) {
      const eventToSave = {
        ...event,
        image: event.image && !event.image.startsWith('blob:') 
          ? event.image 
          : `https://picsum.photos/400/300?random=${event.id}`,
      };
      
      const result = await saveEvent(user.uid, eventToSave);
      if (result.success) {
        console.log('Event saved successfully!');
      } else {
        console.error('Failed to save event:', result.error);
      }
    }
  };

  const onSwipedAll = () => {
    setAllSwiped(true);
  };

  const handleApplyFilters = (newFilters) => {
    setFilters(newFilters);
    console.log('Applied filters:', newFilters);
    setAllSwiped(false);
    loadEvents(newFilters);
  };

  const handleCardTap = (event) => {
    setSelectedEvent(event);
  };

  const handleModalSave = async () => {
    if (selectedEvent && user?.uid) {
      const eventToSave = {
        ...selectedEvent,
        image: selectedEvent.image && !selectedEvent.image.startsWith('blob:') 
          ? selectedEvent.image 
          : `https://picsum.photos/400/300?random=${selectedEvent.id}`,
      };
      
      await saveEvent(user.uid, eventToSave);
      setSelectedEvent(null);
    }
  };

  const handleReport = async (event, reason, details) => {
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to report events.');
      return;
    }
    await submitReport(event.id, user.uid, reason, details, event);
  };

  const handleModalPass = async () => {
    if (selectedEvent && user?.uid) {
      await passEvent(user.uid, selectedEvent.id);
      setSelectedEvent(null);
    }
  };

  const renderCard = (event, index) => {
    if (!event) return null;
    
    const handleTicketPress = () => {
      if (event.ticketUrl) {
        Linking.openURL(event.ticketUrl);
      } else if (event.source === 'ticketmaster') {
        let searchTitle = event.title
          .split(' - ')[0]
          .split(' at ')[0]
          .split(' @ ')[0]
          .trim();
        const searchQuery = encodeURIComponent(searchTitle);
        Linking.openURL(`https://www.ticketmaster.com/search?q=${searchQuery}`);
      } else if (event.source === 'seatgeek') {
        let searchTitle = event.title
          .split(' - ')[0]
          .split(' at ')[0]
          .split(' @ ')[0]
          .trim();
        const searchQuery = encodeURIComponent(searchTitle);
        Linking.openURL(`https://seatgeek.com/search?search=${searchQuery}`);
      } else {
        const searchQuery = encodeURIComponent(`${event.title} ${event.city || ''} tickets`);
        Linking.openURL(`https://www.google.com/search?q=${searchQuery}`);
      }
    };
    
    return (
      <View style={styles.card}>
        <Image source={{ uri: event.image }} style={styles.cardImage} />
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.category}>{(event.categoryDisplay || event.category)?.toUpperCase()}</Text>
            {(event.source === 'ticketmaster' || event.source === 'seatgeek') && (
              <TouchableOpacity onPress={handleTicketPress} style={styles.ticketButton}>
                <Text style={styles.ticketButtonText}>{event.ticketUrl ? 'See tickets' : 'Find tickets'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.date}>{event.date} • {event.time}</Text>
          <Text style={styles.location} numberOfLines={1}>{event.location}</Text>
          {event.price && event.price !== 'See tickets' && (
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{event.price}</Text>
            </View>
          )}
        </View>
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>Tap for details</Text>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🎉</Text>
      <Text style={styles.emptyTitle}>You're all caught up!</Text>
      <Text style={styles.emptyText}>
        No more events to show{filters.isCustomLocation ? ` in ${filters.location?.city}` : ' near you'}.{'\n'}Check back later or adjust your filters.
      </Text>
      <TouchableOpacity 
        style={styles.emptyButton} 
        onPress={() => setShowFilters(true)}
      >
        <Text style={styles.emptyButtonText}>Adjust Filters</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.emptyButton, styles.refreshButton]} 
        onPress={() => loadEvents(filters)}
      >
        <Text style={styles.emptyButtonText}>Refresh Events</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLoading = () => (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color="#4ECDC4" />
      <Text style={styles.loadingText}>
        Finding events{filters.isCustomLocation ? ` in ${filters.location?.city}` : ' near you'}...
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerButton} />
        <Text style={styles.headerTitle}>EventSwipe</Text>
        <TouchableOpacity 
          onPress={() => setShowFilters(true)} 
          style={styles.headerButton}
        >
          <Text style={styles.filterText}>Filters</Text>
        </TouchableOpacity>
      </View>

      {filters.location && (
        <View style={[styles.locationBar, filters.isCustomLocation && styles.customLocationBar]}>
          <Text style={styles.locationBarText}>
            {filters.isCustomLocation && '📍 '}{filters.location.city}{filters.location.region ? `, ${filters.location.region}` : ''} • {filters.distance} mi • {filters.timeRange}
          </Text>
        </View>
      )}
      
      <View style={styles.swiperContainer}>
        {loading ? (
          renderLoading()
        ) : allSwiped || events.length === 0 ? (
          renderEmptyState()
        ) : (
          <CardSwiper
            key={swiperKey}
            cards={events}
            renderCard={renderCard}
            onSwipedLeft={onSwipedLeft}
            onSwipedRight={onSwipedRight}
            onSwipedAll={onSwipedAll}
            onCardTap={handleCardTap}
          />
        )}
      </View>

      <FilterModal
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onApply={handleApplyFilters}
      />

      <EventDetailsModal
        visible={selectedEvent !== null}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onSave={handleModalSave}
        onPass={handleModalPass}
        onReport={handleReport}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Shrikhand_400Regular',
    color: '#4ECDC4',
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
  },
  filterText: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '600',
  },
  locationBar: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 8,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  customLocationBar: {
    backgroundColor: '#FF6B6B',
  },
  locationBarText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  swiperContainer: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '50%',
  },
  cardContent: {
    padding: 20,
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4ECDC4',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  date: {
    fontSize: 16,
    color: '#666',
    marginBottom: 6,
  },
  location: {
    fontSize: 14,
    color: '#999',
    marginBottom: 12,
  },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  priceText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  ticketButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  ticketButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  tapHint: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
  },
  tapHintText: {
    fontSize: 12,
    color: '#bbb',
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
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
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  refreshButton: {
    backgroundColor: '#666',
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});