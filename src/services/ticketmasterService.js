import { Platform } from 'react-native';

const TICKETMASTER_API_KEY = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY;
const BASE_URL = Platform.OS === 'web' 
  ? 'https://corsproxy.io/?https://app.ticketmaster.com/discovery/v2'
  : 'https://app.ticketmaster.com/discovery/v2';

// Ticketmaster Segment IDs for filtering at API level
const SEGMENT_IDS = {
  'music': 'KZFzniwnSyZfZ7v7nJ',      // Music
  'sports': 'KZFzniwnSyZfZ7v7nE',      // Sports
  'arts': 'KZFzniwnSyZfZ7v7na',        // Arts & Theatre
  'comedy': 'KZFzniwnSyZfZ7v7na',      // Arts & Theatre (comedy is under this)
  'family': 'KZFzniwnSyZfZ7v7n1',      // Miscellaneous (family often here)
};

// Ticketmaster Genre IDs for more specific filtering
const GENRE_IDS = {
  'comedy': 'KnvZfZ7vAe1',  // Comedy genre specifically
};

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
  
  // Nightlife
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

// Category-specific placeholder images
const CATEGORY_PLACEHOLDERS = {
  'music': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80',
  'comedy': 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&q=80',
  'sports': 'https://images.unsplash.com/photo-1461896836934-58cd91f22092?w=800&q=80',
  'arts': 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&q=80',
  'nightlife': 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800&q=80',
  'family': 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&q=80',
  'food': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
  'fitness': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
  'networking': 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
  'outdoor': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
  'other': 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80',
};

// Known bad/placeholder image patterns
const isBadImage = (url) => {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  
  const badPatterns = [
    'recomendation', 'recommendation', 'default_event', 'no_image',
    'placeholder', 'generic', 'ic_default', 'artist_default',
    'event_default', '/dam/c/', '106201', '105351',
  ];
  
  return badPatterns.some(pattern => lowerUrl.includes(pattern));
};

