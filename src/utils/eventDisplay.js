// Optional fields a backend source can set on an event (all default to the
// normal dated-event behaviour when absent):
//   ongoing: true   — no fixed date (tours, attractions). Skips the date
//                     filter and reminders; shown as "Available daily".
//   dateText        — text to show instead of that default, e.g. "Daily · 2 hours"
//   ctaType: 'book' — ticket button reads "Book now" (localised)
//   ctaLabel        — exact button text, overrides ctaType (not localised)
//   attribution     — line shown in the details sheet, e.g. "Powered by Viator"

import i18n from '../i18n';
import { formatEventDateTime } from './dates';

export const isOngoing = (event) => event?.ongoing === true;

/** The date line for cards and lists. */
export const eventDateText = (event) => {
  if (isOngoing(event)) return event.dateText || i18n.t('discover.availableDaily');
  return formatEventDateTime(event.date, event.time);
};

/** Label for the ticket/booking button; `fallback` is the screen's usual text. */
export const ticketButtonLabel = (event, fallback) => {
  if (event.ctaLabel) return event.ctaLabel;
  if (event.ctaType === 'book') return i18n.t('eventDetails.bookNow');
  return fallback;
};
