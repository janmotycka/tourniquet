import { describe, it, expect } from 'vitest';
import { isLightColor, isNearWhite, textOnColor, TEAM_COLORS } from '../team-colors';

describe('isLightColor', () => {
  it('returns true for white', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
  });

  it('returns true for yellow', () => {
    expect(isLightColor('#FDD835')).toBe(true);
  });

  it('returns false for black', () => {
    expect(isLightColor('#222222')).toBe(false);
  });

  it('returns false for dark blue', () => {
    expect(isLightColor('#1E88E5')).toBe(false);
  });

  it('returns false for dark red', () => {
    expect(isLightColor('#E53935')).toBe(false);
  });
});

describe('isNearWhite', () => {
  it('returns true for white', () => {
    expect(isNearWhite('#FFFFFF')).toBe(true);
  });

  it('returns false for yellow', () => {
    expect(isNearWhite('#FDD835')).toBe(false);
  });

  it('returns false for black', () => {
    expect(isNearWhite('#222222')).toBe(false);
  });
});

describe('textOnColor', () => {
  it('returns dark text for light backgrounds', () => {
    expect(textOnColor('#FFFFFF')).toBe('#222');
    expect(textOnColor('#FDD835')).toBe('#222');
  });

  it('returns white text for dark backgrounds', () => {
    expect(textOnColor('#222222')).toBe('#fff');
    expect(textOnColor('#1E88E5')).toBe('#fff');
    expect(textOnColor('#E53935')).toBe('#fff');
  });
});

describe('TEAM_COLORS', () => {
  it('contains at least 10 colors', () => {
    expect(TEAM_COLORS.length).toBeGreaterThanOrEqual(10);
  });

  it('all entries are valid hex colors', () => {
    for (const color of TEAM_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
