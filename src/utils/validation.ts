/**
 * Centrální validace vstupních dat.
 * Používá se na klientu (formuláře) i před zápisem do Firebase.
 */

import type { CreateTournamentInput } from '../types/tournament.types';

// ─── Limity ──────────────────────────────────────────────────────────────────

export const LIMITS = {
  tournamentName: { min: 2, max: 200 },
  teamName: { min: 1, max: 100 },
  playerName: { min: 1, max: 100 },
  jerseyNumber: { min: 0, max: 999 },
  matchDuration: { min: 1, max: 120 },
  breakDuration: { min: 0, max: 60 },
  numberOfPitches: { min: 1, max: 8 },
  numberOfTeams: { min: 2, max: 32 },
  playersPerTeam: { min: 0, max: 50 },
  rulesText: { max: 5000 },
  pinLength: 6,
} as const;

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Ořízne string na maximální délku */
export function clampString(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

/** Ořízne číslo na rozsah [min, max] */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

// ─── Validace turnaje ────────────────────────────────────────────────────────

export interface TournamentValidationErrors {
  name?: string;
  teams?: string;
  matchDuration?: string;
  breakDuration?: string;
  numberOfPitches?: string;
  pin?: string;
}

export function validateTournamentName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < LIMITS.tournamentName.min) return 'too_short';
  if (trimmed.length > LIMITS.tournamentName.max) return 'too_long';
  return null;
}

export function validatePlayerName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < LIMITS.playerName.min) return 'too_short';
  if (trimmed.length > LIMITS.playerName.max) return 'too_long';
  return null;
}

export function validateTeamName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < LIMITS.teamName.min) return 'too_short';
  if (trimmed.length > LIMITS.teamName.max) return 'too_long';
  return null;
}

/** Bezpečné dělení — vrátí fallback pokud by bylo dělení nulou */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0 || !Number.isFinite(denominator)) return fallback;
  return numerator / denominator;
}

/**
 * Sanitizuje vstupní data turnaje před zápisem do Firebase.
 * Ořízne stringy a čísla na povolené rozsahy.
 */
export function sanitizeTournamentInput(input: CreateTournamentInput): CreateTournamentInput {
  return {
    ...input,
    name: clampString(input.name.trim(), LIMITS.tournamentName.max),
    settings: {
      ...input.settings,
      matchDurationMinutes: clampNumber(input.settings.matchDurationMinutes, LIMITS.matchDuration.min, LIMITS.matchDuration.max),
      breakBetweenMatchesMinutes: clampNumber(input.settings.breakBetweenMatchesMinutes, LIMITS.breakDuration.min, LIMITS.breakDuration.max),
      numberOfPitches: input.settings.numberOfPitches
        ? clampNumber(input.settings.numberOfPitches, LIMITS.numberOfPitches.min, LIMITS.numberOfPitches.max)
        : undefined,
      rules: input.settings.rules
        ? clampString(input.settings.rules, LIMITS.rulesText.max)
        : undefined,
    },
    teams: input.teams.map(t => ({
      ...t,
      name: clampString(t.name.trim(), LIMITS.teamName.max),
      players: t.players.map(p => ({
        ...p,
        name: clampString(p.name.trim(), LIMITS.playerName.max),
        jerseyNumber: clampNumber(p.jerseyNumber, LIMITS.jerseyNumber.min, LIMITS.jerseyNumber.max),
      })),
    })),
  };
}
