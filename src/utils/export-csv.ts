/**
 * CSV export utility — turnajové tabulky, zápasy, střelci, sezónní statistiky.
 * BOM prefix (\uFEFF) pro správné zobrazení českých znaků v Excelu.
 */

import type { Tournament } from '../types/tournament.types';
import type { PlayerSeasonStats } from './match-stats';
import { computeStandings } from './tournament-schedule';

// ─── Base helper ─────────────────────────────────────────────────────────────

function escapeCsvField(value: string | number): string {
  let str = String(value);

  // Formula injection guard — buňky začínající =, +, -, @, \t, \r
  // mohou být interpretovány jako formule v Excelu/Google Sheets.
  // Prefix apostrof neutralizuje formuli a Excel ho nezobrazí.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const headerLine = headers.map(escapeCsvField).join(',');
  const dataLines = rows.map(row => row.map(escapeCsvField).join(','));
  const csv = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Tournament standings CSV ────────────────────────────────────────────────

export function exportTournamentStandingsCSV(
  tournament: Tournament,
  t: (key: string, params?: Record<string, string | number>) => string,
): void {
  const standings = computeStandings(
    tournament.matches,
    tournament.teams,
    tournament.settings.tiebreakerOrder,
    tournament.settings.penaltyResults,
  );

  const teamMap = new Map(tournament.teams.map(te => [te.id, te.name]));

  const headers = [
    '#',
    t('csv.team'),
    t('csv.played'),
    t('csv.won'),
    t('csv.drawn'),
    t('csv.lost'),
    t('csv.goalsFor'),
    t('csv.goalsAgainst'),
    t('csv.goalDiff'),
    t('csv.points'),
  ];

  const rows = standings.map((s, i) => [
    i + 1,
    teamMap.get(s.teamId) ?? '?',
    s.played,
    s.won,
    s.drawn,
    s.lost,
    s.goalsFor,
    s.goalsAgainst,
    s.goalDifference,
    s.points,
  ]);

  const name = tournament.name.replace(/[^a-zA-Z0-9áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\s-]/g, '').trim();
  downloadCSV(`${name}-tabulka.csv`, headers, rows);
}

// ─── Tournament matches CSV ──────────────────────────────────────────────────

export function exportTournamentMatchesCSV(
  tournament: Tournament,
  t: (key: string, params?: Record<string, string | number>) => string,
): void {
  const teamMap = new Map(tournament.teams.map(te => [te.id, te.name]));

  const headers = [
    t('csv.round'),
    t('csv.time'),
    t('csv.pitch'),
    t('csv.homeTeam'),
    t('csv.score'),
    t('csv.awayTeam'),
    t('csv.status'),
  ];

  const sortedMatches = [...tournament.matches].sort((a, b) =>
    a.scheduledTime.localeCompare(b.scheduledTime) || a.roundIndex - b.roundIndex
  );

  const rows = sortedMatches.map(m => [
    m.roundIndex + 1,
    m.scheduledTime.slice(11, 16), // HH:MM
    m.pitchNumber ?? 1,
    teamMap.get(m.homeTeamId) ?? '?',
    m.status === 'finished' ? `${m.homeScore}:${m.awayScore}` : '-:-',
    teamMap.get(m.awayTeamId) ?? '?',
    t(`csv.status.${m.status}`),
  ]);

  const name = tournament.name.replace(/[^a-zA-Z0-9áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\s-]/g, '').trim();
  downloadCSV(`${name}-zapasy.csv`, headers, rows);
}

// ─── Tournament scorers CSV ──────────────────────────────────────────────────

export function exportTournamentScorersCSV(
  tournament: Tournament,
  t: (key: string, params?: Record<string, string | number>) => string,
): void {
  const teamMap = new Map(tournament.teams.map(te => [te.id, te.name]));

  // Sesbírej góly z dokončených zápasů
  type ScorerEntry = { playerId: string; playerName: string; teamName: string; goals: number };
  const scorerMap = new Map<string, ScorerEntry>();

  for (const match of tournament.matches) {
    if (match.status !== 'finished') continue;
    for (const goal of match.goals) {
      if (!goal.playerId || goal.isOwnGoal) continue;

      // Najdi jméno hráče z týmu
      const team = tournament.teams.find(te => te.id === goal.teamId);
      const player = team?.players.find(p => p.id === goal.playerId);
      const playerName = player?.name ?? `Hráč ${goal.playerId.slice(0, 6)}`;
      const teamName = teamMap.get(goal.teamId) ?? '?';

      const key = `${goal.teamId}-${goal.playerId}`;
      const existing = scorerMap.get(key);
      if (existing) {
        existing.goals += 1;
      } else {
        scorerMap.set(key, { playerId: goal.playerId, playerName, teamName, goals: 1 });
      }
    }
  }

  const scorers = [...scorerMap.values()].sort((a, b) => b.goals - a.goals);

  const headers = ['#', t('csv.player'), t('csv.team'), t('csv.goals')];
  const rows = scorers.map((s, i) => [i + 1, s.playerName, s.teamName, s.goals]);

  const name = tournament.name.replace(/[^a-zA-Z0-9áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\s-]/g, '').trim();
  downloadCSV(`${name}-strelci.csv`, headers, rows);
}

// ─── Season player stats CSV ─────────────────────────────────────────────────

export function exportSeasonPlayerStatsCSV(
  stats: PlayerSeasonStats[],
  t: (key: string, params?: Record<string, string | number>) => string,
): void {
  const headers = [
    '#',
    t('matchStats.colPlayer'),
    t('matchStats.colGames'),
    t('matchStats.colStarts'),
    t('matchStats.colGoals'),
    t('matchStats.colAssists'),
    t('matchStats.colYellow'),
    t('matchStats.colRed'),
    t('matchStats.colRating'),
    t('matchStats.colMinutes'),
  ];

  const rows = stats.map(p => [
    p.jerseyNumber,
    p.name,
    p.matchesPlayed,
    p.matchesStarted,
    p.goals,
    p.assists,
    p.yellowCards,
    p.redCards + p.yellowRedCards,
    p.avgRating > 0 ? p.avgRating.toFixed(1) : '—',
    p.totalMinutes,
  ]);

  downloadCSV('statistiky-hracu.csv', headers, rows);
}
