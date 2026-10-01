// Basic checks applied before a comment or display name is posted. The same
// rules are enforced server-side by the onCommentCreated Cloud Function
// (functions/index.js) — keep the two lists in sync.

// Matched against whole words after normalising (lowercase, accents and
// common character swaps removed).
const BLOCKED_WORDS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch',
  'asshole', 'cunt', 'whore', 'slut', 'faggot', 'fag', 'nigger', 'nigga',
  'retard', 'kike', 'spic', 'chink', 'tranny', 'wetback',
];
const BLOCKED_PREFIXES = ['fuck', 'nigg', 'fagg'];

const LINK_PATTERN = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|ly|me|app|xyz|info|biz|ru|cn|link|shop)\b/i;

const stripAccents = (text) => {
  try {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return text; // engines without String.prototype.normalize
  }
};

const normalize = (text) =>
  stripAccents((text || '').toLowerCase())
    .replace(/[@4]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o').replace(/[$5]/g, 's');

export const containsBlockedLanguage = (text) => {
  const words = normalize(text).split(/[^a-z]+/).filter(Boolean);
  return words.some(word =>
    BLOCKED_WORDS.includes(word) || BLOCKED_PREFIXES.some(prefix => word.startsWith(prefix)));
};

export const containsLink = (text) => LINK_PATTERN.test(text || '');

/** @returns {'language' | 'link' | null} */
export const findProblem = (text) => {
  if (containsBlockedLanguage(text)) return 'language';
  if (containsLink(text)) return 'link';
  return null;
};
