import { Platform } from 'react-native';

const TICKETMASTER_API_KEY = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY;
const BASE_URL = Platform.OS === 'web' 
  ? 'https://corsproxy.io/?https://app.ticketmaster.com/discovery/v2'
  : 'https://app.ticketmaster.com/discovery/v2';

// Transform Ticketmaster event to your app's format
const transformEvent = (tmEvent) => {
  const venue = tmEvent._embedded?.venues?.[0];
  const priceRange = tmEvent.priceRanges?.[0];
  const classification = tmEvent.classifications?.[0];
  
  // Get the best image (prefer 16:9 ratio, larger size)
  const image = tmEvent.images?.find(img => img.ratio === '16_9' && img.width > 500)
    || tmEvent.images?.[0];

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
    category: classification?.segment?.name || 'Event',
    genre: classification?.genre?.name || '',
    price: priceRange 
      ? (priceRange.min === priceRange.max 
          ? `$${priceRange.min}` 
          : `$${priceRange.min} - $${priceRange.max}`)
      : 'See tickets',
    image: image?.url || 'https://picsum.photos/400/300',
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