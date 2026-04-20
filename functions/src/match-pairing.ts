/**
 * Cross-team Match Pairing — Cloud Functions
 *
 * Server-side PIN ověření pro cross-team pairing (opoziční trenér si „vezme"
 * zápas a získá write přístup k match documentu). Client-side ověření bylo
 * nebezpečné — útočník s URL tokenem mohl přímým write do Firebase přepsat
 * `pairing.awayCoachUid` a získat plný edit přístup, aniž by znal PIN.
 *
 * Security:
 * - Client NESMÍ číst pinHash/pinSalt — uloženy v `/match-pairing-auth/{matchId}`
 *   (rules: read only admin SDK).
 * - Client NESMÍ přímo psát `pairing.awayCoachUid` v join-window (rules to
 *   blokují; write je povolen pouze pokud už user JE paired coach).
 *
 * Flow:
 *   1. Home coach volá `createMatchPairingInvite` (store) → vygeneruje PIN,
 *      pinHash, joinToken. Uloží `/match-pairing-auth/{matchId}` = { pinHash, pinSalt }
 *      a `/matches/{scope}/{matchId}/pairing` = { joinToken, ownerScope, invitedBy, ... }.
 *   2. Away coach klikne na share URL → zadá PIN → volá tuto CF.
 *   3. CF ověří PIN server-side, zapíše `awayCoachUid` atomicky, smaže
 *      pairing-auth uzel.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

function requireAuth(context: functions.https.CallableContext): { uid: string; name: string } {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const token = context.auth.token;
  const name = (token?.name as string | undefined)
    ?? (token?.email as string | undefined)?.split('@')[0]
    ?? 'Trenér';
  return { uid: context.auth.uid, name };
}

function sanitizeString(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

/**
 * Klient-kompatibilní SHA-256 hash PINu. Musí odpovídat
 * src/utils/pin-hash.ts::hashPin.
 */
function hashPinClientCompat(pin: string, salt?: string): string {
  const payload = salt ? `${salt}:${pin}` : pin;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * joinMatchPairingByPin — ověří PIN a zapíše `pairing.awayCoachUid` do match.
 *
 * Input:
 *   - scopeId: string (uid nebo clubId kde match leží)
 *   - matchId: string
 *   - pin: string (4 digits)
 *   - awayCoachName: string
 *   - awayClubId?: string
 *   - awayClubName?: string
 *
 * Output:
 *   - { success: true, matchId, ownerScope }
 */
export const joinMatchPairingByPin = functions.region('europe-west1').https.onCall(async (data, context) => {
  const { uid, name: authName } = requireAuth(context);

  const scopeId = sanitizeString(data?.scopeId, 128);
  const matchId = sanitizeString(data?.matchId, 64);
  const pin = sanitizeString(data?.pin, 20);
  const awayCoachName = sanitizeString(data?.awayCoachName, 120) || authName;
  const awayClubId = sanitizeString(data?.awayClubId, 128) || undefined;
  const awayClubName = sanitizeString(data?.awayClubName, 200) || undefined;

  if (!scopeId || !matchId || !pin) {
    throw new functions.https.HttpsError('invalid-argument', 'scopeId, matchId and pin required');
  }

  // Načti match + pairing-auth paralelně
  const [matchSnap, authSnap] = await Promise.all([
    db.ref(`matches/${scopeId}/${matchId}`).get(),
    db.ref(`match-pairing-auth/${matchId}`).get(),
  ]);

  if (!matchSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Match not found');
  }

  const match = matchSnap.val() as {
    pairing?: {
      joinToken?: string;
      awayCoachUid?: string;
      invitedBy?: string;
      ownerScope?: string;
    };
  };
  const pairing = match.pairing ?? {};

  if (!pairing.joinToken) {
    throw new functions.https.HttpsError('failed-precondition', 'no_invite');
  }
  if (pairing.awayCoachUid && pairing.awayCoachUid !== uid) {
    throw new functions.https.HttpsError('failed-precondition', 'already_paired');
  }

  // PIN data z separátního auth uzle (client je nečte — rules blokují)
  if (!authSnap.exists()) {
    throw new functions.https.HttpsError('failed-precondition', 'no_invite');
  }
  const pinData = authSnap.val() as { pinHash?: string; pinSalt?: string };
  if (!pinData.pinHash || !pinData.pinSalt) {
    throw new functions.https.HttpsError('failed-precondition', 'no_invite');
  }

  const computed = hashPinClientCompat(pin, pinData.pinSalt);
  if (computed !== pinData.pinHash) {
    throw new functions.https.HttpsError('permission-denied', 'invalid_pin');
  }

  // Zapiš awayCoachUid + smaž pin-auth (one-time use)
  const nextPairing: Record<string, unknown> = {
    awayCoachUid: uid,
    awayCoachName,
    pairedAt: new Date().toISOString(),
    ownerScope: pairing.ownerScope ?? scopeId,
    ...(awayClubId ? { awayClubId } : {}),
    ...(awayClubName ? { awayClubName } : {}),
    ...(pairing.invitedBy ? { invitedBy: pairing.invitedBy } : {}),
  };

  await Promise.all([
    db.ref(`matches/${scopeId}/${matchId}/pairing`).set(nextPairing),
    db.ref(`match-pairing-auth/${matchId}`).remove(),
  ]);

  return {
    success: true,
    matchId,
    ownerScope: nextPairing.ownerScope,
  };
});
