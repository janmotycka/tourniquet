/**
 * Safe localStorage wrapper for Zustand persist middleware.
 * Handles QuotaExceededError gracefully with console warning + lazy toast.
 */
import type { StateStorage } from 'zustand/middleware';

let quotaWarningShown = false;

function showQuotaWarning() {
  if (quotaWarningShown) return;
  quotaWarningShown = true;
  console.warn('[SafeStorage] Local storage quota exceeded');
  // Lazy import to avoid circular dependency (toast store also uses persist)
  setTimeout(async () => {
    try {
      const mod = await import('../store/toast.store');
      mod.useToastStore.getState().show('warning', 'Místní úložiště je plné. Některá data nemusí být uložena.', 8000);
    } catch { /* toast store not ready yet */ }
    // Reset after 30s so warning can show again if needed
    setTimeout(() => { quotaWarningShown = false; }, 30000);
  }, 100);
}

export const safeStorage: StateStorage = {
  getItem(name: string): string | null {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },

  setItem(name: string, value: string): void {
    try {
      localStorage.setItem(name, value);
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
        showQuotaWarning();
      }
    }
  },

  removeItem(name: string): void {
    try {
      localStorage.removeItem(name);
    } catch {
      // silent
    }
  },
};
