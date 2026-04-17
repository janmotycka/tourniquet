/**
 * Firebase Realtime Database — Season match service
 *
 * Cesta: /matches/{ownerUid}/{matchId}        (privátní, owner-only)
 *        /public-matches/{matchId}             (veřejné, pro rodiče)
 */

import { ref, set, get, remove, onValue, off, DataSnapshot } from 'firebase/database';
import { db } from '../firebase';
import type { SeasonMatch, PublicSeasonMatch, MatchCatalogEntry } from '../types/match.types';
import { logger } from '../utils/logger';
import { safeClone } from '../utils/clone';

/**
 * Scope = buď `clubId` (nové, sdílené mezi trenéry klubu) nebo `uid` (legacy,
 * per-user storage). Rules podporují obojí: `/matches/{scopeId}/` — pokud
 * scopeId == clubId, čtou/píšou všichni klubový členové; pokud scopeId == uid,
 * čte/píše jen daný user.
 */
const matchesRef = (scopeId: string) => ref(db, `matches/${scopeId}`);
const matchRef = (scopeId: string, matchId: string) => ref(db, `matches/${scopeId}/${matchId}`);
const matchActiveEditorRef = (scopeId: string, matchId: string) => ref(db, `matches/${scopeId}/${matchId}/activeEditor`);
const publicMatchRef = (matchId: string) => ref(db, `public-matches/${matchId}`);
const matchCatalogRef = () => ref(db, 'match-catalog');
const matchCatalogEntryRef = (id: string) => ref(db, `match-catalog/${id}`);

/** Určí správný scope pro uložení zápasu — preferuj klub (sdílení s trenéry),
 *  fallback na auth UID pro legacy zápasy bez klubu. */
function resolveMatchScope(match: { clubId?: string }, authUid: string): string {
  return match.clubId && match.clubId.length > 0 && !match.clubId.startsWith('individual-')
    ? match.clubId
    : authUid;
}

// Firebase RTDB smaže prázdné pole [] → musíme normalizovat při čtení
function ensureArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && val !== null) return Object.values(val);
  return [];
}

