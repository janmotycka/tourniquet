/**
 * UserPrefsStore — per-user klientské preference, které nejsou kritické pro sync.
 *
 * Uchovává:
 * - `preferredSport` — primární sport trenéra (dnes jen 'football')
 *   Určuje jaká sada modulů/UI se na Home a v menu ukáže.
 *   Lze kdykoliv přepnout v Settings.
 *
 * Persist: localStorage (per device). Není potřeba sdílet mezi zařízeními —
 * trenér si nastavuje podle toho co na daném zařízení dělá.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import type { Sport } from '../types/sport.types';

interface UserPrefsState {
  /** Výchozí sport pro přihlášeného trenéra. Default 'football'. */
  preferredSport: Sport;
  /** Zobrazit onboarding sport picker? Default true, po prvním výběru false. */
  sportOnboardingShown: boolean;

  setPreferredSport: (sport: Sport) => void;
  markSportOnboardingShown: () => void;
  /** Reset pro testy / pokud user se chce znovu dostat k sport pickeru. */
  reset: () => void;
}

export const useUserPrefsStore = create<UserPrefsState>()(
  persist(
    (set) => ({
      preferredSport: 'football',
      sportOnboardingShown: false,

      setPreferredSport: (sport) => set({ preferredSport: sport, sportOnboardingShown: true }),
      markSportOnboardingShown: () => set({ sportOnboardingShown: true }),
      reset: () => set({ preferredSport: 'football', sportOnboardingShown: false }),
    }),
    {
      name: 'torq-user-prefs',
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
