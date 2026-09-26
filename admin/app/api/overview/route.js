import { NextResponse } from 'next/server';
import { adminAuth, adminDb, requireAdmin } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

const toIso = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  return null;
};

async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = adminDb();
  const [authUsers, userDocs, eventDocs] = await Promise.all([
    listAllAuthUsers(),
    db.collection('users').get(),
    // Scraped events share this collection; user-posted ones have source 'firebase'
    db.collection('events').where('source', '==', 'firebase').get(),
  ]);

  const analyticsRefs = eventDocs.docs.map((d) => db.collection('eventAnalytics').doc(d.id));
  const analyticsDocs = analyticsRefs.length ? await db.getAll(...analyticsRefs) : [];
  const analytics = Object.fromEntries(
    analyticsDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
  );

  const events = eventDocs.docs.map((d) => {
    const e = d.data();
    const a = analytics[d.id] || {};
    return {
      id: d.id,
      posterId: e.posterId || null,
      title: e.title || '(untitled)',
      date: e.date || null,
      location: e.location || e.address || '',
      category: e.category || '',
      active: e.active !== false,
      status: e.status || null,
      reportCount: e.reportCount || 0,
      createdAt: toIso(e.createdAt),
      views: a.views || 0,
      saves: a.saves || 0,
      ticketTaps: a.ticketTaps || 0,
    };
  });

  const eventsByPoster = {};
  for (const e of events) {
    (eventsByPoster[e.posterId] ||= []).push(e);
  }

  const docsById = Object.fromEntries(userDocs.docs.map((d) => [d.id, d.data()]));
  const uids = new Set([...authUsers.map((u) => u.uid), ...Object.keys(docsById)]);
  const authById = Object.fromEntries(authUsers.map((u) => [u.uid, u]));

  const users = [...uids].map((uid) => {
    const a = authById[uid];
    const d = docsById[uid] || {};
    return {
      uid,
      email: a?.email || d.email || null,
      disabled: a?.disabled || false,
      // Anonymous auth: browsing as a guest, hasn't created an account yet
      isGuest: !!a && a.providerData.length === 0,
      deletedFromAuth: !a,
      createdAt: a?.metadata.creationTime
        ? new Date(a.metadata.creationTime).toISOString()
        : toIso(d.createdAt),
      lastSignIn: a?.metadata.lastSignInTime
        ? new Date(a.metadata.lastSignInTime).toISOString()
        : null,
      lastSwipeAt: toIso(d.lastSwipeAt),
      lastActiveAt: toIso(d.lastActiveAt),
      platform: d.platform || null,
      osVersion: d.osVersion || null,
      // Exact counters, only recorded since the in-app counter shipped
      swipeCount: d.swipeCount ?? null,
      rightSwipes: d.rightSwipes ?? null,
      leftSwipes: d.leftSwipes ?? null,
      // Legacy approximations from the id arrays
      swipedEventIds: Array.isArray(d.swipedEvents) ? d.swipedEvents.length : 0,
      savedEvents: Array.isArray(d.savedEvents) ? d.savedEvents.length : 0,
      events: (eventsByPoster[uid] || []).sort((x, y) =>
        (y.createdAt || '').localeCompare(x.createdAt || '')
      ),
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    users,
    orphanEvents: events.filter((e) => !e.posterId || !uids.has(e.posterId)),
  });
}
