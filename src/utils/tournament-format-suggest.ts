/**
 * tournament-format-suggest.ts — smart-suggest engine pro tournament wizard.
 *
 * Cíl: na základě počtu týmů (a volitelně dostupného času + počtu hřišť)
 * vrátit seznam doporučených formátů s odhadem zápasů a celkových minut.
 *
 * Tohle je TORQ unique selling point — žádná konkurence (Challonge, Battlefy,
 * Toornament, Tournify) nemá auto-recommendation engine podle počtu týmů.
 *
 * Audit 2026-04-26 (research-driven sjednocení):
 * - Sjednocuje logiku z TournamentPlannerPage + zjednodušený výběr v Quick
 * - Používá se v TournamentWizardPage Krok 2
 * - Pravidla pro doporučení: 3-5 týmů → round-robin, 6-12 → groups+KO,
 *   8/16/32 → pure KO (každý je možný, ale doporučení jen jeden ⭐)
 */

import type { TournamentFormat } from '../types/tournament.types';

export interface FormatSuggestion {
  /** Identifier formátu, mapuje 1:1 na `Tournament.settings.format`. */
  format: TournamentFormat;
  /** True pokud tento formát je optimální pro daný počet týmů (právě jeden je ⭐). */
  recommended: boolean;
  /** True pokud je formát validní pro daný počet týmů (jinak grayed-out). */
  valid: boolean;

  // Group-based formats (jen pro groups-knockout)
  /** Doporučený počet skupin (jen pro groups-knockout). */
  groupCount?: number;
  /** Velikost skupiny (počet týmů ve skupině). */
  groupSize?: number;
  /** Počet postupujících z každé skupiny do KO (1 nebo 2). */
  qualifyingPerGroup?: number;

  // Estimáty (pro UI display "~ 12 zápasů, ~ 90 min")
  /** Odhad celkového počtu zápasů. */
  totalMatches: number;
  /** Odhad celkové doby turnaje v minutách (zahrnuje pauzy mezi koly). */
  estimatedMinutes: number;

  // i18n popis
  /** i18n suffix pro popis ("Pro X týmů, Y..."). */
  descriptionKey: string;
}

/** Default match duration v minutách pro odhad času (10 min = ČFbU/McDonald's). */
const DEFAULT_MATCH_DURATION_MIN = 10;
/** Pauza mezi zápasy v minutách. */
const DEFAULT_BREAK_MIN = 5;

/** Zjistí, jestli číslo je mocnina dvojky (pro pure KO formát). */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Vrátí počet zápasů pro round-robin (každý s každým, jeden zápas s každým).
 * Vzorec: n × (n-1) / 2.
 */
function roundRobinMatchCount(teams: number): number {
  return Math.floor((teams * (teams - 1)) / 2);
}

/**
 * Doporučený počet skupin pro groups-knockout formát.
 * Heuristika: rovnoměrné rozdělení, preferujeme skupiny po 3-4 týmech.
 *  6 týmů  → 2 skupiny po 3
 *  7-8     → 2 skupiny po 3-4
 *  9-12    → 3 nebo 4 skupiny po 3
 *  13-16   → 4 skupiny po 3-4
 */
function suggestGroupCount(teams: number): { groupCount: number; groupSize: number; advancePerGroup: number } | null {
  if (teams < 4) return null; // minimum pro skupiny
  if (teams <= 6) return { groupCount: 2, groupSize: Math.ceil(teams / 2), advancePerGroup: 2 };
  if (teams <= 8) return { groupCount: 2, groupSize: Math.ceil(teams / 2), advancePerGroup: 2 };
  if (teams <= 12) return { groupCount: 3, groupSize: Math.ceil(teams / 3), advancePerGroup: 2 };
  if (teams <= 16) return { groupCount: 4, groupSize: Math.ceil(teams / 4), advancePerGroup: 2 };
  // Backup pro >16 (ručně přes manual create)
  return { groupCount: 4, groupSize: Math.ceil(teams / 4), advancePerGroup: 2 };
}

/**
 * Spočítá odhad zápasů pro groups+knockout formát.
 * = součet zápasů ve skupinách + KO bracket podle počtu postupujících.
 */
function groupsKnockoutMatchCount(
  groupCount: number,
  groupSize: number,
  advancePerGroup: number
): number {
  // Zápasy ve skupinách (round-robin v každé skupině)
  const groupMatches = groupCount * roundRobinMatchCount(groupSize);
  // KO fáze: total = N - 1 (single elimination, kde N = počet kvalifikovaných)
  const knockoutTeams = groupCount * advancePerGroup;
  // Pokud je knockoutTeams mocnina 2, přesně N-1 zápasů; jinak playoff může mít víc
  const knockoutMatches = Math.max(0, knockoutTeams - 1);
  return groupMatches + knockoutMatches;
}

