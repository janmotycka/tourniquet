/**
 * useUnsavedFormGuard — varuje uživatele před opuštěním stránky s rozdělaným
 * formulářem (close tab, refresh, back button na browser level).
 *
 * Audit 2026-04-29 (P1.6): Před release přidat ochranu rozdělaných formulářů
 * — pokud user vyplní zápas/klub/turnaj a klikne zpět, zobrazí se confirm.
 *
 * Použití:
 *   useUnsavedFormGuard(isDirty);  // zapne window beforeunload listener
 *
 * Pozor: tohle chrání jen před BROWSER-level navigací (close tab, refresh,
 * back via browser). In-app navigace (navigate({ name: 'home' })) tím
 * nezachycujeme — pro tu by bylo potřeba custom router hook.
 */
import { useEffect } from 'react';

export function useUnsavedFormGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Standard pattern — preventDefault + setting returnValue triggers
      // browser native confirm dialog ("Změny nebyly uloženy. Opravdu odejít?")
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
