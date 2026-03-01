/**
 * Firebase Realtime Database — Roster (soupiska) service
 *
 * Samostatná cesta /rosters/{tournamentId}/{teamId} — nekonfliktuje s tournament sync.
 * Trenéři zapisují bez auth (stejný vzor jako /chat/).
 */

import { ref, set, get, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import type { RosterSubmission } from '../types/tournament.types';

const rosterRef = (tournamentId: string, teamId: string) =>
  ref(db, `rosters/${tournamentId}/${teamId}`);

const allRostersRef = (tournamentId: string) =>
  ref(db, `rosters/${tournamentId}`);

/** Trenér odešle soupisku (neautentizovaný zápis) */
export async function submitRoster(
  tournamentId: string,
  teamId: string,
  submission: RosterSubmission,
): Promise<void> {
  await set(rosterRef(tournamentId, teamId), submission);
}

/** Načte jednu soupisku (jednorázově) */
export async function loadRoster(
  tournamentId: string,
  teamId: string,
): Promise<RosterSubmission | null> {
  const snapshot = await get(rosterRef(tournamentId, teamId));
  return snapshot.exists() ? snapshot.val() : null;
}

/** Real-time subscription na všechny soupisky turnaje */
export function subscribeToRosters(
  tournamentId: string,
  callback: (rosters: Record<string, RosterSubmission>) => void,
): () => void {
  const r = allRostersRef(tournamentId);
  const handler = (snapshot: import('firebase/database').DataSnapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}
