import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
        onValue(subscriptionRef, handler);

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
        const { status } = get().subscription;
        return status === 'active' || status === 'past_due';
      },

      getLimits: () => {
        return get().isPremium() ? PREMIUM_LIMITS : FREE_LIMITS;
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
    }
  )
);
