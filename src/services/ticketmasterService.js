import { Platform } from 'react-native';

const TICKETMASTER_API_KEY = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY;
const BASE_URL = Platform.OS === 'web' 
  ? 'https://corsproxy.io/?https://app.ticketmaster.com/discovery/v2'
  : 'https://app.ticketmaster.com/discovery/v2';

// Map Ticketmaster categories to your app's filter IDs
const CATEGORY_MAP = {
  // Ticketmaster segments
  'music': 'music',
  'sports': 'sports',
  'arts & theatre': 'arts',
  'film': 'arts',
  'miscellaneous': 'other',
  
  // Ticketmaster genres
  'comedy': 'comedy',
  'rock': 'music',
  'pop': 'music',
  'hip-hop/rap': 'music',
  'r&b': 'music',
  'country': 'music',
  'jazz': 'music',
  'classical': 'music',
  'electronic': 'music',
  'alternative': 'music',
  'metal': 'music',
  'folk': 'music',
  'latin': 'music',
  'reggae': 'music',
  'blues': 'music',
  'soul': 'music',
  'punk': 'music',
  'world': 'music',
  
  // Sports
  'basketball': 'sports',
  'football': 'sports',
  'baseball': 'sports',
  'hockey': 'sports',
  'soccer': 'sports',
  'tennis': 'sports',
  'golf': 'sports',
  'boxing': 'sports',
  'mma': 'sports',
  'wrestling': 'sports',
  'motorsports': 'sports',
  
  // Arts
  'theatre': 'arts',
  'theater': 'arts',
  'broadway': 'arts',
  'musical': 'arts',
  'opera': 'arts',
  'ballet': 'arts',
  'dance': 'arts',
  'circus': 'arts',
  'magic': 'arts',
  
  // Nightlife (from our keyword detection)
  'nightlife': 'nightlife',
  'club': 'nightlife',
  
  // Family
  'family': 'family',
  'children': 'family',
  'kids': 'family',
  
  // Fitness
  'fitness': 'fitness',
  'marathon': 'fitness',
  'run': 'fitness',
  'yoga': 'fitness',
  
  // Food
  'food & drink': 'food',
  'food': 'food',
  'wine': 'food',
  'beer': 'food',
  'culinary': 'food',
  
  // Networking
  'networking': 'networking',
  'conference': 'networking',
  'seminar': 'networking',
  
  // Outdoor
  'outdoor': 'outdoor',
  'festival': 'outdoor',
  'fair': 'outdoor',
  
  // Default
  'event': 'other',
};

// Normalize category to match filter IDs
const normalizeCategory = (category) => {
  if (!category) return 'other';
  const lower = category.toLowerCase();
  return CATEGORY_MAP[lower] || 'other';
};

// Category-specific placeholder images (high quality, royalty-free)
const CATEGORY_PLACEHOLDERS = {
  'music': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80', // Concert crowd
  'comedy': 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&q=80', // Microphone stage
  'sports': 'https://images.unsplash.com/photo-1461896836934- voices-in-the-crowd?w=800&q=80', // Stadium
  'arts': 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&q=80', // Theater stage
  'nightlife': 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800&q=80', // Club lights
  'family': 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&q=80', // Carnival
  'food': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', // Food spread
  'fitness': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80', // Gym
  'networking': 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80', // Conference
  'outdoor': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80', // Festival crowd
  'other': 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80', // Event lights
};

// Known bad/placeholder image patterns from Ticketmaster
const isBadImage = (url) => {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  
  // Block specific known bad patterns
  const badPatterns = [
    'recomendation',
    'recommendation', 
    'default_event',
    'no_image',
    'placeholder',
    'generic',
    'ic_default',
    'artist_default',
    'event_default',
    // Ticketmaster generic category images (UUIDs in /dam/c/ folder)
    '/dam/c/',
    // Other known placeholder IDs
    '106201', // Generic event placeholder
    '105351', // Another generic placeholder
  ];
  
  return badPatterns.some(pattern => lowerUrl.includes(pattern));
};

