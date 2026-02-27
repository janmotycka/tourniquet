/**
 * Stripe Checkout + Customer Portal Cloud Functions
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY       — Stripe secret key (sk_test_... or sk_live_...)
 *   STRIPE_PRODUCT_ID       — Stripe Product ID (prod_...)
 *   STRIPE_WEBHOOK_SECRET   — Stripe webhook signing secret (whsec_...)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Inicializace Firebase Admin (singleton)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new functions.https.HttpsError('failed-precondition', 'STRIPE_SECRET_KEY not configured');
  return new Stripe(key);
}

// ─── Helper: get price amount per currency ──────────────────────────────────

type SupportedCurrency = 'czk' | 'eur' | 'usd';

/** Amount in smallest currency unit (haléře, cents) */
function getPriceAmount(currency: SupportedCurrency): number {
  const map: Record<SupportedCurrency, number> = {
    czk: 9900,  // 99 CZK
    eur: 399,   // 3.99 EUR
    usd: 399,   // 3.99 USD
  };
  return map[currency];
}

function getProductId(): string {
  const id = process.env.STRIPE_PRODUCT_ID;
  if (!id) throw new functions.https.HttpsError('failed-precondition', 'STRIPE_PRODUCT_ID not configured');
  return id;
}

// ─── Helper: get or create Stripe customer ──────────────────────────────────

async function getOrCreateCustomer(uid: string, email: string | undefined): Promise<string> {
  const snapshot = await db.ref(`users/${uid}/subscription/stripeCustomerId`).get();
  if (snapshot.exists()) {
    return snapshot.val() as string;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { firebaseUid: uid },
  });

  await db.ref(`users/${uid}/subscription/stripeCustomerId`).set(customer.id);
  return customer.id;
}

// ─── createCheckoutSession ──────────────────────────────────────────────────

interface CheckoutData {
  returnUrl?: string;
  currency?: SupportedCurrency;
}

export const createCheckoutSession = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;
    const email = context.auth.token.email;
    const { returnUrl, currency } = (data || {}) as CheckoutData;
    const resolvedUrl = returnUrl || 'https://torq.cz';
    const resolvedCurrency: SupportedCurrency = currency || 'czk';

    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(uid, email);
    const productId = getProductId();
    const unitAmount = getPriceAmount(resolvedCurrency);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: resolvedCurrency,
            product: productId,
            unit_amount: unitAmount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      success_url: `${resolvedUrl}?payment=success`,
      cancel_url: `${resolvedUrl}?payment=cancelled`,
      metadata: {
        firebaseUid: uid,
      },
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          firebaseUid: uid,
        },
      },
    });

    return { url: session.url };
  });

// ─── createPortalSession ────────────────────────────────────────────────────

export const createPortalSession = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;
    const email = context.auth.token.email;
    const returnUrl = (data as { returnUrl?: string })?.returnUrl || 'https://torq.cz';

    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(uid, email);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  });
