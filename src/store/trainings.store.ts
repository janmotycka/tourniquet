import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import type { TrainingUnit, TrainingAttendance, AttendanceStatus } from '../types/training.types';
import type { AgeCategory as ClubAgeCategory } from '../types/club.types';
import {
  saveTraining as saveTrainingFb,
  loadTrainings as loadTrainingsFb,
  subscribeToTrainings,
  deleteTrainingFb,
} from '../services/training.firebase';
import { logger } from '../utils/logger';

interface TrainingsState {
  savedTrainings: TrainingUnit[];
  firebaseUid: string | null;

  // Firebase sync
  setFirebaseUid: (uid: string | null) => void;
  loadFromFirebase: (uid: string) => Promise<void>;
  subscribeToFirebase: (uid: string) => () => void;

  // CRUD
  saveTraining: (unit: TrainingUnit) => void;
  updateTraining: (id: string, updates: Partial<TrainingUnit>) => void;
  deleteTraining: (id: string) => void;
  getTrainingById: (id: string) => TrainingUnit | undefined;
  scheduleTraining: (id: string, date: string | null) => void;

  // Phase 3 — kalendářová událost / docházka
  assignTrainingToClub: (id: string, clubId: string | null, clubAgeCategory: ClubAgeCategory | null) => void;
  setAttendance: (id: string, attendance: TrainingAttendance) => void;
  setPlayerAttendance: (id: string, playerId: string, status: AttendanceStatus | null) => void;
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

      /**
       * Realtime subscription — sdílení mezi zařízeními (Mac ↔ mobil).
       * Zachovává lokální tréninky, které ještě nejsou na serveru.
       */
      subscribeToFirebase: (uid) => {
        set({ firebaseUid: uid });
        const unsubscribe = subscribeToTrainings(uid, (remote) => {
          const local = get().savedTrainings;
          const remoteById = new Map(remote.map(t => [t.id, t]));
          const localById = new Map(local.map(t => [t.id, t]));

          // Merge last-write-wins podle updatedAt/createdAt
          const allIds = new Set<string>();
          remoteById.forEach((_, id) => allIds.add(id));
          localById.forEach((_, id) => allIds.add(id));

          const merged: TrainingUnit[] = [];
          let localOnlyCount = 0;
          allIds.forEach(id => {
            const r = remoteById.get(id);
            const l = localById.get(id);
            if (r && l) {
              const rT = r.updatedAt ?? r.createdAt ?? '';
              const lT = l.updatedAt ?? l.createdAt ?? '';
              merged.push(rT >= lT ? r : l);
            } else if (r) {
              merged.push(r);
            } else if (l) {
              merged.push(l);
              localOnlyCount++;
            }
          });

          set({ savedTrainings: merged });
          logger.debug(`[Trainings] Subscription update: ${remote.length} remote, ${localOnlyCount} local-only preserved`);
        });
        return unsubscribe;
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

      // ─── Phase 3 — kalendářová událost ────────────────────────────────
      assignTrainingToClub: (id, clubId, clubAgeCategory) => {
        set((state) => ({
          savedTrainings: state.savedTrainings.map((t) =>
            t.id === id
              ? {
                  ...t,
                  clubId: clubId ?? undefined,
                  clubAgeCategory: clubAgeCategory ?? undefined,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        }));
        const updated = get().savedTrainings.find(t => t.id === id);
        if (updated) syncTraining(get(), updated);
      },

      setAttendance: (id, attendance) => {
        set((state) => ({
          savedTrainings: state.savedTrainings.map((t) =>
            t.id === id
              ? { ...t, attendance, updatedAt: new Date().toISOString() }
              : t
          ),
        }));
        const updated = get().savedTrainings.find(t => t.id === id);
        if (updated) syncTraining(get(), updated);
      },

      setPlayerAttendance: (id, playerId, status) => {
        set((state) => ({
          savedTrainings: state.savedTrainings.map((t) => {
            if (t.id !== id) return t;
            const next: TrainingAttendance = { ...(t.attendance ?? {}) };
            if (status === null) delete next[playerId];
            else next[playerId] = status;
            return { ...t, attendance: next, updatedAt: new Date().toISOString() };
          }),
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
