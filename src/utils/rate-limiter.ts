/**
 * Klientský rate limiter — brání spam útokům na chat a PIN ověřování.
 * Používá sliding window pattern (ukládá timestampy posledních N akcí).
 *
 * Není náhradou za server-side rate limiting, ale chrání UI a snižuje
 * zbytečné Firebase zápisy z jednoho klienta.
 */

interface RateLimiterConfig {
  /** Maximální počet akcí v okně */
  maxAttempts: number;
  /** Délka okna v milisekundách */
  windowMs: number;
}

interface RateLimiter {
  /** Vrátí true pokud je akce povolena, false pokud je rate limit překročen */
  check: () => boolean;
  /** Zaznamená provedení akce (volat PO úspěšném check) */
  record: () => void;
  /** Vrátí počet sekund do uvolnění dalšího slotu */
  getRetryAfterSeconds: () => number;
  /** Resetuje limiter (např. po úspěšném přihlášení) */
  reset: () => void;
}

/**
 * Vytvoří rate limiter s danou konfigurací.
 *
 * @example
 * const chatLimiter = createRateLimiter({ maxAttempts: 5, windowMs: 30_000 });
 *
 * function sendMessage() {
 *   if (!chatLimiter.check()) {
 *     alert(`Příliš mnoho zpráv. Zkuste za ${chatLimiter.getRetryAfterSeconds()}s.`);
 *     return;
 *   }
 *   chatLimiter.record();
 *   // ... odeslat zprávu
 * }
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const { maxAttempts, windowMs } = config;
  let timestamps: number[] = [];

  function pruneOld(): void {
    const cutoff = Date.now() - windowMs;
    timestamps = timestamps.filter(t => t > cutoff);
  }

  return {
    check(): boolean {
      pruneOld();
      return timestamps.length < maxAttempts;
    },

    record(): void {
      timestamps.push(Date.now());
    },

    getRetryAfterSeconds(): number {
      pruneOld();
      if (timestamps.length < maxAttempts) return 0;
      // Nejstarší timestamp v okně → kolik ms zbývá do jeho expirace
      const oldest = timestamps[0];
      const retryAfterMs = oldest + windowMs - Date.now();
      return Math.max(1, Math.ceil(retryAfterMs / 1000));
    },

    reset(): void {
      timestamps = [];
    },
  };
}

// ─── Předkonfigurované limitery ──────────────────────────────────────────────

/** Chat: max 5 zpráv za 30 sekund */
export const chatRateLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 30_000,
});

/** PIN ověření: max 5 pokusů za 60 sekund */
export const pinRateLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 60_000,
});
