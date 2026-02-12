import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Animated,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import i18n from '../i18n';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 150;

const GOOGLE_GEOCODING_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;

// Categories with i18n keys
const CATEGORIES = [
  { id: 'music', labelKey: 'categories.music', emoji: '🎵' },
  { id: 'food', labelKey: 'categories.food', emoji: '🍔' },
  { id: 'sports', labelKey: 'categories.sports', emoji: '⚽' },
  { id: 'arts', labelKey: 'categories.arts', emoji: '🎨' },
  { id: 'nightlife', labelKey: 'categories.nightlife', emoji: '🌙' },
  { id: 'fitness', labelKey: 'categories.fitness', emoji: '💪' },
  { id: 'comedy', labelKey: 'categories.comedy', emoji: '😂' },
  { id: 'networking', labelKey: 'categories.networking', emoji: '🤝' },
  { id: 'family', labelKey: 'categories.family', emoji: '👨‍👩‍👧‍👦' },
  { id: 'outdoor', labelKey: 'categories.outdoor', emoji: '🏕️' },
];

// Time ranges with i18n keys
const TIME_RANGES = [
  { id: 'today', labelKey: 'filters.today' },
  { id: 'tomorrow', labelKey: 'filters.tomorrow' },
  { id: 'week', labelKey: 'filters.thisWeek' },
  { id: 'weekend', labelKey: 'filters.thisWeekend' },
  { id: 'month', labelKey: 'filters.thisMonth' },
  { id: '3months', labelKey: 'filters.threeMonths' },
  { id: 'year', labelKey: 'filters.thisYear' },
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
  
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [isCustomLocation, setIsCustomLocation] = useState(filters?.isCustomLocation || false);

  // Animation values for swipe-to-dismiss (matching EventDetailsModal approach)
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosing = useRef(false);

  // Reset local state to parent filters and animate in when modal opens
  useEffect(() => {
    if (visible) {
      // Sync local state with parent filters on every open
      setDistance(filters?.distance || 25);
      setTimeRange(filters?.timeRange || 'month');
      setSelectedCategories(filters?.categories || CATEGORIES.map(c => c.id));
      setLocation(filters?.location || null);
      setIsCustomLocation(filters?.isCustomLocation || false);
      setShowLocationSearch(false);
      setSearchQuery('');
      setSearchResults([]);

      isClosing.current = false;
      // Animate in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    if (isClosing.current) return;
    isClosing.current = true;
    
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      translateY.setValue(SCREEN_HEIGHT);
      onClose();
    });
  };

  // Handle drag on the handle area (matching EventDetailsModal)
  const handleDragStart = useRef({ y: 0 });
  
  const onHandleTouchStart = (e) => {
    handleDragStart.current.y = e.nativeEvent.pageY;
  };

  const onHandleTouchMove = (e) => {
    const currentY = e.nativeEvent.pageY;
    const dy = currentY - handleDragStart.current.y;
    
    if (dy > 0) {
      translateY.setValue(dy);
      // Fade backdrop as we drag
      const opacity = 1 - (dy / SCREEN_HEIGHT);
      backdropOpacity.setValue(Math.max(0, opacity));
    }
  };

  const onHandleTouchEnd = (e) => {
    const currentY = e.nativeEvent.pageY;
    const dy = currentY - handleDragStart.current.y;
    
    if (dy > DISMISS_THRESHOLD) {
      handleClose();
    } else {
      // Snap back
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  // Handle scroll-based dismiss
  const onScrollEndDrag = (e) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const velocityY = e.nativeEvent.velocity?.y || 0;
    
    // If at top and pulling down with velocity, dismiss
    if (offsetY <= 0 && velocityY < -1.5) {
      handleClose();
    }
  };

  useEffect(() => {
    if (visible && !location) {
      requestLocation();
    }
  }, [visible]);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchLocation(searchQuery);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const searchLocation = async (query) => {
    if (!query.trim()) return;
    
    setSearching(true);
    try {
      // Try Google Geocoding first
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_GEOCODING_API_KEY}`;
      const googleResponse = await fetch(googleUrl);
      const googleData = await googleResponse.json();

      if (googleData.status === 'OK' && googleData.results && googleData.results.length > 0) {
        const formattedResults = googleData.results.slice(0, 5).map((item, index) => {
          const components = item.address_components || [];
          const getComponent = (type) => components.find(c => c.types.includes(type))?.long_name || '';
          
          return {
            id: item.place_id || index,
            name: getComponent('locality') || 
                  getComponent('sublocality') || 
                  getComponent('administrative_area_level_2') ||
                  item.formatted_address.split(',')[0],
            region: getComponent('administrative_area_level_1') || '',
            country: getComponent('country') || '',
            displayName: item.formatted_address,
            coords: {
              latitude: item.geometry.location.lat,
              longitude: item.geometry.location.lng,
            }
          };
        });
        setSearchResults(formattedResults);
        setSearching(false);
        return;
      }
    } catch (error) {
      console.log('Google location search error, falling back to Nominatim:', error);
    }

    // Fallback to Nominatim
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
      const url = Platform.OS === 'web' 
        ? `https://corsproxy.io/?${encodeURIComponent(nominatimUrl)}`
        : nominatimUrl;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EventSwipe App'
        }
      });
      const data = await response.json();
      
      const formattedResults = data
        .filter(item => {
          const type = item.type;
          const placeClass = item.class;
          return placeClass === 'place' || 
                 placeClass === 'boundary' || 
                 type === 'city' || 
                 type === 'town' || 
                 type === 'village' ||
                 type === 'administrative';
        })
        .map(item => ({
          id: item.place_id,
          name: item.address?.city || 
                item.address?.town || 
                item.address?.village || 
                item.address?.municipality ||
                item.name || 
                item.display_name.split(',')[0],
          region: item.address?.state || item.address?.country || '',
          country: item.address?.country || '',
          displayName: item.display_name,
          coords: {
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
          }
        }));
      
      if (formattedResults.length === 0 && data.length > 0) {
        const allResults = data.map(item => ({
          id: item.place_id,
          name: item.display_name.split(',')[0],
          region: item.address?.state || item.address?.country || '',
          country: item.address?.country || '',
          displayName: item.display_name,
          coords: {
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
          }
        }));
        setSearchResults(allResults);
      } else {
        setSearchResults(formattedResults);
      }
    } catch (error) {
      console.log('Location search error:', error);
      setSearchResults([]);
    }
    setSearching(false);
  };

  const selectSearchResult = (result) => {
    setLocation({
      coords: result.coords,
      city: result.name,
      region: result.region,
      country: result.country,
    });
    setIsCustomLocation(true);
    setShowLocationSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    Keyboard.dismiss();
  };

  const requestLocation = async () => {
    setLoadingLocation(true);
    setLocationError(null);
    
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        setLocationError(i18n.t('errors.locationDenied') || 'Location permission denied');
        setLoadingLocation(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentLocation.coords;
      
      let cityName = 'Your Area';
      let regionName = '';

      // Try Google reverse geocoding first
      try {
        const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_GEOCODING_API_KEY}`;
        const googleResponse = await fetch(googleUrl);
        const googleData = await googleResponse.json();

        if (googleData.status === 'OK' && googleData.results && googleData.results.length > 0) {
          const components = googleData.results[0].address_components || [];
          const getComponent = (type) => components.find(c => c.types.includes(type))?.long_name || '';
          
          cityName = getComponent('locality') || 
                     getComponent('sublocality') || 
                     getComponent('administrative_area_level_2') || 
                     'Your Area';
          regionName = getComponent('administrative_area_level_1') || '';
        } else {
          throw new Error('Google reverse geocode failed');
        }
      } catch (googleError) {
        console.log('Google reverse geocode failed, trying Nominatim:', googleError);
        // Fallback to Nominatim
        try {
          const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;
          const url = Platform.OS === 'web' 
            ? `https://corsproxy.io/?${encodeURIComponent(nominatimUrl)}`
            : nominatimUrl;
          
          const response = await fetch(url, {
            headers: { 'User-Agent': 'EventSwipe App' }
          });
          const data = await response.json();
          
          cityName = data.address?.city || 
                     data.address?.town || 
                     data.address?.village ||
                     data.address?.suburb ||
                     data.address?.county ||
                     'Your Area';
          regionName = data.address?.state || '';
        } catch (nominatimError) {
          console.log('Nominatim reverse geocode also failed:', nominatimError);
        }
      }

      setLocation({
        coords: currentLocation.coords,
        city: cityName,
        region: regionName,
      });
      setIsCustomLocation(false);
    } catch (error) {
      setLocationError(i18n.t('errors.locationFailed') || 'Could not get location');
    }
    
    setLoadingLocation(false);
  };

  const useMyLocation = () => {
    setShowLocationSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    requestLocation();
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
    const appliedFilters = {
      distance,
      timeRange,
      categories: selectedCategories,
      location,
      isCustomLocation,
    };
    
    // Animate out, then apply filters
    if (isClosing.current) return;
    isClosing.current = true;
    
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      translateY.setValue(SCREEN_HEIGHT);
      onApply(appliedFilters);
      onClose();
    });
  };

  const handleReset = () => {
    setDistance(25);
    setTimeRange('month');
    setSelectedCategories(CATEGORIES.map(c => c.id));
    setIsCustomLocation(false);
    requestLocation();
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
    >
      <Animated.View style={[styles.overlay, { opacity: backdropOpacity }]}>
        <TouchableOpacity 
          style={styles.overlayTouchable} 
          activeOpacity={1} 
          onPress={handleClose}
        />
        <Animated.View 
          style={[
            styles.container,
            { transform: [{ translateY }] }
          ]}
        >
          {/* Swipeable header area - drag handle + header */}
          <View
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}
          >
            {/* Drag Handle */}
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose}>
                <Text style={styles.headerButton}>{i18n.t('common.cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{i18n.t('filters.title')}</Text>
              <TouchableOpacity onPress={handleReset}>
                <Text style={styles.headerButton}>{i18n.t('filters.reset')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView 
            style={styles.content} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={true}
            scrollEventThrottle={16}
            onScrollEndDrag={onScrollEndDrag}
          >
            {/* Location Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📍 {i18n.t('filters.location')}</Text>
              
              {!showLocationSearch ? (
                <View style={styles.locationDisplay}>
                  {loadingLocation ? (
                    <View style={styles.locationLoading}>
                      <ActivityIndicator size="small" color="#4ECDC4" />
                      <Text style={styles.locationLoadingText}>{i18n.t('common.loading')}</Text>
                    </View>
                  ) : locationError ? (
                    <TouchableOpacity onPress={requestLocation}>
                      <Text style={styles.locationError}>{locationError} - {i18n.t('common.retry')}</Text>
                    </TouchableOpacity>
                  ) : location ? (
                    <View style={styles.locationInfo}>
                      <View style={styles.locationTextContainer}>
                        <Text style={styles.locationText}>
                          {location.city}{location.region ? `, ${location.region}` : ''}
                        </Text>
                        {isCustomLocation && (
                          <Text style={styles.customLocationBadge}>Custom</Text>
                        )}
                      </View>
                      <TouchableOpacity 
                        style={styles.changeLocationButton}
                        onPress={() => setShowLocationSearch(true)}
                      >
                        <Text style={styles.changeLocationText}>{i18n.t('filters.change')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={requestLocation}>
                      <Text style={styles.locationText}>{i18n.t('filters.tapToSetLocation')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.locationSearch}>
                  <View style={styles.searchInputContainer}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder={i18n.t('filters.searchCity')}
                      placeholderTextColor="#999"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoFocus={true}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity 
                        style={styles.clearButton}
                        onPress={() => setSearchQuery('')}
                      >
                        <Text style={styles.clearButtonText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  <TouchableOpacity 
                    style={styles.useMyLocationButton}
                    onPress={useMyLocation}
                  >
                    <Text style={styles.useMyLocationIcon}>📍</Text>
                    <Text style={styles.useMyLocationText}>{i18n.t('filters.useMyLocation')}</Text>
                  </TouchableOpacity>

                  {searching ? (
                    <View style={styles.searchingContainer}>
                      <ActivityIndicator size="small" color="#4ECDC4" />
                      <Text style={styles.searchingText}>{i18n.t('common.searching')}</Text>
                    </View>
                  ) : searchResults.length > 0 ? (
                    <View style={styles.searchResults}>
                      {searchResults.map((result) => (
                        <TouchableOpacity
                          key={result.id}
                          style={styles.searchResultItem}
                          onPress={() => selectSearchResult(result)}
                        >
                          <Text style={styles.searchResultName}>{result.name}</Text>
                          <Text style={styles.searchResultRegion}>{result.region}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : searchQuery.length >= 2 ? (
                    <Text style={styles.noResultsText}>{i18n.t('filters.noResultsFound')}</Text>
                  ) : null}

                  <TouchableOpacity 
                    style={styles.cancelSearchButton}
                    onPress={() => {
                      setShowLocationSearch(false);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <Text style={styles.cancelSearchText}>{i18n.t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Distance Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>📏 {i18n.t('filters.distance')}</Text>
                <Text style={styles.distanceValue}>{distance} {i18n.t('filters.miles')}</Text>
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
                <Text style={styles.sliderLabel}>5 {i18n.t('filters.mi')}</Text>
                <Text style={styles.sliderLabel}>100 {i18n.t('filters.mi')}</Text>
              </View>
            </View>

            {/* Time Range Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📅 {i18n.t('filters.when')}</Text>
              <View style={styles.timeGrid}>
                {TIME_RANGES.map((range) => (
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
                      {i18n.t(range.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Categories Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🏷️ {i18n.t('filters.categories')}</Text>
                <View style={styles.categoryActions}>
                  <TouchableOpacity onPress={selectAllCategories}>
                    <Text style={styles.categoryAction}>{i18n.t('filters.all')}</Text>
                  </TouchableOpacity>
                  <Text style={styles.categoryActionDivider}>|</Text>
                  <TouchableOpacity onPress={clearAllCategories}>
                    <Text style={styles.categoryAction}>{i18n.t('filters.none')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((category) => (
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
                      {i18n.t(category.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Bottom spacing for scrolling */}
            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer with Apply Button */}
          <View style={styles.footer}>
            <TouchableOpacity 
              style={styles.applyButton} 
              onPress={handleApply}
            >
              <Text style={styles.applyButtonText}>{i18n.t('filters.applyFilters')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  dragHandleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    // Large touch area for easier swiping
    paddingTop: 16,
    paddingBottom: 16,
    minHeight: 44,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#DDDDDD',
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
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
  locationDisplay: {
    marginTop: -4,
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationLoadingText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#666',
  },
  locationText: {
    fontSize: 16,
    color: '#666',
  },
  locationError: {
    fontSize: 16,
    color: '#FF6B6B',
  },
  locationInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customLocationBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#4ECDC4',
    borderRadius: 10,
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    overflow: 'hidden',
  },
  changeLocationButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  changeLocationText: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  locationSearch: {
    marginTop: -4,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    fontSize: 16,
    color: '#999',
  },
  useMyLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  useMyLocationIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  useMyLocationText: {
    fontSize: 16,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  searchingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  searchingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  searchResults: {
    marginTop: 4,
  },
  searchResultItem: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchResultName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  searchResultRegion: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  noResultsText: {
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 14,
    color: '#999',
  },
  cancelSearchButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  cancelSearchText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
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