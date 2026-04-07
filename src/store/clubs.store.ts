/**
 * Zustand store pro správu klubů s Firebase sync.
 *
 * Podporuje:
 * - Hlavní klub ("Můj Klub") se správou hráčů dle věkových kategorií
 * - Soupeřské kluby jako jednoduchý kontaktní seznam
 * - Migrace ze starého localStorage-only formátu do Firebase
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import type { Club, ClubPlayer, CreateClubInput, AgeCategory, MemberOfClubs } from '../types/club.types';
import { generateId } from '../utils/id';
import {
  saveClub as saveClubFb,
  loadClubs as loadClubsFb,
  deleteClubFb,
} from '../services/club.firebase';
import {
  loadMemberOfClubs,
  loadAllSharedClubsForUser,
  loadActiveClubId,
  setActiveClubId as setActiveClubIdFb,
  subscribeToMemberOfClubs,
} from '../services/shared-club.firebase';
import { logger } from '../utils/logger';

interface ClubsState {
  clubs: Club[];
  firebaseUid: string | null;

  // ─── Shared Club Workspaces (nový model, paralelně s legacy) ────────────
  /** Mapa clubId → role pro všechny sdílené kluby, jichž je uživatel členem */
  memberOfClubs: MemberOfClubs;
  /** Aktuálně vybraný klub (pro workspace UI). Null pokud uživatel nemá žádný. */
  activeClubId: string | null;
  /** Loaded sdílené kluby (z /clubs/{clubId}) — plný obsah pro všechny členstvy */
  sharedClubs: Club[];
  /** Unsubscribe handle pro memberOfClubs listener */
  _memberOfClubsUnsub: (() => void) | null;

  loadSharedClubs: (uid: string) => Promise<void>;
  setActiveClubId: (clubId: string | null) => Promise<void>;
  /** Vrátí aktuálně aktivní sdílený klub (nebo undefined). */
  getActiveClub: () => Club | undefined;
  /** Vrátí roli aktuálního uživatele v daném klubu. */
  getMyRoleInClub: (clubId: string) => 'owner' | 'coach' | 'viewer' | null;

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
  addPlayersBulk: (clubId: string, players: Omit<ClubPlayer, 'id'>[]) => void;
  updatePlayer: (clubId: string, playerId: string, patch: Partial<Omit<ClubPlayer, 'id'>>) => void;
  removePlayer: (clubId: string, playerId: string) => void;
  movePlayerToCategory: (clubId: string, playerId: string, newCategory: AgeCategory) => void;

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

      // ─── Shared Club Workspaces state ────────────────────────────────
      memberOfClubs: {},
      activeClubId: null,
      sharedClubs: [],
      _memberOfClubsUnsub: null,

      loadSharedClubs: async (uid: string) => {
        try {
          const [memberOf, sharedClubs, activeId] = await Promise.all([
            loadMemberOfClubs(uid),
            loadAllSharedClubsForUser(uid),
            loadActiveClubId(uid),
          ]);

          // Pokud activeClubId neexistuje a máme nějaké kluby, vyber první
          let finalActiveId = activeId;
          if (!finalActiveId && sharedClubs.length > 0) {
            finalActiveId = sharedClubs[0].id;
            void setActiveClubIdFb(uid, finalActiveId).catch(err =>
              logger.warn('[Clubs] Failed to auto-set activeClubId:', err),
            );
          }

          set({
            memberOfClubs: memberOf,
            sharedClubs,
            activeClubId: finalActiveId,
          });
          logger.debug('[Clubs] Loaded', sharedClubs.length, 'shared clubs, active:', finalActiveId);

          // Attach realtime listener na memberOfClubs pro propagation invite/remove
          const prevUnsub = get()._memberOfClubsUnsub;
          if (prevUnsub) prevUnsub();
          const unsub = subscribeToMemberOfClubs(uid, (newMemberOf) => {
            set({ memberOfClubs: newMemberOf });
            // Pokud uživatel ztratil přístup k activeClubId, reset
            const current = get().activeClubId;
            if (current && !newMemberOf[current]) {
              const fallback = Object.keys(newMemberOf)[0] || null;
              set({ activeClubId: fallback });
              if (fallback) void setActiveClubIdFb(uid, fallback);
            }
          });
          set({ _memberOfClubsUnsub: unsub });
        } catch (err) {
          logger.warn('[Clubs] loadSharedClubs failed:', err);
        }
      },

      setActiveClubId: async (clubId) => {
        const uid = get().firebaseUid;
        set({ activeClubId: clubId });
        if (uid) {
          try {
            await setActiveClubIdFb(uid, clubId);
          } catch (err) {
            logger.warn('[Clubs] setActiveClubId sync failed:', err);
          }
        }
      },

      getActiveClub: () => {
        const { activeClubId, sharedClubs, clubs } = get();
        if (!activeClubId) return undefined;
        return sharedClubs.find(c => c.id === activeClubId) ?? clubs.find(c => c.id === activeClubId);
      },

      getMyRoleInClub: (clubId) => {
        const role = get().memberOfClubs[clubId];
        return role ?? null;
      },

      setFirebaseUid: (uid) => {
        const prevUnsub = get()._memberOfClubsUnsub;
        if (!uid && prevUnsub) {
          prevUnsub();
          set({
            firebaseUid: null,
            memberOfClubs: {},
            sharedClubs: [],
            activeClubId: null,
            _memberOfClubsUnsub: null,
          });
        } else {
          set({ firebaseUid: uid });
        }
      },

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

      addPlayersBulk: (clubId, playersData) => {
        const newPlayers: ClubPlayer[] = playersData.map(p => ({ ...p, id: generateId() }));
        set(s => ({
          clubs: s.clubs.map(c =>
            c.id === clubId
              ? {
                  ...c,
                  players: [...c.players, ...newPlayers],
                  // Pokud kategorie hráče v klubu zatím nejsou aktivní, automaticky doplníme
                  ageCategories: Array.from(new Set([
                    ...c.ageCategories,
                    ...newPlayers.map(p => p.ageCategory),
                  ])),
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        }));
        syncClub(get(), clubId);
      },

      movePlayerToCategory: (clubId, playerId, newCategory) => {
        const today = new Date().toISOString().slice(0, 10);
        set(s => ({
          clubs: s.clubs.map(c => {
            if (c.id !== clubId) return c;
            return {
              ...c,
              ageCategories: c.ageCategories.includes(newCategory)
                ? c.ageCategories
                : [...c.ageCategories, newCategory],
              players: c.players.map(p => {
                if (p.id !== playerId) return p;
                if (p.ageCategory === newCategory) return p; // už je tam, no-op
                const history = [...(p.categoryHistory ?? [])];
                // Uzavři otevřený interval
                const openIdx = history.findIndex(h => !h.to);
                if (openIdx >= 0) {
                  history[openIdx] = { ...history[openIdx], to: today };
                } else if (history.length === 0) {
                  // Žádná historie → seed pro starou kategorii
                  history.push({
                    category: p.ageCategory,
                    from: p.createdAt?.slice(0, 10) ?? today,
                    to: today,
                  });
                }
                history.push({ category: newCategory, from: today });
                return {
                  ...p,
                  ageCategory: newCategory,
                  categoryHistory: history,
                  updatedAt: new Date().toISOString(),
                };
              }),
              updatedAt: new Date().toISOString(),
            };
          }),
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
    { name: 'trenink-clubs', storage: createJSONStorage(() => safeStorage) },
  ),
);
