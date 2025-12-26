import { doc, updateDoc, arrayUnion, arrayRemove, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const saveEvent = async (userId, event) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      savedEvents: arrayUnion(event)
    });
    return { success: true };
  } catch (error) {
    console.error('Error saving event:', error);
    return { success: false, error: error.message };
  }
};

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