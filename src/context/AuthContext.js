import React, { createContext, useState, useContext, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import i18n from '../i18n';

// Map Firebase error codes to translated messages
const getAuthErrorMessage = (error) => {
  const errorCode = error.code || '';
  const errorMap = {
    'auth/wrong-password': i18n.t('errors.wrongPassword'),
    'auth/invalid-credential': i18n.t('errors.wrongPassword'),
    'auth/user-not-found': i18n.t('errors.userNotFound'),
    'auth/email-already-in-use': i18n.t('errors.emailInUse'),
    'auth/invalid-email': i18n.t('errors.invalidEmail'),
    'auth/weak-password': i18n.t('errors.weakPassword'),
    'auth/too-many-requests': i18n.t('errors.tooManyRequests'),
    'auth/network-request-failed': i18n.t('errors.networkFailed'),
  };
  return errorMap[errorCode] || i18n.t('errors.generic');
};

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Get additional user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          ...userDoc.data(),
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error) {
      return { success: false, error: getAuthErrorMessage(error) };
    }
  };

  const signUp = async (email, password) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create user document in Firestore
      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        createdAt: new Date().toISOString(),
        savedEvents: [],
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: getAuthErrorMessage(error) };
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);