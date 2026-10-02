const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize app once
if (!admin.apps.length) {
  admin.initializeApp();
}

const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const db = admin.firestore();

// Upper limits on how many copies of each function can run at once, so a bug
// or abuse can't scale (and bill) without bound. Requests beyond the cap wait
// or are rejected; raise these if real traffic outgrows them.
const API_LIMITS = { minInstances: 1, maxInstances: 20, secrets: ['VIATOR_API_KEY'] }; // called by the app; 1 kept warm
const TRIGGER_LIMITS = { maxInstances: 5 };               // Firestore / Auth triggers
const SCHEDULED_LIMITS = { maxInstances: 1 };             // cron jobs

// ============================================================
// EXISTING REPORT NOTIFICATION FUNCTIONS
// ============================================================

const ADMIN_EMAIL = 'zcfshr@gmail.com';

/**
 * Triggered when a new report is created
 * Sends email notification when an event reaches 3 or 5 reports
 */
exports.onReportCreated = functions.runWith(TRIGGER_LIMITS).firestore
  .document('reports/{reportId}')
  .onCreate(async (snap, context) => {
    const report = snap.data();
    const eventId = report.eventId;
    
    const reportsSnapshot = await db
      .collection('reports')
      .where('eventId', '==', eventId)
      .get();
    
    // Guest (anonymous) accounts are free to create, so only reports from
    // real accounts count toward hiding/removing an event.
    const reporterIds = [...new Set(reportsSnapshot.docs.map((d) => d.get('reporterId')).filter(Boolean))];
    let reportCount = 0;
    for (let i = 0; i < reporterIds.length; i += 100) {
      const { users } = await admin.auth().getUsers(
        reporterIds.slice(i, i + 100).map((uid) => ({ uid }))
      );
      reportCount += users.filter((u) => u.providerData.length > 0).length;
    }
    console.log(`Event ${eventId} now has ${reportCount} reports from accounts (${reportsSnapshot.size} total)`);

    // Update the event itself (only exists for user-posted/scraped events, not
    // live API events). Done here because clients can't read other users'
    // reports or update events they don't own. The feed filters on `active`,
    // so hiding must flip that — `status` alone isn't read anywhere.
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();
    if (eventDoc.exists) {
      const update = { reportCount };
      if (reportCount >= 5) {
        update.status = 'removed';
        update.active = false;
        update.removedReason = 'auto_reported';
        update.removedAt = FieldValue.serverTimestamp();
      } else if (reportCount >= 3) {
        update.status = 'hidden_review';
        update.active = false;
        update.flaggedAt = FieldValue.serverTimestamp();
      }
      await eventRef.update(update);
    }

    if (reportCount === 3) {
      await sendThresholdNotification(report, reportCount);
    } else if (reportCount === 5) {
      await sendUrgentNotification(report, reportCount);
    }
    
    return null;
  });

/**
 * When an auth account is deleted (including guests cleaned up after signing
 * in to an existing account), remove its Firestore doc and its comments.
 */
exports.onUserDeleted = functions.runWith(TRIGGER_LIMITS).auth.user().onDelete(async (user) => {
  await db.collection('users').doc(user.uid).delete();

  // Batches hold at most 500 writes
  while (true) {
    const comments = await db.collection('comments').where('authorId', '==', user.uid).limit(500).get();
    if (comments.empty) break;
    const batch = db.batch();
    comments.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  return null;
});

// ============================================================
// COMMENT MODERATION
// Clients can only create and delete their own comments (firestore.rules);
// hiding is done here. Keep the word list in sync with src/utils/moderation.js.
// ============================================================

const COMMENT_HIDE_THRESHOLD = 3;

const BLOCKED_WORDS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch',
  'asshole', 'cunt', 'whore', 'slut', 'faggot', 'fag', 'nigger', 'nigga',
  'retard', 'kike', 'spic', 'chink', 'tranny', 'wetback',
];
const BLOCKED_PREFIXES = ['fuck', 'nigg', 'fagg'];
const LINK_PATTERN = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|ly|me|app|xyz|info|biz|ru|cn|link|shop)\b/i;

