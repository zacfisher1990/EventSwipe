import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { saveEvent, getEvents, passEvent } from '../services/eventService';
import FilterModal from '../components/FilterModal';
import EventDetailsModal from '../components/EventDetailsModal';
import * as Location from 'expo-location';
import { submitReport } from '../services/reportService';

export default function HomeScreen() {
  const [events, setEvents] = useState([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [allSwiped, setAllSwiped] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filters, setFilters] = useState({
    distance: 25,
    timeRange: 'month',
    categories: [],
    location: null,
  });
  const { user } = useAuth();
  const swiperRef = useRef(null);

  const loadEvents = async (currentFilters = filters) => {
  setLoading(true);
  
  // Try to get user's location
  let location = null;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const position = await Location.getCurrentPositionAsync({});
      location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      console.log('User location:', location);
    }
  } catch (error) {
    console.log('Could not get location:', error);
  }
  
  // Pass filters to getEvents
  const result = await getEvents(user?.uid, location, currentFilters);
  if (result.success) {
    setEvents(result.events);
    setAllSwiped(result.events.length === 0);
    setCardIndex(0);
  }
  setLoading(false);
};

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [user])
  );

  const onSwipedLeft = async (index) => {
    const event = events[index];
    console.log('Passed on:', event?.title);
    
    if (user?.uid && event) {
      await passEvent(user.uid, event.id);
    }
  };

  const onSwipedRight = async (index) => {
    const event = events[index];
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
    setCardIndex(0);
    // Reload events with new filters
    loadEvents(newFilters);
  };

  const handleCardTap = (index) => {
    setSelectedEvent(events[index]);
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
      swiperRef.current?.swipeRight();
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
      swiperRef.current?.swipeLeft();
    }
  };

  const renderCard = (event, index) => {
    if (!event) return null;
    
    const handleTicketPress = (e) => {
      e.stopPropagation(); // Prevent card tap
      if (event.ticketUrl) {
        // Has direct link - use it
        Linking.openURL(event.ticketUrl);
      } else if (event.source === 'ticketmaster') {
        // Ticketmaster event without URL - search Ticketmaster
        const searchQuery = encodeURIComponent(`${event.title} ${event.city || ''}`);
        Linking.openURL(`https://www.ticketmaster.com/search?q=${searchQuery}`);
      } else {
        // PredictHQ or other - search Google for the event
        const searchQuery = encodeURIComponent(`${event.title} ${event.city || ''} tickets`);
        Linking.openURL(`https://www.google.com/search?q=${searchQuery}`);
      }
    };
    
    return (
      <TouchableOpacity 
        activeOpacity={0.95}
        onPress={() => handleCardTap(index)}
        style={styles.card}
      >
        <Image source={{ uri: event.image }} style={styles.cardImage} />
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.category}>{(event.categoryDisplay || event.category)?.toUpperCase()}</Text>
            {(event.source === 'ticketmaster' || event.source === 'predicthq') && (
              <TouchableOpacity onPress={handleTicketPress} style={styles.ticketButton}>
                <Text style={styles.ticketButtonText}>{event.ticketUrl ? 'See tickets' : 'Find tickets'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.date}>{event.date} • {event.time}</Text>
          <Text style={styles.location}>{event.location}</Text>
          {event.price && event.price !== 'See tickets' && (
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{event.price}</Text>
            </View>
          )}
        </View>
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>Tap for details</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🎉</Text>
      <Text style={styles.emptyTitle}>You're all caught up!</Text>
      <Text style={styles.emptyText}>
        No more events to show near you.{'\n'}Check back later or adjust your filters.
      </Text>
      <TouchableOpacity 
        style={styles.emptyButton} 
        onPress={() => setShowFilters(true)}
      >
        <Text style={styles.emptyButtonText}>Adjust Filters</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.emptyButton, styles.refreshButton]} 
        onPress={loadEvents}
      >
        <Text style={styles.emptyButtonText}>Refresh Events</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLoading = () => (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color="#4ECDC4" />
      <Text style={styles.loadingText}>Finding events near you...</Text>
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
        <View style={styles.locationBar}>
          <Text style={styles.locationBarText}>
            {filters.location.city} • {filters.distance} mi • {filters.timeRange}
          </Text>
        </View>
      )}
      
      <View style={styles.swiperContainer}>
        {loading ? (
          renderLoading()
        ) : allSwiped || events.length === 0 ? (
          renderEmptyState()
        ) : (
          <Swiper
            ref={swiperRef}
            cards={events}
            renderCard={renderCard}
            onSwipedLeft={onSwipedLeft}
            onSwipedRight={onSwipedRight}
            onSwipedAll={onSwipedAll}
            cardIndex={cardIndex}
            backgroundColor={'#f5f5f5'}
            stackSize={3}
            stackSeparation={15}
            useViewOverflow={false}
            containerStyle={styles.swiperContent}
            overlayLabels={{
              left: {
                title: 'NOPE',
                style: {
                  label: {
                    backgroundColor: '#FF6B6B',
                    color: 'white',
                    fontSize: 24,
                    borderRadius: 8,
                    padding: 10,
                  },
                  wrapper: {
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    justifyContent: 'flex-start',
                    marginTop: 30,
                    marginLeft: -30,
                  },
                },
              },
              right: {
                title: 'SAVE',
                style: {
                  label: {
                    backgroundColor: '#4ECDC4',
                    color: 'white',
                    fontSize: 24,
                    borderRadius: 8,
                    padding: 10,
                  },
                  wrapper: {
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    marginTop: 30,
                    marginLeft: 30,
                  },
                },
              },
            }}
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
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
  locationBarText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  swiperContainer: {
    flex: 1,
  },
  swiperContent: {
    backgroundColor: '#f5f5f5',
  },
  card: {
    height: 450,
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
    height: 220,
  },
  cardContent: {
    padding: 20,
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
  distance: {
    fontSize: 14,
    color: '#999',
  },
  title: {
    fontSize: 24,
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