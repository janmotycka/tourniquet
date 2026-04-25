/**
 * Zustand store pro správu klubů.
 *
 * Jediný datový model: sdílené kluby na `/clubs/{clubId}` s členstvím
 * přes `/users/{uid}/memberOfClubs/{clubId} = role`.
 *
 * - Čtení: `loadFromFirebase(uid)` natáhne memberOfClubs + plné kluby
 *   a nasetuje realtime listener na přírůstky/úbytky členstev.
 * - Zápis: tvorba/mazání klubů přes Cloud Functions
 *   (`createPersonalClub`, `adminDeleteClub`/`leaveClub`),
 *   úpravy obsahu (players, name, color, ageCategories...) přes přímý
 *   write do `/clubs/{clubId}` (DB rules povolují owner/coach).
 *
 * Žádný localStorage persist — pravda je vždy v Firebase.
 */

import { create } from 'zustand';
import { useToastStore } from './toast.store';
import type {
  Club,
  ClubPlayer,
  CreateClubInput,
  AgeCategory,
  MemberOfClubs,
  ClubRole,
} from '../types/club.types';
import type { Sport } from '../types/sport.types';
import { generateId } from '../utils/id';
import {
  loadMemberOfClubs,
  loadAllSharedClubsForUser,
  loadActiveClubId,
  setActiveClubId as setActiveClubIdFb,
  subscribeToMemberOfClubs,
  loadSharedClub,
  updateSharedClub,
} from '../services/shared-club.firebase';
import { createPersonalClub, leaveClub } from '../services/club-functions';
import { logger } from '../utils/logger';

interface ClubsState {
  /** Jediný zdroj pravdy — kluby, kterých je uživatel členem. */
  clubs: Club[];
  firebaseUid: string | null;

  /** Mapa clubId → role pro všechny sdílené kluby, jichž je uživatel členem */
  memberOfClubs: MemberOfClubs;
  /** Aktuálně vybraný klub (pro workspace UI). Null pokud uživatel nemá žádný. */
  activeClubId: string | null;
  /** Unsubscribe handle pro memberOfClubs listener */
  _memberOfClubsUnsub: (() => void) | null;

  // ─── Loading ─────────────────────────────────────────────────────────────
  loadFromFirebase: (uid: string) => Promise<void>;
  setFirebaseUid: (uid: string | null) => void;

  // ─── Active club selection ───────────────────────────────────────────────
  setActiveClubId: (clubId: string | null) => Promise<void>;
  getActiveClub: () => Club | undefined;
  getMyRoleInClub: (clubId: string) => ClubRole | null;
  /** Pokud aktivní klub nepatří k danému sportu, přepne na první klub daného sportu (nebo null). */
  ensureActiveClubMatchesSport: (sport: Sport) => Promise<void>;

  // ─── CRUD klubu ──────────────────────────────────────────────────────────
  /**
   * Vytvoří osobní klub přes Cloud Function `createPersonalClub`.
   * Po úspěchu reload memberOfClubs + sharedClubs, vrátí nový Club.
   */
  createClub: (input: CreateClubInput) => Promise<Club>;
  /** Patchne meta klubu (name, color, logo...). Přímý write do /clubs/{id}. */
  updateClub: (id: string, patch: Partial<Omit<Club, 'id' | 'createdAt'>>) => Promise<void>;
  /**
   * Odejde z klubu přes `leaveClub` CF. Pro osobní kluby s jediným ownerem
   * je to efektivní smazání. Pro sdílené kluby odstranění členství.
   */
  deleteClub: (id: string) => Promise<void>;
  getClubById: (id: string) => Club | undefined;

  // ─── Správa hráčů (přímý write do /clubs/{id}/players) ──────────────────
  addPlayer: (clubId: string, player: Omit<ClubPlayer, 'id'>) => Promise<void>;
  addPlayersBulk: (clubId: string, players: Omit<ClubPlayer, 'id'>[]) => Promise<void>;
  updatePlayer: (clubId: string, playerId: string, patch: Partial<Omit<ClubPlayer, 'id'>>) => Promise<void>;
  removePlayer: (clubId: string, playerId: string) => Promise<void>;
  movePlayerToCategory: (clubId: string, playerId: string, newCategory: AgeCategory) => Promise<void>;
  /**
   * Bulk posun všech aktivních hráčů do další věkové kategorie (nová sezóna).
   * Dospělé kategorie (Dorost, Muži, Muži B, Ženy) a U19 zůstávají beze změny.
   * U15 přeskakuje U16 → U17 (FAČR tradice).
   * Vrací počet reálně posunutých hráčů.
   */
  advanceAllPlayersCategory: (clubId: string) => Promise<{ movedCount: number }>;

