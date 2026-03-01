// ─── Tournament module types ──────────────────────────────────────────────────

export type TournamentStatus = 'draft' | 'active' | 'finished';
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';

// ─── Player & Team ────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  jerseyNumber: number;  // 1–99
  birthYear: number | null; // rok narození, např. 2012
}

export interface TeamCoach {
  name: string;
  phone: string;
  email: string;
}

export interface Team {
  id: string;
  name: string;
  color: string; // hex, e.g. '#E53935'
  players: Player[];
  clubId?: string | null;      // reference na uložený klub
  logoBase64?: string | null;  // kopie loga při vytvoření turnaje
  rosterToken?: string;              // unikátní token pro odkaz na soupisku
  rosterSubmittedAt?: string | null; // ISO timestamp odeslaní soupisky trenérem
  coach?: TeamCoach | null;          // kontakt trenéra (vyplněno přes roster form)
}

export interface RosterSubmission {
  coach: TeamCoach;
  players: Array<{ name: string; jerseyNumber: number; birthYear: number | null }>;
  submittedAt: string;  // ISO timestamp
  teamId: string;
  teamName: string;
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
  pitchNumber?: number;        // číslo hřiště (1-based); default 1; optional pro zpětnou kompatibilitu
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

// ─── Tiebreaker criteria ─────────────────────────────────────────────────────

/** Identifikátor kritéria pro rozhodování remízy v tabulce */
export type TiebreakerCriterion = 'h2h' | 'goalDifference' | 'goalsFor' | 'goalsAgainst' | 'penalties';

/** Výchozí pořadí kritérií (body jsou vždy #1, abeceda vždy poslední — nejsou v poli) */
export const DEFAULT_TIEBREAKER_ORDER: TiebreakerCriterion[] = [
  'h2h', 'goalDifference', 'goalsFor', 'penalties',
];

/** Výsledek pokutových kopů mezi dvěma remízujícími týmy */
export interface PenaltyResult {
  teamAId: string;
  teamBId: string;
  teamAScore: number;  // proměněné penalty týmu A
  teamBScore: number;  // proměněné penalty týmu B
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface TournamentSettings {
  matchDurationMinutes: number;        // 1–120
  breakBetweenMatchesMinutes: number;  // 0–15
  startTime: string;                   // "HH:MM", e.g. "09:00"
  startDate: string;                   // "YYYY-MM-DD"
  rules?: string;                      // propozice / pravidla turnaje
  numberOfPitches?: number;            // 1–8, default 1; zápasy v kole probíhají paralelně
  tiebreakerOrder?: TiebreakerCriterion[];  // pořadí kritérií; chybí = DEFAULT_TIEBREAKER_ORDER
  penaltyResults?: PenaltyResult[];         // ruční výsledky pokutových kopů
  scorersVisible?: boolean;                 // tabulka střelců viditelná pro hosty; default true
  chatEnabled?: boolean;                    // diskuze hostů; default false
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;  // ISO timestamp
}

// ─── Tournament ───────────────────────────────────────────────────────────────

export interface Tournament {
  id: string;
  name: string;
  ownerUid: string;        // UID tvůrce turnaje (pro sdílený přístup)
  status: TournamentStatus;
  createdAt: string;       // ISO timestamp
  updatedAt: string;
  settings: TournamentSettings;
  teams: Team[];
  matches: Match[];
  pinHash: string;         // SHA-256 hash PINu
  pinSalt?: string;        // salt pro rainbow-table ochranu (chybí u starých turnajů)
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
  pinHash: string;  // předpočítaný hash — volající zavolá hashPin(pin, salt) před dispatchem
  pinSalt: string;  // random salt vygenerovaný přes generatePinSalt()
  /** Volitelné vlastní pořadí zápasů (indexy do pole teams). Pokud chybí, použije se výchozí round-robin. */
  matchOrder?: Array<{ homeTeamIndex: number; awayTeamIndex: number; roundIndex: number }>;
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
  pitchNumber?: number;
}

export interface FirebaseTournamentData {
  meta: {
    name: string;
    ownerUid: string;
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
