// Web build: the native Apple / Google sign-in sheets don't exist in a
// browser, so the buttons are hidden and the web version uses guest browsing
// and email sign-in. Same exports as socialAuth.js.

export const appleSignInAvailable = false;
export const googleSignInAvailable = false;
export const getAppleCredential = async () => null;
export const getGoogleCredential = async () => null;
export const signOutGoogle = async () => {};
