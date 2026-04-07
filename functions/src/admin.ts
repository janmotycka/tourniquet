/**
 * Admin Cloud Functions
 *
 * Only the designated admin UID can call these functions.
 * Used to manage user subscriptions, flag suspicious users, sync clubs catalog,
 * and gather system statistics.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ADMIN_UID } from './constants';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

const requireAdmin = (context: functions.https.CallableContext) => {
  if (!context.auth || context.auth.uid !== ADMIN_UID) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
};

const audit = async (
  actorUid: string,
  action: string,
  targetUid: string | null,
  details: Record<string, unknown> = {}
) => {
  const id = db.ref('adminAuditLog').push().key!;
  await db.ref(`adminAuditLog/${id}`).set({
    actorUid,
    action,
    targetUid,
    details,
    at: new Date().toISOString(),
  });
};

// ─── Subscriptions ──────────────────────────────────────────────────────────

/**
 * Set subscription status for a user.
 * Only callable by the admin UID.
 */
export const adminSetSubscription = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);

  const { targetUid, status, plan, periodDays } = data;

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

  const payload: Record<string, unknown> = { status, plan };

  // Optional: manual premium grant for N days
  if (typeof periodDays === 'number' && periodDays > 0 && status === 'active') {
    payload.currentPeriodEnd = new Date(Date.now() + periodDays * 86400_000).toISOString();
    payload.manualGrant = true;
  }

  await db.ref(`users/${targetUid}/subscription`).set(payload);
  await audit(context.auth!.uid, 'setSubscription', targetUid, { status, plan, periodDays });

  return { success: true, targetUid, status, plan };
});

// ─── Users + suspicious activity detection ──────────────────────────────────

interface UserActivity {
  tournamentCount: number;
  matchCount: number;
  trainingCount: number;
  contactCount: number;
  clubCount: number;
  storageBytes: number;
  largestTournamentMatches: number;
  largestTournamentTeams: number;
}

interface UserFlags {
  blocked?: boolean;
  blockedAt?: string;
  blockedBy?: string;
  reason?: string;
  watch?: boolean;
}

interface UserRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string | null;
  lastSignIn: string | null;
  isAnonymous: boolean;
  subscription: { status: string; plan: string };
  activity: UserActivity;
  flags: UserFlags;
  suspicionScore: number;
  suspicionReasons: string[];
}

const FREE_TOURNAMENT_LIMIT = 1;

const computeSuspicion = (
  user: { createdAt: string | null; isAnonymous: boolean },
  activity: UserActivity,
  subscription: { status: string }
): { score: number; reasons: string[] } => {
  const reasons: string[] = [];
  let score = 0;
  const isPremium = subscription.status === 'active';

  // Free user heavily over limit
  if (!isPremium && activity.tournamentCount > FREE_TOURNAMENT_LIMIT * 5) {
    score += 30;
    reasons.push(`free_user_${activity.tournamentCount}_tournaments`);
  }
  // Massive tournament size
  if (activity.largestTournamentTeams > 64) {
    score += 25;
    reasons.push(`huge_tournament_${activity.largestTournamentTeams}_teams`);
  }
  if (activity.largestTournamentMatches > 500) {
    score += 25;
    reasons.push(`huge_tournament_${activity.largestTournamentMatches}_matches`);
  }
  // New account with lots of content (bot signature)
  if (user.createdAt) {
    const ageHours = (Date.now() - new Date(user.createdAt).getTime()) / 3_600_000;
    if (ageHours < 1 && activity.tournamentCount > 5) {
      score += 40;
      reasons.push(`new_account_${activity.tournamentCount}_tournaments_in_${ageHours.toFixed(1)}h`);
    }
  }
  // Storage abuse
  if (activity.storageBytes > 50_000_000) {
    score += 20;
    reasons.push(`storage_${(activity.storageBytes / 1_000_000).toFixed(1)}MB`);
  }
  // Anonymous user with tournaments (anonymous accounts shouldn't create)
  if (user.isAnonymous && activity.tournamentCount > 0) {
    score += 35;
    reasons.push('anonymous_creating_tournaments');
  }

  return { score, reasons };
};

