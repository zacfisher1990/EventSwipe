import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';

const CATEGORIES = [
  { id: 'music', label: 'Music', emoji: '🎵' },
  { id: 'food', label: 'Food & Drink', emoji: '🍔' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'arts', label: 'Arts & Culture', emoji: '🎨' },
  { id: 'nightlife', label: 'Nightlife', emoji: '🌙' },
  { id: 'fitness', label: 'Fitness', emoji: '💪' },
  { id: 'comedy', label: 'Comedy', emoji: '😂' },
  { id: 'networking', label: 'Networking', emoji: '🤝' },
  { id: 'family', label: 'Family', emoji: '👨‍👩‍👧‍👦' },
  { id: 'outdoor', label: 'Outdoor', emoji: '🏕️' },
];

const TIME_RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'This Week' },
  { id: 'weekend', label: 'This Weekend' },
  { id: 'month', label: 'This Month' },
  { id: '3months', label: 'Next 3 Months' },
  { id: 'year', label: 'Next Year' },
];

export default function FilterModal({ visible, onClose, filters, onApply }) {
  const [distance, setDistance] = useState(filters?.distance || 25);
  const [timeRange, setTimeRange] = useState(filters?.timeRange || 'month');
  const [selectedCategories, setSelectedCategories] = useState(
    filters?.categories || CATEGORIES.map(c => c.id)
  );
  const [location, setLocation] = useState(filters?.location || null);
  const [locationError, setLocationError] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  useEffect(() => {
    if (visible && !location) {
      requestLocation();
    }
  }, [visible]);

  const requestLocation = async () => {
    setLoadingLocation(true);
    setLocationError(null);
    
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        setLocationError('Location permission denied');
        setLoadingLocation(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      const address = await Location.reverseGeocodeAsync({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });

      setLocation({
        coords: currentLocation.coords,
        city: address[0]?.city || 'Unknown',
        region: address[0]?.region || '',
      });
    } catch (error) {
      setLocationError('Could not get location');
    }
    
    setLoadingLocation(false);
  };

  const toggleCategory = (categoryId) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
    });
  };

  const selectAllCategories = () => {
    setSelectedCategories(CATEGORIES.map(c => c.id));
  };

  const clearAllCategories = () => {
    setSelectedCategories([]);
  };

  const handleApply = () => {
    onApply({
      distance,
      timeRange,
      categories: selectedCategories,
      location,
    });
    onClose();
  };

  const handleReset = () => {
    setDistance(25);
    setTimeRange('month');
    setSelectedCategories(CATEGORIES.map(c => c.id));
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
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.headerButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Filters</Text>
            <TouchableOpacity onPress={handleReset}>
              <Text style={styles.headerButton}>Reset</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Location Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📍 Location</Text>
              {loadingLocation ? (
                <Text style={styles.locationText}>Getting your location...</Text>
              ) : locationError ? (
                <TouchableOpacity onPress={requestLocation}>
                  <Text style={styles.locationError}>{locationError} - Tap to retry</Text>
                </TouchableOpacity>
              ) : location ? (
                <Text style={styles.locationText}>
                  {location.city}, {location.region}
                </Text>
              ) : (
                <TouchableOpacity onPress={requestLocation}>
                  <Text style={styles.locationButton}>Enable Location</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Distance Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>📏 Distance</Text>
                <Text style={styles.distanceValue}>{distance} miles</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={5}
                maximumValue={100}
                step={5}
                value={distance}
                onValueChange={setDistance}
                minimumTrackTintColor="#4ECDC4"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#4ECDC4"
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>5 mi</Text>
                <Text style={styles.sliderLabel}>100 mi</Text>
              </View>
            </View>

            {/* Time Range Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📅 When</Text>
              <View style={styles.timeGrid}>
                {TIME_RANGES.map(range => (
                  <TouchableOpacity
                    key={range.id}
                    style={[
                      styles.timeChip,
                      timeRange === range.id && styles.timeChipSelected,
                    ]}
                    onPress={() => setTimeRange(range.id)}
                  >
                    <Text
                      style={[
                        styles.timeChipText,
                        timeRange === range.id && styles.timeChipTextSelected,
                      ]}
                    >
                      {range.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Categories Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🎯 Categories</Text>
                <View style={styles.categoryActions}>
                  <TouchableOpacity onPress={selectAllCategories}>
                    <Text style={styles.categoryAction}>All</Text>
                  </TouchableOpacity>
                  <Text style={styles.categoryActionDivider}>|</Text>
                  <TouchableOpacity onPress={clearAllCategories}>
                    <Text style={styles.categoryAction}>None</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map(category => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryChip,
                      selectedCategories.includes(category.id) && styles.categoryChipSelected,
                    ]}
                    onPress={() => toggleCategory(category.id)}
                  >
                    <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                    <Text
                      style={[
                        styles.categoryChipText,
                        selectedCategories.includes(category.id) && styles.categoryChipTextSelected,
                      ]}
                    >
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <Text style={styles.applyButtonText}>
                Apply Filters
              </Text>
            </TouchableOpacity>
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
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerButton: {
    fontSize: 16,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  locationText: {
    fontSize: 16,
    color: '#666',
  },
  locationError: {
    fontSize: 16,
    color: '#FF6B6B',
  },
  locationButton: {
    fontSize: 16,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  distanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#999',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
    marginBottom: 8,
  },
  timeChipSelected: {
    backgroundColor: '#4ECDC4',
  },
  timeChipText: {
    fontSize: 14,
    color: '#666',
  },
  timeChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  categoryActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryAction: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  categoryActionDivider: {
    marginHorizontal: 8,
    color: '#ddd',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
    marginBottom: 10,
  },
  categoryChipSelected: {
    backgroundColor: '#4ECDC4',
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 14,
    color: '#666',
  },
  categoryChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  applyButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});