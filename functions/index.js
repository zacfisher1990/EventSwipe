const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize app once
if (!admin.apps.length) {
  admin.initializeApp();
}

const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const db = admin.firestore();

// ============================================================
// EXISTING REPORT NOTIFICATION FUNCTIONS
// ============================================================

const ADMIN_EMAIL = 'your-email@example.com'; // Change this!

/**
 * Triggered when a new report is created
 * Sends email notification when an event reaches 3 or 5 reports
 */
exports.onReportCreated = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap, context) => {
    const report = snap.data();
    const eventId = report.eventId;
    
    const reportsSnapshot = await db
      .collection('reports')
      .where('eventId', '==', eventId)
      .get();
    
    const reportCount = reportsSnapshot.size;
    console.log(`Event ${eventId} now has ${reportCount} reports`);
    
    if (reportCount === 3) {
      await sendThresholdNotification(report, reportCount);
    } else if (reportCount === 5) {
      await sendUrgentNotification(report, reportCount);
    }
    
    return null;
  });

async function sendThresholdNotification(report, count) {
  const notification = {
    to: ADMIN_EMAIL,
    message: {
      subject: `⚠️ EventSwipe: Event flagged ${count} times`,
      html: `
        <h2>Event Flagged</h2>
        <p>An event has been flagged ${count} times and is now hidden pending review.</p>
        <p><strong>Event:</strong> ${report.eventTitle}</p>
        <p><strong>Event ID:</strong> ${report.eventId}</p>
        <p><strong>Latest reason:</strong> ${report.reason}</p>
      `,
    },
  };
  
  await db.collection('mail').add(notification);
  console.log(`Sent threshold notification for event: ${report.eventTitle}`);
}

async function sendUrgentNotification(report, count) {
  const notification = {
    to: ADMIN_EMAIL,
    message: {
      subject: `🚨 EventSwipe: Event auto-removed (${count} reports)`,
      html: `
        <h2>Event Auto-Removed</h2>
        <p>An event has been automatically removed after ${count} reports.</p>
        <p><strong>Event:</strong> ${report.eventTitle}</p>
        <p><strong>Event ID:</strong> ${report.eventId}</p>
        <p><strong>Latest reason:</strong> ${report.reason}</p>
      `,
    },
  };
  
  await db.collection('mail').add(notification);
  console.log(`Sent urgent notification for auto-removed event: ${report.eventTitle}`);
}

// ============================================================
// EVENTBRITE SCRAPER FUNCTIONS
// ============================================================

const https = require('https');

