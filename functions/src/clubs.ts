/**
 * Club Cloud Functions — Shared Club Workspaces
 *
 * Spravuje sdílené klubové workspaces:
 * - createPersonalClub: self-service vytvoření "pracovního" klubu
 * - requestOfficialClub: žádost o ověřený klub z Wikidata katalogu (admin approval)
 * - adminApproveClubRequest / adminRejectClubRequest: admin schvalování
 * - createClubInvite: owner vytvoří PIN pozvánku pro nového trenéra
 * - joinClubByInvite: trenér zadá PIN a stane se členem
 * - revokeClubInvite: zruší pending pozvánku
 * - removeClubMember / changeClubMemberRole / leaveClub
 * - adminAddClubMember / adminTransferClubOwnership / adminDeleteClub (super-admin override)
 *
 * Bezpečnost: všechny funkce používají admin SDK (bypass rules). Autorizace
 * se řeší ručně v každé funkci přes context.auth.uid a kontrolu členství.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { ADMIN_UID } from './constants';
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from './rate-limiter';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

// Free tier limit: max 3 pracovní kluby per uživatel
const FREE_MAX_PERSONAL_CLUBS = 3;

// Default TTL pro invite
const DEFAULT_INVITE_TTL_DAYS = 7;

type ClubRole = 'owner' | 'coach' | 'viewer';
type ClubOwnership = 'personal' | 'verified';

interface ClubMember {
  role: ClubRole;
  joinedAt: string;
  invitedBy?: string;
  /** Display jméno z auth (cached pro UI, refreshne se při dalším joinu) */
  displayName?: string;
}

