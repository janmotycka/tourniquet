import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import type {
  SeasonMatch,
  CreateSeasonMatchInput,
  MatchGoal,
  MatchCard,
  MatchSubstitution,
  PlayerRating,
} from '../types/match.types';

import { generateId } from '../utils/id';
import { saveMatchToFirebase, deleteMatchFromFirebase, loadMatchesFromFirebase, deletePublicMatch, saveMatchCatalogEntry, deleteMatchCatalogEntry } from '../services/match.firebase';
import { logger } from '../utils/logger';
import { useToastStore } from './toast.store';

function now(): string {
  return new Date().toISOString();
}

// ─── Firebase sync helper ─────────────────────────────────────────────────────

async function syncMatchAndTrack(uid: string | null, match: SeasonMatch, storeSetter: (fn: (s: MatchesState) => Partial<MatchesState>) => void): Promise<void> {
  if (!uid) return; // not logged in, skip silently (localStorage only)
  try {
    await saveMatchToFirebase(uid, match);
    // Keep catalog in sync for public matches
    if (match.isPublic) {
      saveMatchCatalogEntry(match, uid).catch(err => logger.error('[Firebase] Catalog sync failed', err));
    }
    // Remove from pending on success
    storeSetter(s => ({
      syncError: null,
      pendingSync: s.pendingSync.filter(id => id !== match.id),
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Firebase] Match sync failed:', msg);
    // Add to pending queue for retry
    storeSetter(s => ({
      syncError: `Sync selhal: ${msg.slice(0, 80)}`,
      pendingSync: s.pendingSync.includes(match.id) ? s.pendingSync : [...s.pendingSync, match.id],
    }));
  }
}

// ─── State interface ──────────────────────────────────────────────────────────

interface MatchesState {
  matches: SeasonMatch[];
  firebaseUid: string | null;
  syncError: string | null;
  pendingSync: string[]; // match IDs waiting to be synced

  // Firebase
  setFirebaseUid: (uid: string | null) => void;
  loadFromFirebase: (uid: string) => Promise<void>;
  retryPendingSync: () => void;

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
  resetMatch: (id: string) => void;
  reopenMatch: (id: string) => void;

  // Události
  addGoal: (matchId: string, goal: Omit<MatchGoal, 'id' | 'recordedAt'>) => string;
  removeGoal: (matchId: string, goalId: string) => void;
  addCard: (matchId: string, card: Omit<MatchCard, 'id' | 'recordedAt'>) => void;
  removeCard: (matchId: string, cardId: string) => void;
  addSubstitution: (matchId: string, sub: Omit<MatchSubstitution, 'id' | 'recordedAt'>) => void;
  removeSubstitution: (matchId: string, subId: string) => void;

  // Hodnocení
  saveRatings: (matchId: string, ratings: PlayerRating[], note?: string) => void;

  // Sdílení
  togglePublicMatch: (matchId: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMatchesStore = create<MatchesState>()(
  persist(
    (set, get) => ({
      matches: [],
      firebaseUid: null,
      syncError: null,
      pendingSync: [],

      // ── Firebase ──────────────────────────────────────────────────────────

      setFirebaseUid: (uid) => {
        const prevUid = get().firebaseUid;
        if (!uid) {
          // Logout — clear cached matches to prevent data leaking to next user
          set({ firebaseUid: null, matches: [], syncError: null });
        } else if (prevUid && prevUid !== uid) {
          // Different account — clear stale data
          set({ firebaseUid: uid, matches: [], syncError: null });
        } else {
          set({ firebaseUid: uid });
        }
      },

      loadFromFirebase: async (uid) => {
        logger.debug('[Matches] loadFromFirebase started, uid:', uid);
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
        logger.debug(`[Matches] Loaded ${matches.length} from Firebase, ${localOnly.length} local-only, total: ${matches.length + localOnly.length}`);
        set({ matches: [...matches, ...localOnly], firebaseUid: uid, pendingSync: [] });
      },

      retryPendingSync: () => {
        const { firebaseUid, pendingSync, matches } = get();
        if (!firebaseUid || pendingSync.length === 0) return;
        for (const matchId of pendingSync) {
          const match = matches.find(m => m.id === matchId);
          if (match) syncMatchAndTrack(firebaseUid, match, set);
        }
      },

      // ── CRUD ────────────────────────────────────────────────────────────────

      createMatch: (input) => {
        const match: SeasonMatch = {
          id: generateId(),
          clubId: input.clubId,
          clubName: input.clubName,
          opponent: input.opponent,
          isHome: input.isHome,
          date: input.date,
          kickoffTime: input.kickoffTime,
          competition: input.competition,
          durationMinutes: input.durationMinutes,
          periods: input.periods,
          periodDurationMinutes: input.periodDurationMinutes,
          matchFormat: input.matchFormat,
          ageCategory: input.ageCategory,
          currentPeriod: 0,
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
          trackAssists: input.trackAssists ?? true,
          ratings: [],
          note: undefined,
          createdAt: now(),
          updatedAt: now(),
        };
        set(state => ({ matches: [match, ...state.matches] }));
        logger.debug(`[Matches] Created match ${match.id}, firebaseUid: ${get().firebaseUid}, total: ${get().matches.length}`);
        syncMatchAndTrack(get().firebaseUid, match, set);
        return match;
      },

      updateMatch: (id, patch) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== id ? m : { ...m, ...patch, updatedAt: now() }
          ),
        }));
        const updated = get().matches.find(m => m.id === id);
        if (updated) syncMatchAndTrack(get().firebaseUid, updated, set);
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
              currentPeriod: 1,
              updatedAt: now(),
            }
          ),
        }));
        const m = get().matches.find(x => x.id === id);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
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
        if (fm) syncMatchAndTrack(get().firebaseUid, fm, set);
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
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
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
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
      },

      resetMatch: (id) => {
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== id) return m;
            return {
              ...m,
              status: 'planned' as const,
              homeScore: 0,
              awayScore: 0,
              goals: [],
              cards: [],
              substitutions: [],
              ratings: [],
              note: undefined,
              currentPeriod: 0,
              startedAt: null,
              pausedAt: null,
              pausedElapsed: 0,
              finishedAt: null,
              penaltyKicks: undefined,
              homePenaltyScore: undefined,
              awayPenaltyScore: undefined,
              updatedAt: now(),
            };
          }),
        }));
        const m = get().matches.find(x => x.id === id);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
      },

      reopenMatch: (id) => {
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== id) return m;
            // Compute how much was actually played before finish
            const priorElapsed = m.finishedAt && m.startedAt
              ? m.pausedElapsed + Math.floor((new Date(m.finishedAt).getTime() - new Date(m.startedAt).getTime()) / 1000)
              : m.pausedElapsed;
            return {
              ...m,
              status: 'live' as const,
              finishedAt: null,
              startedAt: now(),
              pausedAt: null,
              pausedElapsed: priorElapsed, // carry actual played time, not stale value
              updatedAt: now(),
            };
          }),
        }));
        const m = get().matches.find(x => x.id === id);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
      },

      // ── Události ─────────────────────────────────────────────────────────────

      addGoal: (matchId, goal) => {
        const newGoal: MatchGoal = { ...goal, id: generateId(), recordedAt: now() };
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== matchId) return m;
            let homeScore = m.homeScore;
            let awayScore = m.awayScore;
            // Determine which score field is "ours" vs "opponent's" based on isHome
            const ourField = m.isHome ? 'home' : 'away';
            const oppField = m.isHome ? 'away' : 'home';

            if (goal.isOpponentGoal) {
              // Opponent scored
              if (oppField === 'home') homeScore += 1; else awayScore += 1;
            } else if (goal.isOwnGoal) {
              // Own goal — counts for opponent
              if (oppField === 'home') homeScore += 1; else awayScore += 1;
            } else {
              // Our team scored
              if (ourField === 'home') homeScore += 1; else awayScore += 1;
            }
            return { ...m, goals: [...m.goals, newGoal], homeScore, awayScore, updatedAt: now() };
          }),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
        return newGoal.id;
      },

      removeGoal: (matchId, goalId) => {
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== matchId) return m;
            const goal = m.goals.find(g => g.id === goalId);
            if (!goal) return m;
            let homeScore = m.homeScore;
            let awayScore = m.awayScore;
            // Determine which score field is "ours" vs "opponent's" based on isHome
            const ourField = m.isHome ? 'home' : 'away';
            const oppField = m.isHome ? 'away' : 'home';

            if (goal.isOpponentGoal) {
              if (oppField === 'home') homeScore = Math.max(0, homeScore - 1); else awayScore = Math.max(0, awayScore - 1);
            } else if (goal.isOwnGoal) {
              if (oppField === 'home') homeScore = Math.max(0, homeScore - 1); else awayScore = Math.max(0, awayScore - 1);
            } else {
              if (ourField === 'home') homeScore = Math.max(0, homeScore - 1); else awayScore = Math.max(0, awayScore - 1);
            }
            return { ...m, goals: m.goals.filter(g => g.id !== goalId), homeScore, awayScore, updatedAt: now() };
          }),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
      },

      addCard: (matchId, card) => {
        const newCard: MatchCard = { ...card, id: generateId(), recordedAt: now() };
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, cards: [...m.cards, newCard], updatedAt: now() }
          ),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
      },

      removeCard: (matchId, cardId) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, cards: m.cards.filter(c => c.id !== cardId), updatedAt: now() }
          ),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
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
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
      },

      removeSubstitution: (matchId, subId) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, substitutions: m.substitutions.filter(s => s.id !== subId), updatedAt: now() }
          ),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
      },

      // ── Hodnocení ──────────────────────────────────────────────────────────

      saveRatings: (matchId, ratings, note) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, ratings, note: note ?? m.note, updatedAt: now() }
          ),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
      },

      togglePublicMatch: (matchId) => {
        const match = get().matches.find(m => m.id === matchId);
        if (!match) return;
        const uid = get().firebaseUid;
        const wasPublic = !!match.isPublic;
        set(state => ({
          matches: state.matches.map(m =>
            m.id !== matchId ? m : { ...m, isPublic: !wasPublic, updatedAt: now() }
          ),
        }));
        const updated = get().matches.find(m => m.id === matchId);
        if (updated) {
          syncMatchAndTrack(uid, updated, set);
        }
        // Pokud vypínáme sdílení, smažeme public mirror + katalog
        if (wasPublic) {
          deletePublicMatch(matchId).catch(err => logger.error('[Firebase] Delete public match failed', err));
          deleteMatchCatalogEntry(matchId).catch(err => logger.error('[Firebase] Delete match catalog failed', err));
        } else if (updated && uid) {
          // Zapínáme sdílení → zapíšeme do katalogu
          saveMatchCatalogEntry(updated, uid).catch(err => logger.error('[Firebase] Save match catalog failed', err));
        }
      },
    }),
    {
      name: 'trenink-matches',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ matches: state.matches }),
    }
  )
);
