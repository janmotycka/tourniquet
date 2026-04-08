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
// Vynutí account picker pokaždé — bez tohoto Google auto-signuje jediným
// účtem v prohlížeči a mate lidi s více účty (pracovní vs osobní).
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ─── App Check (reCAPTCHA v3) ────────────────────────────────────────────────
// Chrání Firebase RTDB, Cloud Functions a Auth před zneužitím z neautorizovaných
// klientů. Enforcement se nastavuje v Firebase Console → App Check → APIs.
//
// Aktivace: VITE_ENABLE_APP_CHECK=true + VITE_RECAPTCHA_SITE_KEY (GitHub Secrets).
// Site key musí být zaregistrovaný v https://www.google.com/recaptcha/admin
// (typ reCAPTCHA v3) s povolenými doménami torq.cz, www.torq.cz, *.web.app, localhost.
// Odpovídající secret key je nastavený v Firebase Console → App Check → Apps.
//
// V development mode použij debug token (Firebase Console → App Check → Manage
// debug tokens) přes VITE_APPCHECK_DEBUG_TOKEN.
//
// Inicializace je obalená v try/catch — pokud reCAPTCHA selže (incognito,
// ad-blocker), app pokračuje bez App Check tokenu. Enforcement na serveru pak
// rozhodne, jestli request projde.

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
const appCheckEnabled = import.meta.env.VITE_ENABLE_APP_CHECK === 'true';

if (appCheckEnabled && recaptchaSiteKey) {
  try {
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
    logger.warn('[AppCheck] Initialization failed (incognito/ad-blocker?):', err);
  }
} else {
  logger.debug('[AppCheck] Skipped (VITE_ENABLE_APP_CHECK !== "true")');
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
