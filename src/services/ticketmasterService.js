// TICKETMASTER SERVICE - FIXES NEEDED
// =====================================

// Issue: In getCategory(), you return 'Festival' but it's not in CATEGORY_MAP
// This causes those events to become 'other' and get filtered out

// FIX 1: Add 'festival' to CATEGORY_MAP (around line 82)
// Change this:
//   'outdoor': 'outdoor',
//   'festival': 'outdoor',  // <-- ADD THIS LINE
//   'fair': 'outdoor',

// OR alternatively, change the return in getCategory() (around line 219):
// From:
//   if (textToSearch.includes('festival') || textToSearch.includes('fair')) {
//     return 'Festival';
//   }
// To:
//   if (textToSearch.includes('festival') || textToSearch.includes('fair')) {
//     return 'outdoor';  // Maps directly to filter category
//   }

// =====================================
// FULL UPDATED CATEGORY_MAP for reference:

const CATEGORY_MAP = {
  // Ticketmaster segments
  'music': 'music',
  'sports': 'sports',
  'arts & theatre': 'arts',
  'film': 'arts',
  'miscellaneous': 'other',
  
  // Ticketmaster genres
  'comedy': 'comedy',
  'rock': 'music',
  'pop': 'music',
  'hip-hop/rap': 'music',
  'r&b': 'music',
  'country': 'music',
  'jazz': 'music',
  'classical': 'music',
  'electronic': 'music',
  'alternative': 'music',
  'metal': 'music',
  'folk': 'music',
  'latin': 'music',
  'reggae': 'music',
  'blues': 'music',
  'soul': 'music',
  'punk': 'music',
  'world': 'music',
  
  // Sports
  'basketball': 'sports',
  'football': 'sports',
  'baseball': 'sports',
  'hockey': 'sports',
  'soccer': 'sports',
  'tennis': 'sports',
  'golf': 'sports',
  'boxing': 'sports',
  'mma': 'sports',
  'wrestling': 'sports',
  'motorsports': 'sports',
  
  // Arts
  'theatre': 'arts',
  'theater': 'arts',
  'broadway': 'arts',
  'musical': 'arts',
  'opera': 'arts',
  'ballet': 'arts',
  'dance': 'arts',
  'circus': 'arts',
  'magic': 'arts',
  
  // Nightlife
  'nightlife': 'nightlife',
  'club': 'nightlife',
  
  // Family
  'family': 'family',
  'children': 'family',
  'kids': 'family',
  
  // Fitness
  'fitness': 'fitness',
  'marathon': 'fitness',
  'run': 'fitness',
  'yoga': 'fitness',
  
  // Food
  'food & drink': 'food',
  'food': 'food',
  'wine': 'food',
  'beer': 'food',
  'culinary': 'food',
  
  // Networking
  'networking': 'networking',
  'conference': 'networking',
  'seminar': 'networking',
  
  // Outdoor - ADD FESTIVAL HERE!
  'outdoor': 'outdoor',
  'festival': 'outdoor',  // <-- THIS WAS MISSING
  'fair': 'outdoor',
  
  // Default
  'event': 'other',
};