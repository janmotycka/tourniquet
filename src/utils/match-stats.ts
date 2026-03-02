/**
 * Agregace sezónních statistik hráčů a týmu z Match Tracker dat.
 */

import type { SeasonMatch } from '../types/match.types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PlayerSeasonStats {
  playerId: string;
  name: string;
  jerseyNumber: number;
  matchesPlayed: number;
  matchesStarted: number;
  goals: number;
  assists: number;
  ownGoals: number;
  yellowCards: number;
  redCards: number;
  yellowRedCards: number;
  avgRating: number;       // 0 pokud nebyl hodnocen
  totalMinutes: number;
}

export interface TeamSeasonStats {
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  form: ('W' | 'D' | 'L')[];  // posledních 5 zápasů
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Vrátí odehrané (finished) zápasy pro daný klub */
function finishedMatches(matches: SeasonMatch[], clubId?: string): SeasonMatch[] {
  return matches.filter(m =>
    m.status === 'finished' && (!clubId || m.clubId === clubId)
  );
}

/** Aproximace odehraných minut hráče v zápase */
function playerMinutesInMatch(match: SeasonMatch, playerId: string): number {
  const duration = match.durationMinutes;
  const inLineup = match.lineup.find(lp => lp.playerId === playerId);
  if (!inLineup) return 0;

  const isStarter = inLineup.isStarter || match.lineup.some(
    lp => lp.playerId === playerId && lp.substituteOrder === 0
  );

  // Najdi střídání kde hráč vyšel ven
  const subbedOut = match.substitutions.find(s => s.playerOutId === playerId);
  // Najdi střídání kde hráč přišel dovnitř
  const subbedIn = match.substitutions.find(s => s.playerInId === playerId);

  // Poznámka: lineup.isStarter se mění při střídání, takže kontrolujeme
  // i substituteOrder === 0 pro originální startéry, ale jistější je se
  // podívat jestli existuje subbedIn záznam
  const wasOriginalStarter = !subbedIn;

  if (wasOriginalStarter && inLineup) {
    // Startér — hrál od 0. minuty
    const endMinute = subbedOut ? subbedOut.minute : duration;
    return Math.min(endMinute, duration);
  } else if (subbedIn) {
    // Přišel jako náhradník
    const startMinute = subbedIn.minute;
    const endMinute = subbedOut ? subbedOut.minute : duration;
    return Math.max(0, Math.min(endMinute, duration) - startMinute);
  }

  return 0;
}

/** Zjistí zda hráč začínal v základní sestavě (originální startér) */
function wasOriginalStarter(match: SeasonMatch, playerId: string): boolean {
  const inLineup = match.lineup.find(lp => lp.playerId === playerId);
  if (!inLineup) return false;
  // Pokud existuje substitution kde byl nasazen (playerIn), nebyl originální startér
  const subbedIn = match.substitutions.find(s => s.playerInId === playerId);
  return !subbedIn;
}

// ─── Výpočet statistik hráčů ─────────────────────────────────────────────────

export function computePlayerStats(
  matches: SeasonMatch[],
  clubId?: string,
): PlayerSeasonStats[] {
  const finished = finishedMatches(matches, clubId);
  if (finished.length === 0) return [];

  // Sesbírej všechny unikátní hráče ze sestav
  const playerMap = new Map<string, { name: string; jerseyNumber: number }>();

  for (const match of finished) {
    for (const lp of match.lineup) {
      if (!playerMap.has(lp.playerId)) {
        playerMap.set(lp.playerId, { name: lp.name, jerseyNumber: lp.jerseyNumber });
      }
    }
  }

  const stats: PlayerSeasonStats[] = [];

  for (const [playerId, { name, jerseyNumber }] of playerMap) {
    let matchesPlayed = 0;
    let matchesStarted = 0;
    let goals = 0;
    let assists = 0;
    let ownGoals = 0;
    let yellowCards = 0;
    let redCards = 0;
    let yellowRedCards = 0;
    let totalMinutes = 0;
    let ratingSum = 0;
    let ratingCount = 0;

    for (const match of finished) {
      const inLineup = match.lineup.some(lp => lp.playerId === playerId);
      if (!inLineup) continue;

      matchesPlayed++;
      if (wasOriginalStarter(match, playerId)) {
        matchesStarted++;
      }

      // Góly
      for (const g of match.goals) {
        if (g.scorerId === playerId && !g.isOpponentGoal) {
          if (g.isOwnGoal) {
            ownGoals++;
          } else {
            goals++;
          }
        }
        if (g.assistId === playerId) {
          assists++;
        }
      }

      // Karty
      for (const c of match.cards) {
        if (c.playerId === playerId) {
          if (c.type === 'yellow') yellowCards++;
          else if (c.type === 'red') redCards++;
          else if (c.type === 'yellow-red') yellowRedCards++;
        }
      }

      // Minuty
      totalMinutes += playerMinutesInMatch(match, playerId);

      // Hodnocení
      const rating = match.ratings.find(r => r.playerId === playerId);
      if (rating) {
        ratingSum += rating.stars;
        ratingCount++;
      }
    }

    stats.push({
      playerId,
      name,
      jerseyNumber,
      matchesPlayed,
      matchesStarted,
      goals,
      assists,
      ownGoals,
      yellowCards,
      redCards,
      yellowRedCards,
      avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0,
      totalMinutes,
    });
  }

  // Seřaď podle gólů desc, pak minuty desc
  return stats.sort((a, b) => b.goals - a.goals || b.totalMinutes - a.totalMinutes);
}

// ─── Výpočet statistik týmu ──────────────────────────────────────────────────

export function computeTeamStats(
  matches: SeasonMatch[],
  clubId?: string,
): TeamSeasonStats {
  const finished = finishedMatches(matches, clubId);

  let wins = 0, draws = 0, losses = 0;
  let goalsFor = 0, goalsAgainst = 0, cleanSheets = 0;

  // Seřaď podle data pro formu
  const sorted = [...finished].sort((a, b) => a.date.localeCompare(b.date));

  const form: ('W' | 'D' | 'L')[] = [];

  for (const m of sorted) {
    goalsFor += m.homeScore;
    goalsAgainst += m.awayScore;

    if (m.awayScore === 0) cleanSheets++;

    if (m.homeScore > m.awayScore) {
      wins++;
      form.push('W');
    } else if (m.homeScore < m.awayScore) {
      losses++;
      form.push('L');
    } else {
      draws++;
      form.push('D');
    }
  }

  return {
    totalMatches: finished.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    cleanSheets,
    form: form.slice(-5),
  };
}
