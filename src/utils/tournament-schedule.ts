import type { Team, Match, Standing, TournamentSettings, TiebreakerCriterion, PenaltyResult, GroupDefinition, MatchStage } from '../types/tournament.types';
import { DEFAULT_TIEBREAKER_ORDER } from '../types/tournament.types';
import { generateId } from './id';
import type { Locale } from '../i18n';
import { getDateLocale } from '../i18n';


// ─── Round-robin schedule generator ──────────────────────────────────────────

/**
 * Generuje round-robin harmonogram metodou "circle method".
 * Pro N týmů (zaokrouhlí na sudé přidáním BYE):
 *   - (N-1) rund, každá runda N/2 zápasů
 *   - T[0] fixní, ostatní rotují doprava každou rundu
 *   - Zápasy s BYE tým jsou přeskočeny
 */
export function generateRoundRobinSchedule(
  teams: Team[],
  settings: TournamentSettings
): Match[] {
  if (teams.length < 2) return [];

  const startDateTime = parseStartDateTime(settings);
  const { matchDurationMinutes, breakBetweenMatchesMinutes } = settings;
  const numberOfPitches = settings.numberOfPitches ?? 1;

  // Přidáme BYE pokud lichý počet týmů
  const ids = teams.map(t => t.id);
  const hasBye = ids.length % 2 !== 0;
  if (hasBye) ids.push('BYE');

  const n = ids.length;
  const rounds = n - 1;
  const matchesPerRound = n / 2;

  const matches: Match[] = [];
  let globalMatchIndex = 0;

  for (let round = 0; round < rounds; round++) {
    // Rotace: T[0] fixní, ostatní [1..n-1] rotují
    const rotated = [ids[0], ...rotate(ids.slice(1), round)];

    for (let i = 0; i < matchesPerRound; i++) {
      const home = rotated[i];
      const away = rotated[n - 1 - i];

      // Přeskočit BYE zápasy
      if (home === 'BYE' || away === 'BYE') continue;

      // S více hřišti: každých `numberOfPitches` zápasů tvoří jeden "slot" se stejným časem
      // slotIndex = Math.floor(globalMatchIndex / numberOfPitches)
      const slotIndex = Math.floor(globalMatchIndex / numberOfPitches);
      const pitchNumber = (globalMatchIndex % numberOfPitches) + 1;

      const scheduledTime = computeMatchStartTime(
        startDateTime,
        slotIndex,
        matchDurationMinutes,
        breakBetweenMatchesMinutes
      );

      matches.push({
        id: generateId(),
        homeTeamId: home,
        awayTeamId: away,
        scheduledTime: scheduledTime.toISOString(),
        durationMinutes: matchDurationMinutes,
        status: 'scheduled',
        homeScore: 0,
        awayScore: 0,
        goals: [],
        startedAt: null,
        finishedAt: null,
        pausedAt: null,
        pausedElapsed: 0,
        roundIndex: round,
        matchIndex: globalMatchIndex,
        pitchNumber,
      });

      globalMatchIndex++;
    }
  }

  // Prioritizace domácích týmů — organizátorovy týmy jsou typicky na začátku seznamu.
  // Zápasy, kde hraje tým s nižším indexem, se přesunou na dřívější čas,
  // aby hostující týmy mohly přijet později.
  return prioritizeHomeTeams(matches, teams, settings);
}

/**
 * Přeřadí zápasy tak, aby domácí týmy (nízký index v poli teams) hrály co nejdříve.
 * Zachovává multi-pitch logiku a přepočítá časy.
 */
function prioritizeHomeTeams(matches: Match[], teams: Team[], settings: TournamentSettings): Match[] {
  if (matches.length === 0) return matches;

  const teamIndexMap = new Map(teams.map((t, i) => [t.id, i]));
  const numberOfPitches = settings.numberOfPitches ?? 1;
  const startDateTime = parseStartDateTime(settings);

  // Skóre = nejnižší index týmu v zápase (čím nižší, tím dříve hraje)
  const sorted = [...matches].sort((a, b) => {
    const aMin = Math.min(teamIndexMap.get(a.homeTeamId) ?? 999, teamIndexMap.get(a.awayTeamId) ?? 999);
    const bMin = Math.min(teamIndexMap.get(b.homeTeamId) ?? 999, teamIndexMap.get(b.awayTeamId) ?? 999);
    if (aMin !== bMin) return aMin - bMin;
    // Sekundární: vyšší index druhého týmu = "lehčí" zápas pro schedule
    const aMax = Math.max(teamIndexMap.get(a.homeTeamId) ?? 0, teamIndexMap.get(a.awayTeamId) ?? 0);
    const bMax = Math.max(teamIndexMap.get(b.homeTeamId) ?? 0, teamIndexMap.get(b.awayTeamId) ?? 0);
    return aMax - bMax;
  });

  // Přepočítat matchIndex, slotIndex, pitchNumber a scheduledTime
  return sorted.map((m, idx) => {
    const slotIndex = Math.floor(idx / numberOfPitches);
    const pitchNumber = (idx % numberOfPitches) + 1;
    const scheduledTime = computeMatchStartTime(
      startDateTime, slotIndex,
      settings.matchDurationMinutes, settings.breakBetweenMatchesMinutes,
    );
    return { ...m, matchIndex: idx, pitchNumber, scheduledTime: scheduledTime.toISOString(), roundIndex: slotIndex };
  });
}

/** Rotuje pole doprava o `n` pozic */
function rotate<T>(arr: T[], n: number): T[] {
  const len = arr.length;
  const shift = n % len;
  return [...arr.slice(len - shift), ...arr.slice(0, len - shift)];
}

