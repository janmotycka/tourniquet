import type { Team, Match, Standing, TournamentSettings } from '../types/tournament.types';
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

// ─── Standings computation ────────────────────────────────────────────────────

/**
 * Vypočítá tabulku z finished zápasů.
 * Čistá funkce — nikdy neukládáme standings přímo.
 * Řazení: body DESC → vzájemný zápas → gólový rozdíl DESC → vstřelené góly DESC → název ASC
 */
export function computeStandings(matches: Match[], teams: Team[]): Standing[] {
  const map = new Map<string, Standing>();

  // Inicializace pro všechny týmy
  for (const team of teams) {
    map.set(team.id, {
      teamId: team.id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
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
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (match.homeScore < match.awayScore) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      home.points += 1;
      away.drawn++;
      away.points += 1;
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
  }

  const standings = Array.from(map.values());

  /**
   * Vrátí body získané týmem A ve vzájemném zápase (nebo zápasech) proti týmu B.
   * Používá se jako kritérium při shodě celkových bodů.
   */
  const headToHeadPoints = (teamAId: string, teamBId: string): number => {
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
  };

  // Řazení: body → vzájemný zápas → gólový rozdíl → vstřelené góly → abeceda
  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // Vzájemný zápas (jen při shodě bodů mezi dvěma týmy)
    const h2hA = headToHeadPoints(a.teamId, b.teamId);
    const h2hB = headToHeadPoints(b.teamId, a.teamId);
    if (h2hB !== h2hA) return h2hB - h2hA;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    // Jméno týmu - abecedně
    const nameA = teams.find(t => t.id === a.teamId)?.name ?? '';
    const nameB = teams.find(t => t.id === b.teamId)?.name ?? '';
    return nameA.localeCompare(nameB, 'cs');
  });

  return standings;
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

/** Formátuje ISO timestamp na "HH:MM" */
export function formatMatchTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
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
  return slots * (settings.matchDurationMinutes + settings.breakBetweenMatchesMinutes);
}

/** Vrátí počet skutečných zápasů pro N týmů */
export function countRealMatches(numberOfTeams: number): number {
  return (numberOfTeams * (numberOfTeams - 1)) / 2;
}

export { generateId };
