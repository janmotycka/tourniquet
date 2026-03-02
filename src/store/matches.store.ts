import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  SeasonMatch,
  CreateSeasonMatchInput,
  MatchGoal,
  MatchCard,
  MatchSubstitution,
  PlayerRating,
} from '../types/match.types';

import { generateId } from '../utils/id';
import { saveMatchToFirebase, deleteMatchFromFirebase, loadMatchesFromFirebase } from '../services/match.firebase';
import { logger } from '../utils/logger';
import { useToastStore } from './toast.store';

function now(): string {
  return new Date().toISOString();
}

// ─── Firebase sync helper ─────────────────────────────────────────────────────

async function syncMatch(uid: string | null, match: SeasonMatch): Promise<string | null> {
  if (!uid) return null; // not logged in, skip silently (localStorage only)
  try {
    await saveMatchToFirebase(uid, match);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Firebase] Match sync failed:', msg);
    return `Firebase sync selhal: ${msg}`;
  }
}

// ─── State interface ──────────────────────────────────────────────────────────

interface MatchesState {
  matches: SeasonMatch[];
  firebaseUid: string | null;
  syncError: string | null;

  // Firebase
  setFirebaseUid: (uid: string | null) => void;
  loadFromFirebase: (uid: string) => Promise<void>;

  // CRUD
  createMatch: (input: CreateSeasonMatchInput) => SeasonMatch;
  updateMatch: (id: string, patch: Partial<SeasonMatch>) => void;
  deleteMatch: (id: string) => void;
  getMatchById: (id: string) => SeasonMatch | undefined;

  // Řízení zápasu
  startMatch: (id: string) => void;
  finishMatch: (id: string) => void;
  pauseMatch: (id: string) => void;
  resumeMatch: (id: string) => void;

  // Události
  addGoal: (matchId: string, goal: Omit<MatchGoal, 'id' | 'recordedAt'>) => void;
  removeGoal: (matchId: string, goalId: string) => void;
  addCard: (matchId: string, card: Omit<MatchCard, 'id' | 'recordedAt'>) => void;
  removeCard: (matchId: string, cardId: string) => void;
  addSubstitution: (matchId: string, sub: Omit<MatchSubstitution, 'id' | 'recordedAt'>) => void;
  removeSubstitution: (matchId: string, subId: string) => void;

