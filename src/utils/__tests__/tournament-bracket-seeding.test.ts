import { describe, it, expect } from 'vitest';
import {
  generateSeedingOrder,
  distributeTeamsWithByes,
  generateBracketLabels,
} from '../tournament-bracket-seeding';

describe('generateSeedingOrder', () => {
  it('returns [1] for size 1 (degenerate)', () => {
    expect(generateSeedingOrder(1)).toEqual([1]);
  });

  it('returns [1, 2] for size 2', () => {
    expect(generateSeedingOrder(2)).toEqual([1, 2]);
  });

  it('size 4: [1, 4, 2, 3] (standard 1v4, 2v3 SF pairing)', () => {
    expect(generateSeedingOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it('size 8: [1, 8, 4, 5, 2, 7, 3, 6] (FIFA-style QF pairings)', () => {
    expect(generateSeedingOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('size 16: top seeds (1-4) spread to 4 quarters', () => {
    const result = generateSeedingOrder(16);
    expect(result).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
    // Top 4 seeds at slot indexes 0, 4, 8, 12 — start of each quarter
    expect(result.indexOf(1)).toBe(0);  // Q1
    expect(result.indexOf(4)).toBe(4);  // Q2
    expect(result.indexOf(2)).toBe(8);  // Q3
    expect(result.indexOf(3)).toBe(12); // Q4
  });

  it('size 32: top seeds spread maximally (1@0, 2@16, 3@24, 4@8)', () => {
    const result = generateSeedingOrder(32);
    expect(result).toHaveLength(32);
    // Each value 1..32 appears exactly once
    expect(new Set(result).size).toBe(32);
    // Top seeds at quarter starts:
    expect(result.indexOf(1)).toBe(0);   // top
    expect(result.indexOf(2)).toBe(16);  // bottom half start
    expect(result.indexOf(3)).toBe(24);  // 3rd quarter
    expect(result.indexOf(4)).toBe(8);   // 2nd quarter
  });
});

describe('distributeTeamsWithByes', () => {
  it('returns input when fewer than 2 teams', () => {
    expect(distributeTeamsWithByes([])).toEqual([]);
    expect(distributeTeamsWithByes(['A'])).toEqual(['A']);
  });

  it('2 teams: [A, B] (no byes, full bracket of 2)', () => {
    expect(distributeTeamsWithByes(['A', 'B'])).toEqual(['A', 'B']);
  });

  it('3 teams in bracket of 4: top seed has bye', () => {
    // seedAtSlot for 4 = [1, 4, 2, 3]
    // Seed 4 > N=3 → bye at slot 1
    expect(distributeTeamsWithByes(['A', 'B', 'C'])).toEqual(['A', '—', 'B', 'C']);
  });

  it('4 teams in bracket of 4: no byes, standard seeding', () => {
    expect(distributeTeamsWithByes(['A', 'B', 'C', 'D'])).toEqual(['A', 'D', 'B', 'C']);
  });

  it('5 teams in bracket of 8: 3 byes, distributed via standard seeding', () => {
    // seedAtSlot for 8 = [1, 8, 4, 5, 2, 7, 3, 6]
    // Real seeds: 1-5. Byes: 6, 7, 8.
    // Slot 0: seed 1 = A; Slot 1: seed 8 → bye; Slot 2: seed 4 = D
    // Slot 3: seed 5 = E; Slot 4: seed 2 = B; Slot 5: seed 7 → bye
    // Slot 6: seed 3 = C; Slot 7: seed 6 → bye
    expect(distributeTeamsWithByes(['A', 'B', 'C', 'D', 'E']))
      .toEqual(['A', '—', 'D', 'E', 'B', '—', 'C', '—']);
  });

  it('12 teams in bracket of 16: top seeds (A,B,C,D) spread to 4 quarters', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const result = distributeTeamsWithByes(teams);
    expect(result).toHaveLength(16);
    // Top 4 seeds at slots 0, 4, 8, 12 (quarter starts)
    expect(result[0]).toBe('A'); // seed 1
    expect(result[4]).toBe('D'); // seed 4
    expect(result[8]).toBe('B'); // seed 2
    expect(result[12]).toBe('C'); // seed 3
    // Each top seed paired with bye (slot+1)
    expect(result[1]).toBe('—'); // bye for A
    expect(result[5]).toBe('—'); // bye for D
    expect(result[9]).toBe('—'); // bye for B
    expect(result[13]).toBe('—'); // bye for C
    // Total byes = 16 - 12 = 4
    expect(result.filter(s => s === '—')).toHaveLength(4);
  });

  it('8 teams in bracket of 8: no byes', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const result = distributeTeamsWithByes(teams);
    expect(result).toHaveLength(8);
    expect(result.filter(s => s === '—')).toHaveLength(0);
  });
});

describe('generateBracketLabels — explicit cross-bracket cases for groups+KO', () => {
  it('2 groups × 1 advance: just final A1 vs B1', () => {
    expect(generateBracketLabels(2, 1)).toEqual(['A1', 'B1']);
  });

  it('2 groups × 2 advance: cross-bracket A1/B2, B1/A2', () => {
    // A1 doesn't meet A2 until F; same for B1/B2
    expect(generateBracketLabels(2, 2)).toEqual(['A1', 'B2', 'B1', 'A2']);
  });

  it('3 groups × 1 advance: A1 (bye), B1 vs C1', () => {
    expect(generateBracketLabels(3, 1)).toEqual(['A1', '—', 'B1', 'C1']);
  });

  it('3 groups × 2 advance: 6 teams, top seeds A1/B1 get bye', () => {
    expect(generateBracketLabels(3, 2)).toEqual([
      'A1', '—', 'B2', 'C1',
      'B1', '—', 'A2', 'C2',
    ]);
  });

  it('4 groups × 1 advance: SF1: A vs C, SF2: B vs D', () => {
    expect(generateBracketLabels(4, 1)).toEqual(['A1', 'C1', 'B1', 'D1']);
  });

  it('4 groups × 2 advance: classic FIFA-style cross-bracket', () => {
    expect(generateBracketLabels(4, 2)).toEqual([
      'A1', 'B2', 'C1', 'D2',
      'B1', 'A2', 'D1', 'C2',
    ]);
  });
});

describe('generateBracketLabels — bye position consistency (B1 regression)', () => {
  // Audit 2026-04-29 (B1 bug): BracketTree position-based bye distribution
  // (byes do odd slotů) se neshodovala s label-based bye sloty z generateBracketLabels.
  // Pro 3 skupiny × 2 advance se Match 1 (B2 vs C1, real match) vykreslil
  // jako "B2 (bye)" walkover — kritický bug pro nejčastější McDonald's Cup config.
  //
  // Tyto testy ověřují, že labels jsou vnitřně konzistentní:
  // - Bye sloty jsou tam kde mají být (top seedi mají bye partnera)
  // - Real matches nemají bye slot
  // - BracketTree teď čte byes z labels (single source of truth)

  it('3 groups × 2 advance: bye sloty na specifických pozicích (B1 fix)', () => {
    // Klasický McDonald's pro 11-12 týmů: 3 skupiny × 2 advance = 6 týmů v bracketu 8
    const labels = generateBracketLabels(3, 2);
    expect(labels).toEqual(['A1', '—', 'B2', 'C1', 'B1', '—', 'A2', 'C2']);
    // Bye sloty na 1, 5 (NE 1, 3 jak by řekla position-based logika)
    const byeSlots = labels.map((l, i) => (l === '—' ? i : -1)).filter(i => i >= 0);
    expect(byeSlots).toEqual([1, 5]);
    // Match 1 (slots 2, 3 = B2, C1) je REAL — musí se renderovat jako match B2 vs C1
    // (předtím se renderoval jako "B2 (bye)" walkover)
    expect(labels[2]).toBe('B2');
    expect(labels[3]).toBe('C1');
  });

  it('5 groups × 1 advance: Match 1 D1 vs E1 je real (ne walkover)', () => {
    // Předtím se Match 1 (D1 vs E1) vykreslil jako "D1 (bye)" walkover
    const labels = generateBracketLabels(5, 1);
    expect(labels).toHaveLength(8);
    // Match 1 obsahuje D1 a E1 jako real matches (slots 2, 3)
    expect(labels[2]).toBe('D1');
    expect(labels[3]).toBe('E1');
    // Slot 5 a 7 jsou bye (top seedi B1 a C1 mají bye)
    expect(labels[5]).toBe('—');
    expect(labels[7]).toBe('—');
  });

  it('every match position has at most 1 bye (no all-bye matches)', () => {
    // Pro různé konfigurace ověř invariantu: žádný R1 match nemá oba sloty bye
    const configs: Array<[number, number]> = [
      [3, 1], [3, 2], [4, 2], [4, 3], [5, 1], [5, 2], [6, 2], [8, 2],
    ];
    for (const [groups, advance] of configs) {
      const labels = generateBracketLabels(groups, advance);
      for (let i = 0; i < labels.length / 2; i++) {
        const slot1Bye = labels[2 * i] === '—';
        const slot2Bye = labels[2 * i + 1] === '—';
        expect(
          slot1Bye && slot2Bye,
          `Config ${groups}×${advance}: match ${i} has both slots as bye`,
        ).toBe(false);
      }
    }
  });
});

describe('generateBracketLabels — generic fallback for 5+ groups', () => {
  it('5 groups × 1 advance: 5 teams in bracket of 8, top seeds spread', () => {
    const result = generateBracketLabels(5, 1);
    expect(result).toHaveLength(8);
    // Top seed A1 at slot 0, bye at slot 1
    expect(result[0]).toBe('A1');
    expect(result[1]).toBe('—');
    // Total: 5 real teams + 3 byes
    expect(result.filter(s => s !== '—')).toHaveLength(5);
    expect(result.filter(s => s === '—')).toHaveLength(3);
  });

  it('8 groups × 1 advance: 8 teams in bracket of 8 (FIFA WC group winners)', () => {
    const result = generateBracketLabels(8, 1);
    expect(result).toHaveLength(8);
    // No byes
    expect(result.filter(s => s === '—')).toHaveLength(0);
    // Top seed A1 at slot 0
    expect(result[0]).toBe('A1');
  });

  it('8 groups × 2 advance: 16 teams in bracket of 16 (full FIFA WC R16)', () => {
    const result = generateBracketLabels(8, 2);
    expect(result).toHaveLength(16);
    expect(result.filter(s => s === '—')).toHaveLength(0);
    expect(result[0]).toBe('A1');
  });

  it('4 groups × 3 advance: 12 teams in bracket of 16, 4 byes for group winners', () => {
    const result = generateBracketLabels(4, 3);
    expect(result).toHaveLength(16);
    // 12 real teams + 4 byes
    expect(result.filter(s => s !== '—')).toHaveLength(12);
    expect(result.filter(s => s === '—')).toHaveLength(4);
    // Top 4 seeds (A1, B1, C1, D1 — group winners) get byes
    // Standard seeding placements: A1 at 0, D1 at 4, B1 at 8, C1 at 12
    expect(result[0]).toBe('A1');
    expect(result[4]).toBe('D1');
    expect(result[8]).toBe('B1');
    expect(result[12]).toBe('C1');
    // Each has bye partner
    expect(result[1]).toBe('—');
    expect(result[5]).toBe('—');
    expect(result[9]).toBe('—');
    expect(result[13]).toBe('—');
  });
});
