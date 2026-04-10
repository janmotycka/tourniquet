/**
 * Client-side wrappery pro Club Cloud Functions.
 *
 * Každá funkce je thin wrapper nad httpsCallable() která vrací typed Promise.
 * Error handling: vyhazuje FirebaseError s code + message, caller si to může zachytit
 * a přeložit přes useI18n.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { ClubRole } from '../types/club.types';

// ─── Club creation / requests ──────────────────────────────────────────────

export async function createPersonalClub(input: {
  name: string;
  color?: string;
  logoBase64?: string | null;
}): Promise<{ success: boolean; clubId: string }> {
  const fn = httpsCallable<unknown, { success: boolean; clubId: string }>(
    functions,
    'createPersonalClub',
  );
  const res = await fn(input);
  return res.data;
}

export async function requestOfficialClub(input: {
  catalogId: string;
  catalogName: string;
  requesterName: string;
  requesterRole: string;
  evidenceUrl?: string;
  facrId?: string;
}): Promise<{ success: boolean; requestId: string }> {
  const fn = httpsCallable<unknown, { success: boolean; requestId: string }>(
    functions,
    'requestOfficialClub',
  );
  const res = await fn(input);
  return res.data;
}

// ─── Admin: club requests queue ────────────────────────────────────────────

export async function adminListClubRequests(): Promise<{
  requests: Array<{
    id: string;
    catalogId: string;
    catalogName: string;
    requesterUid: string;
    requesterName: string;
    requesterRole: string;
    evidenceUrl?: string | null;
    facrId?: string | null;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    resolvedBy?: string;
    resolvedAt?: string;
    resolutionNote?: string | null;
    clubId?: string;
  }>;
}> {
  const fn = httpsCallable<unknown, { requests: ReturnType<typeof Array> }>(
    functions,
    'adminListClubRequests',
  );
  const res = await fn({});
  return res.data as { requests: [] } as never;
}

export async function adminApproveClubRequest(input: {
  requestId: string;
  note?: string;
}): Promise<{ success: boolean; clubId: string }> {
  const fn = httpsCallable<unknown, { success: boolean; clubId: string }>(
    functions,
    'adminApproveClubRequest',
  );
  const res = await fn(input);
  return res.data;
}

export async function adminRejectClubRequest(input: {
  requestId: string;
  reason?: string;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<unknown, { success: boolean }>(
    functions,
    'adminRejectClubRequest',
  );
  const res = await fn(input);
  return res.data;
}

// ─── Club invites (PIN-based) ──────────────────────────────────────────────

export async function createClubInvite(input: {
  clubId: string;
  role: 'coach' | 'viewer';
  expiresInDays?: number;
}): Promise<{
  success: boolean;
  inviteId: string;
  pin: string;
  expiresAt: string;
}> {
  const fn = httpsCallable<
    unknown,
    { success: boolean; inviteId: string; pin: string; expiresAt: string }
  >(functions, 'createClubInvite');
  const res = await fn(input);
  return res.data;
}

export async function joinClubByInvite(input: {
  inviteId: string;
  pin: string;
}): Promise<{
  success: boolean;
  clubId: string;
  role: ClubRole;
  alreadyMember?: boolean;
}> {
  const fn = httpsCallable<
    unknown,
    { success: boolean; clubId: string; role: ClubRole; alreadyMember?: boolean }
  >(functions, 'joinClubByInvite');
  const res = await fn(input);
  return res.data;
}

export async function revokeClubInvite(inviteId: string): Promise<{ success: boolean }> {
  const fn = httpsCallable<unknown, { success: boolean }>(functions, 'revokeClubInvite');
  const res = await fn({ inviteId });
  return res.data;
}

export async function listClubInvites(clubId: string): Promise<{
  invites: Array<{
    id: string;
    clubId: string;
    role: ClubRole;
    createdBy: string;
    createdAt: string;
    expiresAt: string;
    used: boolean;
  }>;
}> {
  const fn = httpsCallable<unknown, { invites: [] }>(functions, 'listClubInvites');
  const res = await fn({ clubId });
  return res.data as never;
}

// ─── Member management ────────────────────────────────────────────────────

export async function removeClubMember(input: {
  clubId: string;
  memberUid: string;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<unknown, { success: boolean }>(functions, 'removeClubMember');
  const res = await fn(input);
  return res.data;
}

export async function changeClubMemberRole(input: {
  clubId: string;
  memberUid: string;
  newRole: ClubRole;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<unknown, { success: boolean }>(functions, 'changeClubMemberRole');
  const res = await fn(input);
  return res.data;
}

export async function leaveClub(clubId: string): Promise<{ success: boolean }> {
  const fn = httpsCallable<unknown, { success: boolean }>(functions, 'leaveClub');
  const res = await fn({ clubId });
  return res.data;
}

// ─── Admin overrides ───────────────────────────────────────────────────────

export async function adminAddClubMember(input: {
  clubId: string;
  memberUid: string;
  role: ClubRole;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<unknown, { success: boolean }>(functions, 'adminAddClubMember');
  const res = await fn(input);
  return res.data;
}

export async function adminTransferClubOwnership(input: {
  clubId: string;
  newOwnerUid: string;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<unknown, { success: boolean }>(
    functions,
    'adminTransferClubOwnership',
  );
  const res = await fn(input);
  return res.data;
}

export async function adminDeleteClub(clubId: string): Promise<{ success: boolean }> {
  const fn = httpsCallable<unknown, { success: boolean }>(functions, 'adminDeleteClub');
  const res = await fn({ clubId });
  return res.data;
}

