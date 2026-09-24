/**
 * Sentry inicializace — musí se importovat jako první v main.tsx.
 *
 * DSN se nastavuje přes env variable VITE_SENTRY_DSN.
 * Bez DSN se Sentry neinicializuje (dev/test prostředí).
 */

import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    // Šum z browser rozšíření (MetaMask, wallety, překladače…) — cizí kód
    // injektovaný do stránky, ne naše chyba. Sentry 2026-09-24: „Failed to
    // connect to MetaMask" z chrome-extension:// content scriptu.
    denyUrls: [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^safari(-web)?-extension:\/\//,
      /extensions\//i,
    ],
    dsn,
    environment: import.meta.env.DEV ? 'development' : 'production',
    // Omezení na 10% transactions — šetří kvótu, stačí pro error monitoring
    tracesSampleRate: 0.1,
    // V dev nechceme posílat do Sentry
    enabled: !import.meta.env.DEV,
    // Filtrovat šum z prohlížečů
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection',
      'Network request failed',
      'Load failed',
      'Failed to fetch',
      // Šum z browser rozšíření (MetaMask, wallety) — 2026-09-24
      /MetaMask/i,
      /extension not found/i,
      /ethereum\b.*(?:undefined|not defined|redefine)/i,
      /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/,
    ],
    beforeSend(event) {
      // Neposlat PII — odstranit user email/jméno pokud by Sentry zachytilo
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
      }
      return event;
    },
  });
}

export { Sentry };
