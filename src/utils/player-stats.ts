/**
 * Agregace statistik hráče ze všech turnajů a sezónních zápasů.
 *
 * Propojení identity hráče:
 * - Turnaje: Team.clubId → Club.id, Player.name → ClubPlayer.name
 * - Sezónní zápasy: SeasonMatch.clubId → Club.id, lineup.name → ClubPlayer.name
 */

import type { ClubPlayer } from '../types/club.types';
import type { Tournament } from '../types/tournament.types';
import type { SeasonMatch } from '../types/match.types';
import type { TrainingUnit } from '../types/training.types';

export interface PlayerStats {
  // Turnaje
  tournamentGoals: number;
  tournamentMatches: number;       // zápasy, kde hráč byl v týmu
  tournamentsPlayed: number;       // počet turnajů

  // Sezónní zápasy
  seasonGoals: number;
  seasonAssists: number;
  seasonYellowCards: number;
  seasonRedCards: number;
  seasonMatches: number;           // zápasy, kde hráč byl v sestavě
  seasonAvgRating: number | null;  // průměrné hodnocení (null = žádné)

  // Tréninky
  trainingsTotal: number;          // počet tréninků kategorie hráče s vyplněnou docházkou
  trainingsPresent: number;
  trainingsAbsent: number;
  trainingsExcused: number;
  attendanceRate: number | null;   // 0–100 % (null = žádný záznam)

  // Celkově
  totalGoals: number;
  totalMatches: number;
}

const EMPTY_STATS: PlayerStats = {
  tournamentGoals: 0,
  tournamentMatches: 0,
  tournamentsPlayed: 0,
  seasonGoals: 0,
  seasonAssists: 0,
  seasonYellowCards: 0,
  seasonRedCards: 0,
  seasonMatches: 0,
  seasonAvgRating: null,
  trainingsTotal: 0,
  trainingsPresent: 0,
  trainingsAbsent: 0,
  trainingsExcused: 0,
  attendanceRate: null,
  totalGoals: 0,
  totalMatches: 0,
};

/**
 * Agreguje statistiky pro daného hráče ze všech turnajů a zápasů.
 *
 * @param player - Hráč z klubového rosteru
 * @param clubId - ID klubu hráče
 * @param tournaments - Všechny turnaje (vlastněné uživatelem)
 * @param seasonMatches - Všechny sezónní zápasy
 */
export function aggregatePlayerStats(
  player: ClubPlayer,
  clubId: string,
  tournaments: Tournament[],
  seasonMatches: SeasonMatch[],
  trainings: TrainingUnit[] = [],
): PlayerStats {
  const stats = { ...EMPTY_STATS };
  const playerName = player.name.toLowerCase().trim();

  // ─── Turnaje ───────────────────────────────────────────────────────────
  const tournamentsWithPlayer = new Set<string>();

  for (const tournament of tournaments) {
    // Najdi tým v turnaji, který patří ke klubu hráče
    const team = tournament.teams.find(t => t.clubId === clubId);
    if (!team) continue;

    // Najdi hráče v týmu podle jména
    const tournamentPlayer = team.players.find(
      p => p.name.toLowerCase().trim() === playerName,
    );
    if (!tournamentPlayer) continue;

    // Spočítej zápasy, kde tým hrál
    const teamMatches = (tournament.matches ?? []).filter(
      m =>
        (m.homeTeamId === team.id || m.awayTeamId === team.id) &&
        m.status === 'finished',
    );

    if (teamMatches.length > 0) {
      tournamentsWithPlayer.add(tournament.id);
      stats.tournamentMatches += teamMatches.length;
    }

    // Spočítej góly hráče
    for (const match of teamMatches) {
      for (const goal of match.goals ?? []) {
        if (goal.playerId === tournamentPlayer.id && !goal.isOwnGoal) {
          stats.tournamentGoals++;
        }
      }
    }
  }

  stats.tournamentsPlayed = tournamentsWithPlayer.size;

  // ─── Sezónní zápasy ────────────────────────────────────────────────────
  const ratingValues: number[] = [];

  for (const match of seasonMatches) {
    if (match.clubId !== clubId) continue;

    // Najdi hráče v sestavě (match by name OR by playerId pattern)
    const lineupPlayer = match.lineup.find(
      lp =>
        lp.name.toLowerCase().trim() === playerName ||
        lp.playerId === `${clubId}-${player.jerseyNumber}`,
    );
    if (!lineupPlayer) continue;

    if (match.status === 'finished' || match.status === 'live') {
      stats.seasonMatches++;
    }

    // Góly
    for (const goal of match.goals ?? []) {
      if (goal.scorerId === lineupPlayer.playerId && !goal.isOwnGoal && !goal.isOpponentGoal) {
        stats.seasonGoals++;
      }
      if (goal.assistId === lineupPlayer.playerId) {
        stats.seasonAssists++;
      }
    }

    // Karty
    for (const card of match.cards ?? []) {
      if (card.playerId === lineupPlayer.playerId) {
        if (card.type === 'yellow') stats.seasonYellowCards++;
        else if (card.type === 'red' || card.type === 'yellow-red') stats.seasonRedCards++;
      }
    }

    // Hodnocení
    const rating = (match.ratings ?? []).find(r => r.playerId === lineupPlayer.playerId);
    if (rating) {
      ratingValues.push(rating.stars);
    }
  }

  // Průměrné hodnocení
  if (ratingValues.length > 0) {
    stats.seasonAvgRating = Math.round(
      (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) * 10,
    ) / 10;
  }

  // ─── Tréninky / docházka ───────────────────────────────────────────────
  for (const tr of trainings) {
    if (tr.clubId !== clubId) continue;
    if (tr.clubAgeCategory !== player.ageCategory) continue;
    if (!tr.attendance) continue;
    const status = tr.attendance[player.id];
    if (!status) continue;
    stats.trainingsTotal++;
    if (status === 'present') stats.trainingsPresent++;
    else if (status === 'absent') stats.trainingsAbsent++;
    else if (status === 'excused') stats.trainingsExcused++;
  }
  if (stats.trainingsTotal > 0) {
    stats.attendanceRate = Math.round(
      (stats.trainingsPresent / stats.trainingsTotal) * 100,
    );
  }

  // Celkově
  stats.totalGoals = stats.tournamentGoals + stats.seasonGoals;
  stats.totalMatches = stats.tournamentMatches + stats.seasonMatches;

  return stats;
}
