import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrainingUnit } from '../types/training.types';

interface TrainingsState {
  savedTrainings: TrainingUnit[];
  saveTraining: (unit: TrainingUnit) => void;
  updateTraining: (id: string, updates: Partial<TrainingUnit>) => void;
  deleteTraining: (id: string) => void;
  getTrainingById: (id: string) => TrainingUnit | undefined;
  scheduleTraining: (id: string, date: string | null) => void;
}

export const useTrainingsStore = create<TrainingsState>()(
  persist(
    (set, get) => ({
      savedTrainings: [],

      saveTraining: (unit) =>
        set((state) => ({
          savedTrainings: [
            { ...unit, isSaved: true, updatedAt: new Date().toISOString() },
            ...state.savedTrainings.filter((t) => t.id !== unit.id),
          ],
        })),

      updateTraining: (id, updates) =>
        set((state) => ({
          savedTrainings: state.savedTrainings.map((t) =>
            t.id === id
              ? { ...t, ...updates, updatedAt: new Date().toISOString() }
              : t
          ),
        })),

      deleteTraining: (id) =>
        set((state) => ({
          savedTrainings: state.savedTrainings.filter((t) => t.id !== id),
        })),

      getTrainingById: (id) => get().savedTrainings.find((t) => t.id === id),

      scheduleTraining: (id, date) =>
        set((state) => ({
          savedTrainings: state.savedTrainings.map((t) =>
            t.id === id
              ? { ...t, scheduledDate: date ?? undefined, updatedAt: new Date().toISOString() }
              : t
          ),
        })),
    }),
    {
      name: 'trenink-saved-trainings',
    }
  )
);
