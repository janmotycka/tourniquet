/**
 * Firebase Realtime Database — Clubs service
 *
 * Cesta: /users/{ownerUid}/clubs/{clubId}
 * Kluby s rostry hráčů po věkových kategoriích.
 */

import { ref, set, get, remove } from 'firebase/database';
import { db } from '../firebase';
import type { Club } from '../types/club.types';

const clubsRef = (uid: string) =>
  ref(db, `users/${uid}/clubs`);

const clubRef = (uid: string, clubId: string) =>
  ref(db, `users/${uid}/clubs/${clubId}`);

/** Uloží/aktualizuje klub */
export async function saveClub(uid: string, club: Club): Promise<void> {
  await set(clubRef(uid, club.id), club);
}

/** Smaže klub */
export async function deleteClubFb(uid: string, clubId: string): Promise<void> {
  await remove(clubRef(uid, clubId));
}

/** Načte všechny kluby uživatele */
export async function loadClubs(uid: string): Promise<Club[]> {
  const snapshot = await get(clubsRef(uid));
  if (!snapshot.exists()) return [];
  const data = snapshot.val() as Record<string, Club>;
  return Object.values(data);
}
