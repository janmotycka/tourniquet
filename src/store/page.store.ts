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
  setPage: (p: Page) => void;

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

export const usePageStore = create<PageState>(() => ({
  page: getInitialPage(),
  setPage: (p) => usePageStore.setState({ page: p }),

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
