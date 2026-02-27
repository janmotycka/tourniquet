import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateId } from '../utils/id';

export interface Coach {
  id: string;
  name: string;
  emoji: string;
}

interface CoachesState {
  savedCoaches: Coach[];
  addCoach: (name: string, emoji?: string) => void;
  removeCoach: (id: string) => void;
  renameCoach: (id: string, name: string) => void;
}

const DEFAULT_EMOJIS = ['👤', '🙋', '🧑‍🏫', '👨‍🦱', '👩‍🦱', '🧔', '👱'];

export const useCoachesStore = create<CoachesState>()(
  persist(
    (set, get) => ({
      savedCoaches: [],

      addCoach: (name, emoji) => set((s) => ({
        savedCoaches: [
          ...s.savedCoaches,
          {
            id: generateId(),
            name: name.trim(),
            emoji: emoji ?? DEFAULT_EMOJIS[get().savedCoaches.length % DEFAULT_EMOJIS.length],
          },
        ],
      })),

      removeCoach: (id) => set((s) => ({
        savedCoaches: s.savedCoaches.filter(c => c.id !== id),
      })),

      renameCoach: (id, name) => set((s) => ({
        savedCoaches: s.savedCoaches.map(c =>
          c.id === id ? { ...c, name: name.trim() } : c
        ),
      })),
    }),
    { name: 'trenink-coaches' }
  )
);
