// analyticsService.js
// Tracks event engagement metrics in Firestore

import { doc, setDoc, getDoc, getDocs, collection, query, where, increment, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Track when a user views an event (swipes in either direction)
 */
export const trackView = async (eventId) => {
  try {
    const analyticsRef = doc(db, 'eventAnalytics', eventId);
    await setDoc(analyticsRef, {
      eventId,
      views: increment(1),
      lastViewAt: Timestamp.now(),
    }, { merge: true });
  } catch (error) {
    console.error('View tracking error:', error);
  }
};

/**
 * Track when a user saves an event (swipes right)
 */
export const trackSave = async (eventId, eventTitle, source) => {
  try {
    const analyticsRef = doc(db, 'eventAnalytics', eventId);
    await setDoc(analyticsRef, {
      eventId,
      eventTitle: eventTitle || '',
      source: source || 'unknown',
      saves: increment(1),
      lastSaveAt: Timestamp.now(),
    }, { merge: true });
  } catch (error) {
    console.error('Save tracking error:', error);
  }
};

/**
 * Track when a user taps "Get Tickets"
 */
export const trackTicketTap = async (event, userId) => {
  try {
    const analyticsRef = doc(db, 'eventAnalytics', event.id);
    await setDoc(analyticsRef, {
      eventId: event.id,
      eventTitle: event.title || '',
      source: event.source || 'unknown',
      category: event.categoryDisplay || event.category || '',
      ticketTaps: increment(1),
      lastTapAt: Timestamp.now(),
      ...(event.userId && { eventOwnerId: event.userId }),
    }, { merge: true });
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
};

/**
 * Get analytics for a single event
 */
export const getEventAnalytics = async (eventId) => {
  try {
    const analyticsRef = doc(db, 'eventAnalytics', eventId);
    const analyticsDoc = await getDoc(analyticsRef);
    if (analyticsDoc.exists()) {
      return analyticsDoc.data();
    }
    return { views: 0, saves: 0, ticketTaps: 0 };
  } catch (error) {
    console.error('Error fetching event analytics:', error);
    return { views: 0, saves: 0, ticketTaps: 0 };
  }
};

/**
 * Get analytics for multiple events at once (batch)
 * Returns a map of eventId -> { views, saves, ticketTaps }
 */
export const getBatchEventAnalytics = async (eventIds) => {
  const analyticsMap = {};
  
  if (!eventIds || eventIds.length === 0) return analyticsMap;
  
  try {
    // Firestore 'in' queries support max 30 items at a time
    const chunks = [];
    for (let i = 0; i < eventIds.length; i += 30) {
      chunks.push(eventIds.slice(i, i + 30));
    }
    
    for (const chunk of chunks) {
      const q = query(
        collection(db, 'eventAnalytics'),
        where('eventId', 'in', chunk)
      );
      const snapshot = await getDocs(q);
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        analyticsMap[data.eventId] = {
          views: data.views || 0,
          saves: data.saves || 0,
          ticketTaps: data.ticketTaps || 0,
        };
      });
    }
  } catch (error) {
    console.error('Error fetching batch analytics:', error);
  }
  
  // Fill in zeros for events with no analytics yet
  eventIds.forEach(id => {
    if (!analyticsMap[id]) {
      analyticsMap[id] = { views: 0, saves: 0, ticketTaps: 0 };
    }
  });
  
  return analyticsMap;
};