interface SharedClub {
  id: string;
  name: string;
  color: string;
  logoBase64: string | null;
  catalogId?: string;
  ownership: ClubOwnership;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  members: Record<string, ClubMember>;
  players?: unknown;
  ageCategories?: unknown;
  defaultPlayers?: unknown;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Vyextrahuje display jméno z auth tokenu (name → email → uid prefix). */
function getDisplayName(context: functions.https.CallableContext): string {
  const token = context.auth?.token as { name?: string; email?: string } | undefined;
  if (token?.name) return String(token.name).slice(0, 80);
  if (token?.email) return String(token.email).split('@')[0].slice(0, 80);
  return context.auth?.uid?.slice(0, 6) || 'unknown';
}

function requireAuth(context: functions.https.CallableContext): string {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  return context.auth.uid;
}

function requireNonAnonymous(context: functions.https.CallableContext): string {
  const uid = requireAuth(context);
  if (context.auth?.token?.firebase?.sign_in_provider === 'anonymous') {
    throw new functions.https.HttpsError('permission-denied', 'Anonymous users cannot perform this action');
  }
  return uid;
}

function requireAdmin(context: functions.https.CallableContext) {
  if (!context.auth || context.auth.uid !== ADMIN_UID) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
}

async function getClubOrThrow(clubId: string): Promise<SharedClub> {
  const snap = await db.ref(`clubs/${clubId}`).get();
  if (!snap.exists()) {
    throw new functions.https.HttpsError('not-found', `Club ${clubId} not found`);
  }
  return snap.val() as SharedClub;
}

async function requireClubRole(
  clubId: string,
  uid: string,
  minRole: ClubRole = 'coach',
): Promise<SharedClub> {
  const club = await getClubOrThrow(clubId);
  const member = club.members?.[uid];
  if (!member) {
    throw new functions.https.HttpsError('permission-denied', 'Not a member of this club');
  }
  if (minRole === 'owner' && member.role !== 'owner') {
    throw new functions.https.HttpsError('permission-denied', 'Owner role required');
  }
  if (minRole === 'coach' && member.role === 'viewer') {
    throw new functions.https.HttpsError('permission-denied', 'Coach or owner role required');
  }
  return club;
}

async function audit(
  actorUid: string,
  action: string,
  targetId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  const id = db.ref('adminAuditLog').push().key!;
  await db.ref(`adminAuditLog/${id}`).set({
    actorUid,
    action,
    targetUid: targetId,
    details,
    at: new Date().toISOString(),
  });
}

function generatePin(): string {
  // 6-místný numerický PIN
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashPin(pin: string, salt: string): string {
  return crypto.createHash('sha256').update(pin + salt).digest('hex');
}

function sanitizeString(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

// ─── Create personal club (self-service) ───────────────────────────────────

export const createPersonalClub = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireNonAnonymous(context);

  const name = sanitizeString(data?.name, 200);
  const color = sanitizeString(data?.color, 20) || '#2E7D32';
  const logoBase64 = typeof data?.logoBase64 === 'string' ? data.logoBase64 : null;

  if (!name) {
    throw new functions.https.HttpsError('invalid-argument', 'name is required');
  }

  // Zkontroluj limit pro free tier
  const [subSnap, memberOfSnap] = await Promise.all([
    db.ref(`users/${uid}/subscription`).get(),
    db.ref(`users/${uid}/memberOfClubs`).get(),
  ]);

  const sub = subSnap.val() as { plan?: string } | null;
  const isPremium = sub?.plan === 'premium';
  const memberOf = (memberOfSnap.val() || {}) as Record<string, string>;

  // Spočítej osobní kluby, kterým je uživatel owner
  let personalOwnedCount = 0;
  for (const clubId of Object.keys(memberOf)) {
    if (memberOf[clubId] !== 'owner') continue;
    const clubSnap = await db.ref(`clubs/${clubId}`).get();
    const club = clubSnap.val() as SharedClub | null;
    if (club?.ownership === 'personal') personalOwnedCount++;
  }

  if (!isPremium && personalOwnedCount >= FREE_MAX_PERSONAL_CLUBS) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Free plan limit: max ${FREE_MAX_PERSONAL_CLUBS} personal clubs. Upgrade to premium for unlimited.`,
    );
  }

  const clubId = db.ref('clubs').push().key!;
  const now = new Date().toISOString();

  const club: SharedClub = {
    id: clubId,
    name,
    color,
    logoBase64,
    ownership: 'personal',
    createdAt: now,
    createdBy: uid,
    updatedAt: now,
    members: {
      [uid]: { role: 'owner', joinedAt: now, displayName: getDisplayName(context) },
    },
  };

  const updates: Record<string, unknown> = {
    [`clubs/${clubId}`]: club,
    [`users/${uid}/memberOfClubs/${clubId}`]: 'owner',
  };

  // Pokud uživatel nemá activeClubId, nastav nově vytvořený
  const activeSnap = await db.ref(`users/${uid}/activeClubId`).get();
  if (!activeSnap.exists()) {
    updates[`users/${uid}/activeClubId`] = clubId;
  }

  await db.ref().update(updates);

  return { success: true, clubId, club };
});

// ─── Request official (verified) club from catalog ────────────────────────

export const requestOfficialClub = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireNonAnonymous(context);

  const catalogId = sanitizeString(data?.catalogId, 100);
  const catalogName = sanitizeString(data?.catalogName, 200);
  const requesterName = sanitizeString(data?.requesterName, 100);
  const requesterRole = sanitizeString(data?.requesterRole, 100);
  const evidenceUrl = sanitizeString(data?.evidenceUrl, 500);
  const facrId = sanitizeString(data?.facrId, 50);

  if (!catalogId || !catalogName || !requesterName || !requesterRole) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'catalogId, catalogName, requesterName, requesterRole are required',
    );
  }

  // Zkontroluj že ten catalogId ještě nebyl claimnutý (žádný verified club s tímto catalogId)
  const clubsSnap = await db.ref('clubs').orderByChild('catalogId').equalTo(catalogId).get();
  if (clubsSnap.exists()) {
    const existing = clubsSnap.val() as Record<string, SharedClub>;
    for (const club of Object.values(existing)) {
      if (club.ownership === 'verified') {
        throw new functions.https.HttpsError(
          'already-exists',
          'This catalog club is already claimed by another user',
        );
      }
    }
  }

  // Zkontroluj že už nemáme pending žádost od stejného uživatele na stejný catalogId
  const pendingSnap = await db.ref('clubRequests').orderByChild('requesterUid').equalTo(uid).get();
  if (pendingSnap.exists()) {
    const pending = pendingSnap.val() as Record<string, { catalogId: string; status: string }>;
    for (const req of Object.values(pending)) {
      if (req.catalogId === catalogId && req.status === 'pending') {
        throw new functions.https.HttpsError(
          'already-exists',
          'You already have a pending request for this club',
        );
      }
    }
  }

  const requestId = db.ref('clubRequests').push().key!;
  const now = new Date().toISOString();

  const request = {
    catalogId,
    catalogName,
    requesterUid: uid,
    requesterName,
    requesterRole,
    evidenceUrl: evidenceUrl || null,
    facrId: facrId || null,
    status: 'pending' as const,
    createdAt: now,
  };

  await db.ref(`clubRequests/${requestId}`).set(request);

  return { success: true, requestId };
});

// ─── Admin: approve club request ───────────────────────────────────────────

export const adminApproveClubRequest = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);

  const requestId = sanitizeString(data?.requestId, 100);
  const note = sanitizeString(data?.note, 500);

  if (!requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'requestId is required');
  }

  const reqSnap = await db.ref(`clubRequests/${requestId}`).get();
  if (!reqSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Request not found');
  }

  const request = reqSnap.val() as {
    catalogId: string;
    catalogName: string;
    requesterUid: string;
    requesterName?: string;
    status: string;
  };

  if (request.status !== 'pending') {
    throw new functions.https.HttpsError('failed-precondition', 'Request is not pending');
  }

  // Načti catalog data pro logo/color
  const catalogSnap = await db.ref(`clubsCatalog/${request.catalogId}`).get();
  const catalog = catalogSnap.val() as { name?: string; logo?: string; color?: string } | null;

  const clubId = db.ref('clubs').push().key!;
  const now = new Date().toISOString();

  const club: SharedClub = {
    id: clubId,
    name: catalog?.name || request.catalogName,
    color: catalog?.color || '#2E7D32',
    logoBase64: catalog?.logo || null,
    catalogId: request.catalogId,
    ownership: 'verified',
    createdAt: now,
    createdBy: request.requesterUid,
    updatedAt: now,
    members: {
      [request.requesterUid]: {
        role: 'owner',
        joinedAt: now,
        displayName: request.requesterName || undefined,
      },
    },
  };

  const updates: Record<string, unknown> = {
    [`clubs/${clubId}`]: club,
    [`users/${request.requesterUid}/memberOfClubs/${clubId}`]: 'owner',
    [`clubRequests/${requestId}/status`]: 'approved',
    [`clubRequests/${requestId}/resolvedBy`]: context.auth!.uid,
    [`clubRequests/${requestId}/resolvedAt`]: now,
    [`clubRequests/${requestId}/resolutionNote`]: note || null,
    [`clubRequests/${requestId}/clubId`]: clubId,
  };

  // Pokud žadatel nemá activeClubId, nastav nově vytvořený
  const activeSnap = await db.ref(`users/${request.requesterUid}/activeClubId`).get();
  if (!activeSnap.exists()) {
    updates[`users/${request.requesterUid}/activeClubId`] = clubId;
  }

  await db.ref().update(updates);
  await audit(context.auth!.uid, 'approveClubRequest', request.requesterUid, { requestId, clubId, catalogId: request.catalogId });

  return { success: true, clubId };
});

export const adminRejectClubRequest = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);

  const requestId = sanitizeString(data?.requestId, 100);
  const reason = sanitizeString(data?.reason, 500);

  if (!requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'requestId is required');
  }

  const reqSnap = await db.ref(`clubRequests/${requestId}`).get();
  if (!reqSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Request not found');
  }

  const now = new Date().toISOString();
  await db.ref(`clubRequests/${requestId}`).update({
    status: 'rejected',
    resolvedBy: context.auth!.uid,
    resolvedAt: now,
    resolutionNote: reason || null,
  });

  await audit(context.auth!.uid, 'rejectClubRequest', null, { requestId, reason });

  return { success: true };
});

export const adminListClubRequests = functions.region('europe-west1').https.onCall(async (_data, context) => {
  requireAdmin(context);

  const snap = await db.ref('clubRequests').get();
  const all = (snap.val() || {}) as Record<string, unknown>;
  const requests = Object.entries(all).map(([id, value]) => ({ id, ...(value as object) }));

  return { requests };
});

// ─── Club Invites (PIN-based, reuse pattern from tournaments) ──────────────

export const createClubInvite = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireNonAnonymous(context);

  const clubId = sanitizeString(data?.clubId, 100);
  const roleRaw = sanitizeString(data?.role, 20);
  const expiresInDays = typeof data?.expiresInDays === 'number' ? data.expiresInDays : DEFAULT_INVITE_TTL_DAYS;

  if (!clubId) {
    throw new functions.https.HttpsError('invalid-argument', 'clubId is required');
  }

  const role: ClubRole = (['owner', 'coach', 'viewer'].includes(roleRaw) ? roleRaw : 'coach') as ClubRole;
  if (role === 'owner') {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot invite as owner (use transfer ownership instead)');
  }

  await requireClubRole(clubId, uid, 'owner');

  const inviteId = db.ref('clubInvites').push().key!;
  const pin = generatePin();
  const salt = crypto.randomBytes(16).toString('hex');
  const pinHash = hashPin(pin, salt);
  const now = Date.now();
  const expiresAt = new Date(now + expiresInDays * 86400_000).toISOString();

  await db.ref().update({
    [`clubInvites/${inviteId}`]: {
      clubId,
      role,
      createdBy: uid,
      createdAt: new Date(now).toISOString(),
      expiresAt,
      used: false,
    },
    [`clubPinAuth/${inviteId}`]: {
      pinHash,
      pinSalt: salt,
      clubId,
    },
  });

  return { success: true, inviteId, pin, expiresAt };
});

export const joinClubByInvite = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireAuth(context);

  const inviteId = sanitizeString(data?.inviteId, 100);
  const pin = sanitizeString(data?.pin, 20);

  if (!inviteId || !pin) {
    throw new functions.https.HttpsError('invalid-argument', 'inviteId and pin are required');
  }

  // Audit 2026-05-23 S-7: rate limit check (10 failed attempts / 10 min → block 30 min)
  await checkRateLimit('club-join', uid);

  const [inviteSnap, pinSnap] = await Promise.all([
    db.ref(`clubInvites/${inviteId}`).get(),
    db.ref(`clubPinAuth/${inviteId}`).get(),
  ]);

  if (!inviteSnap.exists() || !pinSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Invalid invite');
  }

  const invite = inviteSnap.val() as {
    clubId: string;
    role: ClubRole;
    createdBy: string;
    expiresAt: string;
    used: boolean;
  };
  const pinData = pinSnap.val() as { pinHash: string; pinSalt: string; clubId: string };

  if (invite.used) {
    throw new functions.https.HttpsError('failed-precondition', 'Invite already used');
  }

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    throw new functions.https.HttpsError('failed-precondition', 'Invite expired');
  }

  const expectedHash = hashPin(pin, pinData.pinSalt);
  if (expectedHash !== pinData.pinHash) {
    await recordFailedAttempt('club-join', uid);
    throw new functions.https.HttpsError('permission-denied', 'Invalid PIN');
  }

  await resetRateLimit('club-join', uid);

  // Anonymous users povolené — mohou se přidávat do klubu přes invite (stejně jako u turnajů)
  // ale dáváme jim vždy roli `viewer` aby nemohli měnit data
  const isAnonymous = context.auth?.token?.firebase?.sign_in_provider === 'anonymous';
  const effectiveRole: ClubRole = isAnonymous ? 'viewer' : invite.role;

  const club = await getClubOrThrow(invite.clubId);
  if (club.members?.[uid]) {
    // Už je členem — no-op, ale označ jako success
    return { success: true, clubId: invite.clubId, role: club.members[uid].role, alreadyMember: true };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    [`clubs/${invite.clubId}/members/${uid}`]: {
      role: effectiveRole,
      joinedAt: now,
      invitedBy: invite.createdBy,
      displayName: getDisplayName(context),
    },
    [`users/${uid}/memberOfClubs/${invite.clubId}`]: effectiveRole,
    [`clubInvites/${inviteId}/used`]: true,
    [`clubInvites/${inviteId}/usedBy`]: uid,
    [`clubInvites/${inviteId}/usedAt`]: now,
  };

  // Pokud uživatel nemá activeClubId, nastav nový klub
  const activeSnap = await db.ref(`users/${uid}/activeClubId`).get();
  if (!activeSnap.exists()) {
    updates[`users/${uid}/activeClubId`] = invite.clubId;
  }

  await db.ref().update(updates);

  return { success: true, clubId: invite.clubId, role: effectiveRole };
});

export const revokeClubInvite = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireNonAnonymous(context);

  const inviteId = sanitizeString(data?.inviteId, 100);
  if (!inviteId) {
    throw new functions.https.HttpsError('invalid-argument', 'inviteId is required');
  }

  const inviteSnap = await db.ref(`clubInvites/${inviteId}`).get();
  if (!inviteSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Invite not found');
  }

  const invite = inviteSnap.val() as { clubId: string; createdBy: string };
  await requireClubRole(invite.clubId, uid, 'owner');

  await db.ref().update({
    [`clubInvites/${inviteId}`]: null,
    [`clubPinAuth/${inviteId}`]: null,
  });

  return { success: true };
});

export const listClubInvites = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireNonAnonymous(context);

  const clubId = sanitizeString(data?.clubId, 100);
  if (!clubId) {
    throw new functions.https.HttpsError('invalid-argument', 'clubId is required');
  }

  await requireClubRole(clubId, uid, 'owner');

  const snap = await db.ref('clubInvites').orderByChild('clubId').equalTo(clubId).get();
  const all = (snap.val() || {}) as Record<string, { used: boolean; expiresAt: string }>;
  const invites = Object.entries(all)
    .filter(([, inv]) => !inv.used && new Date(inv.expiresAt).getTime() > Date.now())
    .map(([id, inv]) => ({ id, ...inv }));

  return { invites };
});

// ─── Member management ────────────────────────────────────────────────────

export const removeClubMember = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireNonAnonymous(context);

  const clubId = sanitizeString(data?.clubId, 100);
  const memberUid = sanitizeString(data?.memberUid, 128);

  if (!clubId || !memberUid) {
    throw new functions.https.HttpsError('invalid-argument', 'clubId and memberUid are required');
  }

  const club = await requireClubRole(clubId, uid, 'owner');

  if (!club.members?.[memberUid]) {
    throw new functions.https.HttpsError('not-found', 'Member not found in club');
  }

  if (memberUid === uid) {
    throw new functions.https.HttpsError('failed-precondition', 'Use leaveClub to remove yourself');
  }

  await db.ref().update({
    [`clubs/${clubId}/members/${memberUid}`]: null,
    [`users/${memberUid}/memberOfClubs/${clubId}`]: null,
  });

  // Pokud to byl jejich activeClubId, zreset na null (oni si musí zvolit jiný při dalším loginu)
  const activeSnap = await db.ref(`users/${memberUid}/activeClubId`).get();
  if (activeSnap.exists() && activeSnap.val() === clubId) {
    await db.ref(`users/${memberUid}/activeClubId`).set(null);
  }

  return { success: true };
});

export const changeClubMemberRole = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireNonAnonymous(context);

  const clubId = sanitizeString(data?.clubId, 100);
  const memberUid = sanitizeString(data?.memberUid, 128);
  const newRoleRaw = sanitizeString(data?.newRole, 20);

  if (!clubId || !memberUid || !newRoleRaw) {
    throw new functions.https.HttpsError('invalid-argument', 'clubId, memberUid, newRole are required');
  }

  if (!['owner', 'coach', 'viewer'].includes(newRoleRaw)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid role');
  }
  const newRole = newRoleRaw as ClubRole;

  const club = await requireClubRole(clubId, uid, 'owner');

  if (!club.members?.[memberUid]) {
    throw new functions.https.HttpsError('not-found', 'Member not found in club');
  }

  // Last-owner protection: nemůže demote sebe pokud je poslední owner
  if (memberUid === uid && club.members[uid].role === 'owner' && newRole !== 'owner') {
    const ownerCount = Object.values(club.members).filter(m => m.role === 'owner').length;
    if (ownerCount <= 1) {
      throw new functions.https.HttpsError('failed-precondition', 'Cannot demote yourself — you are the last owner');
    }
  }

  await db.ref().update({
    [`clubs/${clubId}/members/${memberUid}/role`]: newRole,
    [`users/${memberUid}/memberOfClubs/${clubId}`]: newRole,
  });

  return { success: true };
});

export const leaveClub = functions.region('europe-west1').https.onCall(async (data, context) => {
  const uid = requireNonAnonymous(context);

  const clubId = sanitizeString(data?.clubId, 100);
  if (!clubId) {
    throw new functions.https.HttpsError('invalid-argument', 'clubId is required');
  }

  const club = await getClubOrThrow(clubId);
  if (!club.members?.[uid]) {
    throw new functions.https.HttpsError('not-found', 'Not a member of this club');
  }

  // Last-owner protection
  if (club.members[uid].role === 'owner') {
    const ownerCount = Object.values(club.members).filter(m => m.role === 'owner').length;
    if (ownerCount <= 1) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Cannot leave — you are the last owner. Transfer ownership first or delete the club.',
      );
    }
  }

  const updates: Record<string, unknown> = {
    [`clubs/${clubId}/members/${uid}`]: null,
    [`users/${uid}/memberOfClubs/${clubId}`]: null,
  };

  const activeSnap = await db.ref(`users/${uid}/activeClubId`).get();
  if (activeSnap.exists() && activeSnap.val() === clubId) {
    updates[`users/${uid}/activeClubId`] = null;
  }

  await db.ref().update(updates);

  return { success: true };
});

// ─── Admin override: super-admin může spravovat jakýkoliv klub ──────────────

export const adminAddClubMember = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);

  const clubId = sanitizeString(data?.clubId, 100);
  const memberUid = sanitizeString(data?.memberUid, 128);
  const roleRaw = sanitizeString(data?.role, 20);

  if (!clubId || !memberUid || !['owner', 'coach', 'viewer'].includes(roleRaw)) {
    throw new functions.https.HttpsError('invalid-argument', 'clubId, memberUid, valid role are required');
  }
  const role = roleRaw as ClubRole;

  await getClubOrThrow(clubId); // validace existence

  const now = new Date().toISOString();
  await db.ref().update({
    [`clubs/${clubId}/members/${memberUid}`]: {
      role,
      joinedAt: now,
      invitedBy: context.auth!.uid,
    },
    [`users/${memberUid}/memberOfClubs/${clubId}`]: role,
  });

  await audit(context.auth!.uid, 'adminAddClubMember', memberUid, { clubId, role });
  return { success: true };
});

export const adminTransferClubOwnership = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);

  const clubId = sanitizeString(data?.clubId, 100);
  const newOwnerUid = sanitizeString(data?.newOwnerUid, 128);

  if (!clubId || !newOwnerUid) {
    throw new functions.https.HttpsError('invalid-argument', 'clubId and newOwnerUid are required');
  }

  const club = await getClubOrThrow(clubId);

  const updates: Record<string, unknown> = {};

  // Degraduj stávající ownery na coach
  for (const [memberUid, member] of Object.entries(club.members || {})) {
    if (member.role === 'owner' && memberUid !== newOwnerUid) {
      updates[`clubs/${clubId}/members/${memberUid}/role`] = 'coach';
      updates[`users/${memberUid}/memberOfClubs/${clubId}`] = 'coach';
    }
  }

  // Povyš nového ownera (přidej pokud neexistuje)
  const now = new Date().toISOString();
  if (club.members?.[newOwnerUid]) {
    updates[`clubs/${clubId}/members/${newOwnerUid}/role`] = 'owner';
  } else {
    updates[`clubs/${clubId}/members/${newOwnerUid}`] = {
      role: 'owner',
      joinedAt: now,
      invitedBy: context.auth!.uid,
    };
  }
  updates[`users/${newOwnerUid}/memberOfClubs/${clubId}`] = 'owner';

  await db.ref().update(updates);
  await audit(context.auth!.uid, 'adminTransferClubOwnership', newOwnerUid, { clubId });

  return { success: true };
});

export const adminDeleteClub = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAdmin(context);

  const clubId = sanitizeString(data?.clubId, 100);
  if (!clubId) {
    throw new functions.https.HttpsError('invalid-argument', 'clubId is required');
  }

  const club = await getClubOrThrow(clubId);

  const updates: Record<string, unknown> = {
    [`clubs/${clubId}`]: null,
    [`trainings/${clubId}`]: null,
    [`matches/${clubId}`]: null,
    [`contacts/${clubId}`]: null,
  };

  // Odeber memberOfClubs pointery a případně activeClubId
  for (const memberUid of Object.keys(club.members || {})) {
    updates[`users/${memberUid}/memberOfClubs/${clubId}`] = null;
    const activeSnap = await db.ref(`users/${memberUid}/activeClubId`).get();
    if (activeSnap.exists() && activeSnap.val() === clubId) {
      updates[`users/${memberUid}/activeClubId`] = null;
    }
  }

  await db.ref().update(updates);
  await audit(context.auth!.uid, 'adminDeleteClub', null, { clubId, name: club.name });

  return { success: true };
});

