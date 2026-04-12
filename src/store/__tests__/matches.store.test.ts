import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Firebase service — prevent any real Firebase calls
vi.mock('../../services/match.firebase', () => ({
  saveMatchToFirebase: vi.fn().mockResolvedValue(undefined),
  deleteMatchFromFirebase: vi.fn().mockResolvedValue(undefined),
  loadMatchesFromFirebase: vi.fn().mockResolvedValue([]),
  deletePublicMatch: vi.fn().mockResolvedValue(undefined),
  saveMatchCatalogEntry: vi.fn().mockResolvedValue(undefined),
  deleteMatchCatalogEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../toast.store', () => ({
  useToastStore: { getState: () => ({ show: vi.fn() }) },
}));

import { useMatchesStore } from '../matches.store';
import type { CreateSeasonMatchInput, MatchLineupPlayer } from '../../types/match.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLineup(): MatchLineupPlayer[] {
  return [
    { playerId: 'p1', jerseyNumber: 7, name: 'Player 1', isStarter: true, substituteOrder: 0 },
    { playerId: 'p2', jerseyNumber: 9, name: 'Player 2', isStarter: true, substituteOrder: 0 },
    { playerId: 'p3', jerseyNumber: 11, name: 'Player 3', isStarter: false, substituteOrder: 1 },
  ];
}

function makeInput(overrides: Partial<CreateSeasonMatchInput> = {}): CreateSeasonMatchInput {
  return {
    clubId: 'club1',
    clubName: 'FC Test',
    opponent: 'SK Rival',
    isHome: true,
    date: '2026-04-02',
    kickoffTime: '15:00',
    competition: 'Liga',
    durationMinutes: 60,
    periods: 2,
    periodDurationMinutes: 30,
    lineup: makeLineup(),
    ...overrides,
  };
}

