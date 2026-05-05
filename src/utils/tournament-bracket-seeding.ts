/**
 * Tournament bracket seeding helpers — pure logic for visual bracket preview.
 *
 * Functions here are SIDE-EFFECT-FREE and easy to unit test. Used primarily
 * by `TournamentStructureDiagram` v wizardu (Step 3) pro vizuální preview
 * struktury turnaje.
 *
 * Klíčová pravidla (best practices UEFA/FIFA/NCAA):
 *  - Top seedi musí být rozloženi do opačných stran bracketu (recursive bisection)
 *  - Byes jsou párovány s top seedy (každý top seed má bye partnera)
 *  - Pro groups+KO: cross-bracket pairing (group teams se nepotkají do F)
 */

/**
 * Generuje standardní turnajové nasazení (recursive bisection).
 * Returns array kde index = slot v bracketu, value = seed (1-based).
 *
 * Algorithm: start s [1, 2], pak každé doubling:
 *   pro každý seed s v current order: push s, push (newLength + 1 - s)
 *
 * Příklady:
 *   size 2:  [1, 2]
 *   size 4:  [1, 4, 2, 3]
 *   size 8:  [1, 8, 4, 5, 2, 7, 3, 6]
 *   size 16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
 */
export function generateSeedingOrder(size: number): number[] {
  if (size < 2) return [1];
  let order: number[] = [1, 2];
  while (order.length < size) {
    const newLength = order.length * 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s);
      next.push(newLength + 1 - s);
    }
    order = next;
  }
  return order;
}

/**
 * Distribuuje N týmů do bracketu velikosti next-power-of-2 podle
 * **standardního turnajového nasazení**.
 *
 * Top seedi jsou rozloženi do opačných stran bracketu, takže se mohou
 * potkat až v SF/F. Byes jsou párovány s top seedy.
 *
 * Returns array délky `nextPowerOfTwo(N)` kde každý slot obsahuje buď
 * tým z `teams` (slot[seed-1]) nebo '—' (bye).
 *
 * Příklad pro 12 týmů v bracketu 16 (4 byes):
 *   - Slot 0: teams[0] (seed 1)
 *   - Slot 1: '—' (seed 16, bye)
 *   - Slot 4: teams[3] (seed 4)
 *   - Slot 5: '—' (seed 13, bye)
 *   - ...
 */
export function distributeTeamsWithByes(teams: string[]): string[] {
  const N = teams.length;
  if (N < 2) return teams;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(N)));
  const seedAtSlot = generateSeedingOrder(bracketSize);

  const result: string[] = new Array(bracketSize).fill('—');
  for (let slot = 0; slot < bracketSize; slot++) {
    const seed = seedAtSlot[slot]; // 1-based
    if (seed <= N) {
      result[slot] = teams[seed - 1];
    }
    // else: stays '—' (bye)
  }
  return result;
}

/**
 * Generuje labely pro první kolo bracketu při formátu groups+knockout.
 * Pro klasické konfigurace (2/3/4 skupiny × 1/2 advance) používá
 * **cross-bracket pairing** — group teams se nepotkají do finále.
 * Pro ostatní konfigurace fallback na standard seeding.
 *
 * Příklady:
 *  - 2 groups × 1: ['A1', 'B1'] (just final)
 *  - 4 groups × 2: ['A1','B2','C1','D2','B1','A2','D1','C2']
 *  - 3 groups × 2: ['A1','—','B2','C1','B1','—','A2','C2'] (top seedi mají bye)
 */
export function generateBracketLabels(groupCount: number, advancePerGroup: number): string[] {
  const letter = (i: number) => String.fromCharCode(65 + i);

  // Explicit cases s optimálním cross-bracket seedingem (klasické turnaje):
  if (advancePerGroup === 1) {
    if (groupCount === 2) return ['A1', 'B1'];
    if (groupCount === 3) return ['A1', '—', 'B1', 'C1']; // bracket of 4 with 1 bye
    if (groupCount === 4) return ['A1', 'C1', 'B1', 'D1']; // cross-bracket SF
  } else if (advancePerGroup === 2) {
    if (groupCount === 2) return ['A1', 'B2', 'B1', 'A2'];
    if (groupCount === 4) return ['A1', 'B2', 'C1', 'D2', 'B1', 'A2', 'D1', 'C2'];
    if (groupCount === 3) {
      // 6 teams in bracket of 8. Top seeds (A1, B1) get bye into SF.
      return ['A1', '—', 'B2', 'C1', 'B1', '—', 'A2', 'C2'];
    }
  }

  // Generic fallback (5+ skupin nebo advance ≥ 3):
  // Order: 1st places, 2nd places, 3rd places, ... (top seeds first).
  // distributeTeamsWithByes umístí byes 1-per-match podle standard seedingu.
  const teams: string[] = [];
  for (let pos = 1; pos <= advancePerGroup; pos++) {
    for (let g = 0; g < groupCount; g++) {
      teams.push(`${letter(g)}${pos}`);
    }
  }
  return distributeTeamsWithByes(teams);
}