const moderationProblem = (text) => {
  const normalized = (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o').replace(/[$5]/g, 's');
  const words = normalized.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => BLOCKED_WORDS.includes(w) || BLOCKED_PREFIXES.some((p) => w.startsWith(p)))) {
    return 'language';
  }
  return LINK_PATTERN.test(text || '') ? 'link' : null;
};

const notifyAdminAboutComment = (subject, comment, commentId, extra) =>
  db.collection('mail').add({
    to: ADMIN_EMAIL,
    message: {
      subject,
      text: [
        extra,
        `Comment: "${comment.text}"`,
        `By: ${comment.authorName} (${comment.authorId})`,
        `Event: ${comment.eventTitle || comment.eventId}`,
        `Comment ID: ${commentId}`,
        'Review it on the admin dashboard (Comments tab).',
      ].join('\n'),
    },
  });

/**
 * Server-side check of every new comment: the app runs the same filter before
 * posting, but a modified client could skip it.
 */
exports.onCommentCreated = functions.runWith(TRIGGER_LIMITS).firestore
  .document('comments/{commentId}')
  .onCreate(async (snap) => {
    const comment = snap.data();
    const problem = moderationProblem(comment.text) || moderationProblem(comment.authorName);
    if (!problem) return null;

    await snap.ref.update({ hidden: true, hiddenReason: `filter:${problem}` });
    console.log(`Comment ${snap.id} hidden by filter (${problem})`);
    return null;
  });

/**
 * A comment was reported. Count reports from real accounts (guest accounts are
 * free to create), record the count, hide at the threshold, and tell the admin.
 */
