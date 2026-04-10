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

// ─── Service Worker — force update + auto-recovery ─────────────────────────
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
      setTimeout(() => window.location.reload(), 500);
    }
  });

  // Auto-recovery: pokud se app nenačte do 8 sekund (stale SW cache),
  // automaticky odregistruj SW, vyčisti cache a reloadni.
  // Ochrana proti loop: max 1× za 30 sekund.
  const RECOVERY_KEY = 'torq_sw_recovery';
  const lastRecovery = parseInt(sessionStorage.getItem(RECOVERY_KEY) ?? '0');
  const now = Date.now();
  if (now - lastRecovery > 30_000) {
    const recoveryTimer = setTimeout(async () => {
      // Pokud se do 8s nezobrazil #root obsah, app je zaseklá
      const root = document.getElementById('root');
      if (root && root.childElementCount <= 1) {
        sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
        } catch { /* ignore */ }
        window.location.reload();
      }
    }, 8_000);
    // Pokud se app načte normálně, zruš recovery timer
    window.addEventListener('load', () => clearTimeout(recoveryTimer));
  }
}

// ─── Render ──────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
