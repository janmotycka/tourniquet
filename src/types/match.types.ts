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
  birthYear?: number;     // volitelný ročník — užitečný pro PDF rozpis, statistiky podle věku
  position?: string;      // volitelné: "brankář", "stoper", "záložník"...
  isStarter: boolean;     // true = základní sestava, false = náhradník
  substituteOrder: number; // pořadí na lavičce (1 = první na střídání); 0 pro startéry
  attendance?: AttendanceStatus; // účast na zápase; default (unset) = 'tentative'
  guestCategory?: string; // domovská kategorie, pokud hráč hostuje z jiné kategorie (např. U8 hraje za U9)
  isCaptain?: boolean;    // audit 2026-05-22: kapitán týmu (max 1 hráč v lineup)
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

// ─── Tennis team match (ČTenis družstva) ────────────────────────────────────
/**
 * TennisSubMatch — jednotlivý zápas v rámci týmového zápasu.
 *
 * Český mládežnický tenis typicky hraje:
 *   - 4× dvouhra (singles) + 2× čtyřhra (doubles) = 6 bodů
 *   - nebo 3× dvouhra + 1× čtyřhra (mladší žactvo)
 * Tým vyhraje zápas který má většinu bodů (4+ z 6, 3+ z 4).
 */
export interface TennisSubMatch {
  id: string;
  type: 'singles' | 'doubles';
  /** Pořadí v rámci týmového zápasu (1–6) — řídí také zobrazení v tabulce */
  order: number;
  /** ID(s) hráčů domácího týmu (1 pro singles, 2 pro doubles) */
  homePlayerIds: string[];
  /** Jméno(na) soupeřova hráče/hráčů (free text) */
  awayPlayerName: string;
  /** Druhý soupeř pro doubles */
  awayPlayerName2?: string;
  /** Odehrané sety: [{ home: 6, away: 4 }, { home: 3, away: 6 }, ...] */
  sets: Array<{ home: number; away: number }>;
  /** Vítěz: 'home' | 'away' | null (dosud nehraje) */
  winner: 'home' | 'away' | null;
  /** Pokud byl zápas skrečován (retired) */
  retired?: boolean;
  /** Poznámka (optional) */
  note?: string;
}

export type MatchType = 'single' | 'team';

// ─── SeasonMatch (main entity) ────────────────────────────────────────────────

export interface SeasonMatch {
  id: string;
  sport?: import('./sport.types').Sport;  // 'football' | 'tennis' — default 'football'
  /**
   * Typ zápasu — 'single' = klasický 1v1 zápas, 'team' = týmový (ČTenis družstva).
   * Default 'single' (backward-compat). Pro tennis team matches použij 'team'.
   */
  matchType?: MatchType;
  /** Pro tennis team: jednotlivé sub-matches (4× singles + 2× doubles typicky) */
  subMatches?: TennisSubMatch[];
  /**
   * Disclaimer pro neoficiální výsledky (tennis družstva — oficiální na ČTenis).
   * Pokud vyplněno, zobrazuje se v detailu + veřejném view.
   */
  officialResultsNote?: string;
  /**
   * URL na oficiální stránku zápasu / turnaje v externím systému
   * (např. `https://cztenis.cz/turnaj/{id}/sezona/{kod}/informace`).
   * Zobrazí se jako tlačítko „🔗 Otevřít na ČTenis" v detailu + public view.
   */
  officialResultsUrl?: string;
  /**
   * Reference na MyPlayer (tenisový individuální mód — rodič/privátní trenér).
   * Pokud je set, zápas patří k tomuto sledovanému hráči (ne ke klubu).
   * `clubId` v tom případě může být prázdný string nebo "-" (backward-compat
   * placeholder, Firebase rules neřeší scope přes clubId).
   */
  myPlayerId?: string;
  clubId: string;            // reference na náš klub (pro výběr hráčů)
  clubName?: string;         // název našeho klubu (pro zobrazení místo "My")
  opponent: string;          // název soupeře (display name)
  opponentClubId?: string;   // NEW: pokud soupeř je TORQ klub (propojení statistik)
  opponentCatalogId?: string; // NEW: pokud soupeř je v katalogu (FAČR kluby)
  isHome: boolean;           // domácí / venkovní
  venue?: string;            // místo konání (např. "Stadion U hřbitova, Nové Město na Moravě")
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
  /**
   * Audit 2026-04-29: rozlišení rychlého (Quick match) zápasu od plnohodnotného.
   * Quick match má jen jména hráčů (bez pozic / kapitánů / FAČR informací),
   * je vytvořen z QuickMatchSheet pro rychlý přátelák / plácek. UI některé
   * Advanced featury (FAČR hlášení, lineup picker) skrývá pro Quick zápasy.
   */
  isQuickMatch?: boolean;

