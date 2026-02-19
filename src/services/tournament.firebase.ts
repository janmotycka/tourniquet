/**
 * Firebase Realtime Database — Tournament service
 *
 * Struktura DB:
 *   /tournaments/{uid}/{tournamentId}  → plná data (jen pro přihlášeného admina)
 *   /public/{tournamentId}             → read-only mirror (pro diváky přes QR)
 */

import { ref, set, get, remove, onValue, off, DataSnapshot } from 'firebase/database';
import { db } from '../firebase';
import type { Tournament } from '../types/tournament.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const tournamentRef = (uid: string, id: string) =>
  ref(db, `tournaments/${uid}/${id}`);

const publicRef = (id: string) =>
  ref(db, `public/${id}`);

const userTournamentsRef = (uid: string) =>
  ref(db, `tournaments/${uid}`);

// ─── Serializace ─────────────────────────────────────────────────────────────

function toFirebase(t: Tournament): object {
  // JSON.parse(JSON.stringify()) odstraní undefined hodnoty
  return JSON.parse(JSON.stringify(t));
}

function fromFirebase(data: unknown): Tournament {
  return data as Tournament;
}

// ─── Zápis ────────────────────────────────────────────────────────────────────

/** Uloží/přepíše turnaj v DB (admin cesta + public mirror) */
export async function saveTournamentToFirebase(uid: string, tournament: Tournament): Promise<void> {
  const data = toFirebase(tournament);
  await Promise.all([
    set(tournamentRef(uid, tournament.id), data),
    set(publicRef(tournament.id), data),
  ]);
}

/** Smaže turnaj z DB */
export async function deleteTournamentFromFirebase(uid: string, tournamentId: string): Promise<void> {
  await Promise.all([
    remove(tournamentRef(uid, tournamentId)),
    remove(publicRef(tournamentId)),
  ]);
}

// ─── Čtení ────────────────────────────────────────────────────────────────────

/** Načte všechny turnaje uživatele jednorázově */
export async function loadTournamentsFromFirebase(uid: string): Promise<Tournament[]> {
  const snapshot = await get(userTournamentsRef(uid));
  if (!snapshot.exists()) return [];
  const data = snapshot.val() as Record<string, unknown>;
  return Object.values(data).map(fromFirebase);
}

/** Načte jeden turnaj z public mirror (pro diváky, bez auth) */
export async function loadPublicTournament(tournamentId: string): Promise<Tournament | null> {
  const snapshot = await get(publicRef(tournamentId));
  if (!snapshot.exists()) return null;
  return fromFirebase(snapshot.val());
}

// ─── Real-time listener ───────────────────────────────────────────────────────

/** Poslouchá změny public turnaje živě (pro diváky) */
export function subscribeToPublicTournament(
  tournamentId: string,
  callback: (tournament: Tournament | null) => void
): () => void {
  const r = publicRef(tournamentId);

  const handler = (snapshot: DataSnapshot) => {
    callback(snapshot.exists() ? fromFirebase(snapshot.val()) : null);
  };

  onValue(r, handler);
  return () => off(r, 'value', handler);
}
