// Opens web links inside the app (Safari View Controller on iOS, Chrome Custom
// Tabs on Android) so buying tickets doesn't send people out of EventSwipe.

import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { trackTicketTap } from '../services/analyticsService';

// "Some Band - Live at The Venue" -> "Some Band", for ticket-site searches
const searchTitle = (title) =>
  (title || '').split(' - ')[0].split(' at ')[0].split(' @ ')[0].trim();

/** The event's own ticket link, or a search for it on the source's site. */
export const ticketUrlFor = (event) => {
  if (event.ticketUrl) {
    // User-posted links may be missing the scheme ("example.com/tickets")
    return /^[a-z][a-z0-9+.-]*:/i.test(event.ticketUrl) ? event.ticketUrl : `https://${event.ticketUrl}`;
  }
  if (event.source === 'ticketmaster') {
    return `https://www.ticketmaster.com/search?q=${encodeURIComponent(searchTitle(event.title))}`;
  }
  if (event.source === 'seatgeek') {
    return `https://seatgeek.com/search?search=${encodeURIComponent(searchTitle(event.title))}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`${event.title} ${event.city || ''} tickets`)}`;
};

export const openInApp = async (url) => {
  try {
    // The in-app browser only handles web pages
    if (!/^https?:\/\//i.test(url)) throw new Error('not a web url');
    await WebBrowser.openBrowserAsync(url, { controlsColor: '#4ECDC4' });
  } catch {
    Linking.openURL(url).catch(() => {});
  }
};

export const openTickets = (event) => {
  trackTicketTap(event); // fire and forget
  return openInApp(ticketUrlFor(event));
};
