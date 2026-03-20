/**
 * Firebase Cloud Functions — Trenink app
 *
 * Functions:
 *   createCheckoutSession  — Callable: creates Stripe Checkout session, returns URL
 *   createPortalSession    — Callable: creates Stripe Customer Portal session, returns URL
 *   stripeWebhook          — HTTP: processes Stripe webhook events
 *   onNewRegistration      — RTDB trigger: email notification on new tournament registration
 *   rosterReminder         — Scheduled: daily check for missing rosters (3 days before tournament)
 */

export { createCheckoutSession, createPortalSession } from './stripe';
export { stripeWebhook } from './webhook';
export { onNewRegistration, rosterReminder } from './notifications';