  /**
   * Audit 2026-05-25 J-6: Ownership pro klubový workspace.
   * Kdo zápas vytvořil — primárně určuje "spectator mode" v UI: ostatní
   * trenéři klubu vidí cizí zápas read-only s bannerem "Sleduješ X zápas".
   * Lze převzít přes `takeoverMatch` action (zapíše do `takeoverHistory`).
   *
   * Backward-compat: legacy zápasy bez createdByUid používají `scopeId` z
   * Firebase path jako fallback (matchFromFirebase reader to nastaví).
   */
  createdByUid?: string;
  createdByName?: string;
  /**
   * Audit log převzetí zápasu mezi kolegy klubu. Audit trail pro spor
   * "kdo zápas pokazil". Příklad: Petr vytvořil, Honza ho převzal kvůli nemoci.
   */
  takeoverHistory?: Array<{
    fromUid: string;
    fromName: string;
    toUid: string;
    toName: string;
    at: string; // ISO
  }>;

  ratings: PlayerRating[];   // hodnocení po zápase
  note?: string;             // trenérova poznámka k zápasu

  /**
   * Aktivní editor zápasu — soft lock pro multi-trainer koordinaci.
   * Heartbeat se aktualizuje každých 15s; pokud `now - heartbeatAt > 45s` → lock je stale.
   * Trenér uvidí banner "Spravuje X". Může kliknout „Převzít řízení" a stát se editorem.
   * Je-li null, nikdo momentálně aktivně needituje.
   */
  activeEditor?: {
    uid: string;
    name: string;
    startedAt: string;    // ISO
    heartbeatAt: string;  // ISO
  } | null;

  /**
   * Pairing s trenérem opozičního týmu (cross-team zápis zápasu).
   *
   * Flow:
   *  1. Home coach (vytvořitel zápasu) vygeneruje PIN → získá share link
   *  2. Opposition coach klikne na link → zadá PIN → systém nastaví `awayCoachUid`
   *  3. Po párování obě strany mohou editovat ten samý match document
   *     (Firebase rules ověřují `ownerUid` nebo `pairing.awayCoachUid`)
   *
   * Opposition coach vidí zápas s **zrcadlenou perspektivou** — `isHome` stays
   * as-is v datech (perspektiva creator-e), ale UI používá `useMatchPerspective()`
   * hook k určení "my team" vs "their team" pro aktuálně přihlášeného uživatele.
   */
  pairing?: {
    /** Random token v URL — „kdo má tento zápas claimnout". Existuje pouze
     *  během join windowu (před joinem); po joinu se smaže. */
    joinToken?: string;
    pinHash?: string;        // sha256(pin + salt) — klient-side ověření PINu
    pinSalt?: string;
    /** UID opozičního trenéra po zadání PINu. */
    awayCoachUid?: string;
    awayCoachName?: string;
    awayClubId?: string;     // ID klubu opozičního trenéra (volitelné)
    awayClubName?: string;   // přepisuje match.opponent pokud join proběhl
    pairedAt?: string;       // ISO
    /** UID trenéra, který pozvánku vygeneroval (pro audit). */
    invitedBy?: string;
    /** Scope, pod kterým zápas žije (`clubId` nebo `ownerUid`). Potřebné pro
     *  away coach-e: single-doc subscribe k /matches/{ownerScope}/{id}. */
    ownerScope?: string;
  } | null;

  isPublic?: boolean;        // true = sdíleno přes veřejný odkaz pro rodiče
  /**
   * Kdy se veřejně ukáže sestava:
   * - 'atStart' (default) — skryta dokud je status 'planned', odhalí se při začátku zápasu
   * - 'always' — viditelná okamžitě (trenér ji chce ukázat rodičům dopředu)
   */
  lineupVisibility?: 'atStart' | 'always';
  veoUrl?: string;           // odkaz na VEO záznam zápasu

  createdAt: string;
  updatedAt: string;
}

// ─── Public match (GDPR: bez ratings, note, clubId) ──────────────────────────

export interface PublicSeasonMatch {
  id: string;
  ownerUid: string;          // pro Firebase rules
  sport?: import('./sport.types').Sport;
  matchType?: MatchType;
  subMatches?: TennisSubMatch[];
  officialResultsNote?: string;
  officialResultsUrl?: string;
  myPlayerId?: string;
  clubName?: string;
  opponent: string;
  isHome: boolean;
  venue?: string;
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
  sport?: import('./sport.types').Sport;  // NEW: pro sport filter na landing page
  clubName: string;
  opponent: string;
  isHome: boolean;
  venue?: string;
  date: string;
  kickoffTime: string;
  competition: string;
  status: SeasonMatchStatus;
  homeScore: number;
  awayScore: number;
  ownerUid: string;
  updatedAt: string;
  ageCategory?: string;       // věková kategorie (U9, Muži, ...) pro filtry na landingu
}

// ─── Store input ──────────────────────────────────────────────────────────────

export interface CreateSeasonMatchInput {
  sport?: import('./sport.types').Sport;
  matchType?: MatchType;
  subMatches?: TennisSubMatch[];
  officialResultsNote?: string;
  officialResultsUrl?: string;
  myPlayerId?: string;
  clubId: string;
  clubName?: string;
  opponent: string;
  opponentClubId?: string;
  opponentCatalogId?: string;
  isHome: boolean;
  venue?: string;
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
  isQuickMatch?: boolean;
  /** Audit 2026-05-25: creator metadata pro spectator mode (volitelné — fallback z auth context). */
  createdByUid?: string;
  createdByName?: string;
}
