import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam or scam', icon: 'alert-circle' },
  { id: 'inappropriate', label: 'Inappropriate content', icon: 'warning' },
  { id: 'fake', label: 'Fake or misleading event', icon: 'eye-off' },
  { id: 'duplicate', label: 'Duplicate posting', icon: 'copy' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

export default function ReportModal({ visible, onClose, onSubmit, eventTitle }) {
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset state when closing
    setSelectedReason(null);
    setOtherText('');
    setSubmitted(false);
    onClose();
  };

  // Success state after submission
  if (submitted) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <View style={styles.container}>
            <View style={styles.successContent}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color="#4ECDC4" />
              </View>
              <Text style={styles.successTitle}>Thanks for letting us know</Text>
              <Text style={styles.successText}>
                We'll review this event and take action if it violates our guidelines.
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Report Event</Text>
            <View style={styles.closeButton} /> {/* Spacer for centering */}
          </View>

          {/* Event being reported */}
          <View style={styles.eventInfo}>
            <Ionicons name="flag" size={20} color="#FF6B6B" />
            <Text style={styles.eventTitle} numberOfLines={1}>
              {eventTitle}
            </Text>
          </View>

          {/* Reason selection */}
          <Text style={styles.sectionTitle}>Why are you reporting this event?</Text>
          
          <View style={styles.reasonsList}>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.id}
                style={[
                  styles.reasonItem,
                  selectedReason === reason.id && styles.reasonItemSelected,
                ]}
                onPress={() => setSelectedReason(reason.id)}
              >
                <View style={styles.reasonLeft}>
                  <Ionicons
                    name={reason.icon}
                    size={22}
                    color={selectedReason === reason.id ? '#4ECDC4' : '#666'}
                  />
                  <Text
                    style={[
                      styles.reasonLabel,
                      selectedReason === reason.id && styles.reasonLabelSelected,
                    ]}
                  >
                    {reason.label}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radioOuter,
                    selectedReason === reason.id && styles.radioOuterSelected,
                  ]}
                >
                  {selectedReason === reason.id && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Other reason text input */}
          {selectedReason === 'other' && (
            <View style={styles.otherInputContainer}>
              <TextInput
                style={styles.otherInput}
                placeholder="Please describe the issue..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
                maxLength={500}
                value={otherText}
                onChangeText={setOtherText}
              />
              <Text style={styles.charCount}>{otherText.length}/500</Text>
            </View>
          )}

          {/* Submit button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!selectedReason || (selectedReason === 'other' && !otherText.trim())) &&
                styles.submitButtonDisabled,
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
              <Text style={styles.submitButtonText}>Submit Report</Text>
            )}
          </TouchableOpacity>

          {/* Disclaimer */}
          <Text style={styles.disclaimer}>
            False reports may result in restrictions on your account.
          </Text>
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
  closeButton: {
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
    marginHorizontal: 16,
    marginTop: 8,
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
    marginTop: 20,
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
  // Success state styles
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