const CITIES = [
  // US (minimal - Ticketmaster covers well)
  { name: 'New York', query: 'new-york--ny', lat: 40.7128, lng: -74.0060, limit: 50 },
  { name: 'Los Angeles', query: 'los-angeles--ca', lat: 34.0522, lng: -118.2437, limit: 50 },
  { name: 'Miami', query: 'miami--fl', lat: 25.7617, lng: -80.1918, limit: 50 },
  { name: 'Las Vegas', query: 'las-vegas--nv', lat: 36.1699, lng: -115.1398, limit: 50 },
  { name: 'Portland', query: 'portland--or', lat: 45.5152, lng: -122.6784, limit: 50 },

  // German (de)
  { name: 'Berlin', query: 'berlin--germany', lat: 52.5200, lng: 13.4050, limit: 75 },
  { name: 'Munich', query: 'munich--germany', lat: 48.1351, lng: 11.5820, limit: 50 },
  { name: 'Vienna', query: 'vienna--austria', lat: 48.2082, lng: 16.3738, limit: 50 },

  // Spanish (es)
  { name: 'Madrid', query: 'madrid--spain', lat: 40.4168, lng: -3.7038, limit: 75 },
  { name: 'Barcelona', query: 'barcelona--spain', lat: 41.3851, lng: 2.1734, limit: 75 },
  { name: 'Mexico City', query: 'mexico-city--mexico', lat: 19.4326, lng: -99.1332, limit: 75 },
  { name: 'Buenos Aires', query: 'buenos-aires--argentina', lat: -34.6037, lng: -58.3816, limit: 50 },

  // French (fr)
  { name: 'Paris', query: 'paris--france', lat: 48.8566, lng: 2.3522, limit: 100 },
  { name: 'Montreal', query: 'montreal--canada', lat: 45.5017, lng: -73.5673, limit: 50 },

  // Portuguese (pt)
  { name: 'São Paulo', query: 'sao-paulo--brazil', lat: -23.5505, lng: -46.6333, limit: 75 },
  { name: 'Lisbon', query: 'lisbon--portugal', lat: 38.7223, lng: -9.1393, limit: 50 },
  { name: 'Rio de Janeiro', query: 'rio-de-janeiro--brazil', lat: -22.9068, lng: -43.1729, limit: 50 },

  // Italian (it)
  { name: 'Rome', query: 'rome--italy', lat: 41.9028, lng: 12.4964, limit: 50 },
  { name: 'Milan', query: 'milan--italy', lat: 45.4642, lng: 9.1900, limit: 50 },

  // Polish (pl)
  { name: 'Warsaw', query: 'warsaw--poland', lat: 52.2297, lng: 21.0122, limit: 50 },
  { name: 'Krakow', query: 'krakow--poland', lat: 50.0647, lng: 19.9450, limit: 30 },

  // Turkish (tr)
  { name: 'Istanbul', query: 'istanbul--turkey', lat: 41.0082, lng: 28.9784, limit: 50 },

  // Hebrew (he)
  { name: 'Tel Aviv', query: 'tel-aviv--israel', lat: 32.0853, lng: 34.7818, limit: 50 },

  // Dutch
  { name: 'Amsterdam', query: 'amsterdam--netherlands', lat: 52.3676, lng: 4.9041, limit: 50 },

  // Southeast Asian (th, vi, id)
  { name: 'Bangkok', query: 'bangkok--thailand', lat: 13.7563, lng: 100.5018, limit: 30 },
  { name: 'Singapore', query: 'singapore--singapore', lat: 1.3521, lng: 103.8198, limit: 50 },
  { name: 'Ho Chi Minh City', query: 'ho-chi-minh-city--vietnam', lat: 10.8231, lng: 106.6297, limit: 30 },
  { name: 'Jakarta', query: 'jakarta--indonesia', lat: -6.2088, lng: 106.8456, limit: 30 },

  // East Asian (ja, ko, zh)
  { name: 'Tokyo', query: 'tokyo--japan', lat: 35.6762, lng: 139.6503, limit: 30 },
  { name: 'Seoul', query: 'seoul--south-korea', lat: 37.5665, lng: 126.9780, limit: 30 },
  { name: 'Hong Kong', query: 'hong-kong--hong-kong', lat: 22.3193, lng: 114.1694, limit: 30 },
  { name: 'Taipei', query: 'taipei--taiwan', lat: 25.0330, lng: 121.5654, limit: 30 },

  // UK
  { name: 'London', query: 'london--united-kingdom', lat: 51.5074, lng: -0.1278, limit: 75 },
  { name: 'Manchester', query: 'manchester--united-kingdom', lat: 53.4808, lng: -2.2426, limit: 30 },

  // Australia
  { name: 'Sydney', query: 'sydney--australia', lat: -33.8688, lng: 151.2093, limit: 50 },
  { name: 'Melbourne', query: 'melbourne--australia', lat: -37.8136, lng: 144.9631, limit: 50 },
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 30000,
    };

    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchPage(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract JSON object from string starting at a position by counting braces
 */
function extractJsonObject(str, startIndex) {
  let depth = 0;
  let inString = false;
  let escape = false;
  
  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    
    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        return str.substring(startIndex, i + 1);
      }
    }
  }
  return null;
}

