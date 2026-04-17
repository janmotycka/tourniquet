// ─── Tournament module types ──────────────────────────────────────────────────

export type TournamentStatus = 'draft' | 'active' | 'finished';
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';
export type TournamentFormat = 'round-robin' | 'groups-knockout' | 'knockout';
export type MatchStage =
  | 'group'
  | 'quarterfinal'
  | 'semifinal'
  | 'third-place'
  | 'final'
  // Play-out: zápasy o umístění (5., 7., 9. místo atd.)
  | 'placement';

// ─── Player & Team ────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  jerseyNumber: number;  // 1–99
  birthYear: number | null; // rok narození, např. 2012
  /**
   * Volitelná reference na ClubPlayer.id (kanonický hráč v klubu).
   * Pokud je vyplněná, statistiky (góly, karty, účast) se primárně matchují přes ID,
   * ne přes jméno → spolehlivější u duplicitních jmen nebo po přejmenování.
   */
  clubPlayerId?: string;
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
  paidAt?: string | null;            // ISO timestamp zaplacení startovného
}

/** Fakturační údaje odběratele (klub trenéra) — volitelné */
export interface CustomerBilling {
  companyName: string;       // název klubu / organizace
  ico: string;               // IČO
  dic?: string;              // DIČ (nepovinné)
  address: string;           // ulice + č.p.
  city: string;
  zip: string;
}

export interface RosterSubmission {
  coach: TeamCoach;
  players: Array<{
    name: string;
    jerseyNumber: number;
    birthYear: number | null;
    /** Volitelná reference na ClubPlayer.id (pokud byl hráč importován z klubu). */
    clubPlayerId?: string;
  }>;
  submittedAt: string;  // ISO timestamp
  teamId: string;
  teamName: string;
  customerBilling?: CustomerBilling;  // fakturační údaje odběratele
}

export interface RegistrationSubmission {
  teamName: string;
  coachName: string;
  coachPhone: string;
  coachEmail: string;
  submittedAt: string;  // ISO timestamp
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

  // ── Knockout / Groups extension (optional — backward compatible) ──────
  stage?: MatchStage;                // fáze turnaje (group, semifinal, final…)
  groupId?: string;                  // ID skupiny (pro group stage matches)
  bracketPosition?: number;          // pozice v bracket vizualizaci (0-based)
  nextMatchId?: string;              // vítěz postupuje do tohoto zápasu
  homeTeamPlaceholder?: string;      // "1. Sk. A" — dokud se neurčí skutečný tým
  awayTeamPlaceholder?: string;
  veoUrl?: string;                   // odkaz na VEO záznam zápasu
  placementLabel?: string;           // "O 5. místo", "O 7. místo" — label pro play-out zápasy

  // ── Penaltový rozstřel (knockout/play-out) ─────────────────────────────
  homePenaltyScore?: number;         // góly z penalt domácích (computed from kicks or manual)
  awayPenaltyScore?: number;         // góly z penalt hostů
  penaltyKicks?: PenaltyKick[];      // live kopy — každý uložen okamžitě pro real-time view
}

