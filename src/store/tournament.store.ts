import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tournament, Match, Goal, CreateTournamentInput } from '../types/tournament.types';
import { generateRoundRobinSchedule, generateId } from '../utils/tournament-schedule';

// ─── State interface ──────────────────────────────────────────────────────────

interface TournamentState {
  tournaments: Tournament[];

  // CRUD
  createTournament: (input: CreateTournamentInput) => Tournament;
  updateTournament: (id: string, updates: Partial<Tournament>) => void;
  deleteTournament: (id: string) => void;
  getTournamentById: (id: string) => Tournament | undefined;

  // Zápasy
  startMatch: (tournamentId: string, matchId: string) => void;
  finishMatch: (tournamentId: string, matchId: string) => void;
  addGoal: (tournamentId: string, matchId: string, goal: Omit<Goal, 'id' | 'recordedAt'>) => void;
  removeLastGoal: (tournamentId: string, matchId: string) => void;
  removeGoal: (tournamentId: string, matchId: string, goalId: string) => void;
  updateGoalPlayer: (tournamentId: string, matchId: string, goalId: string, playerId: string | null) => void;
  reopenMatch: (tournamentId: string, matchId: string) => void;
  resetMatch: (tournamentId: string, matchId: string) => void;
  pauseMatch: (tournamentId: string, matchId: string) => void;
  resumeMatch: (tournamentId: string, matchId: string) => void;

  // Hráči
  addPlayer: (tournamentId: string, teamId: string, player: { name: string; jerseyNumber: number; birthYear: number | null }) => void;
  removePlayer: (tournamentId: string, teamId: string, playerId: string) => void;
  updatePlayer: (tournamentId: string, teamId: string, playerId: string, updates: { name?: string; jerseyNumber?: number; birthYear?: number | null }) => void;

  // Týmy
  updateTeamName: (tournamentId: string, teamId: string, name: string) => void;

  // Firebase sync helpers
  markSynced: (tournamentId: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTournamentStore = create<TournamentState>()(
  persist(
    (set, get) => ({
      tournaments: [],

      // ── CRUD ──────────────────────────────────────────────────────────────

      createTournament: (input) => {
        const now = new Date().toISOString();

        // Sestavit týmy s UUID
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

        // Vygenerovat round-robin harmonogram
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

        return tournament;
      },

      updateTournament: (id, updates) => {
        set(state => ({
          tournaments: state.tournaments.map(t =>
            t.id === id
              ? { ...t, ...updates, updatedAt: new Date().toISOString() }
              : t
          ),
        }));
      },

      deleteTournament: (id) => {
        set(state => ({
          tournaments: state.tournaments.filter(t => t.id !== id),
        }));
      },

      getTournamentById: (id) => {
        return get().tournaments.find(t => t.id === id);
      },

      // ── Zápasy ────────────────────────────────────────────────────────────

      startMatch: (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              status: 'active' as const,
              updatedAt: new Date().toISOString(),
              matches: t.matches.map((m): Match => {
                if (m.id !== matchId) return m;
                return {
                  ...m,
                  status: 'live',
                  startedAt: new Date().toISOString(),
                };
              }),
            };
          }),
        }));
      },

      finishMatch: (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;

            const updatedMatches = t.matches.map((m): Match => {
              if (m.id !== matchId) return m;
              return {
                ...m,
                status: 'finished',
                finishedAt: new Date().toISOString(),
              };
            });

            // Zkontrolujeme jestli jsou všechny zápasy dokončeny → status 'finished'
            const allFinished = updatedMatches.every(m => m.status === 'finished');

            return {
              ...t,
              status: allFinished ? 'finished' : 'active',
              updatedAt: new Date().toISOString(),
              matches: updatedMatches,
            };
          }),
        }));
      },

      addGoal: (tournamentId, matchId, goalData) => {
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

                // Vlastní gól → připsat soupeři
                const scoringTeamId = goal.isOwnGoal
                  ? (goal.teamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId)
                  : goal.teamId;

                const newHomeScore = m.homeScore + (scoringTeamId === m.homeTeamId ? 1 : 0);
                const newAwayScore = m.awayScore + (scoringTeamId === m.awayTeamId ? 1 : 0);

                return {
                  ...m,
                  homeScore: newHomeScore,
                  awayScore: newAwayScore,
                  goals: [...m.goals, goal],
                };
              }),
            };
          }),
        }));
      },

      removeLastGoal: (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              updatedAt: new Date().toISOString(),
              matches: t.matches.map((m): Match => {
                if (m.id !== matchId || m.goals.length === 0) return m;

                const lastGoal = m.goals[m.goals.length - 1];

                // Zjistit komu byl gól připsán (s ohledem na vlastní gól)
                const scoredForTeamId = lastGoal.isOwnGoal
                  ? (lastGoal.teamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId)
                  : lastGoal.teamId;

                const newHomeScore = Math.max(0, m.homeScore - (scoredForTeamId === m.homeTeamId ? 1 : 0));
                const newAwayScore = Math.max(0, m.awayScore - (scoredForTeamId === m.awayTeamId ? 1 : 0));

                return {
                  ...m,
                  homeScore: newHomeScore,
                  awayScore: newAwayScore,
                  goals: m.goals.slice(0, -1),
                };
              }),
            };
          }),
        }));
      },

      removeGoal: (tournamentId, matchId, goalId) => {
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
      },

      updateGoalPlayer: (tournamentId, matchId, goalId, playerId) => {
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
      },

      reopenMatch: (tournamentId, matchId) => {
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
      },

      resetMatch: (tournamentId, matchId) => {
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
            // Pokud byl turnaj finished, vrátíme ho na active
            const allFinished = updatedMatches.every(m => m.status === 'finished');
            return {
              ...t,
              status: allFinished ? 'finished' : 'active',
              updatedAt: new Date().toISOString(),
              matches: updatedMatches,
            };
          }),
        }));
      },

      pauseMatch: (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              updatedAt: new Date().toISOString(),
              matches: t.matches.map((m): Match => {
                if (m.id !== matchId || m.status !== 'live' || m.pausedAt) return m;
                // Uložíme kolik sekund uplynulo před pauzou
                const elapsed = m.startedAt
                  ? Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 1000) + (m.pausedElapsed ?? 0)
                  : (m.pausedElapsed ?? 0);
                return { ...m, pausedAt: new Date().toISOString(), pausedElapsed: elapsed };
              }),
            };
          }),
        }));
      },

      resumeMatch: (tournamentId, matchId) => {
        set(state => ({
          tournaments: state.tournaments.map(t => {
            if (t.id !== tournamentId) return t;
            return {
              ...t,
              updatedAt: new Date().toISOString(),
              matches: t.matches.map((m): Match => {
                if (m.id !== matchId || m.status !== 'live' || !m.pausedAt) return m;
                // Resetujeme startedAt na "teď", pausedElapsed zůstane pro akumulaci
                return { ...m, startedAt: new Date().toISOString(), pausedAt: null };
              }),
            };
          }),
        }));
      },

      // ── Hráči ─────────────────────────────────────────────────────────────

      addPlayer: (tournamentId, teamId, playerData) => {
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
      },

      removePlayer: (tournamentId, teamId, playerId) => {
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
      },

      updatePlayer: (tournamentId, teamId, playerId, updates) => {
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
      },

      // ── Týmy ──────────────────────────────────────────────────────────────

      updateTeamName: (tournamentId, teamId, name) => {
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
