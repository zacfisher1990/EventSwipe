import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  doc,
  updateDoc,
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

    // Report counting, auto-hide and admin emails happen server-side in the
    // onReportCreated Cloud Function (clients can't read others' reports)
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