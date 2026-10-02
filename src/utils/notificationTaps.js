import * as Notifications from 'expo-notifications';

/**
 * The most recently tapped notification (cold start or while running), or
 * undefined. A wrapper so the web build can swap in a version without
 * expo-notifications, which has no web implementation of this.
 */
export const useLastNotificationTap = () => Notifications.useLastNotificationResponse();
