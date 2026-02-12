import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { postEvent, updateEvent } from '../services/eventService';
import i18n from '../i18n';

// Geocode an address to get coordinates (called at submit time)
const geocodeAddress = async (query) => {
  if (!query || query.trim().length < 3) return null;
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`
      );
      const data = await response.json();
      if (data && data.features && data.features.length > 0) {
        const f = data.features[0];
        return {
          latitude: f.geometry.coordinates[1],
          longitude: f.geometry.coordinates[0],
        };
      }
      return null;
    } else {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'User-Agent': 'EventSwipe/1.0' } }
      );
      const results = await response.json();
      if (results && results.length > 0) {
        return {
          latitude: parseFloat(results[0].lat),
          longitude: parseFloat(results[0].lon),
        };
      }
      return null;
    }
  } catch (error) {
    console.error('Geocode error:', error);
    return null;
  }
};

// Categories - function to get localized labels
const getCategories = () => [
  { id: 'music', label: i18n.t('categories.music'), emoji: '🎵' },
  { id: 'food', label: i18n.t('categories.food'), emoji: '🍔' },
  { id: 'sports', label: i18n.t('categories.sports'), emoji: '⚽' },
  { id: 'arts', label: i18n.t('categories.arts'), emoji: '🎨' },
  { id: 'nightlife', label: i18n.t('categories.nightlife'), emoji: '🌙' },
  { id: 'fitness', label: i18n.t('categories.fitness'), emoji: '💪' },
  { id: 'comedy', label: i18n.t('categories.comedy'), emoji: '😂' },
  { id: 'networking', label: i18n.t('categories.networking'), emoji: '🤝' },
  { id: 'family', label: i18n.t('categories.family'), emoji: '👨‍👩‍👧‍👦' },
  { id: 'outdoor', label: i18n.t('categories.outdoor'), emoji: '🏕️' },
];

export default function PostEventScreen({ navigation, route }) {
  const editEvent = route?.params?.editEvent || null;
  const isEditing = !!editEvent;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dates, setDates] = useState([
    { id: 1, date: new Date(), time: new Date(), dateSelected: false, timeSelected: false },
  ]);
  const [activePicker, setActivePicker] = useState({ type: null, index: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const { user } = useAuth();

  // Pre-fill form when editing an existing event
  useEffect(() => {
    if (editEvent) {
      setTitle(editEvent.title || '');
      setDescription(editEvent.description || '');
      setLocation(editEvent.location || '');
      setCategory(editEvent.category || '');
      setTicketUrl(editEvent.ticketUrl || '');
      setPrice(editEvent.price === i18n.t('common.free') ? '' : (editEvent.price || ''));
      setImage(editEvent.image || null);

      // Pre-fill address
      if (editEvent.address) {
        setAddress(editEvent.address);
      }

      // Pre-fill dates
      if (editEvent.hasMultipleDates && editEvent.allDates) {
        const parsedDates = editEvent.allDates.map((d, idx) => {
          const dateParts = d.date.split('-').map(Number);
          const timeParts = (d.time || '00:00').split(':').map(Number);
          const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
          const timeObj = new Date();
          timeObj.setHours(timeParts[0], timeParts[1], 0, 0);
          return {
            id: idx + 1,
            date: dateObj,
            time: timeObj,
            dateSelected: true,
            timeSelected: true,
          };
        });
        setDates(parsedDates);
      } else if (editEvent.date) {
        // Single date
        const dateParts = editEvent.date.includes('-')
          ? editEvent.date.split('-').map(Number)
          : editEvent.date.includes('/')
            ? (() => { const [m, d, y] = editEvent.date.split('/').map(Number); return [y, m, d]; })()
            : null;
        const timeParts = (editEvent.time || '00:00').split(':').map(Number);

        if (dateParts) {
          const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
          const timeObj = new Date();
          timeObj.setHours(timeParts[0], timeParts[1], 0, 0);
          setDates([{
            id: 1,
            date: dateObj,
            time: timeObj,
            dateSelected: true,
            timeSelected: true,
          }]);
        }
      }
    }
  }, [editEvent]);

  // Format date for display (e.g., "Jan 15, 2025")
  const formatDateDisplay = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Format time for display (e.g., "7:00 PM")
  const formatTimeDisplay = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Format date for storage (YYYY-MM-DD) - compatible with filtering
  const formatDateForStorage = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format time for storage (HH:MM) - 24-hour format
  const formatTimeForStorage = (date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate && activePicker.index !== null) {
      updateDateEntry(activePicker.index, { date: selectedDate, dateSelected: true });
    }
  };

  const onTimeChange = (event, selectedTime) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (selectedTime && activePicker.index !== null) {
      updateDateEntry(activePicker.index, { time: selectedTime, timeSelected: true });
    }
  };

  const updateDateEntry = (index, updates) => {
    setDates(prev => prev.map((entry, i) => i === index ? { ...entry, ...updates } : entry));
  };

  const addDateEntry = () => {
    setDates(prev => [
      ...prev,
      { id: Date.now(), date: new Date(), time: new Date(), dateSelected: false, timeSelected: false },
    ]);
  };

  const removeDateEntry = (index) => {
    if (dates.length <= 1) return;
    setDates(prev => prev.filter((_, i) => i !== index));
  };

  const openDatePicker = (index) => {
    setActivePicker({ type: 'date', index });
    setShowDatePicker(true);
  };

  const openTimePicker = (index) => {
    setActivePicker({ type: 'time', index });
    setShowTimePicker(true);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      setError(i18n.t('postEvent.photoPermissionRequired'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDates([
      { id: 1, date: new Date(), time: new Date(), dateSelected: false, timeSelected: false },
    ]);
    setActivePicker({ type: null, index: null });
    setLocation('');
    setAddress('');
    setCategory('');
    setTicketUrl('');
    setPrice('');
    setImage(null);
    setError('');
  };

  const handleSubmit = async () => {
  setError('');
  
  // Validate all date entries have both date and time selected
  const completeDates = dates.filter(d => d.dateSelected && d.timeSelected);
  if (!title || completeDates.length === 0 || !category) {
    setError(i18n.t('postEvent.fillRequired'));
    return;
  }

  // Check for incomplete entries
  const incompleteDates = dates.filter(d => (d.dateSelected && !d.timeSelected) || (!d.dateSelected && d.timeSelected));
  if (incompleteDates.length > 0) {
    setError(i18n.t('postEvent.completeDateTimes', { defaultValue: 'Please complete or remove incomplete date/time entries' }));
    return;
  }

  // Require address
  if (!address.trim()) {
    setError(i18n.t('postEvent.addressRequired'));
    return;
  }

  setLoading(true);

  // Geocode the address to get coordinates
  const coords = await geocodeAddress(address.trim());
  if (!coords) {
    setLoading(false);
    setError(i18n.t('postEvent.geocodeFailed', { defaultValue: 'Could not find coordinates for that address. Please check the address and try again.' }));
    return;
  }

  // Sort dates chronologically
  const sortedDates = [...completeDates].sort((a, b) => a.date - b.date);
  const primaryDate = sortedDates[0];

  // Build allDates array
  const allDates = sortedDates.map(d => ({
    date: formatDateForStorage(d.date),
    time: formatTimeForStorage(d.time),
  }));

  const eventData = {
    title,
    description,
    date: formatDateForStorage(primaryDate.date),
    time: formatTimeForStorage(primaryDate.time),
    location,
    address,
    category,
    ticketUrl,
    price: price || i18n.t('common.free'),
    latitude: coords.latitude,
    longitude: coords.longitude,
    image: image || `https://picsum.photos/400/300?random=${Date.now()}`,
    imageUri: image,
    // Multi-date fields
    ...(allDates.length > 1 && {
      allDates,
      hasMultipleDates: true,
      dateCount: allDates.length,
    }),
  };

  const result = isEditing
    ? await updateEvent(editEvent.id, eventData, user.uid)
    : await postEvent(eventData, user.uid);
  
  setLoading(false);

  if (result.success) {
    setSuccess(true);
  } else {
    setError(result.error || i18n.t('postEvent.postFailed'));
  }
};

  const handleSuccessDone = () => {
    resetForm();
    setSuccess(false);
    if (isEditing) {
      navigation.navigate('Activity');
    } else {
      navigation.navigate('Discover');
    }
  };

  const handlePostAnother = () => {
    resetForm();
    setSuccess(false);
  };

  // Success screen
  if (success) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successContent}>
          <Text style={styles.successEmoji}>{isEditing ? '✅' : '🎉'}</Text>
          <Text style={styles.successTitle}>
            {isEditing
              ? i18n.t('postEvent.eventUpdated', { defaultValue: 'Event Updated!' })
              : i18n.t('postEvent.eventPosted')}
          </Text>
          <Text style={styles.successText}>
            {isEditing
              ? i18n.t('postEvent.eventUpdatedText', { defaultValue: 'Your event has been updated successfully.' })
              : i18n.t('postEvent.eventPostedText')}
          </Text>
          <TouchableOpacity style={styles.successButton} onPress={handleSuccessDone}>
            <Text style={styles.successButtonText}>{i18n.t('postEvent.viewEvents')}</Text>
          </TouchableOpacity>
          {!isEditing && (
            <TouchableOpacity style={styles.secondaryButton} onPress={handlePostAnother}>
              <Text style={styles.secondaryButtonText}>{i18n.t('postEvent.postAnother')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing
            ? i18n.t('postEvent.editTitle', { defaultValue: 'Edit Event' })
            : i18n.t('postEvent.title')}
        </Text>
        <TouchableOpacity 
          onPress={handleSubmit} 
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitText}>
              {isEditing
                ? i18n.t('postEvent.save', { defaultValue: 'Save' })
                : i18n.t('postEvent.post')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Image Picker */}
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
          {image ? (
            <Image source={{ uri: image }} style={styles.selectedImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="camera-outline" size={40} color="#999" />
              <Text style={styles.imagePlaceholderText}>{i18n.t('postEvent.addEventPhoto')}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('postEvent.eventTitle')} *</Text>
          <TextInput
            style={styles.input}
            placeholder={i18n.t('postEvent.eventTitlePlaceholder')}
            placeholderTextColor="#999"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('postEvent.description')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={i18n.t('postEvent.descriptionPlaceholder')}
            placeholderTextColor="#999"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Dates and Times */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('postEvent.date')} & {i18n.t('postEvent.time')} *</Text>
          
          {dates.map((entry, index) => (
            <View key={entry.id} style={styles.dateEntryRow}>
              <TouchableOpacity
                style={[styles.pickerButton, { flex: 1, marginRight: 6 }]}
                onPress={() => openDatePicker(index)}
              >
                <Ionicons name="calendar-outline" size={20} color="#666" />
                <Text style={[styles.pickerButtonText, !entry.dateSelected && styles.placeholderText]}>
                  {entry.dateSelected ? formatDateDisplay(entry.date) : i18n.t('postEvent.selectDate')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerButton, { flex: 1, marginLeft: 6 }]}
                onPress={() => openTimePicker(index)}
              >
                <Ionicons name="time-outline" size={20} color="#666" />
                <Text style={[styles.pickerButtonText, !entry.timeSelected && styles.placeholderText]}>
                  {entry.timeSelected ? formatTimeDisplay(entry.time) : i18n.t('postEvent.selectTime')}
                </Text>
              </TouchableOpacity>
              {dates.length > 1 && (
                <TouchableOpacity
                  style={styles.removeDateButton}
                  onPress={() => removeDateEntry(index)}
                >
                  <Ionicons name="close-circle" size={24} color="#FF6B6B" />
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.addDateButton} onPress={addDateEntry}>
            <Ionicons name="add-circle-outline" size={20} color="#4ECDC4" />
            <Text style={styles.addDateButtonText}>
              {i18n.t('postEvent.addAnotherDate', { defaultValue: 'Add another date' })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Picker Modal */}
        {showDatePicker && activePicker.index !== null && (
          Platform.OS === 'ios' ? (
            <Modal transparent animationType="slide">
              <View style={styles.pickerModalOverlay}>
                <View style={styles.pickerModalContent}>
                  <View style={styles.pickerModalHeader}>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.pickerModalCancel}>{i18n.t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                      updateDateEntry(activePicker.index, { dateSelected: true });
                      setShowDatePicker(false);
                    }}>
                      <Text style={styles.pickerModalDone}>{i18n.t('common.done')}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={dates[activePicker.index].date}
                    mode="date"
                    display="spinner"
                    onChange={onDateChange}
                    minimumDate={new Date()}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={dates[activePicker.index].date}
              mode="date"
              display="default"
              onChange={onDateChange}
              minimumDate={new Date()}
            />
          )
        )}

        {/* Time Picker Modal */}
        {showTimePicker && activePicker.index !== null && (
          Platform.OS === 'ios' ? (
            <Modal transparent animationType="slide">
              <View style={styles.pickerModalOverlay}>
                <View style={styles.pickerModalContent}>
                  <View style={styles.pickerModalHeader}>
                    <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                      <Text style={styles.pickerModalCancel}>{i18n.t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                      updateDateEntry(activePicker.index, { timeSelected: true });
                      setShowTimePicker(false);
                    }}>
                      <Text style={styles.pickerModalDone}>{i18n.t('common.done')}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={dates[activePicker.index].time}
                    mode="time"
                    display="spinner"
                    onChange={onTimeChange}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={dates[activePicker.index].time}
              mode="time"
              display="default"
              onChange={onTimeChange}
            />
          )
        )}


        {/* Location */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('postEvent.venueName')}</Text>
          <TextInput
            style={styles.input}
            placeholder={i18n.t('postEvent.venueNamePlaceholder')}
            placeholderTextColor="#999"
            value={location}
            onChangeText={setLocation}
          />
        </View>

        {/* Address */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('postEvent.address')} *</Text>
          <TextInput
            style={styles.input}
            placeholder={i18n.t('postEvent.addressPlaceholder')}
            placeholderTextColor="#999"
            value={address}
            onChangeText={setAddress}
          />
        </View>

        {/* Category */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('postEvent.category')} *</Text>
          <View style={styles.categoryGrid}>
            {getCategories().map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  category === cat.id && styles.categoryChipSelected,
                ]}
                onPress={() => setCategory(cat.id)}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat.id && styles.categoryChipTextSelected,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Price */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('postEvent.ticketPrice')}</Text>
          <TextInput
            style={styles.input}
            placeholder={i18n.t('postEvent.ticketPricePlaceholder')}
            placeholderTextColor="#999"
            value={price}
            onChangeText={setPrice}
          />
        </View>

        {/* Ticket URL */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('postEvent.ticketUrl')}</Text>
          <TextInput
            style={styles.input}
            placeholder={i18n.t('postEvent.ticketUrlPlaceholder')}
            placeholderTextColor="#999"
            value={ticketUrl}
            onChangeText={setTicketUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? 20 : 50,
    paddingBottom: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF6B6B',
    textAlign: 'center',
    fontSize: 14,
  },
  imagePicker: {
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    height: 180,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#eee',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
  },
  selectedImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  dateEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  removeDateButton: {
    marginLeft: 8,
    padding: 4,
  },
  addDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  addDateButtonText: {
    color: '#4ECDC4',
    fontSize: 15,
    fontWeight: '600',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
    marginBottom: 8,
  },
  categoryChipSelected: {
    backgroundColor: '#4ECDC4',
  },
  categoryEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  categoryChipText: {
    fontSize: 13,
    color: '#666',
  },
  categoryChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
  // Success screen styles
  successContainer: {
    flex: 1,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  successContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  successEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  successText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  successButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  successButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 40,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#4ECDC4',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 10,
  },
  placeholderText: {
    color: '#999',
  },
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pickerModalCancel: {
    fontSize: 16,
    color: '#999',
  },
  pickerModalDone: {
    fontSize: 16,
    color: '#4ECDC4',
    fontWeight: '600',
  },
});