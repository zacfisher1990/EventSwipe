'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Same public web config the mobile app uses (src/config/firebase.js).
const firebaseConfig = {
  apiKey: 'AIzaSyCsdUzbuv5rgMwJ2_NuzK68DkLFYlZ9Up4',
  authDomain: 'eventswipe-6a924.firebaseapp.com',
  projectId: 'eventswipe-6a924',
  appId: '1:989696282130:web:370020cc6ad89982e8d2cb',
};

const app = getApps()[0] || initializeApp(firebaseConfig);
export const auth = getAuth(app);
