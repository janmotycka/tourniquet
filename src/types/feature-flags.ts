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

/**
 * Audit 2026-06-10 (monetizační zjednodušení pro beta):
 *
 * PREMIUM_ENABLED — Premium/upgrade UI (bannery, upgrade buttony, paywall
 * copy s cenou). Vypnuto: Premium dnes nenabízí kvalitativní hodnotu (jen
 * vyšší limity) a Stripe flow není pro beta podstatný. Limity (FeatureGate)
 * ZŮSTÁVAJÍ jako anti-abuse — jen se mění copy z "kup Premium" na poctivou
 * beta zprávu s kontaktem. Subscription store + Cloud Functions zůstávají
 * v kódu nedotčené (existing premium users fungují dál).
 *
 * FACR_REPORT_ENABLED — "Hlášení pro FAČR" je jen copy-paste pomocník pro
 * is.fotbal.cz (žádná reálná integrace). Pro beta skryto, aby nesliboval
 * víc než umí. Kód (match-facr-report.ts) zůstává.
 *
 * DONATE_URL — odkaz "Podpořit TORQ" (Stripe Payment Link / Buy Me a Coffee).
 * Prázdný string = donate tlačítka se nezobrazují (jen kontaktní email).
 */
export const PREMIUM_ENABLED = false;
export const FACR_REPORT_ENABLED = false;
export const DONATE_URL = '';

/** Helper — true když má smysl zobrazit donate tlačítko. */
export function isDonateEnabled(): boolean {
  return DONATE_URL.length > 0;
}
