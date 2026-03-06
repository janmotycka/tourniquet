import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../rate-limiter';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows actions within the limit', () => {
    const limiter = createRateLimiter({ maxAttempts: 3, windowMs: 10_000 });

    expect(limiter.check()).toBe(true);
    limiter.record();
    expect(limiter.check()).toBe(true);
    limiter.record();
    expect(limiter.check()).toBe(true);
    limiter.record();
  });

  it('blocks after maxAttempts is reached', () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 10_000 });

    limiter.record();
    limiter.record();

    expect(limiter.check()).toBe(false);
  });

  it('allows again after window expires', () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 10_000 });

    limiter.record();
    limiter.record();
    expect(limiter.check()).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(11_000);

    expect(limiter.check()).toBe(true);
  });

  it('sliding window — oldest entry expires first', () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 10_000 });

    limiter.record(); // t=0
    vi.advanceTimersByTime(5_000); // t=5s
    limiter.record(); // t=5s
    expect(limiter.check()).toBe(false); // 2 in window

    vi.advanceTimersByTime(6_000); // t=11s → first record expired
    expect(limiter.check()).toBe(true); // only 1 in window now
  });

  it('getRetryAfterSeconds returns 0 when not limited', () => {
    const limiter = createRateLimiter({ maxAttempts: 3, windowMs: 10_000 });
    expect(limiter.getRetryAfterSeconds()).toBe(0);
  });

  it('getRetryAfterSeconds returns seconds until oldest expires', () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 10_000 });

    limiter.record();
    limiter.record();

    // Right after hitting the limit
    const retry = limiter.getRetryAfterSeconds();
    expect(retry).toBeGreaterThanOrEqual(9);
    expect(retry).toBeLessThanOrEqual(10);
  });

  it('reset clears all recorded attempts', () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 10_000 });

    limiter.record();
    expect(limiter.check()).toBe(false);

    limiter.reset();
    expect(limiter.check()).toBe(true);
  });
});
