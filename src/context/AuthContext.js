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
  OAuthProvider,
  GoogleAuthProvider,
  signInWithCredential,
  reauthenticateWithCredential,
  revokeAccessToken,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import i18n from '../i18n';
import { perfMark } from '../utils/perf';
import { syncNotifications, detachDevice } from '../services/notificationService';
import { getAppleCredential, getGoogleCredential, signOutGoogle } from '../services/socialAuth';

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

// Remove a guest account that's been merged into a real one. Must NOT use
// deleteUser(guest): the SDK's delete ends with auth.signOut(), which would
// sign out the account the user just signed in to. The REST call deletes only
// the account the token belongs to; the onUserDeleted Cloud Function then
// removes its users doc.
const deleteGuestAccount = async (guestIdToken) => {
  if (!guestIdToken) return;
  try {
    await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${auth.app.options.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: guestIdToken }),
    });
  } catch {
    // Best effort — an orphaned guest account is harmless
  }
};

// Snapshot a guest's data and token before switching to another account
const captureGuest = async () => {
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  if (!guest) return null;
  return {
    data: (await getDoc(doc(db, 'users', guest.uid)).catch(() => null))?.data(),
    idToken: await guest.getIdToken().catch(() => null),
  };
};

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
          // 'password' | 'apple.com' | 'google.com' (undefined for guests)
          providerId: firebaseUser.providerData[0]?.providerId,
          ...userDoc.data(),
        });
        // For the admin dashboard; fire and forget
        setDoc(doc(db, 'users', firebaseUser.uid), {
          platform: Platform.OS,
          osVersion: String(Platform.Version),
          lastActiveAt: serverTimestamp(),
        }, { merge: true }).catch(() => {});
        syncNotifications(firebaseUser.uid);
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
      const guest = await captureGuest();

      const result = await signInWithEmailAndPassword(auth, email, password);

      if (guest) {
        await mergeGuestData(result.user.uid, guest.data).catch(e => console.log('Guest merge failed:', e));
        deleteGuestAccount(guest.idToken);
      }
      setAuthPrompt(null);
      return { success: true };
    } catch (error) {
      return { success: false, error: getAuthErrorMessage(error) };
    }
  };

  // Finish an Apple/Google sign-in. A guest is upgraded in place (same uid, so
  // swipes and saves carry over). If that Apple/Google identity already has an
  // EventSwipe account, sign in to it and merge the guest's data instead.
  const completeProviderSignIn = async (credential) => {
    const current = auth.currentUser;
    if (!current?.isAnonymous) {
      await signInWithCredential(auth, credential);
      return;
    }

    try {
      const result = await linkWithCredential(current, credential);
      // Refresh the token so security rules stop seeing an anonymous sign-in
      await result.user.getIdToken(true);
      if (result.user.email) {
        await setDoc(doc(db, 'users', result.user.uid), { email: result.user.email }, { merge: true });
      }
      // Linking doesn't fire onAuthStateChanged
      setUser(prev => ({
        ...prev,
        email: result.user.email,
        isAnonymous: false,
        providerId: credential.providerId,
      }));
    } catch (error) {
      if (error.code !== 'auth/credential-already-in-use' && error.code !== 'auth/email-already-in-use') {
        throw error;
      }
      // Apple tokens are single-use: the error carries a fresh credential
      const existing = OAuthProvider.credentialFromError(error)
        || GoogleAuthProvider.credentialFromError(error)
        || credential;
      const guest = await captureGuest();
      const result = await signInWithCredential(auth, existing);
      await mergeGuestData(result.user.uid, guest?.data).catch(e => console.log('Guest merge failed:', e));
      deleteGuestAccount(guest?.idToken);
    }
  };

  const signInWithProvider = async (getCredential) => {
    try {
      const result = await getCredential();
      if (!result) return { success: false, cancelled: true };
      await completeProviderSignIn(result.credential);
      setAuthPrompt(null);
      return { success: true };
    } catch (error) {
      console.error('Provider sign-in failed:', error?.code, error?.message);
      return { success: false, error: getAuthErrorMessage(error) };
    }
  };

  /**
   * Deleting an account needs a recent sign-in. For Apple/Google accounts,
   * re-confirm with the provider first; Apple also requires its token to be
   * revoked when the account is deleted. Returns false if the user cancels.
   */
  const reauthenticateForDeletion = async () => {
    const current = auth.currentUser;
    const providerId = current?.providerData[0]?.providerId;
    if (providerId !== 'apple.com' && providerId !== 'google.com') return true;

    const result = await (providerId === 'apple.com' ? getAppleCredential() : getGoogleCredential());
    if (!result) return false;
    await reauthenticateWithCredential(current, result.credential);
    if (result.authorizationCode) {
      // Needs the Apple key configured on the Firebase Apple provider
      await revokeAccessToken(auth, result.authorizationCode)
        .catch(e => console.warn('Apple token revocation failed:', e?.code));
    }
    return true;
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
      await detachDevice(auth.currentUser?.uid);
      await signOutGoogle();
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
      signInWithApple: () => signInWithProvider(getAppleCredential),
      signInWithGoogle: () => signInWithProvider(getGoogleCredential),
      reauthenticateForDeletion,
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