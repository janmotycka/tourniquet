/**
 * Firebase Realtime Database — Tournament service
 *
 * Struktura DB:
 *   /tournaments/{uid}/{tournamentId}  → plná data (jen pro přihlášeného admina)
 *   /public/{tournamentId}             → read-only mirror (pro diváky přes QR)
 */

import { ref, set, get, remove, onValue, off, DataSnapshot } from 'firebase/database';
import { db } from '../firebase';
import type { Tournament } from '../types/tournament.types';
import { logger } from '../utils/logger';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const tournamentRef = (uid: string, id: string) =>
  ref(db, `tournaments/${uid}/${id}`);

const publicRef = (id: string) =>
  ref(db, `public/${id}`);

const userTournamentsRef = (uid: string) =>
  ref(db, `tournaments/${uid}`);

// ─── Serializace ─────────────────────────────────────────────────────────────

function toFirebase(t: Tournament): object {
  // JSON.parse(JSON.stringify()) odstraní undefined hodnoty
  return JSON.parse(JSON.stringify(t));
}

/** Verze pro public mirror — odstraní citlivé osobní údaje (GDPR) */
function toPublicFirebase(t: Tournament): object {
  const sanitized = {
    ...t,
    teams: t.teams.map(team => ({
      ...team,
      players: team.players.map(p => ({
        id: p.id,
        name: p.name,
        jerseyNumber: p.jerseyNumber,
        // birthYear záměrně VYNECHÁN — GDPR (osobní údaje nezletilých)
      })),
    })),
  };
  return JSON.parse(JSON.stringify(sanitized));
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
  };

  return { ...raw, teams, matches, settings } as Tournament;
}

// ─── Zápis ────────────────────────────────────────────────────────────────────

/** Uloží/přepíše turnaj v DB (admin cesta + public mirror) */
export async function saveTournamentToFirebase(uid: string, tournament: Tournament): Promise<void> {
  const data = toFirebase(tournament);
  const publicData = toPublicFirebase(tournament);
  await Promise.all([
    set(tournamentRef(uid, tournament.id), data),
    set(publicRef(tournament.id), publicData),
  ]);
}

/** Zapíše turnaj POUZE do public mirror (pro non-owner kolaboranty) */
export async function savePublicTournament(tournament: Tournament): Promise<void> {
  const publicData = toPublicFirebase(tournament);
  await set(publicRef(tournament.id), publicData);
}

/** Smaže turnaj z DB */
export async function deleteTournamentFromFirebase(uid: string, tournamentId: string): Promise<void> {
  await Promise.all([
    remove(tournamentRef(uid, tournamentId)),
    remove(publicRef(tournamentId)),
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
