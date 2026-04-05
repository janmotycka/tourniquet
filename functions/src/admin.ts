/**
 * Admin Cloud Functions
 *
 * Only the designated admin UID can call these functions.
 * Used to manage user subscriptions (grant/revoke premium).
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

// Admin UID — Jan Motyčka (honza.motyka@gmail.com)
const ADMIN_UID = 'EmIOqHuZVaWVbWN0imh6D1cttAf1';

/**
 * Set subscription status for a user.
 * Only callable by the admin UID.
 */
export const adminSetSubscription = functions.region('europe-west1').https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth || context.auth.uid !== ADMIN_UID) {
    throw new functions.https.HttpsError('permission-denied', 'Only admin can manage subscriptions');
  }

  const { targetUid, status, plan } = data;

  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid is required');
  }

  const validStatuses = ['free', 'active', 'past_due', 'cancelled'];
  const validPlans = ['free', 'premium'];

  if (!validStatuses.includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', `Invalid status: ${status}`);
  }
  if (!validPlans.includes(plan)) {
    throw new functions.https.HttpsError('invalid-argument', `Invalid plan: ${plan}`);
  }

  await db.ref(`users/${targetUid}/subscription`).set({
    status,
    plan,
  });

  return { success: true, targetUid, status, plan };
});

/**
 * List all users with basic info (for admin panel).
 * Only callable by the admin UID.
 */
export const adminListUsers = functions.region('europe-west1').https.onCall(async (_data, context) => {
  if (!context.auth || context.auth.uid !== ADMIN_UID) {
    throw new functions.https.HttpsError('permission-denied', 'Only admin can list users');
  }

  // Get all users from Firebase Auth
  const listResult = await admin.auth().listUsers(100);

  // Get subscription data for all users
  const subscriptionsSnap = await db.ref('users').once('value');
  const subscriptions = subscriptionsSnap.val() || {};

  const users = listResult.users.map(user => ({
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    lastSignIn: user.metadata.lastSignInTime || null,
    subscription: subscriptions[user.uid]?.subscription || { status: 'free', plan: 'free' },
  }));

  // Sort: admin first, then by last sign in
  users.sort((a, b) => {
    if (a.uid === ADMIN_UID) return -1;
    if (b.uid === ADMIN_UID) return 1;
    return (b.lastSignIn || '').localeCompare(a.lastSignIn || '');
  });

  return { users };
});
