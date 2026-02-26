/**
 * Dev-only logger — v produkci tiché, v dev plné logy.
 * Nahrazuje přímé volání console.log/warn v kódu.
 *
 * Použití:
 *   import { logger } from '../utils/logger';
 *   logger.debug('[Store] data loaded');
 *   logger.warn('[Firebase] fallback path');
 *   logger.error('[Stripe] failed', err);  // error vždy (i v prod)
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /** Pouze v dev — info/debug logy */
  debug: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },
  /** Pouze v dev — varování bez dopadu na funkci */
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
  },
  /** Vždy — skutečné chyby (Stripe, Firebase auth failures, ...) */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
