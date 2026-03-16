import { describe, it, expect } from 'vitest';
import { formatMinutes, formatDate } from '../time';

describe('formatMinutes', () => {
  it('formats minutes under 60', () => {
    expect(formatMinutes(30)).toBe('30 min');
  });

  it('formats exactly 60 minutes', () => {
    expect(formatMinutes(60)).toBe('1 h');
  });

  it('formats hours + minutes', () => {
    expect(formatMinutes(90)).toBe('1 h 30 min');
  });

  it('formats exactly 2 hours', () => {
    expect(formatMinutes(120)).toBe('2 h');
  });

  it('formats 0 minutes', () => {
    expect(formatMinutes(0)).toBe('0 min');
  });
});

describe('formatDate', () => {
  it('formats ISO date string in Czech locale', () => {
    const result = formatDate('2025-06-15T10:00:00Z', 'cs');
    // Should contain day, month, year in Czech
    expect(result).toContain('2025');
    expect(result).toContain('15');
  });

  it('formats ISO date string in English locale', () => {
    const result = formatDate('2025-06-15T10:00:00Z', 'en');
    expect(result).toContain('2025');
    expect(result).toContain('15');
  });
});
