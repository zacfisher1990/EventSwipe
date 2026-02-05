import { 
  doc, 
  updateDoc, 
  arrayUnion, 
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  deleteDoc 
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';
import { uploadEventImage } from './storageService';
// API events are fetched via Cloud Function (getEventsForLocation)
import i18n from '../i18n';

// Initialize Cloud Functions
const functions = getFunctions();
const getEventsForLocation = httpsCallable(functions, 'getEventsForLocation');

// Calculate distance between two coordinates in miles (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Normalize string for comparison
const normalizeString = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Check if two events are likely duplicates
const isDuplicate = (event1, event2) => {
  if (event1.date !== event2.date) return false;
  
  const venue1 = normalizeString(event1.location || event1.venueName);
  const venue2 = normalizeString(event2.location || event2.venueName);
  
  if (venue1 && venue2 && venue1 === venue2) {
    const title1 = normalizeString(event1.title);
    const title2 = normalizeString(event2.title);
    
    if (title1.includes(title2) || title2.includes(title1)) {
      return true;
    }
    
    const words1 = title1.split(' ').filter(w => w.length > 3);
    const words2 = title2.split(' ').filter(w => w.length > 3);
    const commonWords = words1.filter(w => words2.includes(w));
    
    if (commonWords.length >= 2 || (commonWords.length >= 1 && words1.length <= 3)) {
      return true;
    }
  }
  
  return false;
};

// Remove duplicates, preferring Ticketmaster > Firebase
const deduplicateEvents = (events) => {
  const result = [];
  
  // Sort by source priority: ticketmaster first, then firebase
  const sorted = [...events].sort((a, b) => {
    const priority = { ticketmaster: 0, firebase: 1 };
    const aPriority = priority[a.source] ?? 2;
    const bPriority = priority[b.source] ?? 2;
    return aPriority - bPriority;
  });
  
  for (const event of sorted) {
    let isDupe = false;
    for (const existing of result) {
      if (isDuplicate(event, existing)) {
        isDupe = true;
        console.log(`Duplicate detected: "${event.title}" (${event.source}) matches "${existing.title}" (${existing.source})`);
        break;
      }
    }
    
    if (!isDupe) {
      result.push(event);
    }
  }
  
  return result;
};

// Group events that are the same show/event but on different dates/times
// into a single event with an allDates array
const groupMultiDateEvents = (events) => {
  const groups = new Map();
  
  for (const event of events) {
    // Events already flagged as multi-date (e.g. user-posted) skip grouping
    if (event.hasMultipleDates) {
      groups.set(`__multidate_${event.id}`, [event]);
      continue;
    }
    
    // Build a grouping key from normalized title + venue
    const titleKey = normalizeString(event.title);
    const venueKey = normalizeString(event.location || event.venueName || '');
    const groupKey = `${titleKey}__${venueKey}`;
    
    if (!titleKey) {
      // Can't group events without a title — keep as-is
      groups.set(`__ungrouped_${event.id}`, [event]);
      continue;
    }
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(event);
  }
  
  const result = [];
  
  for (const [, group] of groups) {
    if (group.length === 1) {
      // Single occurrence — pass through unchanged
      result.push(group[0]);
      continue;
    }
    
    // Sort group by date (earliest first)
    group.sort((a, b) => {
      const dateA = parseEventDate(a.date);
      const dateB = parseEventDate(b.date);
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA - dateB;
    });
    
    // Collect all unique date/time combos
    const allDates = group.map(e => ({
      date: e.date,
      time: e.time,
      id: e.id,
    }));
    
    // Use the earliest occurrence as the primary card
    const primary = { ...group[0] };
    primary.allDates = allDates;
    primary.hasMultipleDates = true;
    primary.dateCount = allDates.length;
    
    // Collect all IDs so swiping marks all occurrences as seen
    primary.groupedIds = group.map(e => e.id);
    
    result.push(primary);
  }
  
  return result;
};

// All valid filter category IDs
const VALID_FILTER_CATEGORIES = [
  'music', 'food', 'sports', 'arts', 'nightlife', 
  'fitness', 'comedy', 'networking', 'family', 'outdoor'
];

// Categories that the APIs can filter server-side
const API_FILTERABLE_CATEGORIES = ['music', 'sports', 'comedy', 'arts', 'family'];

// Category-specific placeholder images (for events missing images)
const CATEGORY_PLACEHOLDERS = {
  'music': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80',
  'comedy': 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&q=80',
  'sports': 'https://images.unsplash.com/photo-1461896836934-58cd91f22092?w=800&q=80',
  'arts': 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&q=80',
  'nightlife': 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800&q=80',
  'family': 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&q=80',
  'food': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
  'fitness': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
  'networking': 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
  'outdoor': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
  'other': 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80',
};

// Parse date string in multiple formats
const parseEventDate = (dateString) => {
  if (!dateString) return null;
  
  if (dateString.includes('-') && dateString.indexOf('-') === 4) {
    const [year, month, day] = dateString.split('-').map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day);
    }
  }
  
  if (dateString.includes('/')) {
    const [month, day, year] = dateString.split('/').map(Number);
    if (month && day && year) {
      return new Date(year, month - 1, day);
    }
  }
  
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};