/**
 * Hlavní funkce — vrací 3 formátové návrhy seřazené podle vhodnosti.
 * `recommended: true` má právě jeden formát (⭐).
 *
 * @param teamCount Počet týmů (2-32)
 * @param matchDurationMin Délka zápasu v minutách (default 10)
 * @param numberOfPitches Počet hřišť pro paralelní zápasy (default 1)
 */
export function suggestFormats(
  teamCount: number,
  matchDurationMin: number = DEFAULT_MATCH_DURATION_MIN,
  numberOfPitches: number = 1
): FormatSuggestion[] {
  if (teamCount < 2) return [];

  const totalSlotMin = matchDurationMin + DEFAULT_BREAK_MIN;
  const calcMinutes = (matches: number) =>
    Math.ceil((matches / numberOfPitches) * totalSlotMin);

  // ── Round-robin (každý s každým) ─────────────────────────────────────
  const rrMatches = roundRobinMatchCount(teamCount);
  const rrValid = teamCount >= 2 && teamCount <= 8; // pro >8 týmů je round-robin moc dlouhý
  const rr: FormatSuggestion = {
    format: 'round-robin',
    valid: rrValid,
    recommended: false, // doplníme níž
    totalMatches: rrMatches,
    estimatedMinutes: calcMinutes(rrMatches),
    descriptionKey: 'tournament.format.roundRobin.desc',
  };

  // ── Groups + Knockout ────────────────────────────────────────────────
  const gk = suggestGroupCount(teamCount);
  let groupsKnockout: FormatSuggestion;
  if (gk) {
    const gkMatches = groupsKnockoutMatchCount(gk.groupCount, gk.groupSize, gk.advancePerGroup);
    groupsKnockout = {
      format: 'groups-knockout',
      valid: teamCount >= 4,
      recommended: false,
      groupCount: gk.groupCount,
      groupSize: gk.groupSize,
      qualifyingPerGroup: gk.advancePerGroup,
      totalMatches: gkMatches,
      estimatedMinutes: calcMinutes(gkMatches),
      descriptionKey: 'tournament.format.groupsKnockout.desc',
    };
  } else {
    groupsKnockout = {
      format: 'groups-knockout',
      valid: false,
      recommended: false,
      totalMatches: 0,
      estimatedMinutes: 0,
      descriptionKey: 'tournament.format.groupsKnockout.desc',
    };
  }

  // ── Pure KO (single elimination) ─────────────────────────────────────
  // Pure KO funguje nejlíp pro mocniny 2 (4, 8, 16, 32). Jiné počty vyžadují bye.
  const koMatches = Math.max(0, teamCount - 1);
  const ko: FormatSuggestion = {
    format: 'knockout',
    valid: teamCount >= 4,
    recommended: false,
    totalMatches: koMatches,
    estimatedMinutes: calcMinutes(koMatches),
    descriptionKey: isPowerOfTwo(teamCount)
      ? 'tournament.format.knockout.descPowerOfTwo'
      : 'tournament.format.knockout.descBye',
  };

  // ── Doporučení (právě jeden ⭐) ──────────────────────────────────────
  // 2-3 týmy → round-robin (KO je triviální)
  // 4-5 týmy → round-robin (více zápasů na tým)
  // 6-12 týmů → groups-knockout (klasický McDonald's Cup formát)
  // 13-16 → groups-knockout
  // 17+ → groups-knockout (ale doporučujeme manual)
  if (teamCount <= 5) {
    rr.recommended = true;
  } else if (teamCount <= 16 && gk) {
    groupsKnockout.recommended = true;
  } else {
    // >16 týmů — žádný preset není ideální, fallback groups-knockout
    if (gk) groupsKnockout.recommended = true;
  }

  return [rr, groupsKnockout, ko];
}

/**
 * Helper pro lidský label počet zápasů + délka.
 * Příklad: "12 zápasů · ~90 min"
 */
export function formatEstimate(suggestion: FormatSuggestion, matchesLabel: string, minutesLabel: string): string {
  const m = suggestion.totalMatches;
  const t = suggestion.estimatedMinutes;
  return `${m} ${matchesLabel} · ~${t} ${minutesLabel}`;
}
