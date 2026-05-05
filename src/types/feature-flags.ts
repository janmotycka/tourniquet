/**
 * Feature flags pro veřejné spuštění.
 *
 * Audit 2026-04-29: pre-release fokus na fotbal + zápasy + turnaje + klub.
 * Trénink generátor a další moduly jsou připravené, ale dočasně skryté
 * dokud neověříme core flow s reálnými trenéry.
 *
 * Až ověříme core na produkci, postupně otevřeme další moduly:
 *   1. TRAINING_ENABLED → otevřít trénink generátor + library + manual builder
 *   2. ENABLED_SPORTS rozšířit (sport.types.ts)
 *
 * Existing users s daty v skrytých modulech se nedostanou k UI, ale data
 * v Firebase zůstávají (graceful degradation).
 */

/** Trénink generátor + library + manual builder. */
export const TRAINING_ENABLED = false;

/** Helper — true když je trénink modul viditelný v UI. */
export function isTrainingEnabled(): boolean {
  return TRAINING_ENABLED;
}
