import React, { useState } from 'react';
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
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Report reasons
const REPORT_REASONS = [
  { id: 'spam', label: 'Spam or scam', icon: 'alert-circle' },
  { id: 'inappropriate', label: 'Inappropriate content', icon: 'warning' },
  { id: 'fake', label: 'Fake or misleading event', icon: 'eye-off' },
  { id: 'duplicate', label: 'Duplicate posting', icon: 'copy' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

// Report Modal Component
function ReportModal({ visible, onClose, onSubmit, eventTitle }) {
  const [selectedReason, setSelectedReason] = useState(null);
  const [otherText, setOtherText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) return;
    
    setIsSubmitting(true);
    
    const reportData = {
      reason: selectedReason,
      details: selectedReason === 'other' ? otherText : null,
    };
    
    try {
      await onSubmit(reportData);
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting report:', error);
      if (error.message === 'You have already reported this event') {
        Alert.alert('Already Reported', 'You have already reported this event.');
      } else {
        Alert.alert('Error', 'Failed to submit report. Please try again.');
      }
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
  };

  const handleClose = () => {
    setSelectedReason(null);
    setOtherText('');
    setSubmitted(false);
    onClose();
  };

  // Success state
  if (submitted) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={reportStyles.overlay}>
          <View style={reportStyles.container}>
            <View style={reportStyles.successContent}>
              <View style={reportStyles.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color="#4ECDC4" />
              </View>
              <Text style={reportStyles.successTitle}>Thanks for letting us know</Text>
              <Text style={reportStyles.successText}>
                We'll review this event and take action if it violates our guidelines.
              </Text>
              <TouchableOpacity style={reportStyles.doneButton} onPress={handleClose}>
                <Text style={reportStyles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={reportStyles.overlay}>
        <View style={reportStyles.container}>
          {/* Header */}
          <View style={reportStyles.header}>
            <TouchableOpacity onPress={handleClose} style={reportStyles.headerButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            <Text style={reportStyles.headerTitle}>Report Event</Text>
            <View style={reportStyles.headerButton} />
          </View>

          {/* Event info */}
          <View style={reportStyles.eventInfo}>
            <Ionicons name="flag" size={20} color="#FF6B6B" />
            <Text style={reportStyles.eventTitle} numberOfLines={1}>{eventTitle}</Text>
          </View>

          {/* Reason selection */}
          <Text style={reportStyles.sectionTitle}>Why are you reporting this event?</Text>
          
          <ScrollView style={reportStyles.reasonsList} showsVerticalScrollIndicator={false}>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.id}
                style={[
                  reportStyles.reasonItem,
                  selectedReason === reason.id && reportStyles.reasonItemSelected,
                ]}
                onPress={() => setSelectedReason(reason.id)}
              >
                <View style={reportStyles.reasonLeft}>
                  <Ionicons
                    name={reason.icon}
                    size={22}
                    color={selectedReason === reason.id ? '#4ECDC4' : '#666'}
                  />
                  <Text style={[
                    reportStyles.reasonLabel,
                    selectedReason === reason.id && reportStyles.reasonLabelSelected,
                  ]}>
                    {reason.label}
                  </Text>
                </View>
                <View style={[
                  reportStyles.radioOuter,
                  selectedReason === reason.id && reportStyles.radioOuterSelected,
                ]}>
                  {selectedReason === reason.id && <View style={reportStyles.radioInner} />}
                </View>
              </TouchableOpacity>
            ))}

            {/* Other text input */}
            {selectedReason === 'other' && (
              <View style={reportStyles.otherInputContainer}>
                <TextInput
                  style={reportStyles.otherInput}
                  placeholder="Please describe the issue..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  value={otherText}
                  onChangeText={setOtherText}
                />
                <Text style={reportStyles.charCount}>{otherText.length}/500</Text>
              </View>
            )}
          </ScrollView>

          {/* Submit button */}
          <TouchableOpacity
            style={[
              reportStyles.submitButton,
              (!selectedReason || (selectedReason === 'other' && !otherText.trim())) &&
                reportStyles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={
              !selectedReason ||
              (selectedReason === 'other' && !otherText.trim()) ||
              isSubmitting
            }
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={reportStyles.submitButtonText}>Submit Report</Text>
            )}
          </TouchableOpacity>

          <Text style={reportStyles.disclaimer}>
            False reports may result in restrictions on your account.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// Main EventDetailsModal Component
export default function EventDetailsModal({ visible, event, onClose, onSave, onPass, isSavedView = false, onReport }) {
  const [reportModalVisible, setReportModalVisible] = useState(false);

  if (!event) return null;

  const handleGetTickets = () => {
    if (event.ticketUrl) {
      Linking.openURL(event.ticketUrl);
    } else if (event.source === 'ticketmaster') {
      const searchQuery = encodeURIComponent(`${event.title} ${event.city || ''}`);
      Linking.openURL(`https://www.ticketmaster.com/search?q=${searchQuery}`);
    } else {
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

  const handleReportSubmit = async (reportData) => {
    if (onReport) {
      // Pass the full event object so we can store event details with the report
      await onReport(event, reportData.reason, reportData.details);
    }
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
          {/* Report button in top right */}
          <TouchableOpacity 
            style={styles.reportButton}
            onPress={() => setReportModalVisible(true)}
          >
            <Ionicons name="flag-outline" size={20} color="#666" />
          </TouchableOpacity>

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
                  style={[styles.actionButton, styles.closeButtonStyle]} 
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

      {/* Report Modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSubmit={handleReportSubmit}
        eventTitle={event?.title}
      />
    </Modal>
  );
}

// Main modal styles
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
  reportButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
  closeButtonStyle: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#666',
  },
});

// Report modal styles
const reportStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  eventInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  eventTitle: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  reasonsList: {
    paddingHorizontal: 16,
    maxHeight: 300,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#f8f8f8',
  },
  reasonItemSelected: {
    backgroundColor: '#E8FAF8',
    borderWidth: 1,
    borderColor: '#4ECDC4',
  },
  reasonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reasonLabel: {
    fontSize: 15,
    color: '#333',
  },
  reasonLabelSelected: {
    color: '#4ECDC4',
    fontWeight: '500',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: '#4ECDC4',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ECDC4',
  },
  otherInputContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  otherInput: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#333',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: '#FF6B6B',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
    marginHorizontal: 16,
  },
  successContent: {
    alignItems: 'center',
    padding: 32,
  },
  successIcon: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  successText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  doneButton: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});