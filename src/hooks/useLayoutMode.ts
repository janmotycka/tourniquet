import { useCallback } from 'react';

// ─── Layout mode hook ───────────────────────────────────────────────────────
// DESKTOP FREEZE (2026-04): desktop layout byl zmražen — aplikace vždy
// vrací mobile mode bez ohledu na šířku viewportu nebo localStorage preferenci.
//
// Proč: mobile-first build je responzivní a funguje dobře i na desktopu,
// zatímco desktop-specific komponenty (DesktopShell, 2-col dashboardy, sidebar
// nav) přidávaly údržbovou zátěž bez jasného uživatelského benefitu v této
// fázi projektu. Dead desktop kód ponechán v repozitáři — pro rehydrataci
// desktop režimu stačí vrátit původní implementaci tohoto hooku z git historie
// (commit předcházející desktop freezu).
//
// API kontrakt je zachován: `mode`, `preference`, `setPreference`, `isDesktop`,
// `isMobile` — call sites nemusí měnit nic.

export type LayoutModePreference = 'auto' | 'mobile' | 'desktop';
export type LayoutMode = 'mobile' | 'desktop';

export function useLayoutMode() {
  // setPreference je no-op — preferenci stejně ignorujeme.
  const setPreference = useCallback((_pref: LayoutModePreference) => {
    /* frozen: desktop mode disabled */
    void _pref;
  }, []);

  return {
    mode: 'mobile' as LayoutMode,
    preference: 'mobile' as LayoutModePreference,
    setPreference,
    isDesktop: false,
    isMobile: true,
  };
}
