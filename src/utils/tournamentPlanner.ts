// ─── Tournament Planner — pure TS optimizer ─────────────────────────────────
//
// Given basic inputs (team count, time budget, max fields), generates 2–4
// candidate tournament variants optimized for "minutes of play per team".
//
// Used by TournamentPlannerPage wizard. No Firebase, no side-effects.

import type { TournamentFormat } from '../types/tournament.types';

// ─── Public types ────────────────────────────────────────────────────────────

export interface PlannerInput {
  /** Počet přihlášených týmů */
  teamCount: number;
  /** Celkový disponibilní čas v minutách (tělocvična, hřiště…) */
  totalMinutes: number;
  /** Maximální počet hřišť, které mohu využít současně */
  maxFields: number;
  /** Minimální délka zápasu (jedna polovina nebo plný čas, dle konvence) */
  minMatchLength?: number;  // default 6
  /** Maximální délka zápasu */
  maxMatchLength?: number;  // default 20
  /** Pauza mezi zápasy v min. */
  breakBetweenMatches?: number;  // default 2
}

/** Jedna vygenerovaná varianta, kterou může trenér vybrat. */
export interface PlannerVariant {
  /** Unikátní klíč pro React */
  key: string;
  /** Interní formát (pro CreateTournamentInput) */
  format: TournamentFormat;
  /** Kolik hřišť využít */
  fields: number;
  /** Délka jednoho zápasu (min) */
  matchLengthMin: number;
  /** Pauza mezi zápasy */
  breakMin: number;
  /** Kolik zápasů každý tým odehraje (průměr — u knockoutu aspoň tento minimum) */
  matchesPerTeam: number;
  /** Celkem minut, kdy je průměrný tým "na hřišti" */
  minutesPerTeam: number;
  /** Celkový počet zápasů v turnaji */
  totalMatches: number;
  /** Celková doba trvání turnaje v min. */
  totalDurationMin: number;
  /** Lidsky čitelný label ("Nejvíc minut", "Nejrychlejší"...) */
  label: string;
  /** Kratký popis pro kartu */
  description: string;
  /** Tipy / odůvodnění pro trenéra (2-3 věty) */
  rationale: string;
  /** Pořadí zápasů jako indexy do budoucího pole teams */
  matchOrder: MatchOrderEntry[];
  /** Pro groups-knockout: definice skupin (pole indexů do teams) */
  groups?: { name: string; teamIndices: number[] }[];
  /** Kolik týmů postoupí ze skupiny (1 nebo 2) */
  advancePerGroup?: number;
}

