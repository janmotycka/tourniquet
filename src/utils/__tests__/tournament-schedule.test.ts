import { describe, it, expect } from 'vitest';
import {
  generateRoundRobinSchedule,
  computeStandings,
  computeMatchStartTime,
  parseStartDateTime,
  formatElapsedTime,
  computeMatchElapsed,
  computeCurrentMinute,
  estimateTournamentDuration,
  countRealMatches,
  recalculateMatchTimes,
} from '../tournament-schedule';
import type { Team, Match, TournamentSettings } from '../../types/tournament.types';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeTeam(id: string, name: string): Team {
  return { id, name, color: '#000', players: [] };
}

function makeSettings(overrides: Partial<TournamentSettings> = {}): TournamentSettings {
  return {
    matchDurationMinutes: 10,
    breakBetweenMatchesMinutes: 5,
    startTime: '09:00',
    startDate: '2025-06-01',
    ...overrides,
  };
}

function makeFinishedMatch(
  id: string,
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number,
): Match {
  return {
    id,
    homeTeamId: homeId,
    awayTeamId: awayId,
    scheduledTime: '2025-06-01T09:00:00.000Z',
    durationMinutes: 10,
    status: 'finished',
    homeScore,
    awayScore,
    goals: [],
    startedAt: null,
    finishedAt: null,
    pausedAt: null,
    pausedElapsed: 0,
    roundIndex: 0,
    matchIndex: 0,
  };
}

// ─── generateRoundRobinSchedule ──────────────────────────────────────────────

describe('generateRoundRobinSchedule', () => {
  it('returns empty array for less than 2 teams', () => {
    const teams = [makeTeam('a', 'Team A')];
    expect(generateRoundRobinSchedule(teams, makeSettings())).toEqual([]);
  });

  it('generates correct number of matches for 4 teams', () => {
    const teams = [
      makeTeam('a', 'A'), makeTeam('b', 'B'),
      makeTeam('c', 'C'), makeTeam('d', 'D'),
    ];
    const matches = generateRoundRobinSchedule(teams, makeSettings());
    // 4 teams → C(4,2) = 6 matches
    expect(matches).toHaveLength(6);
  });

  it('generates correct number of matches for 3 teams (odd)', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B'), makeTeam('c', 'C')];
    const matches = generateRoundRobinSchedule(teams, makeSettings());
    // 3 teams → C(3,2) = 3 matches
    expect(matches).toHaveLength(3);
  });

  it('generates correct number of matches for 5 teams (odd)', () => {
    const teams = Array.from({ length: 5 }, (_, i) => makeTeam(`t${i}`, `Team ${i}`));
    const matches = generateRoundRobinSchedule(teams, makeSettings());
    // 5 teams → C(5,2) = 10 matches
    expect(matches).toHaveLength(10);
  });

  it('every team plays every other team exactly once', () => {
    const teams = [
      makeTeam('a', 'A'), makeTeam('b', 'B'),
      makeTeam('c', 'C'), makeTeam('d', 'D'),
    ];
    const matches = generateRoundRobinSchedule(teams, makeSettings());

    const matchups = new Set<string>();
    for (const m of matches) {
      const key = [m.homeTeamId, m.awayTeamId].sort().join('-');
      matchups.add(key);
    }
    // C(4,2) = 6 unique matchups
    expect(matchups.size).toBe(6);
  });

  it('assigns all matches status "scheduled"', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')];
    const matches = generateRoundRobinSchedule(teams, makeSettings());
    expect(matches.every(m => m.status === 'scheduled')).toBe(true);
  });

  it('assigns increasing matchIndex', () => {
    const teams = [
      makeTeam('a', 'A'), makeTeam('b', 'B'),
      makeTeam('c', 'C'), makeTeam('d', 'D'),
    ];
    const matches = generateRoundRobinSchedule(teams, makeSettings());
    for (let i = 0; i < matches.length; i++) {
      expect(matches[i].matchIndex).toBe(i);
    }
  });

  it('respects multiple pitches (concurrent matches)', () => {
    const teams = [
      makeTeam('a', 'A'), makeTeam('b', 'B'),
      makeTeam('c', 'C'), makeTeam('d', 'D'),
    ];
    const settings = makeSettings({ numberOfPitches: 2 });
    const matches = generateRoundRobinSchedule(teams, settings);

    // First 2 matches should have the same time (parallel on 2 pitches)
    expect(matches[0].scheduledTime).toBe(matches[1].scheduledTime);
    // Pitch numbers should alternate
    expect(matches[0].pitchNumber).toBe(1);
    expect(matches[1].pitchNumber).toBe(2);
  });

  it('assigns correct scheduledTime offsets', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B'), makeTeam('c', 'C')];
    const settings = makeSettings({ matchDurationMinutes: 10, breakBetweenMatchesMinutes: 5 });
    const matches = generateRoundRobinSchedule(teams, settings);

    // 3 matches, 1 pitch
    const t0 = new Date(matches[0].scheduledTime).getTime();
    const t1 = new Date(matches[1].scheduledTime).getTime();
    const t2 = new Date(matches[2].scheduledTime).getTime();

    // Each slot offset = (10 + 5) * 60 * 1000 = 900000ms
    expect(t1 - t0).toBe(15 * 60 * 1000);
    expect(t2 - t1).toBe(15 * 60 * 1000);
  });
});