/** Vypočítá čas začátku zápasu dle globálního indexu */
export function computeMatchStartTime(
  startDateTime: Date,
  matchGlobalIndex: number,
  matchDurationMinutes: number,
  breakMinutes: number
): Date {
  const offsetMs = matchGlobalIndex * (matchDurationMinutes + breakMinutes) * 60 * 1000;
  return new Date(startDateTime.getTime() + offsetMs);
}

/** Parsuje startDate + startTime do Date objektu */
export function parseStartDateTime(settings: TournamentSettings): Date {
  return new Date(`${settings.startDate}T${settings.startTime}:00`);
}

/**
 * Přepočítá matchIndex, scheduledTime a pitchNumber pro zbylé zápasy po odebrání týmu.
 * Odehrané/živé zápasy se přesunou na začátek, naplánované dostanou nové časy.
 */
export function recalculateMatchTimes(
  matches: Match[],
  settings: TournamentSettings,
): Match[] {
  const startDateTime = parseStartDateTime(settings);
  const numberOfPitches = settings.numberOfPitches ?? 1;

  // Oddělíme odehrané/živé (zachovat) a naplánované (přepočítat)
  const kept = matches.filter(m => m.status === 'finished' || m.status === 'live');
  const scheduled = matches.filter(m => m.status === 'scheduled');

  // Odehrané zůstávají na svých indexech; naplánované přečíslujeme za ně
  let nextIndex = kept.length;

  const recalculated = scheduled.map(m => {
    const idx = nextIndex++;
    const slotIndex = Math.floor(idx / numberOfPitches);
    const pitchNumber = (idx % numberOfPitches) + 1;
    const scheduledTime = computeMatchStartTime(
      startDateTime, slotIndex,
      settings.matchDurationMinutes, settings.breakBetweenMatchesMinutes,
    );
    return { ...m, matchIndex: idx, pitchNumber, scheduledTime: scheduledTime.toISOString() };
  });

  return [...kept, ...recalculated];
}

// ─── Standings computation ────────────────────────────────────────────────────

/**
 * Vypočítá tabulku z finished zápasů.
 * Čistá funkce — nikdy neukládáme standings přímo.
 * Řazení: body (vždy #1) → konfigurovatelná kritéria → abeceda (fallback).
 */