function parseEvents(html, city) {
  const events = [];
  
  // Method 1: window.__SERVER_DATA__ with jsonld array (primary method)
  const serverDataStart = html.indexOf('window.__SERVER_DATA__ = {');
  if (serverDataStart !== -1) {
    const jsonStart = html.indexOf('{', serverDataStart);
    const jsonString = extractJsonObject(html, jsonStart);
    
    if (jsonString) {
      try {
        const serverData = JSON.parse(jsonString);
      
      // Check for jsonld array with itemListElement
      if (serverData.jsonld && Array.isArray(serverData.jsonld)) {
        for (const jsonldItem of serverData.jsonld) {
          if (jsonldItem.itemListElement && Array.isArray(jsonldItem.itemListElement)) {
            for (const listItem of jsonldItem.itemListElement) {
              if (listItem.item && listItem.item['@type'] === 'Event') {
                events.push(parseJsonLdEvent(listItem.item, city));
              }
            }
          }
        }
      }
      
      // Also check search_data.events.results (alternate format)
      if (serverData.search_data?.events?.results) {
        for (const event of serverData.search_data.events.results) {
          events.push(parseServerDataEvent(event, city));
        }
      }
      } catch (e) { 
        console.error('Error parsing SERVER_DATA:', e.message);
      }
    }
  }

  // Method 2: Standalone JSON-LD script tags (fallback)
  const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let match;
  
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      
      for (const item of items) {
        if (item['@type'] === 'Event' && item.name) {
          // Check if we already have this event
          const existingIds = events.map(e => e.externalId);
          const parsed = parseJsonLdEvent(item, city);
          if (parsed.externalId && !existingIds.includes(parsed.externalId)) {
            events.push(parsed);
          }
        }
      }
    } catch (e) { /* continue */ }
  }

  return events.filter(e => e.externalId && e.title);
}

function parseJsonLdEvent(item, city) {
  let imageUrl = null;
  if (item.image) {
    imageUrl = typeof item.image === 'string' ? item.image : item.image.url || item.image[0];
  }

  // Extract event ID from URL (e.g., tickets-1977459767396 -> 1977459767396)
  let externalId = null;
  if (item.url) {
    const idMatch = item.url.match(/tickets?-(\d+)/);
    if (idMatch) externalId = idMatch[1];
    // Fallback: try end of URL
    if (!externalId) {
      const fallbackMatch = item.url.match(/(\d+)(?:\?|$)/);
      if (fallbackMatch) externalId = fallbackMatch[1];
    }
  }

  // Extract time from raw ISO string BEFORE converting to Date
  // e.g. "2026-02-08T19:00:00-08:00" → "7:00 PM"
  let timeString = null;
  if (item.startDate && item.startDate.includes('T')) {
    const timeMatch = item.startDate.match(/T(\d{2}):(\d{2})/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2];
      if (hours !== 0 || minutes !== '00') { // Skip midnight (likely means no time provided)
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        timeString = `${displayHours}:${minutes} ${ampm}`;
      }
    }
  }

  // Extract location with geo coordinates if available
  let lat = city.lat;
  let lng = city.lng;
  let venueName = null;
  let venueAddress = null;

  if (item.location) {
    venueName = item.location.name || null;
    
    // Get geo coordinates
    if (item.location.geo) {
      lat = parseFloat(item.location.geo.latitude) || city.lat;
      lng = parseFloat(item.location.geo.longitude) || city.lng;
    }
    
    // Build address string
    if (item.location.address) {
      const addr = item.location.address;
      if (typeof addr === 'string') {
        venueAddress = addr;
      } else {
        const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean);
        venueAddress = parts.join(', ');
      }
    }
  }

  return {
    externalId,
    title: item.name,
    description: item.description?.substring(0, 2000) || null,
    imageUrl,
    startDate: item.startDate ? new Date(item.startDate) : null,
    endDate: item.endDate ? new Date(item.endDate) : null,
    time: timeString,
    venueName,
    venueAddress,
    url: item.url,
    city: city.name,
    source: 'eventbrite',
    location: { latitude: lat, longitude: lng },
  };
}

function parseServerDataEvent(event, city) {
  // Extract time from raw date string before converting to Date
  let timeString = null;
  const rawDate = event.start_date || '';
  if (rawDate.includes('T')) {
    const timeMatch = rawDate.match(/T(\d{2}):(\d{2})/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2];
      if (hours !== 0 || minutes !== '00') {
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        timeString = `${displayHours}:${minutes} ${ampm}`;
      }
    }
  }

  return {
    externalId: event.id?.toString(),
    title: event.name,
    description: event.summary?.substring(0, 2000) || null,
    imageUrl: event.image?.url || null,
    startDate: event.start_date ? new Date(event.start_date) : null,
    endDate: event.end_date ? new Date(event.end_date) : null,
    time: timeString,
    venueName: event.primary_venue?.name || null,
    venueAddress: event.primary_venue?.address?.localized_address_display || null,
    url: event.url,
    city: city.name,
    source: 'eventbrite',
    location: {
      latitude: event.primary_venue?.address?.latitude || city.lat,
      longitude: event.primary_venue?.address?.longitude || city.lng,
    },
    isFree: event.ticket_availability?.is_free || false,
    minPrice: event.ticket_availability?.minimum_ticket_price?.major_value || null,
    maxPrice: event.ticket_availability?.maximum_ticket_price?.major_value || null,
    currency: event.ticket_availability?.minimum_ticket_price?.currency || null,
  };
}

