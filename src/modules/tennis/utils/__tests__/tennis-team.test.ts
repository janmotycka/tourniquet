import { describe, it, expect } from 'vitest';
import {
  TEAM_MATCH_FORMATS,
  createDefaultSubMatches,
  determineSubMatchWinner,
  aggregateTeamScore,
  formatSubMatchScore,
  generateTennisTeamSummaryText,
} from '../tennis-team';
import type { TennisSubMatch } from '../../../../types/match.types';

describe('tennis-team utils', () => {
  describe('TEAM_MATCH_FORMATS', () => {
    it('má standardní ČTenis formáty', () => {
      expect(TEAM_MATCH_FORMATS.length).toBe(3);
      const ids = TEAM_MATCH_FORMATS.map(f => f.id);
      expect(ids).toContain('4s-2d');
      expect(ids).toContain('3s-1d');
      expect(ids).toContain('2s-1d');
    });

    it('pro 4s-2d je součet bodů 6', () => {
      const f = TEAM_MATCH_FORMATS.find(x => x.id === '4s-2d')!;
      expect(f.singlesCount + f.doublesCount).toBe(6);
      expect(f.totalPoints).toBe(6);
    });
  });

  describe('createDefaultSubMatches', () => {
    it('vytvoří správný počet dvouher + čtyřher', () => {
      const f = TEAM_MATCH_FORMATS.find(x => x.id === '4s-2d')!;
      const subs = createDefaultSubMatches(f);
      expect(subs.filter(s => s.type === 'singles').length).toBe(4);
      expect(subs.filter(s => s.type === 'doubles').length).toBe(2);
    });

    it('čtyřhry jsou až po dvouhrách (podle order)', () => {
      const f = TEAM_MATCH_FORMATS[0];
      const subs = createDefaultSubMatches(f);
      const sorted = [...subs].sort((a, b) => a.order - b.order);
      const firstDoubleIdx = sorted.findIndex(s => s.type === 'doubles');
      const lastSingleIdx = sorted.map(s => s.type).lastIndexOf('singles');
      expect(firstDoubleIdx).toBeGreaterThan(lastSingleIdx);
    });

    it('každý sub-match má unikátní id', () => {
      const subs = createDefaultSubMatches(TEAM_MATCH_FORMATS[0]);
      const ids = subs.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('determineSubMatchWinner', () => {
    const mk = (sets: Array<[number, number]>, retired = false, winner: 'home' | 'away' | null = null): TennisSubMatch => ({
      id: 't', type: 'singles', order: 1,
      homePlayerIds: [], awayPlayerName: '',
      sets: sets.map(([h, a]) => ({ home: h, away: a })),
      winner, retired,
    });

    it('vítěz best-of-3 2:0 v setech = home', () => {
      expect(determineSubMatchWinner(mk([[6, 4], [6, 2]]))).toBe('home');
    });

    it('vítěz best-of-3 2:0 pro away', () => {
      expect(determineSubMatchWinner(mk([[4, 6], [2, 6]]))).toBe('away');
    });

    it('super-tiebreak 2:1 pro home (3 sety)', () => {
      expect(determineSubMatchWinner(mk([[6, 3], [4, 6], [10, 8]]))).toBe('home');
    });

    it('nedohraný (1:1) → null', () => {
      expect(determineSubMatchWinner(mk([[6, 3], [3, 6]]))).toBe(null);
    });

    it('žádné sety → null', () => {
      expect(determineSubMatchWinner(mk([]))).toBe(null);
    });

    it('skreč zachovává ručně nastavený winner', () => {
      // Skreč: sety jsou 1:0 (ne dokončené), ale hra je retired. Winner = 'home' (nastaveno ručně).
      const sub = mk([[4, 2]], true, 'home');
      expect(determineSubMatchWinner(sub)).toBe('home');
    });
  });

  describe('aggregateTeamScore', () => {
    it('spočítá 4:2 pro kompletní team match', () => {
      const subs = [
        { winner: 'home' }, { winner: 'home' }, { winner: 'away' }, { winner: 'home' },
        { winner: 'away' }, { winner: 'home' },
      ] as TennisSubMatch[];
      expect(aggregateTeamScore(subs)).toEqual({ home: 4, away: 2 });
    });

    it('nerozhodnuté sub-matches se nezapočítávají', () => {
      const subs = [
        { winner: 'home' }, { winner: null }, { winner: 'away' }, { winner: null },
      ] as TennisSubMatch[];
      expect(aggregateTeamScore(subs)).toEqual({ home: 1, away: 1 });
    });

    it('prázdné pole → 0:0', () => {
      expect(aggregateTeamScore([])).toEqual({ home: 0, away: 0 });
    });
  });

  describe('formatSubMatchScore', () => {
    const mk = (sets: Array<[number, number]>, retired = false): TennisSubMatch => ({
      id: 't', type: 'singles', order: 1,
      homePlayerIds: [], awayPlayerName: '',
      sets: sets.map(([h, a]) => ({ home: h, away: a })),
      winner: null, retired,
    });

    it('formátuje 2 sety', () => {
      expect(formatSubMatchScore(mk([[6, 4], [6, 2]]))).toBe('6:4 6:2');
    });

    it('prázdné sety → "—"', () => {
      expect(formatSubMatchScore(mk([]))).toBe('—');
    });

    it('skreč + částečné sety → přidá "skreč"', () => {
      expect(formatSubMatchScore(mk([[6, 4], [2, 1]], true))).toBe('6:4 2:1 skreč');
    });

    it('skreč bez setů → jen "skreč"', () => {
      expect(formatSubMatchScore(mk([], true))).toBe('skreč');
    });
  });

  describe('generateTennisTeamSummaryText', () => {
    const playerNameResolver = (id: string) => id === 'p1' ? 'Karel Novák' : id === 'p2' ? 'Jakub Dvořák' : null;

    it('vytvoří kompletní shrnutí s dvouhrami i čtyřhrami', () => {
      const match = {
        sport: 'tennis' as const,
        matchType: 'team' as const,
        date: '2026-04-17',
        competition: 'Krajský přebor U14',
        ageCategory: 'Starší žactvo',
        isHome: true,
        opponent: 'LTC Bedřichov',
        officialResultsNote: 'Výsledky orientační.',
        homeScore: 4,
        awayScore: 2,
        subMatches: [
          {
            id: 's1', type: 'singles' as const, order: 1,
            homePlayerIds: ['p1'], awayPlayerName: 'Pepa Tříska',
            sets: [{ home: 6, away: 4 }, { home: 6, away: 2 }],
            winner: 'home' as const,
          },
          {
            id: 'd1', type: 'doubles' as const, order: 5,
            homePlayerIds: ['p1', 'p2'], awayPlayerName: 'Pepa', awayPlayerName2: 'Jan',
            sets: [{ home: 6, away: 2 }, { home: 6, away: 4 }],
            winner: 'home' as const,
          },
        ],
      };
      const text = generateTennisTeamSummaryText({
        match, clubDisplayName: 'TC Nové Město', playerNameResolver, lang: 'cs',
      });
      // Aggregate se počítá ze sub-matches (2× winner=home) → 2:0
      expect(text).toContain('🎾 *TC Nové Město 2:0 LTC Bedřichov*');
      expect(text).toContain('17.4.');
      expect(text).toContain('Krajský přebor U14');
      expect(text).toContain('*Dvouhra:*');
      expect(text).toContain('Karel Novák');
      expect(text).toContain('6:4 6:2');
      expect(text).toContain('*Čtyřhra:*');
      expect(text).toContain('Karel Novák / Jakub Dvořák');
      expect(text).toContain('Výsledky orientační');
    });

    it('v anglickém jazyce používá anglické labely', () => {
      const text = generateTennisTeamSummaryText({
        match: {
          sport: 'tennis', matchType: 'team',
          date: '2026-04-17', competition: 'League', isHome: true, opponent: 'Opp',
          homeScore: 1, awayScore: 0,
          subMatches: [{
            id: 's1', type: 'singles', order: 1,
            homePlayerIds: [], awayPlayerName: 'John',
            sets: [{ home: 6, away: 0 }, { home: 6, away: 0 }],
            winner: 'home',
          }],
        },
        clubDisplayName: 'Us', playerNameResolver: () => null, lang: 'en',
      });
      expect(text).toContain('*Singles:*');
      expect(text).toContain('Results are unofficial');
    });
  });
});
