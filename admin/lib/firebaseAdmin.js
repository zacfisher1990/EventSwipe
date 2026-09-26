import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Server-only. FIREBASE_SERVICE_ACCOUNT is the full service-account JSON
// (Firebase console → Project settings → Service accounts → Generate new private key).
function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());

// Only these Firebase Auth UIDs may use the dashboard (comma-separated).
// UIDs are used rather than emails because email/password accounts aren't
// verified, so anyone could register an allowlisted address that isn't taken.
export async function requireAdmin(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const allowed = (process.env.ADMIN_UIDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return allowed.includes(decoded.uid) ? decoded : null;
  } catch {
    return null;
  }
}
