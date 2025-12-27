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
import { searchEvents as searchPredictHQ } from './predictHQService';

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
    
    // If there's a local image URI (not a web URL), upload it first
    if (imageUri && !imageUri.startsWith('http')) {
      const tempId = Date.now().toString();
      const uploadResult = await uploadEventImage(imageUri, tempId);
      if (uploadResult.success) {
        imageUrl = uploadResult.url;
      } else {
        // Fall back to placeholder if upload fails
        imageUrl = `https://picsum.photos/400/300?random=${tempId}`;
      }
    }
    
    // Create the event with the final image URL
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
    }));
    
    const radius = filters?.distance || 50;
    const apiOptions = location 
      ? { latitude: location.latitude, longitude: location.longitude, radius }
      : {};
    
    // Fetch from both Ticketmaster and PredictHQ in parallel
    const [tmResult, phqResult] = await Promise.all([
      searchTicketmaster(apiOptions),
      searchPredictHQ(apiOptions),
    ]);
    
    // Add Ticketmaster events
    if (tmResult.success && tmResult.events.length > 0) {
      const existingIds = new Set(events.map(e => e.id));
      const newEvents = tmResult.events.filter(e => !existingIds.has(e.id));
      events = [...events, ...newEvents];
    }
    
    // Add PredictHQ events
    if (phqResult.success && phqResult.events.length > 0) {
      const existingIds = new Set(events.map(e => e.id));
      const newEvents = phqResult.events.filter(e => !existingIds.has(e.id));
      events = [...events, ...newEvents];
    }
    
    // Filter by distance if we have user location
    if (location && filters?.distance) {
      events = events.filter(event => {
        // Skip events without coordinates
        if (!event.latitude || !event.longitude) return true;
        
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          event.latitude,
          event.longitude
        );
        
        // Add distance to event for display
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
          // Find next Sunday
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
        if (!event.date) return true; // Keep events without dates
        const eventDate = new Date(event.date);
        return eventDate >= now && eventDate <= endDate;
      });
    }
    
    // Sort events by date (soonest first)
    events.sort((a, b) => {
      // Events without dates go to the end
      if (!a.date) return 1;
      if (!b.date) return -1;
      
      const dateA = new Date(a.date + (a.time ? `T${a.time}` : ''));
      const dateB = new Date(b.date + (b.time ? `T${b.time}` : ''));
      
      return dateA - dateB;
    });
    
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