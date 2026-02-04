const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

// ============================================================
// CONFIGURATION
// ============================================================

const ADMIN_EMAIL = 'support@proxtrades.com';

// API Keys - set with: firebase functions:config:set ticketmaster.key="XXX" seatgeek.client_id="YYY"
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const SEATGEEK_CLIENT_ID = process.env.SEATGEEK_CLIENT_ID;

// Cache settings
const CACHE_TTL_HOURS = 6;
const CACHE_COLLECTION = 'eventCache';

// ============================================================
// REPORT NOTIFICATION FUNCTIONS (existing)
// ============================================================

/**
 * Triggered when a new report is created
 * Sends email notification when an event reaches 3 reports
 */
exports.onReportCreated = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap, context) => {
    const report = snap.data();
    const eventId = report.eventId;
    
    // Count total reports for this event
    const reportsSnapshot = await db
      .collection('reports')
      .where('eventId', '==', eventId)
      .get();
    
    const reportCount = reportsSnapshot.size;
    
    console.log(`Event ${eventId} now has ${reportCount} reports`);
    
    // Send notification at threshold
    if (reportCount === 3) {
      await sendThresholdNotification(report, reportCount);
    } else if (reportCount === 5) {
      await sendUrgentNotification(report, reportCount);
    }
    
    return null;
  });

/**
 * Send notification when event hits 3 reports
 */
async function sendThresholdNotification(report, count) {
  const notification = {
    to: ADMIN_EMAIL,
    message: {
      subject: `⚠️ EventSwipe: Event flagged ${count} times`,
      html: `
        <h2>Event Report Alert</h2>
        <p>An event has been reported <strong>${count} times</strong> and needs review.</p>
        
        <h3>Event Details:</h3>
        <ul>
          <li><strong>Title:</strong> ${report.eventTitle || 'Unknown'}</li>
          <li><strong>Event ID:</strong> ${report.eventId}</li>
          <li><strong>Date:</strong> ${report.eventDate || 'N/A'}</li>
          <li><strong>Location:</strong> ${report.eventLocation || 'N/A'}</li>
          <li><strong>Source:</strong> ${report.eventSource || 'N/A'}</li>
        </ul>
        
        <h3>Latest Report:</h3>
        <ul>
          <li><strong>Reason:</strong> ${report.reason}</li>
          <li><strong>Details:</strong> ${report.details || 'None provided'}</li>
        </ul>
        
        <p><a href="https://console.firebase.google.com/project/eventswipe-6a924/firestore/data/~2Freports">
          View in Firebase Console
        </a></p>
      `,
    },
  };
  
  // Save to 'mail' collection - requires Firebase Trigger Email extension
  await db.collection('mail').add(notification);
  
  console.log(`Sent threshold notification for event: ${report.eventTitle}`);
}

/**
 * Send urgent notification when event hits 5 reports (auto-removed)
 */
async function sendUrgentNotification(report, count) {
  const notification = {
    to: ADMIN_EMAIL,
    message: {
      subject: `🚨 EventSwipe: Event AUTO-REMOVED (${count} reports)`,
      html: `
        <h2>Event Auto-Removed</h2>
        <p>An event has been <strong>automatically removed</strong> after receiving ${count} reports.</p>
        
        <h3>Event Details:</h3>
        <ul>
          <li><strong>Title:</strong> ${report.eventTitle || 'Unknown'}</li>
          <li><strong>Event ID:</strong> ${report.eventId}</li>
          <li><strong>Date:</strong> ${report.eventDate || 'N/A'}</li>
          <li><strong>Location:</strong> ${report.eventLocation || 'N/A'}</li>
          <li><strong>Source:</strong> ${report.eventSource || 'N/A'}</li>
        </ul>
        
        <p>The event has been hidden from users. Review the reports and take further action if needed.</p>
        
        <p><a href="https://console.firebase.google.com/project/eventswipe-6a924/firestore/data/~2Freports">
          View in Firebase Console
        </a></p>
      `,
    },
  };
  
  await db.collection('mail').add(notification);
  
  console.log(`Sent urgent notification for auto-removed event: ${report.eventTitle}`);
}

