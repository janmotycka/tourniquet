import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import { ref, onValue, off } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type {
  Subscription,
  SubscriptionStatus,
  FeatureLimits,
} from '../types/subscription.types';
import { FREE_LIMITS, PREMIUM_LIMITS } from '../types/subscription.types';
import type { PriceCurrency } from '../types/subscription.types';
import { useUserPrefsStore } from './userPrefs.store';
import { logger } from '../utils/logger';

// ─── State interface ──────────────────────────────────────────────────────────

interface SubscriptionState {
  subscription: Subscription;
  loading: boolean;

  // Listener
  subscribeToStatus: (uid: string) => () => void;

  // Stripe akce
  createCheckoutSession: (currency?: PriceCurrency) => Promise<string | null>;
  openCustomerPortal: () => Promise<string | null>;

  // Computed helpers
  isPremium: () => boolean;
  getLimits: () => FeatureLimits;
  getStatus: () => SubscriptionStatus;

  // Reset
  reset: () => void;
}

const DEFAULT_SUBSCRIPTION: Subscription = {
  status: 'free',
  plan: 'free',
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      subscription: { ...DEFAULT_SUBSCRIPTION },
      loading: false,

      // ── Real-time listener na /users/{uid}/subscription ─────────────────
      subscribeToStatus: (uid: string) => {
        const subscriptionRef = ref(db, `users/${uid}/subscription`);

        const handler = (snapshot: import('firebase/database').DataSnapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val() as Partial<Subscription>;
            set({
              subscription: {
                status: data.status ?? 'free',
                plan: data.plan ?? 'free',
                stripeCustomerId: data.stripeCustomerId,
                stripeSubscriptionId: data.stripeSubscriptionId,
                currentPeriodEnd: data.currentPeriodEnd,
                cancelAtPeriodEnd: data.cancelAtPeriodEnd,
              },
              loading: false,
            });
          } else {
            set({ subscription: { ...DEFAULT_SUBSCRIPTION }, loading: false });
          }
        };

        set({ loading: true });
        onValue(subscriptionRef, handler, () => {
          set({ subscription: { ...DEFAULT_SUBSCRIPTION }, loading: false });
        });

        // Vrátí cleanup funkci
        return () => off(subscriptionRef, 'value', handler);
      },

      // ── Stripe Checkout ─────────────────────────────────────────────────
      createCheckoutSession: async (currency?: PriceCurrency) => {
        try {
          const createSession = httpsCallable<
            { returnUrl: string; currency?: string },
            { url: string }
          >(functions, 'createCheckoutSession');

          const result = await createSession({
            returnUrl: window.location.origin + '?payment=success',
            currency: currency || 'czk',
          });

          return result.data.url;
        } catch (err) {
          logger.error('[Stripe] createCheckoutSession error:', err);
          return null;
        }
      },

      // ── Stripe Customer Portal ──────────────────────────────────────────
      openCustomerPortal: async () => {
        try {
          const createPortal = httpsCallable<
            { returnUrl: string },
            { url: string }
          >(functions, 'createPortalSession');

          const result = await createPortal({
            returnUrl: window.location.origin,
          });

          return result.data.url;
        } catch (err) {
          logger.error('[Stripe] createPortalSession error:', err);
          return null;
        }
      },

      // ── Computed ────────────────────────────────────────────────────────
      isPremium: () => {
        // DEV override — jen pokud explicitně opt-in přes VITE_DEV_PREMIUM=1.
        // Drží dev prostředí free-plan by default, takže se quota/paywall flows
        // dají testovat bez přepínání kódu. Audit 2026-04-24 našel, že dříve to
        // bylo `if (DEV) return true` — to byl bezpečnostní problém, pokud by
        // build nezamaskoval import.meta.env.DEV správně.
        if (import.meta.env.DEV && import.meta.env.VITE_DEV_PREMIUM === '1') {
          return true;
        }
        const { status } = get().subscription;
        return status === 'active' || status === 'past_due';
      },

      getLimits: () => {
        // Audit 2026-04-24: Simple mode user (laik, McDonald's Cup scénář)
        // nemá z čeho řešit quota — pro něj je kvóta skrytá (unlimited).
        // Monetizuje se skrze brand removal, cloud backup a premium share.
        // Pro Advanced je free plán 1 turnaj / 5 tréninků / 10 zápasů (viz
        // FREE_LIMITS v subscription.types.ts).
        if (get().isPremium()) return PREMIUM_LIMITS;
        const appMode = useUserPrefsStore.getState().appMode;
        if (appMode === 'simple') return PREMIUM_LIMITS;
        return FREE_LIMITS;
      },

      getStatus: () => {
        return get().subscription.status;
      },

      // ── Reset ───────────────────────────────────────────────────────────
      reset: () => {
        set({ subscription: { ...DEFAULT_SUBSCRIPTION }, loading: false });
      },
    }),
    {
      name: 'trenink-subscription',
      storage: createJSONStorage(() => safeStorage),
    }
  )
);
