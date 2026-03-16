/**
 * Firebase Realtime Database — Tournament service
 *
 * Struktura DB:
 *   /tournaments/{uid}/{tournamentId}  → plná data (jen pro přihlášeného admina)
 *   /public/{tournamentId}             → read-only mirror (pro diváky přes QR)
 *   /catalog/{tournamentId}            → odlehčený index pro veřejný katalog
 */

import { ref, set, get, remove, push, onValue, off, update, DataSnapshot, query, orderByChild, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import type { Tournament, ChatMessage } from '../types/tournament.types';
import { logger } from '../utils/logger';
import { safeClone } from '../utils/clone';
import { saveCatalogEntry, deleteCatalogEntry } from './catalog.firebase';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const tournamentRef = (uid: string, id: string) =>
  ref(db, `tournaments/${uid}/${id}`);

const publicRef = (id: string) =>
  ref(db, `public/${id}`);

const userTournamentsRef = (uid: string) =>
  ref(db, `tournaments/${uid}`);

// ─── Serializace ─────────────────────────────────────────────────────────────

function toFirebase(t: Tournament): object {
  // safeClone odstraní undefined hodnoty
  return safeClone(t);
}

/** Verze pro public mirror — odstraní citlivé osobní údaje (GDPR) */
function toPublicFirebase(t: Tournament): object {
  const sanitized = {
    ...t,
    teams: t.teams.map(team => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { rosterToken: _strip, ...teamWithoutToken } = team;
      return {
        ...teamWithoutToken,
        players: team.players.map(p => ({
          id: p.id,
          name: p.name,
          jerseyNumber: p.jerseyNumber,
          // birthYear záměrně VYNECHÁN — GDPR (osobní údaje nezletilých)
        })),
        // coach: stripnout email (GDPR), ponechat jméno pro public view
        coach: team.coach ? { name: team.coach.name, phone: '', email: '' } : null,
      };
    }),
  };
  return safeClone(sanitized);
}

/**
 * Normalizuje data z Firebase — RTDB smaže prázdná pole ([]),
 * takže musíme zajistit, že všechna pole budou vždy array.
 */
function normalizeArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && val !== null) return Object.values(val);
  return [];
}

// Interní typy pro raw Firebase data (před normalizací)
interface RawTeam extends Record<string, unknown> {
  players?: unknown;
}

interface RawMatch extends Record<string, unknown> {
  goals?: unknown;
  homeScore?: number;
  awayScore?: number;
  status?: string;
  pausedAt?: string | null;
  pausedElapsed?: number;
  pitchNumber?: number;
}

function fromFirebase(data: unknown): Tournament {
  const raw = data as Record<string, unknown>;

  // Normalizuj teams → vždy array, každý tým má players: array
  const teams = normalizeArray(raw.teams).map((t: unknown) => {
    const team = t as RawTeam;
    return { ...team, players: normalizeArray(team?.players) };
  });

  // Normalizuj matches → vždy array, každý match má goals: array a defaulty pro chybějící fieldy
  const matches = normalizeArray(raw.matches).map((m: unknown) => {
    const match = m as RawMatch;
    return {
      ...match,
      goals: normalizeArray(match?.goals),
      homeScore: match?.homeScore ?? 0,
      awayScore: match?.awayScore ?? 0,
      status: match?.status ?? 'scheduled',
      pausedAt: match?.pausedAt ?? null,
      pausedElapsed: match?.pausedElapsed ?? 0,
      pitchNumber: match?.pitchNumber ?? 1,
    };
  });

  // Normalizuj settings — zajisti že klíčové fieldy existují
  const rawSettings = (typeof raw.settings === 'object' && raw.settings !== null)
    ? raw.settings as Record<string, unknown>
    : {} as Record<string, unknown>;
  const settings = {
    ...rawSettings,
    matchDurationMinutes: rawSettings.matchDurationMinutes ?? 10,
    breakBetweenMatchesMinutes: rawSettings.breakBetweenMatchesMinutes ?? 2,
    startDate: rawSettings.startDate ?? new Date().toISOString().split('T')[0],
    startTime: rawSettings.startTime ?? '09:00',
    numberOfPitches: rawSettings.numberOfPitches ?? 1,
    // Normalizuj pole v settings (RTDB je vrací jako objekty s numerickými klíči)
    ...(rawSettings.awards ? { awards: normalizeArray(rawSettings.awards) } : {}),
    ...(rawSettings.groups ? { groups: normalizeArray(rawSettings.groups).map((g: unknown) => {
      const group = g as Record<string, unknown>;
      return { ...group, teamIds: normalizeArray(group?.teamIds) };
    }) } : {}),
    ...(rawSettings.penaltyResults ? { penaltyResults: normalizeArray(rawSettings.penaltyResults) } : {}),
    ...(rawSettings.tiebreakerOrder ? { tiebreakerOrder: normalizeArray(rawSettings.tiebreakerOrder) } : {}),
  };

  return { ...raw, teams, matches, settings } as Tournament;
}

