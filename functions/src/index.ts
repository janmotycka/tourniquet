/**
 * Firebase Cloud Functions — Stripe integration for Trenink app
 *
 * Functions:
 *   createCheckoutSession  — Callable: creates Stripe Checkout session, returns URL
 *   createPortalSession    — Callable: creates Stripe Customer Portal session, returns URL
 *   stripeWebhook          — HTTP: processes Stripe webhook events
 */

export { createCheckoutSession, createPortalSession } from './stripe';
export { stripeWebhook } from './webhook';
