import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { saveEvent, getEvents, passEvent } from '../services/eventService';
import FilterModal from '../components/FilterModal';

export default function HomeScreen() {
  const [events, setEvents] = useState([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [allSwiped, setAllSwiped] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    distance: 25,
    timeRange: 'month',
    categories: [],
    location: null,
  });
  const { user } = useAuth();
  const swiperRef = useRef(null);

  const loadEvents = async () => {
    setLoading(true);
    const result = await getEvents(user?.uid);
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
    
    // Track that user passed on this event
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
  };

  const renderCard = (event) => {
    if (!event) return null;
    
    return (
      <View style={styles.card}>
        <Image source={{ uri: event.image }} style={styles.cardImage} />
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.category}>{event.category?.toUpperCase()}</Text>
            <Text style={styles.distance}>{event.distance || ''}</Text>
          </View>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.date}>{event.date} • {event.time}</Text>
          <Text style={styles.location}>{event.location}</Text>
          {event.price && (
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{event.price}</Text>
            </View>
          )}
        </View>
      </View>
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