// ─── Zápis ────────────────────────────────────────────────────────────────────

/** Uloží/přepíše turnaj v DB (admin cesta + public mirror + katalog) */
export async function saveTournamentToFirebase(uid: string, tournament: Tournament): Promise<void> {
  const data = toFirebase(tournament);
  const publicData = toPublicFirebase(tournament);
  await Promise.all([
    set(tournamentRef(uid, tournament.id), data),
    // update() místo set() — zachová joinedUsers zapsané připojenými rozhodčími
    update(publicRef(tournament.id), publicData as Record<string, unknown>),
    // Katalogový index pro veřejný přehled turnajů
    saveCatalogEntry(tournament),
  ]);
}

/** Zapíše turnaj POUZE do public mirror (pro non-owner kolaboranty) */
export async function savePublicTournament(tournament: Tournament): Promise<void> {
  const publicData = toPublicFirebase(tournament);
  // update() místo set() — zachová joinedUsers zapsané připojenými rozhodčími
  await update(publicRef(tournament.id), publicData as Record<string, unknown>);
}

/** Zapíše joinedUsers/{uid}: true do public mirror (pro Firebase security rules) */
export async function writeJoinedUser(tournamentId: string, uid: string): Promise<void> {
  const joinedUserRef = ref(db, `public/${tournamentId}/joinedUsers/${uid}`);
  await set(joinedUserRef, true);
}

/** Smaže turnaj z DB (včetně katalogu) */
export async function deleteTournamentFromFirebase(uid: string, tournamentId: string): Promise<void> {
  await Promise.all([
    remove(tournamentRef(uid, tournamentId)),
    remove(publicRef(tournamentId)),
    deleteCatalogEntry(tournamentId),
  ]);
}

// ─── Čtení ────────────────────────────────────────────────────────────────────

/** Načte všechny turnaje uživatele jednorázově */
export async function loadTournamentsFromFirebase(uid: string): Promise<Tournament[]> {
  const snapshot = await get(userTournamentsRef(uid));
  if (!snapshot.exists()) return [];
  const data = snapshot.val() as Record<string, unknown>;
  return Object.values(data).map(fromFirebase);
}

/** Načte jeden turnaj z public mirror (pro diváky, bez auth) */
export async function loadPublicTournament(tournamentId: string): Promise<Tournament | null> {
  const snapshot = await get(publicRef(tournamentId));
  if (!snapshot.exists()) return null;
  return fromFirebase(snapshot.val());
}

// ─── Real-time listener ───────────────────────────────────────────────────────

