/**
 * Server-side rate limiter pro PIN brute force protection.
 *
 * Audit 2026-05-23 S-7: dříve útočník mohl scriptovat ~10 req/s na joinByPin
 * endpoints — 6-digit PIN (1M kombinací) prolomen za ~10h, 4-digit za 17min.
 * Tento limiter ukládá failed attempts per (uid, scope) do RTDB s timestampem
 * a vrací HttpsError('resource-exhausted') po překročení threshold.
 *
 * Storage: `/rate-limits/{scope}/{uid}` = { attempts: number, windowStart: ms }
 * Cleanup: window-based reset (po N minutách počítá od nuly).
 *
 * Limity:
 * - 10 failed attempts za 10 minut → block 30 minut
 * - Po úspěšném joinu se counter resetuje (volat reset())
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const WINDOW_MS = 10 * 60 * 1000;  // 10 min window
const MAX_FAILED = 10;             // max failed pokusů v okně
const BLOCK_MS = 30 * 60 * 1000;   // 30 min block po překročení

interface RateLimitState {
  attempts: number;
  windowStart: number;
  blockedUntil?: number;
}

function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
}

/**
 * Check, jestli uid může pokračovat se pokusem v daném scope.
 * Volat PŘED ověřením PIN.
 *
 * @param scope — typ akce ('club-join', 'tournament-join', 'match-pairing')
 * @param uid — auth user UID
 * @throws HttpsError('resource-exhausted') pokud je blocked
 */
export async function checkRateLimit(scope: string, uid: string): Promise<void> {
  const db = getDb();
  const ref = db.ref(`rate-limits/${scope}/${uid}`);
  const snap = await ref.once('value');
  const state = (snap.val() ?? {}) as Partial<RateLimitState>;
  const now = Date.now();

  // Aktuálně blokovaný?
  if (state.blockedUntil && state.blockedUntil > now) {
    const remainingMin = Math.ceil((state.blockedUntil - now) / 60000);
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Příliš mnoho neúspěšných pokusů. Zkuste znovu za ${remainingMin} minut.`,
    );
  }
}

/**
 * Zaznamenat failed attempt. Volat při neúspěšném PIN ověření (ne při auth/network errors).
 * Pokud překročí threshold, nastaví blockedUntil.
 */
export async function recordFailedAttempt(scope: string, uid: string): Promise<void> {
  const db = getDb();
  const ref = db.ref(`rate-limits/${scope}/${uid}`);
  const now = Date.now();

  await ref.transaction((current: Partial<RateLimitState> | null) => {
    const state = current ?? { attempts: 0, windowStart: now };
    // Reset window pokud uplynulo víc než WINDOW_MS
    if (now - (state.windowStart ?? now) > WINDOW_MS) {
      return { attempts: 1, windowStart: now };
    }
    const newAttempts = (state.attempts ?? 0) + 1;
    if (newAttempts >= MAX_FAILED) {
      return {
        attempts: newAttempts,
        windowStart: state.windowStart ?? now,
        blockedUntil: now + BLOCK_MS,
      };
    }
    return {
      attempts: newAttempts,
      windowStart: state.windowStart ?? now,
    };
  });
}

/**
 * Reset counter po úspěšném joinu — user neměl být penalizován za pomalé psaní PINu.
 */
export async function resetRateLimit(scope: string, uid: string): Promise<void> {
  const db = getDb();
  await db.ref(`rate-limits/${scope}/${uid}`).remove();
}
