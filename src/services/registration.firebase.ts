/**
 * Firebase RTDB service for tournament team registrations.
 * Path: /registrations/{tournamentId}/{registrationId}
 */

import { ref, push, set, onValue, off, remove } from 'firebase/database';
import { db } from '../firebase';
import type { RegistrationSubmission } from '../types/tournament.types';

const registrationsRef = (tournamentId: string) =>
  ref(db, `registrations/${tournamentId}`);

const singleRef = (tournamentId: string, registrationId: string) =>
  ref(db, `registrations/${tournamentId}/${registrationId}`);

/** Coach submits a new registration (unauthenticated write). Returns the registration ID. */
export async function submitRegistration(
  tournamentId: string,
  submission: RegistrationSubmission,
): Promise<string> {
  const newRef = push(registrationsRef(tournamentId));
  await set(newRef, submission);
  return newRef.key!;
}

/** Real-time subscription to all registrations for a tournament (owner only). */
export function subscribeToRegistrations(
  tournamentId: string,
  callback: (registrations: Record<string, RegistrationSubmission>) => void,
): () => void {
  const r = registrationsRef(tournamentId);
  const handler = (snapshot: import('firebase/database').DataSnapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  };
  onValue(r, handler, () => {
    // Permission denied or connection error — return empty map
    callback({});
  });
  return () => off(r, 'value', handler);
}

/** Delete a registration (after approval or rejection). */
export async function deleteRegistration(
  tournamentId: string,
  registrationId: string,
): Promise<void> {
  await remove(singleRef(tournamentId, registrationId));
}
