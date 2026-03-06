import { describe, it, expect } from 'vitest';
import { generateId } from '../id';

describe('generateId', () => {
  it('returns a 16-character string', () => {
    const id = generateId();
    expect(id).toHaveLength(16);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('contains only alphanumeric characters', () => {
    const id = generateId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});