// ============================================================
// EVENT CACHING FUNCTIONS (new)
// ============================================================

// Round coordinates to create cache key (~7 mile precision)
const createCacheKey = (lat, lng, radius) => {
  const precision = 1;
  const roundedLat = Math.round(lat * Math.pow(10, precision)) / Math.pow(10, precision);
  const roundedLng = Math.round(lng * Math.pow(10, precision)) / Math.pow(10, precision);
  return `${roundedLat}_${roundedLng}_${radius}`;
};

// Check if cache is still fresh
const isCacheFresh = (cachedAt) => {
  if (!cachedAt) return false;
  const cacheTime = cachedAt.toDate ? cachedAt.toDate() : new Date(cachedAt);
  const now = new Date();
  const hoursSinceCached = (now - cacheTime) / (1000 * 60 * 60);
  return hoursSinceCached < CACHE_TTL_HOURS;
};

// Fetch from Ticketmaster
const fetchTicketmaster = async (lat, lng, radius) => {
  if (!TICKETMASTER_API_KEY) {
    console.log('Ticketmaster API key not configured');
    return [];
  }

  try {
    const startDateTime = new Date().toISOString().slice(0, 19) + 'Z';
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&size=100&sort=date,asc&startDateTime=${startDateTime}&latlong=${lat},${lng}&radius=${radius}&unit=miles`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('Ticketmaster API error:', data);
      return [];
    }

    const events = data._embedded?.events || [];
    return events.map(event => transformTicketmasterEvent(event));
  } catch (error) {
    console.error('Ticketmaster fetch error:', error);
    return [];
  }
};

// Fetch from SeatGeek
const fetchSeatGeek = async (lat, lng, radius) => {
  if (!SEATGEEK_CLIENT_ID) {
    console.log('SeatGeek client ID not configured');
    return [];
  }

  try {
    const url = `https://api.seatgeek.com/2/events?client_id=${SEATGEEK_CLIENT_ID}&per_page=100&sort=datetime_local.asc&lat=${lat}&lon=${lng}&range=${radius}mi`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('SeatGeek API error:', data);
      return [];
    }

    return (data.events || []).map(event => transformSeatGeekEvent(event));
  } catch (error) {
    console.error('SeatGeek fetch error:', error);
    return [];
  }
};

// Transform Ticketmaster event to standard format
const transformTicketmasterEvent = (event) => {
  const venue = event._embedded?.venues?.[0];
  const priceRange = event.priceRanges?.[0];
  const classification = event.classifications?.[0];

  // Get best image
  let image = null;
  if (event.images?.length > 0) {
    const best = event.images.find(img => img.ratio === '16_9' && img.width > 500)
      || event.images.find(img => img.ratio === '16_9')
      || event.images[0];
    image = best?.url;
  }

  // Map category
  const segment = classification?.segment?.name?.toLowerCase() || '';
  const genre = classification?.genre?.name?.toLowerCase() || '';
  let category = 'other';
  if (genre === 'comedy' || event.name?.toLowerCase().includes('comedy')) {
    category = 'comedy';
  } else if (segment === 'music') {
    category = 'music';
  } else if (segment === 'sports') {
    category = 'sports';
  } else if (segment === 'arts & theatre') {
    category = 'arts';
  }

  return {
    id: event.id,
    title: event.name,
    date: event.dates?.start?.localDate || '',
    time: event.dates?.start?.localTime?.slice(0, 5) || '',
    location: venue?.name || '',
    city: venue?.city?.name || '',
    state: venue?.state?.stateCode || '',
    address: venue?.address?.line1 || '',
    latitude: parseFloat(venue?.location?.latitude) || null,
    longitude: parseFloat(venue?.location?.longitude) || null,
    category: category,
    price: priceRange
      ? (priceRange.min === priceRange.max
          ? `$${priceRange.min}`
          : `$${priceRange.min} - $${priceRange.max}`)
      : null,
    image: image,
    ticketUrl: event.url || '',
    source: 'ticketmaster',
    venueName: venue?.name || '',
  };
};

