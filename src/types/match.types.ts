// ─── Seasonal Match module types ──────────────────────────────────────────────

export type SeasonMatchStatus = 'planned' | 'live' | 'finished';

// ─── Match format (počet hráčů v poli + brankář) ─────────────────────────────
// Typické formáty mládežnického fotbalu v ČR. Číslo = hráči v poli + brankář.
export type MatchFormat = '3+1' | '4+1' | '5+1' | '7+1' | '8+1' | '11+1';

export const MATCH_FORMATS: MatchFormat[] = ['3+1', '4+1', '5+1', '7+1', '8+1', '11+1'];

/** Počet hráčů v základní sestavě pro daný formát (včetně brankáře). */
export function formatToStarterCount(format: MatchFormat): number {
  const [field, keeper] = format.split('+').map(Number);
  return field + keeper;
}

// ─── Lineup ───────────────────────────────────────────────────────────────────

export type AttendanceStatus = 'confirmed' | 'tentative' | 'absent';

export interface MatchLineupPlayer {
  playerId: string;
  jerseyNumber: number;
  name: string;           // kopie pro zobrazení (hráč mohl být přejmenován v klubu)
  position?: string;      // volitelné: "brankář", "stoper", "záložník"...
  isStarter: boolean;     // true = základní sestava, false = náhradník
  substituteOrder: number; // pořadí na lavičce (1 = první na střídání); 0 pro startéry
  attendance?: AttendanceStatus; // účast na zápase; default (unset) = 'tentative'
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
  attributes?: {
    effort?: 1 | 2 | 3 | 4 | 5;       // bojovnost / nasazení
    technique?: 1 | 2 | 3 | 4 | 5;    // technika
    teamwork?: 1 | 2 | 3 | 4 | 5;     // kolektiv / spolupráce
    behavior?: 1 | 2 | 3 | 4 | 5;     // chování / disciplína
  };
  emoji?: string;  // single emoji shortcut for quick feedback (👏 💪 🌟 etc.)
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
  clubName?: string;         // název našeho klubu (pro zobrazení místo "My")
  opponent: string;          // název soupeře
  isHome: boolean;           // domácí / venkovní
  date: string;              // "YYYY-MM-DD"
  kickoffTime: string;       // "HH:MM"
  competition: string;       // "Liga", "Pohár", "Přátelský"...
  durationMinutes: number;   // celková délka zápasu v minutách (periods × periodDurationMinutes)
  periods: number;            // počet period (1–4, default 2 = poločasy)
  periodDurationMinutes: number; // délka jedné periody v minutách
  matchFormat?: MatchFormat;  // "4+1", "7+1", ... určuje počet hráčů v základní sestavě
  ageCategory?: string;       // věková kategorie (U6–U19), volitelná
  squad?: string;             // volitelný sub-tým v rámci ageCategory (např. 'A', 'B')

  currentPeriod: number;      // aktuální perioda (1-based, 0 = nezačal)
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
  trackAssists?: boolean;    // true = evidovat asistence u gólů (default true)

  ratings: PlayerRating[];   // hodnocení po zápase
  note?: string;             // trenérova poznámka k zápasu

  isPublic?: boolean;        // true = sdíleno přes veřejný odkaz pro rodiče
  veoUrl?: string;           // odkaz na VEO záznam zápasu

  createdAt: string;
  updatedAt: string;
}

// ─── Public match (GDPR: bez ratings, note, clubId) ──────────────────────────

export interface PublicSeasonMatch {
  id: string;
  ownerUid: string;          // pro Firebase rules
  clubName?: string;
  opponent: string;
  isHome: boolean;
  date: string;
  kickoffTime: string;
  competition: string;
  durationMinutes: number;
  periods?: number;
  periodDurationMinutes?: number;
  currentPeriod?: number;
  status: SeasonMatchStatus;
  startedAt: string | null;
  pausedAt: string | null;
  pausedElapsed: number;
  finishedAt: string | null;
  homeScore: number;
  awayScore: number;
  lineup: MatchLineupPlayer[];
  goals: MatchGoal[];
  substitutions: MatchSubstitution[];
  cards: MatchCard[];
  veoUrl?: string;
  updatedAt: string;
}

// ─── Catalog entry (lightweight, for landing page) ───────────────────────────

export interface MatchCatalogEntry {
  id: string;
  clubName: string;
  opponent: string;
  isHome: boolean;
  date: string;
  kickoffTime: string;
  competition: string;
  status: SeasonMatchStatus;
  homeScore: number;
  awayScore: number;
  ownerUid: string;
  updatedAt: string;
}

// ─── Store input ──────────────────────────────────────────────────────────────

export interface CreateSeasonMatchInput {
  clubId: string;
  clubName?: string;
  opponent: string;
  isHome: boolean;
  date: string;
  kickoffTime: string;
  competition: string;
  durationMinutes: number;
  periods: number;
  periodDurationMinutes: number;
  matchFormat?: MatchFormat;
  ageCategory?: string;
  squad?: string;
  lineup: MatchLineupPlayer[];
  substitutionSettings?: SubstitutionSettings;
  trackAssists?: boolean;
}
