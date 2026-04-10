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
  /** Play-out: zápasy o všechna umístění (5., 7., 9. místo…) */
  playOut?: boolean;
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
  /**
   * Garantované minimum minut hry pro KAŽDÝ tým (i ten, co nepostoupí).
   * Pro round-robin = minutesPerTeam (všichni hrají stejně).
   * Pro groups-knockout = (groupSize - 1) × matchLength.
   * Pro knockout = 1 × matchLength.
   * Používá se pro řazení variant — trenéra zajímá, kolik hrají VŠICHNI,
   * ne jen vítěz.
   */
  guaranteedMinutesPerTeam: number;
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
  /** Play-out: zápasy o všechna umístění */
  playOut?: boolean;
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
  const minML = input.minMatchLength ?? 10;
  const maxML = input.maxMatchLength ?? 20;
  const brk = input.breakBetweenMatches ?? 2;

  const candidates: PlannerVariant[] = [];

  // Try each field count 1..maxFields for each format, pick best fit
  for (let fields = 1; fields <= maxFields; fields++) {
    // --- 1) Round-robin (každý s každým) ---
    const rr = buildRoundRobin(teams, fields, totalMin, minML, maxML, brk);
    if (rr) candidates.push(rr);

    // --- 2) Groups + playoff ---
    if (teams >= 6) {
      const groupConfigs = teams >= 12 ? [2, 3, 4] : teams >= 9 ? [2, 3] : [2];
      for (const groupCount of groupConfigs) {
        if (groupCount > Math.floor(teams / 3)) continue;
        // Varianta BEZ play-out
        const gk = buildGroupsKnockout(teams, groupCount, fields, totalMin, minML, maxML, brk, false);
        if (gk) candidates.push(gk);
        // Varianta S play-out (jen pro 2 skupiny — automaticky navíc)
        if (groupCount === 2) {
          const gkPo = buildGroupsKnockout(teams, groupCount, fields, totalMin, minML, maxML, brk, true);
          if (gkPo) candidates.push(gkPo);
        }
      }
      if (teams >= 12) {
        const gk8 = buildGroupsKnockoutWithAdvance2(teams, 4, fields, totalMin, minML, maxML, brk, false);
        if (gk8) candidates.push(gk8);
      }
    }

    // --- 3) Single big group with placement matches ---
    // Only if too many teams for full RR
    // Skipped — groups-knockout covers this use-case
  }

  // Deduplicate: variants with same format+fields+matchLength+groups are considered same
  const dedup = dedupVariants(candidates);

  // Sort by guaranteedMinutesPerTeam descending
  dedup.sort((a, b) => {
    if (b.guaranteedMinutesPerTeam !== a.guaranteedMinutesPerTeam) return b.guaranteedMinutesPerTeam - a.guaranteedMinutesPerTeam;
    if (a.fields !== b.fields) return a.fields - b.fields;
    return b.totalMatches - a.totalMatches;
  });

  // Diverzní výběr — z každého "typu" (RR, 2sk, 3sk, 4sk, play-out) vezmi nejlepší.
  // Tím zajistíme, že trenér vidí i 4-skupinovou variantu, která by jinak vypadla.
  const seen = new Set<string>();
  const diverse: PlannerVariant[] = [];
  for (const v of dedup) {
    const groupCount = v.groups?.length ?? 0;
    const adv = v.advancePerGroup ?? 1;
    const typeKey = `${v.format}-g${groupCount}-a${adv}-po${v.playOut ? 1 : 0}`;
    if (!seen.has(typeKey)) {
      seen.add(typeKey);
      diverse.push(v);
    }
  }
  // Seřadit diverzní výběr zpět podle guaranteedMinutesPerTeam
  diverse.sort((a, b) => {
    if (b.guaranteedMinutesPerTeam !== a.guaranteedMinutesPerTeam) return b.guaranteedMinutesPerTeam - a.guaranteedMinutesPerTeam;
    return b.totalMatches - a.totalMatches;
  });

  // Max 8 variant — trenér si filtruje chipy
  const top = diverse.slice(0, 8);
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
    guaranteedMinutesPerTeam: minutesPerTeam, // round-robin: všichni hrají stejně
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
  playOut = false,
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

  let playoffMatches = 0;
  let advancePerGroup = 2;
  if (groupCount === 2) {
    playoffMatches = 4; // 2 SF + F + 3rd
    advancePerGroup = 2;
  } else if (groupCount === 3) {
    playoffMatches = 4; // 2 SF + F + 3rd (3 vítězové + best 2nd)
    advancePerGroup = 1;
  } else if (groupCount === 4) {
    playoffMatches = 4; // SF + F + 3. místo
    advancePerGroup = 1;
  }

  // Play-out: zápasy o umístění pro týmy co nepostoupí (jen pro 2 skupiny)
  let playOutMatches = 0;
  if (playOut && groupCount === 2) {
    const minGroupSize = Math.min(...groupSizes);
    playOutMatches = minGroupSize - advancePerGroup; // jedna hra za každou pozici
  }

  const totalMatches = groupMatches + playoffMatches + playOutMatches;
  const slots = Math.ceil(totalMatches / fields);
  const maxPossibleLen = Math.floor(totalMin / slots) - brk;
  const matchLen = Math.min(maxML, Math.max(minML, maxPossibleLen));
  if (maxPossibleLen < minML) return null;

  const totalDuration = slots * (matchLen + brk);

  // Matches per team (average): group = (size-1), playoff varies
  // Minimum matches per team = (size-1) for teams that don't advance
  // Guaranteed = nejmenší skupina (worst case tým), ne průměr
  const minGroupSize = Math.min(...groupSizes);
  const groupMatchesPerTeam = minGroupSize - 1;
  // Průměr pro celkové minutesPerTeam (zahrnuje playoff podíl)
  const avgGroupSize = teams / groupCount;
  const avgGroupMatches = avgGroupSize - 1;
  const avgPlayoffPerTeam = (playoffMatches * 2) / teams;
  const matchesPerTeam = avgGroupMatches + avgPlayoffPerTeam;
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
    // S play-out: každý tým hraje skupinu + 1 play-out zápas (i ten nejhorší)
    guaranteedMinutesPerTeam: Math.round((groupMatchesPerTeam + (playOut && groupCount === 2 ? 1 : 0)) * matchLen),
    totalMatches,
    totalDurationMin: totalDuration,
    label: '',
    description: `${fields}× hřiště · ${groupCount} skupiny + play-off`,
    rationale: '',
    matchOrder: [], // groups-knockout doesn't use matchOrder
    groups,
    advancePerGroup,
    playOut: playOut || undefined,
  };
}

