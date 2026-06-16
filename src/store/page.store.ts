/**
 * Store pro navigační stav aplikace.
 * Extrahováno z AppRouter, aby bylo přístupné i pro OnboardingModal.
 */

import { create } from 'zustand';
import type { Page } from '../App';
import { parseTournamentHashFromUrl, parseRosterHashFromUrl, parseRegistrationHashFromUrl, parseMatchHashFromUrl, parseMatchPairingHashFromUrl } from '../utils/qr-code';

function getInitialPage(): Page {
  // Path-based share linky /m/{id} a /t/{id} (audit 2026-06-10, OG tagy).
  // Normálně je obslouží Hosting rewrite → publicPreview funkce (OG + redirect
  // na hash routu), ale nainstalovaná PWA se service workerem může navigaci
  // odbavit lokálně cached index.html — pak path doparsujeme tady (belt &
  // suspenders) a URL normalizujeme na hash formu, se kterou počítá navigate().
  try {
    const pathShare = window.location.pathname.match(/^\/(m|t)\/([a-zA-Z0-9_-]{1,64})\/?$/);
    if (pathShare) {
      const [, kind, id] = pathShare;
      const hash = kind === 'm' ? `#match=${id}` : `#tournament=${id}`;
      history.replaceState(null, '', '/' + window.location.search + hash);
      return kind === 'm'
        ? { name: 'match-public', matchId: id }
        : { name: 'tournament-public', tournamentId: id };
    }
  } catch { /* SSR / exotická prostředí — pokračuj hash parsováním */ }

  // Roster form link (#roster={tournamentId}&k={token})
  const roster = parseRosterHashFromUrl();
  if (roster) return { name: 'roster-form', tournamentId: roster.tournamentId, teamToken: roster.teamToken };
  // Registration form link (#register={tournamentId})
  const registration = parseRegistrationHashFromUrl();
  if (registration) return { name: 'registration-form', tournamentId: registration.tournamentId };
  // Public view link (#tournament={id})
  const tournamentId = parseTournamentHashFromUrl();
  if (tournamentId) return { name: 'tournament-public', tournamentId };
  // Public match view (#match={id})
  const matchId = parseMatchHashFromUrl();
  if (matchId) return { name: 'match-public', matchId };
  return { name: 'home' };
}

interface PageState {
  page: Page;
  /**
   * Naviguje na stránku. `opts.replace` přepíše aktuální history entry místo
   * pushnutí nové — používat pro tranzientní redirecty (login→home po
   * přihlášení), aby back neuvázl ve smyčce na stránce, která se hned přesměruje.
   */
  setPage: (p: Page, opts?: { replace?: boolean }) => void;

  joinIntent: { tournamentId: string; role?: 'admin' } | null;
  setJoinIntent: (intent: { tournamentId: string; role?: 'admin' } | null) => void;

  adminJoin: boolean;
  setAdminJoin: (v: boolean) => void;

  adminJoinRole: 'admin' | undefined;
  setAdminJoinRole: (v: 'admin' | undefined) => void;

  /** Pending invite for sdílený klub (z URL ?join=club&id=...) */
  clubJoinIntent: { inviteId: string } | null;
  setClubJoinIntent: (intent: { inviteId: string } | null) => void;

  /** Pending cross-team pairing invite (z URL #pair-match=SCOPE:ID:TOKEN) */
  matchPairingIntent: { scopeId: string; matchId: string; joinToken: string } | null;
  setMatchPairingIntent: (intent: { scopeId: string; matchId: string; joinToken: string } | null) => void;
}

