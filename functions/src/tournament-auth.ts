/**
 * Tournament PIN Auth Cloud Functions
 *
 * Server-side ověření PINu pro připojení k turnaji jako co-host (admin).
 * Nahrazuje client-side verifyPin + writeJoinedUser, aby útočník nemohl
 * obejít kontrolu a zapsat se přímo jako admin do joinedUsers.
 *
 * Bezpečnost:
 * - Client NESMÍ mít čtení na /pin-auth ani zápis na public/{tid}/joinedUsers
 *   (rules musí být uzamčené souběžně s deployem této funkce).
 * - Formát hashe musí přesně odpovídat klientskému hashPin v src/utils/pin-hash.ts:
 *   SHA-256(`${salt}:${pin}`) — hex. Bez salt (starší turnaje): SHA-256(pin).
 *
 * Rate limiting: Firebase Functions už má vestavěný throttling; navíc každé
 * volání konzumuje CF čas (useful exponential cost pro brute-force).
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

function requireAuth(context: functions.https.CallableContext): string {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  return context.auth.uid;
}

function sanitizeString(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

/**
 * Klient-kompatibilní SHA-256 hash PINu.
 * Musí PŘESNĚ odpovídat src/utils/pin-hash.ts::hashPin.
 */
function hashPinClientCompat(pin: string, salt?: string): string {
  const payload = salt ? `${salt}:${pin}` : pin;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * joinTournamentByPin — ověří PIN a zapíše joinedUsers/{uid} do public mirror.
 *
 * Input:
 *   - tournamentId: string
 *   - pin: string (6-místný kód)
 *   - role?: 'admin' — pokud předán a PIN souhlasí, nastaví uživatele jako co-admina
 *
 * Output:
 *   - { success: true, role: 'admin' | 'viewer', tournamentName: string, ownerUid: string }
 */
export const joinTournamentByPin = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireAuth(context);

  const tournamentId = sanitizeString(data?.tournamentId, 100);
  const pin = sanitizeString(data?.pin, 20);
  const requestedRole = sanitizeString(data?.role, 10);

  if (!tournamentId || !pin) {
    throw new functions.https.HttpsError('invalid-argument', 'tournamentId and pin are required');
  }

  // Načti PIN data (primárně z /pin-auth, fallback na /public pro starší turnaje)
  const [pinSnap, publicSnap] = await Promise.all([
    db.ref(`pin-auth/${tournamentId}`).get(),
    db.ref(`public/${tournamentId}`).get(),
  ]);

  if (!publicSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Tournament not found');
  }

  const publicData = publicSnap.val() as {
    ownerUid?: string;
    name?: string;
    pinHash?: string;
    pinSalt?: string;
    joinedUsers?: Record<string, unknown>;
  };

  let pinHash: string | undefined;
  let pinSalt: string | undefined;

  if (pinSnap.exists()) {
    const pinData = pinSnap.val() as { pinHash?: string; pinSalt?: string };
    pinHash = pinData.pinHash;
    pinSalt = pinData.pinSalt;
  } else {
    // Legacy fallback — staré turnaje měly pinHash v public mirror
    pinHash = publicData.pinHash;
    pinSalt = publicData.pinSalt;
  }

  if (!pinHash) {
    throw new functions.https.HttpsError('failed-precondition', 'Tournament has no PIN set');
  }

  const expected = hashPinClientCompat(pin, pinSalt);
  if (expected !== pinHash) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid PIN');
  }

  // Role: anonymní uživatelé NESMÍ být admin (bezpečnost — admin role dává
  // přístup ke změně skóre, startu/ukončení zápasů, atd.)
  // Výjimka zatím není potřebná — registrovaný co-host zadá PIN a stane se adminem.
  const isAnonymous = context.auth?.token?.firebase?.sign_in_provider === 'anonymous';
  const role: 'admin' | true = requestedRole === 'admin' && !isAnonymous ? 'admin' : true;

  // Zapiš joinedUsers/{uid} via admin SDK (obchází rules)
  await db.ref(`public/${tournamentId}/joinedUsers/${uid}`).set(role);

  return {
    success: true,
    role: role === 'admin' ? 'admin' : 'viewer',
    tournamentName: publicData.name ?? '',
    ownerUid: publicData.ownerUid ?? '',
  };
});

/**
 * verifyTournamentPin — samostatný endpoint pro gate pouze ověří PIN bez
 * zápisu joinedUsers. Použití: spectator/rozhodčí kteří potřebují PIN gate
 * bez udělení admin role (např. score writing gate pro logged-in diváky).
 */
export const verifyTournamentPin = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAuth(context);

  const tournamentId = sanitizeString(data?.tournamentId, 100);
  const pin = sanitizeString(data?.pin, 20);

  if (!tournamentId || !pin) {
    throw new functions.https.HttpsError('invalid-argument', 'tournamentId and pin are required');
  }

  const [pinSnap, publicSnap] = await Promise.all([
    db.ref(`pin-auth/${tournamentId}`).get(),
    db.ref(`public/${tournamentId}`).get(),
  ]);

  if (!publicSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Tournament not found');
  }

  let pinHash: string | undefined;
  let pinSalt: string | undefined;

  if (pinSnap.exists()) {
    const pinData = pinSnap.val() as { pinHash?: string; pinSalt?: string };
    pinHash = pinData.pinHash;
    pinSalt = pinData.pinSalt;
  } else {
    const pub = publicSnap.val() as { pinHash?: string; pinSalt?: string };
    pinHash = pub.pinHash;
    pinSalt = pub.pinSalt;
  }

  if (!pinHash) {
    throw new functions.https.HttpsError('failed-precondition', 'Tournament has no PIN set');
  }

  const expected = hashPinClientCompat(pin, pinSalt);
  if (expected !== pinHash) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid PIN');
  }

  return { success: true };
});