async function scrapeCity(city) {
  const url = `https://www.eventbrite.com/d/${city.query}/events/`;
  console.log(`Scraping ${city.name}: ${url}`);
  
  try {
    const html = await fetchPage(url);
    const events = parseEvents(html, city);
    const limitedEvents = events.slice(0, city.limit);
    console.log(`Found ${events.length} events in ${city.name}, keeping ${limitedEvents.length}`);
    return limitedEvents;
  } catch (error) {
    console.error(`Failed to scrape ${city.name}:`, error.message);
    return [];
  }
}

// ============================================================
// SMART EVENT CATEGORIZATION
// ============================================================
// Maps events to EventSwipe categories based on title, description, and venue
// Categories: music, food, sports, arts, nightlife, fitness, comedy, networking, family, outdoor

const CATEGORY_RULES = [
  {
    category: 'music',
    keywords: [
      'concert', 'live music', 'dj set', 'music festival', 'orchestra', 'symphony',
      'jazz', 'hip hop', 'hip-hop', 'rap ', 'r&b', 'rock ', 'indie ', 'edm',
      'techno', 'house music', 'band ', 'singer', 'songwriter', 'album release',
      'karaoke', 'open mic music', 'rave', 'beatbox', 'acappella', 'a cappella',
      'choir', 'opera ', 'recital', 'philharmonic', 'vinyl', 'listening party',
      'afrobeats', 'reggae', 'salsa music', 'latin music', 'k-pop', 'kpop',
      'drum circle', 'jam session', 'open jam', 'bluegrass', 'folk music',
      'country music', 'punk ', 'metal ', 'soul music', 'funk ',
    ],
    venueKeywords: [
      'music hall', 'concert hall', 'jazz club', 'live music', 'amphitheater',
      'arena', 'records', 'vinyl', 'studio ',
    ],
  },
  {
    category: 'sports',
    keywords: [
      'game day', 'match day', 'playoff', 'championship',
      'tournament', 'baseball', 'basketball', 'football', 'soccer', 'hockey',
      'tennis', 'golf', 'boxing', 'mma', 'ufc', 'wrestling', 'cricket',
      'rugby', 'volleyball', 'lacrosse', 'track and field', 'swimming meet',
      'marathon', 'half marathon', '5k run', '10k run', 'triathlon',
      'yankees', 'mets', 'knicks', 'nets', 'rangers', 'islanders',
      'giants', 'jets', 'liberty', 'nycfc', 'red bulls',
      'lakers', 'celtics', 'warriors', 'dodgers', 'padres', 'cubs',
      'red sox', 'white sox', 'braves', 'phillies', 'astros',
      'timbers', 'thorns', 'trail blazers', 'blazers',
      'nba', 'nfl', 'mlb', 'nhl', 'mls', 'wnba',
      'world series', 'super bowl', 'world cup',
      'skating competition', 'fencing', 'archery competition',
    ],
    venueKeywords: [
      'stadium', 'ballpark', 'coliseum', 'sportsplex', 'athletic',
      'providence park', 'moda center',
    ],
  },
  {
    category: 'comedy',
    keywords: [
      'comedy', 'stand-up', 'stand up', 'standup', 'comedian', 'improv',
      'sketch comedy', 'roast', 'comedic', 'funny', 'humor',
      'comic ', 'comics ', 'open mic comedy', 'comedy night', 'comedy show',
      'satire', 'parody', 'comedians',
    ],
    venueKeywords: [
      'comedy club', 'comedy cellar', 'laugh factory', 'improv', 'funny',
      'stand up ny', 'gotham comedy', 'comic strip', 'helium comedy',
    ],
  },
  {
    category: 'arts',
    keywords: [
      // Visual arts & exhibits
      'art exhibit', 'exhibition', 'gallery', 'museum', 'visual art',
      'photography', 'painting', 'sculpture', 'installation', 'mural',
      'art show', 'art walk', 'art fair', 'open studio',
      // Performing arts
      'theater', 'theatre', 'broadway', 'off-broadway', 'musical',
      'ballet', 'dance performance', 'dance show', 'contemporary dance',
      'play ', 'drama ', 'performance art', 'puppet', 'magic show',
      'burlesque', 'immersive', 'variety show', 'talent show',
      // Film & cinema
      'film screening', 'screening', 'cinema', 'movie night', 'movie',
      'documentary', 'short film', 'film festival', 'imax',
      // Literary
      'poetry', 'spoken word', 'book reading', 'book signing', 'author',
      'literary', 'book club', 'book launch', 'writing workshop',
      'zine', 'storytelling',
      // Crafts & workshops (creative/hands-on)
      'craft', 'crafts', 'crafting', 'knitting', 'crochet', 'sewing',
      'quilting', 'embroidery', 'needlework', 'weaving', 'fiber art',
      'darning', 'darn', 'mending', 'textile',
      'pottery', 'ceramics', 'clay', 'woodworking', 'woodcraft',
      'printmaking', 'letterpress', 'calligraphy', 'hand lettering',
      'jewelry making', 'beading', 'glassblowing', 'glass art',
      'floral arrangement', 'flower arranging', 'terrarium',
      'candle making', 'soap making', 'dyeing', 'tie dye', 'batik',
      'art class', 'art workshop', 'craft workshop', 'craft class',
      'creative workshop', 'diy workshop', 'diy class', 'make your own',
      'paint and sip', 'paint night', 'sketch', 'drawing class',
      'watercolor', 'acrylic', 'mixed media',
      // Cultural
      'cultural', 'anime', 'cosplay', 'comic con',
      // Photography
      'portrait', 'photo shoot', 'photoshoot', 'photo meet', 'photo walk',
      'headshot', 'photography meet', 'model call', 'photographer',
      'editorial shoot', 'styled shoot', 'creative shoot',
    ],
    venueKeywords: [
      'theater', 'theatre', 'gallery', 'museum', 'arts center', 'cinema',
      'playhouse', 'cultural center', 'library', 'bookstore', 'imax',
      'amc', 'regal', 'art space', 'makerspace', 'maker space',
      'craft studio', 'pottery studio', 'art studio', 'photo studio',
      'works studio', 'creative studio',
    ],
  },
  {
    category: 'food',
    keywords: [
      'food festival', 'food truck', 'tasting', 'wine tasting', 'beer tasting',
      'cocktail', 'brunch', 'dinner party', 'supper club', 'cooking class',
      'chef ', 'culinary', 'bake', 'baking', 'food tour', 'restaurant week',
      'happy hour', 'wine ', 'beer fest', 'craft beer', 'spirits',
      'whiskey', 'bourbon', 'mezcal', 'sake', 'dim sum', 'ramen',
      'pop-up dinner', 'pop up dinner', 'farm to table', 'food and drink',
      'cider', 'kombucha', 'tea tasting', 'coffee tasting',
      'chocolate', 'cheese', 'charcuterie', 'potluck',
      'fermentation', 'sourdough', 'bread making',
    ],
    venueKeywords: [
      'restaurant', 'brewery', 'distillery', 'winery', 'kitchen',
      'bakery', 'cafe', 'bar ', 'tavern', 'bistro', 'eatery',
      'taproom', 'tasting room', 'food hall', 'cidery',
    ],
  },
  {
    category: 'nightlife',
    keywords: [
      'club night', 'night out', 'nightclub', 'dance party', 'afterparty',
      'after party', 'ladies night', 'bottle service', 'vip night',
      'glow party', 'silent disco', 'pool party', 'rooftop party',
      'day party', 'dayparty', 'bar crawl', 'pub crawl', 'lounge',
      'drag show', 'drag brunch', 'cabaret', 'dance floor',
      'neon party', 'foam party', 'theme party',
    ],
    venueKeywords: [
      'nightclub', 'club', 'lounge', 'rooftop', 'bar ', 'pub ',
      'disco', 'dance hall',
    ],
  },
  {
    category: 'fitness',
    keywords: [
      'yoga', 'pilates', 'crossfit', 'bootcamp', 'boot camp', 'spin class',
      'cycling class', 'barre', 'zumba', 'hiit', 'meditation', 'wellness',
      'workout', 'fitness class', 'gym ', 'training session', 'martial arts',
      'kickboxing', 'tai chi', 'stretch', 'health and wellness',
      'sound bath', 'breathwork', 'mindfulness', 'reiki', 'qi gong',
      'dance class', 'dance workshop', 'salsa class', 'bachata class',
      'self care', 'self-care', 'holistic', 'healing circle',
    ],
    venueKeywords: [
      'gym', 'fitness', 'wellness center', 'yoga studio',
      'crossfit', 'dojo', 'dance studio',
    ],
  },
  {
    category: 'networking',
    keywords: [
      // Professional networking
      'networking', 'mixer', 'conference', 'summit',
      'seminar', 'webinar', 'panel discussion', 'fireside chat',
      'pitch night', 'startup', 'entrepreneur', 'professional',
      'career fair', 'job fair', 'hackathon', 'tech talk', 'industry',
      'leadership', 'masterclass', 'lunch and learn', 'speed networking',
      'coworking', 'business workshop',
      // Social meetups & community gatherings
      'meetup', 'meet up', 'meet and greet', 'social hour', 'social night',
      'mingle', 'mixer', 'get together', 'get-together', 'hangout',
      'hang out', 'chat ', 'community gathering', 'community event',
      'community meetup', 'monthly gathering', 'weekly gathering',
      'circle ', 'support group', 'discussion group', 'peer group',
      'interest group', 'club meeting', 'chapter meeting',
      'open house', 'welcome event', 'intro night', 'introduction to',
      'make new friends', 'new friends', 'social club',
      'ladies circle', 'mens group', "men's group", "women's group",
      'womens group', 'singles event', 'singles night',
      'speed dating', 'date night',
    ],
    venueKeywords: [
      'conference center', 'convention center', 'coworking', 'wework',
      'hotel ballroom', 'community center', 'community hall',
      'meeting room', 'event space',
    ],
  },
  {
    category: 'family',
    keywords: [
      'kids', 'children', 'family friendly', 'family-friendly', 'toddler',
      'baby ', 'storytime', 'story time', 'puppet show', 'petting zoo',
      'face painting', 'balloon', 'easter egg', 'trick or treat',
      'santa ', 'holiday celebration', 'carnival', 'circus',
      'family fun', 'all ages', 'kid-friendly', 'mommy and me',
      'daddy and me', 'parent and child', 'family day',
      'teen night', 'youth ', 'junior ',
    ],
    venueKeywords: [
      'children museum', 'kids', 'playground', 'family center',
      'aquarium', 'zoo ', 'science center', 'discovery center',
    ],
  },
  {
    category: 'outdoor',
    keywords: [
      'hiking', 'hike', 'trail ', 'camping', 'kayak', 'canoe', 'paddle',
      'bike ride', 'cycling tour', 'nature walk', 'bird watching',
      'birdwatching', 'stargazing', 'outdoor adventure', 'rock climbing',
      'surfing', 'fishing', 'sailing', 'beach ', 'garden tour',
      'botanical', 'farmers market', 'flea market', 'street fair',
      'block party', 'outdoor festival', 'picnic', 'foraging',
      'mushroom walk', 'nature tour', 'wildflower', 'tide pool',
      'clean up', 'cleanup', 'tree planting', 'park walk',
    ],
    venueKeywords: [
      'park', 'garden', 'beach', 'trail', 'pier', 'waterfront',
      'outdoor', 'farm ', 'forest', 'nature center', 'botanical garden',
    ],
  },
];