function getInitialClubJoinIntent(): { inviteId: string } | null {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('join') === 'club') {
      const id = params.get('id');
      if (id) return { inviteId: id };
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Browser history integration (audit 2026-06-11, flow P1) ─────────────────
// Hardware back na Androidu zavíral celou PWA — custom router (page union)
// dosud nereagoval na popstate. Řešení: každá změna stránky přes setPage zapíše
// jednu history entry (s torqNav indexem); popstate obnoví stránku ze zásobníku,
// nebo (u entry bez torqNav — legacy/externí) re-parsuje URL, takže page nikdy
// nedesynchronizuje s adresou. Fallback je graceful: chybějící state = browser
// default (back z home = exit), žádný crash.
let navStack: Page[] = [];
let navIndex = -1;
let popInProgress = false;

function pageToUrl(p: Page): string {
  const { pathname, search } = window.location;
  const clean = pathname + search;
  // Public views si drží hash kvůli shareability + deep-link bootu (getInitialPage).
  if (p.name === 'tournament-public') return `${clean}#tournament=${p.tournamentId}`;
  if (p.name === 'match-public') return `${clean}#match=${p.matchId}`;
  return clean; // ostatní stránky → čistá URL (strhne starý hash)
}

/**
 * replaceState, který ZACHOVÁ aktuální history.state (torqNav). Používat všude,
 * kde se jen čistí query param z URL — `replaceState(null, …)` by jinak vymazal
 * navigační index a popstate by pak desynchronizoval.
 */
export function replaceUrlPreserveState(url: string): void {
  try { history.replaceState(history.state, '', url); } catch { /* noop */ }
}

export const usePageStore = create<PageState>(() => ({
  page: getInitialPage(),
  setPage: (p, opts) => {
    const prev = usePageStore.getState().page;
    usePageStore.setState({ page: p });
    if (popInProgress) return;                       // obnova z back/forward — nepushovat
    if (prev && JSON.stringify(prev) === JSON.stringify(p)) return; // no-op navigace
    if (opts?.replace && navIndex >= 0) {
      // Nahrazení aktuální entry — žádná nová history pozice. Pro tranzientní
      // redirecty (login→home), aby na ně back neuvázl ve smyčce (audit
      // 2026-06-11, lensy desync/loops-dupes).
      navStack[navIndex] = p;
      try { history.replaceState({ torqNav: navIndex }, '', pageToUrl(p)); } catch { /* noop */ }
      return;
    }
    navStack = navStack.slice(0, navIndex + 1);      // useknout forward stack
    navStack.push(p);
    navIndex = navStack.length - 1;
    try { history.pushState({ torqNav: navIndex }, '', pageToUrl(p)); } catch { /* noop */ }
  },

  joinIntent: null,
  setJoinIntent: (intent) => usePageStore.setState({ joinIntent: intent }),

  adminJoin: (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join') === '1';
  })(),
  setAdminJoin: (v) => usePageStore.setState({ adminJoin: v }),

  adminJoinRole: (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('role') === 'admin' ? 'admin' as const : undefined;
  })(),
  setAdminJoinRole: (v) => usePageStore.setState({ adminJoinRole: v }),

  clubJoinIntent: getInitialClubJoinIntent(),
  setClubJoinIntent: (intent) => usePageStore.setState({ clubJoinIntent: intent }),

  matchPairingIntent: parseMatchPairingHashFromUrl(),
  setMatchPairingIntent: (intent) => usePageStore.setState({ matchPairingIntent: intent }),
}));

// ─── History router init (audit 2026-06-11) ──────────────────────────────────
// Seed zásobníku počáteční stránkou + registrace popstate listeneru. Běží 1×
// při načtení modulu (store je singleton), po getInitialPage() — takže případnou
// normalizaci hashe (/m/, /t/) už máme v URL a zachováme ji.
(function initHistoryRouter() {
  if (typeof window === 'undefined') return; // SSR guard
  navStack = [usePageStore.getState().page];
  navIndex = 0;
  try {
    history.replaceState({ torqNav: 0 }, '', window.location.pathname + window.location.search + window.location.hash);
  } catch { /* noop */ }
  window.addEventListener('popstate', (e) => {
    const st = e.state as { torqNav?: number } | null;
    let target: Page;
    if (st && typeof st.torqNav === 'number' && navStack[st.torqNav]) {
      navIndex = st.torqNav;
      target = navStack[st.torqNav];
    } else {
      // Entry bez torqNav (externí/legacy) — re-parsuj z URL, ať page nedesynchronizuje.
      target = getInitialPage();
    }
    popInProgress = true;
    // Hardware back vždy shodí otevřený join-modal — modaly (clubJoinIntent,
    // matchPairingIntent) nejsou v page union a renderují se jako overlay mimo
    // stránku, takže by jinak visely přes změněnou stránku a back by vypadal
    // jako zaseknutý (audit 2026-06-11, lens modal-intent).
    const cur = usePageStore.getState();
    const patch: Partial<PageState> = { page: target };
    if (cur.clubJoinIntent) patch.clubJoinIntent = null;
    if (cur.matchPairingIntent) patch.matchPairingIntent = null;
    usePageStore.setState(patch);
    popInProgress = false;
    try { window.scrollTo(0, 0); } catch { /* noop */ }
  });
})();
