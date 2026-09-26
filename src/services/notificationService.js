// notificationService.js
// Saved-event reminders are scheduled locally on the device; the weekend
// roundup is sent by the weekendRoundup Cloud Function to the Expo push token
// stored on the user doc.

import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';
import { parseEventDate } from '../utils/dates';
import i18n from '../i18n';

const EAS_PROJECT_ID = 'cf67b665-3e15-4bd7-a8b9-a477c2f5711e'; // app.config.js extra.eas.projectId
const ENABLED_KEY = 'notifications_enabled';
const PREPROMPT_KEY = 'notifications_preprompt_shown';
const REMINDER_PREFIX = 'reminder-';
// iOS keeps at most 64 pending local notifications
const MAX_REMINDERS = 60;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// The user's in-app choice (separate from the OS permission)
let enabledCache = null;
export const isEnabled = async () => {
  if (enabledCache === null) {
    try {
      enabledCache = (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
    } catch {
      enabledCache = false;
    }
  }
  return enabledCache;
};

const setEnabled = async (value) => {
  enabledCache = value;
  try {
    await AsyncStorage.setItem(ENABLED_KEY, String(value));
  } catch {
    // Non-critical
  }
};

// Android 13+ only shows the permission prompt once a channel exists
const ensureChannel = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'EventSwipe',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
};

export const hasPermission = async () =>
  (await Notifications.getPermissionsAsync()).status === 'granted';

const registerForPush = async (uid) => {
  try {
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    await setDoc(doc(db, 'users', uid), {
      pushToken,
      notificationsEnabled: true,
      timeZone: Localization.getCalendars()?.[0]?.timeZone || null,
      language: i18n.locale,
    }, { merge: true });
  } catch (error) {
    // Reminders are local and still work without a push token
    console.log('Push registration failed:', error?.message);
  }
};

// ---- Search area for the weekend roundup ----

// Rounded to 0.1° (~7 miles) — the same precision the Ticketmaster cache uses,
// and all the roundup needs to count nearby events.
let currentArea = null;
let writtenArea = null;

const writeSearchArea = async (uid) => {
  if (!uid || !currentArea) return;
  const key = `${uid}:${JSON.stringify(currentArea)}`;
  if (key === writtenArea) return;
  writtenArea = key;
  await setDoc(doc(db, 'users', uid), { searchArea: currentArea }, { merge: true }).catch(() => {});
};

/** Called after each event fetch with the user's own (not a browsed city's) location. */
export const updateSearchArea = async (uid, location, radius) => {
  if (!location) return;
  currentArea = {
    lat: Math.round(location.latitude * 10) / 10,
    lng: Math.round(location.longitude * 10) / 10,
    radius,
  };
  if (await isEnabled()) await writeSearchArea(uid);
};

// ---- Saved-event reminders ----

// Morning events: the evening before at 6pm. Otherwise: 10am on the day.
const reminderFor = (event) => {
  const day = parseEventDate(event.date);
  if (!day) return null;
  const hour = parseInt((event.time || '').split(':')[0], 10);
  const eveBefore = Number.isFinite(hour) && hour < 12;
  const at = new Date(day);
  if (eveBefore) {
    at.setDate(at.getDate() - 1);
    at.setHours(18, 0, 0, 0);
  } else {
    at.setHours(10, 0, 0, 0);
  }
  return at > new Date() ? { at, eveBefore } : null;
};

const scheduleReminder = async (event, reminder) => {
  await Notifications.scheduleNotificationAsync({
    identifier: `${REMINDER_PREFIX}${event.id}`,
    content: {
      title: i18n.t(reminder.eveBefore ? 'notifications.reminderTomorrow' : 'notifications.reminderToday', {
        title: event.title,
      }),
      body: [event.time, event.location].filter(Boolean).join(' · '),
      data: { screen: 'Saved', eventId: event.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at },
  });
};

export const scheduleEventReminder = async (event) => {
  try {
    if (!(await isEnabled())) return;
    const reminder = reminderFor(event);
    if (reminder) await scheduleReminder(event, reminder);
  } catch (error) {
    console.log('Could not schedule reminder:', error?.message);
  }
};

export const cancelEventReminder = async (eventId) => {
  try {
    await Notifications.cancelScheduledNotificationAsync(`${REMINDER_PREFIX}${eventId}`);
  } catch {
    // Nothing scheduled
  }
};

// Rebuild reminders from the user's saved events (sign-in, account switch,
// enabling notifications).
const rescheduleReminders = async (uid) => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(n => n.identifier.startsWith(REMINDER_PREFIX))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  const saved = (await getDoc(doc(db, 'users', uid))).data()?.savedEvents || [];
  const upcoming = saved
    .map(event => ({ event, reminder: reminderFor(event) }))
    .filter(x => x.reminder)
    .sort((a, b) => a.reminder.at - b.reminder.at)
    .slice(0, MAX_REMINDERS);
  await Promise.all(upcoming.map(x => scheduleReminder(x.event, x.reminder).catch(() => {})));
};

// ---- Turning notifications on/off ----

/** Returns true if notifications ended up on. */
export const enableNotifications = async (uid) => {
  await ensureChannel();
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && canAskAgain) {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return false;

  await setEnabled(true);
  await registerForPush(uid);
  await writeSearchArea(uid);
  await rescheduleReminders(uid).catch(() => {});
  return true;
};

export const disableNotifications = async (uid) => {
  await setEnabled(false);
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  if (uid) {
    await setDoc(doc(db, 'users', uid), {
      notificationsEnabled: false,
      pushToken: deleteField(),
      searchArea: deleteField(),
    }, { merge: true }).catch(() => {});
  }
  writtenArea = null;
};

/** On sign-in / app start: refresh the push token and reminders for this user. */
export const syncNotifications = async (uid) => {
  try {
    if (!(await isEnabled()) || !(await hasPermission())) return;
    await registerForPush(uid);
    await writeSearchArea(uid);
    await rescheduleReminders(uid);
  } catch (error) {
    console.log('Notification sync failed:', error?.message);
  }
};

/** Before sign-out: stop this device getting the old account's notifications. */
export const detachDevice = async (uid) => {
  writtenArea = null;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  if (uid) {
    await setDoc(doc(db, 'users', uid), { pushToken: deleteField() }, { merge: true }).catch(() => {});
  }
};

/**
 * Offer notifications once, after a save. Explains the value before the OS
 * prompt, which can only be shown once on iOS.
 */
export const maybeOfferNotifications = async (uid) => {
  try {
    if (await isEnabled()) return;
    if (await AsyncStorage.getItem(PREPROMPT_KEY)) return;
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && !canAskAgain) return;
    await AsyncStorage.setItem(PREPROMPT_KEY, String(Date.now()));

    Alert.alert(
      i18n.t('notifications.offerTitle'),
      i18n.t('notifications.offerBody'),
      [
        { text: i18n.t('auth.notNow'), style: 'cancel' },
        { text: i18n.t('notifications.turnOn'), onPress: () => enableNotifications(uid) },
      ]
    );
  } catch {
    // Never block saving on this
  }
};