/**
 * 4 skupiny × advance=2 = 8 týmů v playoff (QF → SF → F + 3. místo).
 * Samostatná funkce protože buildGroupsKnockout defaultně používá advance=1 pro 4 skupiny.
 */
function buildGroupsKnockoutWithAdvance2(
  teams: number,
  groupCount: number,
  fields: number,
  totalMin: number,
  minML: number,
  maxML: number,
  brk: number,
  playOut = false,
): PlannerVariant | null {
  const base = Math.floor(teams / groupCount);
  const rem = teams % groupCount;
  const groupSizes: number[] = [];
  for (let i = 0; i < groupCount; i++) {
    groupSizes.push(base + (i < rem ? 1 : 0));
  }

  const groupMatches = groupSizes.reduce((sum, s) => sum + (s * (s - 1)) / 2, 0);
  const playoffMatches = 8; // 4 QF + 2 SF + F + 3. místo
  const advancePerGroup = 2;

  // Play-out — pro 4sk×adv2 zatím nepodporujeme (jen 2 skupiny)
  const playOutMatches = 0;

  const totalMatches = groupMatches + playoffMatches + playOutMatches;
  void playOut; // reserved for future use with 4-group play-out
  const slots = Math.ceil(totalMatches / fields);
  const maxPossibleLen = Math.floor(totalMin / slots) - brk;
  const matchLen = Math.min(maxML, Math.max(minML, maxPossibleLen));
  if (maxPossibleLen < minML) return null;

  const totalDuration = slots * (matchLen + brk);
  const minGroupSize = Math.min(...groupSizes);
  const groupMatchesPerTeam = minGroupSize - 1; // guaranteed = worst case
  const avgGroupSize = teams / groupCount;
  const avgGroupMatches = avgGroupSize - 1;
  const avgPlayoffPerTeam = (playoffMatches * 2) / teams;
  const matchesPerTeam = avgGroupMatches + avgPlayoffPerTeam;
  const minutesPerTeam = matchesPerTeam * matchLen;

  const groups: { name: string; teamIndices: number[] }[] = [];
  let idx = 0;
  for (let g = 0; g < groupCount; g++) {
    const size = groupSizes[g];
    const indices = Array.from({ length: size }, (_, i) => idx + i);
    idx += size;
    groups.push({ name: `Skupina ${String.fromCharCode(65 + g)}`, teamIndices: indices });
  }

  return {
    key: `gk-g${groupCount}a2-f${fields}-l${matchLen}`,
    format: 'groups-knockout',
    fields,
    matchLengthMin: matchLen,
    breakMin: brk,
    matchesPerTeam: Math.round(matchesPerTeam * 10) / 10,
    minutesPerTeam: Math.round(minutesPerTeam),
    guaranteedMinutesPerTeam: Math.round(groupMatchesPerTeam * matchLen),
    totalMatches,
    totalDurationMin: totalDuration,
    label: '',
    description: `${fields}× hřiště · ${groupCount} skupiny (2 post.) + play-off`,
    rationale: '',
    matchOrder: [],
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

  // Assign honest, format-based labels.
  // First variant = "Doporučeno" (sorted by guaranteedMinutesPerTeam — highest
  // guaranteed play time for ALL teams, including those that don't advance).
  return variants.map((v, idx) => {
    const isGroupsKnockout = v.format === 'groups-knockout';
    const isRoundRobin = v.format === 'round-robin';

    // Honest rationale — one sentence about the trade-off
    const z = (n: number) => n === 1 ? 'zápas' : (n >= 2 && n <= 4) ? 'zápasy' : 'zápasů';
    let rationale: string;
    if (isGroupsKnockout) {
      const sizes = (v.groups ?? []).map(g => g.teamIndices.length);
      const minGroupSize = Math.min(...sizes);
      const groupCount = v.groups?.length ?? 2;
      const groupMatches = minGroupSize - 1; // worst case = nejmenší skupina
      const adv = v.advancePerGroup ?? 1;
      let advDesc: string;
      if (groupCount === 3 && adv === 1) {
        // Speciální případ: 3 vítězové + nejlepší 2. místo = 4 do playoff
        advDesc = `Do play-off postupují 3 vítězové skupin a 1 nejlepší tým z druhých míst — celkem 4 týmy (semifinále a finále).`;
      } else {
        const advTotal = adv * groupCount;
        const advLabel = adv === 1 ? 'vítěz' : adv === 2 ? 'první dva' : `${adv} nejlepší`;
        const playoffDesc = advTotal > 4
          ? 'čtvrtfinále, semifinále a finále'
          : 'semifinále a finále';
        advDesc = `Ze skupiny postupují ${advLabel} — celkem ${advTotal} ${advTotal >= 5 ? 'týmů' : advTotal >= 2 ? 'týmy' : 'tým'} do play-off (${playoffDesc}).`;
      }
      const shortGroupWarning = groupMatches <= 2
        ? ` Pozor: skupiny mají jen ${groupMatches} ${z(groupMatches)} — týmy co nepostoupí si toho moc nezahrají.`
        : '';
      const allSame = sizes.every(s => s === sizes[0]);
      const groupSizeDesc = allSame
        ? `${groupCount} skupin po ${sizes[0]} týmech`
        : `${groupCount} skupiny (${sizes.join(', ')} týmů)`;

      const isPlayOut = v.playOut === true;
      const playOutDesc = isPlayOut
        ? ` Navíc se dohrají zápasy o každé umístění (5., 7., 9.…) — každý tým získá konkrétní umístění.`
        : ` Umístění týmů co nepostoupí určí tabulka skupiny.`;

      rationale = `Turnaj je rozdělen do ${groupSizeDesc}. Každý tým odehraje minimálně ${groupMatches + (isPlayOut ? 1 : 0)} ${z(groupMatches + (isPlayOut ? 1 : 0))} po ${v.matchLengthMin} min. ${advDesc}${playOutDesc}${shortGroupWarning}`;
    } else if (isRoundRobin) {
      const perTeam = Math.round(v.matchesPerTeam);
      const totalMin = perTeam * v.matchLengthMin;
      rationale = `Každý tým se utká s každým — celkem ${perTeam} ${z(perTeam)} po ${v.matchLengthMin} min (${totalMin} min hry na tým). Nejspravedlivější formát, protože všechny týmy odehrají stejný počet zápasů. Vítěze určí konečná tabulka. Vhodné, pokud chcete, aby si všichni zahráli co nejvíc.`;
    } else {
      rationale = `Vyřazovací pavouk — každý zápas trvá ${v.matchLengthMin} min. Prohra znamená konec turnaje. Rychlý a dramatický formát, ale slabší týmy odehrají jen minimum zápasů.`;
    }

    // Popisný label
    const isPlayOutVariant = v.playOut === true;
    let label: string;
    if (idx === 0) {
      label = 'Doporučeno';
    } else if (isPlayOutVariant) {
      label = 'Každý s umístěním';
    } else {
      const recommended = variants[0];
      if (v.matchLengthMin > recommended.matchLengthMin) {
        label = 'Delší zápasy';
      } else if (v.totalDurationMin < recommended.totalDurationMin) {
        label = 'Rychlejší';
      } else if ((v.groups?.length ?? 0) > (recommended.groups?.length ?? 0)) {
        label = 'Více skupin';
      } else if ((v.groups?.length ?? 0) < (recommended.groups?.length ?? 0)) {
        label = 'Méně skupin';
      } else if (v.format === 'round-robin') {
        label = 'Každý s každým';
      } else {
        label = 'Alternativa';
      }
    }

    return {
      ...v,
      label,
      rationale,
    };
  });
}

// ─── Time-addition helper (for wizard schedule preview) ──────────────────────

export function addMinutesToHHMM(start: string, minutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}
