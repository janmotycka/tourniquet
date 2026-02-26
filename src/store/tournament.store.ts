import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tournament, Match, Goal, CreateTournamentInput, TournamentSettings } from '../types/tournament.types';
import { generateRoundRobinSchedule, generateId, computeMatchStartTime, parseStartDateTime } from '../utils/tournament-schedule';
import { logger } from '../utils/logger';
import {
  saveTournamentToFirebase,
  savePublicTournament,
  deleteTournamentFromFirebase,
  loadTournamentsFromFirebase,
  loadPublicTournament,
  subscribeToPublicTournament,
} from '../services/tournament.firebase';
import {
  addJoinedTournament,
  removeJoinedTournament,
  loadJoinedTournaments,
} from '../services/user.firebase';
import { verifyPin } from '../utils/pin-hash';

// ─── State interface ──────────────────────────────────────────────────────────

// ─── Active real-time subscriptions (cleanup) ────────────────────────────────
const activeSubscriptions = new Map<string, () => void>();

function unsubscribeAll() {
  activeSubscriptions.forEach(unsub => unsub());
  activeSubscriptions.clear();
}

function subscribeToJoined(tournamentId: string, onUpdate: (t: Tournament | null) => void) {
  if (activeSubscriptions.has(tournamentId)) return;
  const unsub = subscribeToPublicTournament(tournamentId, onUpdate);
  activeSubscriptions.set(tournamentId, unsub);
}

/** Subscribe owner's tournament to public path — přijímá změny od připojených rozhodčích */
function subscribeToOwnedPublic(tournamentId: string, onUpdate: (t: Tournament | null) => void) {
  const key = `own:${tournamentId}`;
  if (activeSubscriptions.has(key)) return;
  const unsub = subscribeToPublicTournament(tournamentId, onUpdate);
  activeSubscriptions.set(key, unsub);
}

interface TournamentState {
  tournaments: Tournament[];
  joinedTournaments: Tournament[];   // turnaje sdílené přes PIN (non-owner)
  firebaseUid: string | null;
  syncError: string | null;          // poslední chyba syncu (viditelná v UI)

  // Inicializace po přihlášení
  setFirebaseUid: (uid: string | null) => void;
  loadFromFirebase: (uid: string) => Promise<void>;
  clearSyncError: () => void;

  // Sdílený přístup
  joinTournament: (tournamentId: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  leaveTournament: (tournamentId: string) => Promise<void>;

  // Helper: najde turnaj v obou polích
  findTournament: (id: string) => Tournament | undefined;
  isOwner: (tournamentId: string) => boolean;

  // CRUD
  createTournament: (input: CreateTournamentInput) => Promise<Tournament>;
  updateTournament: (id: string, updates: Partial<Tournament>) => Promise<void>;
  deleteTournament: (id: string) => Promise<void>;
  getTournamentById: (id: string) => Tournament | undefined;

  // Zápasy
  startMatch: (tournamentId: string, matchId: string) => Promise<void>;
  finishMatch: (tournamentId: string, matchId: string) => Promise<void>;
  addGoal: (tournamentId: string, matchId: string, goal: Omit<Goal, 'id' | 'recordedAt'>) => Promise<void>;
  removeLastGoal: (tournamentId: string, matchId: string) => Promise<void>;
  removeGoal: (tournamentId: string, matchId: string, goalId: string) => Promise<void>;
  updateGoalPlayer: (tournamentId: string, matchId: string, goalId: string, playerId: string | null) => Promise<void>;
  reopenMatch: (tournamentId: string, matchId: string) => Promise<void>;
  resetMatch: (tournamentId: string, matchId: string) => Promise<void>;
  pauseMatch: (tournamentId: string, matchId: string) => Promise<void>;
  resumeMatch: (tournamentId: string, matchId: string) => Promise<void>;

  // Hráči
  addPlayer: (tournamentId: string, teamId: string, player: { name: string; jerseyNumber: number; birthYear: number | null }) => Promise<void>;
  removePlayer: (tournamentId: string, teamId: string, playerId: string) => Promise<void>;
  updatePlayer: (tournamentId: string, teamId: string, playerId: string, updates: { name?: string; jerseyNumber?: number; birthYear?: number | null }) => Promise<void>;

  // Týmy
  updateTeamName: (tournamentId: string, teamId: string, name: string) => Promise<void>;

  // Přegenerování harmonogramu
  regenerateSchedule: (tournamentId: string, newSettings: TournamentSettings) => Promise<void>;

  // Firebase sync helpers (internal)
  markSynced: (tournamentId: string) => void;
}

// ─── Helper: sync turnaje do Firebase po každé změně ─────────────────────────

/** Ownership-aware sync: owner píše do obou cest, non-owner jen do public.
 *  Vrací error message pokud sync selže (pro zobrazení v UI). */
async function syncToFirebase(uid: string | null, tournament: Tournament): Promise<string | null> {
  if (!uid) return 'Nejste přihlášen — data se neukládají na server.';
  try {
    if (tournament.ownerUid === uid) {
      await saveTournamentToFirebase(uid, tournament);
    } else {
      await savePublicTournament(tournament);
    }
    logger.debug('[Firebase] Sync OK:', tournament.id, '→', tournament.ownerUid === uid ? 'owner+public' : 'public only');
    return null; // úspěch
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Firebase] Sync failed:', msg, err);
    return `Firebase sync selhal: ${msg}`;
  }
}

