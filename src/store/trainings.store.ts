import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import type { TrainingUnit } from '../types/training.types';
import {
  saveTraining as saveTrainingFb,
  loadTrainings as loadTrainingsFb,
  deleteTrainingFb,
} from '../services/training.firebase';
import { logger } from '../utils/logger';

interface TrainingsState {
  savedTrainings: TrainingUnit[];
  firebaseUid: string | null;

  // Firebase sync
  setFirebaseUid: (uid: string | null) => void;
  loadFromFirebase: (uid: string) => Promise<void>;

  // CRUD
  saveTraining: (unit: TrainingUnit) => void;
  updateTraining: (id: string, updates: Partial<TrainingUnit>) => void;
  deleteTraining: (id: string) => void;
  getTrainingById: (id: string) => TrainingUnit | undefined;
  scheduleTraining: (id: string, date: string | null) => void;
}

/** Sync konkrétní trénink na Firebase (fire & forget) */
function syncTraining(state: TrainingsState, training: TrainingUnit) {
  const uid = state.firebaseUid;
  if (!uid) return;
  saveTrainingFb(uid, training).catch(err =>
    logger.warn('[Trainings] Sync failed for', training.id, err),
  );
}

export const useTrainingsStore = create<TrainingsState>()(
  persist(
    (set, get) => ({
      savedTrainings: [],
      firebaseUid: null,

      setFirebaseUid: (uid) => set({ firebaseUid: uid }),

      loadFromFirebase: async (uid) => {
        set({ firebaseUid: uid });
        try {
          const remote = await loadTrainingsFb(uid);
          const local = get().savedTrainings;

          if (remote.length > 0) {
            // Merge: pro každý trénink zachovej novější verzi (dle updatedAt)
            const remoteMap = new Map(remote.map(t => [t.id, t]));
            const localMap = new Map(local.map(t => [t.id, t]));

            // Všechna unikátní ID
            const allIds = new Set([...remoteMap.keys(), ...localMap.keys()]);
            const merged: TrainingUnit[] = [];

            for (const id of allIds) {
              const r = remoteMap.get(id);
              const l = localMap.get(id);
              if (r && l) {
                // Oba existují → zachovej novější
                const rTime = r.updatedAt ?? r.createdAt ?? '';
                const lTime = l.updatedAt ?? l.createdAt ?? '';
                merged.push(rTime >= lTime ? r : l);
              } else {
                merged.push((r ?? l)!);
              }
            }

            set({ savedTrainings: merged });
            logger.debug('[Trainings] Merged', merged.length, 'trainings from Firebase');

            // Push lokální tréninky, které nebyly na serveru
            for (const t of merged) {
              if (!remoteMap.has(t.id)) {
                await saveTrainingFb(uid, t);
              }
            }
          } else if (local.length > 0) {
            // Firebase prázdný ale localStorage má tréninky → push nahoru (migrace)
            for (const training of local) {
              await saveTrainingFb(uid, training);
            }
            logger.debug('[Trainings] Migrated', local.length, 'trainings to Firebase');
          }
        } catch (err) {
          logger.warn('[Trainings] Load failed:', err);
        }
      },

      saveTraining: (unit) => {
        const training = { ...unit, isSaved: true, updatedAt: new Date().toISOString() };
        set((state) => ({
          savedTrainings: [
            training,
            ...state.savedTrainings.filter((t) => t.id !== unit.id),
          ],
        }));
        syncTraining(get(), training);
      },

      updateTraining: (id, updates) => {
        set((state) => ({
          savedTrainings: state.savedTrainings.map((t) =>
            t.id === id
              ? { ...t, ...updates, updatedAt: new Date().toISOString() }
              : t
          ),
        }));
        const updated = get().savedTrainings.find(t => t.id === id);
        if (updated) syncTraining(get(), updated);
      },

      deleteTraining: (id) => {
        const uid = get().firebaseUid;
        set((state) => ({
          savedTrainings: state.savedTrainings.filter((t) => t.id !== id),
        }));
        if (uid) {
          deleteTrainingFb(uid, id).catch(err =>
            logger.warn('[Trainings] Delete sync failed:', err),
          );
        }
      },

      getTrainingById: (id) => get().savedTrainings.find((t) => t.id === id),

      scheduleTraining: (id, date) => {
        set((state) => ({
          savedTrainings: state.savedTrainings.map((t) =>
            t.id === id
              ? { ...t, scheduledDate: date ?? undefined, updatedAt: new Date().toISOString() }
              : t
          ),
        }));
        const updated = get().savedTrainings.find(t => t.id === id);
        if (updated) syncTraining(get(), updated);
      },
    }),
    {
      name: 'trenink-saved-trainings',
      storage: createJSONStorage(() => safeStorage),
    }
  )
);
