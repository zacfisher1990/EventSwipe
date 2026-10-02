// appUpdateService.js
// Tells the app when a newer store build exists. Driven by one Firestore doc,
// config/appUpdate, written by `node scripts/update-banner.mjs`:
//
//   { ios:     { latestVersion: '1.0.28', minVersion: '1.0.25' },
//     android: { latestVersion: '1.0.28' },
//     message: 'optional text shown instead of the default' }
//
//   below minVersion    -> 'required'  (blocking screen)
//   below latestVersion -> 'available' (dismissible banner)

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { APP_STORE_URL, PLAY_STORE_URL } from '../config/storeLinks';

/** Compare dotted versions numerically: -1, 0 or 1. Missing parts count as 0. */
export const compareVersions = (a, b) => {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
};

/** @returns {'required' | 'available' | 'none'} */
export const updateStatusFor = (currentVersion, platformConfig) => {
  if (!currentVersion || !platformConfig) return 'none';
  const { minVersion, latestVersion } = platformConfig;
  if (minVersion && compareVersions(currentVersion, minVersion) < 0) return 'required';
  if (latestVersion && compareVersions(currentVersion, latestVersion) < 0) return 'available';
  return 'none';
};

export const storeUrl = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;

/** Never throws: any failure just means no banner. */
export const checkForAppUpdate = async () => {
  try {
    if (Platform.OS === 'web') return { status: 'none' };
    const snapshot = await getDoc(doc(db, 'config', 'appUpdate'));
    const config = snapshot.data();
    return {
      status: updateStatusFor(Application.nativeApplicationVersion, config?.[Platform.OS]),
      message: typeof config?.message === 'string' && config.message ? config.message : null,
    };
  } catch {
    return { status: 'none' };
  }
};