/** Jeden penaltový kop — uložen v pořadí střídavě home/away */
export interface PenaltyKick {
  side: 'home' | 'away';
  scored: boolean;
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

// ─── Group definition (for groups+knockout format) ──────────────────────────

export interface GroupDefinition {
  id: string;
  name: string;         // "Skupina A", "Skupina B"
  teamIds: string[];    // IDs týmů ve skupině
}

// ─── Billing / Invoice ────────────────────────────────────────────────────────

/** Fakturační profil organizátora (uložen per user v /users/{uid}/billingProfile) */
export interface BillingProfile {
  companyName: string;       // název organizace / pořadatele
  ico: string;               // IČO
  dic?: string;              // DIČ (nepovinné — neplátci DPH)
  address: string;           // ulice + č.p.
  city: string;
  zip: string;
  bankAccount: string;       // české formát: 123456789/0100
  iban?: string;             // IBAN (volitelné — pro QR Platba)
  bic?: string;              // BIC/SWIFT (volitelné)
  bankName?: string;         // název banky
  email?: string;            // kontaktní email na faktuře
  phone?: string;            // kontaktní telefon
}

/** Data pro vygenerování konkrétní faktury */
export interface InvoiceData {
  invoiceNumber: string;       // číslo faktury, e.g. "2026001"
  variableSymbol: string;     // variabilní symbol pro platbu
  issueDate: string;           // datum vystavení (ISO)
  dueDate: string;             // datum splatnosti (ISO)
  amount: number;              // částka v CZK
  currency: string;            // "CZK"
  description: string;         // "Startovné — Zimní turnaj 2026"
  customerName: string;        // jméno trenéra / týmu
  customerEmail?: string;
  customerPhone?: string;
  // Strukturované fakturační údaje odběratele (pokud je trenér vyplnil)
  customerCompanyName?: string;
  customerIco?: string;
  customerDic?: string;
  customerAddress?: string;
  customerCity?: string;
  customerZip?: string;
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
  scorersVisible?: boolean;                 // tabulka střelců viditelná pro hosty; default false
  chatEnabled?: boolean;                    // diskuze hostů; default false
  mvpVotingEnabled?: boolean;               // MVP hlasování diváků; default false
  reactionsEnabled?: boolean;               // live reakce fanoušků na zápas; default false

  // ── Knockout / Groups extension (optional — backward compatible) ──────
  format?: TournamentFormat;               // default 'round-robin' pokud chybí
  groups?: GroupDefinition[];              // definice skupin (pro groups-knockout)
  advancePerGroup?: number;                // kolik týmů postupuje ze skupiny (1 nebo 2)
  thirdPlaceMatch?: boolean;               // zápas o 3. místo
  playOut?: boolean;                       // play-out: zápasy o VŠECHNA umístění (5., 7., 9.… místo). Každý tým odchází s finálním umístěním.

  // ── Roster validation ───────────────────────────────────────────────
  maxBirthYear?: number;                   // min. rok narození hráče (např. 2014 = jen 2014+)
  maxPlayersPerRoster?: number;            // max. počet hráčů na soupisce (warning, ne blokace)

  // ── Registration ────────────────────────────────────────────────────
  registrationEnabled?: boolean;           // povolena veřejná registrace týmů
  registrationClosed?: boolean;            // uzavřeno přihlašování (admin toggle)
  maxTeams?: number;                       // maximální počet týmů v turnaji
  endTime?: string;                        // "HH:MM" — plánovaný konec turnaje
  entryFee?: number;                       // startovné za tým (v CZK)
  entryFeeNote?: string;                   // poznámka ke startovnému
  billingProfile?: BillingProfile;         // fakturační údaje pro faktury

  // ── Friendly mode (školičky — bez pořadí) ─────────────────────────
  friendlyMode?: boolean;                  // true = žádná tabulka, žádní střelci, jen zápasy

  // ── Venue (místo konání) ──────────────────────────────────────────
  venueName?: string;                     // název hřiště / areálu
  venueAddress?: string;                  // adresa místa konání
  venueNote?: string;                     // doplňující info (parkování, vstup…)

  // ── Awards (ocenění trenérů) ──────────────────────────────────────
  awards?: TournamentAward[];             // ocenění udělená trenéry/poradatelem
  awardsVisible?: boolean;                // zobrazit ocenění hostům; default false

  // ── Propozice (regulations) ─────────────────────────────────────
  regulations?: TournamentRegulations;