// Transform Ticketmaster event to your app's format
const transformEvent = (tmEvent) => {
  const venue = tmEvent._embedded?.venues?.[0];
  const attractions = tmEvent._embedded?.attractions || [];
  const priceRange = tmEvent.priceRanges?.[0];
  const classification = tmEvent.classifications?.[0];
  
  // Get the best image - try multiple sources
  const getBestImage = (category) => {
    // 1. First try event images (prefer 16:9 ratio, larger size)
    if (tmEvent.images && tmEvent.images.length > 0) {
      const bestEventImage = tmEvent.images.find(img => img.ratio === '16_9' && img.width > 500 && !isBadImage(img.url))
        || tmEvent.images.find(img => img.ratio === '16_9' && !isBadImage(img.url))
        || tmEvent.images.find(img => img.width > 500 && !isBadImage(img.url))
        || tmEvent.images.find(img => !isBadImage(img.url));
      if (bestEventImage?.url) return bestEventImage.url;
    }
    
    // 2. Try attraction/performer images
    for (const attraction of attractions) {
      if (attraction.images && attraction.images.length > 0) {
        const bestAttractionImage = attraction.images.find(img => img.ratio === '16_9' && img.width > 500 && !isBadImage(img.url))
          || attraction.images.find(img => img.ratio === '16_9' && !isBadImage(img.url))
          || attraction.images.find(img => !isBadImage(img.url));
        if (bestAttractionImage?.url) return bestAttractionImage.url;
      }
    }
    
    // 3. Try venue images
    if (venue?.images && venue.images.length > 0) {
      const bestVenueImage = venue.images.find(img => !isBadImage(img.url));
      if (bestVenueImage?.url) return bestVenueImage.url;
    }
    
    // 4. Use category-specific placeholder
    return CATEGORY_PLACEHOLDERS[category] || CATEGORY_PLACEHOLDERS['other'];
  };

  // Smart category extraction - Ticketmaster sometimes has "Undefined" as actual value
  const getCategory = () => {
    const segment = classification?.segment?.name;
    const genre = classification?.genre?.name;
    const subGenre = classification?.subGenre?.name;
    const type = classification?.type?.name;
    
    // Helper to check if value is valid (not empty, not "undefined" in any case)
    const isValid = (val) => val && val.toLowerCase() !== 'undefined';
    
    // Check segment first (Music, Sports, Arts & Theatre, etc.)
    if (isValid(segment)) {
      return segment;
    }
    // Fall back to genre (Comedy, Rock, Jazz, etc.)
    if (isValid(genre)) {
      return genre;
    }
    // Fall back to subGenre
    if (isValid(subGenre)) {
      return subGenre;
    }
    // Fall back to type
    if (isValid(type)) {
      return type;
    }
    
    // Last resort: try to detect category from event name or venue
    const textToSearch = `${tmEvent.name} ${venue?.name || ''}`.toLowerCase();
    
    // Known comedians list (add more as needed)
    const knownComedians = [
      'mulaney', 'armisen', 'chappelle', 'burr', 'segura', 'rogan', 'hart', 'rock',
      'gaffigan', 'iglesias', 'bargatze', 'jeselnik', 'schulz', 'gillis', 'normand',
      'list', 'che', 'jost', 'haddish', 'schumer', 'sykes', 'wong', 'bamford',
      'birbiglia', 'ansari', 'buress', 'carmichael', 'glaser', 'gondelman',
      'maniscalco', 'santino', 'swardson', 'torres', 'wolfson'
    ];
    
    // Check for known comedians
    if (knownComedians.some(comedian => textToSearch.includes(comedian))) {
      return 'Comedy';
    }
    
    if (textToSearch.includes('comedy') || textToSearch.includes('comedian') || textToSearch.includes('stand-up') || textToSearch.includes('standup') || textToSearch.includes('helium') || textToSearch.includes('improv') || textToSearch.includes('laugh factory') || textToSearch.includes('funny bone')) {
      return 'Comedy';
    }
    if (textToSearch.includes('drag') || textToSearch.includes('burlesque') || textToSearch.includes('cabaret')) {
      return 'Nightlife';
    }
    if (textToSearch.includes('concert') || textToSearch.includes('live music') || textToSearch.includes('tour')) {
      return 'Music';
    }
    if (textToSearch.includes('game') || textToSearch.includes('vs.') || textToSearch.includes('stadium')) {
      return 'Sports';
    }
    if (textToSearch.includes('theater') || textToSearch.includes('theatre') || textToSearch.includes('musical') || textToSearch.includes('broadway')) {
      return 'Arts & Theatre';
    }
    if (textToSearch.includes('festival') || textToSearch.includes('fair')) {
      return 'Festival';
    }
    if (textToSearch.includes('conference') || textToSearch.includes('summit') || textToSearch.includes('networking')) {
      return 'Networking';
    }
    if (textToSearch.includes('family') || textToSearch.includes('kids') || textToSearch.includes('children')) {
      return 'Family';
    }
    
    return 'Event';
  };

  const rawCategory = getCategory();
  const normalizedCategory = normalizeCategory(rawCategory);
  const image = getBestImage(normalizedCategory);
  
  return {
    id: tmEvent.id,
    title: tmEvent.name,
    date: tmEvent.dates?.start?.localDate || '',
    time: tmEvent.dates?.start?.localTime?.slice(0, 5) || '', // "19:00"
    location: venue?.name || '',
    city: venue?.city?.name || '',
    state: venue?.state?.stateCode || '',
    address: venue?.address?.line1 || '',
    latitude: parseFloat(venue?.location?.latitude) || null,
    longitude: parseFloat(venue?.location?.longitude) || null,
    category: normalizedCategory,  // For filtering (matches filter IDs)
    categoryDisplay: rawCategory,               // For display (human-readable)
    genre: classification?.genre?.name || '',
    price: priceRange 
      ? (priceRange.min === priceRange.max 
          ? `$${priceRange.min}` 
          : `$${priceRange.min} - $${priceRange.max}`)
      : 'See tickets',
    image: image,
    ticketUrl: tmEvent.url || '',
    source: 'ticketmaster',
    active: true,
  };
};