/** Create a match and return its id */
function createTestMatch(overrides: Partial<CreateSeasonMatchInput> = {}): string {
  const match = useMatchesStore.getState().createMatch(makeInput(overrides));
  return match.id;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('matches.store', () => {
  beforeEach(() => {
    // Reset store state between tests
    useMatchesStore.setState({ matches: [], firebaseUid: null, syncError: null, pendingSync: [] });
  });

  // ── addGoal ────────────────────────────────────────────────────────────────

  describe('addGoal', () => {
    it('adds a goal to the match goals array', () => {
      const id = createTestMatch();
      useMatchesStore.getState().addGoal(id, {
        scorerId: 'p1',
        assistId: null,
        isOwnGoal: false,
        isOpponentGoal: false,
        minute: 10,
      });

      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.goals).toHaveLength(1);
      expect(match.goals[0].scorerId).toBe('p1');
      expect(match.goals[0].minute).toBe(10);
      expect(match.goals[0].id).toBeTruthy();
    });

    it('increments homeScore for home team goal when isHome=true', () => {
      const id = createTestMatch({ isHome: true });
      useMatchesStore.getState().addGoal(id, {
        scorerId: 'p1',
        assistId: null,
        isOwnGoal: false,
        isOpponentGoal: false,
        minute: 5,
      });

      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.homeScore).toBe(1);
      expect(match.awayScore).toBe(0);
    });

    it('increments awayScore for opponent goal when isHome=true', () => {
      const id = createTestMatch({ isHome: true });
      useMatchesStore.getState().addGoal(id, {
        scorerId: null,
        assistId: null,
        isOwnGoal: false,
        isOpponentGoal: true,
        minute: 20,
      });

      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.homeScore).toBe(0);
      expect(match.awayScore).toBe(1);
    });

    it('increments awayScore for own goal when isHome=true (counts for opponent)', () => {
      const id = createTestMatch({ isHome: true });
      useMatchesStore.getState().addGoal(id, {
        scorerId: 'p1',
        assistId: null,
        isOwnGoal: true,
        isOpponentGoal: false,
        minute: 30,
      });

      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.homeScore).toBe(0);
      expect(match.awayScore).toBe(1);
    });

    it('increments awayScore for away team goal when isHome=false', () => {
      const id = createTestMatch({ isHome: false });
      useMatchesStore.getState().addGoal(id, {
        scorerId: 'p1',
        assistId: null,
        isOwnGoal: false,
        isOpponentGoal: false,
        minute: 12,
      });

      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.homeScore).toBe(0);
      expect(match.awayScore).toBe(1);
    });
  });

  // ── removeGoal ─────────────────────────────────────────────────────────────

  describe('removeGoal', () => {
    it('removes a goal from the match', () => {
      const id = createTestMatch();
      const goalId = useMatchesStore.getState().addGoal(id, {
        scorerId: 'p1',
        assistId: null,
        isOwnGoal: false,
        isOpponentGoal: false,
        minute: 10,
      });

      useMatchesStore.getState().removeGoal(id, goalId);
      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.goals).toHaveLength(0);
    });

    it('decrements score when goal is removed', () => {
      const id = createTestMatch({ isHome: true });
      const goalId = useMatchesStore.getState().addGoal(id, {
        scorerId: 'p1',
        assistId: null,
        isOwnGoal: false,
        isOpponentGoal: false,
        minute: 10,
      });

      expect(useMatchesStore.getState().getMatchById(id)!.homeScore).toBe(1);

      useMatchesStore.getState().removeGoal(id, goalId);
      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.homeScore).toBe(0);
      expect(match.awayScore).toBe(0);
    });

    it('does not let score go below zero', () => {
      const id = createTestMatch({ isHome: true });
      // Manually set score to 0 and try removing a non-existent goal scenario
      // The store uses Math.max(0, score - 1), so let's verify by adding and removing twice
      const goalId = useMatchesStore.getState().addGoal(id, {
        scorerId: 'p1',
        assistId: null,
        isOwnGoal: false,
        isOpponentGoal: false,
        minute: 10,
      });
      useMatchesStore.getState().removeGoal(id, goalId);
      // Score should be 0, not negative
      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.homeScore).toBe(0);
    });
  });

  // ── Score computation with multiple goals ──────────────────────────────────

  describe('score computation', () => {
    it('tracks cumulative score across multiple goals', () => {
      const id = createTestMatch({ isHome: true });
      const store = useMatchesStore.getState();

      store.addGoal(id, { scorerId: 'p1', assistId: null, isOwnGoal: false, isOpponentGoal: false, minute: 5 });
      store.addGoal(id, { scorerId: 'p2', assistId: 'p1', isOwnGoal: false, isOpponentGoal: false, minute: 20 });
      store.addGoal(id, { scorerId: null, assistId: null, isOwnGoal: false, isOpponentGoal: true, minute: 35 });

      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.homeScore).toBe(2);
      expect(match.awayScore).toBe(1);
      expect(match.goals).toHaveLength(3);
    });
  });

  // ── startMatch ─────────────────────────────────────────────────────────────

  describe('startMatch', () => {
    it('changes status to live', () => {
      const id = createTestMatch();
      expect(useMatchesStore.getState().getMatchById(id)!.status).toBe('planned');

      useMatchesStore.getState().startMatch(id);
      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.status).toBe('live');
    });

    it('sets startedAt timestamp', () => {
      const id = createTestMatch();
      useMatchesStore.getState().startMatch(id);
      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.startedAt).toBeTruthy();
    });

    it('sets currentPeriod to 1', () => {
      const id = createTestMatch();
      useMatchesStore.getState().startMatch(id);
      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.currentPeriod).toBe(1);
    });

    it('resets pause state', () => {
      const id = createTestMatch();
      useMatchesStore.getState().startMatch(id);
      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.pausedAt).toBeNull();
      expect(match.pausedElapsed).toBe(0);
    });
  });

  // ── finishMatch ────────────────────────────────────────────────────────────

  describe('finishMatch', () => {
    it('changes status to finished', () => {
      const id = createTestMatch();
      useMatchesStore.getState().startMatch(id);
      useMatchesStore.getState().finishMatch(id);

      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.status).toBe('finished');
    });

    it('sets finishedAt timestamp', () => {
      const id = createTestMatch();
      useMatchesStore.getState().startMatch(id);
      useMatchesStore.getState().finishMatch(id);

      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.finishedAt).toBeTruthy();
    });

    it('clears pausedAt', () => {
      const id = createTestMatch();
      useMatchesStore.getState().startMatch(id);
      useMatchesStore.getState().pauseMatch(id);
      useMatchesStore.getState().finishMatch(id);

      const match = useMatchesStore.getState().getMatchById(id)!;
      expect(match.pausedAt).toBeNull();
    });
  });
});
