// ─── Subscription module types ────────────────────────────────────────────────

export type SubscriptionStatus = 'free' | 'active' | 'past_due' | 'cancelled';

export interface Subscription {
  status: SubscriptionStatus;
  plan: 'free' | 'premium';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;    // ISO timestamp
  cancelAtPeriodEnd?: boolean;
}

// ─── Limity ───────────────────────────────────────────────────────────────────

export interface FeatureLimits {
  maxTournaments: number;
  maxSavedTrainings: number;
  maxMatches: number;
}

// Audit 2026-04-24: Zvýšeno z 1/3/3 na 1/5/10.
// Důvod: 3 zápasy je fatálně malé — user narazí na paywall ještě než
// zažije aha-moment (sezónní statistiky, 4+ zápas McDonald's Cupu). Všechny
// tři persony auditu (Honza laik, Petr trenér, analyst) se shodly, že
// current limit zabíjí akvizici. Pro Simple mód je limit úplně vypnutý
// (viz useSubscriptionLimits) — Simple user nemá z čeho řešit quota frustraci.
export const FREE_LIMITS: FeatureLimits = {
  maxTournaments: 1,
  maxSavedTrainings: 5,
  maxMatches: 10,
};

export const PREMIUM_LIMITS: FeatureLimits = {
  maxTournaments: Infinity,
  maxSavedTrainings: Infinity,
  maxMatches: Infinity,
};

// ─── Multi-currency pricing ──────────────────────────────────────────────────

export type PriceCurrency = 'czk' | 'eur' | 'usd';

export interface PriceInfo {
  amount: number;
  currency: PriceCurrency;
  interval: 'month';
  label: string;
}

export const PRICES: Record<PriceCurrency, PriceInfo> = {
  czk: { amount: 99, currency: 'czk', interval: 'month', label: '99 Kč/měsíc' },
  eur: { amount: 3.99, currency: 'eur', interval: 'month', label: '€3.99/month' },
  usd: { amount: 3.99, currency: 'usd', interval: 'month', label: '$3.99/month' },
};

/** @deprecated Use PRICES[currency] instead */
export const SUBSCRIPTION_PRICE = PRICES.czk;

// ─── Firebase DB path ─────────────────────────────────────────────────────────
// /users/{uid}/subscription → Subscription
