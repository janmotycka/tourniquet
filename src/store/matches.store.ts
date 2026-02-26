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

// ─── Helper ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

// ─── State interface ──────────────────────────────────────────────────────────

interface MatchesState {
  matches: SeasonMatch[];

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
        return match;
      },

      updateMatch: (id, patch) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== id ? m : { ...m, ...patch, updatedAt: now() }
          ),
        }));
      },

      deleteMatch: (id) => {
        set(state => ({ matches: state.matches.filter(m => m.id !== id) }));
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
      },

      addCard: (matchId, card) => {
        const newCard: MatchCard = { ...card, id: generateId(), recordedAt: now() };
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, cards: [...m.cards, newCard], updatedAt: now() }
          ),
        }));
      },

      removeCard: (matchId, cardId) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, cards: m.cards.filter(c => c.id !== cardId), updatedAt: now() }
          ),
        }));
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
      },

      removeSubstitution: (matchId, subId) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, substitutions: m.substitutions.filter(s => s.id !== subId), updatedAt: now() }
          ),
        }));
      },

      // ── Hodnocení ──────────────────────────────────────────────────────────

      saveRatings: (matchId, ratings, note) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, ratings, note: note ?? m.note, updatedAt: now() }
          ),
        }));
      },
    }),
    { name: 'trenink-matches' }
  )
);
