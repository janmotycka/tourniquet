import { describe, it, expect } from 'vitest';
import { computePlayerStats } from '../player-stats';
import type { SeasonMatch, TennisSubMatch } from '../../../../types/match.types';

function buildMatch(opts: {
  id?: string;
  date: string;
  isHome: boolean;
  sets: Array<[number, number]>;
  retired?: boolean;
  manualWinner?: 'home' | 'away' | null;
}): SeasonMatch {
  const sub: TennisSubMatch = {
    id: 's',
    type: 'singles',
    order: 1,
    homePlayerIds: ['p1'],
    awayPlayerName: 'Opponent',
    sets: opts.sets.map(([h, a]) => ({ home: h, away: a })),
    winner: opts.manualWinner ?? null,
    retired: opts.retired,
  };
  return {
    id: opts.id ?? 'm',
    sport: 'tennis',
    matchType: 'single',
    myPlayerId: 'p1',
    clubId: 'individual-p1',
    opponent: 'Opponent',
    isHome: opts.isHome,
    date: opts.date,
    kickoffTime: '10:00',
    competition: '',
    durationMinutes: 0,
    periods: 1,
    periodDurationMinutes: 0,
    currentPeriod: 0,
    status: 'finished',
    startedAt: null,
    pausedAt: null,
    pausedElapsed: 0,
    finishedAt: null,
    homeScore: 0,
    awayScore: 0,
    subMatches: [sub],
    lineup: [],
    goals: [],
    substitutions: [],
    cards: [],
    ratings: [],
    createdAt: opts.date,
    updatedAt: opts.date,
  };
}

describe('tennis player-stats', () => {
  it('empty matches → všude nuly', () => {
    const stats = computePlayerStats([]);
    expect(stats.totalMatches).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.winRate).toBe(0);
  });

  it('1 výhra 2:0 → record 1-0', () => {
    const stats = computePlayerStats([
      buildMatch({ date: '2026-01-01', isHome: true, sets: [[6, 4], [6, 2]] }),
    ]);
    expect(stats.totalMatches).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
    expect(stats.winRate).toBe(1);
    expect(stats.setsWon).toBe(2);
    expect(stats.setsLost).toBe(0);
  });

  it('výhra + prohra → record 1-1, winRate 0.5', () => {
    const stats = computePlayerStats([
      buildMatch({ id: '1', date: '2026-01-01', isHome: true, sets: [[6, 4], [6, 2]] }),
      buildMatch({ id: '2', date: '2026-01-08', isHome: true, sets: [[3, 6], [4, 6]] }),
    ]);
    expect(stats.totalMatches).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(0.5);
    expect(stats.setsWon).toBe(2);
    expect(stats.setsLost).toBe(2);
  });

  it('away výhra (isHome=false, sub.winner=away)', () => {
    const stats = computePlayerStats([
      buildMatch({ date: '2026-01-01', isHome: false, sets: [[3, 6], [4, 6]] }),
    ]);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
    // Z pohledu hráče: on je "away", ale sety home=3 away=6 znamenají že "away" (on) má 6 → vyhrál
    expect(stats.setsWon).toBe(2);
    expect(stats.setsLost).toBe(0);
  });

  it('win streak — 3 výhry za sebou', () => {
    const stats = computePlayerStats([
      buildMatch({ id: '1', date: '2026-01-01', isHome: true, sets: [[6, 4], [6, 2]] }),
      buildMatch({ id: '2', date: '2026-01-02', isHome: true, sets: [[6, 4], [6, 2]] }),
      buildMatch({ id: '3', date: '2026-01-03', isHome: true, sets: [[6, 4], [6, 2]] }),
    ]);
    expect(stats.currentWinStreak).toBe(3);
    expect(stats.bestWinStreak).toBe(3);
  });

  it('streak resetuje po prohře', () => {
    const stats = computePlayerStats([
      buildMatch({ id: '1', date: '2026-01-01', isHome: true, sets: [[6, 4], [6, 2]] }),
      buildMatch({ id: '2', date: '2026-01-02', isHome: true, sets: [[6, 4], [6, 2]] }),
      buildMatch({ id: '3', date: '2026-01-03', isHome: true, sets: [[3, 6], [4, 6]] }),
      buildMatch({ id: '4', date: '2026-01-04', isHome: true, sets: [[6, 4], [6, 2]] }),
    ]);
    expect(stats.currentWinStreak).toBe(1);
    expect(stats.bestWinStreak).toBe(2);
  });

  it('nerozhodnuté zápasy se nepočítají', () => {
    const stats = computePlayerStats([
      buildMatch({ id: '1', date: '2026-01-01', isHome: true, sets: [] }),  // nezapočítatelný
      buildMatch({ id: '2', date: '2026-01-02', isHome: true, sets: [[6, 4]] }),  // jen 1 set = není rozhodnuto
      buildMatch({ id: '3', date: '2026-01-03', isHome: true, sets: [[6, 4], [6, 2]] }),
    ]);
    expect(stats.totalMatches).toBe(1);
    expect(stats.wins).toBe(1);
  });

  it('skreč se počítá do retirements + respektuje manualWinner', () => {
    const stats = computePlayerStats([
      buildMatch({
        id: '1', date: '2026-01-01', isHome: true,
        sets: [[6, 4], [2, 3]], retired: true, manualWinner: 'home',
      }),
    ]);
    expect(stats.totalMatches).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.retirements).toBe(1);
  });

  it('setsWinRate je správně spočítaný', () => {
    const stats = computePlayerStats([
      buildMatch({ id: '1', date: '2026-01-01', isHome: true, sets: [[6, 4], [4, 6], [6, 3]] }),
      // 2 sety vyhrané, 1 prohraný → 2/3 ≈ 0.67
    ]);
    expect(stats.setsWon).toBe(2);
    expect(stats.setsLost).toBe(1);
    expect(stats.setsWinRate).toBeCloseTo(2 / 3, 2);
  });
});