// Transform Ticketmaster event to your app's format
const transformEvent = (tmEvent) => {
  const venue = tmEvent._embedded?.venues?.[0];
  const attractions = tmEvent._embedded?.attractions || [];
  const priceRange = tmEvent.priceRanges?.[0];
  const classification = tmEvent.classifications?.[0];
  
  // Get the best image
  const getBestImage = (category) => {
    if (tmEvent.images && tmEvent.images.length > 0) {
      const bestEventImage = tmEvent.images.find(img => img.ratio === '16_9' && img.width > 500 && !isBadImage(img.url))
        || tmEvent.images.find(img => img.ratio === '16_9' && !isBadImage(img.url))
        || tmEvent.images.find(img => img.width > 500 && !isBadImage(img.url))
        || tmEvent.images.find(img => !isBadImage(img.url));
      if (bestEventImage?.url) return bestEventImage.url;
    }
    
    for (const attraction of attractions) {
      if (attraction.images && attraction.images.length > 0) {
        const bestAttractionImage = attraction.images.find(img => img.ratio === '16_9' && img.width > 500 && !isBadImage(img.url))
          || attraction.images.find(img => img.ratio === '16_9' && !isBadImage(img.url))
          || attraction.images.find(img => !isBadImage(img.url));
        if (bestAttractionImage?.url) return bestAttractionImage.url;
      }
    }
    
    if (venue?.images && venue.images.length > 0) {
      const bestVenueImage = venue.images.find(img => !isBadImage(img.url));
      if (bestVenueImage?.url) return bestVenueImage.url;
    }
    
    return CATEGORY_PLACEHOLDERS[category] || CATEGORY_PLACEHOLDERS['other'];
  };

  // Smart category extraction
  const getCategory = () => {
    const segment = classification?.segment?.name;
    const genre = classification?.genre?.name;
    const subGenre = classification?.subGenre?.name;
    const type = classification?.type?.name;
    
    const isValid = (val) => val && val.toLowerCase() !== 'undefined';
    
    // Build search text from event name, attractions, and venue
    const attractionNames = attractions.map(a => a.name || '').join(' ');
    const textToSearch = `${tmEvent.name} ${attractionNames} ${venue?.name || ''}`.toLowerCase();
    
    // FIRST: Check for known comedians (these often get miscategorized as Arts & Theatre)
    const knownComedians = [
      'tosh', 'mulaney', 'chappelle', 'burr', 'segura', 'rogan', 'hart', 'rock',
      'gaffigan', 'iglesias', 'bargatze', 'jeselnik', 'schulz', 'gillis', 'normand',
      'list', 'che', 'jost', 'haddish', 'schumer', 'sykes', 'wong', 'bamford',
      'birbiglia', 'ansari', 'buress', 'carmichael', 'glaser', 'gondelman',
      'maniscalco', 'santino', 'swardson', 'torres', 'kreischer', 'theo von',
      'schaub', 'callen', 'diaz', 'delia', 'whitney', 'lampanelli', 'leggero',
      'silverman', 'handler', 'wolf', 'tig notaro', 'fortune feimster', 'aries spears',
      'katt williams', 'mike epps', 'cedric', 'steve harvey', 'mo amer', 'hasan minhaj',
      'ronny chieng', 'jimmy o yang', 'ken jeong', 'ali wong', 'sheng wang',
      'taylor tomlinson', 'iliza', 'nikki glaser', 'rachel feinstein', 'jim jefferies',
      'russell peters', 'trevor noah', 'john oliver', 'conan', 'colbert',
      'seth meyers', 'jimmy fallon', 'jimmy kimmel', 'james corden',
      'fluffy', 'jeff dunham', 'larry the cable', 'ron white', 'foxworthy',
      'engvall', 'lewis black', 'dennis miller', 'patton oswalt', 'brian regan',
      'sebastian', 'gabriel', 'nate bargatze', 'matt rife', 'andrew santino',
      'bobby lee', 'andrew schulz', 'mark normand', 'sam morril', 'joe list',
      'dan soder', 'big jay', 'luis gomez', 'tim dillon', 'ari shaffir',
      'joey diaz', 'duncan trussell', 'bert kreischer', 'tom segura',
    ];
    
    if (knownComedians.some(comedian => textToSearch.includes(comedian))) {
      return 'Comedy';
    }
    
    // SECOND: Check for comedy keywords in title/venue
    if (textToSearch.includes('comedy') || textToSearch.includes('comedian') || 
        textToSearch.includes('stand-up') || textToSearch.includes('standup') || 
        textToSearch.includes('helium') || textToSearch.includes('improv') || 
        textToSearch.includes('laugh factory') || textToSearch.includes('funny bone') ||
        textToSearch.includes('comedy club') || textToSearch.includes('comedyfest') ||
        textToSearch.includes('comic') || textToSearch.includes('laughs')) {
      return 'Comedy';
    }
    
    // THIRD: If the API says it's Comedy genre, trust that
    if (isValid(genre) && genre.toLowerCase() === 'comedy') {
      return 'Comedy';
    }
    
    // FOURTH: Use API classification for other categories
    if (isValid(genre)) return genre;
    if (isValid(segment)) return segment;
    if (isValid(subGenre)) return subGenre;
    if (isValid(type)) return type;
    
    // FIFTH: Keyword detection for other categories
    if (textToSearch.includes('drag') || textToSearch.includes('burlesque')) {
      return 'Nightlife';
    }
    if (textToSearch.includes('concert') || textToSearch.includes('live music') || textToSearch.includes('tour')) {
      return 'Music';
    }
    if (textToSearch.includes('game') || textToSearch.includes('vs.') || textToSearch.includes(' v ')) {
      return 'Sports';
    }
    if (textToSearch.includes('broadway') || textToSearch.includes('musical')) {
      return 'Arts & Theatre';
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
    time: tmEvent.dates?.start?.localTime?.slice(0, 5) || '',
    location: venue?.name || '',
    city: venue?.city?.name || '',
    state: venue?.state?.stateCode || '',
    address: venue?.address?.line1 || '',
    latitude: parseFloat(venue?.location?.latitude) || null,
    longitude: parseFloat(venue?.location?.longitude) || null,
    category: normalizedCategory,
    categoryDisplay: rawCategory,
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
    venueName: venue?.name || '',
  };
};

// Search events by location with optional category filtering
export const searchEvents = async (options = {}) => {
  const {
    latitude,
    longitude,
    radius = 50,
    size = 100,  // Increased to get more variety
    sort = 'date,asc',
    startDateTime = new Date().toISOString().slice(0, 19) + 'Z',
    categories = [],  // NEW: array of category IDs to filter by
  } = options;

  try {
    let allEvents = [];
    
    // If specific categories requested, fetch each separately for better results
    if (categories.length > 0 && categories.length < 5) {
      console.log('Fetching Ticketmaster events for categories:', categories);
      
      for (const category of categories) {
        let url = `${BASE_URL}/events.json?apikey=${TICKETMASTER_API_KEY}&size=${Math.ceil(size / categories.length)}&sort=${sort}&startDateTime=${startDateTime}`;
        
        if (latitude && longitude) {
          url += `&latlong=${latitude},${longitude}&radius=${radius}&unit=miles`;
        }
        
        // Add category-specific filtering
        if (category === 'comedy') {
          // For comedy, use BOTH genre ID and keyword search for better results
          // First try genre ID
          const genreUrl = url + `&genreId=${GENRE_IDS.comedy}`;
          console.log(`Fetching ${category} (by genre) from Ticketmaster...`);
          
          try {
            const genreResponse = await fetch(genreUrl);
            const genreData = await genreResponse.json();
            
            if (genreResponse.ok && genreData._embedded?.events) {
              const events = genreData._embedded.events.map(transformEvent);
              console.log(`Found ${events.length} ${category} events (by genre) from Ticketmaster`);
              allEvents = [...allEvents, ...events];
            }
          } catch (err) {
            console.log(`Error fetching ${category} by genre:`, err.message);
          }
          
          // Also search by keyword "comedy" to catch miscategorized events
          const keywordUrl = url + `&keyword=comedy`;
          console.log(`Fetching ${category} (by keyword) from Ticketmaster...`);
          
          try {
            const keywordResponse = await fetch(keywordUrl);
            const keywordData = await keywordResponse.json();
            
            if (keywordResponse.ok && keywordData._embedded?.events) {
              const events = keywordData._embedded.events.map(transformEvent);
              console.log(`Found ${events.length} ${category} events (by keyword) from Ticketmaster`);
              allEvents = [...allEvents, ...events];
            }
          } catch (err) {
            console.log(`Error fetching ${category} by keyword:`, err.message);
          }
          
          continue; // Skip the normal fetch below since we handled comedy specially
        } else if (SEGMENT_IDS[category]) {
          url += `&segmentId=${SEGMENT_IDS[category]}`;
        }
        
        console.log(`Fetching ${category} from Ticketmaster...`);
        
        try {
          const response = await fetch(url);
          const data = await response.json();
          
          if (response.ok && data._embedded?.events) {
            const events = data._embedded.events.map(transformEvent);
            console.log(`Found ${events.length} ${category} events from Ticketmaster`);
            allEvents = [...allEvents, ...events];
          }
        } catch (err) {
          console.log(`Error fetching ${category}:`, err.message);
        }
      }
    } else {
      // No specific categories or too many - fetch all
      let url = `${BASE_URL}/events.json?apikey=${TICKETMASTER_API_KEY}&size=${size}&sort=${sort}&startDateTime=${startDateTime}`;
      
      if (latitude && longitude) {
        url += `&latlong=${latitude},${longitude}&radius=${radius}&unit=miles`;
      }

      console.log('Fetching all events from Ticketmaster...');
      
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        console.error('Ticketmaster API error:', data);
        return { success: false, error: data.fault?.faultstring || 'API error', events: [] };
      }

      allEvents = (data._embedded?.events || []).map(transformEvent);
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

    console.log(`Total unique events from Ticketmaster: ${uniqueEvents.length}`);
    
    return { success: true, events: uniqueEvents };
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