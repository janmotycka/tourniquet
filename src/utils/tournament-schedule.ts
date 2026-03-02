import type { Team, Match, Standing, TournamentSettings, TiebreakerCriterion, PenaltyResult, GroupDefinition, MatchStage } from '../types/tournament.types';
import { DEFAULT_TIEBREAKER_ORDER } from '../types/tournament.types';
import { generateId } from './id';


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

  return matches;
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

  // Zpracování dokončených zápasů
  for (const match of matches) {
    if (match.status !== 'finished') continue;
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
export function formatMatchTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Formátuje ISO datum na "Pá 5. dubna 2025" */
export function formatMatchDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Odhadne celkovou délku turnaje v minutách */
export function estimateTournamentDuration(
  numberOfTeams: number,
  settings: TournamentSettings
): number {
  const n = numberOfTeams % 2 === 0 ? numberOfTeams : numberOfTeams + 1;
  const totalMatches = (n * (n - 1)) / 2;
  // Odečteme BYE zápasy
  const byeMatches = numberOfTeams % 2 !== 0 ? (n - 1) : 0;
  const realMatches = totalMatches - byeMatches;
  const numberOfPitches = settings.numberOfPitches ?? 1;
  // S více hřišti probíhají zápasy paralelně — celkový čas se dělí počtem hřišť
  const slots = Math.ceil(realMatches / numberOfPitches);
  if (slots <= 0) return 0;
  return slots * settings.matchDurationMinutes + (slots - 1) * settings.breakBetweenMatchesMinutes;
}

/** Vrátí počet skutečných zápasů pro N týmů */
export function countRealMatches(numberOfTeams: number): number {
  return (numberOfTeams * (numberOfTeams - 1)) / 2;
}

// ─── Group stage schedule ───────────────────────────────────────────────────

/**
 * Generuje round-robin zápasy uvnitř skupin.
 * Každá skupina hraje vlastní miniligový turnaj.
 */
export function generateGroupStageSchedule(
  teams: Team[],
  settings: TournamentSettings,
): Match[] {
  const groups = settings.groups ?? [];
  if (groups.length === 0) return [];

  const startDateTime = parseStartDateTime(settings);
  const { matchDurationMinutes, breakBetweenMatchesMinutes } = settings;
  const numberOfPitches = settings.numberOfPitches ?? 1;

  const allMatches: Match[] = [];
  let globalMatchIndex = 0;

  for (const group of groups) {
    const groupTeams = group.teamIds;
    if (groupTeams.length < 2) continue;

    // Round-robin ve skupině
    const ids = [...groupTeams];
    const hasBye = ids.length % 2 !== 0;
    if (hasBye) ids.push('BYE');

    const n = ids.length;
    const rounds = n - 1;
    const matchesPerRound = n / 2;

    for (let round = 0; round < rounds; round++) {
      const rotated = [ids[0], ...rotate(ids.slice(1), round)];

      for (let i = 0; i < matchesPerRound; i++) {
        const home = rotated[i];
        const away = rotated[n - 1 - i];
        if (home === 'BYE' || away === 'BYE') continue;

        const slotIndex = Math.floor(globalMatchIndex / numberOfPitches);
        const pitchNumber = (globalMatchIndex % numberOfPitches) + 1;
        const scheduledTime = computeMatchStartTime(startDateTime, slotIndex, matchDurationMinutes, breakBetweenMatchesMinutes);

        allMatches.push({
          id: generateId(),
          homeTeamId: home,
          awayTeamId: away,
          scheduledTime: scheduledTime.toISOString(),
          durationMinutes: matchDurationMinutes,
          status: 'scheduled',
          homeScore: 0, awayScore: 0, goals: [],
          startedAt: null, finishedAt: null, pausedAt: null, pausedElapsed: 0,
          roundIndex: round,
          matchIndex: globalMatchIndex,
          pitchNumber,
          stage: 'group',
          groupId: group.id,
        });

        globalMatchIndex++;
      }
    }
  }

  return allMatches;
}

// ─── Knockout bracket generator ─────────────────────────────────────────────

/** Vrátí název fáze na základě počtu zbývajících zápasů */
function stageForBracketSize(totalTeams: number, bracketPos: number, thirdPlace: boolean): MatchStage {
  // totalTeams = počet týmů v playoff (4 → SF+F, 8 → QF+SF+F)
  const matchCount = totalTeams - 1 + (thirdPlace ? 1 : 0);
  const sfStart = totalTeams / 2;

  if (bracketPos < sfStart) {
    if (totalTeams <= 4) return 'semifinal';
    return 'quarterfinal';
  }
  if (bracketPos < sfStart + sfStart / 2) return 'semifinal';
  // Zápas o 3. místo
  if (thirdPlace && bracketPos === matchCount - 2) return 'third-place';
  return 'final';
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
  const playoffTeams = groups.length * advance;
  const thirdPlace = settings.thirdPlaceMatch ?? false;

  // Vygeneruj placeholders pro knockout
  const placeholders = generateGroupKnockoutPlaceholders(groups, advance, thirdPlace);

  const knockoutMatches = generateKnockoutBracket(playoffTeams, settings, afterIdx, placeholders);

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
  const advance = settings.advancePerGroup ?? 1;

  // Spočítej tabulky pro každou skupinu
  const groupResults: Map<string, string[]> = new Map();

  for (const group of groups) {
    const groupMatches = matches.filter(m => m.groupId === group.id && m.stage === 'group');
    const groupTeams = teams.filter(t => group.teamIds.includes(t.id));
    const standings = computeStandings(groupMatches, groupTeams, settings.tiebreakerOrder, settings.penaltyResults);
    groupResults.set(group.id, standings.slice(0, advance).map(s => s.teamId));
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
    if (sourceMatch?.status === 'finished') {
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
    if (sourceMatch?.status === 'finished') {
      return sourceMatch.homeScore > sourceMatch.awayScore ? sourceMatch.awayTeamId : sourceMatch.homeTeamId;
    }
  }

  return null;
}

export { generateId };
