import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function EventDetailsModal({ visible, event, onClose, onSave, onPass, isSavedView = false }) {
  if (!event) return null;

  const handleGetTickets = () => {
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

  const handleGetDirections = () => {
    const address = event.address || event.location;
    const url = Platform.select({
      ios: `maps:?q=${encodeURIComponent(address)}`,
      android: `geo:0,0?q=${encodeURIComponent(address)}`,
      web: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    });
    Linking.openURL(url);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Image */}
            <Image source={{ uri: event.image }} style={styles.image} />

            {/* Category & Price */}
            <View style={styles.tagRow}>
              <View style={styles.categoryTag}>
                <Text style={styles.categoryText}>{(event.categoryDisplay || event.category)?.toUpperCase()}</Text>
              </View>
              {(event.source === 'ticketmaster' || event.source === 'predicthq') && (
                <TouchableOpacity style={styles.priceTag} onPress={handleGetTickets}>
                  <Text style={styles.priceText}>{event.ticketUrl ? 'See tickets' : 'Find tickets'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Title */}
            <Text style={styles.title}>{event.title}</Text>

            {/* Date & Time */}
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color="#4ECDC4" />
              <Text style={styles.infoText}>{event.date} • {event.time}</Text>
            </View>

            {/* Location */}
            <TouchableOpacity style={styles.infoRow} onPress={handleGetDirections}>
              <Ionicons name="location-outline" size={20} color="#4ECDC4" />
              <View style={styles.locationInfo}>
                <Text style={styles.infoText}>{event.location}</Text>
                {event.address && (
                  <Text style={styles.addressText}>{event.address}</Text>
                )}
                <Text style={styles.directionsLink}>Get Directions →</Text>
              </View>
            </TouchableOpacity>

            {/* Distance */}
            {event.distance && (
              <View style={styles.infoRow}>
                <Ionicons name="navigate-outline" size={20} color="#4ECDC4" />
                <Text style={styles.infoText}>{event.distance} away</Text>
              </View>
            )}

            {/* Description */}
            {event.description && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.description}>{event.description}</Text>
              </View>
            )}

            {/* Ticket Button */}
            {(event.source === 'ticketmaster' || event.source === 'predicthq') && (
              <TouchableOpacity style={styles.ticketButton} onPress={handleGetTickets}>
                <Ionicons name="ticket-outline" size={20} color="#fff" />
                <Text style={styles.ticketButtonText}>{event.ticketUrl ? 'Get Tickets' : 'Find Tickets'}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.bottomPadding} />
          </ScrollView>

          {/* Action Buttons */}
            <View style={styles.actionBar}>
            {isSavedView ? (
                <>
                <TouchableOpacity 
                    style={[styles.actionButton, styles.passButton]} 
                    onPress={() => {
                    onPass();
                    }}
                >
                    <Ionicons name="trash-outline" size={28} color="#FF6B6B" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                    style={[styles.actionButton, styles.closeButton]} 
                    onPress={onClose}
                >
                    <Ionicons name="close" size={28} color="#666" />
                </TouchableOpacity>
                </>
            ) : (
                <>
                <TouchableOpacity 
                    style={[styles.actionButton, styles.passButton]} 
                    onPress={() => {
                    onPass();
                    onClose();
                    }}
                >
                    <Ionicons name="close" size={32} color="#FF6B6B" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                    style={[styles.actionButton, styles.saveButton]} 
                    onPress={() => {
                    onSave();
                    onClose();
                    }}
                >
                    <Ionicons name="heart" size={32} color="#4ECDC4" />
                </TouchableOpacity>
                </>
            )}
            </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: Platform.OS === 'web' ? 20 : 50,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: 280,
  },
  tagRow: {
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 0,
    gap: 10,
  },
  categoryTag: {
    backgroundColor: '#E8FAF8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryText: {
    color: '#4ECDC4',
    fontWeight: '600',
    fontSize: 12,
  },
  priceTag: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  priceText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    padding: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  infoText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  locationInfo: {
    marginLeft: 12,
    flex: 1,
  },
  addressText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  directionsLink: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '600',
    marginTop: 8,
  },
  section: {
    padding: 20,
    paddingTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  ticketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  ticketButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 100,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 40,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  passButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  saveButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  closeButton: {
  backgroundColor: '#fff',
  borderWidth: 2,
  borderColor: '#666',
},
});