import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  doc,
  updateDoc,
  increment,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import i18n from '../i18n';

/**
 * Submit a report for an event
 * @param {string} eventId - The ID of the event being reported
 * @param {string} reporterId - The ID of the user submitting the report
 * @param {string} reason - The reason category for the report
 * @param {string|null} details - Additional details (for 'other' reason)
 * @param {object} eventInfo - Event details to store with the report
 * @returns {Promise<string>} - The ID of the created report
 */
export const submitReport = async (eventId, reporterId, reason, details = null, eventInfo = {}) => {
  try {
    // Check if user already reported this event
    const existingReport = await checkExistingReport(eventId, reporterId);
    if (existingReport) {
      throw new Error(i18n.t('report.alreadyReported'));
    }

    // Create the report document with event info for easy review
    const reportData = {
      eventId,
      reporterId,
      reason,
      details,
      status: 'pending', // pending, reviewed, dismissed, actioned
      createdAt: serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      actionTaken: null,
      // Event info for easy review in Firebase Console
      eventTitle: eventInfo.title || 'Unknown',
      eventImage: eventInfo.image || null,
      eventSource: eventInfo.source || 'unknown',
      eventDate: eventInfo.date || null,
      eventTime: eventInfo.time || null,
      eventLocation: eventInfo.location || null,
      eventCategory: eventInfo.category || eventInfo.categoryDisplay || null,
    };

    const reportRef = await addDoc(collection(db, 'reports'), reportData);

    // Check total reports for this event and handle thresholds
    const totalReports = await getReportCountForEvent(eventId);
    
    // Try to update event document if it exists in Firestore (user-created events)
    try {
      const eventRef = doc(db, 'events', eventId);
      const eventDoc = await getDoc(eventRef);
      
      if (eventDoc.exists()) {
        await updateDoc(eventRef, {
          reportCount: increment(1),
        });
        
        // Check if event has reached threshold for auto-hide
        await checkReportThreshold(eventId, totalReports);
      }
    } catch (updateError) {
      // Event doesn't exist in Firestore (external API event) - that's OK
      console.log('Event not in Firestore, skipping reportCount update');
    }

    // Log for your reference - you could add email notification here later
    if (totalReports >= 3) {
      console.warn(`⚠️ EVENT HAS ${totalReports} REPORTS: ${eventInfo.title || eventId}`);
    }

    return reportRef.id;
  } catch (error) {
    console.error('Error submitting report:', error);
    throw error;
  }
};

/**
 * Check if a user has already reported an event
 */
export const checkExistingReport = async (eventId, reporterId) => {
  const q = query(
    collection(db, 'reports'),
    where('eventId', '==', eventId),
    where('reporterId', '==', reporterId)
  );
  
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

/**
 * Get total report count for an event
 */
export const getReportCountForEvent = async (eventId) => {
  const q = query(
    collection(db, 'reports'),
    where('eventId', '==', eventId)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.size;
};

/**
 * Check if an event has reached the report threshold and should be hidden
 * Threshold: 3 reports = hidden pending review, 5 reports = auto-removed
 */
const checkReportThreshold = async (eventId, reportCount) => {
  const eventRef = doc(db, 'events', eventId);

  if (reportCount >= 5) {
    // Auto-remove the event
    await updateDoc(eventRef, {
      status: 'removed',
      removedReason: 'auto_reported',
      removedAt: serverTimestamp(),
    });
    // TODO: Notify organizer via email/notification
  } else if (reportCount >= 3) {
    // Hide pending review
    await updateDoc(eventRef, {
      status: 'hidden_review',
      flaggedAt: serverTimestamp(),
    });
  }
};

/**
 * Get all reports for an event (admin use)
 */
export const getReportsForEvent = async (eventId) => {
  const q = query(
    collection(db, 'reports'),
    where('eventId', '==', eventId)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
};

/**
 * Get all pending reports (admin use)
 */
export const getPendingReports = async () => {
  const q = query(
    collection(db, 'reports'),
    where('status', '==', 'pending')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
};

/**
 * Update report status (admin use)
 */
export const updateReportStatus = async (reportId, status, adminId, actionTaken = null) => {
  const reportRef = doc(db, 'reports', reportId);
  
  await updateDoc(reportRef, {
    status,
    reviewedAt: serverTimestamp(),
    reviewedBy: adminId,
    actionTaken,
  });
};

/**
 * Dismiss a report (admin determined it's not valid)
 */
export const dismissReport = async (reportId, adminId) => {
  await updateReportStatus(reportId, 'dismissed', adminId, 'Report dismissed - no violation found');
};

/**
 * Take action on a report (remove event, warn organizer, etc.)
 */
export const actionReport = async (reportId, adminId, action) => {
  await updateReportStatus(reportId, 'actioned', adminId, action);
};