const sizeOfJson = (data: unknown): number => {
  try {
    return JSON.stringify(data ?? '').length;
  } catch {
    return 0;
  }
};

/**
 * List all users with extended activity data + suspicion score.
 * Returns paginated up to 1000 users.
 */
export const adminListUsers = functions
  .region('europe-west1')
  .runWith({ memory: '512MB', timeoutSeconds: 60 })
  .https.onCall(async (_data, context) => {
    requireAdmin(context);

    // Fetch all auth users (paginate)
    const allAuthUsers: admin.auth.UserRecord[] = [];
    let pageToken: string | undefined;
    do {
      const page = await admin.auth().listUsers(1000, pageToken);
      allAuthUsers.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken);

    // Single bulk read of /users + /tournaments
    const [usersSnap, tournamentsSnap, matchesSnap, trainingsSnap, contactsSnap] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('tournaments').once('value'),
      db.ref('matches').once('value'),
      db.ref('trainings').once('value'),
      db.ref('contacts').once('value'),
    ]);

    const usersData: Record<string, Record<string, unknown>> = usersSnap.val() || {};
    const tournamentsData: Record<string, Record<string, unknown>> = tournamentsSnap.val() || {};
    const matchesData: Record<string, Record<string, unknown>> = matchesSnap.val() || {};
    const trainingsData: Record<string, Record<string, unknown>> = trainingsSnap.val() || {};
    const contactsData: Record<string, Record<string, unknown>> = contactsSnap.val() || {};

    const rows: UserRow[] = allAuthUsers.map((u) => {
      const uid = u.uid;
      const userTournaments = tournamentsData[uid] || {};
      const userMatches = matchesData[uid] || {};
      const userTrainings = trainingsData[uid] || {};
      const userContacts = contactsData[uid] || {};
      const userClubs = (usersData[uid]?.clubs as Record<string, unknown>) || {};

      let largestTournamentMatches = 0;
      let largestTournamentTeams = 0;
      for (const tid of Object.keys(userTournaments)) {
        const t = userTournaments[tid] as { matches?: unknown; teams?: unknown };
        const m = Array.isArray(t.matches) ? t.matches.length : Object.keys((t.matches as Record<string, unknown> | undefined) ?? {}).length;
        const te = Array.isArray(t.teams) ? t.teams.length : Object.keys((t.teams as Record<string, unknown> | undefined) ?? {}).length;
        if (m > largestTournamentMatches) largestTournamentMatches = m;
        if (te > largestTournamentTeams) largestTournamentTeams = te;
      }

      const storageBytes =
        sizeOfJson(userTournaments) +
        sizeOfJson(userMatches) +
        sizeOfJson(userTrainings) +
        sizeOfJson(userContacts) +
        sizeOfJson(userClubs);

      const activity: UserActivity = {
        tournamentCount: Object.keys(userTournaments).length,
        matchCount: Object.keys(userMatches).length,
        trainingCount: Object.keys(userTrainings).length,
        contactCount: Object.keys(userContacts).length,
        clubCount: Object.keys(userClubs).length,
        storageBytes,
        largestTournamentMatches,
        largestTournamentTeams,
      };

      const subscription = (usersData[uid]?.subscription as { status: string; plan: string }) || {
        status: 'free',
        plan: 'free',
      };
      const flags = (usersData[uid]?.flags as UserFlags) || {};

      const isAnonymous = u.providerData.length === 0;
      const { score, reasons } = computeSuspicion(
        { createdAt: u.metadata.creationTime || null, isAnonymous },
        activity,
        subscription
      );

      return {
        uid,
        email: u.email || null,
        displayName: u.displayName || null,
        photoURL: u.photoURL || null,
        createdAt: u.metadata.creationTime || null,
        lastSignIn: u.metadata.lastSignInTime || null,
        isAnonymous,
        subscription,
        activity,
        flags,
        suspicionScore: score,
        suspicionReasons: reasons,
      };
    });

    rows.sort((a, b) => {
      if (a.uid === ADMIN_UID) return -1;
      if (b.uid === ADMIN_UID) return 1;
      return (b.lastSignIn || '').localeCompare(a.lastSignIn || '');
    });

    return { users: rows };
  });

