/**
 * ClubMembersPage — správa členů aktivního sdíleného klubu.
 *
 * Funkce:
 * - Seznam členů s rolí (owner / coach / viewer)
 * - Pozvat trenéra (owner-only): vytvoří PIN-based invite + share link
 * - Aktivní pozvánky: zrušit
 * - Změnit roli člena (owner-only): promote/demote (s last-owner ochranou)
 * - Odebrat člena (owner-only)
 * - Opustit klub (každý člen, s last-owner ochranou)
 *
 * Routing: page = { name: 'club-members' }
 * Vyžaduje activeClubId — pokud null, zobrazí prázdný stav s odkazem na clubs.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import { useClubsStore } from '../store/clubs.store';
import { useToastStore } from '../store/toast.store';
import { useConfirmStore } from '../store/confirm.store';
import { useI18n } from '../i18n';
import { useAuth } from '../context/AuthContext';
import { useLayoutMode } from '../hooks/useLayoutMode';
import {
  createClubInvite,
  listClubInvites,
  revokeClubInvite,
  removeClubMember,
  changeClubMemberRole,
  leaveClub,
} from '../services/club-functions';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import type { ClubRole, ClubMember } from '../types/club.types';
import { logger } from '../utils/logger';
import { PageHeader } from '../components/ui';

interface Props {
  navigate: (p: Page) => void;
}

interface InviteRow {
  id: string;
  clubId: string;
  role: ClubRole;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

interface MemberRow {
  uid: string;
  role: ClubRole;
  joinedAt: string;
  invitedBy?: string;
  displayName?: string;
}

function buildShareLink(inviteId: string): string {
  const origin = window.location.origin;
  return `${origin}/?join=club&id=${inviteId}#club`;
}

export function ClubMembersPage({ navigate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { isDesktop } = useLayoutMode();
  const showToast = useToastStore(s => s.show);
  const askConfirm = useConfirmStore(s => s.ask);

  const clubs = useClubsStore(s => s.clubs);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const memberOfClubs = useClubsStore(s => s.memberOfClubs);

  const activeClub = clubs.find(c => c.id === activeClubId);
  const myRole = activeClubId ? memberOfClubs[activeClubId] ?? null : null;
  const isOwner = myRole === 'owner';

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [busy, setBusy] = useState(false);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<'coach' | 'viewer'>('coach');
  const [inviteTtl, setInviteTtl] = useState(7);
  const [inviteResult, setInviteResult] = useState<{ inviteId: string; pin: string } | null>(null);

  // Realtime subscribe to club members (we read from /clubs/{id}/members)
  useEffect(() => {
    if (!activeClubId) return;
    const r = ref(db, `clubs/${activeClubId}/members`);
    const unsubscribe = onValue(r, snap => {
      const val = snap.val() as Record<string, ClubMember> | null;
      if (!val) {
        setMembers([]);
        return;
      }
      const list: MemberRow[] = Object.entries(val).map(([uid, m]) => ({
        uid,
        role: m.role,
        joinedAt: m.joinedAt,
        invitedBy: m.invitedBy,
        displayName: (m as ClubMember & { displayName?: string }).displayName,
      }));
      // Self first, then owners, then by joinedAt
      list.sort((a, b) => {
        if (a.uid === user?.uid) return -1;
        if (b.uid === user?.uid) return 1;
        if (a.role === 'owner' && b.role !== 'owner') return -1;
        if (b.role === 'owner' && a.role !== 'owner') return 1;
        return a.joinedAt.localeCompare(b.joinedAt);
      });
      setMembers(list);
    });
    return () => unsubscribe();
  }, [activeClubId, user?.uid]);

  const loadInvitesList = useCallback(async () => {
    if (!activeClubId || !isOwner) return;
    setLoadingInvites(true);
    try {
      const res = await listClubInvites(activeClubId);
      // Runtime guard — Cloud Function může vrátit { invites: [] } nebo nic
      const data = (res && typeof res === 'object') ? (res as Record<string, unknown>) : {};
      const raw = Array.isArray(data.invites) ? (data.invites as InviteRow[]) : [];
      setInvites(raw.filter(i => !i.used));
    } catch (err) {
      logger.warn('[ClubMembers] listClubInvites failed:', err);
    } finally {
      setLoadingInvites(false);
    }
  }, [activeClubId, isOwner]);

  useEffect(() => {
    void loadInvitesList();
  }, [loadInvitesList]);

  const handleCreateInvite = async () => {
    if (!activeClubId) return;
    setBusy(true);
    try {
      const res = await createClubInvite({
        clubId: activeClubId,
        role: inviteRole,
        expiresInDays: inviteTtl,
      });
      setInviteResult({ inviteId: res.inviteId, pin: res.pin });
      showToast('success', t('clubs.members.inviteCreated'));
      void loadInvitesList();
    } catch (err) {
      logger.warn('[ClubMembers] createInvite failed:', err);
      showToast('error', (err as Error).message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setBusy(true);
    try {
      await revokeClubInvite(inviteId);
      void loadInvitesList();
    } catch (err) {
      showToast('error', (err as Error).message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (uid: string, displayName?: string) => {
    if (!activeClubId) return;
    const ok = await askConfirm({
      title: t('clubs.members.remove'),
      message: t('clubs.members.removeConfirm').replace('{name}', displayName || uid.slice(0, 8)),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeClubMember({ clubId: activeClubId, memberUid: uid });
    } catch (err) {
      showToast('error', (err as Error).message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeRole = async (uid: string, newRole: ClubRole) => {
    if (!activeClubId) return;
    setBusy(true);
    try {
      await changeClubMemberRole({ clubId: activeClubId, memberUid: uid, newRole });
    } catch (err) {
      showToast('error', (err as Error).message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!activeClubId) return;
    const ok = await askConfirm({
      title: t('clubs.members.leave'),
      message: t('clubs.members.leaveConfirm'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await leaveClub(activeClubId);
      showToast('success', t('clubs.members.leave'));
      navigate({ name: 'home' });
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.toLowerCase().includes('last') || msg.toLowerCase().includes('owner')) {
        showToast('error', t('clubs.members.leaveLastOwner'));
      } else {
        showToast('error', msg || 'Error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopyLink = async (inviteId: string) => {
    try {
      await navigator.clipboard.writeText(buildShareLink(inviteId));
      showToast('success', t('clubs.members.inviteCopyLink'));
    } catch {
      // ignore
    }
  };

  const cardStyle = {
    background: 'var(--surface)',
    borderRadius: 14,
    padding: 18,
    boxShadow: 'var(--shadow-sm)',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 12,
  };

  // Empty state — no active club
  if (!activeClubId || !activeClub) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!isDesktop && (
          <PageHeader
            title={t('clubs.members.title')}
            onBack={() => navigate({ name: 'home' })}
          />
        )}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48 }}>🏟</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>{t('clubs.shared.noActiveClub')}</p>
          <button
            onClick={() => navigate({ name: 'clubs' })}
            style={{
              padding: '12px 20px', borderRadius: 12, background: 'var(--success)', color: '#fff',
              fontWeight: 700, fontSize: 14,
            }}
          >
            {t('clubs.shared.createPersonalTitle')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Mobile header */}
      {!isDesktop && (
        <PageHeader
          title={t('clubs.members.title')}
          subtitle={activeClub.name}
          onBack={() => navigate({ name: 'clubs' })}
        />
      )}

      <div style={{
        flex: 1, overflowY: 'auto', padding: 20,
        display: 'flex', flexDirection: 'column', gap: 16,
        width: '100%', maxWidth: isDesktop ? 760 : undefined, alignSelf: isDesktop ? 'center' : undefined,
        boxSizing: 'border-box',
      }}>
        {/* Members list */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>
              {t('clubs.members.title')} ({members.length})
            </h2>
            {isOwner && (
              <button
                onClick={() => { setInviteOpen(true); setInviteResult(null); }}
                style={{
                  padding: '8px 14px', borderRadius: 10, background: 'var(--success)', color: '#fff',
                  fontWeight: 700, fontSize: 13,
                }}
              >
                + {t('clubs.members.invite')}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(m => {
              const isMe = m.uid === user?.uid;
              const roleLabel = m.role === 'owner' ? t('clubs.shared.ownerBadge')
                : m.role === 'coach' ? t('clubs.shared.coachBadge')
                : t('clubs.shared.viewerBadge');
              const roleBg = m.role === 'owner' ? 'var(--success)' : 'var(--surface-var)';
              const roleColor = m.role === 'owner' ? '#fff' : 'var(--text-muted)';
              // Pro mě vezmi jméno z auth profilu (Firebase), fallback na server-saved
              // displayName, email, nebo UID prefix. Ostatní členové uvidí mé jméno
              // jak je uložené na serveru při registraci/přihlášení do klubu.
              const selfDisplayName = isMe
                ? (user?.displayName || m.displayName || user?.email?.split('@')[0] || m.uid.slice(0, 8) + '…')
                : null;
              const memberDisplayName = selfDisplayName ?? m.displayName ?? (m.uid.slice(0, 8) + '…');
              return (
                <div key={m.uid} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'var(--surface-var)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 16, background: 'var(--primary-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                  }}>
                    {(memberDisplayName.slice(0, 2) || '?').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 13,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span>{memberDisplayName}</span>
                      {isMe && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: 'var(--primary-light)', color: 'var(--primary)',
                          letterSpacing: 0.3, textTransform: 'uppercase', flexShrink: 0,
                        }}>
                          {t('clubs.members.you')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {t('clubs.members.joinedAt').replace('{date}', new Date(m.joinedAt).toLocaleDateString())}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: roleBg, color: roleColor,
                  }}>
                    {roleLabel}
                  </span>
                  {isOwner && !isMe && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {m.role !== 'owner' && (
                        <button
                          disabled={busy}
                          onClick={() => handleChangeRole(m.uid, 'owner')}
                          title={t('clubs.members.promote')}
                          style={{
                            padding: '6px 8px', borderRadius: 8, fontSize: 11,
                            background: 'var(--surface)', color: 'var(--text-muted)',
                          }}
                        >⬆</button>
                      )}
                      {m.role === 'owner' && (
                        <button
                          disabled={busy}
                          onClick={() => handleChangeRole(m.uid, 'coach')}
                          title={t('clubs.members.demote')}
                          style={{
                            padding: '6px 8px', borderRadius: 8, fontSize: 11,
                            background: 'var(--surface)', color: 'var(--text-muted)',
                          }}
                        >⬇</button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => handleRemoveMember(m.uid, m.displayName)}
                        title={t('clubs.members.remove')}
                        style={{
                          padding: '6px 8px', borderRadius: 8, fontSize: 11,
                          background: '#ffebee', color: '#c62828',
                        }}
                      >×</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active invites (owner-only) */}
        {isOwner && (
          <div style={cardStyle}>
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>
              {t('clubs.members.activeInvites')} {loadingInvites && '…'}
            </h2>
            {invites.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invites.map(inv => (
                  <div key={inv.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10, background: 'var(--surface-var)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {inv.role === 'coach' ? t('clubs.shared.coachBadge') : t('clubs.shared.viewerBadge')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        exp: {new Date(inv.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopyLink(inv.id)}
                      style={{
                        padding: '6px 10px', borderRadius: 8, fontSize: 11,
                        background: 'var(--surface)', color: 'var(--text)',
                      }}
                    >
                      🔗
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleRevokeInvite(inv.id)}
                      style={{
                        padding: '6px 10px', borderRadius: 8, fontSize: 11,
                        background: '#ffebee', color: '#c62828',
                      }}
                    >
                      {t('clubs.members.revokeInvite')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Leave club */}
        <div style={cardStyle}>
          <button
            disabled={busy}
            onClick={handleLeave}
            style={{
              padding: '12px 16px', borderRadius: 12, background: '#ffebee', color: '#c62828',
              fontWeight: 700, fontSize: 14,
            }}
          >
            {t('clubs.members.leave')}
          </button>
        </div>
      </div>

      {/* Invite Modal */}
      {inviteOpen && (
        <div
          onClick={() => setInviteOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 16, padding: 24,
              maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <h3 style={{ fontWeight: 700, fontSize: 18 }}>{t('clubs.members.invite')}</h3>

            {!inviteResult ? (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t('clubs.members.inviteRoleLabel')}</span>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as 'coach' | 'viewer')}
                    style={{
                      padding: '10px 12px', borderRadius: 10, fontSize: 14,
                      border: '1px solid var(--divider)', background: 'var(--surface)',
                    }}
                  >
                    <option value="coach">{t('clubs.shared.coachBadge')}</option>
                    <option value="viewer">{t('clubs.shared.viewerBadge')}</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t('clubs.members.inviteTTL')}</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={inviteTtl}
                    onChange={e => setInviteTtl(Math.max(1, Math.min(30, Number(e.target.value) || 7)))}
                    style={{
                      padding: '10px 12px', borderRadius: 10, fontSize: 14,
                      border: '1px solid var(--divider)', background: 'var(--surface)',
                    }}
                  />
                </label>

                <button
                  disabled={busy}
                  onClick={handleCreateInvite}
                  style={{
                    padding: '12px', borderRadius: 12, background: 'var(--success)', color: '#fff',
                    fontWeight: 700, fontSize: 14, opacity: busy ? 0.6 : 1,
                  }}
                >
                  {t('clubs.members.inviteCreate')}
                </button>
              </>
            ) : (
              <>
                <div style={{
                  background: 'var(--surface-var)', borderRadius: 12, padding: 16,
                  display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>PIN</div>
                  <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 4, fontFamily: 'monospace' }}>
                    {inviteResult.pin}
                  </div>
                </div>
                <button
                  onClick={() => handleCopyLink(inviteResult.inviteId)}
                  style={{
                    padding: '12px', borderRadius: 12, background: 'var(--surface-var)', color: 'var(--text)',
                    fontWeight: 700, fontSize: 14,
                  }}
                >
                  🔗 {t('clubs.members.inviteCopyLink')}
                </button>
                <button
                  onClick={() => { setInviteOpen(false); setInviteResult(null); }}
                  style={{
                    padding: '10px', borderRadius: 12, background: 'transparent', color: 'var(--text-muted)',
                    fontWeight: 600, fontSize: 13,
                  }}
                >
                  ✓
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
