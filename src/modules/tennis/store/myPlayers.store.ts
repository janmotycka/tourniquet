/**
 * myPlayersStore — Zustand store pro individuální tenisový mód.
 *
 * Uchovává list hráčů, které uživatel (rodič / individuální trenér) sleduje.
 * Na rozdíl od klubového rosteru tady není vazba na klub — flat list lidí.
 *
 * Firebase sync: `/users/{uid}/myTennisPlayers/{playerId}`. Mirror do
 * localStorage přes persist middleware (pro offline-friendly UX).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../../../utils/safe-storage';
import { generateId } from '../../../utils/id';
import { ref as dbRef, get as dbGet, set as dbSet, remove as dbRemove, onValue } from 'firebase/database';
import { db } from '../../../firebase';
import { logger } from '../../../utils/logger';
import type { MyPlayer, CreateMyPlayerInput } from '../types/my-player.types';

interface MyPlayersState {
  players: MyPlayer[];
  firebaseUid: string | null;
  _unsubscribe: (() => void) | null;

  /** Nastavit Firebase UID a spustit realtime subscribe. null = disconnect. */
  setFirebaseUid: (uid: string | null) => void;
  /** Jednorázový load (volá se z AppRouter po přihlášení). */
  loadFromFirebase: (uid: string) => Promise<void>;

  createPlayer: (input: CreateMyPlayerInput) => Promise<MyPlayer>;
  updatePlayer: (id: string, patch: Partial<Omit<MyPlayer, 'id' | 'createdAt'>>) => Promise<void>;
  deletePlayer: (id: string) => Promise<void>;
}

function playerRef(uid: string, id: string) {
  return dbRef(db, `users/${uid}/myTennisPlayers/${id}`);
}
function allPlayersRef(uid: string) {
  return dbRef(db, `users/${uid}/myTennisPlayers`);
}

export const useMyPlayersStore = create<MyPlayersState>()(
  persist(
    (set, get) => ({
      players: [],
      firebaseUid: null,
      _unsubscribe: null,

      setFirebaseUid: (uid) => {
        const prev = get()._unsubscribe;
        if (prev) prev();
        set({ firebaseUid: uid, _unsubscribe: null });
        if (!uid) return;

        // Realtime subscribe
        const unsub = onValue(allPlayersRef(uid), (snap) => {
          const data = snap.val() as Record<string, MyPlayer> | null;
          const players = data ? Object.values(data) : [];
          set({ players });
        }, (err) => {
          logger.warn('[MyPlayers] Subscribe error:', err);
        });
        set({ _unsubscribe: unsub });
      },

      loadFromFirebase: async (uid) => {
        try {
          const snap = await dbGet(allPlayersRef(uid));
          const data = snap.val() as Record<string, MyPlayer> | null;
          set({ players: data ? Object.values(data) : [] });
        } catch (err) {
          logger.warn('[MyPlayers] Load failed:', err);
        }
      },

      createPlayer: async (input) => {
        const now = new Date().toISOString();
        const player: MyPlayer = {
          id: generateId(),
          name: input.name.trim(),
          birthYear: input.birthYear ?? null,
          category: input.category,
          cztenisId: input.cztenisId?.trim() || undefined,
          currentClub: input.currentClub?.trim() || undefined,
          notes: input.notes?.trim() || undefined,
          relation: input.relation,
          createdAt: now,
          updatedAt: now,
        };
        set(s => ({ players: [...s.players, player] }));
        const uid = get().firebaseUid;
        if (uid) {
          try { await dbSet(playerRef(uid, player.id), player); }
          catch (err) { logger.warn('[MyPlayers] Save failed:', err); }
        }
        return player;
      },

      updatePlayer: async (id, patch) => {
        const players = get().players.map(p =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
        );
        set({ players });
        const uid = get().firebaseUid;
        const player = players.find(p => p.id === id);
        if (uid && player) {
          try { await dbSet(playerRef(uid, id), player); }
          catch (err) { logger.warn('[MyPlayers] Update failed:', err); }
        }
      },

      deletePlayer: async (id) => {
        set(s => ({ players: s.players.filter(p => p.id !== id) }));
        const uid = get().firebaseUid;
        if (uid) {
          try { await dbRemove(playerRef(uid, id)); }
          catch (err) { logger.warn('[MyPlayers] Delete failed:', err); }
        }
      },
    }),
    {
      name: 'torq-my-tennis-players',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ players: state.players }),
    },
  ),
);