/**
 * Block / unblock a user (soft-block).
 * Sets /users/{uid}/flags/blocked = true. Client-side AuthContext signs them out.
 */
export const adminSetUserBlock = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);
  const { targetUid, blocked, reason } = data;
  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid required');
  }
  if (targetUid === ADMIN_UID) {
    throw new functions.https.HttpsError('failed-precondition', 'cannot block admin');
  }
  if (blocked) {
    const sanitizedReason = String(reason || 'unspecified').substring(0, 500);
    await db.ref(`users/${targetUid}/flags`).set({
      blocked: true,
      blockedAt: new Date().toISOString(),
      blockedBy: context.auth!.uid,
      reason: sanitizedReason,
    });
    // Revoke refresh tokens — forces re-auth (which our client will block)
    await admin.auth().revokeRefreshTokens(targetUid);
  } else {
    // Remove the entire flags node — leaves a clean state
    await db.ref(`users/${targetUid}/flags`).remove();
  }
  await audit(context.auth!.uid, blocked ? 'blockUser' : 'unblockUser', targetUid, { reason });
  return { success: true };
});

/**
 * Delete all tournaments belonging to a user (cleanup spam).
 */
export const adminPurgeUserTournaments = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);
  const { targetUid } = data;
  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid required');
  }
  if (targetUid === ADMIN_UID) {
    throw new functions.https.HttpsError('failed-precondition', 'cannot purge admin');
  }

  const tournamentsSnap = await db.ref(`tournaments/${targetUid}`).once('value');
  const tournaments = tournamentsSnap.val() || {};
  const tournamentIds = Object.keys(tournaments);

  await db.ref(`tournaments/${targetUid}`).remove();
  // Also clean up public mirrors created by this user
  for (const tid of tournamentIds) {
    await db.ref(`public/${tid}`).remove();
    await db.ref(`catalog/${tid}`).remove();
    await db.ref(`pin-auth/${tid}`).remove();
  }
  await audit(context.auth!.uid, 'purgeTournaments', targetUid, { count: tournamentIds.length });
  return { success: true, deleted: tournamentIds.length };
});

// ─── System statistics dashboard ────────────────────────────────────────────