exports.onCommentReportCreated = functions.runWith(TRIGGER_LIMITS).firestore
  .document('commentReports/{reportId}')
  .onCreate(async (snap) => {
    const { commentId } = snap.data();
    const commentRef = db.collection('comments').doc(commentId);
    const commentDoc = await commentRef.get();
    if (!commentDoc.exists) return null;

    const reports = await db.collection('commentReports').where('commentId', '==', commentId).get();
    const reporterIds = [...new Set(reports.docs.map((d) => d.get('reporterId')).filter(Boolean))];
    let reportCount = 0;
    for (let i = 0; i < reporterIds.length; i += 100) {
      const { users } = await admin.auth().getUsers(reporterIds.slice(i, i + 100).map((uid) => ({ uid })));
      reportCount += users.filter((u) => u.providerData.length > 0).length;
    }

    const comment = commentDoc.data();
    const shouldHide = reportCount >= COMMENT_HIDE_THRESHOLD && !comment.hidden;
    await commentRef.update({
      reportCount,
      ...(shouldHide && { hidden: true, hiddenReason: 'reports' }),
    });

    // First report from a real account, and when it gets hidden
    if (reportCount === 1 && (comment.reportCount || 0) === 0) {
      await notifyAdminAboutComment('EventSwipe: a comment was reported', comment, commentId, 'A comment has been reported.');
    } else if (shouldHide) {
      await notifyAdminAboutComment(`EventSwipe: comment hidden after ${reportCount} reports`, comment, commentId, 'A comment was automatically hidden.');
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
// TICKETMASTER EVENTS (cached per location)
// Called by the app via httpsCallable('getEventsForLocation').
// ============================================================

const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY; // functions/.env
const CACHE_TTL_HOURS = 6;
const CACHE_COLLECTION = 'eventCache';

// The app's distance slider has 20 settings. Caching each one separately
// would mean up to 20 Ticketmaster calls per area, so requests are served from
// the smallest tier that covers them and the app trims to the exact distance.
// (One wide fetch for everyone would dilute results: Ticketmaster only returns
// the soonest 100 events in the radius.)
const RADIUS_TIERS = [10, 25, 50, 100];
const cacheRadius = (radius) =>
  RADIUS_TIERS.find((tier) => radius <= tier) || RADIUS_TIERS[RADIUS_TIERS.length - 1];

// Cache key: coordinates rounded to ~7 miles, plus the radius tier
const createCacheKey = (lat, lng, radius) => {
  const precision = 1;
  const roundedLat = Math.round(lat * Math.pow(10, precision)) / Math.pow(10, precision);
  const roundedLng = Math.round(lng * Math.pow(10, precision)) / Math.pow(10, precision);
  return `${roundedLat}_${roundedLng}_${cacheRadius(radius)}`;
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
// Dated searches (the app's "pick dates" filter) page through results so a
// busy day or a multi-day range isn't cut off at the first 200 events.
const TICKETMASTER_DATED_PAGE_SIZE = 200;
const TICKETMASTER_DATED_MAX_PAGES = 3;

// A search term from the app: trimmed and length-limited, or null
const parseKeyword = (keyword) => {
  if (typeof keyword !== 'string') return null;
  const cleaned = keyword.trim().replace(/\s+/g, ' ').slice(0, 60);
  return cleaned.length >= 2 ? cleaned : null;
};
// Safe, case-insensitive form for a cache key (Firestore ids can't contain "/")
const keywordSlug = (keyword) =>
  keyword.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'x';

// { startDate, endDate } as YYYY-MM-DD from the app, or null if absent/invalid
const parseDateRange = (startDate, endDate) => {
  const valid = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
  if (!valid(startDate)) return null;
  const end = valid(endDate) && endDate >= startDate ? endDate : startDate;
  // Keep cache keys and Ticketmaster queries bounded
  const days = (Date.parse(end) - Date.parse(startDate)) / 86400000;
  return days <= 366 ? { startDate, endDate: end } : null;
};

/**
 * Without a date range: the soonest 100 events from now (what the preset time
 * filters use). With one: events on those local dates, up to 600.
 * With a keyword (the Search tab): only events matching it.
 */
const fetchTicketmaster = async (lat, lng, radius, dateRange = null, keyword = null) => {
  if (!TICKETMASTER_API_KEY) {
    console.log('Ticketmaster API key not configured');
    return [];
  }

  try {
    const base = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&sort=date,asc&latlong=${lat},${lng}&radius=${radius}&unit=miles` +
      (keyword ? `&keyword=${encodeURIComponent(keyword)}` : '');
    const pageUrls = dateRange
      ? Array.from({ length: TICKETMASTER_DATED_MAX_PAGES }, (_, page) =>
          `${base}&size=${TICKETMASTER_DATED_PAGE_SIZE}&page=${page}` +
          // local to each venue, so "Oct 24" means Oct 24 where the event is
          `&localStartDateTime=${dateRange.startDate}T00:00:00,${dateRange.endDate}T23:59:59`)
      : [`${base}&size=100&startDateTime=${new Date().toISOString().slice(0, 19)}Z`];

    const events = [];
    for (const url of pageUrls) {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        console.error('Ticketmaster API error:', data);
        break; // keep whatever earlier pages returned
      }

      events.push(...(data._embedded?.events || []));
      if ((data.page?.number ?? 0) + 1 >= (data.page?.totalPages ?? 1)) break;
    }

    return resolveUnknownCategories(
      inferCategoriesFromVenue(events.map(event => transformTicketmasterEvent(event)))
    );
  } catch (error) {
    console.error('Ticketmaster fetch error:', error);
    return [];
  }
};

// Ticketmaster fills events that have no artwork with generic stock images
// (served from /dam/c/, e.g. the grey swirl) — never use those.
const isGenericImage = (url) => {
  if (!url) return true;
  const lower = url.toLowerCase();
  return [
    '/dam/c/', 'recomendation', 'recommendation', 'default_event', 'no_image',
    'placeholder', 'generic', 'ic_default', 'artist_default', 'event_default',
  ].some(pattern => lower.includes(pattern));
};

// Best real image from a Ticketmaster images array: large 16:9 first
const pickImage = (images) => {
  const real = (images || []).filter(img => !isGenericImage(img.url));
  const best = real.find(img => img.ratio === '16_9' && img.width > 500)
    || real.find(img => img.ratio === '16_9')
    || real.find(img => img.width > 500)
    || real[0];
  return best?.url || null;
};

// Title keywords, checked in order. Used for comedy (often filed under Arts &
// Theatre) and for events Ticketmaster leaves unclassified ("Undefined").
const TITLE_KEYWORDS = [
  ['comedy', ['comedy', 'comedian', 'stand-up', 'standup', 'improv']],
  ['nightlife', ['cabaret', 'burlesque', 'burly-q', 'drag ', 'revue', 'dance party', 'dj set', '21+', 'club night']],
  ['family', ['kids', 'family', 'disney', 'sesame street']],
  ['food', ['tasting', 'food festival', 'brewfest', 'wine ']],
  ['experiences', [' tour ', ' tours ', 'immersive', 'experience', 'exhibit', 'expo ', 'workshop', 'masterclass', 'escape room', 'museum', 'convention']],
];

const categoryFromTitle = (name, only) => {
  const text = ` ${(name || '').toLowerCase()} `;
  const match = TITLE_KEYWORDS.find(([category, words]) =>
    (!only || only.includes(category)) && words.some(word => text.includes(word)));
  return match ? match[0] : null;
};

// Map Ticketmaster's classification to the app's categories. 'other' means
// unknown; fetchTicketmaster resolves it (venue inference, then 'experiences').
const categorizeTicketmasterEvent = (event, classification) => {
  const segment = classification?.segment?.name?.toLowerCase() || '';
  const genre = classification?.genre?.name?.toLowerCase() || '';

  if (genre === 'comedy' || categoryFromTitle(event.name, ['comedy'])) return 'comedy';
  if (genre === 'family' || genre.includes("children")) return 'family';
  if (segment === 'music') return 'music';
  if (segment === 'sports') return 'sports';
  if (segment === 'arts & theatre' || segment === 'film') return 'arts';
  return categoryFromTitle(event.name) || 'other';
};

// Still-unknown events take their venue's usual category when the venue's
// other events in this batch clearly agree (e.g. a concert hall).
const inferCategoriesFromVenue = (events) => {
  const byVenue = new Map();
  for (const e of events) {
    if (!e.venueName || e.category === 'other') continue;
    const counts = byVenue.get(e.venueName) || {};
    counts[e.category] = (counts[e.category] || 0) + 1;
    byVenue.set(e.venueName, counts);
  }
  return events.map((e) => {
    if (e.category !== 'other') return e;
    const counts = byVenue.get(e.venueName);
    if (!counts) return e;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return total >= 2 && n / total >= 0.75 ? { ...e, category: top } : e;
  });
};

// The app's filter has no 'other': whatever is still unclassified is filed
// under Experiences so it stays reachable.
const FALLBACK_CATEGORY = 'experiences';
const resolveUnknownCategories = (events) =>
  events.map((e) => (e.category === 'other' ? { ...e, category: FALLBACK_CATEGORY } : e));

// Transform Ticketmaster event to standard format
const transformTicketmasterEvent = (event) => {
  const venue = event._embedded?.venues?.[0];
  const priceRange = event.priceRanges?.[0];
  const classification = event.classifications?.[0];

  // Event artwork, else the artist/team's, else the venue's. null if only
  // Ticketmaster's generic stock images exist — the app then shows its own
  // category photo.
  const attractions = event._embedded?.attractions || [];
  const image = pickImage(event.images)
    || attractions.map(a => pickImage(a.images)).find(Boolean)
    || pickImage(venue?.images)
    || null;

  const category = categorizeTicketmasterEvent(event, classification);

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

// ============================================================
// VIATOR EXPERIENCES (tours and activities)
// Viator searches by destination, not coordinates, so nearby destinations are
// found from its destination list (each has a centre point) and their top
// products are returned alongside the Ticketmaster events. Products have no
// fixed date: they use the app's `ongoing` event fields.
// The API key is the VIATOR_API_KEY secret (see API_LIMITS.secrets).
// ============================================================

const VIATOR_API = 'https://api.viator.com/partner';
const VIATOR_DESTINATIONS_DOC = 'viatorCache/destinations';
const VIATOR_DESTINATIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // Viator suggests weekly
const VIATOR_MAX_DESTINATIONS = 2;        // nearest destinations to search
const VIATOR_PRODUCTS_PER_DESTINATION = 30;
const VIATOR_SEARCH_RESULTS = 20;         // per destination, for keyword searches
const VIATOR_DESCRIPTION_LIMIT = 600;     // keeps the cache doc well under 1MB
// Countries, states and regions have a centre point too, but it isn't a place
const VIATOR_PLACE_TYPES = ['CITY', 'TOWN', 'VILLAGE', 'NEIGHBORHOOD', 'ISLAND', 'NATIONAL_PARK', 'DISTRICT', 'WARD', 'AREA'];

const viatorRequest = async (path, body) => {
  const response = await fetch(`${VIATOR_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'exp-api-key': process.env.VIATOR_API_KEY,
      Accept: 'application/json;version=2.0',
      'Accept-Language': 'en-US',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Viator ${path} returned HTTP ${response.status}`);
  return response.json();
};

// The destination list changes rarely: kept in memory per instance and in
// Firestore across instances, refreshed from Viator weekly.
let viatorDestinations = null;

const getViatorDestinations = async () => {
  if (viatorDestinations && Date.now() - viatorDestinations.fetchedAt < VIATOR_DESTINATIONS_TTL_MS) {
    return viatorDestinations.list;
  }

  const ref = db.doc(VIATOR_DESTINATIONS_DOC);
  const cached = (await ref.get()).data();
  if (cached && Date.now() - cached.fetchedAt < VIATOR_DESTINATIONS_TTL_MS) {
    viatorDestinations = cached;
    return cached.list;
  }

  try {
    const data = await viatorRequest('/destinations');
    const list = (data.destinations || [])
      .filter((d) => VIATOR_PLACE_TYPES.includes(d.type) && d.center)
      .map((d) => ({
        id: d.destinationId,
        name: d.name,
        lat: d.center.latitude,
        lng: d.center.longitude,
        currency: d.defaultCurrencyCode || 'USD',
      }));
    viatorDestinations = { fetchedAt: Date.now(), list };
    await ref.set(viatorDestinations);
    return list;
  } catch (error) {
    // A stale list is better than none
    if (cached) return cached.list;
    throw error;
  }
};

const formatFromPrice = (amount, currency) => {
  if (typeof amount !== 'number') return null;
  try {
    const price = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
    return `From ${price}`;
  } catch {
    return `From ${amount} ${currency}`;
  }
};

// Largest landscape image (variants run from 100x100 up to 720x480)
const viatorImage = (images) => {
  const image = (images || []).find((i) => i.isCover) || (images || [])[0];
  const variants = [...(image?.variants || [])].sort((a, b) => b.width - a.width);
  return (variants.find((v) => v.width > v.height) || variants[0])?.url || null;
};

const transformViatorProduct = (product, destination) => ({
  id: `viator_${product.productCode}`,
  title: product.title,
  description: (product.description || '').slice(0, VIATOR_DESCRIPTION_LIMIT),
  image: viatorImage(product.images),
  // Search results carry no meeting point, so the destination stands in for
  // the venue and its centre for the coordinates
  location: destination.name,
  venueName: destination.name,
  city: destination.name,
  latitude: destination.lat,
  longitude: destination.lng,
  category: 'experiences',
  price: formatFromPrice(product.pricing?.summary?.fromPrice, product.pricing?.currency || destination.currency),
  // Viator's own link: it carries the partner id that earns commission
  ticketUrl: product.productUrl,
  source: 'viator',
  ongoing: true,
  ctaType: 'book',
  attribution: 'Powered by Viator',
  rating: product.reviews?.combinedAverageRating ?? null,
  reviewCount: product.reviews?.totalReviews ?? 0,
  durationMinutes: product.duration?.fixedDurationInMinutes ?? product.duration?.variableDurationFromMinutes ?? null,
});

/**
 * Top Viator experiences for the destinations within `radius` miles, or the
 * ones matching `keyword` when searching.
 * Never throws: a Viator problem must not take Ticketmaster results down with it.
 */
const fetchViator = async (lat, lng, radius, keyword = null) => {
  if (!process.env.VIATOR_API_KEY) {
    console.log('Viator API key not configured');
    return [];
  }

  try {
    const nearby = (await getViatorDestinations())
      .map((d) => ({ ...d, distance: distanceMiles(lat, lng, d.lat, d.lng) }))
      .filter((d) => d.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, VIATOR_MAX_DESTINATIONS);

    const batches = await Promise.all(nearby.map(async (destination) => {
      try {
        const data = keyword
          ? await viatorRequest('/search/freetext', {
              searchTerm: keyword,
              productFiltering: { destination: String(destination.id) },
              searchTypes: [{ searchType: 'PRODUCTS', pagination: { start: 1, count: VIATOR_SEARCH_RESULTS } }],
              currency: destination.currency,
            })
          : await viatorRequest('/products/search', {
              filtering: { destination: String(destination.id) },
              sorting: { sort: 'DEFAULT' },
              pagination: { start: 1, count: VIATOR_PRODUCTS_PER_DESTINATION },
              currency: destination.currency,
            });
        // Free-text search nests its results one level deeper
        return ((keyword ? data.products?.results : data.products) || [])
          .filter((p) => p.productCode && p.title && p.productUrl)
          .map((p) => transformViatorProduct(p, destination));
      } catch (error) {
        console.error(`Viator search failed for ${destination.name}:`, error.message);
        return [];
      }
    }));

    // The same product can be listed under two neighbouring destinations
    const seen = new Set();
    return batches.flat().filter((e) => (seen.has(e.id) ? false : seen.add(e.id)));
  } catch (error) {
    console.error('Viator fetch error:', error.message);
    return [];
  }
};

/**
 * Main cached event fetching function
 * Called by the app to get events for a location
 */
// One instance is kept warm so a user's first launch doesn't wait on a cold
// start (under $1/month at 256MB); see API_LIMITS for the scaling cap.
exports.getEventsForLocation = functions
  .runWith(API_LIMITS)
  .https.onCall(async (data, context) => {
  const { latitude, longitude, radius = 50 } = data;
  // Optional exact dates; cached separately from the "from now" results
  const dateRange = parseDateRange(data.startDate, data.endDate);
  // Optional search term (the Search tab); also cached separately
  const keyword = parseKeyword(data.keyword);

  if (!latitude || !longitude) {
    throw new functions.https.HttpsError('invalid-argument', 'latitude and longitude are required');
  }

  const cacheKey = createCacheKey(latitude, longitude, radius) +
    (dateRange ? `_${dateRange.startDate}_${dateRange.endDate}` : '') +
    (keyword ? `_q_${keywordSlug(keyword)}` : '');
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

    console.log(`Cache MISS for ${cacheKey}, fetching from Ticketmaster and Viator...`);
  } catch (cacheError) {
    console.error('Cache read error:', cacheError);
  }

  // Both sources at once; each returns [] rather than throwing
  const [ticketmasterEvents, viatorEvents] = await Promise.all([
    fetchTicketmaster(latitude, longitude, cacheRadius(radius), dateRange, keyword),
    fetchViator(latitude, longitude, cacheRadius(radius), keyword),
  ]);
  const allEvents = [...ticketmasterEvents, ...viatorEvents];

  console.log(`Fetched ${ticketmasterEvents.length} Ticketmaster events and ${viatorEvents.length} Viator experiences`);

  // Save to cache
  try {
    const cacheRef = db.collection(CACHE_COLLECTION).doc(cacheKey);
    await cacheRef.set({
      events: allEvents,
      cachedAt: admin.firestore.FieldValue.serverTimestamp(),
      latitude,
      longitude,
      radius: cacheRadius(radius),
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
 * Scheduled cleanup of expired Ticketmaster cache entries.
 * Deletes in chunks because a batch holds at most 500 writes.
 */
exports.cleanupExpiredCache = functions.runWith(SCHEDULED_LIMITS).pubsub
  .schedule('every day 04:30')
  .timeZone('UTC')
  .onRun(async (context) => {
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 2 * 60 * 60 * 1000);
    let deleted = 0;

    while (true) {
      const snapshot = await db.collection(CACHE_COLLECTION)
        .where('cachedAt', '<', cutoff)
        .limit(500)
        .get();
      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deleted += snapshot.size;
    }

    console.log(`Cleaned up ${deleted} expired cache entries`);
    return null;
  });

// ============================================================
// WEEKEND ROUNDUP PUSH NOTIFICATION
// Thursday 5pm in each user's time zone: "23 events near you this weekend".
// Users opt in from the app, which stores pushToken, timeZone, language and a
// rounded searchArea { lat, lng, radius } on users/{uid}.
// ============================================================

const ROUNDUP_MIN_EVENTS = 3;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const ROUNDUP_TEXT = {
  en: ['%{count} events near you this weekend', 'Swipe to find your weekend plans.'],
  es: ['%{count} eventos cerca de ti este fin de semana', 'Desliza para encontrar tus planes del finde.'],
  pt: ['%{count} eventos perto de você neste fim de semana', 'Deslize para encontrar seus planos para o fim de semana.'],
  tr: ['Bu hafta sonu yakınında %{count} etkinlik var', 'Hafta sonu planını bulmak için kaydır.'],
  id: ['%{count} acara di dekatmu akhir pekan ini', 'Geser untuk menemukan rencana akhir pekanmu.'],
  de: ['%{count} Events in deiner Nähe an diesem Wochenende', 'Swipe dich zu deinen Wochenendplänen.'],
  fr: ['%{count} événements près de chez toi ce week-end', 'Swipe pour trouver tes plans du week-end.'],
  ru: ['%{count} событий рядом с тобой в эти выходные', 'Свайпай и находи планы на выходные.'],
  uk: ['%{count} подій поруч із тобою цими вихідними', 'Свайпай і знаходь плани на вихідні.'],
  it: ['%{count} eventi vicino a te questo weekend', 'Scorri per trovare i tuoi piani per il weekend.'],
  pl: ['%{count} wydarzeń w pobliżu w ten weekend', 'Przesuwaj i znajdź plany na weekend.'],
  ja: ['今週末、近くで%{count}件のイベント', 'スワイプして週末の予定を見つけよう。'],
  ko: ['이번 주말 근처 이벤트 %{count}개', '스와이프해서 주말 계획을 찾아보세요.'],
  th: ['สุดสัปดาห์นี้มี %{count} อีเวนต์ใกล้คุณ', 'ปัดเพื่อหาแผนสุดสัปดาห์ของคุณ'],
  vi: ['%{count} sự kiện gần bạn cuối tuần này', 'Vuốt để tìm kế hoạch cuối tuần của bạn.'],
  ar: ['%{count} فعالية قريبة منك في عطلة نهاية الأسبوع', 'اسحب لتجد خططك لعطلة نهاية الأسبوع.'],
  he: ['%{count} אירועים קרובים אליכם בסוף השבוע', 'החליקו כדי למצוא תוכניות לסוף השבוע.'],
  'zh-Hans': ['本周末你附近有 %{count} 场活动', '滑一滑，找到你的周末计划。'],
  'zh-Hant': ['本週末你附近有 %{count} 場活動', '滑一滑，找到你的週末計畫。'],
};

// Matches the app's i18n locale handling (e.g. 'en-US' → 'en', 'zh-TW' → 'zh-Hant')
const roundupText = (language, count) => {
  const lang = language || 'en';
  const base = lang.split('-')[0];
  const key = ROUNDUP_TEXT[lang] ? lang
    : base === 'zh' ? (/TW|HK|MO|Hant/.test(lang) ? 'zh-Hant' : 'zh-Hans')
    : ROUNDUP_TEXT[base] ? base : 'en';
  const [title, body] = ROUNDUP_TEXT[key];
  return { title: title.replace('%{count}', count), body };
};

const distanceMiles = (lat1, lng1, lat2, lng2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3959 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Event dates are 'YYYY-MM-DD' or 'MM/DD/YYYY'
const normalizeDate = (date) => {
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

// Local weekday/hour/date for a time zone, or null if the zone is invalid
const localTime = (now, timeZone) => {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now).map((p) => [p.type, p.value])
    );
    return { weekday: parts.weekday, hour: Number(parts.hour), y: +parts.year, m: +parts.month, d: +parts.day };
  } catch {
    return null;
  }
};

// Friday–Sunday after a local Thursday, as YYYY-MM-DD
const weekendDates = ({ y, m, d }) =>
  new Set([1, 2, 3].map((offset) => new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10)));

// Event ids within the area on the given dates, from user-posted/scraped
// events and the cached Ticketmaster results for that area.
const weekendEventIds = async ({ lat, lng, radius }, dates) => {
  const band = radius / 69;
  const [snap, cacheDoc] = await Promise.all([
    db.collection('events')
      .where('latitude', '>=', lat - band)
      .where('latitude', '<=', lat + band)
      .get(),
    db.collection(CACHE_COLLECTION).doc(createCacheKey(lat, lng, radius)).get(),
  ]);

  const candidates = [
    ...snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.active === true),
    ...(cacheDoc.exists ? cacheDoc.data().events || [] : []),
  ];

  const ids = new Set();
  for (const e of candidates) {
    const eLat = parseFloat(e.latitude);
    const eLng = parseFloat(e.longitude);
    if (!dates.has(normalizeDate(e.date)) || isNaN(eLat) || isNaN(eLng)) continue;
    if (distanceMiles(lat, lng, eLat, eLng) <= radius) ids.add(e.id);
  }
  return ids;
};

const sendExpoPush = async (messages) => {
  const tickets = [];
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Expo push failed: ${JSON.stringify(json)}`);
    tickets.push(...json.data);
  }
  return tickets;
};

exports.weekendRoundup = functions.runWith(SCHEDULED_LIMITS).pubsub
  // Hourly on Thursday and Friday UTC covers Thursday 5pm in every time zone
  .schedule('0 * * * 4,5')
  .timeZone('UTC')
  .onRun(async () => {
    const now = new Date();
    const users = await db.collection('users').where('notificationsEnabled', '==', true).get();

    const due = [];
    for (const doc of users.docs) {
      const u = doc.data();
      if (!u.pushToken || !u.searchArea || !u.timeZone) continue;
      const local = localTime(now, u.timeZone);
      if (!local || local.weekday !== 'Thu' || local.hour !== 17) continue;
      if (u.lastRoundupAt && now - u.lastRoundupAt.toDate() < 5 * 24 * 60 * 60 * 1000) continue;
      due.push({ ref: doc.ref, u, local });
    }
    if (!due.length) return null;

    // Users in the same area and time zone share a lookup
    const areaCache = new Map();
    const messages = [];
    const recipients = [];
    for (const { ref, u, local } of due) {
      const dates = weekendDates(local);
      const key = `${JSON.stringify(u.searchArea)}|${[...dates].join()}`;
      if (!areaCache.has(key)) areaCache.set(key, weekendEventIds(u.searchArea, dates));
      const ids = await areaCache.get(key);

      // Only count events this user hasn't swiped yet
      const swiped = new Set(u.swipedEvents || []);
      const count = [...ids].filter((id) => !swiped.has(id)).length;
      if (count < ROUNDUP_MIN_EVENTS) continue;

      const { title, body } = roundupText(u.language, count);
      messages.push({ to: u.pushToken, title, body, data: { screen: 'Discover' }, channelId: 'default' });
      recipients.push(ref);
    }
    if (!messages.length) return null;

    const tickets = await sendExpoPush(messages);
    const batch = db.batch();
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'ok') {
        batch.update(recipients[i], { lastRoundupAt: Timestamp.fromDate(now) });
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        // App uninstalled or notifications revoked
        batch.update(recipients[i], { pushToken: FieldValue.delete() });
      } else {
        console.error('Push error:', ticket.message);
      }
    });
    await batch.commit();

    console.log(`Weekend roundup: sent ${messages.length} of ${due.length} due`);
    return null;
  });
