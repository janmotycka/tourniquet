/**
 * Store pro Match Events („Den zápasů").
 * Pattern: Zustand + persist + Firebase subscribe.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import { generateId } from '../utils/id';
import { logger } from '../utils/logger';
import type { MatchEvent, MatchEventMatch, CreateMatchEventInput } from '../types/matchEvent.types';
import {
  saveMatchEventToFirebase,
  deleteMatchEventFromFirebase,
  subscribeToMatchEvents,
} from '../services/matchEvent.firebase';

function now(): string {
  return new Date().toISOString();
}

interface MatchEventsState {
  events: MatchEvent[];
  firebaseUid: string | null;

  setFirebaseUid: (uid: string | null) => void;
  subscribeToFirebase: (uid: string) => () => void;

  createEvent: (input: CreateMatchEventInput, ownerUid: string) => MatchEvent;
  updateEvent: (id: string, patch: Partial<MatchEvent>) => void;
  deleteEvent: (id: string) => void;
  getEventById: (id: string) => MatchEvent | undefined;

  // Match operations
  addMatch: (eventId: string, teamA: string, teamB: string, note?: string) => string;
  removeMatch: (eventId: string, matchId: string) => void;
  updateMatchScore: (eventId: string, matchId: string, deltaA: number, deltaB: number) => void;
  setMatchScore: (eventId: string, matchId: string, scoreA: number, scoreB: number) => void;
  setMatchStatus: (eventId: string, matchId: string, status: MatchEventMatch['status']) => void;
  resetMatch: (eventId: string, matchId: string) => void;

  // Sharing
  togglePublic: (eventId: string) => void;
}

/** Sync helper — uloží event do Firebase, tiše loguje chyby. */
async function syncEvent(event: MatchEvent): Promise<void> {
  try {
    await saveMatchEventToFirebase(event);
  } catch (err) {
    logger.error('[MatchEvents] Firebase sync failed:', err);
  }
}