export const adminGetStats = functions
  .region('europe-west1')
  .runWith({ memory: '512MB', timeoutSeconds: 60 })
  .https.onCall(async (_data, context) => {
    requireAdmin(context);

    const now = Date.now();
    const day = 86400_000;

    // Auth users (paginated)
    const allUsers: admin.auth.UserRecord[] = [];
    let pageToken: string | undefined;
    do {
      const p = await admin.auth().listUsers(1000, pageToken);
      allUsers.push(...p.users);
      pageToken = p.pageToken;
    } while (pageToken);

    const totalUsers = allUsers.length;
    let dau = 0;
    let wau = 0;
    let mau = 0;
    let anon = 0;
    let newToday = 0;
    let newThisWeek = 0;

    for (const u of allUsers) {
      const lastTs = u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).getTime() : 0;
      if (lastTs && now - lastTs < day) dau++;
      if (lastTs && now - lastTs < 7 * day) wau++;
      if (lastTs && now - lastTs < 30 * day) mau++;
      if (u.providerData.length === 0) anon++;
      const createdTs = u.metadata.creationTime ? new Date(u.metadata.creationTime).getTime() : 0;
      if (createdTs && now - createdTs < day) newToday++;
      if (createdTs && now - createdTs < 7 * day) newThisWeek++;
    }

    const [
      usersSnap,
      tournamentsSnap,
      publicSnap,
      matchesSnap,
      trainingsSnap,
      contactsSnap,
      catalogSnap,
      chatSnap,
      rostersSnap,
      registrationsSnap,
    ] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('tournaments').once('value'),
      db.ref('public').once('value'),
      db.ref('matches').once('value'),
      db.ref('trainings').once('value'),
      db.ref('contacts').once('value'),
      db.ref('clubsCatalog').once('value'),
      db.ref('chat').once('value'),
      db.ref('rosters').once('value'),
      db.ref('registrations').once('value'),
    ]);

    const usersData: Record<string, { subscription?: { status: string } }> = usersSnap.val() || {};
    const tournamentsData: Record<string, Record<string, { status?: string }>> = tournamentsSnap.val() || {};
    const publicData: Record<string, { status?: string }> = publicSnap.val() || {};

    const premium = Object.values(usersData).filter((u) => u.subscription?.status === 'active').length;

    let totalTournaments = 0;
    let activeTournaments = 0;
    let finishedTournaments = 0;
    for (const uid of Object.keys(tournamentsData)) {
      const userTs = tournamentsData[uid];
      for (const t of Object.values(userTs)) {
        totalTournaments++;
        if (t.status === 'active') activeTournaments++;
        if (t.status === 'finished') finishedTournaments++;
      }
    }

    const liveTournaments = Object.values(publicData).filter((p) => p.status === 'active').length;

    // Storage breakdown per top-level path
    const breakdown = {
      tournaments: sizeOfJson(tournamentsData),
      public: sizeOfJson(publicData),
      users: sizeOfJson(usersData),
      matches: sizeOfJson(matchesSnap.val() || {}),
      trainings: sizeOfJson(trainingsSnap.val() || {}),
      contacts: sizeOfJson(contactsSnap.val() || {}),
      catalog: sizeOfJson(catalogSnap.val() || {}),
      chat: sizeOfJson(chatSnap.val() || {}),
      rosters: sizeOfJson(rostersSnap.val() || {}),
      registrations: sizeOfJson(registrationsSnap.val() || {}),
    };
    const totalBytes = Object.values(breakdown).reduce((a, b) => a + b, 0);

    // Firebase Spark (free) plan limits — hardcoded reference values
    const SPARK_LIMITS = {
      rtdbStorageBytes: 1_073_741_824,        // 1 GB
      rtdbBandwidthMonthBytes: 10_737_418_240, // 10 GB/month (download)
      rtdbConnections: 100,                    // simultaneous
      functionsInvocationsMonth: 125_000,
      functionsGbSecondsMonth: 40_000,
      functionsOutboundMonthBytes: 5_368_709_120, // 5 GB
      authMauFree: Infinity,                   // unlimited
    };

    return {
      users: { total: totalUsers, dau, wau, mau, anon, newToday, newThisWeek, premium },
      tournaments: { total: totalTournaments, active: activeTournaments, finished: finishedTournaments, liveNow: liveTournaments },
      conversion: totalUsers > 0 ? Math.round((premium / totalUsers) * 1000) / 10 : 0,
      storageBytes: totalBytes,
      storageBreakdown: breakdown,
      sparkLimits: SPARK_LIMITS,
      // Heuristic: estimate monthly invocations = (DAU × ~30 actions) × 30 days
      // Heuristic: estimate monthly bandwidth = storage × 5 (typical read amplification)
      estimates: {
        functionsInvocationsMonth: dau * 30 * 30,
        rtdbBandwidthMonthBytes: totalBytes * 5,
      },
      generatedAt: new Date().toISOString(),
    };
  });

// ─── Clubs catalog (Wikidata sync) ──────────────────────────────────────────