// Get time range dates
const getTimeRangeDates = (timeRange) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate = startOfToday;
  let endDate = new Date();
  
  switch (timeRange) {
    case 'today':
      endDate = new Date(startOfToday);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'tomorrow':
      startDate = new Date(startOfToday);
      startDate.setDate(startDate.getDate() + 1);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'week':
      endDate = new Date(startOfToday);
      endDate.setDate(endDate.getDate() + 7);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'weekend':
      const dayOfWeek = now.getDay();
      
      if (dayOfWeek === 0) {
        startDate = startOfToday;
        endDate = new Date(startOfToday);
        endDate.setHours(23, 59, 59, 999);
      } else if (dayOfWeek === 6) {
        startDate = startOfToday;
        endDate = new Date(startOfToday);
        endDate.setDate(endDate.getDate() + 1);
        endDate.setHours(23, 59, 59, 999);
      } else {
        const daysUntilSaturday = 6 - dayOfWeek;
        startDate = new Date(startOfToday);
        startDate.setDate(startDate.getDate() + daysUntilSaturday);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        endDate.setHours(23, 59, 59, 999);
      }
      break;
      
    case 'month':
      endDate = new Date(startOfToday);
      endDate.setMonth(endDate.getMonth() + 1);
      break;
      
    case '3months':
      endDate = new Date(startOfToday);
      endDate.setMonth(endDate.getMonth() + 3);
      break;
      
    case 'year':
      endDate = new Date(startOfToday);
      endDate.setFullYear(endDate.getFullYear() + 1);
      break;
      
    default:
      endDate = new Date(startOfToday);
      endDate.setMonth(endDate.getMonth() + 1);
  }
  
  return { startDate, endDate };
};

// ============================================================
// MAIN FUNCTIONS
// ============================================================

// Save event to user's saved list
export const saveEvent = async (userId, event) => {
  try {
    const userRef = doc(db, 'users', userId);
    const idsToMark = event.groupedIds || [event.id];
    await updateDoc(userRef, {
      savedEvents: arrayUnion(event),
      swipedEvents: arrayUnion(...idsToMark)
    });
    return { success: true };
  } catch (error) {
    console.error('Error saving event:', error);
    return { success: false, error: error.message };
  }
};

// Pass on an event (swipe left) — supports grouped multi-date events
export const passEvent = async (userId, eventId, groupedIds = null) => {
  try {
    const userRef = doc(db, 'users', userId);
    const idsToMark = groupedIds || [eventId];
    await updateDoc(userRef, {
      swipedEvents: arrayUnion(...idsToMark)
    });
    return { success: true };
  } catch (error) {
    console.error('Error passing event:', error);
    return { success: false, error: error.message };
  }
};