// ─── Helper: mutace turnaje v obou polích (owned + joined) ──────────────────

type TournamentMapper = (t: Tournament) => Tournament;

/** Aplikuje mapper na turnaj s daným ID, ať je v tournaments nebo joinedTournaments */
function mutateBothArrays(
  state: { tournaments: Tournament[]; joinedTournaments: Tournament[] },
  tournamentId: string,
  mapper: TournamentMapper
): Partial<{ tournaments: Tournament[]; joinedTournaments: Tournament[] }> {
  const inOwned = state.tournaments.some(t => t.id === tournamentId);
  if (inOwned) {
    return { tournaments: state.tournaments.map(t => t.id === tournamentId ? mapper(t) : t) };
  }
  return { joinedTournaments: state.joinedTournaments.map(t => t.id === tournamentId ? mapper(t) : t) };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTournamentStore = create<TournamentState>()(
  persist(
    (set, get) => ({
      tournaments: [],
      joinedTournaments: [],
      firebaseUid: null,
      syncError: null,

      clearSyncError: () => set({ syncError: null }),

      // ── Inicializace ──────────────────────────────────────────────────────

      setFirebaseUid: (uid) => {
        const prevUid = get().firebaseUid;
        if (!uid) {
          // Logout — vyčistit subscriptions + staré data z persist
          unsubscribeAll();
          set({ firebaseUid: null, tournaments: [], joinedTournaments: [], syncError: null });
          return;
        }
        // Jiný účet → vyčistit staré data
        if (prevUid && prevUid !== uid) {
          unsubscribeAll();
          set({ firebaseUid: uid, tournaments: [], joinedTournaments: [], syncError: null });
        } else {
          set({ firebaseUid: uid });
        }
      },

      loadFromFirebase: async (uid) => {
        try {
          logger.debug('[Firebase] Loading data for uid:', uid);

          // 1) Načti vlastní turnaje (nesmí selhat)
          let tournaments: Tournament[] = [];
          try {
            tournaments = await loadTournamentsFromFirebase(uid);
            logger.debug('[Firebase] Loaded', tournaments.length, 'own tournaments');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[Firebase] Failed to load own tournaments:', msg);
          }

          // 2) Načti sdílené turnaje (může selhat — nezablokuje vlastní)
          let joinedTournaments: Tournament[] = [];
          try {
            const joinedRefs = await loadJoinedTournaments(uid);
            const joinedIds = Object.keys(joinedRefs);
            logger.debug('[Firebase] Loaded', joinedIds.length, 'joined refs');
            joinedTournaments = (await Promise.all(
              joinedIds.map(id => loadPublicTournament(id))
            )).filter(Boolean) as Tournament[];
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn('[Firebase] Failed to load joined tournaments (missing /users rules?):', msg);
          }

          set({
            tournaments: tournaments.length > 0 ? tournaments : get().tournaments,
            joinedTournaments,
            firebaseUid: uid,
            syncError: null,
          });

          // Subscribe na real-time updates pro sdílené turnaje
          for (const t of joinedTournaments) {
            subscribeToJoined(t.id, (updated) => {
              if (updated) {
                set(state => ({
                  joinedTournaments: state.joinedTournaments.map(jt =>
                    jt.id === t.id ? updated : jt
                  ),
                }));
              }
            });
          }

          // Subscribe na public path pro VLASTNÍ turnaje — přijímáme změny od připojených rozhodčích
          for (const t of tournaments) {
            subscribeToOwnedPublic(t.id, (publicData) => {
              if (!publicData) return;
              const local = get().tournaments.find(lt => lt.id === t.id);
              if (!local) return;
              // Aplikovat jen pokud public data jsou novější (změněna připojeným uživatelem)
              if (new Date(publicData.updatedAt) > new Date(local.updatedAt)) {
                console.log('[Firebase] Owner received remote update for:', t.id);
                set(state => ({
                  tournaments: state.tournaments.map(lt =>
                    lt.id === t.id ? { ...publicData, ownerUid: local.ownerUid } : lt
                  ),
                }));
              }
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[Firebase] Load failed:', msg, err);
          set({ firebaseUid: uid, syncError: `Načtení z Firebase selhalo: ${msg}` });
        }
      },

      // ── Sdílený přístup ─────────────────────────────────────────────────

      joinTournament: async (tournamentId, pin) => {
        const uid = get().firebaseUid;
        if (!uid) return { success: false, error: 'Nejste přihlášen.' };

        // Už je vlastní?
        if (get().tournaments.some(t => t.id === tournamentId)) {
          return { success: true };
        }
        // Už je joinnutý?
        if (get().joinedTournaments.some(t => t.id === tournamentId)) {
          return { success: true };
        }

        // Načti turnaj z public path
        const tournament = await loadPublicTournament(tournamentId);
        if (!tournament) return { success: false, error: 'Turnaj nenalezen.' };

        // Ověř PIN
        const ok = await verifyPin(pin, tournament.pinHash);
        if (!ok) return { success: false, error: 'Nesprávný PIN.' };

        // Přidej do joinnutých
        set(state => ({
          joinedTournaments: [tournament, ...state.joinedTournaments],
        }));

        // Ulož referenci do Firebase
        await addJoinedTournament(uid, tournamentId, tournament.ownerUid ?? '', tournament.name);

        // Subscribe na real-time updates
        subscribeToJoined(tournamentId, (updated) => {
          if (updated) {
            set(state => ({
              joinedTournaments: state.joinedTournaments.map(jt =>
                jt.id === tournamentId ? updated : jt
              ),
            }));
          }
        });

        return { success: true };
      },

      leaveTournament: async (tournamentId) => {
        const uid = get().firebaseUid;

        // Odeber subscription
        const unsub = activeSubscriptions.get(tournamentId);
        if (unsub) { unsub(); activeSubscriptions.delete(tournamentId); }

        set(state => ({
          joinedTournaments: state.joinedTournaments.filter(t => t.id !== tournamentId),
        }));

        if (uid) {
          await removeJoinedTournament(uid, tournamentId);
        }
      },

      // ── Helpers ──────────────────────────────────────────────────────────

      findTournament: (id) => {
        return get().tournaments.find(t => t.id === id)
          || get().joinedTournaments.find(t => t.id === id);
      },

      isOwner: (tournamentId) => {
        return get().tournaments.some(t => t.id === tournamentId);
      },

      // ── CRUD ──────────────────────────────────────────────────────────────

      createTournament: async (input) => {
        const now = new Date().toISOString();
        const uid = get().firebaseUid;

        const teams = input.teams.map(t => ({
          id: generateId(),
          name: t.name,
          color: t.color,
          players: t.players.map(p => ({
            id: generateId(),
            name: p.name,
            jerseyNumber: p.jerseyNumber,
            birthYear: p.birthYear ?? null,
          })),
        }));

        let matches: Match[];

        if (input.matchOrder && input.matchOrder.length > 0) {
          // Vlastní pořadí z wizardu — vytvořit zápasy dle zadaného pořadí
          const startDateTime = parseStartDateTime(input.settings);
          const numberOfPitches = input.settings.numberOfPitches ?? 1;

          matches = input.matchOrder.map((entry, index) => {
            const slotIndex = Math.floor(index / numberOfPitches);
            const pitchNumber = (index % numberOfPitches) + 1;
            const scheduledTime = computeMatchStartTime(
              startDateTime, slotIndex,
              input.settings.matchDurationMinutes,
              input.settings.breakBetweenMatchesMinutes,
            );
            return {
              id: generateId(),
              homeTeamId: teams[entry.homeTeamIndex].id,
              awayTeamId: teams[entry.awayTeamIndex].id,
              scheduledTime: scheduledTime.toISOString(),
              durationMinutes: input.settings.matchDurationMinutes,
              status: 'scheduled' as const,
              homeScore: 0, awayScore: 0, goals: [],
              startedAt: null, finishedAt: null, pausedAt: null, pausedElapsed: 0,
              roundIndex: entry.roundIndex,
              matchIndex: index,
              pitchNumber,
            };
          });
        } else {
          matches = generateRoundRobinSchedule(teams, input.settings);
        }

        const tournament: Tournament = {
          id: generateId(),
          name: input.name,
          ownerUid: uid ?? '',
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          settings: input.settings,
          teams,
          matches,
          pinHash: input.pinHash,
          firebaseSynced: false,
          lastSyncedAt: null,
        };

        set(state => ({
          tournaments: [tournament, ...state.tournaments],
          syncError: null,
        }));

        const err = await syncToFirebase(get().firebaseUid, tournament);
        if (err) set({ syncError: err });

        // Subscribe na public path pro příjem změn od připojených rozhodčích
        subscribeToOwnedPublic(tournament.id, (publicData) => {
          if (!publicData) return;
          const local = get().tournaments.find(lt => lt.id === tournament.id);
          if (!local) return;
          if (new Date(publicData.updatedAt) > new Date(local.updatedAt)) {
            console.log('[Firebase] Owner received remote update for:', tournament.id);
            set(state => ({
              tournaments: state.tournaments.map(lt =>
                lt.id === tournament.id ? { ...publicData, ownerUid: local.ownerUid } : lt
              ),
            }));
          }
        });

        return tournament;
      },

      updateTournament: async (id, updates) => {
        set(state => ({ ...mutateBothArrays(state, id, t => ({
          ...t, ...updates, updatedAt: new Date().toISOString(),
        })), syncError: null }));
        const updated = get().getTournamentById(id);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      deleteTournament: async (id) => {
        const uid = get().firebaseUid;
        set(state => ({
          tournaments: state.tournaments.filter(t => t.id !== id),
        }));
        if (uid) {
          try {
            await deleteTournamentFromFirebase(uid, id);
          } catch (err) {
            console.error('[Firebase] Delete failed:', err);
          }
        }
      },

      getTournamentById: (id) => {
        return get().tournaments.find(t => t.id === id)
          || get().joinedTournaments.find(t => t.id === id);
      },

      // ── Zápasy ────────────────────────────────────────────────────────────

      startMatch: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          status: 'active' as const,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map((m): Match => {
            if (m.id !== matchId) return m;
            return { ...m, status: 'live', startedAt: new Date().toISOString() };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      finishMatch: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => {
          const updatedMatches = t.matches.map((m): Match => {
            if (m.id !== matchId) return m;
            return { ...m, status: 'finished', finishedAt: new Date().toISOString() };
          });
          const allFinished = updatedMatches.every(m => m.status === 'finished');
          return {
            ...t,
            status: allFinished ? 'finished' : 'active',
            updatedAt: new Date().toISOString(),
            matches: updatedMatches,
          };
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      addGoal: async (tournamentId, matchId, goalData) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map((m): Match => {
            if (m.id !== matchId) return m;
            const goal: Goal = {
              ...goalData,
              id: generateId(),
              recordedAt: new Date().toISOString(),
            };
            const scoringTeamId = goal.isOwnGoal
              ? (goal.teamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId)
              : goal.teamId;
            return {
              ...m,
              homeScore: m.homeScore + (scoringTeamId === m.homeTeamId ? 1 : 0),
              awayScore: m.awayScore + (scoringTeamId === m.awayTeamId ? 1 : 0),
              goals: [...m.goals, goal],
            };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      removeLastGoal: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map((m): Match => {
            if (m.id !== matchId || m.goals.length === 0) return m;
            const lastGoal = m.goals[m.goals.length - 1];
            const scoredForTeamId = lastGoal.isOwnGoal
              ? (lastGoal.teamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId)
              : lastGoal.teamId;
            return {
              ...m,
              homeScore: Math.max(0, m.homeScore - (scoredForTeamId === m.homeTeamId ? 1 : 0)),
              awayScore: Math.max(0, m.awayScore - (scoredForTeamId === m.awayTeamId ? 1 : 0)),
              goals: m.goals.slice(0, -1),
            };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      removeGoal: async (tournamentId, matchId, goalId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map((m): Match => {
            if (m.id !== matchId) return m;
            const goal = m.goals.find(g => g.id === goalId);
            if (!goal) return m;
            const scoredForTeamId = goal.isOwnGoal
              ? (goal.teamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId)
              : goal.teamId;
            return {
              ...m,
              homeScore: Math.max(0, m.homeScore - (scoredForTeamId === m.homeTeamId ? 1 : 0)),
              awayScore: Math.max(0, m.awayScore - (scoredForTeamId === m.awayTeamId ? 1 : 0)),
              goals: m.goals.filter(g => g.id !== goalId),
            };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      updateGoalPlayer: async (tournamentId, matchId, goalId, playerId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map((m): Match => {
            if (m.id !== matchId) return m;
            return {
              ...m,
              goals: m.goals.map(g => g.id !== goalId ? g : { ...g, playerId }),
            };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      reopenMatch: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map((m): Match => {
            if (m.id !== matchId) return m;
            return { ...m, status: 'live', startedAt: new Date().toISOString(), pausedAt: null, pausedElapsed: 0 };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      resetMatch: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => {
          const updatedMatches = t.matches.map((m): Match => {
            if (m.id !== matchId) return m;
            return {
              ...m,
              status: 'scheduled',
              homeScore: 0,
              awayScore: 0,
              goals: [],
              startedAt: null,
              finishedAt: null,
              pausedAt: null,
              pausedElapsed: 0,
            };
          });
          const allFinished = updatedMatches.every(m => m.status === 'finished');
          return {
            ...t,
            status: allFinished ? 'finished' : 'active',
            updatedAt: new Date().toISOString(),
            matches: updatedMatches,
          };
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      pauseMatch: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map((m): Match => {
            if (m.id !== matchId || m.status !== 'live' || m.pausedAt) return m;
            const elapsed = m.startedAt
              ? Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 1000) + (m.pausedElapsed ?? 0)
              : (m.pausedElapsed ?? 0);
            return { ...m, pausedAt: new Date().toISOString(), pausedElapsed: elapsed };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      resumeMatch: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map((m): Match => {
            if (m.id !== matchId || m.status !== 'live' || !m.pausedAt) return m;
            return { ...m, startedAt: new Date().toISOString(), pausedAt: null };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      // ── Hráči ─────────────────────────────────────────────────────────────

      addPlayer: async (tournamentId, teamId, playerData) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          teams: t.teams.map(team => {
            if (team.id !== teamId) return team;
            return {
              ...team,
              players: [...team.players, {
                id: generateId(),
                name: playerData.name,
                jerseyNumber: playerData.jerseyNumber,
                birthYear: playerData.birthYear,
              }],
            };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      removePlayer: async (tournamentId, teamId, playerId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          teams: t.teams.map(team => {
            if (team.id !== teamId) return team;
            return { ...team, players: team.players.filter(p => p.id !== playerId) };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      updatePlayer: async (tournamentId, teamId, playerId, updates) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          teams: t.teams.map(team => {
            if (team.id !== teamId) return team;
            return {
              ...team,
              players: team.players.map(p =>
                p.id !== playerId ? p : { ...p, ...updates }
              ),
            };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      // ── Týmy ──────────────────────────────────────────────────────────────

      updateTeamName: async (tournamentId, teamId, name) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          teams: t.teams.map(team =>
            team.id !== teamId ? team : { ...team, name }
          ),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      // ── Přegenerování harmonogramu ────────────────────────────────────────

      regenerateSchedule: async (tournamentId, newSettings) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return;

        const startDateTime = parseStartDateTime(newSettings);
        const numberOfPitches = newSettings.numberOfPitches ?? 1;

        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          settings: newSettings,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map(match => {
            // Odehrané a živé zápasy zůstanou beze změny
            if (match.status === 'finished' || match.status === 'live') return match;

            // Přepočítat čas a hřiště dle nových settings
            const slotIndex = Math.floor(match.matchIndex / numberOfPitches);
            const pitchNumber = (match.matchIndex % numberOfPitches) + 1;
            const scheduledTime = computeMatchStartTime(
              startDateTime,
              slotIndex,
              newSettings.matchDurationMinutes,
              newSettings.breakBetweenMatchesMinutes
            );

            return {
              ...match,
              scheduledTime: scheduledTime.toISOString(),
              durationMinutes: newSettings.matchDurationMinutes,
              pitchNumber,
            };
          }),
        })));
        const updated = get().getTournamentById(tournamentId);
        if (updated) {
          const err = await syncToFirebase(get().firebaseUid, updated);
          if (err) set({ syncError: err });
        }
      },

      // ── Firebase sync ─────────────────────────────────────────────────────

      markSynced: (tournamentId) => {
        set(state => ({
          tournaments: state.tournaments.map(t =>
            t.id === tournamentId
              ? { ...t, firebaseSynced: true, lastSyncedAt: new Date().toISOString() }
              : t
          ),
        }));
      },
    }),
    {
      name: 'trenink-tournaments',
      partialize: (state) => ({
        tournaments: state.tournaments,
        joinedTournaments: state.joinedTournaments,
        firebaseUid: state.firebaseUid,
        // syncError se NEPERSISTUJE — je jen runtime
      }),
    }
  )
);