  // ─── Kategorie ────────────────────────────────────────────────────────────
  setAgeCategories: (clubId: string, categories: AgeCategory[]) => Promise<void>;
}

// ─── Season advance helpers ────────────────────────────────────────────────

/**
 * Mapa "co je další kategorie" pro posun o sezónu.
 * Dospělé kategorie a U19 zůstávají (vrátí null = no-op).
 * U15 přeskakuje U16 → U17 (FAČR tradice).
 */
const NEXT_AGE_CATEGORY: Partial<Record<AgeCategory, AgeCategory>> = {
  'U6': 'U7',
  'U7': 'U8',
  'U8': 'U9',
  'U9': 'U10',
  'U10': 'U11',
  'U11': 'U12',
  'U12': 'U13',
  'U13': 'U14',
  'U14': 'U15',
  'U15': 'U17',
  'U17': 'U19',
};

/** Vrací další kategorii pro posun nebo null, pokud hráč zůstává. */
export function getNextAgeCategory(current: AgeCategory): AgeCategory | null {
  return NEXT_AGE_CATEGORY[current] ?? null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Vrací mutovatelnou kopii klubu po aplikaci patch funkce + volá Firebase update.
 * Updatuje lokální state optimisticky, sync selhání jen loguje.
 */
async function patchClubContent(
  get: () => ClubsState,
  set: (fn: (s: ClubsState) => Partial<ClubsState>) => void,
  clubId: string,
  mutate: (c: Club) => Partial<Club>,
) {
  const current = get().clubs.find(c => c.id === clubId);
  if (!current) {
    logger.warn('[Clubs] patchClubContent: club not found', clubId);
    return;
  }
  const patch = mutate(current);
  const updatedAt = new Date().toISOString();
  const updated: Club = { ...current, ...patch, updatedAt };

  set(s => ({
    clubs: s.clubs.map(c => (c.id === clubId ? updated : c)),
  }));

  try {
    await updateSharedClub(clubId, { ...patch, updatedAt });
  } catch (err) {
    logger.error('[Clubs] updateSharedClub FAILED:', err);
    useToastStore.getState().show('error', 'Nepodařilo se uložit do cloudu');
  }
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useClubsStore = create<ClubsState>((set, get) => ({
  clubs: [],
  firebaseUid: null,
  memberOfClubs: {},
  activeClubId: null,
  _memberOfClubsUnsub: null,

  // ─── Loading ──────────────────────────────────────────────────────────────

  loadFromFirebase: async (uid: string) => {
    set(() => ({ firebaseUid: uid }));
    try {
      const [memberOf, sharedClubs, activeId] = await Promise.all([
        loadMemberOfClubs(uid),
        loadAllSharedClubsForUser(uid),
        loadActiveClubId(uid),
      ]);

      // Auto-vyber první klub, pokud není nastaven activeClubId a nějaký existuje
      let finalActiveId = activeId;
      if (!finalActiveId && sharedClubs.length > 0) {
        finalActiveId = sharedClubs[0].id;
        void setActiveClubIdFb(uid, finalActiveId).catch(err =>
          logger.warn('[Clubs] Failed to auto-set activeClubId:', err),
        );
      }

      set(() => ({
        memberOfClubs: memberOf,
        clubs: sharedClubs,
        activeClubId: finalActiveId,
      }));
      logger.debug('[Clubs] Loaded', sharedClubs.length, 'clubs, active:', finalActiveId);

      // Realtime listener na memberOfClubs — propaguje invite/remove
      const prevUnsub = get()._memberOfClubsUnsub;
      if (prevUnsub) prevUnsub();
      const unsub = subscribeToMemberOfClubs(uid, async (newMemberOf) => {
        set(() => ({ memberOfClubs: newMemberOf }));

        // Pokud uživatel ztratil přístup k activeClubId, fallback na první dostupný
        const current = get().activeClubId;
        if (current && !newMemberOf[current]) {
          const fallback = Object.keys(newMemberOf)[0] || null;
          set(() => ({ activeClubId: fallback }));
          if (fallback) void setActiveClubIdFb(uid, fallback);
        }

        // Reloaduj seznam klubů (mohl se změnit)
        try {
          const refreshed = await loadAllSharedClubsForUser(uid);
          set(() => ({ clubs: refreshed }));
        } catch (err) {
          logger.warn('[Clubs] Refresh after memberOfClubs change failed:', err);
        }
      });
      set(() => ({ _memberOfClubsUnsub: unsub }));
    } catch (err) {
      logger.warn('[Clubs] loadFromFirebase failed:', err);
    }
  },

  setFirebaseUid: (uid) => {
    const prevUnsub = get()._memberOfClubsUnsub;
    if (!uid) {
      if (prevUnsub) prevUnsub();
      set(() => ({
        firebaseUid: null,
        memberOfClubs: {},
        clubs: [],
        activeClubId: null,
        _memberOfClubsUnsub: null,
      }));
    } else {
      set(() => ({ firebaseUid: uid }));
    }
  },

  // ─── Active club selection ────────────────────────────────────────────────

  setActiveClubId: async (clubId) => {
    const uid = get().firebaseUid;
    set(() => ({ activeClubId: clubId }));
    if (uid) {
      try {
        await setActiveClubIdFb(uid, clubId);
      } catch (err) {
        logger.warn('[Clubs] setActiveClubId sync failed:', err);
      }
    }
  },

  ensureActiveClubMatchesSport: async (sport) => {
    const { activeClubId, clubs } = get();
    const active = activeClubId ? clubs.find(c => c.id === activeClubId) : undefined;
    const activeSport = (active?.sport ?? 'football') as 'football' | 'tennis';
    if (active && activeSport === sport) return; // už sedí
    // Najdi první klub daného sportu (legacy bez sportu = football).
    const candidate = clubs.find(c => (c.sport ?? 'football') === sport);
    await get().setActiveClubId(candidate?.id ?? null);
  },

  getActiveClub: () => {
    const { activeClubId, clubs } = get();
    if (clubs.length === 0) return undefined;
    // Pokud activeClubId pointuje na smazaný / nedostupný klub
    // (např. klub smazán na jiném zařízení během realtime syncu),
    // fallback na první dostupný a opravit activeClubId.
    const found = activeClubId ? clubs.find(c => c.id === activeClubId) : undefined;
    if (!found) {
      const first = clubs[0];
      if (first && first.id !== activeClubId) {
        set(() => ({ activeClubId: first.id }));
      }
      return first;
    }
    return found;
  },

  getMyRoleInClub: (clubId) => {
    return get().memberOfClubs[clubId] ?? null;
  },

  // ─── CRUD klubu ──────────────────────────────────────────────────────────

  createClub: async (input) => {
    const uid = get().firebaseUid;
    if (!uid) throw new Error('Not authenticated');

    const res = await createPersonalClub({
      name: input.name,
      color: input.color,
      logoBase64: input.logoBase64 ?? null,
    });

    // CF vytvořil klub — reload a najdi ho
    const fresh = await loadSharedClub(res.clubId);
    if (!fresh) throw new Error('Club created but not readable');

    // Pokud přišly ageCategories v inputu, aplikuj je hned (jde přes rules = ok pro ownera)
    if (input.ageCategories && input.ageCategories.length > 0) {
      try {
        await updateSharedClub(res.clubId, { ageCategories: input.ageCategories });
        fresh.ageCategories = input.ageCategories;
      } catch (err) {
        logger.warn('[Clubs] Failed to set initial ageCategories:', err);
      }
    }

    // Nastav sport (default 'football', ale pokud vytváříme v tenis módu, je 'tennis').
    if (input.sport) {
      try {
        await updateSharedClub(res.clubId, { sport: input.sport });
        fresh.sport = input.sport;
      } catch (err) {
        logger.warn('[Clubs] Failed to set sport on new club:', err);
      }
    }

    // Refresh state — memberOfClubs listener to zachytí taky, ale ať je UI okamžité
    const [memberOf, sharedClubs] = await Promise.all([
      loadMemberOfClubs(uid),
      loadAllSharedClubsForUser(uid),
    ]);

    set(() => ({
      memberOfClubs: memberOf,
      clubs: sharedClubs,
      activeClubId: get().activeClubId ?? res.clubId,
    }));

    // Pokud dosud nebyl aktivní klub, nastav nově vytvořený
    if (!get().activeClubId) {
      await get().setActiveClubId(res.clubId);
    }

    return fresh;
  },

  updateClub: async (id, patch) => {
    await patchClubContent(get, set, id, () => patch);
  },

  deleteClub: async (id) => {
    const uid = get().firebaseUid;
    try {
      await leaveClub(id);
    } catch (err) {
      logger.warn('[Clubs] leaveClub failed:', err);
      throw err;
    }

    // Optimisticky odstraň z local state
    set(s => ({
      clubs: s.clubs.filter(c => c.id !== id),
      activeClubId: s.activeClubId === id ? null : s.activeClubId,
    }));

    // Reload memberOfClubs (server cleanup)
    if (uid) {
      try {
        const memberOf = await loadMemberOfClubs(uid);
        set(() => ({ memberOfClubs: memberOf }));
      } catch { /* silent */ }
    }
  },

  getClubById: (id) => get().clubs.find(c => c.id === id),

  // ─── Správa hráčů ─────────────────────────────────────────────────────────

  addPlayer: async (clubId, playerData) => {
    const player: ClubPlayer = { ...playerData, id: generateId() };
    await patchClubContent(get, set, clubId, (c) => ({
      players: [...(c.players ?? []), player],
    }));
  },

  addPlayersBulk: async (clubId, playersData) => {
    const newPlayers: ClubPlayer[] = playersData.map(p => ({ ...p, id: generateId() }));
    await patchClubContent(get, set, clubId, (c) => ({
      players: [...(c.players ?? []), ...newPlayers],
      ageCategories: Array.from(new Set([
        ...(c.ageCategories ?? []),
        ...newPlayers.map(p => p.ageCategory),
      ])),
    }));
  },

  updatePlayer: async (clubId, playerId, patch) => {
    await patchClubContent(get, set, clubId, (c) => ({
      players: (c.players ?? []).map(p =>
        p.id === playerId ? { ...p, ...patch } : p,
      ),
    }));
  },

  removePlayer: async (clubId, playerId) => {
    await patchClubContent(get, set, clubId, (c) => ({
      players: (c.players ?? []).filter(p => p.id !== playerId),
    }));
  },

  movePlayerToCategory: async (clubId, playerId, newCategory) => {
    const today = new Date().toISOString().slice(0, 10);
    await patchClubContent(get, set, clubId, (c) => {
      const ageCategories = (c.ageCategories ?? []).includes(newCategory)
        ? c.ageCategories
        : [...(c.ageCategories ?? []), newCategory];

      const players = (c.players ?? []).map(p => {
        if (p.id !== playerId) return p;
        if (p.ageCategory === newCategory) return p; // no-op
        const history = [...(p.categoryHistory ?? [])];
        const openIdx = history.findIndex(h => !h.to);
        if (openIdx >= 0) {
          history[openIdx] = { ...history[openIdx], to: today };
        } else if (history.length === 0) {
          history.push({
            category: p.ageCategory,
            from: p.createdAt?.slice(0, 10) ?? today,
            to: today,
          });
        }
        history.push({ category: newCategory, from: today });
        return {
          ...p,
          ageCategory: newCategory,
          categoryHistory: history,
          updatedAt: new Date().toISOString(),
        };
      });

      return { ageCategories, players };
    });
  },

  advanceAllPlayersCategory: async (clubId) => {
    const today = new Date().toISOString().slice(0, 10);
    let movedCount = 0;
    await patchClubContent(get, set, clubId, (c) => {
      const updatedPlayers = (c.players ?? []).map(p => {
        if (!p.active) return p;
        const next = getNextAgeCategory(p.ageCategory);
        if (!next || next === p.ageCategory) return p;

        movedCount += 1;
        const history = [...(p.categoryHistory ?? [])];
        const openIdx = history.findIndex(h => !h.to);
        if (openIdx >= 0) {
          history[openIdx] = { ...history[openIdx], to: today };
        } else if (history.length === 0) {
          history.push({
            category: p.ageCategory,
            from: p.createdAt?.slice(0, 10) ?? today,
            to: today,
          });
        }
        history.push({ category: next, from: today });

        return {
          ...p,
          ageCategory: next,
          categoryHistory: history,
          updatedAt: new Date().toISOString(),
        };
      });

      // Odvoď ageCategories z unique kategorií aktivních hráčů +
      // zachovej kategorie, které už v klubu byly (nesmažeme prázdnou kategorii
      // kterou si trenér nastavil, ale v této sezóně zatím nemá hráče).
      const activeCats = new Set<AgeCategory>(
        updatedPlayers.filter(p => p.active).map(p => p.ageCategory),
      );
      const ageCategories: AgeCategory[] = Array.from(
        new Set<AgeCategory>([...(c.ageCategories ?? []), ...activeCats]),
      );

      return { players: updatedPlayers, ageCategories };
    });
    return { movedCount };
  },

  // ─── Kategorie ────────────────────────────────────────────────────────────

  setAgeCategories: async (clubId, categories) => {
    await patchClubContent(get, set, clubId, () => ({ ageCategories: categories }));
  },
}));

