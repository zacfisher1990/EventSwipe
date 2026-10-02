import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Web version of LocationPickerMap (react-native-maps doesn't run in a
// browser). Same props and callback: the address is geocoded, previewed on an
// embedded OpenStreetMap, and confirmed with a button.

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;

// Google when a key is configured, otherwise OpenStreetMap's free geocoder
const geocode = async (query) => {
  if (GOOGLE_API_KEY) {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`
    );
    const data = await response.json();
    const result = data.status === 'OK' ? data.results?.[0] : null;
    if (result) {
      return { address: result.formatted_address, lat: result.geometry.location.lat, lng: result.geometry.location.lng };
    }
  }
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  );
  const [result] = await response.json();
  return result ? { address: result.display_name, lat: parseFloat(result.lat), lng: parseFloat(result.lon) } : null;
};

const mapEmbedUrl = ({ lat, lng }) => {
  const d = 0.008;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`;
};

export default function LocationPickerMap({
  onLocationConfirmed,
  initialAddress = '',
  initialCoords = null,
  placeholder = 'Enter event address…',
}) {
  const [addressText, setAddressText] = useState(initialAddress);
  const [found, setFound] = useState(initialCoords ? { address: initialAddress, ...initialCoords } : null);
  const [confirmed, setConfirmed] = useState(!!initialCoords);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFind = async () => {
    if (addressText.trim().length < 5 || loading) return;
    setLoading(true);
    setError('');
    setConfirmed(false);
    try {
      const result = await geocode(addressText.trim());
      setFound(result);
      if (!result) setError('Address not found. Try adding the city or postcode.');
    } catch {
      setFound(null);
      setError('Could not look up that address. Check your connection and try again.');
    }
    setLoading(false);
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setAddressText(found.address);
    onLocationConfirmed?.({ address: found.address, coordinates: { lat: found.lat, lng: found.lng } });
  };

  return (
    <View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={addressText}
          onChangeText={(text) => { setAddressText(text); setConfirmed(false); }}
          placeholder={placeholder}
          placeholderTextColor="#999"
          onSubmitEditing={handleFind}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.findButton} onPress={handleFind} disabled={loading} accessibilityRole="button">
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="search" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {found && (
        <View style={styles.preview}>
          <iframe title="Map preview" src={mapEmbedUrl(found)} style={{ border: 0, width: '100%', height: 200 }} />
          <Text style={styles.foundAddress}>{found.address}</Text>
          {confirmed ? (
            <View style={styles.confirmedRow}>
              <Ionicons name="checkmark-circle" size={18} color="#4ECDC4" />
              <Text style={styles.confirmedText}>Location confirmed</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm} accessibilityRole="button">
              <Text style={styles.confirmButtonText}>Confirm location</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  findButton: {
    width: 46,
    borderRadius: 12,
    backgroundColor: '#4ECDC4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#FF6B6B',
    fontSize: 13,
    marginTop: 8,
  },
  preview: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
  },
  foundAddress: {
    fontSize: 14,
    color: '#333',
    padding: 12,
  },
  confirmButton: {
    backgroundColor: '#4ECDC4',
    margin: 12,
    marginTop: 0,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    paddingTop: 0,
  },
  confirmedText: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '600',
  },
});
