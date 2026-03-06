/**
 * Zustand store pro správu klubů s Firebase sync.
 *
 * Podporuje:
 * - Hlavní klub ("Můj Klub") se správou hráčů dle věkových kategorií
 * - Soupeřské kluby jako jednoduchý kontaktní seznam
 * - Migrace ze starého localStorage-only formátu do Firebase
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Club, ClubPlayer, CreateClubInput, AgeCategory } from '../types/club.types';
import { generateId } from '../utils/id';
import {
  saveClub as saveClubFb,
  loadClubs as loadClubsFb,
  deleteClubFb,
} from '../services/club.firebase';
import { logger } from '../utils/logger';

interface ClubsState {
  clubs: Club[];
  firebaseUid: string | null;

  // Firebase sync
  loadFromFirebase: (uid: string) => Promise<void>;
  setFirebaseUid: (uid: string | null) => void;

  // CRUD klubu
  createClub: (input: CreateClubInput) => Club;
  updateClub: (id: string, patch: Partial<Omit<Club, 'id' | 'createdAt'>>) => void;
  deleteClub: (id: string) => void;
  getClubById: (id: string) => Club | undefined;

  // Správa hráčů
  addPlayer: (clubId: string, player: Omit<ClubPlayer, 'id'>) => void;
  updatePlayer: (clubId: string, playerId: string, patch: Partial<Omit<ClubPlayer, 'id'>>) => void;
  removePlayer: (clubId: string, playerId: string) => void;

  // Kategorie
  setAgeCategories: (clubId: string, categories: AgeCategory[]) => void;
}

/** Migrace starého klubu bez `players`/`ageCategories` na nový formát */
function migrateClub(club: Club): Club {
  return {
    ...club,
    players: club.players ?? [],
    ageCategories: club.ageCategories ?? [],
  };
}

/** Sync konkrétní klub na Firebase (fire & forget) */
function syncClub(state: ClubsState, clubId: string) {
  const uid = state.firebaseUid;
  const club = state.clubs.find(c => c.id === clubId);
  if (!uid || !club) return;
  saveClubFb(uid, club).catch(err =>
    logger.warn('[Clubs] Sync failed for', clubId, err),
  );
}

export const useClubsStore = create<ClubsState>()(
  persist(
    (set, get) => ({
      clubs: [],
      firebaseUid: null,

      setFirebaseUid: (uid) => set({ firebaseUid: uid }),

      loadFromFirebase: async (uid) => {
        set({ firebaseUid: uid });
        try {
          const remote = await loadClubsFb(uid);
          const local = get().clubs;

          if (remote.length > 0) {
            // Firebase má data → použij je (s migrací)
            set({ clubs: remote.map(migrateClub) });
            logger.debug('[Clubs] Loaded', remote.length, 'clubs from Firebase');
          } else if (local.length > 0) {
            // Firebase prázdný ale localStorage má kluby → push nahoru (migrace)
            const migrated = local.map(migrateClub);
            set({ clubs: migrated });
            for (const club of migrated) {
              await saveClubFb(uid, club);
            }
            logger.debug('[Clubs] Migrated', migrated.length, 'clubs to Firebase');
          }
        } catch (err) {
          logger.warn('[Clubs] Load failed:', err);
        }
      },

      createClub: (input) => {
        const now = new Date().toISOString();
        const club: Club = {
          id: generateId(),
          name: input.name,
          color: input.color,
          logoBase64: input.logoBase64 ?? null,
          defaultPlayers: input.defaultPlayers ?? [],
          players: [],
          ageCategories: input.ageCategories ?? [],
          createdAt: now,
          updatedAt: now,
        };
        set(s => ({ clubs: [...s.clubs, club] }));
        // Sync na Firebase
        const uid = get().firebaseUid;
        if (uid) {
          saveClubFb(uid, club).catch(err =>
            logger.warn('[Clubs] Sync create failed:', err),
          );
        }
        return club;
      },

      updateClub: (id, patch) => {
        set(s => ({
          clubs: s.clubs.map(c =>
            c.id === id
              ? { ...c, ...patch, updatedAt: new Date().toISOString() }
              : c,
          ),
        }));
        syncClub(get(), id);
      },

      deleteClub: (id) => {
        const uid = get().firebaseUid;
        set(s => ({ clubs: s.clubs.filter(c => c.id !== id) }));
        if (uid) {
          deleteClubFb(uid, id).catch(err =>
            logger.warn('[Clubs] Delete sync failed:', err),
          );
        }
      },

      getClubById: (id) => get().clubs.find(c => c.id === id),

      // ─── Správa hráčů ───────────────────────────────────────────────
      addPlayer: (clubId, playerData) => {
        const player: ClubPlayer = { ...playerData, id: generateId() };
        set(s => ({
          clubs: s.clubs.map(c =>
            c.id === clubId
              ? { ...c, players: [...c.players, player], updatedAt: new Date().toISOString() }
              : c,
          ),
        }));
        syncClub(get(), clubId);
      },

      updatePlayer: (clubId, playerId, patch) => {
        set(s => ({
          clubs: s.clubs.map(c =>
            c.id === clubId
              ? {
                  ...c,
                  players: c.players.map(p =>
                    p.id === playerId ? { ...p, ...patch } : p,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        }));
        syncClub(get(), clubId);
      },

      removePlayer: (clubId, playerId) => {
        set(s => ({
          clubs: s.clubs.map(c =>
            c.id === clubId
              ? {
                  ...c,
                  players: c.players.filter(p => p.id !== playerId),
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        }));
        syncClub(get(), clubId);
      },

      // ─── Kategorie ──────────────────────────────────────────────────
      setAgeCategories: (clubId, categories) => {
        set(s => ({
          clubs: s.clubs.map(c =>
            c.id === clubId
              ? { ...c, ageCategories: categories, updatedAt: new Date().toISOString() }
              : c,
          ),
        }));
        syncClub(get(), clubId);
      },
    }),
    { name: 'trenink-clubs' },
  ),
);
