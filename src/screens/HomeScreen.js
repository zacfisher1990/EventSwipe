import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { useAuth } from '../context/AuthContext';
import FilterModal from '../components/FilterModal';

const DUMMY_EVENTS = [
  {
    id: '1',
    title: 'Jazz Night at Blue Room',
    category: 'Music',
    date: 'Sat, Jan 4 • 8:00 PM',
    location: 'Blue Room, Downtown',
    distance: '2.5 mi',
    image: 'https://picsum.photos/400/300?random=1',
  },
  {
    id: '2',
    title: 'Food Truck Festival',
    category: 'Food',
    date: 'Sun, Jan 5 • 12:00 PM',
    location: 'Central Park',
    distance: '4.1 mi',
    image: 'https://picsum.photos/400/300?random=2',
  },
  {
    id: '3',
    title: 'Stand-Up Comedy Show',
    category: 'Comedy',
    date: 'Fri, Jan 10 • 9:00 PM',
    location: 'Laugh Factory',
    distance: '8.3 mi',
    image: 'https://picsum.photos/400/300?random=3',
  },
  {
    id: '4',
    title: 'Yoga in the Park',
    category: 'Fitness',
    date: 'Sat, Jan 11 • 7:00 AM',
    location: 'Riverside Park',
    distance: '1.2 mi',
    image: 'https://picsum.photos/400/300?random=4',
  },
];

export default function HomeScreen() {
  const [cardIndex, setCardIndex] = useState(0);
  const [allSwiped, setAllSwiped] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    distance: 25,
    timeRange: 'month',
    categories: [],
    location: null,
  });
  const { user } = useAuth();

  const onSwipedLeft = (index) => {
    console.log('Passed on:', DUMMY_EVENTS[index].title);
  };

  const onSwipedRight = (index) => {
    console.log('Saved:', DUMMY_EVENTS[index].title);
  };

  const onSwipedAll = () => {
    setAllSwiped(true);
  };

  const handleApplyFilters = (newFilters) => {
    setFilters(newFilters);
    console.log('Applied filters:', newFilters);
    // Reset the swiper when filters change
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
            <Text style={styles.category}>{event.category}</Text>
            <Text style={styles.distance}>{event.distance}</Text>
          </View>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.date}>{event.date}</Text>
          <Text style={styles.location}>{event.location}</Text>
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
        {allSwiped ? (
          renderEmptyState()
        ) : (
          <Swiper
            cards={DUMMY_EVENTS}
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
  },
  signOutText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
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
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});