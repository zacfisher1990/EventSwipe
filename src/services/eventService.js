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
  Timestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { uploadEventImage } from './storageService';
import { searchEvents as searchTicketmaster } from './ticketmasterService';
import { searchEvents as searchSeatGeek } from './seatgeekService';

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

// Normalize string for comparison (remove special chars, lowercase, trim)
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
  // Must be on the same date
  if (event1.date !== event2.date) return false;
  
  // Compare venue names (normalized)
  const venue1 = normalizeString(event1.location || event1.venueName);
  const venue2 = normalizeString(event2.location || event2.venueName);
  
  // If venues match and same date, likely duplicate
  if (venue1 && venue2 && venue1 === venue2) {
    // Also check if titles are similar
    const title1 = normalizeString(event1.title);
    const title2 = normalizeString(event2.title);
    
    // Check if one title contains the other (handles "Artist" vs "Artist at Venue")
    if (title1.includes(title2) || title2.includes(title1)) {
      return true;
    }
    
    // Check for significant word overlap
    const words1 = title1.split(' ').filter(w => w.length > 3);
    const words2 = title2.split(' ').filter(w => w.length > 3);
    const commonWords = words1.filter(w => words2.includes(w));
    
    if (commonWords.length >= 2 || (commonWords.length >= 1 && words1.length <= 3)) {
      return true;
    }
  }
  
  return false;
};

// Remove duplicates, preferring Ticketmaster events
const deduplicateEvents = (events) => {
  const result = [];
  const seen = new Set();
  
  // Sort so Ticketmaster comes first (we prefer TM data quality)
  const sorted = [...events].sort((a, b) => {
    if (a.source === 'ticketmaster' && b.source !== 'ticketmaster') return -1;
    if (a.source !== 'ticketmaster' && b.source === 'ticketmaster') return 1;
    return 0;
  });
  
  for (const event of sorted) {
    // Check if this event is a duplicate of any we've already added
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

// Save event to user's saved list
export const saveEvent = async (userId, event) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      savedEvents: arrayUnion(event),
      swipedEvents: arrayUnion(event.id)
    });
    return { success: true };
  } catch (error) {
    console.error('Error saving event:', error);
    return { success: false, error: error.message };
  }
};

// Pass on an event (swipe left)
export const passEvent = async (userId, eventId) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      swipedEvents: arrayUnion(eventId)
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
    return userDoc.data()?.savedEvents || [];
  } catch (error) {
    console.error('Error getting saved events:', error);
    return [];
  }
};

// Get user's swiped event IDs
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

// Create a new event
export const createEvent = async (eventData, userId, imageUri = null) => {
  try {
    const eventsRef = collection(db, 'events');
    
    let imageUrl = eventData.image;
    
    if (imageUri && !imageUri.startsWith('http')) {
      const tempId = Date.now().toString();
      const uploadResult = await uploadEventImage(imageUri, tempId);
      if (uploadResult.success) {
        imageUrl = uploadResult.url;
      } else {
        imageUrl = `https://picsum.photos/400/300?random=${tempId}`;
      }
    }
    
    const newEvent = {
      ...eventData,
      image: imageUrl,
      posterId: userId,
      createdAt: Timestamp.now(),
      active: true,
    };
    
    const docRef = await addDoc(eventsRef, newEvent);
    
    return { success: true, eventId: docRef.id };
  } catch (error) {
    console.error('Error creating event:', error);
    return { success: false, error: error.message };
  }
};

// Get all active events (excluding ones user has swiped)
export const getEvents = async (userId = null, location = null, filters = null) => {
  try {
    // Get Firebase events (user-posted)
    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef, 
      where('active', '==', true),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    let events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      source: 'firebase',
    }));
    
    // Fetch from both Ticketmaster and SeatGeek in parallel
    const radius = filters?.distance || 50;
    const apiOptions = location 
      ? { latitude: location.latitude, longitude: location.longitude, radius }
      : {};
    
    const [tmResult, sgResult] = await Promise.all([
      searchTicketmaster(apiOptions),
      searchSeatGeek(apiOptions),
    ]);
    
    // Collect API events for deduplication
    let apiEvents = [];
    
    // Add Ticketmaster events
    if (tmResult.success && tmResult.events.length > 0) {
      console.log(`Found ${tmResult.events.length} events from Ticketmaster`);
      apiEvents = [...apiEvents, ...tmResult.events];
    } else if (tmResult.error) {
      console.error('Ticketmaster error:', tmResult.error);
    }
    
    // Add SeatGeek events
    if (sgResult.success && sgResult.events.length > 0) {
      console.log(`Found ${sgResult.events.length} events from SeatGeek`);
      apiEvents = [...apiEvents, ...sgResult.events];
    } else if (sgResult.error) {
      console.error('SeatGeek error:', sgResult.error);
    }
    
    // Deduplicate API events (Ticketmaster preferred)
    const deduplicatedApiEvents = deduplicateEvents(apiEvents);
    console.log(`After deduplication: ${deduplicatedApiEvents.length} API events (removed ${apiEvents.length - deduplicatedApiEvents.length} duplicates)`);
    
    // Merge with Firebase events
    const existingIds = new Set(events.map(e => e.id));
    const newEvents = deduplicatedApiEvents.filter(e => !existingIds.has(e.id));
    events = [...events, ...newEvents];
    
    // Filter by distance if we have user location
    if (location && filters?.distance) {
      events = events.filter(event => {
        if (!event.latitude || !event.longitude) {
          // Firebase events without coords - exclude since we can't verify distance
          if (event.source === 'firebase') return false;
          // API events were already filtered by the API
          return true;
        }
        
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          event.latitude,
          event.longitude
        );
        
        event.distance = `${Math.round(distance)} mi`;
        return distance <= filters.distance;
      });
    }
    
    // Filter out events the user has already swiped on
    if (userId) {
      const swipedIds = await getSwipedEventIds(userId);
      events = events.filter(event => !swipedIds.includes(event.id));
    }
    
    // Apply category filters
    if (filters?.categories && filters.categories.length > 0) {
      events = events.filter(event => {
        const eventCategory = (event.category || '').toLowerCase();
        return filters.categories.includes(eventCategory);
      });
    }
    
    // Apply time range filter
    if (filters?.timeRange) {
      const now = new Date();
      let endDate = new Date();
      
      switch (filters.timeRange) {
        case 'today':
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'tomorrow':
          endDate.setDate(endDate.getDate() + 1);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'week':
          endDate.setDate(endDate.getDate() + 7);
          break;
        case 'weekend':
          const daysUntilSunday = 7 - now.getDay();
          endDate.setDate(endDate.getDate() + daysUntilSunday);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'month':
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case '3months':
          endDate.setMonth(endDate.getMonth() + 3);
          break;
        case 'year':
          endDate.setFullYear(endDate.getFullYear() + 1);
          break;
        default:
          endDate.setMonth(endDate.getMonth() + 1);
      }
      
      events = events.filter(event => {
        if (!event.date) return true;
        const eventDate = new Date(event.date);
        return eventDate >= now && eventDate <= endDate;
      });
    }
    
    // Sort events by date (soonest first)
    events.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      const dateA = new Date(a.date + (a.time ? `T${a.time}` : ''));
      const dateB = new Date(b.date + (b.time ? `T${b.time}` : ''));
      return dateA - dateB;
    });
    
    console.log(`Total events to show: ${events.length}`);
    
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