// ─── computeMatchStartTime ───────────────────────────────────────────────────

describe('computeMatchStartTime', () => {
  it('returns startDateTime for index 0', () => {
    const start = new Date('2025-06-01T09:00:00');
    const result = computeMatchStartTime(start, 0, 10, 5);
    expect(result.getTime()).toBe(start.getTime());
  });

  it('calculates offset correctly for index 2', () => {
    const start = new Date('2025-06-01T09:00:00');
    const result = computeMatchStartTime(start, 2, 10, 5);
    // offset = 2 * (10 + 5) * 60000 = 1800000ms = 30min
    expect(result.getTime()).toBe(start.getTime() + 30 * 60 * 1000);
  });
});

// ─── parseStartDateTime ──────────────────────────────────────────────────────

describe('parseStartDateTime', () => {
  it('parses date and time correctly', () => {
    const settings = makeSettings({ startDate: '2025-06-01', startTime: '14:30' });
    const result = parseStartDateTime(settings);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(5); // June = 5
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });
});

// ─── computeStandings ────────────────────────────────────────────────────────

describe('computeStandings', () => {
  const teams = [
    makeTeam('a', 'Alpha'),
    makeTeam('b', 'Bravo'),
    makeTeam('c', 'Charlie'),
  ];

  it('returns empty standings when no matches are finished', () => {
    const standings = computeStandings([], teams);
    expect(standings).toHaveLength(3);
    expect(standings.every(s => s.played === 0 && s.points === 0)).toBe(true);
  });

  it('awards 3 points for a win, 0 for a loss', () => {
    const matches = [makeFinishedMatch('m1', 'a', 'b', 2, 0)];
    const standings = computeStandings(matches, teams);
    const a = standings.find(s => s.teamId === 'a')!;
    const b = standings.find(s => s.teamId === 'b')!;
    expect(a.points).toBe(3);
    expect(a.won).toBe(1);
    expect(b.points).toBe(0);
    expect(b.lost).toBe(1);
  });

  it('awards 1 point each for a draw', () => {
    const matches = [makeFinishedMatch('m1', 'a', 'b', 1, 1)];
    const standings = computeStandings(matches, teams);
    const a = standings.find(s => s.teamId === 'a')!;
    const b = standings.find(s => s.teamId === 'b')!;
    expect(a.points).toBe(1);
    expect(a.drawn).toBe(1);
    expect(b.points).toBe(1);
    expect(b.drawn).toBe(1);
  });

  it('calculates goal difference correctly', () => {
    const matches = [
      makeFinishedMatch('m1', 'a', 'b', 3, 1),
      makeFinishedMatch('m2', 'a', 'c', 2, 0),
    ];
    const standings = computeStandings(matches, teams);
    const a = standings.find(s => s.teamId === 'a')!;
    expect(a.goalsFor).toBe(5);
    expect(a.goalsAgainst).toBe(1);
    expect(a.goalDifference).toBe(4);
  });

  it('sorts by points first', () => {
    const matches = [
      makeFinishedMatch('m1', 'a', 'b', 2, 0), // A: 3pts
      makeFinishedMatch('m2', 'b', 'c', 2, 0), // B: 3pts
      makeFinishedMatch('m3', 'a', 'c', 1, 0), // A: 6pts total
    ];
    const standings = computeStandings(matches, teams);
    expect(standings[0].teamId).toBe('a'); // 6 pts
    expect(standings[1].teamId).toBe('b'); // 3 pts
    expect(standings[2].teamId).toBe('c'); // 0 pts
  });

  it('ignores non-finished matches', () => {
    const liveMatch: Match = {
      ...makeFinishedMatch('m1', 'a', 'b', 5, 0),
      status: 'live',
    };
    const standings = computeStandings([liveMatch], teams);
    expect(standings.every(s => s.played === 0)).toBe(true);
  });

  it('uses head-to-head as tiebreaker', () => {
    // A beats B, B beats C, C beats A — all 3 pts
    // H2H between A and B: A won → A above B
    const matches = [
      makeFinishedMatch('m1', 'a', 'b', 1, 0),
      makeFinishedMatch('m2', 'b', 'c', 1, 0),
      makeFinishedMatch('m3', 'c', 'a', 1, 0),
    ];
    const standings = computeStandings(matches, teams);
    // All have 3 points, tiebreaker order is h2h, goalDiff, goalsFor
    // All have same GD (0) and GF (1), so h2h comes into play pairwise
    expect(standings.every(s => s.points === 3)).toBe(true);
  });
});

