import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { useAuth } from '../context/AuthContext';

const DUMMY_EVENTS = [
  {
    id: '1',
    title: 'Jazz Night at Blue Room',
    category: 'Music',
    date: 'Sat, Jan 4 • 8:00 PM',
    location: 'Blue Room, Downtown',
    image: 'https://picsum.photos/400/300?random=1',
  },
  {
    id: '2',
    title: 'Food Truck Festival',
    category: 'Food',
    date: 'Sun, Jan 5 • 12:00 PM',
    location: 'Central Park',
    image: 'https://picsum.photos/400/300?random=2',
  },
  {
    id: '3',
    title: 'Stand-Up Comedy Show',
    category: 'Comedy',
    date: 'Fri, Jan 10 • 9:00 PM',
    location: 'Laugh Factory',
    image: 'https://picsum.photos/400/300?random=3',
  },
  {
    id: '4',
    title: 'Yoga in the Park',
    category: 'Fitness',
    date: 'Sat, Jan 11 • 7:00 AM',
    location: 'Riverside Park',
    image: 'https://picsum.photos/400/300?random=4',
  },
];

export default function HomeScreen() {
  const [cardIndex, setCardIndex] = useState(0);
  const { user, signOut } = useAuth();

  const onSwipedLeft = (index) => {
    console.log('Passed on:', DUMMY_EVENTS[index].title);
  };

  const onSwipedRight = (index) => {
    console.log('Saved:', DUMMY_EVENTS[index].title);
  };

  const renderCard = (event) => {
    if (!event) return null;
    
    return (
      <View style={styles.card}>
        <Image source={{ uri: event.image }} style={styles.cardImage} />
        <View style={styles.cardContent}>
          <Text style={styles.category}>{event.category}</Text>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.date}>{event.date}</Text>
          <Text style={styles.location}>{event.location}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>EventSwipe</Text>
        <TouchableOpacity onPress={signOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
      
      <Swiper
        cards={DUMMY_EVENTS}
        renderCard={renderCard}
        onSwipedLeft={onSwipedLeft}
        onSwipedRight={onSwipedRight}
        cardIndex={cardIndex}
        backgroundColor={'#f5f5f5'}
        stackSize={3}
        stackSeparation={15}
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
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  signOutButton: {
    padding: 8,
  },
  signOutText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    height: 500,
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
    height: 250,
  },
  cardContent: {
    padding: 20,
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4ECDC4',
    textTransform: 'uppercase',
    marginBottom: 8,
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
});