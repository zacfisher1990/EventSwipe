import React, { createContext, useState, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInAnonymously,
  linkWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import i18n from '../i18n';
import { perfMark } from '../utils/perf';

// Map Firebase error codes to translated messages
const getAuthErrorMessage = (error) => {
  const errorCode = error.code || '';
  const errorMap = {
    'auth/wrong-password': i18n.t('errors.wrongPassword'),
    'auth/invalid-credential': i18n.t('errors.wrongPassword'),
    'auth/user-not-found': i18n.t('errors.userNotFound'),
    'auth/email-already-in-use': i18n.t('errors.emailInUse'),
    'auth/credential-already-in-use': i18n.t('errors.emailInUse'),
    'auth/invalid-email': i18n.t('errors.invalidEmail'),
    'auth/weak-password': i18n.t('errors.weakPassword'),
    'auth/too-many-requests': i18n.t('errors.tooManyRequests'),
    'auth/network-request-failed': i18n.t('errors.networkFailed'),
  };
  return errorMap[errorCode] || i18n.t('errors.generic');
};

const AuthContext = createContext({});

// Carry a guest's saves/swipes into the account they just signed in to.
const mergeGuestData = async (uid, guestData) => {
  const saved = guestData?.savedEvents || [];
  const swiped = guestData?.swipedEvents || [];
  if (!saved.length && !swiped.length) return;

  const ref = doc(db, 'users', uid);
  const existing = (await getDoc(ref)).data()?.savedEvents || [];
  const existingIds = new Set(existing.map(e => e.id));
  const newSaved = saved.filter(e => !existingIds.has(e.id));

  await updateDoc(ref, {
    ...(newSaved.length && { savedEvents: arrayUnion(...newSaved) }),
    ...(swiped.length && { swipedEvents: arrayUnion(...swiped) }),
    swipeCount: increment(guestData.swipeCount || 0),
    rightSwipes: increment(guestData.rightSwipes || 0),
    leftSwipes: increment(guestData.leftSwipes || 0),
  });
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Set when guest sign-in isn't possible (e.g. anonymous auth disabled or
  // offline on first launch) — the app then falls back to the sign-in screen.
  const [guestUnavailable, setGuestUnavailable] = useState(false);
  // { reason, mode } while the account sheet is open
  const [authPrompt, setAuthPrompt] = useState(null);

  useEffect(() => {
    perfMark('auth:listener-attached');

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Fires once firebase has read persisted credentials out of AsyncStorage.
      perfMark('auth:state-restored', { hasUser: !!firebaseUser });

      if (firebaseUser) {
        // Get additional user data from Firestore
        perfMark('auth:userdoc-request-sent');
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);
        perfMark('auth:userdoc-response-received', { exists: userDoc.exists() });
        if (!userDoc.exists()) {
          // New guests need a doc before their first swipe (swipes use updateDoc)
          await setDoc(userRef, {
            createdAt: new Date().toISOString(),
            savedEvents: [],
            ...(firebaseUser.email && { email: firebaseUser.email }),
          }, { merge: true }).catch(() => {});
        }
        setGuestUnavailable(false);
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          isAnonymous: firebaseUser.isAnonymous,
          ...userDoc.data(),
        });
        // For the admin dashboard; fire and forget
        setDoc(doc(db, 'users', firebaseUser.uid), {
          platform: Platform.OS,
          osVersion: String(Platform.Version),
          lastActiveAt: serverTimestamp(),
        }, { merge: true }).catch(() => {});
      } else {
        setUser(null);
        // Let people browse before signing up: start a guest session. The
        // listener fires again with the guest user.
        try {
          await signInAnonymously(auth);
          return;
        } catch (error) {
          console.log('Guest sign-in unavailable:', error.code);
          setGuestUnavailable(true);
        }
      }
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email, password) => {
    try {
      const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
      const guestData = guest
        ? (await getDoc(doc(db, 'users', guest.uid)).catch(() => null))?.data()
        : null;

      const result = await signInWithEmailAndPassword(auth, email, password);

      if (guest) {
        await mergeGuestData(result.user.uid, guestData).catch(e => console.log('Guest merge failed:', e));
        // The deleteUser Cloud Function trigger removes the guest's users doc
        deleteUser(guest).catch(() => {});
      }
      setAuthPrompt(null);
      return { success: true };
    } catch (error) {
      return { success: false, error: getAuthErrorMessage(error) };
    }
  };

  const signUp = async (email, password) => {
    try {
      const current = auth.currentUser;
      if (current?.isAnonymous) {
        // Upgrade the guest in place: same uid, so swipes and saves carry over
        const result = await linkWithCredential(current, EmailAuthProvider.credential(email, password));
        // Refresh the token so security rules see a password (not anonymous) sign-in
        await result.user.getIdToken(true);
        await setDoc(doc(db, 'users', result.user.uid), { email: result.user.email }, { merge: true });
        // Linking doesn't fire onAuthStateChanged
        setUser(prev => ({ ...prev, email: result.user.email, isAnonymous: false }));
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);

        // Create user document in Firestore
        await setDoc(doc(db, 'users', result.user.uid), {
          email: result.user.email,
          createdAt: new Date().toISOString(),
          savedEvents: [],
        }, { merge: true });
      }

      setAuthPrompt(null);
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
    <AuthContext.Provider value={{
      user,
      isLoading,
      guestUnavailable,
      signIn,
      signUp,
      signOut,
      authPrompt,
      // reason: 'save' | 'post' | null; mode: 'signup' | 'login'
      requireAccount: (reason = null, mode = 'signup') => setAuthPrompt({ reason, mode }),
      closeAuthPrompt: () => setAuthPrompt(null),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);