function normalizeMatch(raw: Record<string, unknown>): SeasonMatch {
  // Tennis sub-matches — normalizuj homePlayerIds a sets (Firebase stripuje [])
  const subMatchesRaw = raw.subMatches;
  const normalizedSubMatches = subMatchesRaw
    ? ensureArray(subMatchesRaw).map((s: unknown) => {
        const sub = s as Record<string, unknown>;
        return {
          ...sub,
          homePlayerIds: ensureArray(sub.homePlayerIds) as string[],
          sets: ensureArray(sub.sets) as Array<{ home: number; away: number }>,
        };
      })
    : undefined;

  return {
    ...raw,
    lineup: ensureArray(raw.lineup),
    goals: ensureArray(raw.goals),
    substitutions: ensureArray(raw.substitutions),
    cards: ensureArray(raw.cards),
    ratings: ensureArray(raw.ratings),
    ...(normalizedSubMatches ? { subMatches: normalizedSubMatches } : {}),
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
  // Sestava se veřejně skrývá dokud je zápas 'planned', pokud trenér výslovně neřekl jinak
  const visibility = match.lineupVisibility ?? 'atStart';
  const lineupHidden = visibility === 'atStart' && match.status === 'planned';

  return {
    id: match.id,
    ownerUid,
    ...(match.clubName ? { clubName: match.clubName } : {}),
    opponent: match.opponent,
    isHome: match.isHome,
    ...(match.venue ? { venue: match.venue } : {}),
    date: match.date,
    kickoffTime: match.kickoffTime,
    competition: match.competition,
    durationMinutes: match.durationMinutes,
    periods: match.periods,
    periodDurationMinutes: match.periodDurationMinutes,
    currentPeriod: match.currentPeriod,
    status: match.status,
    startedAt: match.startedAt,
    pausedAt: match.pausedAt,
    pausedElapsed: match.pausedElapsed,
    finishedAt: match.finishedAt,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    lineup: lineupHidden ? [] : match.lineup,
    goals: match.goals,
    substitutions: match.substitutions,
    cards: match.cards,
    ...(match.veoUrl ? { veoUrl: match.veoUrl } : {}),
    ...(match.sport ? { sport: match.sport } : {}),
    ...(match.matchType ? { matchType: match.matchType } : {}),
    ...(match.subMatches ? { subMatches: match.subMatches } : {}),
    ...(match.officialResultsNote ? { officialResultsNote: match.officialResultsNote } : {}),
    ...(match.officialResultsUrl ? { officialResultsUrl: match.officialResultsUrl } : {}),
    ...(match.myPlayerId ? { myPlayerId: match.myPlayerId } : {}),
    updatedAt: match.updatedAt,
  };
}

/** Uloží/aktualizuje zápas + volitelně public mirror.
 *  Klubové zápasy ukládáme pod `matches/{clubId}/` (sdílení s trenéry klubu).
 *  Tenisové individuální (clubId=`individual-*`) a legacy zápasy bez klubu
 *  zůstávají per-user `matches/{uid}/`. */
export async function saveMatchToFirebase(uid: string, match: SeasonMatch): Promise<void> {
  const scope = resolveMatchScope(match, uid);
  // Strip undefined values (Firebase neakceptuje undefined)
  const clean = safeClone(match);
  const writes: Promise<void>[] = [set(matchRef(scope, match.id), clean)];
  if (match.isPublic) {
    const publicData = safeClone(toPublicMatch(match, uid));
    writes.push(set(publicMatchRef(match.id), publicData));
  }
  await Promise.all(writes);
}

/** Smaže zápas (i veřejný mirror pokud existuje) ze všech známých scope.
 *  Pokud byl zápas legacy (`matches/{uid}/`), i klubový (`matches/{clubId}/`)
 *  — bezpečně smažeme oba (ignore missing). */
export async function deleteMatchFromFirebase(uid: string, matchId: string, clubId?: string): Promise<void> {
  const ops: Promise<void>[] = [
    remove(matchRef(uid, matchId)).catch(() => {}),
    remove(publicMatchRef(matchId)).catch(() => {}),
  ];
  if (clubId && clubId !== uid && !clubId.startsWith('individual-')) {
    ops.push(remove(matchRef(clubId, matchId)).catch(() => {}));
  }
  await Promise.all(ops);
}

/** Aktualizuje activeEditor field zápasu (heartbeat / acquire / release).
 *  Samostatný write aby nebylo potřeba přepisovat celý match document. */
export async function updateMatchActiveEditor(
  scopeId: string,
  matchId: string,
  editor: { uid: string; name: string; startedAt: string; heartbeatAt: string } | null,
): Promise<void> {
  await set(matchActiveEditorRef(scopeId, matchId), editor);
}

// ─── Cross-team pairing ──────────────────────────────────────────────────────
// Home coach (vytvořitel) může pozvat opozičního trenéra, aby s ním zapisoval
// ten samý match. Funguje přes PIN + join token:
//   1. Home coach vygeneruje PIN (4 digits) a random joinToken → uloží do pairing
//   2. Sdílí URL s joinToken-em + PIN (např. WhatsApp)
//   3. Opposing coach otevře URL → zadá PIN → klient ověří hash → zapíše awayCoachUid
//   4. Po join se pinHash/pinSalt/joinToken smaží, zůstává jen awayCoachUid* data

const matchPairingRef = (scopeId: string, matchId: string) =>
  ref(db, `matches/${scopeId}/${matchId}/pairing`);

/** Přepíše celý pairing objekt (pro invite create, join claim, unlink). */
export async function writeMatchPairing(
  scopeId: string,
  matchId: string,
  pairing: Record<string, unknown> | null,
): Promise<void> {
  if (pairing === null) {
    await remove(matchPairingRef(scopeId, matchId));
    return;
  }
  // Strip undefined — Firebase odmítne
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(pairing)) {
    if (v !== undefined) clean[k] = v;
  }
  await set(matchPairingRef(scopeId, matchId), clean);
}

/** Load single match (for join flow, když uživatel ještě není předplacen na scope). */
export async function loadSingleMatch(scopeId: string, matchId: string): Promise<SeasonMatch | null> {
  const snapshot = await get(matchRef(scopeId, matchId));
  if (!snapshot.exists()) return null;
  const raw = snapshot.val() as Record<string, unknown>;
  const m = normalizeMatch(raw);
  if (!isValidMatch(m)) return null;
  return m;
}

/**
 * Realtime subscription na **jeden** match document napříč scope —
 * pro cross-team pairing, kdy away coach nemá access na celý scope list
 * (Firebase rules povolují single-doc read, ne list read).
 */
