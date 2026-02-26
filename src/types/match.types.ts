// ─── Seasonal Match module types ──────────────────────────────────────────────

export type SeasonMatchStatus = 'planned' | 'live' | 'finished';

// ─── Lineup ───────────────────────────────────────────────────────────────────

export interface MatchLineupPlayer {
  playerId: string;
  jerseyNumber: number;
  name: string;           // kopie pro zobrazení (hráč mohl být přejmenován v klubu)
  position?: string;      // volitelné: "brankář", "stoper", "záložník"...
  isStarter: boolean;     // true = základní sestava, false = náhradník
  substituteOrder: number; // pořadí na lavičce (1 = první na střídání); 0 pro startéry
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface MatchGoal {
  id: string;
  scorerId: string | null;   // null = neznámý střelec
  assistId: string | null;   // null = bez asistence
  isOwnGoal: boolean;
  isOpponentGoal: boolean;   // gól soupeře (náš tým neinkasoval — přidá se do awayScore)
  minute: number;
  recordedAt: string;        // ISO timestamp
}

export interface MatchCard {
  id: string;
  playerId: string;
  type: 'yellow' | 'red' | 'yellow-red';
  minute: number;
  recordedAt: string;
}

export interface MatchSubstitution {
  id: string;
  minute: number;
  playerOutId: string;
  playerInId: string;
  recordedAt: string;
}

// ─── Ratings ──────────────────────────────────────────────────────────────────

export interface PlayerRating {
  playerId: string;
  stars: 1 | 2 | 3 | 4 | 5;  // ⭐–⭐⭐⭐⭐⭐
  note?: string;
}

// ─── Substitution assistant settings ─────────────────────────────────────────

export interface SubstitutionSettings {
  intervalMinutes: number;   // každých X minut upozornit (např. 15)
  playersAtOnce: number;     // kolik hráčů najednou (1–4)
}

// ─── SeasonMatch (main entity) ────────────────────────────────────────────────

export interface SeasonMatch {
  id: string;
  clubId: string;            // reference na náš klub (pro výběr hráčů)
  opponent: string;          // název soupeře
  isHome: boolean;           // domácí / venkovní
  date: string;              // "YYYY-MM-DD"
  kickoffTime: string;       // "HH:MM"
  competition: string;       // "Liga", "Pohár", "Přátelský"...
  durationMinutes: number;   // délka zápasu (default 60)

  status: SeasonMatchStatus;
  startedAt: string | null;
  pausedAt: string | null;
  pausedElapsed: number;     // sekundy uplynulé před pauzou
  finishedAt: string | null;

  homeScore: number;         // naše skóre (nebo domácích pokud isHome)
  awayScore: number;

  lineup: MatchLineupPlayer[];
  goals: MatchGoal[];
  substitutions: MatchSubstitution[];
  cards: MatchCard[];

  substitutionSettings?: SubstitutionSettings;

  ratings: PlayerRating[];   // hodnocení po zápase
  note?: string;             // trenérova poznámka k zápasu

  createdAt: string;
  updatedAt: string;
}

// ─── Store input ──────────────────────────────────────────────────────────────

export interface CreateSeasonMatchInput {
  clubId: string;
  opponent: string;
  isHome: boolean;
  date: string;
  kickoffTime: string;
  competition: string;
  durationMinutes: number;
  lineup: MatchLineupPlayer[];
  substitutionSettings?: SubstitutionSettings;
}
