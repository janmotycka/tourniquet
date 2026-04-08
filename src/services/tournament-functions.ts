/**
 * Client-side wrappers for Tournament PIN Auth Cloud Functions.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface JoinTournamentResult {
  success: boolean;
  role: 'admin' | 'viewer';
  tournamentName: string;
  ownerUid: string;
}

/**
 * Ověří PIN na serveru a zapíše joinedUsers/{uid} do public mirror (admin SDK).
 * Nahradilo client-side verifyPin + writeJoinedUser, aby se útočník nemohl
 * zapsat jako admin bez znalosti PINu.
 */
export async function joinTournamentByPin(input: {
  tournamentId: string;
  pin: string;
  role?: 'admin';
}): Promise<JoinTournamentResult> {
  const fn = httpsCallable<unknown, JoinTournamentResult>(functions, 'joinTournamentByPin');
  const res = await fn(input);
  return res.data;
}

/**
 * Samostatné ověření PINu bez zápisu joinedUsers (pro gate).
 */
export async function verifyTournamentPin(input: {
  tournamentId: string;
  pin: string;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<unknown, { success: boolean }>(functions, 'verifyTournamentPin');
  const res = await fn(input);
  return res.data;
}