export function subscribeToSingleMatch(
  scopeId: string,
  matchId: string,
  callback: (match: SeasonMatch | null) => void,
): () => void {
  const r = matchRef(scopeId, matchId);
  const handler = (snapshot: DataSnapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    const raw = snapshot.val() as Record<string, unknown>;
    const m = normalizeMatch(raw);
    callback(isValidMatch(m) ? m : null);
  };
  onValue(r, handler, (err) => {
    logger.warn(`[Firebase] subscribeToSingleMatch (${scopeId}/${matchId}) error:`, err.message);
    callback(null);
  });
  return () => off(r, 'value', handler);
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

/**
 * Filter "stub" záznamů — Firebase může mít partial záznamy pokud se někdy
 * zapisoval jen sub-field (např. activeEditor) do neexistujícího matche.
 * Validní match MUSÍ mít aspoň `id` + `date`.
 */
function isValidMatch(m: Partial<SeasonMatch>): m is SeasonMatch {
  return typeof m.id === 'string' && typeof m.date === 'string' && m.date.length > 0;
}

/** Načte všechny zápasy z daného scope (uid nebo clubId). */
export async function loadMatchesFromFirebase(scopeId: string): Promise<SeasonMatch[]> {
  const snapshot = await get(matchesRef(scopeId));
  if (!snapshot.exists()) return [];
  const data = snapshot.val() as Record<string, Record<string, unknown>>;
  const matches = Object.values(data).map(normalizeMatch).filter(isValidMatch);
  logger.debug(`[Firebase] Loaded ${matches.length} matches from scope ${scopeId}`);
  return matches;
}

/**
 * Realtime subscription ke všem zápasům ve více scope současně
 * (legacy per-user + všechny kluby, jichž je uživatel členem).
 * Callback dostane vždy merged seznam (deduplicated by id).
 */
export function subscribeToMatchesMultiScope(
  scopeIds: string[],
  callback: (matches: SeasonMatch[]) => void,
): () => void {
  if (scopeIds.length === 0) {
    callback([]);
    return () => {};
  }

  // Map scope → matches[] (udržujeme aktuální state z každého scope)
  const byScope = new Map<string, SeasonMatch[]>();
  const emit = () => {
    const merged = new Map<string, SeasonMatch>();
    for (const list of byScope.values()) {
      for (const m of list) merged.set(m.id, m);  // poslední scope vyhrává (měl by být konzistentní)
    }
    callback([...merged.values()]);
  };

  const handlers: Array<{ r: ReturnType<typeof matchesRef>; h: (s: DataSnapshot) => void }> = [];
  for (const scope of scopeIds) {
    const r = matchesRef(scope);
    const handler = (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) {
        byScope.set(scope, []);
      } else {
        const data = snapshot.val() as Record<string, Record<string, unknown>>;
        byScope.set(scope, Object.values(data).map(normalizeMatch));
      }
      emit();
    };
    onValue(r, handler, (err) => {
      logger.warn(`[Firebase] subscribeToMatches (${scope}) error:`, err.message);
      byScope.set(scope, []);
      emit();
    });
    handlers.push({ r, h: handler });
  }

  return () => {
    for (const { r, h } of handlers) off(r, 'value', h);
  };
}

/** Backward-compat: subscribe na jeden scope (uid), používá se když nejsou kluby.
 *  @deprecated použij subscribeToMatchesMultiScope */
export function subscribeToMatches(uid: string, callback: (matches: SeasonMatch[]) => void): () => void {
  return subscribeToMatchesMultiScope([uid], callback);
}

// ─── Match Catalog (lightweight index for landing page) ─────────────────────

function toMatchCatalogEntry(match: SeasonMatch, ownerUid: string): MatchCatalogEntry {
  const entry: MatchCatalogEntry = {
    id: match.id,
    clubName: match.clubName || '',
    opponent: match.opponent,
    isHome: match.isHome,
    date: match.date,
    kickoffTime: match.kickoffTime,
    competition: match.competition,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    ownerUid,
    updatedAt: match.updatedAt,
  };
  // ageCategory + venue + sport jen pokud vyplněné (Firebase odmítá undefined)
  if (match.ageCategory) entry.ageCategory = match.ageCategory;
  if (match.venue) entry.venue = match.venue;
  if (match.sport) entry.sport = match.sport;
  return entry;
}

/** Uloží zápas do veřejného katalogu */
export async function saveMatchCatalogEntry(match: SeasonMatch, ownerUid: string): Promise<void> {
  const entry = toMatchCatalogEntry(match, ownerUid);
  await set(matchCatalogEntryRef(match.id), entry);
}

/** Smaže zápas z veřejného katalogu */
export async function deleteMatchCatalogEntry(matchId: string): Promise<void> {
  await remove(matchCatalogEntryRef(matchId));
}

/** Real-time subscription na katalog zápasů */
export function subscribeToMatchCatalog(
  callback: (entries: MatchCatalogEntry[]) => void,
): () => void {
  const r = matchCatalogRef();
  const handler = (snapshot: DataSnapshot) => {
    const entries: MatchCatalogEntry[] = [];
    if (snapshot.exists()) {
      const data = snapshot.val() as Record<string, MatchCatalogEntry>;
      for (const val of Object.values(data)) {
        entries.push(val);
      }
    }
    callback(entries);
  };
  onValue(r, handler, () => callback([]));
  return () => off(r, 'value', handler);
}
