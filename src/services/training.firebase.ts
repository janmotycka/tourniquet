/**
 * Firebase Realtime Database — Trainings service
 *
 * Cesta: /trainings/{ownerUid}/{trainingId}
 * Uložené tréninky uživatele.
 */

import { ref, set, get, remove, onValue, off, DataSnapshot } from 'firebase/database';
import { db } from '../firebase';
import type { TrainingUnit } from '../types/training.types';
import { logger } from '../utils/logger';

const trainingsRef = (uid: string) =>
  ref(db, `trainings/${uid}`);

const trainingRef = (uid: string, trainingId: string) =>
  ref(db, `trainings/${uid}/${trainingId}`);

/** Uloží/aktualizuje trénink */
export async function saveTraining(uid: string, training: TrainingUnit): Promise<void> {
  await set(trainingRef(uid, training.id), training);
}

/** Smaže trénink */
export async function deleteTrainingFb(uid: string, trainingId: string): Promise<void> {
  await remove(trainingRef(uid, trainingId));
}

/** Načte všechny tréninky uživatele (jednorázově) */
export async function loadTrainings(uid: string): Promise<TrainingUnit[]> {
  const snapshot = await get(trainingsRef(uid));
  if (!snapshot.exists()) return [];
  const data = snapshot.val() as Record<string, TrainingUnit>;
  return Object.values(data);
}

/**
 * Realtime subscription ke všem tréninkům uživatele.
 * Vrací unsubscribe funkci.
 */
export function subscribeToTrainings(
  uid: string,
  callback: (trainings: TrainingUnit[]) => void,
): () => void {
  const r = trainingsRef(uid);
  const handler = (snapshot: DataSnapshot) => {
    if (!snapshot.exists()) { callback([]); return; }
    const data = snapshot.val() as Record<string, TrainingUnit>;
    callback(Object.values(data));
  };
  onValue(r, handler, (err) => {
    logger.error('[Firebase] subscribeToTrainings error:', err.message);
    callback([]);
  });
  return () => off(r, 'value', handler);
}
