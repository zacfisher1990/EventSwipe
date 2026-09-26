# EventSwipe Admin

Private dashboard: every user, their swipe counts, and the events they've posted.
Reads Firestore server-side with `firebase-admin`; only UIDs in `ADMIN_UIDS` can load data.

## Deploy to Vercel

1. Firebase console → Project settings → Service accounts → **Generate new private key**.
2. Firebase console → Authentication → Users → copy your **User UID**.
3. Vercel → Add New Project → import this repo → set **Root Directory** to `admin`.
4. Environment variables:
   - `FIREBASE_SERVICE_ACCOUNT` — paste the entire JSON key file contents
   - `ADMIN_UIDS` — your UID (comma-separate to add more admins)
5. Deploy, then sign in with your EventSwipe email + password.

If you sign in and see "Not authorized", the page shows your UID — add it to `ADMIN_UIDS` and redeploy.

## Local dev

    cp .env.example .env.local   # fill in values
    npm install
    npm run dev

## Notes on swipe numbers

- **Swipes / Right / Left** come from counters on `users/{uid}` (`swipeCount`, `rightSwipes`,
  `leftSwipes`), incremented in `src/services/eventService.js`. Undo decrements them.
  They only start counting once users are on an app build that includes the counter.
- Before that, the table shows `~N` in grey: the number of distinct event IDs in `swipedEvents`,
  which is approximate (multi-date events add several IDs; undo removes them).
