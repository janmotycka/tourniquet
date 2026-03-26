/**
 * Firebase Realtime Database — Season match service
 *
 * Cesta: /matches/{ownerUid}/{matchId}        (privátní, owner-only)
 *        /public-matches/{matchId}             (veřejné, pro rodiče)
 */

import { ref, set, get, remove, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import type { SeasonMatch, PublicSeasonMatch } from '../types/match.types';
import { logger } from '../utils/logger';
import { safeClone } from '../utils/clone';

const matchesRef = (uid: string) => ref(db, `matches/${uid}`);
const matchRef = (uid: string, matchId: string) => ref(db, `matches/${uid}/${matchId}`);
const publicMatchRef = (matchId: string) => ref(db, `public-matches/${matchId}`);

// Firebase RTDB smaže prázdné pole [] → musíme normalizovat při čtení
function ensureArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && val !== null) return Object.values(val);
  return [];
}

function normalizeMatch(raw: Record<string, unknown>): SeasonMatch {
  return {
    ...raw,
    lineup: ensureArray(raw.lineup),
    goals: ensureArray(raw.goals),
    substitutions: ensureArray(raw.substitutions),
    cards: ensureArray(raw.cards),
    ratings: ensureArray(raw.ratings),
    homeScore: (raw.homeScore as number) ?? 0,
    awayScore: (raw.awayScore as number) ?? 0,
    pausedElapsed: (raw.pausedElapsed as number) ?? 0,
    status: (raw.status as SeasonMatch['status']) ?? 'planned',
    startedAt: (raw.startedAt as string) ?? null,
    pausedAt: (raw.pausedAt as string) ?? null,
    finishedAt: (raw.finishedAt as string) ?? null,
  } as SeasonMatch;
}

/** Převede SeasonMatch na PublicSeasonMatch (GDPR: bez ratings, note, clubId) */
function toPublicMatch(match: SeasonMatch, ownerUid: string): PublicSeasonMatch {
  return {
    id: match.id,
    ownerUid,
    opponent: match.opponent,
    isHome: match.isHome,
    date: match.date,
    kickoffTime: match.kickoffTime,
    competition: match.competition,
    durationMinutes: match.durationMinutes,
    status: match.status,
    startedAt: match.startedAt,
    pausedAt: match.pausedAt,
    pausedElapsed: match.pausedElapsed,
    finishedAt: match.finishedAt,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    lineup: match.lineup,
    goals: match.goals,
    substitutions: match.substitutions,
    cards: match.cards,
    ...(match.veoUrl ? { veoUrl: match.veoUrl } : {}),
    updatedAt: match.updatedAt,
  };
}

/** Uloží/aktualizuje zápas + volitelně public mirror */
export async function saveMatchToFirebase(uid: string, match: SeasonMatch): Promise<void> {
  // Strip undefined values (Firebase neakceptuje undefined)
  const clean = safeClone(match);
  const writes: Promise<void>[] = [set(matchRef(uid, match.id), clean)];
  if (match.isPublic) {
    const publicData = safeClone(toPublicMatch(match, uid));
    writes.push(set(publicMatchRef(match.id), publicData));
  }
  await Promise.all(writes);
}

/** Smaže zápas (i veřejný mirror pokud existuje) */
export async function deleteMatchFromFirebase(uid: string, matchId: string): Promise<void> {
  await Promise.all([
    remove(matchRef(uid, matchId)),
    remove(publicMatchRef(matchId)).catch(() => {}), // might not exist
  ]);
}

/** Smaže veřejný mirror zápasu */
export async function deletePublicMatch(matchId: string): Promise<void> {
  await remove(publicMatchRef(matchId));
}

/** Real-time subscription na veřejný zápas (pro rodiče) */
export function subscribeToPublicMatch(
  matchId: string,
  callback: (match: PublicSeasonMatch | null) => void,
): () => void {
  const r = publicMatchRef(matchId);
  const handler = (snapshot: import('firebase/database').DataSnapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    const raw = snapshot.val() as Record<string, unknown>;
    callback({
      ...raw,
      lineup: ensureArray(raw.lineup),
      goals: ensureArray(raw.goals),
      substitutions: ensureArray(raw.substitutions),
      cards: ensureArray(raw.cards),
      homeScore: (raw.homeScore as number) ?? 0,
      awayScore: (raw.awayScore as number) ?? 0,
      pausedElapsed: (raw.pausedElapsed as number) ?? 0,
      status: (raw.status as string) ?? 'planned',
      startedAt: (raw.startedAt as string) ?? null,
      pausedAt: (raw.pausedAt as string) ?? null,
      finishedAt: (raw.finishedAt as string) ?? null,
    } as PublicSeasonMatch);
  };
  onValue(r, handler, () => callback(null));
  return () => off(r, 'value', handler);
}

/** Načte všechny zápasy uživatele */
export async function loadMatchesFromFirebase(uid: string): Promise<SeasonMatch[]> {
  const snapshot = await get(matchesRef(uid));
  if (!snapshot.exists()) return [];
  const data = snapshot.val() as Record<string, Record<string, unknown>>;
  const matches = Object.values(data).map(normalizeMatch);
  logger.debug(`[Firebase] Loaded ${matches.length} matches`);
  return matches;
}
