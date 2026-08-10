import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashPin,
  generatePinSalt,
  generateNumericPin,
  markPinVerified,
  isPinVerified,
  clearPinVerified,
} from '../pin-hash';

// ─── hashPin ─────────────────────────────────────────────────────────────────

describe('hashPin', () => {
  it('returns a 64-char hex string (SHA-256)', async () => {
    const hash = await hashPin('123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns consistent hashes for the same input', async () => {
    const hash1 = await hashPin('123456');
    const hash2 = await hashPin('123456');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different PINs', async () => {
    const hash1 = await hashPin('123456');
    const hash2 = await hashPin('654321');
    expect(hash1).not.toBe(hash2);
  });

  it('returns different hashes with different salts', async () => {
    const hash1 = await hashPin('123456', 'salt1');
    const hash2 = await hashPin('123456', 'salt2');
    expect(hash1).not.toBe(hash2);
  });

  it('returns different hash with salt vs without salt', async () => {
    const hashNoSalt = await hashPin('123456');
    const hashWithSalt = await hashPin('123456', 'mysalt');
    expect(hashNoSalt).not.toBe(hashWithSalt);
  });
});

// PIN ověření je server-side (Cloud Function `verifyTournamentPin`).
// Klient pouze hashuje PIN při ZÁPISU nového turnaje (hashPin).

// ─── generatePinSalt ─────────────────────────────────────────────────────────

describe('generatePinSalt', () => {
  it('returns a 32-char hex string (128-bit)', () => {
    const salt = generatePinSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates unique salts', () => {
    const salt1 = generatePinSalt();
    const salt2 = generatePinSalt();
    expect(salt1).not.toBe(salt2);
  });
});

// ─── generateNumericPin ──────────────────────────────────────────────────────

describe('generateNumericPin', () => {
  it('generuje 6místný PIN bez vedoucí nuly ve správném rozsahu', () => {
    for (let i = 0; i < 300; i++) {
      const pin = generateNumericPin(6);
      expect(pin).toMatch(/^[1-9][0-9]{5}$/);
      const n = Number(pin);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it('podporuje 4místný PIN (match pairing)', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateNumericPin(4)).toMatch(/^[1-9][0-9]{3}$/);
    }
  });

  it('produkuje rozmanité hodnoty (ne konstantu)', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateNumericPin(6)));
    expect(set.size).toBeGreaterThan(90);
  });
});

// ─── Session storage helpers ─────────────────────────────────────────────────

describe('markPinVerified / isPinVerified / clearPinVerified', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('marks a tournament PIN as verified', () => {
    expect(isPinVerified('t1')).toBe(false);
    markPinVerified('t1');
    expect(isPinVerified('t1')).toBe(true);
  });

  it('does not affect other tournament IDs', () => {
    markPinVerified('t1');
    expect(isPinVerified('t2')).toBe(false);
  });

  it('clears verification', () => {
    markPinVerified('t1');
    clearPinVerified('t1');
    expect(isPinVerified('t1')).toBe(false);
  });
});
