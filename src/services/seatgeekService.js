import { Platform } from 'react-native';

const SEATGEEK_CLIENT_ID = process.env.EXPO_PUBLIC_SEATGEEK_CLIENT_ID;
const BASE_URL = 'https://api.seatgeek.com/2';

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

// Get display category name (matches your filter labels)
const getCategoryDisplay = (taxonomies, category) => {
  // Map internal category to display name
  const DISPLAY_MAP = {
    'music': 'Music',
    'sports': 'Sports',
    'arts': 'Arts & Culture',
    'comedy': 'Comedy',
    'family': 'Family',
    'outdoor': 'Outdoor',
    'fitness': 'Fitness',
    'food': 'Food & Drink',
    'networking': 'Networking',
    'nightlife': 'Nightlife',
    'other': 'Event',
  };
  
  return DISPLAY_MAP[category] || 'Event';
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
    // Try to get performer image first (usually better quality)
    for (const performer of performers) {
      if (performer.image) return performer.image;
      if (performer.images?.huge) return performer.images.huge;
      if (performer.images?.large) return performer.images.large;
    }
    // Fallback to placeholder
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
    return 'See tickets';
  };

  return {
    id: `sg_${sgEvent.id}`, // Prefix to avoid ID collisions
    title: sgEvent.title || sgEvent.short_title || 'Untitled Event',
    description: sgEvent.description || '',
    date: date,
    time: time,
    location: venue.name || 'Venue TBA',
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
    // Store venue name for deduplication
    venueName: venue.name || '',
  };
};

// Search events by location
export const searchEvents = async (options = {}) => {
  const {
    latitude,
    longitude,
    radius = 50,
    size = 50,
  } = options;

  if (!SEATGEEK_CLIENT_ID) {
    console.error('SeatGeek Client ID not configured');
    return { success: false, error: 'Client ID not configured', events: [] };
  }

  try {
    let url = `${BASE_URL}/events?client_id=${SEATGEEK_CLIENT_ID}`;
    url += `&per_page=${size}`;
    url += `&sort=datetime_local.asc`;
    
    if (latitude && longitude) {
      url += `&lat=${latitude}&lon=${longitude}`;
      url += `&range=${radius}mi`;
    }

    console.log('Fetching from SeatGeek...');
    
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('SeatGeek API error:', data);
      return { 
        success: false, 
        error: data.message || 'API error', 
        events: [] 
      };
    }

    const events = data.events || [];
    const transformedEvents = events.map(transformEvent);

    console.log(`Found ${transformedEvents.length} events from SeatGeek`);
    
    return { success: true, events: transformedEvents };
  } catch (error) {
    console.error('Error fetching SeatGeek events:', error);
    return { success: false, error: error.message, events: [] };
  }
};