import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const DEFAULT_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/**
 * LocationPickerMap
 *
 * Drop-in replacement for a plain address TextInput on your event creation screen.
 *
 * Props:
 *   onLocationConfirmed({ address, coordinates: { lat, lng } }) — called when user taps Confirm
 *   initialAddress  — optional pre-filled address string
 *   initialCoords   — optional { lat, lng } to centre the map initially
 *   placeholder     — TextInput placeholder text
 *
 * Usage:
 *   <LocationPickerMap
 *     onLocationConfirmed={({ address, coordinates }) => {
 *       setEventAddress(address);
 *       setEventCoords(coordinates);
 *     }}
 *   />
 */
export default function LocationPickerMap({
  onLocationConfirmed,
  initialAddress = '',
  initialCoords = null,
  placeholder = 'Enter event address…',
}) {
  const [addressText, setAddressText]   = useState(initialAddress);
  const [region, setRegion]             = useState(
    initialCoords
      ? { ...initialCoords, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      : DEFAULT_REGION
  );
  const [markerCoord, setMarkerCoord]   = useState(
    initialCoords ? { latitude: initialCoords.lat, longitude: initialCoords.lng } : null
  );
  const [geocodedAddress, setGeocodedAddress] = useState(initialAddress);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [mapVisible, setMapVisible]     = useState(!!initialCoords);
  const [confirmed, setConfirmed]       = useState(false);

  const mapSlide   = useRef(new Animated.Value(initialCoords ? 1 : 0)).current;
  const mapRef     = useRef(null);
  const debounceTimer = useRef(null);

  // ── Geocode ──────────────────────────────────────────────────────────────────
  const geocodeAddress = useCallback(async (address) => {
    if (!address || address.trim().length < 5) return;

    setLoading(true);
    setError('');
    setConfirmed(false);

    try {
      const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;
      const res  = await fetch(url);
      const data = await res.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const { lat, lng } = data.results[0].geometry.location;
        const formattedAddress = data.results[0].formatted_address;

        const newRegion = {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };

        setRegion(newRegion);
        setMarkerCoord({ latitude: lat, longitude: lng });
        setGeocodedAddress(formattedAddress);

        if (!mapVisible) {
          setMapVisible(true);
          Animated.spring(mapSlide, {
            toValue: 1,
            useNativeDriver: false,
            friction: 7,
          }).start();
        } else {
          mapRef.current?.animateToRegion(newRegion, 600);
        }
      } else {
        setError('Address not found. Try adding a city or postcode.');
      }
    } catch {
      setError('Could not look up address. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [mapVisible, mapSlide]);

  // ── Debounce input ────────────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      geocodeAddress(addressText);
    }, 900);
    return () => clearTimeout(debounceTimer.current);
  }, [addressText]);

  // ── Reverse-geocode after pin drag ────────────────────────────────────────────
  const onMarkerDragEnd = useCallback(async (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setMarkerCoord({ latitude, longitude });
    setLoading(true);
    setConfirmed(false);

    try {
      const url = `${GEOCODE_URL}?latlng=${latitude},${longitude}&key=${GOOGLE_API_KEY}`;
      const res  = await fetch(url);
      const data = await res.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const addr = data.results[0].formatted_address;
        setGeocodedAddress(addr);
        setAddressText(addr);
      }
    } catch {
      // Keep current address text if reverse geocode fails
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Confirm ───────────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!markerCoord) return;
    Keyboard.dismiss();
    setConfirmed(true);
    onLocationConfirmed?.({
      address: geocodedAddress || addressText,
      coordinates: {
        lat: markerCoord.latitude,
        lng: markerCoord.longitude,
      },
    });
  };

  const mapHeight = mapSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 240],
  });

  const mapOpacity = mapSlide.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={styles.container}>
      {/* ── Address input ───────────────────────────────────────────────────── */}
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <Ionicons
          name="location-outline"
          size={20}
          color={confirmed ? '#4ECDC4' : '#888'}
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          value={addressText}
          onChangeText={(t) => {
            setAddressText(t);
            setConfirmed(false);
          }}
          placeholder={placeholder}
          placeholderTextColor="#aaa"
          returnKeyType="search"
          onSubmitEditing={() => geocodeAddress(addressText)}
          autoCorrect={false}
        />
        {loading && (
          <ActivityIndicator size="small" color="#4ECDC4" style={styles.spinner} />
        )}
        {!loading && addressText.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setAddressText('');
              setMarkerCoord(null);
              setGeocodedAddress('');
              setConfirmed(false);
              setError('');
              Animated.timing(mapSlide, {
                toValue: 0,
                duration: 250,
                useNativeDriver: false,
              }).start(() => setMapVisible(false));
            }}
          >
            <Ionicons name="close-circle" size={18} color="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Error message ────────────────────────────────────────────────────── */}
      {!!error && (
        <Text style={styles.errorText}>
          <Ionicons name="warning-outline" size={12} /> {error}
        </Text>
      )}

      {/* ── Geocoded address label ───────────────────────────────────────────── */}
      {geocodedAddress && !error && mapVisible && (
        <View style={styles.geocodedRow}>
          <Ionicons name="checkmark-circle" size={14} color="#4ECDC4" />
          <Text style={styles.geocodedText} numberOfLines={2}>
            {geocodedAddress}
          </Text>
        </View>
      )}

      {/* ── Animated map ─────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.mapWrapper, { height: mapHeight, opacity: mapOpacity }]}>
        {mapVisible && (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_GOOGLE}
            region={region}
            onRegionChangeComplete={setRegion}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
          >
            {markerCoord && (
              <Marker
                coordinate={markerCoord}
                draggable
                onDragEnd={onMarkerDragEnd}
                pinColor="#4ECDC4"
                title="Event location"
                description="Drag to adjust"
              />
            )}
          </MapView>
        )}

        {/* Drag hint overlay */}
        {mapVisible && markerCoord && !confirmed && (
          <View style={styles.dragHint} pointerEvents="none">
            <Text style={styles.dragHintText}>Drag pin to fine-tune</Text>
          </View>
        )}
      </Animated.View>

      {/* ── Confirm button ───────────────────────────────────────────────────── */}
      {mapVisible && markerCoord && (
        <TouchableOpacity
          style={[styles.confirmBtn, confirmed && styles.confirmBtnDone]}
          onPress={handleConfirm}
          activeOpacity={0.85}
        >
          <Ionicons
            name={confirmed ? 'checkmark-done-circle' : 'checkmark-circle-outline'}
            size={18}
            color="#fff"
          />
          <Text style={styles.confirmBtnText}>
            {confirmed ? 'Location confirmed ✓' : 'Confirm this location'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    backgroundColor: '#fafafa',
  },
  inputRowError: {
    borderColor: '#FF6B6B',
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    paddingRight: 4,
  },
  spinner: {
    marginLeft: 6,
  },

  // Error
  errorText: {
    marginTop: 5,
    fontSize: 12,
    color: '#FF6B6B',
    paddingHorizontal: 4,
  },

  // Geocoded label
  geocodedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 4,
    gap: 5,
  },
  geocodedText: {
    flex: 1,
    fontSize: 12,
    color: '#555',
    lineHeight: 16,
  },

  // Map
  mapWrapper: {
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#eaeaea',
  },

  // Drag hint
  dragHint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dragHintText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },

  // Confirm button
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#4ECDC4',
  },
  confirmBtnDone: {
    backgroundColor: '#38b2aa',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});