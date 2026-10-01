import { NextResponse } from 'next/server';
import { adminAuth, adminDb, requireAdmin } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

const toIso = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : null);

// Newest comments, with each author's email / disabled state for moderation
export async function GET(request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const snapshot = await adminDb().collection('comments').orderBy('createdAt', 'desc').limit(500).get();
  const comments = snapshot.docs.map((d) => {
    const c = d.data();
    return {
      id: d.id,
      text: c.text || '',
      authorId: c.authorId,
      authorName: c.authorName || '',
      eventTitle: c.eventTitle || c.eventId || '',
      hidden: !!c.hidden,
      hiddenReason: c.hiddenReason || null,
      reportCount: c.reportCount || 0,
      createdAt: toIso(c.createdAt),
    };
  });

  const authors = {};
  const uids = [...new Set(comments.map((c) => c.authorId).filter(Boolean))];
  for (let i = 0; i < uids.length; i += 100) {
    const { users } = await adminAuth().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of users) authors[u.uid] = { email: u.email || null, disabled: u.disabled };
  }

  return NextResponse.json({ comments, authors });
}

// { action: 'hide' | 'unhide' | 'delete', id }  or  { action: 'disableUser' | 'enableUser', uid }
export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { action, id, uid } = await request.json();
  const comment = id ? adminDb().collection('comments').doc(String(id)) : null;

  if (action === 'hide' && comment) {
    await comment.update({ hidden: true, hiddenReason: 'admin' });
  } else if (action === 'unhide' && comment) {
    await comment.update({ hidden: false, hiddenReason: null });
  } else if (action === 'delete' && comment) {
    await comment.delete();
  } else if ((action === 'disableUser' || action === 'enableUser') && uid) {
    // A disabled account can't sign in or post; its existing comments stay until removed
    await adminAuth().updateUser(String(uid), { disabled: action === 'disableUser' });
  } else {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
