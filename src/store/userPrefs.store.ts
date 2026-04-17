/**
 * UserPrefsStore — per-user klientské preference, které nejsou kritické pro sync.
 *
 * Uchovává:
 * - `preferredSport` — primární sport trenéra ('football' | 'tennis')
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

/**
 * Typ tenisového uživatele:
 * - 'club' — klubový trenér (oddíl, roster, ČTenis družstva)
 * - 'individual' — individuální trenér nebo rodič (moji hráči napříč kluby)
 *
 * Ptáme se jen pro tennis sport; fotbal má implicitně 'club'.
 * null = dotaz ještě neproběhl (ukážeme picker).
 */
export type TennisUserType = 'club' | 'individual';

interface UserPrefsState {
  /** Výchozí sport pro přihlášeného trenéra. Default 'football'. */
  preferredSport: Sport;
  /** Zobrazit onboarding sport picker? Default true, po prvním výběru false. */
  sportOnboardingShown: boolean;
  /** Tenisový sub-mód. null = ještě nevybráno (ukáže se picker). */
  tennisUserType: TennisUserType | null;

  setPreferredSport: (sport: Sport) => void;
  markSportOnboardingShown: () => void;
  setTennisUserType: (type: TennisUserType) => void;
  /** Reset pro testy / pokud user se chce znovu dostat k sport pickeru. */
  reset: () => void;
}

export const useUserPrefsStore = create<UserPrefsState>()(
  persist(
    (set) => ({
      preferredSport: 'football',
      sportOnboardingShown: false,
      tennisUserType: null,

      setPreferredSport: (sport) => set({ preferredSport: sport, sportOnboardingShown: true }),
      markSportOnboardingShown: () => set({ sportOnboardingShown: true }),
      setTennisUserType: (type) => set({ tennisUserType: type }),
      reset: () => set({ preferredSport: 'football', sportOnboardingShown: false, tennisUserType: null }),
    }),
    {
      name: 'torq-user-prefs',
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
