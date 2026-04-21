/**
 * Store pro Simple Squads — znovupoužitelné soupisky pro Simple mode.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import { generateId } from '../utils/id';
import { logger } from '../utils/logger';
import type { SimpleSquad, CreateSimpleSquadInput } from '../types/simpleSquad.types';
import {
  saveSimpleSquad,
  deleteSimpleSquadFromFirebase,
  subscribeToSimpleSquads,
} from '../services/simpleSquad.firebase';

function now(): string {
  return new Date().toISOString();
}

interface SimpleSquadsState {
  squads: SimpleSquad[];
  firebaseUid: string | null;

  setFirebaseUid: (uid: string | null) => void;
  subscribeToFirebase: (uid: string) => () => void;

  createSquad: (input: CreateSimpleSquadInput, ownerUid: string) => SimpleSquad;
  updateSquad: (id: string, patch: Partial<SimpleSquad>) => void;
  deleteSquad: (id: string) => void;
  /** Zaznamenat použití party (pro řazení). */
  markUsed: (id: string) => void;
  getSquadById: (id: string) => SimpleSquad | undefined;
}

async function sync(squad: SimpleSquad): Promise<void> {
  try {
    await saveSimpleSquad(squad);
  } catch (err) {
    logger.error('[SimpleSquads] sync failed:', err);
  }
}

export const useSimpleSquadsStore = create<SimpleSquadsState>()(
  persist(
    (set, get) => ({
      squads: [],
      firebaseUid: null,

      setFirebaseUid: (uid) => {
        const prev = get().firebaseUid;
        if (!uid) set({ firebaseUid: null, squads: [] });
        else if (prev && prev !== uid) set({ firebaseUid: uid, squads: [] });
        else set({ firebaseUid: uid });
      },

      subscribeToFirebase: (uid) => {
        set({ firebaseUid: uid });
        const unsubscribe = subscribeToSimpleSquads(uid, (fbSquads) => {
          const localOnly = get().squads.filter(s => !fbSquads.some(fs => fs.id === s.id));
          set({ squads: [...fbSquads, ...localOnly] });
        });
        return unsubscribe;
      },

      createSquad: (input, ownerUid) => {
        const squad: SimpleSquad = {
          id: generateId(),
          ownerUid,
          name: input.name.trim() || 'Nová parta',
          sport: input.sport,
          players: input.players.filter(p => p.trim().length > 0),
          usageCount: 0,
          createdAt: now(),
          updatedAt: now(),
        };
        set(s => ({ squads: [squad, ...s.squads] }));
        void sync(squad);
        return squad;
      },

      updateSquad: (id, patch) => {
        set(s => ({
          squads: s.squads.map(sq => sq.id === id ? { ...sq, ...patch, updatedAt: now() } : sq),
        }));
        const updated = get().squads.find(s => s.id === id);
        if (updated) void sync(updated);
      },

      deleteSquad: (id) => {
        const uid = get().firebaseUid;
        set(s => ({ squads: s.squads.filter(sq => sq.id !== id) }));
        if (uid) {
          deleteSimpleSquadFromFirebase(uid, id).catch(err =>
            logger.error('[SimpleSquads] delete failed:', err),
          );
        }
      },

      markUsed: (id) => {
        set(s => ({
          squads: s.squads.map(sq => sq.id === id
            ? { ...sq, usageCount: (sq.usageCount ?? 0) + 1, lastUsedAt: now(), updatedAt: now() }
            : sq),
        }));
        const updated = get().squads.find(s => s.id === id);
        if (updated) void sync(updated);
      },

      getSquadById: (id) => get().squads.find(s => s.id === id),
    }),
    {
      name: 'trenink-simple-squads',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ squads: state.squads }),
    },
  ),
);