// Transform SeatGeek event to standard format
const transformSeatGeekEvent = (event) => {
  const venue = event.venue || {};
  const performers = event.performers || [];
  const taxonomies = event.taxonomies || [];

  // Get image from performers
  let image = null;
  for (const performer of performers) {
    if (performer.image) {
      image = performer.image;
      break;
    }
  }

  // Map category
  const taxonomy = taxonomies[0]?.name?.toLowerCase() || '';
  let category = 'other';
  if (taxonomy.includes('comedy')) {
    category = 'comedy';
  } else if (taxonomy.includes('concert') || taxonomy.includes('music')) {
    category = 'music';
  } else if (taxonomy.includes('sport') || taxonomy.includes('nfl') || taxonomy.includes('nba') || taxonomy.includes('mlb')) {
    category = 'sports';
  } else if (taxonomy.includes('theater') || taxonomy.includes('broadway')) {
    category = 'arts';
  } else if (taxonomy.includes('family')) {
    category = 'family';
  }

  const dateTimeLocal = event.datetime_local || '';

  return {
    id: `sg_${event.id}`,
    title: event.title || event.short_title || '',
    date: dateTimeLocal ? dateTimeLocal.split('T')[0] : '',
    time: dateTimeLocal ? dateTimeLocal.split('T')[1]?.slice(0, 5) : '',
    location: venue.name || '',
    city: venue.city || '',
    state: venue.state || '',
    address: venue.address || '',
    latitude: parseFloat(venue.location?.lat) || null,
    longitude: parseFloat(venue.location?.lon) || null,
    category: category,
    price: event.stats?.lowest_price ? `$${event.stats.lowest_price}` : null,
    image: image,
    ticketUrl: event.url || '',
    source: 'seatgeek',
    venueName: venue.name || '',
  };
};

/**
 * Main cached event fetching function
 * Called by the app to get events for a location
 */
exports.getEventsForLocation = functions.https.onCall(async (data, context) => {
  const { latitude, longitude, radius = 50 } = data;

  if (!latitude || !longitude) {
    throw new functions.https.HttpsError('invalid-argument', 'latitude and longitude are required');
  }

  const cacheKey = createCacheKey(latitude, longitude, radius);
  console.log(`Cache key: ${cacheKey}`);

  // Check cache first
  try {
    const cacheRef = db.collection(CACHE_COLLECTION).doc(cacheKey);
    const cacheDoc = await cacheRef.get();

    if (cacheDoc.exists && isCacheFresh(cacheDoc.data().cachedAt)) {
      console.log(`Cache HIT for ${cacheKey}`);
      return {
        success: true,
        events: cacheDoc.data().events,
        fromCache: true,
        cachedAt: cacheDoc.data().cachedAt.toDate().toISOString(),
      };
    }

    console.log(`Cache MISS for ${cacheKey}, fetching from APIs...`);
  } catch (cacheError) {
    console.error('Cache read error:', cacheError);
  }

  // Fetch from both APIs in parallel
  const [tmEvents, sgEvents] = await Promise.all([
    fetchTicketmaster(latitude, longitude, radius),
    fetchSeatGeek(latitude, longitude, radius),
  ]);

  console.log(`Fetched ${tmEvents.length} from Ticketmaster, ${sgEvents.length} from SeatGeek`);

  const allEvents = [...tmEvents, ...sgEvents];

  // Save to cache
  try {
    const cacheRef = db.collection(CACHE_COLLECTION).doc(cacheKey);
    await cacheRef.set({
      events: allEvents,
      cachedAt: admin.firestore.FieldValue.serverTimestamp(),
      latitude,
      longitude,
      radius,
    });
    console.log(`Cached ${allEvents.length} events for ${cacheKey}`);
  } catch (cacheWriteError) {
    console.error('Cache write error:', cacheWriteError);
  }

  return {
    success: true,
    events: allEvents,
    fromCache: false,
  };
});

/**
 * Scheduled cleanup of expired cache entries
 * Runs daily to remove old cached data
 */
exports.cleanupExpiredCache = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - (CACHE_TTL_HOURS * 2));

    try {
      const snapshot = await db.collection(CACHE_COLLECTION)
        .where('cachedAt', '<', cutoff)
        .get();

      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      console.log(`Cleaned up ${snapshot.size} expired cache entries`);
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  });