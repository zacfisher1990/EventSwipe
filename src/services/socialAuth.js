// socialAuth.js
// Gets Firebase credentials from the native Apple / Google sign-in sheets.
// Each getter resolves to null if the user cancels.

import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { WEB_CLIENT_ID, IOS_CLIENT_ID } from '../config/googleSignIn';

export const appleSignInAvailable = Platform.OS === 'ios';
export const googleSignInAvailable = Platform.OS !== 'web' && !!WEB_CLIENT_ID;

if (googleSignInAvailable) {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    ...(IOS_CLIENT_ID && { iosClientId: IOS_CLIENT_ID }),
  });
}

/** @returns {{ credential, authorizationCode } | null} */
export const getAppleCredential = async () => {
  // Apple signs the SHA-256 of the nonce into the token; Firebase checks it
  // against the raw value so a captured token can't be replayed.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  try {
    const result = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    const credential = new OAuthProvider('apple.com').credential({
      idToken: result.identityToken,
      rawNonce,
    });
    return { credential, authorizationCode: result.authorizationCode };
  } catch (error) {
    if (error.code === 'ERR_REQUEST_CANCELED') return null;
    throw error;
  }
};

/** @returns {{ credential } | null} */
export const getGoogleCredential = async () => {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    return { credential: GoogleAuthProvider.credential(response.data.idToken) };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw error;
  }
};

/** So the next Google sign-in shows the account chooser again. */
export const signOutGoogle = async () => {
  if (!googleSignInAvailable) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google
  }
};