interface CatalogClub {
  id: string;
  name: string;
  city?: string;
  founded?: number;
  logoUrl?: string;
  wikidataId?: string;
  source: 'wikidata' | 'manual' | 'user';
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

const SPARQL_QUERY = `
SELECT ?club ?clubLabel ?cityLabel ?inception ?logoUrl WHERE {
  ?club wdt:P31/wdt:P279* wd:Q476028 .
  ?club wdt:P17 wd:Q213 .
  OPTIONAL { ?club wdt:P159 ?city }
  OPTIONAL { ?club wdt:P571 ?inception }
  OPTIONAL { ?club wdt:P154 ?logoUrl }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en" }
}
LIMIT 1000
`.trim();

interface WikidataBinding {
  club?: { value: string };
  clubLabel?: { value: string };
  cityLabel?: { value: string };
  inception?: { value: string };
  logoUrl?: { value: string };
}

export const adminSyncClubsCatalog = functions
  .region('europe-west1')
  .runWith({ memory: '512MB', timeoutSeconds: 120 })
  .https.onCall(async (_data, context) => {
    requireAdmin(context);

    const url = `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(SPARQL_QUERY)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Tourniquet/1.0 (https://tourniquet-7a123.web.app; admin@tourniquet.app)',
        Accept: 'application/sparql-results+json',
      },
    });
    if (!res.ok) {
      throw new functions.https.HttpsError('unavailable', `Wikidata HTTP ${res.status}`);
    }
    const json = (await res.json()) as { results: { bindings: WikidataBinding[] } };

    const existingSnap = await db.ref('clubsCatalog').once('value');
    const existing: Record<string, CatalogClub> = existingSnap.val() || {};
    const existingByWikidataId = new Map<string, string>();
    for (const id of Object.keys(existing)) {
      const c = existing[id];
      if (c.wikidataId) existingByWikidataId.set(c.wikidataId, id);
    }

    let added = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const b of json.results.bindings) {
      if (!b.club || !b.clubLabel) continue;
      const wikidataId = b.club.value.split('/').pop() || '';
      if (!wikidataId) continue;
      const name = b.clubLabel.value;
      // Skip Q-IDs returned as labels (no Czech/English label)
      if (/^Q\d+$/.test(name)) continue;
      const id = existingByWikidataId.get(wikidataId) || `wd-${wikidataId}`;
      const founded = b.inception ? new Date(b.inception.value).getFullYear() : undefined;
      const club: CatalogClub = {
        id,
        name,
        city: b.cityLabel?.value,
        founded,
        logoUrl: b.logoUrl?.value,
        wikidataId,
        source: 'wikidata',
        verified: true,
        createdAt: existing[id]?.createdAt || now,
        updatedAt: now,
      };
      // Strip undefined for RTDB
      const clean = Object.fromEntries(Object.entries(club).filter(([, v]) => v !== undefined));
      await db.ref(`clubsCatalog/${id}`).set(clean);
      if (existing[id]) updated++;
      else added++;
    }

    await audit(context.auth!.uid, 'syncClubsCatalog', null, { added, updated });
    return { success: true, added, updated, total: added + updated };
  });

export const adminApproveClubSubmission = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);
  const { submissionId, approve } = data;
  if (!submissionId || typeof submissionId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'submissionId required');
  }
  const subSnap = await db.ref(`clubsCatalogPending/${submissionId}`).once('value');
  const sub = subSnap.val();
  if (!sub) throw new functions.https.HttpsError('not-found', 'submission missing');

  if (approve) {
    const id = `manual-${submissionId}`;
    const now = new Date().toISOString();
    await db.ref(`clubsCatalog/${id}`).set({
      id,
      name: sub.name,
      city: sub.city || null,
      logoUrl: sub.logoUrl || null,
      source: 'user',
      verified: true,
      createdAt: now,
      updatedAt: now,
      submittedBy: sub.submittedBy || null,
    });
  }
  await db.ref(`clubsCatalogPending/${submissionId}`).remove();
  await audit(context.auth!.uid, approve ? 'approveClub' : 'rejectClub', null, { submissionId });
  return { success: true };
});

export const adminUpdateCatalogClub = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);
  const { id, patch } = data;
  if (!id || typeof id !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'id required');
  }
  const allowed = ['name', 'city', 'logoUrl', 'founded', 'verified'];
  const clean: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of Object.keys(patch || {})) {
    if (allowed.includes(k)) clean[k] = patch[k];
  }
  await db.ref(`clubsCatalog/${id}`).update(clean);
  await audit(context.auth!.uid, 'updateCatalogClub', null, { id, keys: Object.keys(clean) });
  return { success: true };
});

export const adminDeleteCatalogClub = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);
  const { id } = data;
  if (!id || typeof id !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'id required');
  }
  await db.ref(`clubsCatalog/${id}`).remove();
  await audit(context.auth!.uid, 'deleteCatalogClub', null, { id });
  return { success: true };
});
