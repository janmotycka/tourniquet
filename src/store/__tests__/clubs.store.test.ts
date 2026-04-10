/**
 * Tests pro clubs.store — unified Shared Clubs model.
 *
 * Ověřuje:
 * - createClub volá Cloud Function a aktualizuje state
 * - addPlayer / updatePlayer / removePlayer mutují local state
 *   a volají updateSharedClub (shared Firebase write)
 * - movePlayerToCategory uzavírá otevřený history interval a otevírá nový
 * - deleteClub volá leaveClub CF a odstraní z local state
 *
 * Všechny Firebase volání jsou mockované — žádné reálné síťové volání.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SharedClub } from '../../types/club.types';

// ─── Mocks (hoisted — vi.mock factory runs before imports) ─────────────────

const { mockSharedClubCalls, mockClubFunctions } = vi.hoisted(() => ({
  mockSharedClubCalls: {
    loadMemberOfClubs: vi.fn(),
    loadAllSharedClubsForUser: vi.fn(),
    loadActiveClubId: vi.fn(),
    setActiveClubId: vi.fn().mockResolvedValue(undefined),
    subscribeToMemberOfClubs: vi.fn(() => () => {}),
    loadSharedClub: vi.fn(),
    updateSharedClub: vi.fn().mockResolvedValue(undefined),
  },
  mockClubFunctions: {
    createPersonalClub: vi.fn(),
    leaveClub: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../services/shared-club.firebase', () => mockSharedClubCalls);
vi.mock('../../services/club-functions', () => mockClubFunctions);

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../utils/id', () => ({
  generateId: (() => {
    let n = 0;
    return () => `id-${++n}`;
  })(),
}));

// Import AFTER mocks
import { useClubsStore } from '../clubs.store';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeSharedClub(overrides: Partial<SharedClub> = {}): SharedClub {
  return {
    id: 'club-1',
    name: 'FC Test',
    color: '#2E7D32',
    logoBase64: null,
    defaultPlayers: [],
    players: [],
    ageCategories: ['U10'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ownership: 'personal',
    createdBy: 'user-1',
    members: {
      'user-1': { role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
    },
    ...overrides,
  };
}

function resetStore() {
  useClubsStore.setState({
    clubs: [],
    firebaseUid: null,
    memberOfClubs: {},
    activeClubId: null,
    _memberOfClubsUnsub: null,
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('clubs.store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    // Default mock return values
    mockSharedClubCalls.loadMemberOfClubs.mockResolvedValue({});
    mockSharedClubCalls.loadAllSharedClubsForUser.mockResolvedValue([]);
    mockSharedClubCalls.loadActiveClubId.mockResolvedValue(null);
  });

  describe('loadFromFirebase', () => {
    it('loads shared clubs and auto-selects first one when no activeClubId', async () => {
      const club = makeSharedClub();
      mockSharedClubCalls.loadMemberOfClubs.mockResolvedValue({ 'club-1': 'owner' });
      mockSharedClubCalls.loadAllSharedClubsForUser.mockResolvedValue([club]);

      await useClubsStore.getState().loadFromFirebase('user-1');

      const state = useClubsStore.getState();
      expect(state.clubs).toHaveLength(1);
      expect(state.clubs[0].id).toBe('club-1');
      expect(state.activeClubId).toBe('club-1');
      expect(state.memberOfClubs['club-1']).toBe('owner');
    });

    it('preserves saved activeClubId if set', async () => {
      const clubs = [makeSharedClub({ id: 'club-a' }), makeSharedClub({ id: 'club-b' })];
      mockSharedClubCalls.loadAllSharedClubsForUser.mockResolvedValue(clubs);
      mockSharedClubCalls.loadActiveClubId.mockResolvedValue('club-b');

      await useClubsStore.getState().loadFromFirebase('user-1');

      expect(useClubsStore.getState().activeClubId).toBe('club-b');
    });
  });

  describe('createClub', () => {
    it('calls createPersonalClub CF and refreshes state', async () => {
      useClubsStore.setState({ firebaseUid: 'user-1' });
      const newClub = makeSharedClub({ id: 'new-club', name: 'New' });
      mockClubFunctions.createPersonalClub.mockResolvedValue({ success: true, clubId: 'new-club' });
      mockSharedClubCalls.loadSharedClub.mockResolvedValue(newClub);
      mockSharedClubCalls.loadMemberOfClubs.mockResolvedValue({ 'new-club': 'owner' });
      mockSharedClubCalls.loadAllSharedClubsForUser.mockResolvedValue([newClub]);

      const created = await useClubsStore.getState().createClub({
        name: 'New',
        color: '#1565C0',
      });

      expect(mockClubFunctions.createPersonalClub).toHaveBeenCalledWith({
        name: 'New',
        color: '#1565C0',
        logoBase64: null,
      });
      expect(created.id).toBe('new-club');
      expect(useClubsStore.getState().clubs).toHaveLength(1);
      expect(useClubsStore.getState().activeClubId).toBe('new-club');
    });

    it('throws when not authenticated', async () => {
      await expect(
        useClubsStore.getState().createClub({ name: 'X', color: '#000' }),
      ).rejects.toThrow('Not authenticated');
    });

    it('applies initial ageCategories via updateSharedClub', async () => {
      useClubsStore.setState({ firebaseUid: 'user-1' });
      const newClub = makeSharedClub({ id: 'c', ageCategories: [] });
      mockClubFunctions.createPersonalClub.mockResolvedValue({ success: true, clubId: 'c' });
      mockSharedClubCalls.loadSharedClub.mockResolvedValue(newClub);
      mockSharedClubCalls.loadAllSharedClubsForUser.mockResolvedValue([newClub]);

      await useClubsStore.getState().createClub({
        name: 'X',
        color: '#000',
        ageCategories: ['U11', 'U13'],
      });

      expect(mockSharedClubCalls.updateSharedClub).toHaveBeenCalledWith('c', {
        ageCategories: ['U11', 'U13'],
      });
    });
  });

  describe('addPlayer', () => {
    it('appends player to local state and calls updateSharedClub', async () => {
      const club = makeSharedClub({ id: 'c1' });
      useClubsStore.setState({ clubs: [club] });

      await useClubsStore.getState().addPlayer('c1', {
        name: 'Jan Novák',
        jerseyNumber: 10,
        birthYear: 2015,
        ageCategory: 'U11',
        active: true,
      });

      const updated = useClubsStore.getState().clubs[0];
      expect(updated.players).toHaveLength(1);
      expect(updated.players[0].name).toBe('Jan Novák');
      expect(mockSharedClubCalls.updateSharedClub).toHaveBeenCalled();
      const [, patch] = mockSharedClubCalls.updateSharedClub.mock.calls[0];
      expect(patch.players).toHaveLength(1);
    });
  });

  describe('removePlayer', () => {
    it('removes player by id', async () => {
      const club = makeSharedClub({
        id: 'c1',
        players: [
          { id: 'p1', name: 'A', jerseyNumber: 1, birthYear: null, ageCategory: 'U11', active: true },
          { id: 'p2', name: 'B', jerseyNumber: 2, birthYear: null, ageCategory: 'U11', active: true },
        ],
      });
      useClubsStore.setState({ clubs: [club] });

      await useClubsStore.getState().removePlayer('c1', 'p1');

      const updated = useClubsStore.getState().clubs[0];
      expect(updated.players).toHaveLength(1);
      expect(updated.players[0].id).toBe('p2');
    });
  });

  describe('movePlayerToCategory', () => {
    it('opens new interval and closes previous one', async () => {
      const club = makeSharedClub({
        id: 'c1',
        ageCategories: ['U10'],
        players: [{
          id: 'p1',
          name: 'A',
          jerseyNumber: 1,
          birthYear: null,
          ageCategory: 'U10',
          active: true,
          createdAt: '2025-09-01T00:00:00.000Z',
        }],
      });
      useClubsStore.setState({ clubs: [club] });

      await useClubsStore.getState().movePlayerToCategory('c1', 'p1', 'U11');

      const player = useClubsStore.getState().clubs[0].players[0];
      expect(player.ageCategory).toBe('U11');
      expect(player.categoryHistory).toHaveLength(2);
      // Předchozí interval uzavřený
      expect(player.categoryHistory![0].category).toBe('U10');
      expect(player.categoryHistory![0].to).toBeTruthy();
      // Nový interval otevřený
      expect(player.categoryHistory![1].category).toBe('U11');
      expect(player.categoryHistory![1].to).toBeUndefined();
    });

    it('adds new category to ageCategories if missing', async () => {
      const club = makeSharedClub({
        id: 'c1',
        ageCategories: ['U10'],
        players: [{
          id: 'p1',
          name: 'A',
          jerseyNumber: 1,
          birthYear: null,
          ageCategory: 'U10',
          active: true,
        }],
      });
      useClubsStore.setState({ clubs: [club] });

      await useClubsStore.getState().movePlayerToCategory('c1', 'p1', 'U12');

      const updated = useClubsStore.getState().clubs[0];
      expect(updated.ageCategories).toContain('U12');
    });
  });

  describe('deleteClub', () => {
    it('calls leaveClub CF and removes from local state', async () => {
      const club = makeSharedClub({ id: 'c1' });
      useClubsStore.setState({ clubs: [club], activeClubId: 'c1', firebaseUid: 'user-1' });

      await useClubsStore.getState().deleteClub('c1');

      expect(mockClubFunctions.leaveClub).toHaveBeenCalledWith('c1');
      expect(useClubsStore.getState().clubs).toHaveLength(0);
      expect(useClubsStore.getState().activeClubId).toBeNull();
    });
  });

  describe('getMyRoleInClub', () => {
    it('returns role from memberOfClubs map', () => {
      useClubsStore.setState({
        memberOfClubs: { 'c1': 'owner', 'c2': 'coach' },
      });

      expect(useClubsStore.getState().getMyRoleInClub('c1')).toBe('owner');
      expect(useClubsStore.getState().getMyRoleInClub('c2')).toBe('coach');
      expect(useClubsStore.getState().getMyRoleInClub('c3')).toBeNull();
    });
  });

  describe('setAgeCategories', () => {
    it('updates ageCategories and calls updateSharedClub', async () => {
      const club = makeSharedClub({ id: 'c1', ageCategories: ['U10'] });
      useClubsStore.setState({ clubs: [club] });

      await useClubsStore.getState().setAgeCategories('c1', ['U11', 'U13']);

      expect(useClubsStore.getState().clubs[0].ageCategories).toEqual(['U11', 'U13']);
      expect(mockSharedClubCalls.updateSharedClub).toHaveBeenCalled();
    });
  });
});
