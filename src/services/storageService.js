import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

export const uploadEventImage = async (uri, eventId) => {
  try {
    // Fetch the image and convert to blob
    const response = await fetch(uri);
    const blob = await response.blob();
    
    // Create a unique filename
    const filename = `events/${eventId}_${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);
    
    // Upload the image
    await uploadBytes(storageRef, blob);
    
    // Get the download URL
    const downloadURL = await getDownloadURL(storageRef);
    
    return { success: true, url: downloadURL };
  } catch (error) {
    console.error('Error uploading image:', error);
    return { success: false, error: error.message };
  }
};