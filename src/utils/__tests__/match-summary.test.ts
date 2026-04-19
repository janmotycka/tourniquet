import { describe, it, expect } from 'vitest';
import { generateMatchSummaryText } from '../match-summary';
import type { SeasonMatch } from '../../types/match.types';

function makeMatch(overrides: Partial<SeasonMatch> = {}): SeasonMatch {
  return {
    id: 'm1',
    clubId: 'c1',
    opponent: 'Rival FC',
    isHome: true,
    date: '2026-04-15',
    kickoffTime: '14:30',
    competition: 'Liga U11',
    durationMinutes: 60,
    periods: 2,
    periodDurationMinutes: 30,
    currentPeriod: 2,
    status: 'finished',
    startedAt: '2026-04-15T14:30:00.000Z',
    pausedAt: null,
    pausedElapsed: 3600,
    finishedAt: '2026-04-15T15:30:00.000Z',
    homeScore: 3,
    awayScore: 1,
    lineup: [
      { playerId: 'p1', jerseyNumber: 7, name: 'Karel Novák', isStarter: true, substituteOrder: 0 },
      { playerId: 'p2', jerseyNumber: 9, name: 'Jakub Dvořák', isStarter: true, substituteOrder: 0 },
      { playerId: 'p3', jerseyNumber: 3, name: 'Tomáš Malý', isStarter: true, substituteOrder: 0 },
    ],
    goals: [
      { id: 'g1', scorerId: 'p1', assistId: null, isOwnGoal: false, isOpponentGoal: false, minute: 12, recordedAt: '' },
      { id: 'g2', scorerId: 'p2', assistId: null, isOwnGoal: false, isOpponentGoal: false, minute: 30, recordedAt: '' },
      { id: 'g3', scorerId: null, assistId: null, isOwnGoal: false, isOpponentGoal: true, minute: 40, recordedAt: '' },
      { id: 'g4', scorerId: 'p1', assistId: null, isOwnGoal: false, isOpponentGoal: false, minute: 45, recordedAt: '' },
    ],
    substitutions: [
      { id: 's1', playerOutId: 'p1', playerInId: 'p3', minute: 50, recordedAt: '' },
    ],
    cards: [
      { id: 'c1', playerId: 'p3', type: 'yellow', minute: 55, recordedAt: '' },
    ],
    ratings: [],
    createdAt: '', updatedAt: '',
    ...overrides,
  };
}

describe('generateMatchSummaryText', () => {
  it('produces a complete Czech summary with result, scorers, cards', () => {
    const text = generateMatchSummaryText({
      match: makeMatch(),
      clubDisplayName: 'FC Vrchovina',
    }, 'cs');

    expect(text).toContain('FC Vrchovina 3:1 Rival FC');
    expect(text).toContain('15.4.');
    expect(text).toContain('Liga U11');
    expect(text).toContain('*Naši střelci:*');
    expect(text).toContain('Karel Novák');
    expect(text).toContain("(12', 45')");
    expect(text).toContain('Jakub Dvořák');
    expect(text).toContain('*Gól soupeře:* 1×');
    expect(text).toContain('*Karty:*');
    expect(text).toContain('🟨 Tomáš Malý');
  });

  it('flags 3+ goals by one scorer with fire emoji', () => {
    const match = makeMatch({
      goals: [
        { id: 'g1', scorerId: 'p1', assistId: null, isOwnGoal: false, isOpponentGoal: false, minute: 10, recordedAt: '' },
        { id: 'g2', scorerId: 'p1', assistId: null, isOwnGoal: false, isOpponentGoal: false, minute: 25, recordedAt: '' },
        { id: 'g3', scorerId: 'p1', assistId: null, isOwnGoal: false, isOpponentGoal: false, minute: 50, recordedAt: '' },
      ],
      homeScore: 3, awayScore: 0,
    });
    const text = generateMatchSummaryText({ match, clubDisplayName: 'FC Vrchovina' }, 'cs');
    expect(text).toContain('3× 🔥');
  });

  it('handles away team correctly (isHome=false)', () => {
    const match = makeMatch({ isHome: false, homeScore: 1, awayScore: 3 });
    const text = generateMatchSummaryText({ match, clubDisplayName: 'FC Vrchovina' }, 'cs');
    // Rival je doma, Vrchovina hostuje → "Rival FC 1:3 FC Vrchovina"
    expect(text).toContain('Rival FC 1:3 FC Vrchovina');
  });

  it('omits sections when no goals/cards', () => {
    const match = makeMatch({
      goals: [], cards: [], substitutions: [],
      homeScore: 0, awayScore: 0,
    });
    const text = generateMatchSummaryText({ match, clubDisplayName: 'FC Vrchovina' }, 'cs');
    expect(text).not.toContain('*Naši střelci:*');
    expect(text).not.toContain('*Karty:*');
  });

  it('includes trainer note when present', () => {
    const match = makeMatch({ note: 'Skvělý výkon kluci, hlavně Karel!' });
    const text = generateMatchSummaryText({ match, clubDisplayName: 'FC Vrchovina' }, 'cs');
    expect(text).toContain('*Od trenéra:*');
    expect(text).toContain('Skvělý výkon kluci, hlavně Karel!');
  });

  it('includes public URL when provided', () => {
    const text = generateMatchSummaryText({
      match: makeMatch(),
      clubDisplayName: 'FC Vrchovina',
      publicUrl: 'https://torq.cz/#match=abc',
    }, 'cs');
    expect(text).toContain('https://torq.cz/#match=abc');
  });

  it('uses unknown scorer label when scorerId is null', () => {
    const match = makeMatch({
      goals: [
        { id: 'g1', scorerId: null, assistId: null, isOwnGoal: false, isOpponentGoal: false, minute: 15, recordedAt: '' },
      ],
      homeScore: 1, awayScore: 0,
    });
    const text = generateMatchSummaryText({ match, clubDisplayName: 'FC Vrchovina' }, 'cs');
    expect(text).toContain('Neznámý');
    expect(text).toContain("(15')");
  });
});
