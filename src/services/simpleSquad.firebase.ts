/**
 * Firebase service pro Simple Squads.
 * Cesta: /simple-squads/{ownerUid}/{squadId}
 */

import { ref, set, remove, onValue, off, type DataSnapshot } from 'firebase/database';
import { db } from '../firebase';
import type { SimpleSquad } from '../types/simpleSquad.types';
import { logger } from '../utils/logger';
import { safeClone } from '../utils/clone';

const squadRef = (uid: string, id: string) => ref(db, `simple-squads/${uid}/${id}`);
const squadsRef = (uid: string) => ref(db, `simple-squads/${uid}`);

function normalizeSquad(raw: Record<string, unknown>): SimpleSquad {
  const players = Array.isArray(raw.players)
    ? (raw.players as unknown[]).filter(p => typeof p === 'string') as string[]
    : [];
  return {
    ...raw,
    players,
    createdAt: (raw.createdAt as string) ?? new Date(0).toISOString(),
    updatedAt: (raw.updatedAt as string) ?? new Date(0).toISOString(),
  } as SimpleSquad;
}

function isValid(s: Partial<SimpleSquad>): s is SimpleSquad {
  return typeof s.id === 'string' && s.id.length > 0
    && typeof s.name === 'string' && s.name.length > 0
    && typeof s.ownerUid === 'string';
}

export async function saveSimpleSquad(squad: SimpleSquad): Promise<void> {
  await set(squadRef(squad.ownerUid, squad.id), safeClone(squad));
}

export async function deleteSimpleSquadFromFirebase(uid: string, id: string): Promise<void> {
  await remove(squadRef(uid, id)).catch(() => {});
}

export function subscribeToSimpleSquads(
  uid: string,
  callback: (squads: SimpleSquad[]) => void,
): () => void {
  const r = squadsRef(uid);
  const handler = (snap: DataSnapshot) => {
    if (!snap.exists()) { callback([]); return; }
    const data = snap.val() as Record<string, Record<string, unknown>>;
    callback(Object.values(data).map(normalizeSquad).filter(isValid));
  };
  onValue(r, handler, (err) => {
    logger.warn(`[Firebase] subscribeToSimpleSquads (${uid}) error:`, err.message);
    callback([]);
  });
  return () => off(r, 'value', handler);
}
