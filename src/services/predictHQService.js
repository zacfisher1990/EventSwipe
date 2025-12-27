const PREDICTHQ_API_KEY = process.env.EXPO_PUBLIC_PREDICTHQ_API_KEY;
const BASE_URL = 'https://api.predicthq.com/v1';

// Map PredictHQ categories to your app's filter IDs
const CATEGORY_MAP = {
  'concerts': 'music',
  'festivals': 'outdoor',
  'sports': 'sports',
  'performing-arts': 'arts',
  'community': 'family',
  'expos': 'networking',
  'conferences': 'networking',
  'daylight-savings': 'other',
  'public-holidays': 'other',
  'observances': 'other',
  'school-holidays': 'family',
  'academic': 'other',
  'airport-delays': 'other',
  'severe-weather': 'other',
  'disasters': 'other',
  'terror': 'other',
  'health-warnings': 'other',
  'politics': 'other',
};

// Map PredictHQ categories to display names
const CATEGORY_DISPLAY = {
  'concerts': 'Music',
  'festivals': 'Festival',
  'sports': 'Sports',
  'performing-arts': 'Arts & Theatre',
  'community': 'Community',
  'expos': 'Expo',
  'conferences': 'Conference',
  'public-holidays': 'Holiday',
  'school-holidays': 'School Holiday',
};

// Transform PredictHQ event to your app's format
const transformEvent = (phqEvent) => {
  const apiCategory = phqEvent.category || 'community';
  
  // Extract location info
  const location = phqEvent.entities?.find(e => e.type === 'venue');
  const address = phqEvent.entities?.find(e => e.type === 'address');
  const venueName = location?.name || phqEvent.geo?.address?.locality || '';
  
  // Parse date and time
  const startDate = new Date(phqEvent.start);
  const dateStr = startDate.toISOString().split('T')[0]; // "2025-01-15"
  const timeStr = startDate.toTimeString().slice(0, 5);   // "19:00"
  
  // Smart category detection based on title and venue
  const getSmartCategory = () => {
    const textToSearch = `${phqEvent.title} ${venueName}`.toLowerCase();
    
    // Music keywords
    if (textToSearch.includes('live') || textToSearch.includes('concert') || 
        textToSearch.includes('band') || textToSearch.includes('music') ||
        textToSearch.includes('dj') || textToSearch.includes('symphony') ||
        textToSearch.includes('orchestra') || textToSearch.includes('singer') ||
        textToSearch.includes('tour') || textToSearch.includes('acoustic')) {
      return { category: 'music', display: 'Music' };
    }
    
    // Comedy keywords
    if (textToSearch.includes('comedy') || textToSearch.includes('comedian') ||
        textToSearch.includes('stand-up') || textToSearch.includes('standup') ||
        textToSearch.includes('improv') || textToSearch.includes('laugh')) {
      return { category: 'comedy', display: 'Comedy' };
    }
    
    // Food & Drink keywords
    if (textToSearch.includes('wine') || textToSearch.includes('tasting') ||
        textToSearch.includes('brewery') || textToSearch.includes('food') ||
        textToSearch.includes('dinner') || textToSearch.includes('culinary') ||
        textToSearch.includes('chef') || textToSearch.includes('restaurant') ||
        textToSearch.includes('vineyard') || textToSearch.includes('winery')) {
      return { category: 'food', display: 'Food & Drink' };
    }
    
    // Fitness keywords
    if (textToSearch.includes('run') || textToSearch.includes('marathon') ||
        textToSearch.includes('yoga') || textToSearch.includes('fitness') ||
        textToSearch.includes('workout') || textToSearch.includes('5k') ||
        textToSearch.includes('10k') || textToSearch.includes('race')) {
      return { category: 'fitness', display: 'Fitness' };
    }
    
    // Outdoor keywords
    if (textToSearch.includes('festival') || textToSearch.includes('fair') ||
        textToSearch.includes('outdoor') || textToSearch.includes('park') ||
        textToSearch.includes('market') || textToSearch.includes('farmers')) {
      return { category: 'outdoor', display: 'Festival' };
    }
    
    // Networking keywords
    if (textToSearch.includes('conference') || textToSearch.includes('summit') ||
        textToSearch.includes('networking') || textToSearch.includes('expo') ||
        textToSearch.includes('workshop') || textToSearch.includes('seminar') ||
        textToSearch.includes('meetup')) {
      return { category: 'networking', display: 'Networking' };
    }
    
    // Arts keywords
    if (textToSearch.includes('theater') || textToSearch.includes('theatre') ||
        textToSearch.includes('play') || textToSearch.includes('musical') ||
        textToSearch.includes('ballet') || textToSearch.includes('opera') ||
        textToSearch.includes('gallery') || textToSearch.includes('art show') ||
        textToSearch.includes('exhibition')) {
      return { category: 'arts', display: 'Arts & Culture' };
    }
    
    // Family keywords
    if (textToSearch.includes('family') || textToSearch.includes('kids') ||
        textToSearch.includes('children') || textToSearch.includes('storytime') ||
        textToSearch.includes('celebration') || textToSearch.includes('kwanzaa') ||
        textToSearch.includes('christmas') || textToSearch.includes('hanukkah') ||
        textToSearch.includes('easter') || textToSearch.includes('holiday')) {
      return { category: 'family', display: 'Family' };
    }
    
    // Nightlife keywords
    if (textToSearch.includes('club') || textToSearch.includes('nightlife') ||
        textToSearch.includes('drag') || textToSearch.includes('burlesque') ||
        textToSearch.includes('cabaret') || textToSearch.includes('party')) {
      return { category: 'nightlife', display: 'Nightlife' };
    }
    
    // Fall back to API category mapping
    return {
      category: CATEGORY_MAP[apiCategory] || 'other',
      display: CATEGORY_DISPLAY[apiCategory] || apiCategory.charAt(0).toUpperCase() + apiCategory.slice(1)
    };
  };
  
  const smartCategory = getSmartCategory();
  
  return {
    id: `phq_${phqEvent.id}`,
    title: phqEvent.title,
    date: dateStr,
    time: timeStr,
    location: venueName,
    city: phqEvent.geo?.address?.locality || '',
    state: phqEvent.geo?.address?.region || '',
    address: address?.formatted_address || phqEvent.geo?.address?.formatted_address || '',
    latitude: phqEvent.location?.[1] || null,  // PredictHQ uses [lon, lat]
    longitude: phqEvent.location?.[0] || null,
    category: smartCategory.category,
    categoryDisplay: smartCategory.display,
    genre: '',
    price: 'Check event',
    image: `https://picsum.photos/400/300?random=${phqEvent.id}`, // PredictHQ doesn't provide images
    ticketUrl: '', // We'll use Google search fallback
    description: phqEvent.description || `Sourced from predicthq.com`,
    source: 'predicthq',
    active: true,
    rank: phqEvent.rank || 0, // PredictHQ's importance score (0-100)
    attendance: phqEvent.phq_attendance || null,
  };
};

