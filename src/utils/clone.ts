import { logger } from './logger';

/** Deep clone via JSON serialization. Returns original on failure. */
export function safeClone<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (err) {
    logger.error('[safeClone] Failed to clone object:', err);
    return obj;
  }
}
