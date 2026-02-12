import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
  Share,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '../i18n';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 150;

// Report reasons - function to get localized labels
const getReportReasons = () => [
  { id: 'spam', label: i18n.t('report.spam'), icon: 'alert-circle' },
  { id: 'inappropriate', label: i18n.t('report.inappropriate'), icon: 'warning' },
  { id: 'fake', label: i18n.t('report.fake'), icon: 'eye-off' },
  { id: 'duplicate', label: i18n.t('report.duplicate'), icon: 'copy' },
  { id: 'other', label: i18n.t('report.other'), icon: 'ellipsis-horizontal' },
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
        Alert.alert(i18n.t('report.alreadyReported'), i18n.t('report.alreadyReported'));
      } else {
        Alert.alert(i18n.t('common.error'), i18n.t('report.reportFailed'));
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
              <Text style={reportStyles.successTitle}>{i18n.t('report.thankYou')}</Text>
              <Text style={reportStyles.successText}>
                {i18n.t('report.thankYouText')}
              </Text>
              <TouchableOpacity style={reportStyles.doneButton} onPress={handleClose}>
                <Text style={reportStyles.doneButtonText}>{i18n.t('common.done')}</Text>
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
            <Text style={reportStyles.headerTitle}>{i18n.t('report.title')}</Text>
            <View style={reportStyles.headerButton} />
          </View>

          {/* Event info */}
          <View style={reportStyles.eventInfo}>
            <Ionicons name="flag" size={20} color="#FF6B6B" />
            <Text style={reportStyles.eventTitle} numberOfLines={1}>{eventTitle}</Text>
          </View>

          {/* Reason selection */}
          <Text style={reportStyles.sectionTitle}>{i18n.t('report.whyReporting')}</Text>
          
          <ScrollView style={reportStyles.reasonsList} showsVerticalScrollIndicator={false}>
            {getReportReasons().map((reason) => (
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
                  placeholder={i18n.t('report.otherPlaceholder')}
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
              <Text style={reportStyles.submitButtonText}>{i18n.t('report.submitReport')}</Text>
            )}
          </TouchableOpacity>

          <Text style={reportStyles.disclaimer}>
            {i18n.t('report.disclaimer')}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// Main EventDetailsModal Component
export default function EventDetailsModal({ visible, event, onClose, onSave, onPass, isSavedView = false, onReport, isOwner = false, onDelete, onEdit }) {
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosing = useRef(false);

  // Handle open/close animations
  useEffect(() => {
    if (visible) {
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

  // Handle drag on the handle area
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

  if (!event) return null;

  const handleGetTickets = () => {
    if (event.ticketUrl) {
      Linking.openURL(event.ticketUrl);
    } else if (event.source === 'ticketmaster') {
      // Clean up the title for better search results
      let searchTitle = event.title
        .split(' - ')[0]
        .split(' at ')[0]
        .split(' @ ')[0]
        .trim();
      const searchQuery = encodeURIComponent(searchTitle);
      Linking.openURL(`https://www.ticketmaster.com/search?q=${searchQuery}`);
    } else if (event.source === 'seatgeek') {
      let searchTitle = event.title
        .split(' - ')[0]
        .split(' at ')[0]
        .split(' @ ')[0]
        .trim();
      const searchQuery = encodeURIComponent(searchTitle);
      Linking.openURL(`https://seatgeek.com/search?search=${searchQuery}`);
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

  const handleDelete = () => {
    Alert.alert(
      i18n.t('eventDetails.deleteEvent'),
      i18n.t('eventDetails.deleteConfirm'),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            if (onDelete) {
              await onDelete(event.id);
            }
            setIsDeleting(false);
            handleClose();
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    try {
      let message = `${i18n.t('eventDetails.shareCheckOut')}\n\n🎉 ${event.title}`;
      if (event.hasMultipleDates && event.allDates) {
        message += `\n📅 ${event.dateCount} dates:`;
        event.allDates.forEach(d => {
          message += `\n   • ${d.date}${d.time ? ` • ${d.time}` : ''}`;
        });
      } else {
        if (event.date) message += `\n📅 ${event.date}`;
        if (event.time) message += ` • ${event.time}`;
      }
      if (event.location) message += `\n📍 ${event.location}`;
      if (event.ticketUrl) message += `\n\n🎟️ ${i18n.t('eventDetails.shareGetTickets')}: ${event.ticketUrl}`;
      message += `\n\n${i18n.t('eventDetails.shareFoundOn')}`;

      await Share.share({
        message,
        title: event.title,
      });
    } catch (error) {
      // User cancelled share - no action needed
      if (error.name !== 'AbortError') {
        console.error('Error sharing event:', error);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Animated.View 
        style={[
          styles.backdrop,
          { opacity: backdropOpacity }
        ]}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.backdropTouchable} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Modal Content */}
      <Animated.View 
        style={[
          styles.container,
          { transform: [{ translateY }] }
        ]}
      >
        {/* Drag Handle - Large touch target */}
        <View 
          style={styles.handleArea}
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <View style={styles.swipeBar} />
        </View>

        {/* Share & Report buttons in top right */}
        <View style={styles.topRightButtons}>
          <TouchableOpacity 
            style={styles.topButton}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={20} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.topButton}
            onPress={() => setReportModalVisible(true)}
          >
            <Ionicons name="flag-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          onScrollEndDrag={onScrollEndDrag}
          scrollEventThrottle={16}
          bounces={true}
          overScrollMode="always"
        >
          {/* Image */}
          <Image source={{ uri: event.image }} style={styles.image} />

          {/* Category & Price */}
          <View style={styles.tagRow}>
            <View style={styles.categoryTag}>
              <Text style={styles.categoryText}>{(event.categoryDisplay || event.category)?.toUpperCase()}</Text>
            </View>
            {(event.source === 'ticketmaster' || event.source === 'seatgeek' || event.ticketUrl) && (
              <TouchableOpacity style={styles.priceTag} onPress={handleGetTickets}>
                <Text style={styles.priceText}>{event.ticketUrl ? i18n.t('discover.seeTickets') : i18n.t('discover.findTickets')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>{event.title}</Text>

          {/* Date & Time */}
          {event.hasMultipleDates ? (
            <View style={styles.multiDateSection}>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={20} color="#4ECDC4" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.multiDateHeaderRow}>
                    <Text style={styles.multiDateLabel}>
                      📅 {event.dateCount} {i18n.t('discover.dates', { defaultValue: 'Dates Available' })}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.datesList}>
                {event.allDates.map((d, idx) => (
                  <View key={idx} style={styles.dateItem}>
                    <View style={[styles.dateDot, idx === 0 && styles.dateDotFirst]} />
                    <Text style={[styles.dateItemText, idx === 0 && styles.dateItemTextFirst]}>
                      {d.date}{d.time ? ` • ${d.time}` : ''}
                    </Text>
                    {idx === 0 && (
                      <View style={styles.nextBadge}>
                        <Text style={styles.nextBadgeText}>{i18n.t('discover.nextDate', { defaultValue: 'Next' })}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color="#4ECDC4" />
              <Text style={styles.infoText}>{event.date}{event.time ? ` • ${event.time}` : ''}</Text>
            </View>
          )}

          {/* Location */}
          <TouchableOpacity style={styles.infoRow} onPress={handleGetDirections}>
            <Ionicons name="location-outline" size={20} color="#4ECDC4" />
            <View style={styles.locationInfo}>
              <Text style={styles.infoText}>{event.location}</Text>
              {event.address && (
                <Text style={styles.addressText}>{event.address}</Text>
              )}
              <Text style={styles.directionsLink}>{i18n.t('eventDetails.getDirections')} →</Text>
            </View>
          </TouchableOpacity>

          {/* Description */}
          {event.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{i18n.t('eventDetails.about')}</Text>
              <Text style={styles.description}>{event.description}</Text>
            </View>
          )}

          {/* Get Tickets Button */}
          {(event.source === 'ticketmaster' || event.source === 'seatgeek' || event.ticketUrl) && (
            <TouchableOpacity style={styles.ticketButton} onPress={handleGetTickets}>
              <Ionicons name="ticket-outline" size={24} color="#fff" />
              <Text style={styles.ticketButtonText}>
                {event.ticketUrl ? i18n.t('eventDetails.getTickets') : i18n.t('discover.findTickets')}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>

        {/* Action Bar */}
        <View style={styles.actionBar}>
          {isOwner ? (
            // Delete, Edit, and Close buttons for owner's events
            <>
              <TouchableOpacity 
                style={[styles.actionButton, styles.deleteButton]}
                onPress={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FF6B6B" />
                ) : (
                  <Ionicons name="trash-outline" size={28} color="#FF6B6B" />
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionButton, styles.editButton]}
                onPress={() => {
                  if (onEdit) {
                    onEdit(event);
                    handleClose();
                  }
                }}
              >
                <Ionicons name="create-outline" size={28} color="#4ECDC4" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.actionButton, styles.closeButtonStyle]}
                onPress={handleClose}
              >
                <Ionicons name="close" size={32} color="#666" />
              </TouchableOpacity>
            </>
          ) : isSavedView ? (
            // Just close button for saved view
            <TouchableOpacity 
              style={[styles.actionButton, styles.closeButtonStyle]}
              onPress={handleClose}
            >
              <Ionicons name="close" size={32} color="#666" />
            </TouchableOpacity>
          ) : (
            // Pass and Save buttons for discover view
            <>
              <TouchableOpacity 
                style={[styles.actionButton, styles.passButton]}
                onPress={() => {
                  onPass();
                  handleClose();
                }}
              >
                <Ionicons name="close" size={32} color="#FF6B6B" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.actionButton, styles.saveButton]}
                onPress={() => {
                  onSave();
                  handleClose();
                }}
              >
                <Ionicons name="heart" size={32} color="#4ECDC4" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </Animated.View>

      {/* Report Modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSubmit={handleReportSubmit}
        eventTitle={event.title}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropTouchable: {
    flex: 1,
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
  },
  handleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    // Make the touch target larger
    minHeight: 44,
  },
  swipeBar: {
    width: 48,
    height: 5,
    backgroundColor: '#ddd',
    borderRadius: 3,
  },
  topRightButtons: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    gap: 8,
  },
  topButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: 250,
  },
  tagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  priceText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  title: {
    fontSize: 24,
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
  multiDateSection: {
    paddingBottom: 4,
  },
  multiDateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  multiDateLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  datesList: {
    marginLeft: 52,
    marginTop: 8,
    marginBottom: 4,
    borderLeftWidth: 2,
    borderLeftColor: '#eee',
    paddingLeft: 16,
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
    marginRight: 10,
  },
  dateDotFirst: {
    backgroundColor: '#4ECDC4',
  },
  dateItemText: {
    fontSize: 15,
    color: '#666',
    flex: 1,
  },
  dateItemTextFirst: {
    color: '#333',
    fontWeight: '500',
  },
  nextBadge: {
    backgroundColor: '#E8FAF8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  nextBadgeText: {
    fontSize: 11,
    color: '#4ECDC4',
    fontWeight: '600',
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
  deleteButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  editButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4ECDC4',
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