// Search events by location
export const searchEvents = async (options = {}) => {
  const {
    latitude,
    longitude,
    radius = 50, // miles (will convert to km)
    limit = 50,
    startDate = new Date().toISOString(),
    categories = ['concerts', 'festivals', 'sports', 'performing-arts', 'community', 'expos', 'conferences'],
  } = options;

  try {
    // Convert miles to km for PredictHQ
    const radiusKm = Math.round(radius * 1.60934);
    
    // Build query parameters
    const params = new URLSearchParams({
      limit: limit.toString(),
      sort: 'start',
      'start.gte': startDate,
      category: categories.join(','),
      state: 'active,predicted',
    });
    
    // Add location if provided
    if (latitude && longitude) {
      params.append('within', `${radiusKm}km@${latitude},${longitude}`);
    }

    const url = `${BASE_URL}/events/?${params.toString()}`;
    
    console.log('Fetching from PredictHQ:', url);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${PREDICTHQ_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    
    const data = await response.json();

    if (!response.ok) {
      console.error('PredictHQ API error:', data);
      return { success: false, error: data.error || 'API error', events: [] };
    }

    const events = data.results || [];
    const transformedEvents = events.map(transformEvent);

    console.log(`Found ${transformedEvents.length} events from PredictHQ`);
    
    return { success: true, events: transformedEvents };
  } catch (error) {
    console.error('Error fetching PredictHQ events:', error);
    return { success: false, error: error.message, events: [] };
  }
};

// Search events by place name
export const searchEventsByPlace = async (place, options = {}) => {
  const { limit = 50, categories } = options;
  
  try {
    const startDate = new Date().toISOString();
    
    const params = new URLSearchParams({
      limit: limit.toString(),
      sort: 'start',
      'start.gte': startDate,
      q: place,
      state: 'active,predicted',
    });
    
    if (categories && categories.length > 0) {
      params.append('category', categories.join(','));
    }

    const url = `${BASE_URL}/events/?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${PREDICTHQ_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'API error', events: [] };
    }

    const events = data.results || [];
    const transformedEvents = events.map(transformEvent);
    
    return { success: true, events: transformedEvents };
  } catch (error) {
    console.error('Error searching PredictHQ events:', error);
    return { success: false, error: error.message, events: [] };
  }
};

// Search events by keyword
export const searchEventsByKeyword = async (keyword, options = {}) => {
  const { limit = 20, latitude, longitude, radius = 50 } = options;
  
  try {
    const startDate = new Date().toISOString();
    const radiusKm = Math.round(radius * 1.60934);
    
    const params = new URLSearchParams({
      limit: limit.toString(),
      sort: 'relevance',
      'start.gte': startDate,
      q: keyword,
      state: 'active,predicted',
    });
    
    if (latitude && longitude) {
      params.append('within', `${radiusKm}km@${latitude},${longitude}`);
    }

    const url = `${BASE_URL}/events/?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${PREDICTHQ_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'API error', events: [] };
    }

    const events = data.results || [];
    const transformedEvents = events.map(transformEvent);
    
    return { success: true, events: transformedEvents };
  } catch (error) {
    console.error('Error searching PredictHQ events:', error);
    return { success: false, error: error.message, events: [] };
  }
};