export function computeStandings(
  matches: Match[],
  teams: Team[],
  tiebreakerOrder?: TiebreakerCriterion[],
  penaltyResults?: PenaltyResult[],
  /** Include live (in-progress) matches in standings calculation */
  includeLive?: boolean,
): Standing[] {
  const map = new Map<string, Standing>();

  // Inicializace pro všechny týmy
  for (const team of teams) {
    map.set(team.id, {
      teamId: team.id,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    });
  }

  // Zpracování zápasů (finished + optionally live)
  for (const match of matches) {
    if (match.status !== 'finished' && !(includeLive && match.status === 'live')) continue;
    const home = map.get(match.homeTeamId);
    const away = map.get(match.awayTeamId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.won++; home.points += 3; away.lost++;
    } else if (match.homeScore < match.awayScore) {
      away.won++; away.points += 3; home.lost++;
    } else {
      home.drawn++; home.points += 1; away.drawn++; away.points += 1;
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
  }

  const standings = Array.from(map.values());
  const order = tiebreakerOrder ?? DEFAULT_TIEBREAKER_ORDER;
  const penalties = penaltyResults ?? [];

  // Řazení: body (fixní #1) → konfigurovatelná kritéria → abeceda (fallback)
  standings.sort((a, b) => {
    // Body jsou vždy první
    if (b.points !== a.points) return b.points - a.points;

    // Projít konfigurovaná kritéria
    for (const criterion of order) {
      const diff = compareByCriterion(criterion, a, b, matches, penalties);
      if (diff !== 0) return diff;
    }

    // Fallback: abecedně
    const nameA = teams.find(t => t.id === a.teamId)?.name ?? '';
    const nameB = teams.find(t => t.id === b.teamId)?.name ?? '';
    return nameA.localeCompare(nameB, 'cs');
  });

  return standings;
}

/** Porovná dva týmy podle jednoho kritéria. Vrátí záporné číslo pokud A je lepší. */
function compareByCriterion(
  criterion: TiebreakerCriterion,
  a: Standing, b: Standing,
  matches: Match[],
  penaltyResults: PenaltyResult[],
): number {
  switch (criterion) {
    case 'h2h': {
      const h2hA = headToHeadPoints(a.teamId, b.teamId, matches);
      const h2hB = headToHeadPoints(b.teamId, a.teamId, matches);
      return h2hB - h2hA;
    }
    case 'goalDifference':
      return b.goalDifference - a.goalDifference;
    case 'goalsFor':
      return b.goalsFor - a.goalsFor;
    case 'goalsAgainst':
      return a.goalsAgainst - b.goalsAgainst; // méně obdržených = lepší
    case 'penalties': {
      const pr = penaltyResults.find(
        p => (p.teamAId === a.teamId && p.teamBId === b.teamId) ||
             (p.teamAId === b.teamId && p.teamBId === a.teamId),
      );
      if (!pr) return 0; // ještě nezadáno
      const aScore = pr.teamAId === a.teamId ? pr.teamAScore : pr.teamBScore;
      const bScore = pr.teamAId === b.teamId ? pr.teamAScore : pr.teamBScore;
      return bScore - aScore;
    }
    default:
      return 0;
  }
}

/** Body získané týmem A ve vzájemném zápase(zápasech) proti týmu B. */
function headToHeadPoints(teamAId: string, teamBId: string, matches: Match[]): number {
  let pts = 0;
  for (const m of matches) {
    if (m.status !== 'finished') continue;
    if (m.homeTeamId === teamAId && m.awayTeamId === teamBId) {
      if (m.homeScore > m.awayScore) pts += 3;
      else if (m.homeScore === m.awayScore) pts += 1;
    } else if (m.homeTeamId === teamBId && m.awayTeamId === teamAId) {
      if (m.awayScore > m.homeScore) pts += 3;
      else if (m.awayScore === m.homeScore) pts += 1;
    }
  }
  return pts;
}

// ─── Live match timer helpers ─────────────────────────────────────────────────

/**
 * Vrátí počet uplynulých sekund od začátku zápasu.
 * Respektuje pauzu: pokud je zápas pozastaven, vrátí zamrzlý čas.
 * Vrátí 0 pokud zápas ještě nezačal.
 */
export function computeMatchElapsed(
  startedAt: string | null,
  pausedAt?: string | null,
  pausedElapsed?: number
): number {
  if (!startedAt) return 0;
  // Zápas je pozastaven → vrátit zamrzlý čas
  if (pausedAt) return pausedElapsed ?? 0;
  // Normální běh: čas od startu + případný dříve nashromážděný čas z předchozích pauuz
  const sinceStart = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  return sinceStart + (pausedElapsed ?? 0);
}

/**
 * Vrátí aktuální minutu zápasu (1-based).
 * Např. po 65 sekundách vrátí 2, po 0 sekundách vrátí 1.
 */
export function computeCurrentMinute(
  startedAt: string | null,
  pausedAt?: string | null,
  pausedElapsed?: number
): number {
  return Math.floor(computeMatchElapsed(startedAt, pausedAt, pausedElapsed) / 60) + 1;
}

/**
 * Formátuje sekundy jako "MM:SS".
 * Pokud překročí délku zápasu, zobrazí "+MM:SS" (nadčas).
 */
export function formatElapsedTime(elapsedSeconds: number, durationMinutes: number): string {
  const totalSeconds = durationMinutes * 60;
  const isOvertime = elapsedSeconds > totalSeconds;
  const seconds = isOvertime ? elapsedSeconds - totalSeconds : elapsedSeconds;
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');
  return isOvertime ? `+${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formátuje ISO timestamp na "HH:MM" (vždy 24h formát) */
export function formatMatchTime(isoString: string, locale: Locale): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString(getDateLocale(locale), { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Formátuje ISO datum na "Pá 5. dubna 2025" */
export function formatMatchDate(isoString: string, locale: Locale): string {
  const d = new Date(isoString);
  return d.toLocaleDateString(getDateLocale(locale), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Odhadne celkovou délku turnaje v minutách */
export function estimateTournamentDuration(
  numberOfTeams: number,
  settings: TournamentSettings
): number {
  const format = settings.format ?? 'round-robin';
  let realMatches: number;

  if (format !== 'round-robin' && settings.groups && settings.groups.length > 0) {
    // Skupiny + playoff (+ play-out): přesný výpočet
    realMatches = countTotalMatchesForSettings(settings, numberOfTeams);
  } else {
    // Round-robin: n*(n-1)/2 s BYE korekcí
    const n = numberOfTeams % 2 === 0 ? numberOfTeams : numberOfTeams + 1;
    const totalMatches = (n * (n - 1)) / 2;
    const byeMatches = numberOfTeams % 2 !== 0 ? (n - 1) : 0;
    realMatches = totalMatches - byeMatches;
  }

  const numberOfPitches = settings.numberOfPitches ?? 1;
  const slots = Math.ceil(realMatches / numberOfPitches);
  if (slots <= 0) return 0;
  return slots * settings.matchDurationMinutes + (slots - 1) * settings.breakBetweenMatchesMinutes;
}

/** Vrátí počet skutečných zápasů pro N týmů */
export function countRealMatches(numberOfTeams: number): number {
  return (numberOfTeams * (numberOfTeams - 1)) / 2;
}

/**
 * Spočítá celkový počet zápasů pro dané settings (skupiny, playoff, play-out).
 * Zahrnuje: skupinové zápasy + playoff (SF+F+3rd) + play-out (pokud zapnutý).
 */
export function countTotalMatchesForSettings(settings: TournamentSettings, teamCount: number): number {
  const format = settings.format ?? 'round-robin';
  const groups = settings.groups ?? [];
  const advance = settings.advancePerGroup ?? 1;
  const thirdPlace = settings.thirdPlaceMatch ?? false;
  const playOut = settings.playOut ?? false;

  if (format === 'round-robin' || groups.length === 0) {
    return (teamCount * (teamCount - 1)) / 2;
  }

  // Skupinové zápasy
  let groupMatches = 0;
  for (const g of groups) {
    const n = g.teamIds.length;
    groupMatches += (n * (n - 1)) / 2;
  }

  // Playoff
  let playoffTeams: number;
  if (groups.length === 3 && advance === 1) {
    playoffTeams = 4; // 3 vítězové + best 2nd
  } else {
    playoffTeams = advance * groups.length;
  }

  let playoffMatches = 0;
  if (playoffTeams <= 2) {
    playoffMatches = 1 + (thirdPlace ? 1 : 0);
  } else if (playoffTeams <= 4) {
    playoffMatches = 2 + 1 + (thirdPlace ? 1 : 0); // 2 SF + F + 3rd
  } else {
    playoffMatches = 4 + 2 + 1 + (thirdPlace ? 1 : 0); // 4 QF + 2 SF + F + 3rd
  }

  // Play-out (jen pro 2 skupiny)
  let playOutMatches = 0;
  if (playOut && groups.length === 2) {
    const sizes = groups.map(g => g.teamIds.length);
    const minSize = Math.min(...sizes);
    playOutMatches = Math.max(0, minSize - advance);
  }

  return groupMatches + playoffMatches + playOutMatches;
}

// ─── Group stage schedule ───────────────────────────────────────────────────

/**
 * Generuje round-robin zápasy uvnitř skupin.
 * Každá skupina hraje vlastní miniligový turnaj.
 */
export function generateGroupStageSchedule(
  _teams: Team[],
  settings: TournamentSettings,
): Match[] {
  const groups = settings.groups ?? [];
  if (groups.length === 0) return [];

  const startDateTime = parseStartDateTime(settings);
  const { matchDurationMinutes, breakBetweenMatchesMinutes } = settings;
  const numberOfPitches = settings.numberOfPitches ?? 1;

  // 1) Vygeneruj zápasy per skupina per kolo (bez přiřazení časů)
  type RawMatch = { home: string; away: string; groupId: string; round: number };
  const matchesByRound: RawMatch[][] = []; // [round][match]

  for (const group of groups) {
    const groupTeams = group.teamIds;
    if (groupTeams.length < 2) continue;

    const ids = [...groupTeams];
    const hasBye = ids.length % 2 !== 0;
    if (hasBye) ids.push('BYE');

    const n = ids.length;
    const rounds = n - 1;
    const matchesPerRound = n / 2;

    for (let round = 0; round < rounds; round++) {
      if (!matchesByRound[round]) matchesByRound[round] = [];
      const rotated = [ids[0], ...rotate(ids.slice(1), round)];

      for (let i = 0; i < matchesPerRound; i++) {
        const home = rotated[i];
        const away = rotated[n - 1 - i];
        if (home === 'BYE' || away === 'BYE') continue;

        matchesByRound[round].push({ home, away, groupId: group.id, round });
      }
    }
  }

  // 2) Prokládej kola — kolo 1 všech skupin, kolo 2 všech skupin, atd.
  // Uvnitř kola: střídej skupiny (A zápas, B zápas, A zápas, B zápas...)
  const allMatches: Match[] = [];
  let globalMatchIndex = 0;

  for (const roundMatches of matchesByRound) {
    if (!roundMatches) continue;

    // Seřadit uvnitř kola: střídavě skupiny (A, B, C, A, B, C...)
    const byGroup = new Map<string, RawMatch[]>();
    for (const m of roundMatches) {
      const arr = byGroup.get(m.groupId) ?? [];
      arr.push(m);
      byGroup.set(m.groupId, arr);
    }
    const groupQueues = [...byGroup.values()];
    const interleaved: RawMatch[] = [];
    const maxLen = Math.max(...groupQueues.map(q => q.length));
    for (let i = 0; i < maxLen; i++) {
      for (const queue of groupQueues) {
        if (i < queue.length) interleaved.push(queue[i]);
      }
    }

    for (const raw of interleaved) {
      const slotIndex = Math.floor(globalMatchIndex / numberOfPitches);
      const pitchNumber = (globalMatchIndex % numberOfPitches) + 1;
      const scheduledTime = computeMatchStartTime(startDateTime, slotIndex, matchDurationMinutes, breakBetweenMatchesMinutes);

      allMatches.push({
        id: generateId(),
        homeTeamId: raw.home,
        awayTeamId: raw.away,
        scheduledTime: scheduledTime.toISOString(),
        durationMinutes: matchDurationMinutes,
        status: 'scheduled',
        homeScore: 0, awayScore: 0, goals: [],
        startedAt: null, finishedAt: null, pausedAt: null, pausedElapsed: 0,
        roundIndex: raw.round,
        matchIndex: globalMatchIndex,
        pitchNumber,
        stage: 'group',
        groupId: raw.groupId,
      });

      globalMatchIndex++;
    }
  }

  return allMatches;
}

// ─── Knockout bracket generator ─────────────────────────────────────────────

/**
 * Vrátí fázi zápasu na základě pozice v bracket placeholders.
 *
 * Placeholders jdou v pořadí: [QF..., SF..., F, (3rd)].
 * Pro 4 týmy: [SF1, SF2, F, 3rd] = pozice 0,1,2,3.
 * Pro 8 týmů: [QF1..QF4, SF1,SF2, F, 3rd] = pozice 0-3,4-5,6,7.
 */
function stageForBracketSize(totalTeams: number, bracketPos: number, thirdPlace: boolean): MatchStage {
  const matchCount = totalTeams - 1 + (thirdPlace ? 1 : 0);

  // Zápas o 3. místo je vždy POSLEDNÍ
  if (thirdPlace && bracketPos === matchCount - 1) return 'third-place';

  // Finále je vždy PŘEDPOSLEDNÍ (nebo poslední bez 3. místa)
  const finalPos = thirdPlace ? matchCount - 2 : matchCount - 1;
  if (bracketPos === finalPos) return 'final';

  // Pro 4 týmy: pozice 0,1 = SF (žádné QF)
  if (totalTeams <= 4) return 'semifinal';

  // Pro 8 týmů: pozice 0-3 = QF, 4-5 = SF
  const qfCount = totalTeams / 2;
  if (bracketPos < qfCount) return 'quarterfinal';
  return 'semifinal';
}

/**
 * Generuje prázdný knockout bracket z placeholder týmů.
 * afterIdx = globální matchIndex kde bracket začíná (za skupinovou fází).
 */
export function generateKnockoutBracket(
  teamCount: number,
  settings: TournamentSettings,
  afterIdx: number,
  placeholders: Array<{ home: string; away: string }>,
): Match[] {
  const startDateTime = parseStartDateTime(settings);
  const { matchDurationMinutes, breakBetweenMatchesMinutes } = settings;
  const numberOfPitches = settings.numberOfPitches ?? 1;
  const thirdPlace = settings.thirdPlaceMatch ?? false;

  const matches: Match[] = [];
  let globalIdx = afterIdx;

  // Vygenerujeme zápasy dle placeholders
  for (let i = 0; i < placeholders.length; i++) {
    const slotIndex = Math.floor(globalIdx / numberOfPitches);
    const pitchNumber = (globalIdx % numberOfPitches) + 1;
    const scheduledTime = computeMatchStartTime(startDateTime, slotIndex, matchDurationMinutes, breakBetweenMatchesMinutes);

    const stage = stageForBracketSize(teamCount, i, thirdPlace);

    matches.push({
      id: generateId(),
      homeTeamId: '',    // prázdné — vyplní se po skupinové fázi
      awayTeamId: '',
      scheduledTime: scheduledTime.toISOString(),
      durationMinutes: matchDurationMinutes,
      status: 'scheduled',
      homeScore: 0, awayScore: 0, goals: [],
      startedAt: null, finishedAt: null, pausedAt: null, pausedElapsed: 0,
      roundIndex: 1000 + i, // vysoké číslo aby se lišilo od skupinových rund
      matchIndex: globalIdx,
      pitchNumber,
      stage,
      bracketPosition: i,
      homeTeamPlaceholder: placeholders[i].home,
      awayTeamPlaceholder: placeholders[i].away,
    });

    globalIdx++;
  }

  // Nastavit nextMatchId: vítěz zápasu [i] postupuje do zápasu [sfStart + Math.floor(i / 2)]
  const halfCount = Math.floor(teamCount / 2);
  for (let i = 0; i < halfCount; i++) {
    if (i < matches.length) {
      const nextIdx = halfCount + Math.floor(i / 2);
      if (nextIdx < matches.length) {
        matches[i].nextMatchId = matches[nextIdx].id;
      }
    }
  }

  // Semifinále → finále
  if (thirdPlace) {
    // SF vítězové → finále (poslední), SF poražení → 3. místo (předposlední)
    const sfMatches = matches.filter(m => m.stage === 'semifinal');
    const finalMatch = matches.find(m => m.stage === 'final');
    const thirdMatch = matches.find(m => m.stage === 'third-place');
    for (const sf of sfMatches) {
      if (finalMatch) sf.nextMatchId = finalMatch.id;
      // third-place se nastaví speciálně — poražení
    }
    if (thirdMatch) {
      thirdMatch.homeTeamPlaceholder = 'Poražený SF 1';
      thirdMatch.awayTeamPlaceholder = 'Poražený SF 2';
    }
  } else {
    const sfMatches = matches.filter(m => m.stage === 'semifinal');
    const finalMatch = matches.find(m => m.stage === 'final');
    for (const sf of sfMatches) {
      if (finalMatch) sf.nextMatchId = finalMatch.id;
    }
  }

  return matches;
}

/**
 * Generuje kompletní groups+knockout rozpis.
 */
export function generateGroupsKnockoutSchedule(
  teams: Team[],
  settings: TournamentSettings,
): Match[] {
  const groupMatches = generateGroupStageSchedule(teams, settings);
  const afterIdx = groupMatches.length;

  // Spočítej počet postupujících
  const groups = settings.groups ?? [];
  const advance = settings.advancePerGroup ?? 1;
  const thirdPlace = settings.thirdPlaceMatch ?? false;

  // Vygeneruj placeholders pro knockout
  const placeholders = generateGroupKnockoutPlaceholders(groups, advance, thirdPlace);

  // Pro 3 skupiny s advance=1: skutečně postupují 4 týmy (3 vítězové + nejlepší 2.)
  // Počet playoff týmů = počet SF placeholders × 2 (= kolik jich hraje první kolo)
  const sfPlaceholders = placeholders.filter(p =>
    !p.home.startsWith('Vítěz') && !p.home.startsWith('Poražený'),
  );
  const playoffTeams = sfPlaceholders.length * 2;

  const knockoutMatches = generateKnockoutBracket(playoffTeams, settings, afterIdx, placeholders);

  // Play-out: zápasy o všechna umístění za hlavním playoff
  const playOut = settings.playOut ?? false;
  let playOutMatches: Match[] = [];
  if (playOut) {
    const playOutPlaceholders = generatePlayOutPlaceholders(groups, advance);
    const playOutStartIdx = afterIdx + knockoutMatches.length;
    const startDateTime = parseStartDateTime(settings);
    const { matchDurationMinutes, breakBetweenMatchesMinutes } = settings;
    const numberOfPitches = settings.numberOfPitches ?? 1;

    let globalIdx = playOutStartIdx;
    playOutMatches = playOutPlaceholders.map(p => {
      const slotIndex = Math.floor(globalIdx / numberOfPitches);
      const pitchNumber = (globalIdx % numberOfPitches) + 1;
      const scheduledTime = computeMatchStartTime(startDateTime, slotIndex, matchDurationMinutes, breakBetweenMatchesMinutes);
      const match: Match = {
        id: generateId(),
        homeTeamId: '',
        awayTeamId: '',
        scheduledTime: scheduledTime.toISOString(),
        durationMinutes: matchDurationMinutes,
        status: 'scheduled',
        homeScore: 0, awayScore: 0, goals: [],
        startedAt: null, finishedAt: null, pausedAt: null, pausedElapsed: 0,
        roundIndex: 2000 + globalIdx, // vysoké číslo pro play-out
        matchIndex: globalIdx,
        pitchNumber,
        stage: 'placement',
        bracketPosition: globalIdx - playOutStartIdx,
        homeTeamPlaceholder: p.home,
        awayTeamPlaceholder: p.away,
        placementLabel: p.placementLabel,
      };
      globalIdx++;
      return match;
    });
  }

  // Správné pořadí: skupiny → SF/QF → play-out (od nejnižšího) → O 3. místo → Finále
  // Knockout matches obsahují SF, F, 3rd — potřebujeme vložit play-out PŘED 3rd a F
  if (playOutMatches.length > 0) {
    const sfQf = knockoutMatches.filter(m => m.stage === 'quarterfinal' || m.stage === 'semifinal');
    const thirdPlaceMatch = knockoutMatches.filter(m => m.stage === 'third-place');
    const finalMatch = knockoutMatches.filter(m => m.stage === 'final');
    // Play-out: od nejvyššího čísla (O 9.) dolů k nejnižšímu (O 5.)
    const playOutReversed = [...playOutMatches].reverse();

    const allPostGroup = [...sfQf, ...playOutReversed, ...thirdPlaceMatch, ...finalMatch];
    // Přečíslovat matchIndex a scheduledTime
    const startDateTime = parseStartDateTime(settings);
    const { matchDurationMinutes, breakBetweenMatchesMinutes } = settings;
    const numberOfPitches = settings.numberOfPitches ?? 1;
    allPostGroup.forEach((m, i) => {
      const globalIdx = afterIdx + i;
      m.matchIndex = globalIdx;
      const slotIndex = Math.floor(globalIdx / numberOfPitches);
      m.pitchNumber = (globalIdx % numberOfPitches) + 1;
      m.scheduledTime = computeMatchStartTime(startDateTime, slotIndex, matchDurationMinutes, breakBetweenMatchesMinutes).toISOString();
    });

    return [...groupMatches, ...allPostGroup];
  }

  return [...groupMatches, ...knockoutMatches];
}

/** Generuje placeholder texty pro knockout bracket z výsledků skupin */
function generateGroupKnockoutPlaceholders(
  groups: GroupDefinition[],
  advance: number,
  thirdPlace: boolean,
): Array<{ home: string; away: string }> {
  const placeholders: Array<{ home: string; away: string }> = [];

  if (groups.length === 2 && advance === 1) {
    // 2 skupiny, 1 postupující → rovnou finále
    placeholders.push({ home: `1. ${groups[0].name}`, away: `1. ${groups[1].name}` });
    if (thirdPlace) {
      placeholders.push({ home: `2. ${groups[0].name}`, away: `2. ${groups[1].name}` });
    }
  } else if (groups.length === 2 && advance === 2) {
    // 2 skupiny, 2 postupující → semifinále + finále
    placeholders.push({ home: `1. ${groups[0].name}`, away: `2. ${groups[1].name}` });
    placeholders.push({ home: `1. ${groups[1].name}`, away: `2. ${groups[0].name}` });
    placeholders.push({ home: 'Vítěz SF 1', away: 'Vítěz SF 2' });
    if (thirdPlace) {
      placeholders.push({ home: 'Poražený SF 1', away: 'Poražený SF 2' });
    }
  } else if (groups.length === 4 && advance === 1) {
    // 4 skupiny, 1 postupující → semifinále + finále
    placeholders.push({ home: `1. ${groups[0].name}`, away: `1. ${groups[1].name}` });
    placeholders.push({ home: `1. ${groups[2].name}`, away: `1. ${groups[3].name}` });
    placeholders.push({ home: 'Vítěz SF 1', away: 'Vítěz SF 2' });
    if (thirdPlace) {
      placeholders.push({ home: 'Poražený SF 1', away: 'Poražený SF 2' });
    }
  } else if (groups.length === 3) {
    // 3 skupiny → vždy 3 vítězové + 1 nejlepší druhý = 4 týmy → SF + F.
    // (i když advance=2, 6 týmů se nedá čistě rozdělit do bracketu, proto
    // vždy používáme 4 postupující = nejčistší formát pro 3 skupiny)
    placeholders.push({ home: `1. ${groups[0].name}`, away: `Nejlepší 2. místo` });
    placeholders.push({ home: `1. ${groups[1].name}`, away: `1. ${groups[2].name}` });
    placeholders.push({ home: 'Vítěz SF 1', away: 'Vítěz SF 2' });
    if (thirdPlace) {
      placeholders.push({ home: 'Poražený SF 1', away: 'Poražený SF 2' });
    }
  } else if (groups.length === 4 && advance === 2) {
    // 4 skupiny, 2 postupující → QF + SF + F
    placeholders.push({ home: `1. ${groups[0].name}`, away: `2. ${groups[1].name}` });
    placeholders.push({ home: `1. ${groups[1].name}`, away: `2. ${groups[0].name}` });
    placeholders.push({ home: `1. ${groups[2].name}`, away: `2. ${groups[3].name}` });
    placeholders.push({ home: `1. ${groups[3].name}`, away: `2. ${groups[2].name}` });
    // SF
    placeholders.push({ home: 'Vítěz QF 1', away: 'Vítěz QF 2' });
    placeholders.push({ home: 'Vítěz QF 3', away: 'Vítěz QF 4' });
    // F
    placeholders.push({ home: 'Vítěz SF 1', away: 'Vítěz SF 2' });
    if (thirdPlace) {
      placeholders.push({ home: 'Poražený SF 1', away: 'Poražený SF 2' });
    }
  } else {
    // Fallback: jednoduchý bracket
    const totalPlayoff = groups.length * advance;
    for (let i = 0; i < Math.floor(totalPlayoff / 2); i++) {
      placeholders.push({ home: `Tým ${i * 2 + 1}`, away: `Tým ${i * 2 + 2}` });
    }
  }

  return placeholders;
}

/**
 * Generuje play-out placeholders — zápasy o VŠECHNA umístění za hlavním playoff.
 *
 * Pro 2 skupiny (A=n, B=m týmů), advance=k:
 * - Hlavní playoff řeší pozice 1–(2k) (SF+F+3rd) — to generuje generateGroupKnockoutPlaceholders.
 * - Play-out doplní zápasy pro pozice (2k+1) až (n+m):
 *   Páruje se stejná pozice z obou skupin: (k+1)A vs (k+1)B → O (2k+1). místo,
 *   (k+2)A vs (k+2)B → O (2k+3). místo, atd.
 *   Vítěz dostane lepší umístění, poražený horší.
 *
 * Výsledek: KAŽDÝ tým odchází s konkrétním umístěním a diplomem.
 *
 * Pro 3+ skupiny: play-out se negeneruje (příliš složitá logika křížení).
 */
function generatePlayOutPlaceholders(
  groups: GroupDefinition[],
  advance: number,
): Array<{ home: string; away: string; placementLabel: string }> {
  if (groups.length !== 2) return [];

  const sizeA = groups[0].teamIds.length;
  const sizeB = groups[1].teamIds.length;
  const minSize = Math.min(sizeA, sizeB);
  const nameA = groups[0].name;
  const nameB = groups[1].name;

  const result: Array<{ home: string; away: string; placementLabel: string }> = [];

  // Párování od pozice advance+1 dolů (ty co nepostupují do hlavního playoff)
  for (let pos = advance + 1; pos <= minSize; pos++) {
    const betterPlace = (pos - 1) * 2 + 1; // O 5., 7., 9. místo atd.
    result.push({
      home: `${pos}. ${nameA}`,
      away: `${pos}. ${nameB}`,
      placementLabel: `O ${betterPlace}. místo`,
    });
  }

  return result;
}

/**
 * Generuje čistý vyřazovací turnaj (bez skupin).
 */
export function generatePureKnockoutSchedule(
  teams: Team[],
  settings: TournamentSettings,
): Match[] {
  const n = teams.length;
  if (n < 2) return [];

  // Doplň na mocninu 2 (bye)
  const bracket = nextPowerOf2(n);
  const thirdPlace = settings.thirdPlaceMatch ?? false;

  const placeholders: Array<{ home: string; away: string }> = [];

  // První kolo
  for (let i = 0; i < bracket / 2; i++) {
    const homeIdx = i;
    const awayIdx = bracket - 1 - i;
    const home = homeIdx < n ? teams[homeIdx].name : 'BYE';
    const away = awayIdx < n ? teams[awayIdx].name : 'BYE';
    placeholders.push({ home, away });
  }

  // Další kola (SF, F)
  const rounds = Math.log2(bracket);
  let matchesInRound = bracket / 2;
  for (let r = 1; r < rounds; r++) {
    matchesInRound = matchesInRound / 2;
    for (let i = 0; i < matchesInRound; i++) {
      const stageName = matchesInRound === 1 ? 'Finále' : `Vítěz ${i * 2 + 1}`;
      const stageAway = matchesInRound === 1 ? '' : `Vítěz ${i * 2 + 2}`;
      placeholders.push({ home: stageName, away: stageAway || `Vítěz ${i * 2 + 2}` });
    }
  }

  if (thirdPlace) {
    placeholders.push({ home: 'Poražený SF 1', away: 'Poražený SF 2' });
  }

  // Generuj zápasy
  const startDateTime = parseStartDateTime(settings);
  const { matchDurationMinutes, breakBetweenMatchesMinutes } = settings;
  const numberOfPitches = settings.numberOfPitches ?? 1;
  const matches: Match[] = [];

  // Reálné přiřazení týmů do prvního kola
  for (let i = 0; i < bracket / 2; i++) {
    const homeIdx = i;
    const awayIdx = bracket - 1 - i;
    const homeTeam = homeIdx < n ? teams[homeIdx] : null;
    const awayTeam = awayIdx < n ? teams[awayIdx] : null;

    // BYE: přeskočit (vítěz postupuje automaticky)
    if (!homeTeam || !awayTeam) continue;

    const slotIndex = Math.floor(matches.length / numberOfPitches);
    const pitchNumber = (matches.length % numberOfPitches) + 1;
    const scheduledTime = computeMatchStartTime(startDateTime, slotIndex, matchDurationMinutes, breakBetweenMatchesMinutes);

    const stage: MatchStage = bracket <= 4 ? 'semifinal' : (bracket <= 2 ? 'final' : 'quarterfinal');

    matches.push({
      id: generateId(),
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      scheduledTime: scheduledTime.toISOString(),
      durationMinutes: matchDurationMinutes,
      status: 'scheduled',
      homeScore: 0, awayScore: 0, goals: [],
      startedAt: null, finishedAt: null, pausedAt: null, pausedElapsed: 0,
      roundIndex: 0,
      matchIndex: matches.length,
      pitchNumber,
      stage,
      bracketPosition: i,
      homeTeamPlaceholder: homeTeam.name,
      awayTeamPlaceholder: awayTeam.name,
    });
  }

  // Vyšší kola — prázdné zápasy s placeholders
  let roundOffset = 1;
  matchesInRound = bracket / 4; // SF a výš
  while (matchesInRound >= 1) {
    for (let i = 0; i < matchesInRound; i++) {
      const slotIndex = Math.floor(matches.length / numberOfPitches);
      const pitchNumber = (matches.length % numberOfPitches) + 1;
      const scheduledTime = computeMatchStartTime(startDateTime, slotIndex, matchDurationMinutes, breakBetweenMatchesMinutes);

      const stage: MatchStage = matchesInRound === 1 ? 'final' : 'semifinal';

      matches.push({
        id: generateId(),
        homeTeamId: '',
        awayTeamId: '',
        scheduledTime: scheduledTime.toISOString(),
        durationMinutes: matchDurationMinutes,
        status: 'scheduled',
        homeScore: 0, awayScore: 0, goals: [],
        startedAt: null, finishedAt: null, pausedAt: null, pausedElapsed: 0,
        roundIndex: roundOffset,
        matchIndex: matches.length,
        pitchNumber,
        stage,
        bracketPosition: matches.length,
        homeTeamPlaceholder: `Vítěz ${i * 2 + 1}`,
        awayTeamPlaceholder: `Vítěz ${i * 2 + 2}`,
      });
    }
    matchesInRound = matchesInRound / 2;
    roundOffset++;
  }

  // Zápas o 3. místo
  if (thirdPlace && matches.length >= 2) {
    const slotIndex = Math.floor(matches.length / numberOfPitches);
    const pitchNumber = (matches.length % numberOfPitches) + 1;
    const scheduledTime = computeMatchStartTime(startDateTime, slotIndex, matchDurationMinutes, breakBetweenMatchesMinutes);

    matches.push({
      id: generateId(),
      homeTeamId: '',
      awayTeamId: '',
      scheduledTime: scheduledTime.toISOString(),
      durationMinutes: matchDurationMinutes,
      status: 'scheduled',
      homeScore: 0, awayScore: 0, goals: [],
      startedAt: null, finishedAt: null, pausedAt: null, pausedElapsed: 0,
      roundIndex: roundOffset,
      matchIndex: matches.length,
      pitchNumber,
      stage: 'third-place',
      bracketPosition: matches.length,
      homeTeamPlaceholder: 'Poražený SF 1',
      awayTeamPlaceholder: 'Poražený SF 2',
    });
  }

  // Nastavit nextMatchId řetězy
  setupNextMatchLinks(matches);

  return matches;
}

/** Nastaví nextMatchId: vítěz zápasu v nižším kole postupuje do vyššího */
function setupNextMatchLinks(matches: Match[]): void {
  const byStage: Record<string, Match[]> = {};
  for (const m of matches) {
    const s = m.stage ?? 'group';
    if (!byStage[s]) byStage[s] = [];
    byStage[s].push(m);
  }

  // QF → SF
  if (byStage['quarterfinal'] && byStage['semifinal']) {
    const qf = byStage['quarterfinal'];
    const sf = byStage['semifinal'];
    for (let i = 0; i < qf.length && Math.floor(i / 2) < sf.length; i++) {
      qf[i].nextMatchId = sf[Math.floor(i / 2)].id;
    }
  }

  // SF → Final
  if (byStage['semifinal'] && byStage['final']) {
    const sf = byStage['semifinal'];
    const f = byStage['final'][0];
    for (const s of sf) {
      s.nextMatchId = f.id;
    }
  }
}

/** Nejbližší mocnina 2 >= n */
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Po dokončení skupinových zápasů nasadí vítěze skupin do knockout bracket.
 * Vrátí aktualizované zápasy (immutable).
 */
export function advanceTeamsFromGroups(
  matches: Match[],
  teams: Team[],
  settings: TournamentSettings,
): Match[] {
  const groups = settings.groups ?? [];

  // Spočítej tabulky pro každou skupinu
  const groupResults: Map<string, string[]> = new Map();

  for (const group of groups) {
    const groupMatches = matches.filter(m => m.groupId === group.id && m.stage === 'group');
    // Nasadit výsledky skupiny jen pokud jsou VŠECHNY její zápasy dohrané
    const allFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished');
    if (allFinished) {
      const groupTeams = teams.filter(t => group.teamIds.includes(t.id));
      const standings = computeStandings(groupMatches, groupTeams, settings.tiebreakerOrder, settings.penaltyResults);
      // Uložit VŠECHNY pozice (ne jen advance) — play-out potřebuje i 3., 4., 5. místo
      groupResults.set(group.id, standings.map(s => s.teamId));
    }
  }

  // Nasaď do knockout zápasů dle placeholderů
  return matches.map(m => {
    if (m.stage === 'group' || !m.homeTeamPlaceholder) return m;

    const resolvedHome = resolvePlaceholder(m.homeTeamPlaceholder, groupResults, groups, matches);
    const resolvedAway = resolvePlaceholder(m.awayTeamPlaceholder ?? '', groupResults, groups, matches);

    if (resolvedHome || resolvedAway) {
      return {
        ...m,
        homeTeamId: resolvedHome ?? m.homeTeamId,
        awayTeamId: resolvedAway ?? m.awayTeamId,
      };
    }

    return m;
  });
}

/** Rozřeší placeholder text na teamId (pokud je dostupný) */
function resolvePlaceholder(
  placeholder: string,
  groupResults: Map<string, string[]>,
  groups: GroupDefinition[],
  matches: Match[],
): string | null {
  // "1. Skupina A" → 1. místo ve skupině A
  for (const group of groups) {
    const match1 = placeholder.match(new RegExp(`^(\\d+)\\. ${group.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    if (match1) {
      const position = parseInt(match1[1]) - 1;
      const results = groupResults.get(group.id);
      return results?.[position] ?? null;
    }
  }

  // "Vítěz SF 1" → vítěz 1. semifinále
  const winnerMatch = placeholder.match(/^Vítěz (QF|SF) (\d+)$/);
  if (winnerMatch) {
    const stageMap: Record<string, MatchStage> = { QF: 'quarterfinal', SF: 'semifinal' };
    const stage = stageMap[winnerMatch[1]];
    const idx = parseInt(winnerMatch[2]) - 1;
    const stageMatches = matches.filter(m => m.stage === stage).sort((a, b) => a.matchIndex - b.matchIndex);
    const sourceMatch = stageMatches[idx];
    if (sourceMatch?.status === 'finished' && sourceMatch.homeScore !== sourceMatch.awayScore) {
      return sourceMatch.homeScore > sourceMatch.awayScore ? sourceMatch.homeTeamId : sourceMatch.awayTeamId;
    }
  }

  // "Poražený SF 1" → poražený semifinále
  const loserMatch = placeholder.match(/^Poražený (SF) (\d+)$/);
  if (loserMatch) {
    const stage: MatchStage = 'semifinal';
    const idx = parseInt(loserMatch[2]) - 1;
    const stageMatches = matches.filter(m => m.stage === stage).sort((a, b) => a.matchIndex - b.matchIndex);
    const sourceMatch = stageMatches[idx];
    if (sourceMatch?.status === 'finished' && sourceMatch.homeScore !== sourceMatch.awayScore) {
      return sourceMatch.homeScore > sourceMatch.awayScore ? sourceMatch.awayTeamId : sourceMatch.homeTeamId;
    }
  }

  return null;
}

export { generateId };
