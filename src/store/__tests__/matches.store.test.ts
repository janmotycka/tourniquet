import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Firebase config module — zabrání initializeApp s prázdnými env vars v CI
vi.mock('../../firebase', () => ({
  db: {},
  auth: {},
  functions: {},
  app: {},
  googleProvider: {},
  firebaseConnected: false,
}));

// Mock firebase/functions — matches.store importuje httpsCallable pro pairing CF
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
  getFunctions: vi.fn(),
}));

// Mock Firebase service — prevent any real Firebase calls
vi.mock('../../services/match.firebase', () => ({
  saveMatchToFirebase: vi.fn().mockResolvedValue(undefined),
  deleteMatchFromFirebase: vi.fn().mockResolvedValue(undefined),
  loadMatchesFromFirebase: vi.fn().mockResolvedValue([]),
  subscribeToMatchesMultiScope: vi.fn(() => () => {}),
  deletePublicMatch: vi.fn().mockResolvedValue(undefined),
  saveMatchCatalogEntry: vi.fn().mockResolvedValue(undefined),
  deleteMatchCatalogEntry: vi.fn().mockResolvedValue(undefined),
  updateMatchActiveEditor: vi.fn().mockResolvedValue(undefined),
  writeMatchPairing: vi.fn().mockResolvedValue(undefined),
  writeMatchPairingAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../toast.store', () => ({
  useToastStore: { getState: () => ({ show: vi.fn() }) },
}));

import { useMatchesStore } from '../matches.store';
import { saveMatchToFirebase, deleteMatchFromFirebase, subscribeToMatchesMultiScope } from '../../services/match.firebase';
import type { CreateSeasonMatchInput, MatchLineupPlayer, SeasonMatch } from '../../types/match.types';

