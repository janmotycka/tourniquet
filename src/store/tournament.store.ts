import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tournament, Match, Goal, CreateTournamentInput } from '../types/tournament.types';
import { generateRoundRobinSchedule, generateId } from '../utils/tournament-schedule';
import {
  saveTournamentToFirebase,
  deleteTournamentFromFirebase,
  loadTournamentsFromFirebase,
} from '../services/tournament.firebase';

// ─── State interface ──────────────────────────────────────────────────────────

interface TournamentState {
  tournaments: Tournament[];
  firebaseUid: string | null;  // UID přihlášeného uživatele (nastaví App po přihlášení)

  // Inicializace po přihlášení
  setFirebaseUid: (uid: string | null) => void;
  loadFromFirebase: (uid: string) => Promise<void>;

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

  // Firebase sync helpers (internal)
  markSynced: (tournamentId: string) => void;
}

// ─── Helper: sync turnaje do Firebase po každé změně ─────────────────────────

async function syncToFirebase(uid: string | null, tournament: Tournament): Promise<void> {
  if (!uid) return;
  try {
    await saveTournamentToFirebase(uid, tournament);
  } catch (err) {
    console.error('[Firebase] Sync failed:', err);
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTournamentStore = create<TournamentState>()(
  persist(
    (set, get) => ({
      tournaments: [],
      firebaseUid: null,

      // ── Inicializace ──────────────────────────────────────────────────────

      setFirebaseUid: (uid) => {
        set({ firebaseUid: uid });
      },

      loadFromFirebase: async (uid) => {
        try {
          const tournaments = await loadTournamentsFromFirebase(uid);
          if (tournaments.length > 0) {
            set({ tournaments, firebaseUid: uid });
          } else {
            set({ firebaseUid: uid });
          }
        } catch (err) {
          console.error('[Firebase] Load failed:', err);
          set({ firebaseUid: uid });
        }
      },

      // ── CRUD ──────────────────────────────────────────────────────────────

      createTournament: async (input) => {
        const now = new Date().toISOString();

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

        const matches = generateRoundRobinSchedule(teams, input.settings);

        const tournament: Tournament = {
          id: generateId(),
          name: input.name,
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
        }));

        await syncToFirebase(get().firebaseUid, tournament);
        return tournament;
      },

      updateTournament: async (id, updates) => {
        set(state => ({
          tournaments: state.tournaments.map(t =>
            t.id === id
              ? { ...t, ...updates, updatedAt: new Date().toISOString() }
              : t
          ),
        }));
        const updated = get().getTournamentById(id);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
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
        return get().tournaments.find(t => t.id === id);
      },

      // ── Zápasy ────────────────────────────────────────────────────────────

      startMatch: async (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              status: 'active' as const,
              updatedAt: new Date().toISOString(),
              matches: t.matches.map((m): Match => {
                if (m.id !== matchId) return m;
                return { ...m, status: 'live', startedAt: new Date().toISOString() };
              }),
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      finishMatch: async (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
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
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      addGoal: async (tournamentId, matchId, goalData) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
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
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      removeLastGoal: async (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
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
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      removeGoal: async (tournamentId, matchId, goalId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
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
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      updateGoalPlayer: async (tournamentId, matchId, goalId, playerId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              updatedAt: new Date().toISOString(),
              matches: t.matches.map((m): Match => {
                if (m.id !== matchId) return m;
                return {
                  ...m,
                  goals: m.goals.map(g => g.id !== goalId ? g : { ...g, playerId }),
                };
              }),
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      reopenMatch: async (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              updatedAt: new Date().toISOString(),
              matches: t.matches.map((m): Match => {
                if (m.id !== matchId) return m;
                return { ...m, status: 'live', startedAt: new Date().toISOString(), pausedAt: null, pausedElapsed: 0 };
              }),
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      resetMatch: async (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
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
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      pauseMatch: async (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              updatedAt: new Date().toISOString(),
              matches: t.matches.map((m): Match => {
                if (m.id !== matchId || m.status !== 'live' || m.pausedAt) return m;
                const elapsed = m.startedAt
                  ? Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 1000) + (m.pausedElapsed ?? 0)
                  : (m.pausedElapsed ?? 0);
                return { ...m, pausedAt: new Date().toISOString(), pausedElapsed: elapsed };
              }),
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      resumeMatch: async (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              updatedAt: new Date().toISOString(),
              matches: t.matches.map((m): Match => {
                if (m.id !== matchId || m.status !== 'live' || !m.pausedAt) return m;
                return { ...m, startedAt: new Date().toISOString(), pausedAt: null };
              }),
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      // ── Hráči ─────────────────────────────────────────────────────────────

      addPlayer: async (tournamentId, teamId, playerData) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
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
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      removePlayer: async (tournamentId, teamId, playerId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              updatedAt: new Date().toISOString(),
              teams: t.teams.map(team => {
                if (team.id !== teamId) return team;
                return { ...team, players: team.players.filter(p => p.id !== playerId) };
              }),
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      updatePlayer: async (tournamentId, teamId, playerId, updates) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
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
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
      },

      // ── Týmy ──────────────────────────────────────────────────────────────

      updateTeamName: async (tournamentId, teamId, name) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              updatedAt: new Date().toISOString(),
              teams: t.teams.map(team =>
                team.id !== teamId ? team : { ...team, name }
              ),
            };
          }),
        }));
        const updated = get().getTournamentById(tournamentId);
        if (updated) await syncToFirebase(get().firebaseUid, updated);
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
    }
  )
);
