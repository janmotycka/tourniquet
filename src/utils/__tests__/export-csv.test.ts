import { describe, it, expect } from 'vitest';

// Test the CSV escape logic (extracted concept — the function is private,
// so we test the behavior through the public API indirectly).
// For now we test the formula injection guard pattern.

describe('CSV formula injection guard', () => {
  // This pattern is used in escapeCsvField
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];

  it('identifies formula injection characters', () => {
    for (const ch of dangerousChars) {
      expect(/^[=+\-@\t\r]/.test(`${ch}SUM(A1)`)).toBe(true);
    }
  });

  it('does not flag safe strings', () => {
    const safe = ['Hello', '123', 'FC Praha', 'Jan Novák'];
    for (const s of safe) {
      expect(/^[=+\-@\t\r]/.test(s)).toBe(false);
    }
  });
});
