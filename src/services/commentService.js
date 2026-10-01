// commentService.js
// Comments live in the flat `comments` collection, keyed by eventKey so they
// work for every source (Ticketmaster and Eventbrite events too). Posting
// needs a real account; the Firestore rules enforce that and the field shape.

import {
  collection, doc, query, where, getDocs, addDoc, deleteDoc, setDoc, updateDoc,
  arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { findProblem } from '../utils/moderation';

export const MAX_COMMENT_LENGTH = 500;
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 20;

const slug = (text) =>
  (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A show listed on several dates is one card whose primary id changes as
// dates pass, so those share a key built from title + venue instead.
export const commentKeyFor = (event) => {
  if (event.groupedIds?.length > 1) {
    const key = `${slug(event.title)}__${slug(event.location || event.venueName)}`.slice(0, 200);
    if (key.length > 2) return `g_${key}`;
  }
  return String(event.id);
};

const toComment = (snapshot) => {
  const data = snapshot.data();
  return { id: snapshot.id, ...data, createdAt: data.createdAt?.toDate?.() ?? new Date() };
};

export const fetchComments = async (eventKey) => {
  // hidden == false is required by the rules as well as wanted here
  const snapshot = await getDocs(query(
    collection(db, 'comments'),
    where('eventKey', '==', eventKey),
    where('hidden', '==', false)
  ));
  return snapshot.docs.map(toComment).sort((a, b) => b.createdAt - a.createdAt);
};

/** Throws an Error whose `reason` is 'empty' | 'language' | 'link' for invalid text. */
export const postComment = async (event, user, rawText) => {
  const text = (rawText || '').trim().slice(0, MAX_COMMENT_LENGTH);
  const reason = !text ? 'empty' : findProblem(text);
  if (reason) throw Object.assign(new Error('Comment not allowed'), { reason });

  const comment = {
    eventKey: commentKeyFor(event),
    eventId: String(event.id),
    eventTitle: (event.title || '').slice(0, 200),
    text,
    authorId: user.uid,
    authorName: user.displayName,
    hidden: false,
    reportCount: 0,
  };
  const ref = await addDoc(collection(db, 'comments'), { ...comment, createdAt: serverTimestamp() });
  return { id: ref.id, ...comment, createdAt: new Date() };
};

export const deleteComment = (commentId) => deleteDoc(doc(db, 'comments', commentId));

// One report per user per comment: the id makes a second report an update,
// which the rules reject.
export const reportComment = async (commentId, userId) => {
  try {
    await setDoc(doc(db, 'commentReports', `${commentId}_${userId}`), {
      commentId,
      reporterId: userId,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (error.code !== 'permission-denied') throw error; // already reported
  }
};

export const blockUser = (userId, blockedUserId) =>
  updateDoc(doc(db, 'users', userId), { blockedUsers: arrayUnion(blockedUserId) });

/** Throws an Error whose `reason` is 'length' | 'language' | 'link' for an invalid name. */
export const saveDisplayName = async (userId, rawName) => {
  const displayName = (rawName || '').trim().replace(/\s+/g, ' ');
  const reason = displayName.length < MIN_NAME_LENGTH || displayName.length > MAX_NAME_LENGTH
    ? 'length'
    : findProblem(displayName);
  if (reason) throw Object.assign(new Error('Name not allowed'), { reason });

  await setDoc(doc(db, 'users', userId), { displayName }, { merge: true });
  return displayName;
};
