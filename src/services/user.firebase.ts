/**
 * Firebase Realtime Database — User service
 *
 * Struktura DB:
 *   /users/{uid}/joinedTournaments/{tournamentId}  → reference na sdílené turnaje
 *   /users/{uid}/subscription                       → stav předplatného (pro budoucí Stripe)
 */

import { ref, set, get, remove } from 'firebase/database';
import { db } from '../firebase';

// ─── Joined Tournaments ─────────────────────────────────────────────────────

export interface JoinedTournamentRef {
  ownerUid: string;
  joinedAt: string;
  tournamentName: string;
}

const joinedRef = (uid: string, tournamentId: string) =>
  ref(db, `users/${uid}/joinedTournaments/${tournamentId}`);

const allJoinedRef = (uid: string) =>
  ref(db, `users/${uid}/joinedTournaments`);

/** Přidá referenci na sdílený turnaj */
export async function addJoinedTournament(
  uid: string,
  tournamentId: string,
  ownerUid: string,
  tournamentName: string
): Promise<void> {
  await set(joinedRef(uid, tournamentId), {
    ownerUid,
    joinedAt: new Date().toISOString(),
    tournamentName,
  } satisfies JoinedTournamentRef);
}

/** Odebere referenci na sdílený turnaj */
export async function removeJoinedTournament(
  uid: string,
  tournamentId: string
): Promise<void> {
  await remove(joinedRef(uid, tournamentId));
}

/** Načte všechny reference na sdílené turnaje */
export async function loadJoinedTournaments(
  uid: string
): Promise<Record<string, JoinedTournamentRef>> {
  const snapshot = await get(allJoinedRef(uid));
  if (!snapshot.exists()) return {};
  return snapshot.val();
}
