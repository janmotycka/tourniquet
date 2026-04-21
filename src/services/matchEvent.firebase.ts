/**
 * Firebase service pro Match Events („Den zápasů").
 * Cesty:
 *   /match-events/{ownerUid}/{eventId}     — privátní, jen owner
 *   /public-match-events/{eventId}         — veřejný mirror (pro rodiče)
 */

import { ref, set, remove, onValue, off, type DataSnapshot } from 'firebase/database';
import { db } from '../firebase';
import type { MatchEvent, PublicMatchEvent } from '../types/matchEvent.types';
import { logger } from '../utils/logger';
import { safeClone } from '../utils/clone';

const eventRef = (ownerUid: string, eventId: string) =>
  ref(db, `match-events/${ownerUid}/${eventId}`);
const eventsRef = (ownerUid: string) => ref(db, `match-events/${ownerUid}`);
const publicEventRef = (eventId: string) => ref(db, `public-match-events/${eventId}`);

function ensureArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && val !== null) return Object.values(val);
  return [];
}

function normalizeEvent(raw: Record<string, unknown>): MatchEvent {
  return {
    ...raw,
    matches: ensureArray(raw.matches),
    isPublic: !!raw.isPublic,
    createdAt: (raw.createdAt as string) ?? new Date(0).toISOString(),
    updatedAt: (raw.updatedAt as string) ?? new Date(0).toISOString(),
  } as MatchEvent;
}

function isValidEvent(e: Partial<MatchEvent>): e is MatchEvent {
  return typeof e.id === 'string' && e.id.length > 0
    && typeof e.date === 'string' && e.date.length > 0
    && typeof e.name === 'string' && e.name.length > 0
    && typeof e.ownerUid === 'string' && e.ownerUid.length > 0;
}

/** Převede event na veřejný mirror (zatím vše sdílené — žádné PII uvnitř events). */
function toPublicEvent(event: MatchEvent): PublicMatchEvent {
  return {
    id: event.id,
    ownerUid: event.ownerUid,
    name: event.name,
    date: event.date,
    sport: event.sport,
    ...(event.venue ? { venue: event.venue } : {}),
    matches: event.matches,
    updatedAt: event.updatedAt,
  };
}

export async function saveMatchEventToFirebase(event: MatchEvent): Promise<void> {
  const clean = safeClone(event);
  const writes: Promise<void>[] = [set(eventRef(event.ownerUid, event.id), clean)];
  if (event.isPublic) {
    writes.push(set(publicEventRef(event.id), safeClone(toPublicEvent(event))));
  } else {
    writes.push(remove(publicEventRef(event.id)).catch(() => {}));
  }
  await Promise.all(writes);
}

export async function deleteMatchEventFromFirebase(ownerUid: string, eventId: string): Promise<void> {
  await Promise.all([
    remove(eventRef(ownerUid, eventId)).catch(() => {}),
    remove(publicEventRef(eventId)).catch(() => {}),
  ]);
}

export function subscribeToMatchEvents(
  ownerUid: string,
  callback: (events: MatchEvent[]) => void,
): () => void {
  const r = eventsRef(ownerUid);
  const handler = (snap: DataSnapshot) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const data = snap.val() as Record<string, Record<string, unknown>>;
    const list = Object.values(data).map(normalizeEvent).filter(isValidEvent);
    callback(list);
  };
  onValue(r, handler, (err) => {
    logger.warn(`[Firebase] subscribeToMatchEvents (${ownerUid}) error:`, err.message);
    callback([]);
  });
  return () => off(r, 'value', handler);
}

/** Real-time subscription na veřejný event (pro rodiče). */
export function subscribeToPublicMatchEvent(
  eventId: string,
  callback: (event: PublicMatchEvent | null) => void,
): () => void {
  const r = publicEventRef(eventId);
  const handler = (snap: DataSnapshot) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const raw = snap.val() as Record<string, unknown>;
    const normalized: PublicMatchEvent = {
      ...raw,
      matches: ensureArray(raw.matches) as PublicMatchEvent['matches'],
    } as PublicMatchEvent;
    callback(normalized);
  };
  onValue(r, handler, () => callback(null));
  return () => off(r, 'value', handler);
}