export const useMatchEventsStore = create<MatchEventsState>()(
  persist(
    (set, get) => ({
      events: [],
      firebaseUid: null,

      setFirebaseUid: (uid) => {
        const prev = get().firebaseUid;
        if (!uid) {
          set({ firebaseUid: null, events: [] });
        } else if (prev && prev !== uid) {
          set({ firebaseUid: uid, events: [] });
        } else {
          set({ firebaseUid: uid });
        }
      },

      subscribeToFirebase: (uid) => {
        set({ firebaseUid: uid });
        const unsubscribe = subscribeToMatchEvents(uid, (firebaseEvents) => {
          const localOnly = get().events.filter(e => !firebaseEvents.some(fe => fe.id === e.id));
          set({ events: [...firebaseEvents, ...localOnly] });
        });
        return unsubscribe;
      },

      createEvent: (input, ownerUid) => {
        const matches: MatchEventMatch[] = (input.matches ?? []).map(m => ({
          id: generateId(),
          teamA: m.teamA,
          teamB: m.teamB,
          scoreA: 0,
          scoreB: 0,
          status: 'planned',
          ...(m.note ? { note: m.note } : {}),
        }));
        const event: MatchEvent = {
          id: generateId(),
          ownerUid,
          name: input.name,
          date: input.date,
          sport: input.sport,
          ...(input.venue ? { venue: input.venue } : {}),
          ...(input.note ? { note: input.note } : {}),
          isPublic: false,
          matches,
          createdAt: now(),
          updatedAt: now(),
        };
        set(s => ({ events: [event, ...s.events] }));
        void syncEvent(event);
        return event;
      },

      updateEvent: (id, patch) => {
        set(s => ({
          events: s.events.map(e => e.id === id ? { ...e, ...patch, updatedAt: now() } : e),
        }));
        const updated = get().events.find(e => e.id === id);
        if (updated) void syncEvent(updated);
      },

      deleteEvent: (id) => {
        const uid = get().firebaseUid;
        set(s => ({ events: s.events.filter(e => e.id !== id) }));
        if (uid) {
          deleteMatchEventFromFirebase(uid, id).catch(err =>
            logger.error('[MatchEvents] delete failed:', err),
          );
        }
      },

      getEventById: (id) => get().events.find(e => e.id === id),

      addMatch: (eventId, teamA, teamB, note) => {
        const matchId = generateId();
        const newMatch: MatchEventMatch = {
          id: matchId,
          teamA: teamA.trim() || 'Tým A',
          teamB: teamB.trim() || 'Tým B',
          scoreA: 0,
          scoreB: 0,
          status: 'planned',
          ...(note ? { note } : {}),
        };
        set(s => ({
          events: s.events.map(e => e.id === eventId
            ? { ...e, matches: [...e.matches, newMatch], updatedAt: now() }
            : e),
        }));
        const updated = get().events.find(e => e.id === eventId);
        if (updated) void syncEvent(updated);
        return matchId;
      },

      removeMatch: (eventId, matchId) => {
        set(s => ({
          events: s.events.map(e => e.id === eventId
            ? { ...e, matches: e.matches.filter(m => m.id !== matchId), updatedAt: now() }
            : e),
        }));
        const updated = get().events.find(e => e.id === eventId);
        if (updated) void syncEvent(updated);
      },

      updateMatchScore: (eventId, matchId, deltaA, deltaB) => {
        set(s => ({
          events: s.events.map(e => {
            if (e.id !== eventId) return e;
            return {
              ...e,
              matches: e.matches.map(m => {
                if (m.id !== matchId) return m;
                const scoreA = Math.max(0, m.scoreA + deltaA);
                const scoreB = Math.max(0, m.scoreB + deltaB);
                // Auto-promote status: planned → live při prvním gólu
                const status: MatchEventMatch['status'] =
                  m.status === 'planned' && (scoreA > 0 || scoreB > 0) ? 'live' : m.status;
                return {
                  ...m,
                  scoreA,
                  scoreB,
                  status,
                  ...(status === 'live' && !m.startedAt ? { startedAt: now() } : {}),
                };
              }),
              updatedAt: now(),
            };
          }),
        }));
        const updated = get().events.find(e => e.id === eventId);
        if (updated) void syncEvent(updated);
      },

      setMatchScore: (eventId, matchId, scoreA, scoreB) => {
        set(s => ({
          events: s.events.map(e => e.id !== eventId ? e : {
            ...e,
            matches: e.matches.map(m => m.id !== matchId ? m : {
              ...m,
              scoreA: Math.max(0, scoreA),
              scoreB: Math.max(0, scoreB),
            }),
            updatedAt: now(),
          }),
        }));
        const updated = get().events.find(e => e.id === eventId);
        if (updated) void syncEvent(updated);
      },

      setMatchStatus: (eventId, matchId, status) => {
        set(s => ({
          events: s.events.map(e => e.id !== eventId ? e : {
            ...e,
            matches: e.matches.map(m => m.id !== matchId ? m : {
              ...m,
              status,
              ...(status === 'live' && !m.startedAt ? { startedAt: now() } : {}),
              ...(status === 'finished' && !m.finishedAt ? { finishedAt: now() } : {}),
            }),
            updatedAt: now(),
          }),
        }));
        const updated = get().events.find(e => e.id === eventId);
        if (updated) void syncEvent(updated);
      },

      resetMatch: (eventId, matchId) => {
        set(s => ({
          events: s.events.map(e => e.id !== eventId ? e : {
            ...e,
            matches: e.matches.map(m => m.id !== matchId ? m : {
              ...m,
              scoreA: 0,
              scoreB: 0,
              status: 'planned',
              startedAt: undefined,
              finishedAt: undefined,
            }),
            updatedAt: now(),
          }),
        }));
        const updated = get().events.find(e => e.id === eventId);
        if (updated) void syncEvent(updated);
      },

      togglePublic: (eventId) => {
        set(s => ({
          events: s.events.map(e => e.id !== eventId ? e : {
            ...e,
            isPublic: !e.isPublic,
            updatedAt: now(),
          }),
        }));
        const updated = get().events.find(e => e.id === eventId);
        if (updated) void syncEvent(updated);
      },
    }),
    {
      name: 'trenink-match-events',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ events: state.events }),
    },
  ),
);