/** Poslouchá změny public turnaje živě (pro diváky) */
export function subscribeToPublicTournament(
  tournamentId: string,
  callback: (tournament: Tournament | null) => void,
  onError?: (error: Error) => void
): () => void {
  const r = publicRef(tournamentId);

  const handler = (snapshot: DataSnapshot) => {
    try {
      callback(snapshot.exists() ? fromFirebase(snapshot.val()) : null);
    } catch (err) {
      logger.error('[Firebase] fromFirebase() crashed:', err);
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const errorHandler = (error: Error) => {
    logger.error('[Firebase] onValue error:', error.message);
    onError?.(error);
  };

  onValue(r, handler, errorHandler);
  return () => off(r, 'value', handler);
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

const chatRef = (tournamentId: string) =>
  ref(db, `chat/${tournamentId}`);

/** Odešle zprávu do chatu turnaje (samostatná Firebase cesta, nesouvisí s tournament sync) */
export async function sendChatMessage(
  tournamentId: string,
  authorName: string,
  text: string,
): Promise<void> {
  const msgRef = push(chatRef(tournamentId));
  await set(msgRef, {
    authorName,
    text: text.slice(0, 500), // limit délky zprávy
    createdAt: new Date().toISOString(),
  });
}

/** Odešle systémovou uvítací zprávu do chatu (pokud je chat prázdný) */
export async function sendWelcomeChatMessage(
  tournamentId: string,
  tournamentName: string,
  welcomeText: string,
): Promise<void> {
  // Zkontrolujeme, jestli chat už má zprávy
  const snap = await get(query(chatRef(tournamentId), limitToLast(1)));
  if (snap.exists()) return; // chat už má zprávy, nepřidáváme welcome

  const msgRef = push(chatRef(tournamentId));
  await set(msgRef, {
    authorName: '🏆 TORQ',
    text: welcomeText.slice(0, 500),
    createdAt: new Date().toISOString(),
  });
}

/** Smaže chatovou zprávu (admin/owner) */
export async function deleteChatMessage(tournamentId: string, messageId: string): Promise<void> {
  await remove(ref(db, `chat/${tournamentId}/${messageId}`));
}

// ─── Fan Poll (hlasování) ─────────────────────────────────────────────────────

/** Odešle hlas do ankety — voterId je unikátní ID z localStorage */
export async function voteFanPoll(tournamentId: string, voterId: string, teamId: string): Promise<void> {
  await set(ref(db, `polls/${tournamentId}/${voterId}`), teamId);
}

/** Subscribuje na výsledky ankety — vrací mapu teamId → počet hlasů */
export function subscribeFanPoll(
  tournamentId: string,
  callback: (votes: Record<string, number>) => void,
): () => void {
  const pollRef = ref(db, `polls/${tournamentId}`);

  const handler = (snapshot: DataSnapshot) => {
    const counts: Record<string, number> = {};
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const teamId = child.val() as string;
        counts[teamId] = (counts[teamId] ?? 0) + 1;
      });
    }
    callback(counts);
  };

  onValue(pollRef, handler, () => callback({}));
  return () => off(pollRef, 'value', handler);
}

/** Smaže všechny hlasy fan ankety (admin reset) */
export async function resetFanPoll(tournamentId: string): Promise<void> {
  await set(ref(db, `polls/${tournamentId}`), null);
}

// ─── MVP hlasování ────────────────────────────────────────────────────────────

export interface MvpVote { teamId: string; playerId: string; playerName: string; }

/** Odešle MVP hlas */
export async function voteMvp(tournamentId: string, voterId: string, vote: MvpVote): Promise<void> {
  await set(ref(db, `mvp-votes/${tournamentId}/${voterId}`), vote);
}

/** Smaže všechny MVP hlasy (admin reset) */
export async function resetMvpVotes(tournamentId: string): Promise<void> {
  await remove(ref(db, `mvp-votes/${tournamentId}`));
}

