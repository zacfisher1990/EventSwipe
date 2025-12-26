import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyCsdUzbuv5rgMwJ2_NuzK68DkLFYlZ9Up4",
  authDomain: "eventswipe-6a924.firebaseapp.com",
  projectId: "eventswipe-6a924",
  storageBucket: "eventswipe-6a924.firebasestorage.app",
  messagingSenderId: "989696282130",
  appId: "1:989696282130:web:370020cc6ad89982e8d2cb",
  measurementId: "G-DQ2JYDJ2PR"
};

const app = initializeApp(firebaseConfig);

let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;