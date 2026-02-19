import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Club, CreateClubInput } from '../types/club.types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

interface ClubsState {
  clubs: Club[];
  createClub: (input: CreateClubInput) => Club;
  updateClub: (id: string, patch: Partial<Omit<Club, 'id' | 'createdAt'>>) => void;
  deleteClub: (id: string) => void;
  getClubById: (id: string) => Club | undefined;
}

export const useClubsStore = create<ClubsState>()(
  persist(
    (set, get) => ({
      clubs: [],

      createClub: (input) => {
        const now = new Date().toISOString();
        const club: Club = {
          id: generateId(),
          name: input.name,
          color: input.color,
          logoBase64: input.logoBase64 ?? null,
          defaultPlayers: input.defaultPlayers ?? [],
          createdAt: now,
          updatedAt: now,
        };
        set(s => ({ clubs: [...s.clubs, club] }));
        return club;
      },

      updateClub: (id, patch) => {
        set(s => ({
          clubs: s.clubs.map(c =>
            c.id === id
              ? { ...c, ...patch, updatedAt: new Date().toISOString() }
              : c
          ),
        }));
      },

      deleteClub: (id) => {
        set(s => ({ clubs: s.clubs.filter(c => c.id !== id) }));
      },

      getClubById: (id) => get().clubs.find(c => c.id === id),
    }),
    { name: 'trenink-clubs' }
  )
);