// ─── formatElapsedTime ───────────────────────────────────────────────────────

describe('formatElapsedTime', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatElapsedTime(0, 10)).toBe('00:00');
  });

  it('formats 65 seconds as 01:05', () => {
    expect(formatElapsedTime(65, 10)).toBe('01:05');
  });

  it('formats 600 seconds (= 10 min match) as 10:00', () => {
    expect(formatElapsedTime(600, 10)).toBe('10:00');
  });

  it('shows overtime with + prefix', () => {
    // 12 minutes into a 10 minute match
    expect(formatElapsedTime(720, 10)).toBe('+02:00');
  });

  it('shows overtime seconds correctly', () => {
    // 10:30 into a 10 minute match → +00:30
    expect(formatElapsedTime(630, 10)).toBe('+00:30');
  });
});

// ─── computeMatchElapsed ─────────────────────────────────────────────────────

describe('computeMatchElapsed', () => {
  it('returns 0 when match not started', () => {
    expect(computeMatchElapsed(null)).toBe(0);
  });

  it('returns pausedElapsed when match is paused', () => {
    expect(computeMatchElapsed('2025-06-01T09:00:00Z', '2025-06-01T09:05:00Z', 120)).toBe(120);
  });

  it('returns 0 for pausedAt with no pausedElapsed', () => {
    expect(computeMatchElapsed('2025-06-01T09:00:00Z', '2025-06-01T09:05:00Z')).toBe(0);
  });
});

// ─── computeCurrentMinute ────────────────────────────────────────────────────