/** Subscribuje na MVP hlasy — vrací pole hlasů */
export function subscribeMvpVotes(
  tournamentId: string,
  callback: (votes: MvpVote[]) => void,
): () => void {
  const mvpRef = ref(db, `mvp-votes/${tournamentId}`);
  const handler = (snapshot: DataSnapshot) => {
    const votes: MvpVote[] = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        if (val?.teamId && val?.playerId) {
          votes.push({ teamId: val.teamId, playerId: val.playerId, playerName: val.playerName ?? '' });
        }
      });
    }
    callback(votes);
  };
  onValue(mvpRef, handler, () => callback([]));
  return () => off(mvpRef, 'value', handler);
}

/** Subscribuje na posledních N zpráv v chatu turnaje */
export function subscribeToChatMessages(
  tournamentId: string,
  callback: (messages: ChatMessage[]) => void,
  maxMessages = 100,
): () => void {
  const q = query(chatRef(tournamentId), orderByChild('createdAt'), limitToLast(maxMessages));

  const handler = (snapshot: DataSnapshot) => {
    const messages: ChatMessage[] = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        messages.push({
          id: child.key!,
          authorName: val.authorName ?? '?',
          text: val.text ?? '',
          createdAt: val.createdAt ?? '',
        });
      });
    }
    callback(messages);
  };

  onValue(q, handler, () => {
    callback([]);
  });
  return () => off(q, 'value', handler);
}

// ─── Chat Polls (ankety admina v diskuzi) ──────────────────────────────────

export interface ChatPoll {
  id: string;
  question: string;
  options: string[];
  createdAt: string;
}

export interface ChatPollWithVotes extends ChatPoll {
  votes: Record<string, number>; // optionIndex → count
  totalVotes: number;
  myVote: string | null; // option text
}

/** Vytvoří novou anketu v chatu */
export async function createChatPoll(
  tournamentId: string,
  question: string,
  options: string[],
): Promise<void> {
  const pollRef = push(ref(db, `chat-polls/${tournamentId}`));
  await set(pollRef, {
    question: question.slice(0, 200),
    options: options.slice(0, 6).map(o => o.slice(0, 100)),
    createdAt: new Date().toISOString(),
  });
}

/** Smaže anketu */
export async function deleteChatPoll(tournamentId: string, pollId: string): Promise<void> {
  await Promise.all([
    remove(ref(db, `chat-polls/${tournamentId}/${pollId}`)),
    remove(ref(db, `chat-poll-votes/${tournamentId}/${pollId}`)),
  ]);
}

/** Hlasuje v anketě */
export async function voteChatPoll(
  tournamentId: string,
  pollId: string,
  voterId: string,
  optionText: string,
): Promise<void> {
  await set(ref(db, `chat-poll-votes/${tournamentId}/${pollId}/${voterId}`), optionText);
}

/** Subscribuje na všechny ankety + hlasy */
export function subscribeChatPolls(
  tournamentId: string,
  callback: (polls: ChatPoll[]) => void,
): () => void {
  const pollsRef = ref(db, `chat-polls/${tournamentId}`);
  const handler = (snapshot: DataSnapshot) => {
    const polls: ChatPoll[] = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        polls.push({
          id: child.key!,
          question: val.question ?? '',
          options: Array.isArray(val.options) ? val.options : Object.values(val.options ?? {}),
          createdAt: val.createdAt ?? '',
        });
      });
    }
    callback(polls);
  };
  onValue(pollsRef, handler, () => callback([]));
  return () => off(pollsRef, 'value', handler);
}

/** Subscribuje na hlasy jedné ankety */
export function subscribeChatPollVotes(
  tournamentId: string,
  pollId: string,
  callback: (votes: Record<string, string>) => void,
): () => void {
  const votesRef = ref(db, `chat-poll-votes/${tournamentId}/${pollId}`);
  const handler = (snapshot: DataSnapshot) => {
    const votes: Record<string, string> = {};
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        votes[child.key!] = child.val() as string;
      });
    }
    callback(votes);
  };
  onValue(votesRef, handler, () => callback({}));
  return () => off(votesRef, 'value', handler);
}