const mockSave = vi.mocked(saveMatchToFirebase);
const mockDelete = vi.mocked(deleteMatchFromFirebase);
const mockSubscribe = vi.mocked(subscribeToMatchesMultiScope);

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
    useMatchesStore.setState({ matches: [], firebaseUid: null, syncError: null, pendingSync: [], hasServerSnapshot: false });
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

  // ── Offline sync queue (pendingSync) — data-loss audit 2026-06-16 ────────────
  // Zápas zaznamenaný u hřiště bez signálu se přidá do fronty a musí se po
  // obnovení spojení / reopenu appky dosynchronizovat (pendingSync je persistovaný).

  describe('offline sync queue (pendingSync)', () => {
    beforeEach(() => {
      mockSave.mockReset();
      mockSave.mockResolvedValue(undefined); // default: sync uspěje
    });

    it('queues match into pendingSync when Firebase save fails (offline)', async () => {
      useMatchesStore.setState({ firebaseUid: 'uid1' });
      mockSave.mockRejectedValue(new Error('offline'));

      const id = createTestMatch(); // createMatch → syncMatchAndTrack (fire-and-forget)

      await vi.waitFor(() => {
        expect(useMatchesStore.getState().pendingSync).toContain(id);
      });
      expect(useMatchesStore.getState().syncError).toBeTruthy();
    });

    it('retryPendingSync flushes the queue once back online (after server snapshot)', async () => {
      useMatchesStore.setState({ firebaseUid: 'uid1', hasServerSnapshot: true });
      mockSave.mockRejectedValue(new Error('offline'));
      const id = createTestMatch();
      await vi.waitFor(() => expect(useMatchesStore.getState().pendingSync).toContain(id));

      // Spojení obnoveno — retry musí frontu vyprázdnit
      mockSave.mockResolvedValue(undefined);
      useMatchesStore.getState().retryPendingSync();

      await vi.waitFor(() => {
        expect(useMatchesStore.getState().pendingSync).not.toContain(id);
      });
      expect(useMatchesStore.getState().syncError).toBeNull();
    });

    it('retryPendingSync is GATED until first server snapshot (anti-resurrection)', async () => {
      // hasServerSnapshot=false → retry se nesmí spustit, i když je fronta plná.
      // Brání přepsání zápasu smazaného na jiném zařízení před reconciliací.
      useMatchesStore.setState({
        firebaseUid: 'uid1',
        hasServerSnapshot: false,
        pendingSync: ['m1'],
        matches: [{ id: 'm1' } as SeasonMatch],
      });
      useMatchesStore.getState().retryPendingSync();
      await new Promise(r => setTimeout(r));
      expect(mockSave).not.toHaveBeenCalled();
      expect(useMatchesStore.getState().pendingSync).toEqual(['m1']);
    });

    it('retryPendingSync is a no-op without firebaseUid (not logged in)', () => {
      useMatchesStore.setState({ firebaseUid: null, hasServerSnapshot: true, pendingSync: ['m1'] });
      useMatchesStore.getState().retryPendingSync();
      expect(mockSave).not.toHaveBeenCalled();
      expect(useMatchesStore.getState().pendingSync).toEqual(['m1']);
    });

    it('retryPendingSync skips ids no longer in matches (no resurrection of deleted)', async () => {
      useMatchesStore.setState({ firebaseUid: 'uid1', hasServerSnapshot: true, pendingSync: ['ghost'], matches: [] });
      useMatchesStore.getState().retryPendingSync();
      await new Promise(r => setTimeout(r));
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('drops match from queue on terminal permission error (no infinite retry / sticky banner)', async () => {
      useMatchesStore.setState({ firebaseUid: 'uid1' });
      mockSave.mockRejectedValue(new Error('permission_denied: write to /matches/foreign'));

      const id = createTestMatch();

      // Terminální chyba → zápas se z fronty dropne a syncError zůstane null
      await vi.waitFor(() => {
        expect(mockSave).toHaveBeenCalled();
      });
      await new Promise(r => setTimeout(r));
      expect(useMatchesStore.getState().pendingSync).not.toContain(id);
      expect(useMatchesStore.getState().syncError).toBeNull();
    });

    it('deleteMatch removes the id from pendingSync', async () => {
      useMatchesStore.setState({ firebaseUid: 'uid1' });
      mockSave.mockRejectedValue(new Error('offline'));
      const id = createTestMatch();
      await vi.waitFor(() => expect(useMatchesStore.getState().pendingSync).toContain(id));

      useMatchesStore.getState().deleteMatch(id);
      expect(useMatchesStore.getState().pendingSync).not.toContain(id);
    });

    it('setFirebaseUid(null) clears pendingSync + hasServerSnapshot on logout', () => {
      useMatchesStore.setState({ firebaseUid: 'uid1', pendingSync: ['m1', 'm2'], hasServerSnapshot: true });
      useMatchesStore.getState().setFirebaseUid(null);
      expect(useMatchesStore.getState().pendingSync).toEqual([]);
      expect(useMatchesStore.getState().hasServerSnapshot).toBe(false);
    });

    it('setFirebaseUid(differentUid) clears pendingSync on account switch', () => {
      useMatchesStore.setState({ firebaseUid: 'uid1', pendingSync: ['m1'] });
      useMatchesStore.getState().setFirebaseUid('uid2');
      expect(useMatchesStore.getState().pendingSync).toEqual([]);
    });

    it('setFirebaseUid(sameUid) preserves pendingSync (token refresh)', () => {
      useMatchesStore.setState({ firebaseUid: 'uid1', pendingSync: ['m1'] });
      useMatchesStore.getState().setFirebaseUid('uid1');
      expect(useMatchesStore.getState().pendingSync).toEqual(['m1']);
    });
  });

  // ── Realtime subscription reconciliation (data-integrity audit 2026-06-16) ────

  describe('realtime subscription reconciliation', () => {
    beforeEach(() => {
      mockSave.mockReset();
      mockSave.mockResolvedValue(undefined);
      mockDelete.mockReset();
      mockDelete.mockResolvedValue(undefined);
      mockSubscribe.mockReset();
    });

    /** Zachytí merge callback předaný subscribeToMatchesMultiScope. */
    function captureSubscription(): (matches: SeasonMatch[]) => void {
      let cb: ((m: SeasonMatch[]) => void) | null = null;
      mockSubscribe.mockImplementation((_scopes, callback) => {
        cb = callback as (m: SeasonMatch[]) => void;
        return () => {};
      });
      useMatchesStore.getState().subscribeToFirebase(['uid1']);
      if (!cb) throw new Error('subscription callback not captured');
      return cb;
    }

    it('first snapshot sets hasServerSnapshot and flushes the offline queue', async () => {
      // Local-only zápas ve frontě (server o něm neví) — po prvním snapshotu
      // se má reconciliovat a pushnout.
      const local = { id: 'local1', updatedAt: '2026-06-16T10:00:00Z' } as SeasonMatch;
      useMatchesStore.setState({ matches: [local], pendingSync: ['local1'], hasServerSnapshot: false });

      const deliver = captureSubscription();
      expect(useMatchesStore.getState().hasServerSnapshot).toBe(false); // dokud nepřijde snapshot

      deliver([]); // prázdný server → local-only zachován + retry spuštěn

      expect(useMatchesStore.getState().hasServerSnapshot).toBe(true);
      expect(useMatchesStore.getState().matches.some(m => m.id === 'local1')).toBe(true);
      await vi.waitFor(() => {
        expect(useMatchesStore.getState().pendingSync).not.toContain('local1');
      });
    });

    it('does not resurrect a locally deleted match while delete is in flight (tombstone)', async () => {
      const m = createTestMatch(); // přidá zápas do store
      useMatchesStore.setState({ firebaseUid: 'uid1', hasServerSnapshot: true });
      const deliver = captureSubscription();

      // Firebase delete necháme viset → tombstone zůstane aktivní
      mockDelete.mockReturnValue(new Promise(() => {}));
      const deleted = useMatchesStore.getState().getMatchById(m)!;
      useMatchesStore.getState().deleteMatch(m);
      expect(useMatchesStore.getState().matches.some(x => x.id === m)).toBe(false);

      // Subscription doručí STARÝ snapshot, kde zápas ještě je → nesmí ho vzkřísit
      deliver([deleted]);
      expect(useMatchesStore.getState().matches.some(x => x.id === m)).toBe(false);
    });

    it('prunes pendingSync id once its match disappears from merged state', () => {
      // Tombstonovaný zápas vypadne z merged → jeho pending ID se prune-uje.
      const m = createTestMatch();
      useMatchesStore.setState({ firebaseUid: 'uid1', hasServerSnapshot: true, pendingSync: [m] });
      const deliver = captureSubscription();

      mockDelete.mockReturnValue(new Promise(() => {})); // tombstone drží
      const snapshot = useMatchesStore.getState().getMatchById(m)!;
      useMatchesStore.getState().deleteMatch(m); // odebere z matches+pending, tombstone

      deliver([snapshot]); // server ho ještě má, ale tombstone → nezařadí, pending prune
      expect(useMatchesStore.getState().pendingSync).not.toContain(m);
    });
  });
});