function categorizeEvent(event) {
  const title = (event.title || '').toLowerCase();
  const description = (event.description || '').toLowerCase();
  const venue = (event.venueName || '').toLowerCase();
  const venueAddress = (event.venueAddress || '').toLowerCase();
  
  // Score each category
  const scores = CATEGORY_RULES.map(rule => {
    let score = 0;
    
    // Title matches are worth the most (3 points each)
    for (const kw of rule.keywords) {
      if (title.includes(kw.trim())) score += 3;
    }
    
    // Description matches (1 point each)
    for (const kw of rule.keywords) {
      if (description.includes(kw.trim())) score += 1;
    }
    
    // Venue name matches (2 points each)
    for (const kw of (rule.venueKeywords || [])) {
      if (venue.includes(kw.trim())) score += 2;
      if (venueAddress.includes(kw.trim())) score += 1;
    }
    
    return { category: rule.category, score };
  });
  
  // Pick the highest-scoring category
  scores.sort((a, b) => b.score - a.score);
  
  if (scores[0].score > 0) {
    return scores[0].category;
  }
  
  return 'other';
}

async function storeEvents(events) {
  if (events.length === 0) return 0;

  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  let stored = 0;
  
  for (let i = 0; i < events.length; i += 500) {
    const batch = db.batch();
    const chunk = events.slice(i, i + 500);
    
    for (const event of chunk) {
      if (!event.externalId) continue;
      
      const eventId = `eb_${event.externalId}`;
      const ref = db.collection('events').doc(eventId);

      // Smart categorization based on title, description, and venue
      const category = categorizeEvent(event);

      // Format date as YYYY-MM-DD string (what the app expects)
      let dateStr = null;
      if (event.startDate) {
        const d = new Date(event.startDate);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().split('T')[0];
        }
      }
      
      batch.set(ref, {
        id: eventId,
        externalId: event.externalId,
        title: event.title,
        description: event.description || null,
        image: event.imageUrl || null,
        date: dateStr,
        time: event.time || null,
        startDate: event.startDate || null,
        endDate: event.endDate || null,
        venueName: event.venueName || null,
        location: event.venueAddress || event.venueName || null,
        latitude: event.location?.latitude || null,
        longitude: event.location?.longitude || null,
        url: event.url || null,
        ticketUrl: event.url || null,
        city: event.city,
        source: 'eventbrite',
        category: category,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        scrapedAt: FieldValue.serverTimestamp(),
        expiresAt: event.endDate || thirtyDaysFromNow,
        isFree: event.isFree || false,
        minPrice: event.minPrice || null,
        maxPrice: event.maxPrice || null,
        currency: event.currency || null,
      }, { merge: true });
      
      stored++;
    }
    
    await batch.commit();
  }
  
  return stored;
}

