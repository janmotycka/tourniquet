/** Centralized z-index layering system */
export const Z = {
  /** Bottom sheets, score modals, goal modals */
  sheet: 100,
  /** Player detail sheets, contact sheets (above score modals) */
  detail: 200,
  /** Full-screen overlays like join modal, saved page delete */
  overlay: 1000,
  /** Cookie consent, onboarding */
  banner: 5000,
  /** Connection status bar */
  status: 9000,
  /** Toast notifications */
  toast: 9500,
  /** Confirmation modal (always on top) */
  confirm: 10000,
} as const;
