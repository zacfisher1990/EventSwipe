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

const ADMIN_EMAIL = 'zcfshr@gmail.com';

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
 * Remove a user's Firestore doc when their auth account is deleted — including
 * guest accounts cleaned up after the guest signs in to an existing account.
 */
exports.onUserDeleted = functions.auth.user().onDelete(async (user) => {
  await db.collection('users').doc(user.uid).delete();
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

/**
 * Main cached event fetching function
 * Called by the app to get events for a location
 */
// minInstances keeps one instance warm so a user's first launch doesn't wait
// on a cold start (~a few $/month at 256MB).
exports.getEventsForLocation = functions
  .runWith({ minInstances: 1 })
  .https.onCall(async (data, context) => {
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

    console.log(`Cache MISS for ${cacheKey}, fetching from Ticketmaster...`);
  } catch (cacheError) {
    console.error('Cache read error:', cacheError);
  }

  // Fetch from Ticketmaster
  const allEvents = await fetchTicketmaster(latitude, longitude, radius);

  console.log(`Fetched ${allEvents.length} events from Ticketmaster`);

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
 * Scheduled cleanup of expired Ticketmaster cache entries.
 * Deletes in chunks because a batch holds at most 500 writes.
 */
exports.cleanupExpiredCache = functions.pubsub
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

exports.weekendRoundup = functions.pubsub
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
    const chunk = events.slice(i, i + 500).filter((e) => e.externalId);
    if (chunk.length === 0) continue;

    // Don't let a re-scrape resurrect events hidden/removed by user reports
    const refs = chunk.map((e) => db.collection('events').doc(`eb_${e.externalId}`));
    const existing = await db.getAll(...refs);
    const flagged = new Set(
      existing.filter((d) => d.exists && d.get('status')).map((d) => d.id)
    );

    for (const event of chunk) {
      const eventId = `eb_${event.externalId}`;
      if (flagged.has(eventId)) continue;
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