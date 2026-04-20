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
  AttendanceStatus,
} from '../types/match.types';

import { generateId } from '../utils/id';
import {
  saveMatchToFirebase, deleteMatchFromFirebase, loadMatchesFromFirebase,
  subscribeToMatchesMultiScope, deletePublicMatch, saveMatchCatalogEntry,
  deleteMatchCatalogEntry, updateMatchActiveEditor,
  writeMatchPairing, writeMatchPairingAuth,
} from '../services/match.firebase';
import { generatePinSalt, hashPin } from '../utils/pin-hash';
import { logger } from '../utils/logger';
import { useToastStore } from './toast.store';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

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
  /** Soft-lock management pro multi-trenér koordinaci. */
  claimMatchLock: (matchId: string, userName: string) => Promise<boolean>;
  releaseMatchLock: (matchId: string) => Promise<void>;
  refreshMatchLock: (matchId: string) => Promise<void>;
  loadFromFirebase: (uid: string) => Promise<void>;
  /**
   * Subscribe na zápasy napříč scope (legacy user uid + všechny kluby uživatele).
   * Volající musí při změně klubového členství znovu zavolat s aktualizovaným
   * seznamem scope.
   */
  subscribeToFirebase: (scopeIds: string[]) => () => void;
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
  addSubstitution: (matchId: string, sub: Omit<MatchSubstitution, 'id' | 'recordedAt'>) => string;
  removeSubstitution: (matchId: string, subId: string) => void;
  /** Zruší více střídání najednou a vrátí lineup do původního stavu (swap isStarter zpět). */
  undoSubstitutions: (matchId: string, subIds: string[]) => void;

  // Účast
  setLineupAttendance: (matchId: string, playerId: string, status: AttendanceStatus) => void;

  // Hodnocení
  saveRatings: (matchId: string, ratings: PlayerRating[], note?: string) => void;

  // Sdílení
  togglePublicMatch: (matchId: string) => void;

  // ─── Cross-team pairing (Option B) ──────────────────────────────────────
  /** Vygeneruje PIN + joinToken pro zápas; uloží pairing do matche a vrátí PIN
   *  + pairing URL (hash-route). Vrací null při chybě. */
  createMatchPairingInvite: (matchId: string, invitedBy: string) => Promise<{ pin: string; joinUrl: string } | null>;
  /** Zruší pairing invite (vymaže joinToken/pinHash); zachová awayCoachUid pokud
   *  už někdo joinnul. */
  revokeMatchPairingInvite: (matchId: string) => Promise<void>;
  /** Opoziční trenér — claim po zadání PINu. Načte match ze scope, ověří
   *  hash(pin+salt), zapíše awayCoachUid. */
  joinMatchPairing: (scopeId: string, matchId: string, pin: string, awayCoachName: string, awayClubId?: string, awayClubName?: string) => Promise<{ ok: true; match: SeasonMatch } | { ok: false; error: 'not_found' | 'no_invite' | 'already_paired' | 'invalid_pin' | 'network' }>;
  /** Home coach — odpárování opozičního trenéra (vymaže celý pairing). */
  unlinkMatchPairing: (matchId: string) => Promise<void>;
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

      // ─── Active editor lock (multi-trainer koordinace) ────────────────────
      // Jeden trenér "spravuje" zápas naráz. Ostatní vidí banner + mohou převzít
      // řízení. Lock má heartbeat (15s) a auto-expiruje po 45s.

      claimMatchLock: async (matchId, userName) => {
        const uid = get().firebaseUid;
        if (!uid) return false;
        const match = get().matches.find(m => m.id === matchId);
        if (!match) return false;

        // Zkontroluj jestli už existuje aktivní lock od někoho jiného a není stale.
        const now = Date.now();
        const existing = match.activeEditor;
        const STALE_MS = 45_000;
        if (existing && existing.uid !== uid) {
          const age = now - new Date(existing.heartbeatAt).getTime();
          if (age < STALE_MS) {
            // Aktivní editor — nebereme sílou
            return false;
          }
        }

        const scope = match.clubId && !match.clubId.startsWith('individual-') ? match.clubId : uid;
        const editor = {
          uid,
          name: userName,
          startedAt: existing?.uid === uid ? existing.startedAt : new Date(now).toISOString(),
          heartbeatAt: new Date(now).toISOString(),
        };
        try {
          await updateMatchActiveEditor(scope, matchId, editor);
          set(s => ({
            matches: s.matches.map(m => m.id === matchId ? { ...m, activeEditor: editor } : m),
          }));
          return true;
        } catch (err) {
          logger.warn('[Matches] claimMatchLock failed:', err);
          return false;
        }
      },

      releaseMatchLock: async (matchId) => {
        const uid = get().firebaseUid;
        if (!uid) return;
        const match = get().matches.find(m => m.id === matchId);
        if (!match) return;
        // Release jen pokud jsem vlastník locku (neřezeme cizí session).
        if (match.activeEditor?.uid !== uid) return;
        const scope = match.clubId && !match.clubId.startsWith('individual-') ? match.clubId : uid;
        try {
          await updateMatchActiveEditor(scope, matchId, null);
          set(s => ({
            matches: s.matches.map(m => m.id === matchId ? { ...m, activeEditor: null } : m),
          }));
        } catch (err) {
          logger.warn('[Matches] releaseMatchLock failed:', err);
        }
      },

      refreshMatchLock: async (matchId) => {
        const uid = get().firebaseUid;
        if (!uid) return;
        const match = get().matches.find(m => m.id === matchId);
        // Guard: bez activeEditor (null) nebylo co refreshovat. Bez tohoto
        // by se {...null} zapsal do Firebase a vznikl by stub bez uid/name.
        if (!match || !match.activeEditor || match.activeEditor.uid !== uid) return;
        const scope = match.clubId && !match.clubId.startsWith('individual-') ? match.clubId : uid;
        const updated = {
          ...match.activeEditor,
          heartbeatAt: new Date().toISOString(),
        };
        try {
          await updateMatchActiveEditor(scope, matchId, updated);
          set(s => ({
            matches: s.matches.map(m => m.id === matchId ? { ...m, activeEditor: updated } : m),
          }));
        } catch {
          // Heartbeat fail je ne-kritický — další pokus za 15s
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

      /**
       * Realtime subscription — pro sdílení mezi zařízeními (Mac ↔ mobil).
       * Při každé změně v Firebase aktualizuje lokální store. Firebase data má
       * přednost, lokální zápasy bez sync se zachovají (pendingSync).
       */
      subscribeToFirebase: (scopeIds) => {
        logger.debug('[Matches] subscribeToFirebase started, scopes:', scopeIds.join(','));
        // První scope by měl být vždy auth uid (legacy self-scope).
        if (scopeIds[0]) set({ firebaseUid: scopeIds[0] });
        const unsubscribe = subscribeToMatchesMultiScope(scopeIds, (firebaseMatches) => {
          const { matches: localMatches } = get();
          const fbById = new Map(firebaseMatches.map(m => [m.id, m]));
          const localById = new Map(localMatches.map(m => [m.id, m]));

          // Merge last-write-wins podle updatedAt; zachovat lokální zápasy,
          // které ještě nejsou na serveru (tzv. "local-only" — vytvořeno offline
          // nebo před dokončením prvního syncu).
          const allIds = new Set<string>();
          fbById.forEach((_, id) => allIds.add(id));
          localById.forEach((_, id) => allIds.add(id));

          const merged: SeasonMatch[] = [];
          let localOnlyCount = 0;
          allIds.forEach(id => {
            const fb = fbById.get(id);
            const local = localById.get(id);
            if (fb && local) {
              merged.push(fb.updatedAt >= local.updatedAt ? fb : local);
            } else if (fb) {
              merged.push(fb);
            } else if (local) {
              merged.push(local);
              localOnlyCount++;
            }
          });

          logger.debug(`[Matches] Subscription update: ${firebaseMatches.length} from Firebase, ${localOnlyCount} local-only preserved`);
          set({ matches: merged });
        });
        return unsubscribe;
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
          sport: input.sport ?? 'football',
          matchType: input.matchType ?? 'single',
          subMatches: input.subMatches,
          officialResultsNote: input.officialResultsNote,
          officialResultsUrl: input.officialResultsUrl,
          myPlayerId: input.myPlayerId,
          clubId: input.clubId,
          clubName: input.clubName,
          opponent: input.opponent,
          opponentClubId: input.opponentClubId,
          opponentCatalogId: input.opponentCatalogId,
          isHome: input.isHome,
          venue: input.venue,
          date: input.date,
          kickoffTime: input.kickoffTime,
          competition: input.competition,
          durationMinutes: input.durationMinutes,
          periods: input.periods,
          periodDurationMinutes: input.periodDurationMinutes,
          matchFormat: input.matchFormat,
          ageCategory: input.ageCategory,
          squad: input.squad,
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
        // Zjisti clubId před smazáním ze state (potřebujeme pro delete z klubového scope).
        const existing = get().matches.find(m => m.id === id);
        set(state => ({ matches: state.matches.filter(m => m.id !== id) }));
        if (uid) {
          deleteMatchFromFirebase(uid, id, existing?.clubId)
            .catch(err => logger.error('[Firebase] Delete match failed', err));
        }
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
        return newSub.id;
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

      undoSubstitutions: (matchId, subIds) => {
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== matchId) return m;
            const toUndo = m.substitutions.filter(s => subIds.includes(s.id));
            if (toUndo.length === 0) return m;
            // Vrať lineup — každý hráč co šel ven je zpět starter, každý co šel dovnitř je zpět bench
            const outIds = new Set(toUndo.map(s => s.playerOutId));
            const inIds = new Set(toUndo.map(s => s.playerInId));
            const benchCount = m.lineup.filter(p => !p.isStarter).length;
            const updatedLineup = m.lineup.map(lp => {
              if (outIds.has(lp.playerId)) return { ...lp, isStarter: true, substituteOrder: 0 };
              if (inIds.has(lp.playerId)) return { ...lp, isStarter: false, substituteOrder: benchCount + 1 };
              return lp;
            });
            return {
              ...m,
              substitutions: m.substitutions.filter(s => !subIds.includes(s.id)),
              lineup: updatedLineup,
              updatedAt: now(),
            };
          }),
        }));
        const m = get().matches.find(x => x.id === matchId);
        if (m) syncMatchAndTrack(get().firebaseUid, m, set);
      },

      // ── Účast ──────────────────────────────────────────────────────────────

      setLineupAttendance: (matchId, playerId, status) => {
        set(state => ({
          matches: state.matches.map(m => {
            if (m.id !== matchId) return m;
            return {
              ...m,
              lineup: m.lineup.map(p =>
                p.playerId === playerId ? { ...p, attendance: status } : p
              ),
              updatedAt: now(),
            };
          }),
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

      // ── Cross-team pairing ──────────────────────────────────────────────────
      createMatchPairingInvite: async (matchId, invitedBy) => {
        const uid = get().firebaseUid;
        if (!uid) return null;
        const match = get().matches.find(m => m.id === matchId);
        if (!match) return null;

        // 4-digit PIN + hash + random joinToken
        const pin = String(Math.floor(1000 + Math.random() * 9000));
        const pinSalt = generatePinSalt();
        const pinHash = await hashPin(pin, pinSalt);
        const joinToken = generatePinSalt(); // 128-bit random token

        const scope = match.clubId && !match.clubId.startsWith('individual-') ? match.clubId : uid;

        // Pairing uzel v match NEobsahuje pinHash/pinSalt (ty jsou v /match-pairing-auth
        // kde client-side read je blokovaný — zabrání offline brute-force PINu).
        const existing = match.pairing ?? {};
        const pairing = {
          joinToken,
          invitedBy,
          ownerScope: scope,
          ...(existing.awayCoachUid ? { awayCoachUid: existing.awayCoachUid } : {}),
          ...(existing.awayCoachName ? { awayCoachName: existing.awayCoachName } : {}),
          ...(existing.awayClubId ? { awayClubId: existing.awayClubId } : {}),
          ...(existing.awayClubName ? { awayClubName: existing.awayClubName } : {}),
          ...(existing.pairedAt ? { pairedAt: existing.pairedAt } : {}),
        };
        try {
          // Zapiš pairing auth (pinHash/pinSalt) + pairing field paralelně.
          await Promise.all([
            writeMatchPairingAuth(matchId, { pinHash, pinSalt }),
            writeMatchPairing(scope, matchId, pairing),
          ]);
          set(s => ({
            matches: s.matches.map(m => m.id === matchId ? { ...m, pairing, updatedAt: now() } : m),
          }));
          const base = window.location.origin + window.location.pathname;
          const joinUrl = `${base}#pair-match=${scope}:${matchId}:${joinToken}`;
          return { pin, joinUrl };
        } catch (err) {
          logger.error('[Matches] createMatchPairingInvite failed:', err);
          return null;
        }
      },

      revokeMatchPairingInvite: async (matchId) => {
        const uid = get().firebaseUid;
        if (!uid) return;
        const match = get().matches.find(m => m.id === matchId);
        if (!match) return;
        const scope = match.clubId && !match.clubId.startsWith('individual-') ? match.clubId : uid;

        // Smazat pinHash + invite části, zachovat awayCoach* (pokud někdo joinnul)
        const existing = match.pairing ?? {};
        const next = existing.awayCoachUid ? {
          awayCoachUid: existing.awayCoachUid,
          ...(existing.awayCoachName ? { awayCoachName: existing.awayCoachName } : {}),
          ...(existing.awayClubId ? { awayClubId: existing.awayClubId } : {}),
          ...(existing.awayClubName ? { awayClubName: existing.awayClubName } : {}),
          ...(existing.pairedAt ? { pairedAt: existing.pairedAt } : {}),
        } : null;

        try {
          await Promise.all([
            writeMatchPairingAuth(matchId, null),
            writeMatchPairing(scope, matchId, next),
          ]);
          set(s => ({
            matches: s.matches.map(m => m.id === matchId ? { ...m, pairing: next as SeasonMatch['pairing'], updatedAt: now() } : m),
          }));
        } catch (err) {
          logger.error('[Matches] revokeMatchPairingInvite failed:', err);
        }
      },

      joinMatchPairing: async (scopeId, matchId, pin, awayCoachName, awayClubId, awayClubName) => {
        const uid = get().firebaseUid;
        if (!uid) return { ok: false, error: 'network' };

        // Volá Cloud Function `joinMatchPairingByPin` — ta server-side ověří PIN
        // přes admin SDK (klient NEMÁ přístup k /match-pairing-auth/). Tím je
        // eliminován client-side bypass + offline brute-force PINu.
        const cf = httpsCallable<
          { scopeId: string; matchId: string; pin: string; awayCoachName: string; awayClubId?: string; awayClubName?: string },
          { success: boolean; matchId: string; ownerScope: string }
        >(functions, 'joinMatchPairingByPin');

        try {
          await cf({ scopeId, matchId, pin, awayCoachName, awayClubId, awayClubName });
        } catch (err) {
          const code = (err as { code?: string; details?: string }).code ?? '';
          const details = (err as { details?: string }).details ?? '';
          logger.warn('[Matches] joinMatchPairing CF failed:', code, details);
          // Mapuj Firebase error kódy na naše UI errory
          if (code === 'functions/not-found') return { ok: false, error: 'not_found' };
          if (code === 'functions/failed-precondition') {
            if (details === 'already_paired') return { ok: false, error: 'already_paired' };
            return { ok: false, error: 'no_invite' };
          }
          if (code === 'functions/permission-denied') return { ok: false, error: 'invalid_pin' };
          if (code === 'functions/unauthenticated') return { ok: false, error: 'network' };
          return { ok: false, error: 'network' };
        }

        // Po úspěšném CF má user paired-coach write přístup. Načteme match
        // ze scope — nyní to projde díky awayCoachUid === uid match rule.
        // Server vrátil ownerScope = skutečný scope (pro subscribe později).
        // Zápas se objeví v store přes subscribeToSingleMatch v MatchDetailPage.
        // Tady jen vygenerujeme synthetic pairing data pro immediate feedback.
        const nextPairing = {
          awayCoachUid: uid,
          awayCoachName,
          pairedAt: now(),
          ownerScope: scopeId,
          ...(awayClubId ? { awayClubId } : {}),
          ...(awayClubName ? { awayClubName } : {}),
        };

        // Místo match synthetic: vrať successful ok + vygeneruj minimal match
        // object. Caller (JoinMatchPairingModal) ho použije pro navigaci,
        // realtime subscribe se postará o skutečná match data.
        const pairedMatch: SeasonMatch = {
          id: matchId,
          sport: 'football',
          matchType: 'single',
          clubId: scopeId,
          opponent: awayClubName ?? '',
          isHome: false,
          date: new Date().toISOString().split('T')[0],
          kickoffTime: '',
          competition: '',
          durationMinutes: 60,
          periods: 2,
          periodDurationMinutes: 30,
          currentPeriod: 0,
          status: 'planned',
          startedAt: null,
          pausedAt: null,
          pausedElapsed: 0,
          finishedAt: null,
          homeScore: 0,
          awayScore: 0,
          lineup: [],
          goals: [],
          substitutions: [],
          cards: [],
          ratings: [],
          pairing: nextPairing,
          createdAt: now(),
          updatedAt: now(),
        };
        set(s => {
          const exists = s.matches.some(m => m.id === matchId);
          return {
            matches: exists
              ? s.matches.map(m => m.id === matchId ? { ...m, pairing: nextPairing } : m)
              : [pairedMatch, ...s.matches],
          };
        });
        return { ok: true, match: pairedMatch };
      },

      unlinkMatchPairing: async (matchId) => {
        const uid = get().firebaseUid;
        if (!uid) return;
        const match = get().matches.find(m => m.id === matchId);
        if (!match) return;
        const scope = match.clubId && !match.clubId.startsWith('individual-') ? match.clubId : uid;
        try {
          await writeMatchPairing(scope, matchId, null);
          set(s => ({
            matches: s.matches.map(m => m.id === matchId ? { ...m, pairing: null, updatedAt: now() } : m),
          }));
        } catch (err) {
          logger.error('[Matches] unlinkMatchPairing failed:', err);
        }
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