  // Hodnocení
  saveRatings: (matchId: string, ratings: PlayerRating[], note?: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMatchesStore = create<MatchesState>()(
  persist(
    (set, get) => ({
      matches: [],
      firebaseUid: null,
      syncError: null,

      // ── Firebase ──────────────────────────────────────────────────────────

      setFirebaseUid: (uid) => {
        if (!uid) {
          set({ firebaseUid: null, syncError: null });
        } else {
          set({ firebaseUid: uid });
        }
      },

      loadFromFirebase: async (uid) => {
        let matches: SeasonMatch[] = [];
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            matches = await loadMatchesFromFirebase(uid);
            break;
          } catch (err) {
            if (attempt === 3) {
              logger.error('[Firebase] Failed to load matches after 3 attempts', err);
              useToastStore.getState().show('error', 'Nepodařilo se načíst zápasy z cloudu.', 6000);
              return;
            }
            await new Promise(r => setTimeout(r, attempt * 1000));
          }
        }
        // Merge: Firebase data takes priority, keep local-only matches
        const localMatches = get().matches;
        const firebaseIds = new Set(matches.map(m => m.id));
        const localOnly = localMatches.filter(m => !firebaseIds.has(m.id));
        set({ matches: [...matches, ...localOnly], firebaseUid: uid });
      },

      // ── CRUD ────────────────────────────────────────────────────────────────

      createMatch: (input) => {
        const match: SeasonMatch = {
          id: generateId(),
          clubId: input.clubId,
          opponent: input.opponent,
          isHome: input.isHome,
          date: input.date,
          kickoffTime: input.kickoffTime,
          competition: input.competition,
          durationMinutes: input.durationMinutes,
          status: 'planned',
          startedAt: null,
          pausedAt: null,
          pausedElapsed: 0,
          finishedAt: null,
          homeScore: 0,
          awayScore: 0,
          lineup: input.lineup,
          goals: [],
          substitutions: [],
          cards: [],
          substitutionSettings: input.substitutionSettings,
          ratings: [],
          note: undefined,
          createdAt: now(),
          updatedAt: now(),
        };
        set(state => ({ matches: [match, ...state.matches] }));
        syncMatch(get().firebaseUid, match).then(err => { if (err) set({ syncError: err }); });
        return match;
      },

      updateMatch: (id, patch) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== id ? m : { ...m, ...patch, updatedAt: now() }
          ),
        }));
        const updated = get().matches.find(m => m.id === id);
        if (updated) syncMatch(get().firebaseUid, updated).then(err => { if (err) set({ syncError: err }); });
      },

      deleteMatch: (id) => {
        const uid = get().firebaseUid;
        set(state => ({ matches: state.matches.filter(m => m.id !== id) }));
        if (uid) deleteMatchFromFirebase(uid, id).catch(err => logger.error('[Firebase] Delete match failed', err));
      },

      getMatchById: (id) => get().matches.find(m => m.id === id),

      // ── Řízení zápasu ────────────────────────────────────────────────────────

      startMatch: (id) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== id ? m : {
              ...m,
              status: 'live',
              startedAt: now(),
              pausedAt: null,
              pausedElapsed: 0,
              updatedAt: now(),
            }
          ),
        }));
        const m = get().matches.find(x => x.id === id);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },

      finishMatch: (id) => {
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== id) return m;
            // Pokud je zápas pozastaven, spočítej uplynulý čas
            const elapsed = m.pausedAt
              ? m.pausedElapsed
              : m.pausedElapsed + (m.startedAt
                ? Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 1000)
                : 0);
            return {
              ...m,
              status: 'finished',
              finishedAt: now(),
              pausedAt: null,
              pausedElapsed: elapsed,
              updatedAt: now(),
            };
          }),
        }));
        const fm = get().matches.find(x => x.id === id);
        if (fm) syncMatch(get().firebaseUid, fm).then(err => { if (err) set({ syncError: err }); });
      },

      pauseMatch: (id) => {
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== id || m.status !== 'live' || m.pausedAt) return m;
            const elapsed = m.startedAt
              ? m.pausedElapsed + Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 1000)
              : m.pausedElapsed;
            return {
              ...m,
              pausedAt: now(),
              pausedElapsed: elapsed,
              updatedAt: now(),
            };
          }),
        }));
        const m = get().matches.find(x => x.id === id);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },

      resumeMatch: (id) => {
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== id || !m.pausedAt) return m;
            return {
              ...m,
              startedAt: now(),   // resetujeme startedAt na "teď" — elapsed se nuluje, ale pausedElapsed drží kumulativní čas
              pausedAt: null,
              updatedAt: now(),
            };
          }),
        }));
        const m = get().matches.find(x => x.id === id);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },

      // ── Události ─────────────────────────────────────────────────────────────

      addGoal: (matchId, goal) => {
        const newGoal: MatchGoal = { ...goal, id: generateId(), recordedAt: now() };
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== matchId) return m;
            let homeScore = m.homeScore;
            let awayScore = m.awayScore;
            if (goal.isOpponentGoal) {
              awayScore += 1;
            } else if (!goal.isOwnGoal) {
              homeScore += 1;
            } else {
              // vlastní gól — přidá soupeři
              awayScore += 1;
            }
            return { ...m, goals: [...m.goals, newGoal], homeScore, awayScore, updatedAt: now() };
          }),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },

      removeGoal: (matchId, goalId) => {
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== matchId) return m;
            const goal = m.goals.find(g => g.id === goalId);
            if (!goal) return m;
            let homeScore = m.homeScore;
            let awayScore = m.awayScore;
            if (goal.isOpponentGoal) {
              awayScore = Math.max(0, awayScore - 1);
            } else if (!goal.isOwnGoal) {
              homeScore = Math.max(0, homeScore - 1);
            } else {
              awayScore = Math.max(0, awayScore - 1);
            }
            return { ...m, goals: m.goals.filter(g => g.id !== goalId), homeScore, awayScore, updatedAt: now() };
          }),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },

      addCard: (matchId, card) => {
        const newCard: MatchCard = { ...card, id: generateId(), recordedAt: now() };
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, cards: [...m.cards, newCard], updatedAt: now() }
          ),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },

      removeCard: (matchId, cardId) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, cards: m.cards.filter(c => c.id !== cardId), updatedAt: now() }
          ),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },

      addSubstitution: (matchId, sub) => {
        const newSub: MatchSubstitution = { ...sub, id: generateId(), recordedAt: now() };
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== matchId) return m;
            // Aktualizuj pořadí v sestavě — hráč dovnitř bere pořadí hráče ven
            const updatedLineup = m.lineup.map(lp => {
              if (lp.playerId === sub.playerOutId) return { ...lp, isStarter: false, substituteOrder: 99 };
              if (lp.playerId === sub.playerInId) return { ...lp, isStarter: true };
              return lp;
            });
            return { ...m, substitutions: [...m.substitutions, newSub], lineup: updatedLineup, updatedAt: now() };
          }),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },

      removeSubstitution: (matchId, subId) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, substitutions: m.substitutions.filter(s => s.id !== subId), updatedAt: now() }
          ),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },

      // ── Hodnocení ──────────────────────────────────────────────────────────

      saveRatings: (matchId, ratings, note) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, ratings, note: note ?? m.note, updatedAt: now() }
          ),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatch(get().firebaseUid, m).then(err => { if (err) set({ syncError: err }); });
      },
    }),
    {
      name: 'trenink-matches',
      partialize: (state) => ({ matches: state.matches }),
    }
  )
);
