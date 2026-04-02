import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeElapsed, formatTime, computePlayingTime } from '../../components/match/match-utils';
import type { SeasonMatch } from '../../types/match.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a minimal SeasonMatch with sensible defaults */
function makeMatch(overrides: Partial<SeasonMatch> = {}): SeasonMatch {
  return {
    id: 'test-match',
    clubId: 'club1',
    opponent: 'SK Rival',
    isHome: true,
    date: '2026-04-02',
    kickoffTime: '15:00',
    competition: 'Liga',
    durationMinutes: 60,
    periods: 2,
    periodDurationMinutes: 30,
    currentPeriod: 0,
    status: 'planned',
    startedAt: null,
    pausedAt: null,
    pausedElapsed: 0,
    finishedAt: null,
    homeScore: 0,
    awayScore: 0,
    lineup: [],
    goals: [],
    substitutions: [],
    cards: [],
    ratings: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── computeElapsed ──────────────────────────────────────────────────────────

describe('computeElapsed', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 for a match that has not started', () => {
    const match = makeMatch({ startedAt: null });
    expect(computeElapsed(match)).toBe(0);
  });

  it('returns pausedElapsed when match is paused', () => {
    const match = makeMatch({
      startedAt: '2026-04-02T15:00:00.000Z',
      pausedAt: '2026-04-02T15:10:00.000Z',
      pausedElapsed: 600, // 10 minutes
    });
    expect(computeElapsed(match)).toBe(600);
  });

  it('computes elapsed time for a running match', () => {
    vi.useFakeTimers();
    const startTime = new Date('2026-04-02T15:00:00.000Z');
    vi.setSystemTime(new Date('2026-04-02T15:05:30.000Z')); // 5m30s later

    const match = makeMatch({
      startedAt: startTime.toISOString(),
      pausedAt: null,
      pausedElapsed: 0,
    });

    expect(computeElapsed(match)).toBe(330); // 5*60 + 30 = 330s
  });

  it('adds pausedElapsed to running time after resume', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T15:35:00.000Z')); // 5 min after resume

    const match = makeMatch({
      startedAt: '2026-04-02T15:30:00.000Z', // resumed at 15:30
      pausedAt: null,
      pausedElapsed: 1800, // 30 min accumulated before pause
    });

    // 1800 (from before) + 300 (5 min since resume) = 2100
    expect(computeElapsed(match)).toBe(2100);
  });
});

// ─── formatTime ──────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats seconds under a minute with leading zeros', () => {
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(59)).toBe('00:59');
  });

  it('formats exact minutes correctly', () => {
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(600)).toBe('10:00');
  });

  it('formats mixed minutes and seconds', () => {
    expect(formatTime(90)).toBe('01:30');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('formats large values (no hour wrap)', () => {
    expect(formatTime(5400)).toBe('90:00'); // 90 minutes
  });
});

// ─── computePlayingTime ──────────────────────────────────────────────────────

describe('computePlayingTime', () => {
  it('returns full time for starters with no substitutions', () => {
    const match = makeMatch({
      lineup: [
        { playerId: 'p1', jerseyNumber: 7, name: 'A', isStarter: true, substituteOrder: 0 },
        { playerId: 'p2', jerseyNumber: 9, name: 'B', isStarter: true, substituteOrder: 0 },
      ],
      substitutions: [],
    });

    const result = computePlayingTime(match, 60);
    expect(result.get('p1')).toBe(60);
    expect(result.get('p2')).toBe(60);
  });

  it('returns 0 for bench players who never entered', () => {
    const match = makeMatch({
      lineup: [
        { playerId: 'p1', jerseyNumber: 7, name: 'A', isStarter: true, substituteOrder: 0 },
        { playerId: 'p3', jerseyNumber: 11, name: 'C', isStarter: false, substituteOrder: 1 },
      ],
      substitutions: [],
    });

    const result = computePlayingTime(match, 60);
    expect(result.get('p1')).toBe(60);
    expect(result.has('p3')).toBe(false); // never entered, not in map
  });

  it('computes time correctly after a substitution', () => {
    const match = makeMatch({
      lineup: [
        { playerId: 'p1', jerseyNumber: 7, name: 'A', isStarter: true, substituteOrder: 0 },
        { playerId: 'p3', jerseyNumber: 11, name: 'C', isStarter: false, substituteOrder: 1 },
      ],
      substitutions: [
        { id: 's1', minute: 30, playerOutId: 'p1', playerInId: 'p3', recordedAt: '' },
      ],
    });

    const result = computePlayingTime(match, 60);
    expect(result.get('p1')).toBe(30); // played 0–30
    expect(result.get('p3')).toBe(30); // played 30–60
  });

  it('handles multiple substitutions for the same position', () => {
    const match = makeMatch({
      lineup: [
        { playerId: 'p1', jerseyNumber: 7, name: 'A', isStarter: true, substituteOrder: 0 },
        { playerId: 'p2', jerseyNumber: 9, name: 'B', isStarter: false, substituteOrder: 1 },
        { playerId: 'p3', jerseyNumber: 11, name: 'C', isStarter: false, substituteOrder: 2 },
      ],
      substitutions: [
        { id: 's1', minute: 20, playerOutId: 'p1', playerInId: 'p2', recordedAt: '' },
        { id: 's2', minute: 40, playerOutId: 'p2', playerInId: 'p3', recordedAt: '' },
      ],
    });

    const result = computePlayingTime(match, 60);
    expect(result.get('p1')).toBe(20); // played 0–20
    expect(result.get('p2')).toBe(20); // played 20–40
    expect(result.get('p3')).toBe(20); // played 40–60
  });
});
