import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashPin,
  verifyPin,
  generatePinSalt,
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

// ─── verifyPin ───────────────────────────────────────────────────────────────

describe('verifyPin', () => {
  it('returns true for correct PIN without salt', async () => {
    const hash = await hashPin('123456');
    expect(await verifyPin('123456', hash)).toBe(true);
  });

  it('returns false for wrong PIN', async () => {
    const hash = await hashPin('123456');
    expect(await verifyPin('000000', hash)).toBe(false);
  });

  it('returns true for correct PIN with salt', async () => {
    const salt = 'test-salt';
    const hash = await hashPin('123456', salt);
    expect(await verifyPin('123456', hash, salt)).toBe(true);
  });

  it('returns false when salt is different', async () => {
    const hash = await hashPin('123456', 'salt-a');
    expect(await verifyPin('123456', hash, 'salt-b')).toBe(false);
  });

  it('returns false for correct PIN but missing salt', async () => {
    const hash = await hashPin('123456', 'mysalt');
    expect(await verifyPin('123456', hash)).toBe(false);
  });
});

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
