import React from 'react';
import { StyleSheet, Text, View, FlatList, Image, TouchableOpacity } from 'react-native';

const SAVED_EVENTS = [
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
];

export default function SavedScreen() {
  const renderEvent = ({ item }) => (
    <TouchableOpacity style={styles.eventCard}>
      <Image source={{ uri: item.image }} style={styles.eventImage} />
      <View style={styles.eventInfo}>
        <Text style={styles.eventCategory}>{item.category}</Text>
        <Text style={styles.eventTitle}>{item.title}</Text>
        <Text style={styles.eventDate}>{item.date}</Text>
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
        data={SAVED_EVENTS}
        renderItem={renderEvent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
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
  },
  eventImage: {
    width: '100%',
    height: 150,
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