/**
 * Scheduled scraper - runs weekly on Sunday at 3 AM UTC
 */
exports.scrapeEventbrite = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub
  .schedule('every sunday 03:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting weekly Eventbrite scrape...');
    
    let totalEvents = 0;
    const results = [];
    
    for (const city of CITIES) {
      try {
        const events = await scrapeCity(city);
        
        if (events.length > 0) {
          const stored = await storeEvents(events);
          totalEvents += stored;
          results.push({ city: city.name, found: events.length, stored });
        } else {
          results.push({ city: city.name, found: 0, stored: 0 });
        }
        
        await delay(3000 + Math.random() * 2000);
        
      } catch (error) {
        console.error(`Error processing ${city.name}:`, error);
        results.push({ city: city.name, error: error.message });
      }
    }
    
    console.log(`Scrape complete! Total events stored: ${totalEvents}`);
    
    await db.collection('scrapeLog').add({
      timestamp: FieldValue.serverTimestamp(),
      totalEvents,
      results,
      source: 'eventbrite',
    });
    
    return null;
  });

/**
 * Manual trigger for testing
 */
exports.scrapeEventbriteManual = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data, context) => {
    const cityName = data?.city;
    const citiesToScrape = cityName 
      ? CITIES.filter(c => c.name.toLowerCase() === cityName.toLowerCase())
      : CITIES.slice(0, 3);
    
    if (cityName && citiesToScrape.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', `City not found: ${cityName}`);
    }
    
    console.log(`Manual scrape: ${citiesToScrape.map(c => c.name).join(', ')}`);
    
    let totalEvents = 0;
    const results = [];
    
    for (const city of citiesToScrape) {
      const events = await scrapeCity(city);
      if (events.length > 0) {
        const stored = await storeEvents(events);
        totalEvents += stored;
        results.push({ city: city.name, found: events.length, stored });
      }
      await delay(2000);
    }
    
    return { totalEvents, results };
  });

/**
 * Cleanup expired scraped events - runs daily
 */
exports.cleanupExpiredScrapedEvents = functions.pubsub
  .schedule('every day 04:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    const now = Timestamp.now();
    
    const expired = await db.collection('events')
      .where('source', '==', 'eventbrite')
      .where('expiresAt', '<', now)
      .limit(500)
      .get();
    
    if (expired.empty) {
      console.log('No expired Eventbrite events to clean up');
      return null;
    }
    
    const batch = db.batch();
    expired.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    console.log(`Cleaned up ${expired.size} expired Eventbrite events`);
    return null;
  });