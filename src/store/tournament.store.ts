import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import type { Tournament, Match, Goal, CreateTournamentInput, TournamentSettings, RosterSubmission } from '../types/tournament.types';
import { generateRoundRobinSchedule, generateGroupsKnockoutSchedule, generatePureKnockoutSchedule, advanceTeamsFromGroups, generateId, computeMatchStartTime, parseStartDateTime, recalculateMatchTimes } from '../utils/tournament-schedule';
import { TEAM_COLORS } from '../utils/team-colors';
import { logger } from '../utils/logger';
import { sanitizeTournamentInput, clampNumber, LIMITS } from '../utils/validation';
import {
  saveTournamentToFirebase,
  savePublicTournament,
  deleteTournamentFromFirebase,
  loadTournamentsFromFirebase,
  loadPublicTournament,
  subscribeToPublicTournament,
} from '../services/tournament.firebase';
import { saveCatalogEntry } from '../services/catalog.firebase';
import {
  addJoinedTournament,
  removeJoinedTournament,
  loadJoinedTournaments,
} from '../services/user.firebase';
import { joinTournamentByPin as joinTournamentByPinCF } from '../services/tournament-functions';
import { useToastStore } from './toast.store';
import { auth } from '../firebase';

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
  joinTournament: (tournamentId: string, pin: string, role?: 'admin') => Promise<{ success: boolean; error?: string }>;
  leaveTournament: (tournamentId: string) => Promise<void>;

  // Helper: najde turnaj v obou polích
  findTournament: (id: string) => Tournament | undefined;
  isOwner: (tournamentId: string) => boolean;
  /** Vrátí true pokud je uživatel owner NEBO co-owner (admin v joinedUsers) */
  hasAdminAccess: (tournamentId: string) => boolean;

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
  toggleTeamPaid: (tournamentId: string, teamId: string) => Promise<void>;

  // Správa týmů & zápasů
  removeTeam: (tournamentId: string, teamId: string) => Promise<void>;
  cancelMatch: (tournamentId: string, matchId: string) => Promise<void>;
  reorderMatches: (tournamentId: string, reorderedScheduledIds: string[]) => Promise<void>;

  // Soupisky
  generateRosterTokens: (tournamentId: string) => Promise<void>;
  acceptRoster: (tournamentId: string, teamId: string, submission: RosterSubmission) => Promise<void>;

  // Ruční přidání týmu (domácí tým / bez registrace)
  addManualTeam: (tournamentId: string, team: { name: string; color: string; players: import('../types/tournament.types').Player[]; clubId?: string | null; logoBase64?: string | null }) => Promise<void>;

  // Registrace týmů
  approveRegistration: (tournamentId: string, registrationId: string, registration: import('../types/tournament.types').RegistrationSubmission) => Promise<void>;
  rejectRegistration: (tournamentId: string, registrationId: string) => Promise<void>;

  // Přegenerování harmonogramu
  regenerateSchedule: (tournamentId: string, newSettings: TournamentSettings) => Promise<void>;

  /** Vygeneruje rozpis pro turnaj bez zápasů (registrační flow) */
  generateInitialSchedule: (tournamentId: string) => Promise<void>;

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

/** Serialized write queue per tournament — prevents concurrent writes
 *  from overwriting each other with stale data. */
const syncQueues = new Map<string, Promise<void>>();

/** Re-fetch tournament from state and sync to Firebase. Call after local mutations.
 *  Writes are serialized per tournament — each write waits for the previous one
 *  and always reads the LATEST state before writing. */
