/**
 * Stripe Webhook handler
 *
 * Zpracovava eventy:
 *   - checkout.session.completed     → aktivace predplatneho
 *   - customer.subscription.updated  → zmena stavu (past_due, cancelled)
 *   - customer.subscription.deleted  → zruseni predplatneho
 *   - invoice.payment_succeeded       → uspesna platba (obnoveni)
 *   - invoice.payment_failed         → neuspesna platba
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY      — Stripe secret key
 *   STRIPE_WEBHOOK_SECRET  — Webhook signing secret (whsec_...)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key);
}

// ─── Helper: update subscription v DB ───────────────────────────────────────

interface SubscriptionData {
  status: 'free' | 'active' | 'past_due' | 'cancelled';
  plan: 'free' | 'premium';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

async function updateSubscriptionInDb(uid: string, data: SubscriptionData): Promise<void> {
  await db.ref(`users/${uid}/subscription`).update(data);
}

async function findUidByCustomerId(customerId: string): Promise<string | null> {
  // Hledej v /users/ kde subscription.stripeCustomerId === customerId
  const snapshot = await db.ref('users').orderByChild('subscription/stripeCustomerId').equalTo(customerId).limitToFirst(1).get();
  if (!snapshot.exists()) return null;
  const keys = Object.keys(snapshot.val());
  return keys[0] || null;
}

function mapStripeStatus(stripeStatus: string): 'active' | 'past_due' | 'cancelled' | 'free' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      return 'free';
  }
}

// ─── Webhook handler ────────────────────────────────────────────────────────

export const stripeWebhook = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    // Verifikace podpisu — POVINNÁ v produkci
    if (webhookSecret) {
      const signature = req.headers['stripe-signature'] as string;
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
      } catch (err) {
        console.error('[Webhook] Signature verification failed:', err);
        res.status(400).send('Webhook signature verification failed');
        return;
      }
    } else if (process.env.FUNCTIONS_EMULATOR === 'true') {
      // Pouze Firebase emulator (lokální vývoj) — nikdy v produkci
      console.warn('[Webhook] Signature verification skipped — emulator only');
      event = req.body as Stripe.Event;
    } else {
      // Produkce bez secretu = odmítnout
      console.error('[Webhook] STRIPE_WEBHOOK_SECRET is not configured. Set it via: firebase functions:secrets:set STRIPE_WEBHOOK_SECRET');
      res.status(500).send('Webhook secret not configured');
      return;
    }

    try {
      switch (event.type) {
        // ─── Checkout dokoncen ────────────────────────────────────────
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = session.metadata?.firebaseUid;

          if (uid && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            await updateSubscriptionInDb(uid, {
              status: 'active',
              plan: 'premium',
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: subscription.id,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });
          }
          break;
        }

        // ─── Subscription update ──────────────────────────────────────
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const uid = subscription.metadata?.firebaseUid
            || await findUidByCustomerId(subscription.customer as string);

          if (uid) {
            const status = mapStripeStatus(subscription.status);
            await updateSubscriptionInDb(uid, {
              status,
              plan: status === 'active' || status === 'past_due' ? 'premium' : 'free',
              stripeSubscriptionId: subscription.id,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });
          }
          break;
        }

        // ─── Subscription smazana ─────────────────────────────────────
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const uid = subscription.metadata?.firebaseUid
            || await findUidByCustomerId(subscription.customer as string);

          if (uid) {
            await updateSubscriptionInDb(uid, {
              status: 'cancelled',
              plan: 'free',
              stripeSubscriptionId: subscription.id,
              cancelAtPeriodEnd: false,
            });
          }
          break;
        }

        // ─── Faktura zaplacena ────────────────────────────────────────
        case 'invoice.paid':
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            const uid = subscription.metadata?.firebaseUid
              || await findUidByCustomerId(invoice.customer as string);

            if (uid) {
              await updateSubscriptionInDb(uid, {
                status: 'active',
                plan: 'premium',
                stripeSubscriptionId: subscription.id,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
              });
            }
          }
          break;
        }

        // ─── Platba selhala ───────────────────────────────────────────
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            const uid = subscription.metadata?.firebaseUid
              || await findUidByCustomerId(invoice.customer as string);

            if (uid) {
              await updateSubscriptionInDb(uid, {
                status: 'past_due',
                plan: 'premium',
                stripeSubscriptionId: subscription.id,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
              });
            }
          }
          break;
        }

        default:
          console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error('[Webhook] Error processing event:', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
