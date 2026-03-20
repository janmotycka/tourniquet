import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, goOffline, goOnline } from 'firebase/database';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { logger } from './utils/logger';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const functions = getFunctions(app, 'europe-west1');
export const googleProvider = new GoogleAuthProvider();

// ─── App Check (reCAPTCHA v3) ────────────────────────────────────────────────
// Chrání Firebase RTDB a Cloud Functions před zneužitím z neautorizovaných klientů.
// V development mode používáme debug token (nastavit v Firebase Console → App Check).
// V incognito mode může reCAPTCHA selhat — App Check je proto "non-blocking"
// (enforcement se nastavuje v Firebase Console, ne zde na klientu).

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

if (recaptchaSiteKey) {
  try {
    // Debug token pro localhost — Firebase Console → App Check → Apps → Manage debug tokens
    if (import.meta.env.DEV) {
      // @ts-expect-error — Firebase App Check debug token pro development
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    logger.debug('[AppCheck] Initialized with reCAPTCHA v3');
  } catch (err) {
    // Graceful fallback — pokud reCAPTCHA selže (incognito, ad-blocker),
    // app funguje dál. Enforcement je na straně serveru (Firebase Console).
    logger.warn('[AppCheck] Initialization failed (incognito/ad-blocker?):', err);
  }
} else {
  logger.debug('[AppCheck] Skipped — VITE_RECAPTCHA_SITE_KEY not configured');
}

// ─── Connection monitoring & keepalive ───────────────────────────────────────
// Mobilní prohlížeče uspí WebSocket když je tab na pozadí.
// Monitorujeme stav spojení a vynucujeme reconnect při návratu.

import { ref as dbRef, onValue } from 'firebase/database';

/** Observable connection state — true = connected to Firebase */
export let firebaseConnected = false;

// Monitor .info/connected
const connectedRef = dbRef(db, '.info/connected');
onValue(connectedRef, (snap) => {
  firebaseConnected = snap.val() === true;
  logger.debug('[Firebase] Connection state:', firebaseConnected ? 'CONNECTED' : 'DISCONNECTED');
});

if (typeof document !== 'undefined') {
  // Při návratu z pozadí vynutíme reconnect
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      logger.debug('[Firebase] Tab visible — forcing reconnect');
      goOffline(db);
      // Malý delay aby disconnect proběhl
      setTimeout(() => goOnline(db), 100);
    }
  });

  // Keepalive — pokud je tab viditelný ale Firebase se odpojilo, reconnect
  setInterval(() => {
    if (document.visibilityState === 'visible' && !firebaseConnected) {
      logger.debug('[Firebase] Keepalive — reconnecting stale connection');
      goOffline(db);
      setTimeout(() => goOnline(db), 100);
    }
  }, 15_000);
}
