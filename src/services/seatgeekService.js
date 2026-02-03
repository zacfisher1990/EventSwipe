import { Platform } from 'react-native';
import i18n from '../i18n';

const SEATGEEK_CLIENT_ID = process.env.EXPO_PUBLIC_SEATGEEK_CLIENT_ID;
const BASE_URL = 'https://api.seatgeek.com/2';

// SeatGeek taxonomy IDs for filtering at API level
const TAXONOMY_IDS = {
  'music': 'concert',
  'sports': 'sports',
  'comedy': 'comedy',
  'arts': 'theater',
  'family': 'family',
};

// Map SeatGeek taxonomies to your app's filter IDs
const CATEGORY_MAP = {
  'concert': 'music',
  'concerts': 'music',
  'music_festival': 'music',
  'sports': 'sports',
  'nfl': 'sports',
  'mlb': 'sports',
  'nba': 'sports',
  'nhl': 'sports',
  'mls': 'sports',
  'ncaa_football': 'sports',
  'ncaa_basketball': 'sports',
  'soccer': 'sports',
  'hockey': 'sports',
  'baseball': 'sports',
  'basketball': 'sports',
  'football': 'sports',
  'golf': 'sports',
  'tennis': 'sports',
  'wrestling': 'sports',
  'mma': 'sports',
  'boxing': 'sports',
  'racing': 'sports',
  'theater': 'arts',
  'broadway': 'arts',
  'comedy': 'comedy',
  'family': 'family',
  'film': 'arts',
  'literary': 'arts',
  'dance': 'arts',
  'classical': 'music',
  'opera': 'arts',
  'ballet': 'arts',
  'circus': 'family',
};

// Get display category name (localized)
const getCategoryDisplay = (taxonomies, category) => {
  const categoryKey = category || 'other';
  // Map to locale keys
  const keyMap = {
    'music': 'categories.music',
    'sports': 'categories.sports',
    'arts': 'categories.arts',
    'comedy': 'categories.comedy',
    'family': 'categories.family',
    'outdoor': 'categories.outdoor',
    'fitness': 'categories.fitness',
    'food': 'categories.food',
    'networking': 'categories.networking',
    'nightlife': 'categories.nightlife',
    'other': 'categories.event',
  };
  
  const localeKey = keyMap[categoryKey] || 'categories.event';
  return i18n.t(localeKey);
};

// Transform SeatGeek event to your app's format
const transformEvent = (sgEvent) => {
  const venue = sgEvent.venue || {};
  const performers = sgEvent.performers || [];
  const taxonomies = sgEvent.taxonomies || [];
  
  // Get category from taxonomies
  const primaryTaxonomy = taxonomies[0]?.name?.toLowerCase() || '';
  const category = CATEGORY_MAP[primaryTaxonomy] || 'other';
  
  // Get the best image from performers
  const getImage = () => {
    for (const performer of performers) {
      if (performer.image) return performer.image;
      if (performer.images?.huge) return performer.images.huge;
      if (performer.images?.large) return performer.images.large;
    }
    return `https://picsum.photos/400/300?random=${sgEvent.id}`;
  };
  
  // Parse date and time
  const dateTimeLocal = sgEvent.datetime_local || '';
  const date = dateTimeLocal ? dateTimeLocal.split('T')[0] : '';
  const time = dateTimeLocal ? dateTimeLocal.split('T')[1]?.slice(0, 5) : '';
  
  // Get price info
  const getPrice = () => {
    if (sgEvent.stats?.lowest_price) {
      const low = sgEvent.stats.lowest_price;
      const high = sgEvent.stats.highest_price;
      if (high && high !== low) {
        return `$${low} - $${high}`;
      }
      return `$${low}`;
    }
    return i18n.t('eventDetails.seeTickets');
  };

  return {
    id: `sg_${sgEvent.id}`,
    title: sgEvent.title || sgEvent.short_title || i18n.t('eventDetails.untitledEvent'),
    description: sgEvent.description || '',
    date: date,
    time: time,
    location: venue.name || i18n.t('eventDetails.venueTBA'),
    city: venue.city || '',
    state: venue.state || '',
    address: venue.address || '',
    latitude: parseFloat(venue.location?.lat) || null,
    longitude: parseFloat(venue.location?.lon) || null,
    category: category,
    categoryDisplay: getCategoryDisplay(taxonomies, category),
    price: getPrice(),
    image: getImage(),
    ticketUrl: sgEvent.url || '',
    source: 'seatgeek',
    active: true,
    venueName: venue.name || '',
  };
};

// Search events by location with optional category filtering
export const searchEvents = async (options = {}) => {
  const {
    latitude,
    longitude,
    radius = 50,
    size = 100,  // Increased to get more variety
    categories = [],  // NEW: array of category IDs to filter by
  } = options;

  if (!SEATGEEK_CLIENT_ID) {
    console.error('SeatGeek Client ID not configured');
    return { success: false, error: 'Client ID not configured', events: [] };
  }

  try {
    let allEvents = [];
    
    // If specific categories requested, fetch each separately
    if (categories.length > 0 && categories.length < 5) {
      console.log('Fetching SeatGeek events for categories:', categories);
      
      for (const category of categories) {
        let url = `${BASE_URL}/events?client_id=${SEATGEEK_CLIENT_ID}`;
        url += `&per_page=${Math.ceil(size / categories.length)}`;
        url += `&sort=datetime_local.asc`;
        
        if (latitude && longitude) {
          url += `&lat=${latitude}&lon=${longitude}`;
          url += `&range=${radius}mi`;
        }
        
        // Add category-specific filtering using taxonomies
        if (TAXONOMY_IDS[category]) {
          url += `&taxonomies.name=${TAXONOMY_IDS[category]}`;
        }
        
        console.log(`Fetching ${category} from SeatGeek...`);
        
        try {
          const response = await fetch(url);
          const data = await response.json();
          
          if (response.ok && data.events) {
            const events = data.events.map(transformEvent);
            console.log(`Found ${events.length} ${category} events from SeatGeek`);
            allEvents = [...allEvents, ...events];
          }
        } catch (err) {
          console.log(`Error fetching ${category}:`, err.message);
        }
      }
    } else {
      // No specific categories or too many - fetch all
      let url = `${BASE_URL}/events?client_id=${SEATGEEK_CLIENT_ID}`;
      url += `&per_page=${size}`;
      url += `&sort=datetime_local.asc`;
      
      if (latitude && longitude) {
        url += `&lat=${latitude}&lon=${longitude}`;
        url += `&range=${radius}mi`;
      }

      console.log('Fetching all events from SeatGeek...');
      
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        console.error('SeatGeek API error:', data);
        return { success: false, error: data.message || 'API error', events: [] };
      }

      allEvents = (data.events || []).map(transformEvent);
    }
    
    // Remove duplicates (same event ID)
    const uniqueEvents = [];
    const seenIds = new Set();
    for (const event of allEvents) {
      if (!seenIds.has(event.id)) {
        seenIds.add(event.id);
        uniqueEvents.push(event);
      }
    }

    console.log(`Total unique events from SeatGeek: ${uniqueEvents.length}`);
    
    return { success: true, events: uniqueEvents };
  } catch (error) {
    console.error('Error fetching SeatGeek events:', error);
    return { success: false, error: error.message, events: [] };
  }
};