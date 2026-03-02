/**
 * Firebase Realtime Database — Season match service
 *
 * Cesta: /matches/{ownerUid}/{matchId}
 * Owner-only: žádné public zrcadlo, žádné sdílení.
 */

import { ref, set, get, remove } from 'firebase/database';
import { db } from '../firebase';
import type { SeasonMatch } from '../types/match.types';
import { logger } from '../utils/logger';

const matchesRef = (uid: string) => ref(db, `matches/${uid}`);
const matchRef = (uid: string, matchId: string) => ref(db, `matches/${uid}/${matchId}`);

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

/** Uloží/aktualizuje zápas */
export async function saveMatchToFirebase(uid: string, match: SeasonMatch): Promise<void> {
  // Strip undefined values (Firebase neakceptuje undefined)
  const clean = JSON.parse(JSON.stringify(match));
  await set(matchRef(uid, match.id), clean);
}

/** Smaže zápas */
export async function deleteMatchFromFirebase(uid: string, matchId: string): Promise<void> {
  await remove(matchRef(uid, matchId));
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
