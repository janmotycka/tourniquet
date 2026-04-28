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
  /**
   * Skutečná velikost každé skupiny (počet týmů). Pro 11 týmů ve 3 skupinách
   * by tohle bylo `[4, 4, 3]`. První skupiny dostávají případný zbytek.
   */
  groupSizes?: number[];
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
/** Default pauza mezi zápasy v minutách. */
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
 * Distribuuje teams do groupCount skupin co nejrovnoměrněji.
 * První skupiny dostávají případný zbytek (větší o 1 než zbytek).
 * Příklad: 11 týmů, 3 skupiny → [4, 4, 3]
 *          10 týmů, 3 skupiny → [4, 3, 3]
 *          14 týmů, 4 skupiny → [4, 4, 3, 3]
 */
function distributeIntoGroups(teams: number, groupCount: number): number[] {
  const base = Math.floor(teams / groupCount);
  const rem = teams % groupCount;
  return Array.from({ length: groupCount }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Doporučený počet skupin pro groups-knockout formát.
 * Heuristika: rovnoměrné rozdělení, preferujeme skupiny po 3-4 týmech.
 *  4-6 týmů  → 2 skupiny po 2-3
 *  7-8       → 2 skupiny po 3-4
 *  9-12      → 3 skupiny po 3-4
 *  13-16     → 4 skupiny po 3-4
 *  17+       → 4 skupiny (manual create doporučen)
 *
 * @param override Pokud nastaveno (≥2 a ≤floor(teams/2)), použij místo heuristiky.
 */
function suggestGroupCount(
  teams: number,
  override?: number | null,
): { groupCount: number; groupSizes: number[]; advancePerGroup: number } | null {
  if (teams < 4) return null; // minimum pro skupiny

  let groupCount: number;
  // User override (jen pokud validní pro daný count — min 2 týmy ve skupině)
  if (override && override >= 2 && override <= Math.floor(teams / 2)) {
    groupCount = override;
  } else if (teams <= 8) {
    groupCount = 2;
  } else if (teams <= 12) {
    groupCount = 3;
  } else {
    groupCount = 4;
  }

  return {
    groupCount,
    groupSizes: distributeIntoGroups(teams, groupCount),
    advancePerGroup: 2,
  };
}

/**
 * Spočítá odhad zápasů pro groups+knockout formát.
 * = součet zápasů ve všech skupinách (každá round-robin samostatně) + KO bracket.
 */
function groupsKnockoutMatchCount(
  groupSizes: number[],
  advancePerGroup: number
): number {
  // Zápasy ve skupinách — každá skupina hraje round-robin samostatně.
  const groupMatches = groupSizes.reduce((sum, size) => sum + roundRobinMatchCount(size), 0);
  // KO fáze: total = N - 1 (single elimination, kde N = počet kvalifikovaných)
  const knockoutTeams = groupSizes.length * advancePerGroup;
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
 * @param breakMin Pauza mezi zápasy v minutách (default 5)
 * @param groupCountOverride User-set group count override pro groups-knockout
 *                           (null/undefined = použít smart heuristiku).
 */
export function suggestFormats(
  teamCount: number,
  matchDurationMin: number = DEFAULT_MATCH_DURATION_MIN,
  numberOfPitches: number = 1,
  breakMin: number = DEFAULT_BREAK_MIN,
  groupCountOverride?: number | null,
): FormatSuggestion[] {
  if (teamCount < 2) return [];

  const totalSlotMin = matchDurationMin + breakMin;
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
  const gk = suggestGroupCount(teamCount, groupCountOverride);
  let groupsKnockout: FormatSuggestion;
  if (gk) {
    const gkMatches = groupsKnockoutMatchCount(gk.groupSizes, gk.advancePerGroup);
    groupsKnockout = {
      format: 'groups-knockout',
      valid: teamCount >= 4,
      recommended: false,
      groupCount: gk.groupCount,
      groupSizes: gk.groupSizes,
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