// Remove event from user's saved list
export const unsaveEvent = async (userId, eventId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    const savedEvents = userDoc.data()?.savedEvents || [];
    
    const updatedEvents = savedEvents.filter(event => event.id !== eventId);
    
    await updateDoc(userRef, {
      savedEvents: updatedEvents
    });
    return { success: true };
  } catch (error) {
    console.error('Error unsaving event:', error);
    return { success: false, error: error.message };
  }
};

// Get user's saved events
export const getSavedEvents = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    const savedEvents = userDoc.data()?.savedEvents || [];
    return { success: true, events: savedEvents };
  } catch (error) {
    console.error('Error getting saved events:', error);
    return { success: false, error: error.message, events: [] };
  }
};

// Get list of event IDs the user has already swiped
export const getSwipedEventIds = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    return userDoc.data()?.swipedEvents || [];
  } catch (error) {
    console.error('Error getting swiped events:', error);
    return [];
  }
};

// Post a new event
export const postEvent = async (eventData, userId) => {
  try {
    let imageUrl = eventData.image;
    
    if (eventData.imageUri && eventData.imageUri.startsWith('file://')) {
      const uploadResult = await uploadEventImage(eventData.imageUri, userId);
      if (uploadResult.success) {
        imageUrl = uploadResult.url;
      } else {
        console.error('Image upload failed:', uploadResult.error);
      }
    }

    const eventsRef = collection(db, 'events');
    const newEvent = {
      ...eventData,
      image: imageUrl,
      posterId: userId,
      source: 'firebase',
      active: true,
      createdAt: Timestamp.now(),
    };
    
    delete newEvent.imageUri;
    
    const docRef = await addDoc(eventsRef, newEvent);
    return { success: true, eventId: docRef.id };
  } catch (error) {
    console.error('Error posting event:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// GET EVENTS - Now uses Cloud Function with caching
// ============================================================
export const getEvents = async (userId, location, filters = {}) => {
  try {
    console.log('=== getEvents called ===');
    console.log('Filters:', JSON.stringify(filters, null, 2));
    
    // Get Firebase events (user-posted)
    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef, 
      where('active', '==', true),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    let firebaseEvents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      source: 'firebase',
    }));
    console.log(`Firebase events: ${firebaseEvents.length}`);
    
    // ========================================
    // FETCH API EVENTS VIA CLOUD FUNCTION
    // ========================================
    let apiEvents = [];
    
    if (location?.latitude && location?.longitude) {
      const radius = filters?.distance || 50;
      
      try {
        console.log('Calling Cloud Function for cached events...');
        const result = await getEventsForLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          radius: radius,
        });
        
        if (result.data.success) {
          apiEvents = result.data.events || [];
          console.log(`Got ${apiEvents.length} events from Cloud Function (fromCache: ${result.data.fromCache})`);
          
          // Add placeholder images for events missing them
          apiEvents = apiEvents.map(event => ({
            ...event,
            image: event.image || CATEGORY_PLACEHOLDERS[event.category] || CATEGORY_PLACEHOLDERS['other'],
          }));
        }
      } catch (functionError) {
        console.error('Cloud Function error:', functionError);
        // Could fall back to direct API calls here if needed
      }
    }
    
    // ========================================
    // DEDUPLICATION: Across ALL sources
    // ========================================
    let allEvents = [...firebaseEvents, ...apiEvents];
    console.log(`Total events before deduplication: ${allEvents.length}`);
    
    let events = deduplicateEvents(allEvents);
    console.log(`After deduplication: ${events.length} (removed ${allEvents.length - events.length} duplicates)`);
    
    // ========================================
    // FILTER 1: Distance
    // ========================================
    if (location && filters?.distance) {
      const beforeCount = events.length;
      events = events.filter(event => {
        const hasValidCoords = 
          event.latitude != null && 
          event.longitude != null &&
          !isNaN(parseFloat(event.latitude)) && 
          !isNaN(parseFloat(event.longitude));
        
        if (!hasValidCoords) {
          console.log(`Excluding event without valid coords: "${event.title}" (${event.source})`);
          return false;
        }
        
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          parseFloat(event.latitude),
          parseFloat(event.longitude)
        );
        
        event.distance = `${Math.round(distance)} mi`;
        
        if (distance > filters.distance) {
          return false;
        }
        
        return true;
      });
      console.log(`After distance filter: ${events.length} (removed ${beforeCount - events.length})`);
    }
    
    // ========================================
    // FILTER 2: Already swiped
    // ========================================
    if (userId) {
      const beforeCount = events.length;
      const swipedIds = await getSwipedEventIds(userId);
      events = events.filter(event => !swipedIds.includes(event.id));
      console.log(`After swiped filter: ${events.length} (removed ${beforeCount - events.length})`);
    }
    
    // ========================================
    // FILTER 3: Categories
    // ========================================
    const selectedCategories = filters?.categories || [];
    const allCategoriesSelected = selectedCategories.length === 0 || 
                                   selectedCategories.length >= VALID_FILTER_CATEGORIES.length;
    
    if (selectedCategories.length > 0 && !allCategoriesSelected) {
      const beforeCount = events.length;
      
      events = events.filter(event => {
        const eventCategory = (event.category || '').toLowerCase();
        
        if (!eventCategory || eventCategory === 'other') {
          return true;
        }
        
        return selectedCategories.includes(eventCategory);
      });
      
      console.log(`After category filter: ${events.length} (removed ${beforeCount - events.length})`);
    }
    
    // ========================================
    // FILTER 4: Time range
    // ========================================
    if (filters?.timeRange) {
      const beforeCount = events.length;
      const { startDate, endDate } = getTimeRangeDates(filters.timeRange);
      
      console.log(`Time range "${filters.timeRange}": ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      events = events.filter(event => {
        if (!event.date) return false;
        
        const eventDate = parseEventDate(event.date);
        if (!eventDate) {
          return false;
        }
        
        return eventDate >= startDate && eventDate <= endDate;
      });
      
      console.log(`After time filter: ${events.length} (removed ${beforeCount - events.length})`);
    }
    
    // ========================================
    // GROUP: Merge same event with multiple dates
    // ========================================
    {
      const beforeCount = events.length;
      events = groupMultiDateEvents(events);
      const grouped = beforeCount - events.length;
      if (grouped > 0) {
        console.log(`After multi-date grouping: ${events.length} (merged ${grouped} duplicate dates)`);
      }
    }
    
    // ========================================
    // SORT: By date (soonest first)
    // ========================================
    events.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      
      let dateA = parseEventDate(a.date);
      let dateB = parseEventDate(b.date);
      
      if (dateA && a.time) {
        const [hours, minutes] = a.time.split(':').map(Number);
        dateA.setHours(hours || 0, minutes || 0);
      }
      if (dateB && b.time) {
        const [hours, minutes] = b.time.split(':').map(Number);
        dateB.setHours(hours || 0, minutes || 0);
      }
      
      return (dateA || 0) - (dateB || 0);
    });
    
    console.log(`=== Final event count: ${events.length} ===`);
    
    return { success: true, events };
  } catch (error) {
    console.error('Error getting events:', error);
    return { success: false, error: error.message, events: [] };
  }
};

// Get events posted by a specific user
export const getUserEvents = async (userId) => {
  try {
    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef, 
      where('posterId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    return { success: true, events };
  } catch (error) {
    console.error('Error getting user events:', error);
    return { success: false, error: error.message, events: [] };
  }
};

// Delete an event (only allowed by the poster)
export const deleteEvent = async (eventId, userId) => {
  try {
    const eventRef = doc(db, 'events', eventId);
    const eventDoc = await getDoc(eventRef);
    
    if (!eventDoc.exists()) {
      return { success: false, error: i18n.t('errors.eventNotFound') };
    }
    
    if (eventDoc.data().posterId !== userId) {
      return { success: false, error: i18n.t('errors.cannotDeleteOthers') };
    }
    
    await deleteDoc(eventRef);
    return { success: true };
  } catch (error) {
    console.error('Error deleting event:', error);
    return { success: false, error: error.message };
  }
};