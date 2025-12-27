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
import { searchEvents } from './ticketmasterService';

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
    
    
    
    // Always fetch from Ticketmaster to supplement
    const radius = filters?.distance || 50;
    const tmOptions = location 
      ? { latitude: location.latitude, longitude: location.longitude, radius }
      : {};
    
    const tmResult = await searchEvents(tmOptions);
    
    
    if (tmResult.success && tmResult.events.length > 0) {
      const existingIds = new Set(events.map(e => e.id));
      const newEvents = tmResult.events.filter(e => !existingIds.has(e.id));
      events = [...events, ...newEvents];
      
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