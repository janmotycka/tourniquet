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
  useToastStore.getState().show('error', `Neočekávaná chyba: ${msg.slice(0, 120)}`, 6000);
});

window.addEventListener('error', (event) => {
  logger.error('[Global] Uncaught error:', event.message);
  useToastStore.getState().show('error', `Chyba: ${event.message.slice(0, 120)}`, 6000);
});

// ─── Render ──────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
