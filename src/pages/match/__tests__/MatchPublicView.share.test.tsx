/**
 * Share tlačítko na public match view (audit 2026-07-09: rodič→rodič viral
 * hrana byla slepá — view nemělo share). Testuje clipboard fallback cestu
 * (jsdom nemá navigator.share) + analytics event + /m/ OG formát URL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../firebase', () => ({
  db: {}, auth: {}, functions: {}, app: {}, googleProvider: {}, firebaseConnected: false,
}));

const trackMock = vi.fn();
vi.mock('../../../services/analytics', () => ({
  track: (...args: unknown[]) => trackMock(...args),
  sanitizeEventKey: (s: string) => s,
}));

// Fake public match doručený subscription callbackem
const fakeMatch = {
  id: 'm1',
  sport: 'football',
  clubName: 'FC Test',
  opponent: 'SK Rival',
  isHome: true,
  date: '2026-07-09',
  kickoffTime: '15:00',
  status: 'live',
  homeScore: 2,
  awayScore: 1,
  goals: [], cards: [], substitutions: [], lineup: [],
  periods: 2, periodDurationMinutes: 30, durationMinutes: 60,
};

vi.mock('../../../services/match.firebase', () => ({
  subscribeToPublicMatch: (_id: string, cb: (m: unknown) => void) => {
    cb(fakeMatch);
    return () => {};
  },
}));

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'cs' }),
}));

vi.mock('../../../hooks/useLayoutMode', () => ({
  useLayoutMode: () => ({ isDesktop: false }),
}));

import { MatchPublicView } from '../MatchPublicView';

describe('MatchPublicView share', () => {
  beforeEach(() => {
    trackMock.mockReset();
    // jsdom nemá clipboard — nainstalovat mock (navigator.share zůstává undefined
    // → komponenta musí spadnout do clipboard fallbacku)
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders an always-visible share button', () => {
    render(<MatchPublicView matchId="m1" />);
    expect(screen.getByRole('button', { name: 'matchPublic.share' })).toBeTruthy();
  });

  it('falls back to clipboard with /m/{id} OG URL and tracks the share', async () => {
    render(<MatchPublicView matchId="m1" />);
    fireEvent.click(screen.getByRole('button', { name: 'matchPublic.share' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/m/m1`,
      );
    });
    expect(trackMock).toHaveBeenCalledWith('public_match_share');
    // Vizuální potvrzení kopie
    expect(await screen.findByText('matchPublic.shareCopied')).toBeTruthy();
  });
});
