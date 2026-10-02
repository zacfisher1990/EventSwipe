// Web build: there are no push notifications or local reminders in a browser.
// Same exports as notificationService.js, all doing nothing.

export const isEnabled = async () => false;
export const hasPermission = async () => false;
export const updateSearchArea = async () => {};
export const scheduleEventReminder = async () => {};
export const cancelEventReminder = async () => {};
export const enableNotifications = async () => false;
export const disableNotifications = async () => {};
export const syncNotifications = async () => {};
export const detachDevice = async () => {};
export const maybeOfferNotifications = async () => {};
