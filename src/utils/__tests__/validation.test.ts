import { describe, it, expect } from 'vitest';
import {
  clampString,
  clampNumber,
  validateTournamentName,
  validateTeamName,
  validatePlayerName,
  safeDivide,
  sanitizeTournamentInput,
  LIMITS,
} from '../validation';
import type { CreateTournamentInput } from '../../types/tournament.types';

// ─── clampString ─────────────────────────────────────────────────────────────

describe('clampString', () => {
  it('returns the string unchanged if shorter than maxLength', () => {
    expect(clampString('hello', 10)).toBe('hello');
  });

  it('truncates string to maxLength', () => {
    expect(clampString('hello world', 5)).toBe('hello');
  });

  it('handles empty string', () => {
    expect(clampString('', 10)).toBe('');
  });

  it('handles maxLength of 0', () => {
    expect(clampString('hello', 0)).toBe('');
  });

  it('handles unicode characters correctly', () => {
    expect(clampString('Příliš žluťoučký', 6)).toBe('Příliš');
  });
});

// ─── clampNumber ─────────────────────────────────────────────────────────────

describe('clampNumber', () => {
  it('returns value when within range', () => {
    expect(clampNumber(5, 1, 10)).toBe(5);
  });

  it('clamps to min when value is below', () => {
    expect(clampNumber(-1, 0, 10)).toBe(0);
  });

  it('clamps to max when value is above', () => {
    expect(clampNumber(15, 0, 10)).toBe(10);
  });

  it('rounds floating point values', () => {
    expect(clampNumber(3.7, 1, 10)).toBe(4);
    expect(clampNumber(3.2, 1, 10)).toBe(3);
  });

  it('returns min for NaN', () => {
    expect(clampNumber(NaN, 1, 10)).toBe(1);
  });

  it('returns min for Infinity', () => {
    expect(clampNumber(Infinity, 1, 10)).toBe(1);
  });

  it('returns min for -Infinity', () => {
    expect(clampNumber(-Infinity, 1, 10)).toBe(1);
  });

  it('handles min === max', () => {
    expect(clampNumber(5, 3, 3)).toBe(3);
  });
});

// ─── validateTournamentName ──────────────────────────────────────────────────

describe('validateTournamentName', () => {
  it('returns null for valid name', () => {
    expect(validateTournamentName('Jarní turnaj')).toBeNull();
  });

  it('returns too_short for name shorter than min', () => {
    expect(validateTournamentName('A')).toBe('too_short');
  });

  it('returns too_short for empty name (after trim)', () => {
    expect(validateTournamentName('   ')).toBe('too_short');
  });

  it('returns null for name at exact min length', () => {
    expect(validateTournamentName('AB')).toBeNull();
  });

  it('returns too_long for name exceeding max', () => {
    const longName = 'A'.repeat(LIMITS.tournamentName.max + 1);
    expect(validateTournamentName(longName)).toBe('too_long');
  });

  it('trims whitespace before validation', () => {
    expect(validateTournamentName('  AB  ')).toBeNull();
  });
});

// ─── validateTeamName ────────────────────────────────────────────────────────

describe('validateTeamName', () => {
  it('returns null for valid name', () => {
    expect(validateTeamName('FC Praha')).toBeNull();
  });

  it('returns too_short for empty name', () => {
    expect(validateTeamName('')).toBe('too_short');
  });

  it('returns too_long for long name', () => {
    const longName = 'X'.repeat(LIMITS.teamName.max + 1);
    expect(validateTeamName(longName)).toBe('too_long');
  });
});

// ─── validatePlayerName ──────────────────────────────────────────────────────

describe('validatePlayerName', () => {
  it('returns null for valid name', () => {
    expect(validatePlayerName('Jan Novák')).toBeNull();
  });

  it('returns too_short for empty name', () => {
    expect(validatePlayerName('')).toBe('too_short');
  });

  it('returns too_long for long name', () => {
    const longName = 'A'.repeat(LIMITS.playerName.max + 1);
    expect(validatePlayerName(longName)).toBe('too_long');
  });
});

