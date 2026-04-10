/**
 * Firebase Realtime Database — Shared Clubs service
 *
 * Nový model sdílených klubů (Etapa 1 refactoru):
 * - /clubs/{clubId} — samotný klub s members map
 * - /users/{uid}/memberOfClubs/{clubId} = role — pointery
 * - /users/{uid}/activeClubId — aktuálně aktivní klub pro workspace UI
 *
 * Zápis klubu samotného (meta, players, teams) dělá client přes .set/.update
 * pokud je členem a má roli owner/coach.
 * Zápis členství a ownership jde výhradně přes Cloud Functions.
 */

import { ref, set, get, update, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import type { SharedClub, MemberOfClubs, ClubRole } from '../types/club.types';

// ─── Reference helpers ──────────────────────────────────────────────────────

const sharedClubRef = (clubId: string) => ref(db, `clubs/${clubId}`);
const memberOfClubsRef = (uid: string) => ref(db, `users/${uid}/memberOfClubs`);
const activeClubIdRef = (uid: string) => ref(db, `users/${uid}/activeClubId`);

// ─── Read ───────────────────────────────────────────────────────────────────

/** Načte jeden sdílený klub. Vrací null pokud neexistuje nebo uživatel nemá přístup. */
/** Firebase RTDB ukládá pole jako objekty — normalizujeme zpět na pole */
function ensureArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return Object.values(val);
  return [];
}

export async function loadSharedClub(clubId: string): Promise<SharedClub | null> {
  try {
    const snap = await get(sharedClubRef(clubId));
    if (!snap.exists()) return null;
    const raw = snap.val();
    // Normalizuj players a ageCategories (Firebase může vrátit objekt místo pole)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const players = ensureArray(raw.players).map((p: any) => ({
      ...p,
      categoryHistory: ensureArray(p?.categoryHistory),
    }));
    return {
      ...raw,
      players,
      ageCategories: ensureArray(raw.ageCategories),
      defaultPlayers: ensureArray(raw.defaultPlayers),
    } as SharedClub;
  } catch {
    return null;
  }
}

/** Načte mapu klubů, jejichž je uživatel členem. */
export async function loadMemberOfClubs(uid: string): Promise<MemberOfClubs> {
  try {
    const snap = await get(memberOfClubsRef(uid));
    if (!snap.exists()) return {};
    const raw = snap.val();
    // Normalizuj legacy hodnoty (true → 'coach')
    const result: MemberOfClubs = {};
    for (const [clubId, value] of Object.entries(raw)) {
      if (value === true) result[clubId] = 'coach';
      else if (typeof value === 'string' && (value === 'owner' || value === 'coach' || value === 'viewer')) {
        result[clubId] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Bulk-načte všechny sdílené kluby, jichž je uživatel členem. */
export async function loadAllSharedClubsForUser(uid: string): Promise<SharedClub[]> {
  const memberOf = await loadMemberOfClubs(uid);
  const clubIds = Object.keys(memberOf);
  if (clubIds.length === 0) return [];

  const clubs = await Promise.all(clubIds.map(id => loadSharedClub(id)));
  return clubs.filter((c): c is SharedClub => c !== null);
}

/** Načte uložené activeClubId pro uživatele. */
export async function loadActiveClubId(uid: string): Promise<string | null> {
  try {
    const snap = await get(activeClubIdRef(uid));
    if (!snap.exists()) return null;
    const v = snap.val();
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** Nastaví activeClubId pro uživatele. */
export async function setActiveClubId(uid: string, clubId: string | null): Promise<void> {
  await set(activeClubIdRef(uid), clubId);
}

// ─── Write (mutable club content — owner/coach) ────────────────────────────

/**
 * Uloží celý sdílený klub. Používá se pro inkrementální updaty (players, teams atd).
 * POZN: nesmí měnit `members`, `ownership`, `catalogId`, `createdAt`, `createdBy`, `id`
 * (rules blokují — jen CF). Pokud se to stane, rules write selže.
 */
export async function saveSharedClub(club: SharedClub): Promise<void> {
  await set(sharedClubRef(club.id), club);
}

/** Rekurzivně odstraní undefined hodnoty (Firebase RTDB je neakceptuje) */
function stripUndefined(obj: unknown): unknown {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== undefined) clean[k] = stripUndefined(v);
  }
  return clean;
}

/** Patchne konkrétní pole klubu (name, logo, players...). */
export async function updateSharedClub(clubId: string, patch: Record<string, unknown>): Promise<void> {
  const clean = stripUndefined({ ...patch, updatedAt: new Date().toISOString() }) as Record<string, unknown>;
  await update(sharedClubRef(clubId), clean);
}

// ─── Realtime subscription ──────────────────────────────────────────────────

/** Subscribe na změny jednoho klubu. Vrací unsubscribe. */
export function subscribeToSharedClub(
  clubId: string,
  callback: (club: SharedClub | null) => void,
): () => void {
  const r = sharedClubRef(clubId);
  const listener = (snap: { val: () => unknown; exists: () => boolean }) => {
    if (!snap.exists()) callback(null);
    else callback(snap.val() as SharedClub);
  };
  onValue(r, listener as Parameters<typeof onValue>[1]);
  return () => off(r, 'value', listener as Parameters<typeof off>[2]);
}

/** Subscribe na memberOfClubs (přidání/odebrání klubů uživatele). */
export function subscribeToMemberOfClubs(
  uid: string,
  callback: (memberOf: MemberOfClubs) => void,
): () => void {
  const r = memberOfClubsRef(uid);
  const listener = (snap: { val: () => unknown; exists: () => boolean }) => {
    if (!snap.exists()) {
      callback({});
      return;
    }
    const raw = snap.val() as Record<string, unknown>;
    const result: MemberOfClubs = {};
    for (const [clubId, value] of Object.entries(raw)) {
      if (value === 'owner' || value === 'coach' || value === 'viewer') {
        result[clubId] = value as ClubRole;
      } else if (value === true) {
        result[clubId] = 'coach';
      }
    }
    callback(result);
  };
  onValue(r, listener as Parameters<typeof onValue>[1]);
  return () => off(r, 'value', listener as Parameters<typeof off>[2]);
}