  // ── External link (např. ČTenis oficiální stránka turnaje) ───────
  /**
   * URL na oficiální stránku turnaje v externím systému
   * (např. `https://cztenis.cz/turnaj/{id}/sezona/{kod}/informace`).
   * Zobrazí se jako tlačítko „🔗 Otevřít na ČTenis" v detailu i public view.
   */
  officialResultsUrl?: string;
}

/** Strukturované propozice turnaje — pro PDF a rozeslání trenérům */
export interface TournamentRegulations {
  organizer?: string;            // Pořadatel (default: název klubu)
  category?: string;             // Kategorie ("U9", "Ženy", "I.-II. třídy ZŠ")
  pitchDimensions?: string;      // Plocha ("22×16 metrů, brány 3x2m")
  matchFormat?: string;          // Počet hráčů ("1+4, na soupisce max. 10")
  substitutionRules?: string;    // Střídání ("Hokejovým způsobem")
  gameRules?: string;            // Pravidla (volný text)
  cardRules?: string;            // Tresty ("Žlutá 2 min, červená konec")
  protestRules?: string;         // Protesty
  equipment?: string;            // Vybavení
  prizes?: string;               // Ceny
  referees?: string;             // Rozhodčí
  insurance?: string;            // Pojištění
  changingRooms?: string;        // Šatny / zázemí
  organizerDisclaimer?: string;  // Organizátor si vyhrazuje právo...
  contactName?: string;          // Kontaktní osoba
  contactPhone?: string;         // Telefon
  contactEmail?: string;         // Email
  rosterRequired?: boolean;      // Vyžaduje soupisku (pro PDF 2. strana)
  penaltyRounds?: number;        // Počet kol penaltového rozstřelu (default 5)
}

export interface TournamentAward {
  title: string;       // "Nejlepší hráč", "Nejlepší brankář", custom...
  playerName: string;  // jméno oceněného
  teamId?: string;     // ID týmu (volitelné)
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
  sport?: import('./sport.types').Sport;  // 'football' | 'tennis' — default 'football'
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
  joinedUsers?: Record<string, true | 'admin'>;  // {uid: true} = rozhodčí, {uid: 'admin'} = co-owner
}

// ─── Store input ──────────────────────────────────────────────────────────────

export interface CreateTournamentInput {
  name: string;
  sport?: import('./sport.types').Sport;
  settings: TournamentSettings;
  teams: Array<{
    name: string;
    color: string;
    players: Array<{ name: string; jerseyNumber: number; birthYear?: number | null; clubPlayerId?: string }>;
    clubId?: string | null;
    logoBase64?: string | null;
  }>;
  pinHash: string;  // předpočítaný hash — volající zavolá hashPin(pin, salt) před dispatchem
  pinSalt: string;  // random salt vygenerovaný přes generatePinSalt()
  /** Volitelné vlastní pořadí zápasů (indexy do pole teams). Pokud chybí, použije se výchozí round-robin. */
  matchOrder?: Array<{ homeTeamIndex: number; awayTeamIndex: number; roundIndex: number }>;
}

// ─── Catalog entry (lightweight index for public landing page) ───────────────

export interface CatalogEntry {
  id: string;
  sport?: import('./sport.types').Sport;  // NEW: pro sport filter na landing page
  name: string;
  status: TournamentStatus;
  startDate: string;              // "YYYY-MM-DD"
  startTime: string;              // "HH:MM"
  teamCount: number;
  teamNames: string[];            // pro zobrazení
  teamColors: string[];           // hex barvy týmů
  format: TournamentFormat;
  ownerUid: string;
  updatedAt: string;              // ISO timestamp
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
  stage?: MatchStage;
  groupId?: string;
  bracketPosition?: number;
  nextMatchId?: string;
  homeTeamPlaceholder?: string;
  awayTeamPlaceholder?: string;
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

// ─── Tournament Template ──────────────────────────────────────────────────────

export interface TournamentTemplate {
  id: string;
  name: string;
  createdAt: string;
  settings: TournamentSettings;
  teamSnapshots: Array<{
    name: string;
    color: string;
    clubId?: string | null;
    logoBase64?: string | null;
    playerCount: number;
  }>;
  teamCount: number;
  sourceTournamentName: string;
}