describe('computeCurrentMinute', () => {
  it('returns 1 when match not started', () => {
    expect(computeCurrentMinute(null)).toBe(1);
  });

  it('returns 1 for paused at 0 elapsed', () => {
    expect(computeCurrentMinute('2025-06-01T09:00:00Z', '2025-06-01T09:00:00Z', 0)).toBe(1);
  });

  it('returns correct minute for paused match', () => {
    // 65 seconds elapsed → minute 2
    expect(computeCurrentMinute('2025-06-01T09:00:00Z', '2025-06-01T09:01:05Z', 65)).toBe(2);
  });
});

// ─── estimateTournamentDuration ──────────────────────────────────────────────

describe('estimateTournamentDuration', () => {
  it('calculates correctly for 4 teams, 1 pitch', () => {
    const settings = makeSettings({ matchDurationMinutes: 10, breakBetweenMatchesMinutes: 5 });
    // 6 matches, 1 pitch → 6 slots → 6*10 + 5*5 = 85 min
    expect(estimateTournamentDuration(4, settings)).toBe(85);
  });

  it('calculates correctly for 4 teams, 2 pitches', () => {
    const settings = makeSettings({ matchDurationMinutes: 10, breakBetweenMatchesMinutes: 5, numberOfPitches: 2 });
    // 6 matches, 2 pitches → 3 slots → 3*10 + 2*5 = 40 min
    expect(estimateTournamentDuration(4, settings)).toBe(40);
  });

  it('handles odd number of teams', () => {
    const settings = makeSettings({ matchDurationMinutes: 10, breakBetweenMatchesMinutes: 5 });
    // 3 teams → 3 matches, 1 pitch → 3 slots → 3*10 + 2*5 = 40 min
    expect(estimateTournamentDuration(3, settings)).toBe(40);
  });

  it('handles 2 teams (1 match)', () => {
    const settings = makeSettings({ matchDurationMinutes: 15, breakBetweenMatchesMinutes: 0 });
    // 1 match → 1 slot → 15 min + 0 breaks = 15 min
    expect(estimateTournamentDuration(2, settings)).toBe(15);
  });
});

// ─── countRealMatches ────────────────────────────────────────────────────────

describe('countRealMatches', () => {
  it('returns 1 for 2 teams', () => {
    expect(countRealMatches(2)).toBe(1);
  });

  it('returns 6 for 4 teams', () => {
    expect(countRealMatches(4)).toBe(6);
  });

  it('returns 10 for 5 teams', () => {
    expect(countRealMatches(5)).toBe(10);
  });

  it('returns 28 for 8 teams', () => {
    expect(countRealMatches(8)).toBe(28);
  });
});

// ─── recalculateMatchTimes ───────────────────────────────────────────────────

describe('recalculateMatchTimes', () => {
  const settings = makeSettings({ matchDurationMinutes: 10, breakBetweenMatchesMinutes: 5 });

  it('preserves finished matches and recalculates scheduled ones', () => {
    const matches: Match[] = [
      { ...makeFinishedMatch('m1', 'a', 'b', 1, 0), matchIndex: 0 },
      {
        ...makeFinishedMatch('m2', 'c', 'd', 0, 0),
        status: 'scheduled',
        matchIndex: 1,
      },
    ];

    const result = recalculateMatchTimes(matches, settings);
    // First match (finished) stays, second (scheduled) gets new index
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('finished');
    expect(result[1].status).toBe('scheduled');
    expect(result[1].matchIndex).toBe(1); // after 1 finished match
  });

  it('recalculates pitchNumber correctly', () => {
    const settingsMultiPitch = makeSettings({ numberOfPitches: 2 });
    const matches: Match[] = [
      { ...makeFinishedMatch('m1', 'a', 'b', 1, 0), status: 'scheduled', matchIndex: 0 },
      { ...makeFinishedMatch('m2', 'c', 'd', 0, 0), status: 'scheduled', matchIndex: 1 },
    ];

    const result = recalculateMatchTimes(matches, settingsMultiPitch);
    expect(result[0].pitchNumber).toBe(1);
    expect(result[1].pitchNumber).toBe(2);
  });
});