// Search events by location
export const searchEvents = async (options = {}) => {
  const {
    latitude,
    longitude,
    radius = 50, // miles
    size = 50,   // number of results
    sort = 'date,asc',
    startDateTime = new Date().toISOString().slice(0, 19) + 'Z',
  } = options;

  try {
    let url = `${BASE_URL}/events.json?apikey=${TICKETMASTER_API_KEY}&size=${size}&sort=${sort}&startDateTime=${startDateTime}`;
    
    if (latitude && longitude) {
      url += `&latlong=${latitude},${longitude}&radius=${radius}&unit=miles`;
    }

    console.log('Fetching from Ticketmaster:', url);
    
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('Ticketmaster API error:', data);
      return { success: false, error: data.fault?.faultstring || 'API error', events: [] };
    }

    const events = data._embedded?.events || [];
    const transformedEvents = events.map(transformEvent);

    console.log(`Found ${transformedEvents.length} events from Ticketmaster`);
    
    return { success: true, events: transformedEvents };
  } catch (error) {
    console.error('Error fetching Ticketmaster events:', error);
    return { success: false, error: error.message, events: [] };
  }
};

// Search events by city name
export const searchEventsByCity = async (city, stateCode = '', options = {}) => {
  const { size = 50, sort = 'date,asc' } = options;
  
  try {
    const startDateTime = new Date().toISOString().slice(0, 19) + 'Z';
    let url = `${BASE_URL}/events.json?apikey=${TICKETMASTER_API_KEY}&size=${size}&sort=${sort}&startDateTime=${startDateTime}&city=${encodeURIComponent(city)}`;
    
    if (stateCode) {
      url += `&stateCode=${stateCode}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.fault?.faultstring || 'API error', events: [] };
    }

    const events = data._embedded?.events || [];
    const transformedEvents = events.map(transformEvent);
    
    return { success: true, events: transformedEvents };
  } catch (error) {
    console.error('Error fetching events by city:', error);
    return { success: false, error: error.message, events: [] };
  }
};

// Search events by keyword
export const searchEventsByKeyword = async (keyword, options = {}) => {
  const { size = 20, sort = 'relevance,desc' } = options;
  
  try {
    const startDateTime = new Date().toISOString().slice(0, 19) + 'Z';
    const url = `${BASE_URL}/events.json?apikey=${TICKETMASTER_API_KEY}&size=${size}&sort=${sort}&startDateTime=${startDateTime}&keyword=${encodeURIComponent(keyword)}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.fault?.faultstring || 'API error', events: [] };
    }

    const events = data._embedded?.events || [];
    const transformedEvents = events.map(transformEvent);
    
    return { success: true, events: transformedEvents };
  } catch (error) {
    console.error('Error searching events:', error);
    return { success: false, error: error.message, events: [] };
  }
};