// ─── safeDivide ──────────────────────────────────────────────────────────────

describe('safeDivide', () => {
  it('divides normally', () => {
    expect(safeDivide(10, 2)).toBe(5);
  });

  it('returns fallback for division by zero', () => {
    expect(safeDivide(10, 0)).toBe(0);
  });

  it('returns custom fallback for division by zero', () => {
    expect(safeDivide(10, 0, -1)).toBe(-1);
  });

  it('returns fallback for NaN denominator', () => {
    expect(safeDivide(10, NaN)).toBe(0);
  });

  it('returns fallback for Infinity denominator', () => {
    expect(safeDivide(10, Infinity)).toBe(0);
  });
});

// ─── sanitizeTournamentInput ─────────────────────────────────────────────────

describe('sanitizeTournamentInput', () => {
  const baseInput: CreateTournamentInput = {
    name: '  Jarní turnaj  ',
    settings: {
      matchDurationMinutes: 10,
      breakBetweenMatchesMinutes: 5,
      startTime: '09:00',
      startDate: '2025-06-01',
    },
    teams: [
      {
        name: '  FC Praha  ',
        color: '#E53935',
        players: [
          { name: '  Jan Novák  ', jerseyNumber: 7 },
        ],
      },
    ],
    pinHash: 'abc123',
    pinSalt: 'salt123',
  };

  it('trims tournament name', () => {
    const result = sanitizeTournamentInput(baseInput);
    expect(result.name).toBe('Jarní turnaj');
  });

  it('trims team names', () => {
    const result = sanitizeTournamentInput(baseInput);
    expect(result.teams[0].name).toBe('FC Praha');
  });

  it('trims player names', () => {
    const result = sanitizeTournamentInput(baseInput);
    expect(result.teams[0].players[0].name).toBe('Jan Novák');
  });

  it('clamps match duration to valid range', () => {
    const input = { ...baseInput, settings: { ...baseInput.settings, matchDurationMinutes: 999 } };
    const result = sanitizeTournamentInput(input);
    expect(result.settings.matchDurationMinutes).toBe(LIMITS.matchDuration.max);
  });

  it('clamps break duration to valid range', () => {
    const input = { ...baseInput, settings: { ...baseInput.settings, breakBetweenMatchesMinutes: -5 } };
    const result = sanitizeTournamentInput(input);
    expect(result.settings.breakBetweenMatchesMinutes).toBe(LIMITS.breakDuration.min);
  });

  it('clamps jersey number to valid range', () => {
    const input = {
      ...baseInput,
      teams: [{
        ...baseInput.teams[0],
        players: [{ name: 'Test', jerseyNumber: 5000 }],
      }],
    };
    const result = sanitizeTournamentInput(input);
    expect(result.teams[0].players[0].jerseyNumber).toBe(LIMITS.jerseyNumber.max);
  });

  it('clamps number of pitches when provided', () => {
    const input = { ...baseInput, settings: { ...baseInput.settings, numberOfPitches: 20 } };
    const result = sanitizeTournamentInput(input);
    expect(result.settings.numberOfPitches).toBe(LIMITS.numberOfPitches.max);
  });

  it('leaves numberOfPitches undefined when not provided', () => {
    const result = sanitizeTournamentInput(baseInput);
    expect(result.settings.numberOfPitches).toBeUndefined();
  });

  it('clamps rules text to max length', () => {
    const longRules = 'R'.repeat(LIMITS.rulesText.max + 100);
    const input = { ...baseInput, settings: { ...baseInput.settings, rules: longRules } };
    const result = sanitizeTournamentInput(input);
    expect(result.settings.rules?.length).toBe(LIMITS.rulesText.max);
  });
});
