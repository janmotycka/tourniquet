import type { TournamentSettings, TournamentFormat, GroupDefinition } from '../../../types/tournament.types';

export interface TeamDraft {
  name: string;
  color: string;
  players: Array<{ name: string; jerseyNumber: number }>;
  expanded: boolean;
  clubId: string | null;
  logoBase64: string | null;
}

export interface MatchOrderEntry {
  homeTeamIndex: number;
  awayTeamIndex: number;
  roundIndex: number;
}

export type { TournamentSettings, TournamentFormat, GroupDefinition };
