/**
 * tennis player-stats — výpočet statistik individuálního tenisového hráče.
 *
 * Vstup: pole zápasů pro daného `myPlayerId`. Výstup: agregované metriky
 * relevantní pro tenis (match record, sets won %, aktuální streak).
 */

import type { SeasonMatch, TennisSubMatch } from '../../../types/match.types';
import { determineSubMatchWinner, normalizeSubMatch } from './tennis-team';

export interface PlayerTennisStats {
  /** Celkový počet zápasů (včetně rozhodnutých, nedohrané se nepočítají). */
  totalMatches: number;
  /** Vyhrané zápasy (vítěz = home pro isHome=true, nebo away pro isHome=false). */
  wins: number;
  /** Prohrané zápasy. */
  losses: number;
  /** Win rate [0-1]. */
  winRate: number;
  /** Celkové sety vyhrané napříč zápasy. */
  setsWon: number;
  /** Celkové sety prohrané. */
  setsLost: number;
  /** Sets ratio [0-1]. */
  setsWinRate: number;
  /** Počet skrečovaných zápasů. */
  retirements: number;
  /** Aktuální win streak (kolik zápasů za sebou vyhrál). */
  currentWinStreak: number;
  /** Nejdelší win streak v historii. */
  bestWinStreak: number;
  /** Průměrná délka setu v hrách (indikátor dominance / vyrovnanosti). */
  avgGamesPerSet: number;
}

/**
 * Spočítá statistiky hráče z listu jeho zápasů.
 * Ignoruje nedohrané (winner === null a retired === false).
 */
export function computePlayerStats(
  matches: SeasonMatch[],
  isHomePerspective: (match: SeasonMatch) => boolean = m => m.isHome,
): PlayerTennisStats {
  let wins = 0;
  let losses = 0;
  let totalMatches = 0;
  let setsWon = 0;
  let setsLost = 0;
  let retirements = 0;
  let totalGamesAll = 0;
  let totalSetsAll = 0;

  // Seřaď zápasy chronologicky pro výpočet streaku (starší → novější)
  const sorted = [...matches].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  let currentStreak = 0;
  let bestStreak = 0;

  for (const match of sorted) {
    // Individuální mód — první sub-match je tenhle zápas.
    // Tým/družstva řešíme agregátně (home/away score).
    const rawSub = match.subMatches?.[0];
    if (!rawSub) continue;
    const sub: TennisSubMatch = normalizeSubMatch(rawSub);

    const winner = determineSubMatchWinner(sub);
    if (!winner) continue;

    const homePerspective = isHomePerspective(match);
    const playerWon = homePerspective ? winner === 'home' : winner === 'away';

    totalMatches++;
    if (sub.retired) retirements++;

    if (playerWon) {
      wins++;
      currentStreak++;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      losses++;
      currentStreak = 0;
    }

    // Sety
    for (const set of sub.sets) {
      const playerGames = homePerspective ? set.home : set.away;
      const oppGames = homePerspective ? set.away : set.home;
      if (playerGames > oppGames) setsWon++;
      else if (oppGames > playerGames) setsLost++;
      totalGamesAll += set.home + set.away;
      totalSetsAll++;
    }
  }

  const winRate = totalMatches > 0 ? wins / totalMatches : 0;
  const totalSets = setsWon + setsLost;
  const setsWinRate = totalSets > 0 ? setsWon / totalSets : 0;
  const avgGamesPerSet = totalSetsAll > 0 ? totalGamesAll / totalSetsAll : 0;

  return {
    totalMatches,
    wins,
    losses,
    winRate,
    setsWon,
    setsLost,
    setsWinRate,
    retirements,
    currentWinStreak: currentStreak,
    bestWinStreak: bestStreak,
    avgGamesPerSet,
  };
}
