/**
 * Store pro navigační stav aplikace.
 * Extrahováno z AppRouter, aby bylo přístupné i pro OnboardingModal.
 */

import { create } from 'zustand';
import type { Page } from '../App';
import { parseTournamentHashFromUrl, parseRosterHashFromUrl } from '../utils/qr-code';

function getInitialPage(): Page {
  // Roster form link (#roster={tournamentId}&k={token})
  const roster = parseRosterHashFromUrl();
  if (roster) return { name: 'roster-form', tournamentId: roster.tournamentId, teamToken: roster.teamToken };
  // Public view link (#tournament={id})
  const tournamentId = parseTournamentHashFromUrl();
  if (tournamentId) return { name: 'tournament-public', tournamentId };
  return { name: 'home' };
}

interface PageState {
  page: Page;
  setPage: (p: Page) => void;

  joinIntent: { tournamentId: string } | null;
  setJoinIntent: (intent: { tournamentId: string } | null) => void;

  adminJoin: boolean;
  setAdminJoin: (v: boolean) => void;
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
}));
