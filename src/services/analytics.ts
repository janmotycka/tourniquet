/**
 * analytics — first-party anonymní denní čítače událostí (Firebase RTDB).
 *
 * Audit 2026-06-10 (growth audit P1): viral funnel byl slepý — `?ref=` parametry
 * se nastavovaly, ale nikdo je neměřil. Místo třetí strany (Plausible/PostHog
 * = účet, náklady, případně consent) ukládáme AGREGOVANÉ čítače přímo do RTDB:
 *
 *   /analytics/{YYYY-MM-DD}/{eventKey}: number   (increment-only)
 *
 * GDPR: žádná osobní data, žádné cookies, žádné user ID — jen denní součty.
 * Consent banner není potřeba, public view zůstává zero-friction.
 *
 * Zápis: kdokoli (i nepřihlášený divák), ale rules vynucují increment +1
 * a whitelist klíčů regexem — abuse maximálně nafoukne čítač, nic nerozbije.
 * Čtení: jen admin (dashboard v AdminPage).
 *
 * Limity záměrného minimalismu: žádné user-level funnely ani session replay —
 * pro beta (jednotky trenérů + jejich rodiče) stačí denní agregace funnelu
 * public_view → viral klik → ref signin → vytvořený zápas.
 */

import { ref as dbRef, update, increment } from 'firebase/database';
import { db } from '../firebase';
import { logger } from '../utils/logger';

/**
 * Známé eventy (informativní union — rules vynucují jen regex ^[a-z0-9_]+$;
 * délku 40 ořezává klientská sanitizace + RTDB limit délky klíče).
 */
export type AnalyticsEvent =
  | 'app_open'                  // start přihlášené session (1× per session)
  | 'match_created'
  | 'match_started'
  | 'match_finished'
  | 'tournament_created'
  | 'public_match_view'         // divák otevřel public zápas (1× per session)
  | 'public_tournament_view'    // divák otevřel public turnaj (1× per session)
  | 'viral_match_cta_click'     // klik na viral banner v public zápase
  | 'viral_tournament_cta_click'
  | 'donate_click'
  | `ref_${string}`;            // přistání s ?ref=… (ref_public_match, …)

// Per-tab dedup (žádné cookies/localStorage — soukromí > přesnost).
const seenThisSession = new Set<string>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Sanitizace dynamické části klíče (ref hodnoty z URL). */
export function sanitizeEventKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
}

/**
 * Zaznamenat událost. Fire-and-forget — analytika NIKDY nesmí rozbít app
 * (všechny chyby spolkneme, jen debug log).
 */
export function track(event: AnalyticsEvent, opts?: { oncePerSession?: boolean }): void {
  try {
    const key = sanitizeEventKey(event);
    if (!key) return;
    if (opts?.oncePerSession) {
      if (seenThisSession.has(key)) return;
      seenThisSession.add(key);
    }
    void update(dbRef(db, `analytics/${todayKey()}`), { [key]: increment(1) })
      .catch(err => logger.debug('[analytics] write failed (ignored):', err?.message));
  } catch (err) {
    logger.debug('[analytics] track failed (ignored):', err);
  }
}
