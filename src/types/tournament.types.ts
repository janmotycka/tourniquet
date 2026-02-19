// ─── Tournament module types ──────────────────────────────────────────────────

export type TournamentStatus = 'draft' | 'active' | 'finished';
export type MatchStatus = 'scheduled' | 'live' | 'finished';

// ─── Player & Team ────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  jerseyNumber: number;  // 1–99
  birthYear: number | null; // rok narození, např. 2012
}

export interface Team {
  id: string;
  name: string;
  color: string; // hex, e.g. '#E53935'
  players: Player[];
  clubId?: string | null;      // reference na uložený klub
  logoBase64?: string | null;  // kopie loga při vytvoření turnaje
}

// ─── Goal ─────────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  teamId: string;              // tým, který dal gól
  playerId: string | null;     // null = neznámý střelec
  isOwnGoal: boolean;          // vlastní gól (připsán soupeři)
  minute: number;              // minuta zápasu (1–N)
  recordedAt: string;          // ISO timestamp
}

// ─── Match ────────────────────────────────────────────────────────────────────

export interface Match {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledTime: string;       // ISO timestamp plánovaného začátku
  durationMinutes: number;     // délka zápasu v minutách
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  goals: Goal[];
  startedAt: string | null;    // ISO timestamp skutečného začátku
  finishedAt: string | null;
  pausedAt: string | null;     // ISO timestamp pauzy (null = běží nebo není spuštěn)
  pausedElapsed: number;       // sekundy uplynulé před pauzou (pro správný výpočet)
  roundIndex: number;          // 0-based číslo rundy
  matchIndex: number;          // globální pořadové číslo zápasu (pro výpočet času)
}

// ─── Standing (computed, never stored) ───────────────────────────────────────

export interface Standing {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number; // goalsFor - goalsAgainst
  points: number;         // won*3 + drawn*1
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface TournamentSettings {
  matchDurationMinutes: number;        // 1–120
  breakBetweenMatchesMinutes: number;  // 0–15
  startTime: string;                   // "HH:MM", e.g. "09:00"
  startDate: string;                   // "YYYY-MM-DD"
  rules?: string;                      // propozice / pravidla turnaje
}

// ─── Tournament ───────────────────────────────────────────────────────────────

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  createdAt: string;       // ISO timestamp
  updatedAt: string;
  settings: TournamentSettings;
  teams: Team[];
  matches: Match[];
  pinHash: string;         // SHA-256 hash PINu
  firebaseSynced: boolean;
  lastSyncedAt: string | null;
}

// ─── Store input ──────────────────────────────────────────────────────────────

export interface CreateTournamentInput {
  name: string;
  settings: TournamentSettings;
  teams: Array<{
    name: string;
    color: string;
    players: Array<{ name: string; jerseyNumber: number; birthYear?: number | null }>;
    clubId?: string | null;
    logoBase64?: string | null;
  }>;
  pinHash: string; // předpočítaný hash — volající zavolá hashPin() před dispatchem
}

// ─── Firebase serializable data ───────────────────────────────────────────────

export interface FirebaseGoal {
  teamId: string;
  playerId: string | null;
  isOwnGoal: boolean;
  minute: number;
  recordedAt: string;
}

export interface FirebaseMatch {
  homeTeamId: string;
  awayTeamId: string;
  scheduledTime: string;
  durationMinutes: number;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  goals: Record<string, FirebaseGoal>;
  startedAt: string | null;
  finishedAt: string | null;
  roundIndex: number;
  matchIndex: number;
}

export interface FirebaseTournamentData {
  meta: {
    name: string;
    status: TournamentStatus;
    createdAt: string;
    updatedAt: string;
    settings: TournamentSettings;
    pinHash: string;
  };
  teams: Record<string, {
    name: string;
    color: string;
    players: Record<string, { name: string; jerseyNumber: number }>;
  }>;
  matches: Record<string, FirebaseMatch>;
}
