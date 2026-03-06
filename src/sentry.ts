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
