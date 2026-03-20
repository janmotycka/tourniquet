// Sentry musí být importován jako první — inicializuje error tracking
import './sentry';

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useToastStore } from './store/toast.store'
import { logger } from './utils/logger'

// ─── Global error handlers ──────────────────────────────────────────────────
// Zachytí neošetřené Promise rejects a JS chyby a zobrazí toast uživateli

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
  logger.error('[Global] Unhandled rejection:', msg);
  useToastStore.getState().show('error', `Unexpected error: ${msg.slice(0, 120)}`, 6000);
});

window.addEventListener('error', (event) => {
  logger.error('[Global] Uncaught error:', event.message);
  useToastStore.getState().show('error', `Error: ${event.message.slice(0, 120)}`, 6000);
});

// ─── Clear stale Firebase flags ──────────────────────────────────────────────
// Pokud Firebase SDK dříve selhalo na WebSocket, nastaví flag který vynutí
// pomalý long-polling. Toto vyčistíme při každém startu.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.includes('previous_websocket_failure')) {
      localStorage.removeItem(key);
    }
  }
} catch { /* localStorage může být nedostupný */ }

// ─── Service Worker — force update on new version ───────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    // Kontroluj novou verzi každých 60 sekund
    setInterval(() => {
      registration.update().catch(() => { /* ignore network errors */ });
    }, 60_000);
  });

  // Když nový SW převezme kontrolu → reload stránky (s ochranou proti smyčce)
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      // Krátká prodleva aby SW stihl převzít kontrolu
      setTimeout(() => window.location.reload(), 500);
    }
  });
}

// ─── Render ──────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