export interface MatchOrderEntry {
  homeTeamIndex: number;
  awayTeamIndex: number;
  roundIndex: number;
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Vygeneruje 2–4 kandidátské varianty turnaje dle vstupů.
 * Varianty jsou seřazeny s "nejvíc minut / tým" nahoře.
 * Duplicity (stejné výsledky) jsou odfiltrovány.
 */
export function planTournament(input: PlannerInput): PlannerVariant[] {
  const teams = Math.max(2, Math.floor(input.teamCount));
  const totalMin = Math.max(30, input.totalMinutes);
  const maxFields = Math.max(1, Math.min(8, input.maxFields));
  const minML = input.minMatchLength ?? 6;
  const maxML = input.maxMatchLength ?? 20;
  const brk = input.breakBetweenMatches ?? 2;

  const candidates: PlannerVariant[] = [];

  // Try each field count 1..maxFields for each format, pick best fit
  for (let fields = 1; fields <= maxFields; fields++) {
    // --- 1) Round-robin (každý s každým) ---
    const rr = buildRoundRobin(teams, fields, totalMin, minML, maxML, brk);
    if (rr) candidates.push(rr);

    // --- 2) Groups + playoff — only if enough teams (≥6) ---
    if (teams >= 6) {
      // Try 2 groups and 3 groups (if teams ≥ 9)
      const groupConfigs = teams >= 9 ? [2, 3] : [2];
      for (const groupCount of groupConfigs) {
        if (groupCount > Math.floor(teams / 3)) continue; // need at least 3 teams / group
        const gk = buildGroupsKnockout(teams, groupCount, fields, totalMin, minML, maxML, brk);
        if (gk) candidates.push(gk);
      }
    }

    // --- 3) Single big group with placement matches ---
    // Only if too many teams for full RR
    // Skipped — groups-knockout covers this use-case
  }

  // Deduplicate: variants with same format+fields+matchLength+groups are considered same
  const dedup = dedupVariants(candidates);

  // Sort by minutesPerTeam descending (primary), then by fewer fields (secondary — prefer simpler setup)
  dedup.sort((a, b) => {
    if (b.minutesPerTeam !== a.minutesPerTeam) return b.minutesPerTeam - a.minutesPerTeam;
    if (a.fields !== b.fields) return a.fields - b.fields;
    return b.totalMatches - a.totalMatches;
  });

  // Take top 4, label them
  const top = dedup.slice(0, 4);
  return labelVariants(top);
}

// ─── Round-robin builder ─────────────────────────────────────────────────────

function buildRoundRobin(
  teams: number,
  fields: number,
  totalMin: number,
  minML: number,
  maxML: number,
  brk: number,
): PlannerVariant | null {
  // Number of matches in full round-robin
  const totalMatches = (teams * (teams - 1)) / 2;
  // How many slots (rounds of parallel matches) we need
  const slots = Math.ceil(totalMatches / fields);
  // Time per slot = matchLen + break
  // Solve: slots * (matchLen + brk) <= totalMin
  //    =>  matchLen <= totalMin/slots - brk
  const maxPossibleLen = Math.floor(totalMin / slots) - brk;
  const matchLen = Math.min(maxML, Math.max(minML, maxPossibleLen));

  if (maxPossibleLen < minML) return null; // doesn't fit

  const totalDuration = slots * (matchLen + brk);
  const matchesPerTeam = teams - 1;
  const minutesPerTeam = matchesPerTeam * matchLen;

  return {
    key: `rr-f${fields}-l${matchLen}`,
    format: 'round-robin',
    fields,
    matchLengthMin: matchLen,
    breakMin: brk,
    matchesPerTeam,
    minutesPerTeam,
    totalMatches,
    totalDurationMin: totalDuration,
    label: '',
    description: `${fields}× hřiště · Každý s každým`,
    rationale: '',
    matchOrder: generateRoundRobinOrder(teams),
  };
}

// ─── Groups + knockout builder ───────────────────────────────────────────────

function buildGroupsKnockout(
  teams: number,
  groupCount: number,
  fields: number,
  totalMin: number,
  minML: number,
  maxML: number,
  brk: number,
): PlannerVariant | null {
  // Distribute teams into groups as evenly as possible
  const base = Math.floor(teams / groupCount);
  const rem = teams % groupCount;
  const groupSizes: number[] = [];
  for (let i = 0; i < groupCount; i++) {
    groupSizes.push(base + (i < rem ? 1 : 0));
  }

  // Group stage matches
  const groupMatches = groupSizes.reduce((sum, s) => sum + (s * (s - 1)) / 2, 0);

  // Playoff: top 2 per group → semifinal + final (+ 3rd place)
  // For simplicity, assume 2 groups → SF + F + 3rd  (4 matches)
  // For 3 groups → quarterfinal with best 3rd → simplified: just top 1 from each → final 3-way not clean, so skip
  let playoffMatches = 0;
  let advancePerGroup = 2;
  if (groupCount === 2) {
    playoffMatches = 4; // 2 SF + F + 3rd place
    advancePerGroup = 2;
  } else if (groupCount === 3) {
    // Top 1 from each → 3 teams → 2 placement matches (hard to schedule cleanly)
    // Simpler: top 2 from 3 groups = 6 teams → 2 QF + 2 SF + F + 3rd = 6 matches
    playoffMatches = 6;
    advancePerGroup = 2;
  } else if (groupCount === 4) {
    playoffMatches = 7; // 4 QF + 2 SF + F + 3rd = 8... ok 4 QF doesn't fit 4 teams each. Skip for now.
    advancePerGroup = 1;
  }

  const totalMatches = groupMatches + playoffMatches;
  const slots = Math.ceil(totalMatches / fields);
  const maxPossibleLen = Math.floor(totalMin / slots) - brk;
  const matchLen = Math.min(maxML, Math.max(minML, maxPossibleLen));
  if (maxPossibleLen < minML) return null;

  const totalDuration = slots * (matchLen + brk);

  // Matches per team (average): group = (size-1), playoff varies
  // Minimum matches per team = (size-1) for teams that don't advance
  // Max matches per team = (size-1) + ~2 (SF + F)
  // Use average
  const avgGroupSize = teams / groupCount;
  const groupMatchesPerTeam = avgGroupSize - 1;
  // Assume average playoff contribution ~ 1 match (half get 2, half get 0)
  const avgPlayoffPerTeam = (playoffMatches * 2) / teams;
  const matchesPerTeam = groupMatchesPerTeam + avgPlayoffPerTeam;
  const minutesPerTeam = matchesPerTeam * matchLen;

  // Build groups definition (by index)
  const groups: { name: string; teamIndices: number[] }[] = [];
  let idx = 0;
  for (let g = 0; g < groupCount; g++) {
    const size = groupSizes[g];
    const indices = Array.from({ length: size }, (_, i) => idx + i);
    idx += size;
    groups.push({ name: `Skupina ${String.fromCharCode(65 + g)}`, teamIndices: indices });
  }

  // For groups-knockout we don't fill matchOrder — store generates from groups def
  return {
    key: `gk-g${groupCount}-f${fields}-l${matchLen}`,
    format: 'groups-knockout',
    fields,
    matchLengthMin: matchLen,
    breakMin: brk,
    matchesPerTeam: Math.round(matchesPerTeam * 10) / 10,
    minutesPerTeam: Math.round(minutesPerTeam),
    totalMatches,
    totalDurationMin: totalDuration,
    label: '',
    description: `${fields}× hřiště · ${groupCount} skupiny + play-off`,
    rationale: '',
    matchOrder: [], // groups-knockout doesn't use matchOrder
    groups,
    advancePerGroup,
  };
}

// ─── Round-robin order generator (circle method) ────────────────────────────

/**
 * Vygeneruje pořadí zápasů round-robin pomocí circle method.
 * Vrací pole {homeIndex, awayIndex, round} — indexy jsou 0-based do budoucího pole teams.
 */
function generateRoundRobinOrder(teamCount: number): MatchOrderEntry[] {
  const n = teamCount;
  const hasBye = n % 2 !== 0;
  const size = hasBye ? n + 1 : n;
  const ids: number[] = Array.from({ length: size }, (_, i) => i);
  const byeId = hasBye ? n : -1;

  const rounds = size - 1;
  const matchesPerRound = size / 2;
  const entries: MatchOrderEntry[] = [];

  for (let round = 0; round < rounds; round++) {
    const rotated = [ids[0], ...rotateArray(ids.slice(1), round)];
    for (let i = 0; i < matchesPerRound; i++) {
      const home = rotated[i];
      const away = rotated[size - 1 - i];
      if (home === byeId || away === byeId) continue;
      entries.push({ homeTeamIndex: home, awayTeamIndex: away, roundIndex: round });
    }
  }
  return entries;
}

function rotateArray<T>(arr: T[], n: number): T[] {
  const len = arr.length;
  if (len === 0) return arr;
  const k = ((n % len) + len) % len;
  return [...arr.slice(-k), ...arr.slice(0, len - k)];
}

// ─── Deduplication & labeling ────────────────────────────────────────────────

function dedupVariants(variants: PlannerVariant[]): PlannerVariant[] {
  const seen = new Set<string>();
  const out: PlannerVariant[] = [];
  for (const v of variants) {
    if (seen.has(v.key)) continue;
    seen.add(v.key);
    out.push(v);
  }
  return out;
}

function labelVariants(variants: PlannerVariant[]): PlannerVariant[] {
  if (variants.length === 0) return variants;

  // First = most minutes / team
  const byMinutes = [...variants].sort((a, b) => b.minutesPerTeam - a.minutesPerTeam);
  const byDuration = [...variants].sort((a, b) => a.totalDurationMin - b.totalDurationMin);
  const byMatches = [...variants].sort((a, b) => b.matchesPerTeam - a.matchesPerTeam);

  const topMinutes = byMinutes[0];
  const topFastest = byDuration[0];
  const topMost = byMatches[0];

  return variants.map(v => {
    if (v === topMinutes && v.minutesPerTeam > 0) {
      return {
        ...v,
        label: 'Nejvíc minut na tým',
        rationale: `Maximalizuje hrací čas každého týmu — ${v.minutesPerTeam} min (${v.matchesPerTeam} zápasů po ${v.matchLengthMin} min). Ideální, když chcete, aby si každý tým opravdu zahrál.`,
      };
    }
    if (v === topFastest && v !== topMinutes) {
      return {
        ...v,
        label: 'Nejrychlejší turnaj',
        rationale: `Turnaj skončí za ${formatDuration(v.totalDurationMin)}. Méně minut na tým (${v.minutesPerTeam} min), ale dřív jdete domů.`,
      };
    }
    if (v === topMost && v !== topMinutes && v !== topFastest) {
      return {
        ...v,
        label: 'Nejvíc zápasů',
        rationale: `Každý tým sehraje ${v.matchesPerTeam} zápasů — dobré pro rozmanitost soupeřů a herní zkušenost.`,
      };
    }
    return {
      ...v,
      label: 'Alternativa',
      rationale: `${v.matchesPerTeam} zápasů po ${v.matchLengthMin} min. Celkem ${formatDuration(v.totalDurationMin)}.`,
    };
  });
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// ─── Time-addition helper (for wizard schedule preview) ──────────────────────

export function addMinutesToHHMM(start: string, minutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}
