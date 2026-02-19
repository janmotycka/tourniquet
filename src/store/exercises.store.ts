import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Exercise } from '../types/exercise.types';

interface ExercisesState {
  customExercises: Exercise[];
  favoriteIds: string[];
  addExercise: (exercise: Exercise) => void;
  updateExercise: (id: string, updates: Partial<Exercise>) => void;
  deleteExercise: (id: string) => void;
  toggleFavorite: (id: string) => void;
}

export const useExercisesStore = create<ExercisesState>()(
  persist(
    (set) => ({
      customExercises: [],
      favoriteIds: [],

      addExercise: (exercise) => set((s) => ({
        customExercises: [...s.customExercises, { ...exercise, isCustom: true }],
      })),

      updateExercise: (id, updates) => set((s) => ({
        customExercises: s.customExercises.map(e =>
          e.id === id ? { ...e, ...updates } : e
        ),
      })),

      deleteExercise: (id) => set((s) => ({
        customExercises: s.customExercises.filter(e => e.id !== id),
        favoriteIds: s.favoriteIds.filter(fid => fid !== id),
      })),

      toggleFavorite: (id) => set((s) => ({
        favoriteIds: s.favoriteIds.includes(id)
          ? s.favoriteIds.filter(fid => fid !== id)
          : [...s.favoriteIds, id],
      })),
    }),
    { name: 'trenink-custom-exercises' }
  )
);