async function syncById(
  get: () => TournamentState,
  set: (partial: Partial<TournamentState>) => void,
  tournamentId: string,
) {
  const prevQueue = syncQueues.get(tournamentId) ?? Promise.resolve();
  const currentSync = prevQueue.then(async () => {
    // Always read the LATEST state right before writing
    const updated = get().getTournamentById(tournamentId);
    if (updated) {
      const err = await syncToFirebase(get().firebaseUid, updated);
      if (err) {
        set({ syncError: err });
        useToastStore.getState().show('error', 'Synchronizace selhala — změny se uloží lokálně.', 5000);
      }
    }
  });
  syncQueues.set(tournamentId, currentSync.catch(() => { /* prevent queue stall */ }));
  await currentSync;
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

          // Zajisti, že auth token je připravený pro DB operace
          if (auth.currentUser) {
            try {
              await auth.currentUser.getIdToken(true);
              logger.debug('[Firebase] Auth token refreshed');
            } catch (tokenErr) {
              logger.warn('[Firebase] Token refresh failed:', tokenErr);
            }
          }

          // 1) Načti vlastní turnaje s retry logikou (3 pokusy)
          let tournaments: Tournament[] = [];
          let ownLoadFailed = false;
          let ownLoadError = '';
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              tournaments = await loadTournamentsFromFirebase(uid);
              logger.debug('[Firebase] Loaded', tournaments.length, 'own tournaments (attempt', attempt + ')');
              ownLoadError = '';
              break;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              ownLoadError = msg;
              logger.error('[Firebase] Failed to load own tournaments (attempt', attempt + '):', msg);
              if (attempt === 3) {
                ownLoadFailed = true;
                useToastStore.getState().show('error', `Nepodařilo se načíst turnaje: ${msg.slice(0, 120)}`, 8000);
              } else {
                // Před retry počkej — auth token se možná ještě nastavuje
                await new Promise(r => setTimeout(r, attempt * 1000));
              }
            }
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
            // Pokud load selhal, zachovej cache; pokud uspěl (i s 0), nastav správně
            tournaments: ownLoadFailed ? get().tournaments : tournaments,
            joinedTournaments,
            firebaseUid: uid,
            syncError: ownLoadFailed ? `Nepodařilo se načíst turnaje: ${ownLoadError}` : null,
          });

          // Migrace: zapsat všechny turnaje do katalogu (idempotentní, fire-and-forget)
          if (!ownLoadFailed && tournaments.length > 0) {
            Promise.all(tournaments.map(t => saveCatalogEntry(t).catch(() => {/* ignore */})))
              .then(() => logger.debug('[Catalog] Migrated', tournaments.length, 'tournaments'))
              .catch(() => {/* ignore */});
          }

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
                logger.debug('[Firebase] Owner received remote update for:', t.id);
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
          logger.error('[Firebase] Load failed:', msg, err);
          set({ firebaseUid: uid, syncError: `Načtení z Firebase selhalo: ${msg}` });
          useToastStore.getState().show('error', `Načtení turnajů selhalo: ${msg.slice(0, 100)}`, 6000);
        }
      },

      // ── Sdílený přístup ─────────────────────────────────────────────────

      joinTournament: async (tournamentId, pin, role?) => {
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
        let tournament: Tournament | null;
        try {
          tournament = await loadPublicTournament(tournamentId);
        } catch (err) {
          logger.error('[Firebase] loadPublicTournament failed:', err);
          return { success: false, error: 'Nepodařilo se načíst turnaj — zkontrolujte připojení.' };
        }
        if (!tournament) return { success: false, error: 'Turnaj nenalezen.' };

        // Server-side PIN ověření přes Cloud Function.
        // CF verifikuje PIN (admin SDK čte /pin-auth) a zapíše joinedUsers/{uid} do
        // public mirror. Client už NEMÁ read přístup k /pin-auth ani write na joinedUsers.
        try {
          await joinTournamentByPinCF({ tournamentId, pin, role });
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code ?? '';
          logger.error('[CF] joinTournamentByPin failed:', code, err);
          if (code === 'functions/permission-denied') {
            return { success: false, error: 'Nesprávný PIN.' };
          }
          if (code === 'functions/not-found') {
            return { success: false, error: 'Turnaj nenalezen.' };
          }
          if (code === 'functions/failed-precondition') {
            return { success: false, error: 'Turnaj nemá nastavený PIN.' };
          }
          return { success: false, error: 'Nepodařilo se ověřit PIN — zkuste to znovu.' };
        }

        // Přidej do joinnutých (optimistic)
        set(state => ({
          joinedTournaments: [tournament!, ...state.joinedTournaments],
        }));

        // Ulož referenci do Firebase (vlastní uživatel → /users/{uid}/joinedTournaments)
        try {
          await addJoinedTournament(uid, tournamentId, tournament.ownerUid ?? '', tournament.name);
        } catch (err) {
          logger.error('[Firebase] addJoinedTournament failed:', err);
          // Rollback optimistic update
          set(state => ({
            joinedTournaments: state.joinedTournaments.filter(jt => jt.id !== tournamentId),
          }));
          return { success: false, error: 'Nepodařilo se uložit připojení — zkuste to znovu.' };
        }

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

        // Snapshot for rollback
        const previousJoined = get().joinedTournaments;

        set(state => ({
          joinedTournaments: state.joinedTournaments.filter(t => t.id !== tournamentId),
        }));

        if (uid) {
          try {
            await removeJoinedTournament(uid, tournamentId);
          } catch (err) {
            logger.error('[Firebase] removeJoinedTournament failed:', err);
            // Rollback — restore the removed tournament
            set({ joinedTournaments: previousJoined });
            useToastStore.getState().show('error', 'Nepodařilo se opustit turnaj — zkuste to znovu.', 5000);
          }
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

      hasAdminAccess: (tournamentId) => {
        // Owner = vždy admin
        if (get().tournaments.some(t => t.id === tournamentId)) return true;
        // Co-owner = admin v joinedUsers
        const uid = get().firebaseUid;
        if (!uid) return false;
        const joined = get().joinedTournaments.find(t => t.id === tournamentId);
        return joined?.joinedUsers?.[uid] === 'admin';
      },

      // ── CRUD ──────────────────────────────────────────────────────────────

      createTournament: async (rawInput) => {
        // Sanitizovat vstup — ořízne stringy a čísla na bezpečné rozsahy
        let input = sanitizeTournamentInput(rawInput);

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
        const tournamentFormat = input.settings.format ?? 'round-robin';

        // 0 týmů = registrační turnaj, rozpis se vygeneruje později
        if (teams.length < 2) {
          matches = [];
        } else if (tournamentFormat === 'groups-knockout' && input.settings.groups) {
          // Skupiny + knockout: vyplň skupiny reálnými teamIds
          const settingsWithRealGroups = {
            ...input.settings,
            groups: input.settings.groups.map(g => ({
              ...g,
              teamIds: g.teamIds.map((placeholder) => {
                // Placeholder formát: 'team-placeholder-N' kde N je index v poli teams
                const match = placeholder.match(/^team-placeholder-(\d+)$/);
                if (match) return teams[parseInt(match[1])]?.id ?? placeholder;
                return placeholder;
              }),
            })),
          };
          matches = generateGroupsKnockoutSchedule(teams, settingsWithRealGroups);
          // Aktualizuj settings s reálnými groupIds
          input = { ...input, settings: settingsWithRealGroups };
        } else if (tournamentFormat === 'knockout') {
          matches = generatePureKnockoutSchedule(teams, input.settings);
        } else if (input.matchOrder && input.matchOrder.length > 0) {
          // Vlastní pořadí z wizardu — vytvořit zápasy dle zadaného pořadí
          const startDateTime = parseStartDateTime(input.settings);
          const numberOfPitches = clampNumber(input.settings.numberOfPitches ?? 1, LIMITS.numberOfPitches.min, LIMITS.numberOfPitches.max);

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
          pinSalt: input.pinSalt,
          firebaseSynced: false,
          lastSyncedAt: null,
        };

        set(state => ({
          tournaments: [tournament, ...state.tournaments],
          syncError: null,
        }));

        await syncById(get, set, tournament.id);

        // Subscribe na public path pro příjem změn od připojených rozhodčích
        subscribeToOwnedPublic(tournament.id, (publicData) => {
          if (!publicData) return;
          const local = get().tournaments.find(lt => lt.id === tournament.id);
          if (!local) return;
          if (new Date(publicData.updatedAt) > new Date(local.updatedAt)) {
            logger.debug('[Firebase] Owner received remote update for:', tournament.id);
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
        await syncById(get, set, id);
      },

      deleteTournament: async (id) => {
        const uid = get().firebaseUid;
        // Snapshot for rollback
        const previousTournaments = get().tournaments;
        set(state => ({
          tournaments: state.tournaments.filter(t => t.id !== id),
        }));
        if (uid) {
          try {
            await deleteTournamentFromFirebase(uid, id);
          } catch (err) {
            logger.error('[Firebase] Delete failed:', err);
            // Rollback — restore deleted tournament
            set({ tournaments: previousTournaments });
            useToastStore.getState().show('error', 'Nepodařilo se smazat turnaj ze serveru.', 5000);
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
        await syncById(get, set, tournamentId);
      },

      finishMatch: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => {
          let updatedMatches = t.matches.map((m): Match => {
            if (m.id !== matchId) return m;
            return { ...m, status: 'finished', finishedAt: new Date().toISOString() };
          });

          const format = t.settings.format ?? 'round-robin';
          const finishedMatch = updatedMatches.find(m => m.id === matchId);

          // ── Knockout advancement: vítěz postupuje do nextMatchId ──
          // Při remíze nepostupuje nikdo — admin musí rozhodnout (přidat gól / penalty)
          if (finishedMatch?.nextMatchId && finishedMatch.status === 'finished'
              && finishedMatch.homeScore !== finishedMatch.awayScore) {
            const winnerId = finishedMatch.homeScore > finishedMatch.awayScore
              ? finishedMatch.homeTeamId
              : finishedMatch.awayTeamId;
            const loserId = finishedMatch.homeScore > finishedMatch.awayScore
              ? finishedMatch.awayTeamId
              : finishedMatch.homeTeamId;

            updatedMatches = updatedMatches.map(m => {
              if (m.id !== finishedMatch.nextMatchId) return m;
              // Nasadit vítěze na volnou pozici (home nebo away)
              if (!m.homeTeamId) return { ...m, homeTeamId: winnerId };
              if (!m.awayTeamId) return { ...m, awayTeamId: winnerId };
              return m;
            });

            // Nasadit poraženého do zápasu o 3. místo (pokud existuje)
            if (finishedMatch.stage === 'semifinal') {
              const thirdPlaceMatch = updatedMatches.find(m => m.stage === 'third-place');
              if (thirdPlaceMatch) {
                updatedMatches = updatedMatches.map(m => {
                  if (m.id !== thirdPlaceMatch.id) return m;
                  if (!m.homeTeamId) return { ...m, homeTeamId: loserId };
                  if (!m.awayTeamId) return { ...m, awayTeamId: loserId };
                  return m;
                });
              }
            }
          }

          // ── Groups-knockout: po dokončení skupinové fáze nasadit do bracketu ──
          if (format === 'groups-knockout' && finishedMatch?.stage === 'group') {
            const allGroupMatchesFinished = updatedMatches
              .filter(m => m.stage === 'group')
              .every(m => m.status === 'finished');

            if (allGroupMatchesFinished) {
              updatedMatches = advanceTeamsFromGroups(updatedMatches, t.teams, t.settings);
            }
          }

          const allFinished = updatedMatches.every(m => m.status === 'finished');
          return {
            ...t,
            status: allFinished ? 'finished' : 'active',
            updatedAt: new Date().toISOString(),
            matches: updatedMatches,
          };
        }));
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
      },

      reopenMatch: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches: t.matches.map((m): Match => {
            if (m.id !== matchId) return m;
            // Zachovat dosavadní elapsed čas — timer pokračuje, ne restartuje
            const priorElapsed = m.finishedAt && m.startedAt
              ? Math.floor((new Date(m.finishedAt).getTime() - new Date(m.startedAt).getTime()) / 1000) - (m.pausedElapsed ?? 0)
              : (m.pausedElapsed ?? 0);
            return { ...m, status: 'live', startedAt: new Date().toISOString(), pausedAt: null, pausedElapsed: priorElapsed };
          }),
        })));
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
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
        await syncById(get, set, tournamentId);
      },

      toggleTeamPaid: async (tournamentId, teamId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          teams: t.teams.map(team =>
            team.id !== teamId ? team : {
              ...team,
              paidAt: team.paidAt ? null : new Date().toISOString(),
            }
          ),
        })));
        await syncById(get, set, tournamentId);
      },

      // ── Přegenerování harmonogramu ────────────────────────────────────────

      removeTeam: async (tournamentId, teamId) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament) return;

        // Odebrat tým, jeho zápasy a osiřelé penaltyResults; přepočítat časy zbylých
        set(state => mutateBothArrays(state, tournamentId, t => {
          const remainingTeams = t.teams.filter(tm => tm.id !== teamId);
          const remainingMatches = t.matches.filter(
            m => m.homeTeamId !== teamId && m.awayTeamId !== teamId,
          );
          const cleanPenalties = (t.settings.penaltyResults ?? []).filter(
            pr => pr.teamAId !== teamId && pr.teamBId !== teamId,
          );
          return {
            ...t,
            teams: remainingTeams,
            matches: recalculateMatchTimes(remainingMatches, t.settings),
            settings: { ...t.settings, penaltyResults: cleanPenalties },
            updatedAt: new Date().toISOString(),
          };
        }));
        await syncById(get, set, tournamentId);
      },

      cancelMatch: async (tournamentId, matchId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches: recalculateMatchTimes(
            t.matches.map(m =>
              m.id === matchId ? { ...m, status: 'cancelled' as const } : m,
            ).filter(m => m.status !== 'cancelled'),
            t.settings,
          ),
        })));
        await syncById(get, set, tournamentId);
      },

      reorderMatches: async (tournamentId, reorderedScheduledIds) => {
        set(state => mutateBothArrays(state, tournamentId, t => {
          const kept = t.matches.filter(m => m.status === 'finished' || m.status === 'live');
          // Seřadit scheduled zápasy dle nového pořadí ID
          const scheduledMap = new Map(
            t.matches.filter(m => m.status === 'scheduled').map(m => [m.id, m]),
          );
          const reordered = reorderedScheduledIds
            .map(id => scheduledMap.get(id))
            .filter(Boolean) as Match[];
          return {
            ...t,
            updatedAt: new Date().toISOString(),
            matches: recalculateMatchTimes([...kept, ...reordered], t.settings),
          };
        }));
        await syncById(get, set, tournamentId);
      },

      generateRosterTokens: async (tournamentId) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          teams: t.teams.map(team =>
            team.rosterToken ? team : { ...team, rosterToken: generateId() },
          ),
        })));
        await syncById(get, set, tournamentId);
      },

      acceptRoster: async (tournamentId, teamId, submission) => {
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          teams: t.teams.map(team => {
            if (team.id !== teamId) return team;
            return {
              ...team,
              coach: submission.coach,
              players: submission.players.map((p) => ({
                id: generateId(),
                name: p.name,
                jerseyNumber: p.jerseyNumber,
                birthYear: p.birthYear ?? null,
              })),
              rosterSubmittedAt: submission.submittedAt,
            };
          }),
        })));
        await syncById(get, set, tournamentId);
      },

      addManualTeam: async (tournamentId, team) => {
        const rosterToken = generateId();
        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          teams: [...t.teams, {
            id: generateId(),
            name: team.name,
            color: team.color,
            players: team.players,
            clubId: team.clubId ?? null,
            logoBase64: team.logoBase64 ?? null,
            rosterToken,
          }],
        })));
        await syncById(get, set, tournamentId);
      },

      approveRegistration: async (tournamentId, registrationId, registration) => {
        const tournament = get().getTournamentById(tournamentId);
        const usedColors = (tournament?.teams ?? []).map(t => t.color);
        const availableColor = TEAM_COLORS.find(c => !usedColors.includes(c)) ?? '#9E9E9E';
        const rosterToken = generateId();

        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          teams: [...t.teams, {
            id: generateId(),
            name: registration.teamName,
            color: availableColor,
            players: [],
            rosterToken,
            coach: {
              name: registration.coachName,
              phone: registration.coachPhone,
              email: registration.coachEmail,
            },
          }],
        })));
        await syncById(get, set, tournamentId);

        // Remove registration record from Firebase
        try {
          const { deleteRegistration } = await import('../services/registration.firebase');
          await deleteRegistration(tournamentId, registrationId);
        } catch (err) {
          logger.error('[Firebase] deleteRegistration failed (approve):', err);
          useToastStore.getState().show('warning', 'Tým byl přidán, ale registrace se nepodařila smazat.', 5000);
        }
      },

      rejectRegistration: async (tournamentId, registrationId) => {
        try {
          const { deleteRegistration } = await import('../services/registration.firebase');
          await deleteRegistration(tournamentId, registrationId);
        } catch (err) {
          logger.error('[Firebase] deleteRegistration failed (reject):', err);
          useToastStore.getState().show('error', 'Nepodařilo se smazat registraci — zkuste to znovu.', 5000);
        }
      },

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
        await syncById(get, set, tournamentId);
      },

      generateInitialSchedule: async (tournamentId) => {
        const tournament = get().getTournamentById(tournamentId);
        if (!tournament || tournament.teams.length < 2) return;
        if (tournament.matches.length > 0) return; // už má rozpis

        const matches = generateRoundRobinSchedule(tournament.teams, tournament.settings);

        set(state => mutateBothArrays(state, tournamentId, t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          matches,
        })));
        await syncById(get, set, tournamentId);
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
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        tournaments: state.tournaments,
        joinedTournaments: state.joinedTournaments,
        firebaseUid: state.firebaseUid,
        // syncError se NEPERSISTUJE — je jen runtime
      }),
    }
  )
);
