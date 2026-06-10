import { useState, useEffect, useMemo, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { ref as dbRef, onValue, set as dbSet } from 'firebase/database';
import { functions, auth, db } from '../firebase';
import { useI18n } from '../i18n';
import { usePageStore } from '../store/page.store';
import { useLayoutMode } from '../hooks/useLayoutMode';
import { DesktopPage, FilterPill, desktopSecondaryButtonStyle } from '../components/desktop/DesktopPage';
import { ADMIN_UID } from '../constants/admin';

// ─── Types (mirrors Cloud Function output) ──────────────────────────────────

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
}

interface UserInfo {
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

interface SystemStats {
  users: { total: number; dau: number; wau: number; mau: number; anon: number; newToday: number; newThisWeek: number; premium: number };
  tournaments: { total: number; active: number; finished: number; liveNow: number };
  conversion: number;
  storageBytes: number;
  storageBreakdown?: Record<string, number>;
  sparkLimits?: {
    rtdbStorageBytes: number;
    rtdbBandwidthMonthBytes: number;
    rtdbConnections: number;
    functionsInvocationsMonth: number;
    functionsGbSecondsMonth: number;
    functionsOutboundMonthBytes: number;
  };
  estimates?: {
    functionsInvocationsMonth: number;
    rtdbBandwidthMonthBytes: number;
  };
  generatedAt: string;
}

interface CatalogClub {
  id: string;
  name: string;
  city?: string;
  founded?: number;
  logoUrl?: string;
  logoBase64?: string;
  wikidataId?: string;
  source: 'wikidata' | 'manual' | 'user';
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

// Mirrors the Cloud Function definition; intentionally local to keep client/server contracts visible.
const SOURCE_LABEL_KEYS = {
  wikidata: 'admin.clubs.source.wikidata',
  manual: 'admin.clubs.source.manual',
  user: 'admin.clubs.source.user',
} as const;

interface PendingClub {
  id: string;
  name: string;
  city?: string;
  logoUrl?: string;
  submittedBy: string;
  submittedAt: string;
}

type Tab = 'users' | 'suspicious' | 'clubs' | 'stats' | 'clubRequests';

interface ClubRequestItem {
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
}

const formatBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1_073_741_824) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1_073_741_824).toFixed(2)} GB`;
};

// ─── Main component ─────────────────────────────────────────────────────────

export function AdminPage() {
  const { t } = useI18n();
  const setPage = usePageStore(s => s.setPage);
  const { isDesktop } = useLayoutMode();

  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [catalog, setCatalog] = useState<CatalogClub[]>([]);
  const [pendingClubs, setPendingClubs] = useState<PendingClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'premium' | 'free' | 'blocked'>('all');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [clubRequests, setClubRequests] = useState<ClubRequestItem[]>([]);

  const currentUid = auth.currentUser?.uid;
  const isAdmin = currentUid === ADMIN_UID;

  // ─── Loading ──────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const fn = httpsCallable<unknown, { users: UserInfo[] }>(functions, 'adminListUsers');
      const result = await fn({});
      setUsers(result.data.users);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Admin] loadUsers failed:', msg);
      setError(`Users: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const fn = httpsCallable<unknown, SystemStats>(functions, 'adminGetStats');
      const result = await fn({});
      setStats(result.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Admin] loadStats failed:', msg);
      setError(`Stats: ${msg}`);
    }
  }, []);

  const loadClubRequests = useCallback(async () => {
    try {
      const fn = httpsCallable<unknown, { requests: ClubRequestItem[] }>(functions, 'adminListClubRequests');
      const res = await fn({});
      setClubRequests(res.data.requests || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Admin] loadClubRequests failed:', msg);
      // Non-critical — don't overwrite existing error
    }
  }, []);

  // Catalog + pending: realtime via RTDB (admin can read)
  useEffect(() => {
    if (!isAdmin) return;
    const unsubCatalog = onValue(dbRef(db, 'clubsCatalog'), (snap) => {
      const data = snap.val() as Record<string, CatalogClub> | null;
      setCatalog(data ? Object.values(data) : []);
    });
    const unsubPending = onValue(dbRef(db, 'clubsCatalogPending'), (snap) => {
      const data = snap.val() as Record<string, Omit<PendingClub, 'id'>> | null;
      setPendingClubs(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : []);
    });
    return () => {
      unsubCatalog();
      unsubPending();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    loadStats();
    loadClubRequests();
  }, [isAdmin, loadUsers, loadStats, loadClubRequests]);

  // ─── User actions ─────────────────────────────────────────────────────────

  const togglePremium = async (user: UserInfo) => {
    const isPremium = user.subscription.status === 'active';
    const newStatus = isPremium ? 'free' : 'active';
    const newPlan = isPremium ? 'free' : 'premium';
    try {
      setUpdating(user.uid);
      const fn = httpsCallable(functions, 'adminSetSubscription');
      await fn({ targetUid: user.uid, status: newStatus, plan: newPlan });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, subscription: { status: newStatus, plan: newPlan } } : u));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setUpdating(null);
    }
  };

  const grant30DayPremium = async (user: UserInfo) => {
    try {
      setUpdating(user.uid);
      const fn = httpsCallable(functions, 'adminSetSubscription');
      await fn({ targetUid: user.uid, status: 'active', plan: 'premium', periodDays: 30 });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, subscription: { status: 'active', plan: 'premium' } } : u));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setUpdating(null);
    }
  };

  const toggleBlock = async (user: UserInfo) => {
    const isBlocked = !!user.flags.blocked;
    let reason: string | null = null;
    if (!isBlocked) {
      reason = window.prompt(t('admin.user.blockReasonPrompt'), '');
      if (reason === null) return;
    }
    try {
      setUpdating(user.uid);
      const fn = httpsCallable(functions, 'adminSetUserBlock');
      await fn({ targetUid: user.uid, blocked: !isBlocked, reason });
      setUsers(prev => prev.map(u => u.uid === user.uid
        ? { ...u, flags: !isBlocked ? { blocked: true, reason: reason || '', blockedAt: new Date().toISOString() } : {} }
        : u
      ));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setUpdating(null);
    }
  };

  const generatePasswordResetLink = async (user: UserInfo) => {
    if (!user.email) {
      alert('User has no email address on record.');
      return;
    }
    try {
      setUpdating(user.uid);
      const fn = httpsCallable<{ email: string; continueUrl?: string }, { success: boolean; link: string; email: string }>(
        functions,
        'adminGeneratePasswordResetLink',
      );
      const continueUrl = window.location.origin + window.location.pathname;
      const r = await fn({ email: user.email, continueUrl });
      // Kopírovat do clipboardu — admin pak odešle uživateli přes preferovaný kanál
      try {
        await navigator.clipboard.writeText(r.data.link);
        alert(`Reset link pro ${r.data.email} zkopírovaný do schránky.\n\nPošli ho uživateli přes WhatsApp / SMS / jiný e-mail. Link vyprší za cca 1 hodinu.`);
      } catch {
        // Clipboard fallback — prompt
        window.prompt(`Reset link pro ${r.data.email} (expiruje za ~1h). Zkopíruj a pošli:`, r.data.link);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed';
      alert(`Nepodařilo se vygenerovat reset link: ${msg}`);
    } finally {
      setUpdating(null);
    }
  };

  const purgeTournaments = async (user: UserInfo) => {
    const name = user.displayName || user.email || user.uid.substring(0, 8);
    if (!window.confirm(t('admin.user.purgeConfirm', { name }))) return;
    try {
      setUpdating(user.uid);
      const fn = httpsCallable<unknown, { deleted: number }>(functions, 'adminPurgeUserTournaments');
      const r = await fn({ targetUid: user.uid });
      alert(`Deleted ${r.data.deleted}`);
      await loadUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setUpdating(null);
    }
  };

  // ─── Catalog actions ──────────────────────────────────────────────────────

  const syncCatalog = async () => {
    try {
      setSyncing(true);
      const fn = httpsCallable<unknown, { added: number; updated: number }>(functions, 'adminSyncClubsCatalog');
      const r = await fn({});
      alert(t('admin.clubs.syncSuccess', { added: String(r.data.added), updated: String(r.data.updated) }));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const approvePending = async (id: string, approve: boolean) => {
    try {
      const fn = httpsCallable(functions, 'adminApproveClubSubmission');
      await fn({ submissionId: id, approve });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const deleteCatalogClub = async (club: CatalogClub) => {
    if (!window.confirm(t('admin.clubs.deleteConfirm', { name: club.name }))) return;
    try {
      const fn = httpsCallable(functions, 'adminDeleteCatalogClub');
      await fn({ id: club.id });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  // ─── Club requests (Etapa 1 — shared clubs) ────────────────────────────

  const approveClubRequest = async (req: ClubRequestItem) => {
    const note = window.prompt(t('admin.clubRequests.approveNote')) ?? '';
    try {
      setUpdating(req.id);
      const fn = httpsCallable(functions, 'adminApproveClubRequest');
      await fn({ requestId: req.id, note });
      alert(t('admin.clubRequests.approved'));
      await loadClubRequests();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setUpdating(null);
    }
  };

  const rejectClubRequest = async (req: ClubRequestItem) => {
    const reason = window.prompt(t('admin.clubRequests.rejectReason')) ?? '';
    try {
      setUpdating(req.id);
      const fn = httpsCallable(functions, 'adminRejectClubRequest');
      await fn({ requestId: req.id, reason });
      alert(t('admin.clubRequests.rejected'));
      await loadClubRequests();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setUpdating(null);
    }
  };

  // ─── Filtered users ───────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    let list = [...users];
    if (filter === 'premium') list = list.filter(u => u.subscription.status === 'active');
    if (filter === 'free') list = list.filter(u => u.subscription.status !== 'active');
    if (filter === 'blocked') list = list.filter(u => !!u.flags.blocked);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(u =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (a.uid === ADMIN_UID) return -1;
      if (b.uid === ADMIN_UID) return 1;
      const aPremium = a.subscription.status === 'active' ? 1 : 0;
      const bPremium = b.subscription.status === 'active' ? 1 : 0;
      if (aPremium !== bPremium) return bPremium - aPremium;
      return (b.lastSignIn || '').localeCompare(a.lastSignIn || '');
    });

    return list;
  }, [users, filter, search]);

  const suspiciousUsers = useMemo(
    () => [...users].filter(u => u.suspicionScore >= 20).sort((a, b) => b.suspicionScore - a.suspicionScore),
    [users]
  );

  const premiumCount = users.filter(u => u.subscription.status === 'active').length;
  const blockedCount = users.filter(u => !!u.flags.blocked).length;

  // ─── Render guards ────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>⛔ Access denied</p>
        <button
          onClick={() => setPage({ name: 'home' })}
          style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, fontWeight: 700, background: 'var(--primary)', color: '#fff' }}
        >
          {t('common.back')}
        </button>
      </div>
    );
  }

  // ─── Tab content ──────────────────────────────────────────────────────────

  const renderTabContent = () => {
    if (loading && tab === 'users') {
      return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading...</div>;
    }

    if (tab === 'users') {
      return (
        <UsersList
          users={filteredUsers}
          updating={updating}
          onTogglePremium={togglePremium}
          onGrantPremium={grant30DayPremium}
          onToggleBlock={toggleBlock}
          onPurge={purgeTournaments}
          onPasswordReset={generatePasswordResetLink}
        />
      );
    }
    if (tab === 'suspicious') {
      return <SuspiciousList users={suspiciousUsers} onToggleBlock={toggleBlock} updating={updating} />;
    }
    if (tab === 'clubs') {
      return (
        <ClubsCatalogTab
          catalog={catalog}
          pending={pendingClubs}
          syncing={syncing}
          onSync={syncCatalog}
          onApprove={(id) => approvePending(id, true)}
          onReject={(id) => approvePending(id, false)}
          onDelete={deleteCatalogClub}
        />
      );
    }
    if (tab === 'stats') {
      return <StatsTab stats={stats} onRefresh={loadStats} />;
    }
    if (tab === 'clubRequests') {
      return (
        <ClubRequestsTab
          requests={clubRequests}
          updating={updating}
          onApprove={approveClubRequest}
          onReject={rejectClubRequest}
          onRefresh={loadClubRequests}
        />
      );
    }
    return null;
  };

  // ─── Layout ───────────────────────────────────────────────────────────────

  const tabBar = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <FilterPill active={tab === 'users'} onClick={() => setTab('users')} count={users.length}>{t('admin.tab.users')}</FilterPill>
      <FilterPill active={tab === 'suspicious'} onClick={() => setTab('suspicious')} count={suspiciousUsers.length}>⚠ {t('admin.tab.suspicious')}</FilterPill>
      <FilterPill active={tab === 'clubs'} onClick={() => setTab('clubs')} count={catalog.length}>🏟 {t('admin.tab.clubs')}</FilterPill>
      <FilterPill active={tab === 'clubRequests'} onClick={() => setTab('clubRequests')} count={clubRequests.filter(r => r.status === 'pending').length}>📬 {t('admin.tab.clubRequests')}</FilterPill>
      <FilterPill active={tab === 'stats'} onClick={() => setTab('stats')}>📊 {t('admin.tab.stats')}</FilterPill>
    </div>
  );

  if (isDesktop) {
    return (
      <DesktopPage
        title="Admin"
        subtitle={`${users.length} users · ${premiumCount} premium · ${blockedCount} blocked`}
        secondaryActions={
          <button onClick={loadUsers} style={desktopSecondaryButtonStyle} aria-label="Refresh">
            ↻ {t('admin.refresh')}
          </button>
        }
        filters={tabBar}
      >
        {error && (
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            {error}
          </div>
        )}
        {tab === 'users' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.search.placeholder')}
              style={{
                flex: '1 1 280px', padding: '10px 14px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface)',
                fontSize: 13, color: 'var(--text)',
              }}
            />
            <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} count={users.length}>All</FilterPill>
            <FilterPill active={filter === 'premium'} onClick={() => setFilter('premium')} count={premiumCount}>★ Premium</FilterPill>
            <FilterPill active={filter === 'free'} onClick={() => setFilter('free')} count={users.length - premiumCount}>Free</FilterPill>
            <FilterPill active={filter === 'blocked'} onClick={() => setFilter('blocked')} count={blockedCount}>⛔ Blocked</FilterPill>
          </div>
        )}
        {renderTabContent()}
      </DesktopPage>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => setPage({ name: 'settings' })}
          style={{ padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'var(--surface)', color: 'var(--text-muted)' }}
        >
          {t('common.back')}
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>🛡️ Admin</h1>
        <button
          onClick={loadUsers}
          aria-label="Refresh"
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: 'var(--surface)', color: 'var(--text-muted)' }}
        >
          ↻
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>{tabBar}</div>

      {tab === 'users' && (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.search.placeholder')}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
              fontSize: 13, color: 'var(--text)', marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} count={users.length}>All</FilterPill>
            <FilterPill active={filter === 'premium'} onClick={() => setFilter('premium')} count={premiumCount}>★</FilterPill>
            <FilterPill active={filter === 'free'} onClick={() => setFilter('free')} count={users.length - premiumCount}>Free</FilterPill>
            <FilterPill active={filter === 'blocked'} onClick={() => setFilter('blocked')} count={blockedCount}>⛔</FilterPill>
          </div>
        </>
      )}

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {renderTabContent()}
    </div>
  );
}

// ─── Users list (mobile-friendly cards) ─────────────────────────────────────

function UsersList({
  users, updating, onTogglePremium, onGrantPremium, onToggleBlock, onPurge, onPasswordReset,
}: {
  users: UserInfo[];
  updating: string | null;
  onTogglePremium: (u: UserInfo) => void;
  onGrantPremium: (u: UserInfo) => void;
  onToggleBlock: (u: UserInfo) => void;
  onPurge: (u: UserInfo) => void;
  onPasswordReset: (u: UserInfo) => void;
}) {
  const { t } = useI18n();
  if (users.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No users</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {users.map((user) => {
        const isPremium = user.subscription.status === 'active';
        const isBlocked = !!user.flags.blocked;
        const isCurrentAdmin = user.uid === ADMIN_UID;
        const isAnonymous = !user.displayName && !user.email;
        return (
          <div
            key={user.uid}
            style={{
              padding: '12px 14px', borderRadius: 14,
              background: isBlocked ? 'var(--warning-light)' : 'var(--surface)',
              border: isCurrentAdmin
                ? '1.5px solid var(--primary)'
                : isBlocked
                ? '1.5px solid #E65100'
                : '1px solid var(--border)',
              opacity: isAnonymous ? 0.7 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {user.photoURL ? (
                <img src={user.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--surface-var)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, color: 'var(--text-muted)',
                }}>
                  {(user.displayName || user.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.displayName || 'Anonymous'}
                  {isCurrentAdmin && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--primary)' }}>ADMIN</span>}
                  {isBlocked && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--warning)' }}>⛔ {t('admin.user.blocked')}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email || user.uid.substring(0, 12) + '...'}
                </div>
              </div>
              <span style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: isPremium ? 'var(--success-light)' : 'var(--surface-var)',
                color: isPremium ? 'var(--success)' : 'var(--text-muted)',
                border: isPremium ? '1px solid #2E7D32' : '1px solid var(--border)',
              }}>{isPremium ? '★' : 'Free'}</span>
            </div>

            {/* Activity stats */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
              marginTop: 10, fontSize: 11,
            }}>
              <Stat label={t('admin.user.tournaments')} value={user.activity.tournamentCount} />
              <Stat label={t('admin.user.matches')} value={user.activity.matchCount} />
              <Stat label={t('admin.user.trainings')} value={user.activity.trainingCount} />
              <Stat label={t('clubs.title')} value={user.activity.clubCount} />
              <Stat label={t('admin.user.storage')} value={formatBytes(user.activity.storageBytes)} />
            </div>

            {/* Actions */}
            {!isCurrentAdmin && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => onTogglePremium(user)}
                  disabled={updating === user.uid}
                  style={actionBtnStyle(isPremium ? 'neutral' : 'primary')}
                >
                  {isPremium ? t('admin.user.downgrade') : '★ ' + t('admin.user.upgrade')}
                </button>
                {!isPremium && (
                  <button
                    onClick={() => onGrantPremium(user)}
                    disabled={updating === user.uid}
                    style={actionBtnStyle('neutral')}
                  >
                    +30d
                  </button>
                )}
                <button
                  onClick={() => onToggleBlock(user)}
                  disabled={updating === user.uid}
                  style={actionBtnStyle(isBlocked ? 'neutral' : 'danger')}
                >
                  {isBlocked ? t('admin.user.unblock') : t('admin.user.block')}
                </button>
                {user.email && (
                  <button
                    onClick={() => onPasswordReset(user)}
                    disabled={updating === user.uid}
                    style={actionBtnStyle('neutral')}
                    title="Vygenerovat reset-password link (zkopírovaný do schránky)"
                  >
                    🔑
                  </button>
                )}
                {user.activity.tournamentCount > 0 && (
                  <button
                    onClick={() => onPurge(user)}
                    disabled={updating === user.uid}
                    style={actionBtnStyle('danger')}
                    title={t('admin.user.purge')}
                  >
                    🗑
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const actionBtnStyle = (variant: 'primary' | 'neutral' | 'danger'): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
  background: variant === 'primary' ? 'var(--primary)' : variant === 'danger' ? 'var(--danger-light)' : 'var(--surface-var)',
  color: variant === 'primary' ? '#fff' : variant === 'danger' ? 'var(--danger)' : 'var(--text)',
  border: variant === 'danger' ? '1px solid #C62828' : '1px solid var(--border)',
});

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      padding: '6px 8px', borderRadius: 8, background: 'var(--surface-var)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
    </div>
  );
}

// ─── Suspicious tab ─────────────────────────────────────────────────────────

function SuspiciousList({ users, onToggleBlock, updating }: {
  users: UserInfo[];
  onToggleBlock: (u: UserInfo) => void;
  updating: string | null;
}) {
  const { t } = useI18n();
  if (users.length === 0) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>{t('admin.suspicious.empty')}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{t('admin.suspicious.subtitle')}</p>
      {users.map((u) => {
        const severity = u.suspicionScore >= 60 ? 'high' : u.suspicionScore >= 40 ? 'mid' : 'low';
        const color = severity === 'high' ? 'var(--danger)' : severity === 'mid' ? 'var(--warning)' : '#F57F17';
        const bg = severity === 'high' ? 'var(--danger-light)' : severity === 'mid' ? 'var(--warning-light)' : '#FFFDE7';
        return (
          <div key={u.uid} style={{
            padding: 14, borderRadius: 14, background: bg, border: `1.5px solid ${color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                fontSize: 18, fontWeight: 800, color, padding: '4px 12px',
                borderRadius: 8, background: '#fff', border: `1px solid ${color}`,
              }}>{u.suspicionScore}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{u.displayName || 'Anonymous'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email || u.uid.substring(0, 16)}</div>
              </div>
              <button
                onClick={() => onToggleBlock(u)}
                disabled={updating === u.uid}
                style={actionBtnStyle(u.flags.blocked ? 'neutral' : 'danger')}
              >
                {u.flags.blocked ? t('admin.user.unblock') : t('admin.user.block')}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text)', marginBottom: 6 }}>
              <strong>{t('admin.suspicious.reasons')}:</strong>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {u.suspicionReasons.map((r, i) => <li key={i}>{r.replace(/_/g, ' ')}</li>)}
              </ul>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <Stat label={t('admin.user.tournaments')} value={u.activity.tournamentCount} />
              <Stat label="Max teams" value={u.activity.largestTournamentTeams} />
              <Stat label="Max matches" value={u.activity.largestTournamentMatches} />
              <Stat label={t('admin.user.storage')} value={formatBytes(u.activity.storageBytes)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Clubs catalog tab ──────────────────────────────────────────────────────

function ClubsCatalogTab({
  catalog, pending, syncing, onSync, onApprove, onReject, onDelete,
}: {
  catalog: CatalogClub[];
  pending: PendingClub[];
  syncing: boolean;
  onSync: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (c: CatalogClub) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const filtered = useMemo(
    () => catalog.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
                 .sort((a, b) => a.name.localeCompare(b.name))
                 .slice(0, 200),
    [catalog, q]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13,
            background: 'var(--primary)', color: '#fff', cursor: syncing ? 'wait' : 'pointer',
            opacity: syncing ? 0.6 : 1,
          }}
        >
          {syncing ? t('admin.clubs.syncing') : '↻ ' + t('admin.clubs.syncWikidata')}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {t('admin.clubs.totalCount', { count: String(catalog.length) })}
        </span>
      </div>

      {/* Pending submissions */}
      {pending.length > 0 && (
        <div style={{ padding: 12, borderRadius: 12, background: '#FFFDE7', border: '1px solid #FBC02D' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
            🕒 {t('admin.clubs.pendingTitle')} ({pending.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#fff', borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.city || '—'} · {p.submittedBy.substring(0, 10)}</div>
                </div>
                <button onClick={() => onApprove(p.id)} style={actionBtnStyle('primary')}>✓ {t('admin.clubs.approve')}</button>
                <button onClick={() => onReject(p.id)} style={actionBtnStyle('danger')}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + list */}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter…"
        style={{
          padding: '10px 14px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--surface)',
          fontSize: 13, color: 'var(--text)',
        }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {filtered.map((c) => (
          <div key={c.id} style={{
            padding: 10, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <label style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }}>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // Resize to max 128×128 and convert to base64
                  const canvas = document.createElement('canvas');
                  const img = new Image();
                  img.onload = async () => {
                    const size = 128;
                    const scale = Math.min(size / img.width, size / img.height, 1);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const base64 = canvas.toDataURL('image/png', 0.8);
                    await dbSet(dbRef(db, `clubsCatalog/${c.id}/logoBase64`), base64);
                  };
                  img.src = URL.createObjectURL(file);
                }}
              />
              {(c.logoBase64 || c.logoUrl) ? (
                <img src={c.logoBase64 || c.logoUrl} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6 }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface-var)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--text-muted)' }}>📷</div>
              )}
            </label>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {c.city || '—'} · {t(SOURCE_LABEL_KEYS[c.source])}
                {c.founded && ` · ${c.founded}`}
              </div>
            </div>
            <button
              onClick={() => onDelete(c)}
              style={{
                padding: '4px 8px', borderRadius: 6, background: 'transparent',
                color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stats dashboard tab ────────────────────────────────────────────────────

function StatsTab({ stats, onRefresh }: { stats: SystemStats | null; onRefresh: () => void }) {
  const { t } = useI18n();
  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
        Loading… <button onClick={onRefresh}>↻</button>
      </div>
    );
  }

  const cardStyle: React.CSSProperties = {
    padding: 16, borderRadius: 14, background: 'var(--surface)',
    border: '1px solid var(--border)',
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--text-muted)', fontWeight: 800, marginBottom: 10,
  };
  const bigNum: React.CSSProperties = { fontSize: 28, fontWeight: 800, lineHeight: 1.1 };
  const smallLabel: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Users */}
      <div style={cardStyle}>
        <div style={sectionTitle}>👥 {t('admin.stats.users')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
          <div><div style={bigNum}>{stats.users.total}</div><div style={smallLabel}>{t('admin.stats.totalUsers')}</div></div>
          <div><div style={{ ...bigNum, color: 'var(--success)' }}>{stats.users.dau}</div><div style={smallLabel}>{t('admin.stats.dau')}</div></div>
          <div><div style={bigNum}>{stats.users.wau}</div><div style={smallLabel}>{t('admin.stats.wau')}</div></div>
          <div><div style={bigNum}>{stats.users.mau}</div><div style={smallLabel}>{t('admin.stats.mau')}</div></div>
          <div><div style={{ ...bigNum, color: '#FFA000' }}>{stats.users.premium}</div><div style={smallLabel}>{t('admin.stats.premium')}</div></div>
          <div><div style={bigNum}>{stats.users.anon}</div><div style={smallLabel}>{t('admin.stats.anonymous')}</div></div>
          <div><div style={bigNum}>+{stats.users.newToday}</div><div style={smallLabel}>{t('admin.stats.newToday')}</div></div>
          <div><div style={bigNum}>+{stats.users.newThisWeek}</div><div style={smallLabel}>{t('admin.stats.newWeek')}</div></div>
        </div>
      </div>

      {/* Tournaments */}
      <div style={cardStyle}>
        <div style={sectionTitle}>🏆 {t('admin.stats.tournaments')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
          <div><div style={bigNum}>{stats.tournaments.total}</div><div style={smallLabel}>{t('admin.stats.tournamentsTotal')}</div></div>
          <div><div style={{ ...bigNum, color: 'var(--success)' }}>{stats.tournaments.active}</div><div style={smallLabel}>{t('admin.stats.tournamentsActive')}</div></div>
          <div><div style={{ ...bigNum, color: 'var(--danger)' }}>● {stats.tournaments.liveNow}</div><div style={smallLabel}>{t('admin.stats.tournamentsLive')}</div></div>
          <div><div style={bigNum}>{stats.tournaments.finished}</div><div style={smallLabel}>{t('admin.stats.tournamentsFinished')}</div></div>
        </div>
      </div>

      {/* Conversion + storage */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={cardStyle}>
          <div style={sectionTitle}>💎 {t('admin.stats.conversion')}</div>
          <div style={{ ...bigNum, color: '#FFA000' }}>{stats.conversion}%</div>
        </div>
        <div style={cardStyle}>
          <div style={sectionTitle}>💾 {t('admin.stats.storage')}</div>
          <div style={bigNum}>{formatBytes(stats.storageBytes)}</div>
        </div>
      </div>

      {/* Firebase Quota */}
      {stats.sparkLimits && (
        <div style={cardStyle}>
          <div style={sectionTitle}>🔥 {t('admin.stats.firebaseQuota')}</div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            {t('admin.stats.firebaseQuotaHint')}
          </p>

          <QuotaBar
            label={t('admin.stats.quota.rtdbStorage')}
            current={stats.storageBytes}
            limit={stats.sparkLimits.rtdbStorageBytes}
            format={formatBytes}
            measured
          />
          <QuotaBar
            label={t('admin.stats.quota.rtdbBandwidth')}
            current={stats.estimates?.rtdbBandwidthMonthBytes ?? 0}
            limit={stats.sparkLimits.rtdbBandwidthMonthBytes}
            format={formatBytes}
          />
          <QuotaBar
            label={t('admin.stats.quota.functionsInvocations')}
            current={stats.estimates?.functionsInvocationsMonth ?? 0}
            limit={stats.sparkLimits.functionsInvocationsMonth}
            format={(n) => n.toLocaleString()}
          />
          <QuotaBar
            label={t('admin.stats.quota.connections')}
            current={stats.tournaments.liveNow}
            limit={stats.sparkLimits.rtdbConnections}
            format={(n) => `${n}`}
          />

          {/* Storage breakdown */}
          {stats.storageBreakdown && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                {t('admin.stats.quota.breakdown')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                {Object.entries(stats.storageBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([k, v]) => (
                    <div key={k} style={{
                      padding: '6px 10px', borderRadius: 8, background: 'var(--surface-var)',
                      fontSize: 11, display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                      <span style={{ fontWeight: 700 }}>{formatBytes(v)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            <a
              href="https://console.firebase.google.com/project/tourniquet-7a123/usage"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--primary)', textDecoration: 'underline' }}
            >
              {t('admin.stats.quota.openConsole')} →
            </a>
          </div>
        </div>
      )}

      {/* First-party analytika — viral funnel (audit 2026-06-10) */}
      <AnalyticsSection cardStyle={cardStyle} sectionTitle={sectionTitle} />

      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>
        {t('admin.stats.generatedAt')}: {new Date(stats.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}

// ─── First-party analytika (audit 2026-06-10) ───────────────────────────────
// Čte /analytics/{YYYY-MM-DD} (posledních 14 dní) — anonymní denní čítače
// zapisované klientem (services/analytics.ts). Rules: read jen admin.

const FUNNEL_EVENTS: { key: string; emoji: string }[] = [
  { key: 'public_match_view', emoji: '👀' },
  { key: 'public_tournament_view', emoji: '🏟️' },
  { key: 'viral_match_cta_click', emoji: '🖱️' },
  { key: 'viral_tournament_cta_click', emoji: '🖱️' },
  { key: 'ref_public_match', emoji: '🧲' },
  { key: 'ref_public_tournament', emoji: '🧲' },
  { key: 'ref_registration', emoji: '🧲' },
  { key: 'app_open', emoji: '🚪' },
  { key: 'match_created', emoji: '⚽' },
  { key: 'match_started', emoji: '▶️' },
  { key: 'match_finished', emoji: '🏁' },
  { key: 'tournament_created', emoji: '🏆' },
  { key: 'donate_click', emoji: '☕' },
];

function AnalyticsSection({ cardStyle, sectionTitle }: {
  cardStyle: React.CSSProperties;
  sectionTitle: React.CSSProperties;
}) {
  const { t } = useI18n();
  const [days, setDays] = useState<Record<string, Record<string, number>> | null>(null);

  useEffect(() => {
    // Realtime subscribe na celý /analytics uzel — pro beta objem (jednotky
    // dní × desítky klíčů) je to levné; až poroste, přepneme na range query.
    const r = dbRef(db, 'analytics');
    const unsub = onValue(r, snap => {
      setDays((snap.val() as Record<string, Record<string, number>>) ?? {});
    }, () => setDays({}));
    return () => unsub();
  }, []);

  const { dayKeys, eventKeys, totals } = useMemo(() => {
    const all = days ?? {};
    // Filtr na <= dnes — rules pustí i fiktivní budoucí datumy ('9999-12-31'),
    // které by jinak vytlačily reálná data z 14denního okna (review finding).
    const today = new Date().toISOString().slice(0, 10);
    const dk = Object.keys(all).filter(d => d <= today).sort().reverse().slice(0, 14);
    // Sloupce: známé funnel eventy první (v definovaném pořadí), pak neznámé.
    const present = new Set<string>();
    for (const d of dk) for (const e of Object.keys(all[d] ?? {})) present.add(e);
    const known = FUNNEL_EVENTS.map(f => f.key).filter(k => present.has(k));
    const unknown = [...present].filter(k => !known.includes(k)).sort();
    const ek = [...known, ...unknown];
    const tot: Record<string, number> = {};
    for (const e of ek) tot[e] = dk.reduce((s, d) => s + (all[d]?.[e] ?? 0), 0);
    return { dayKeys: dk, eventKeys: ek, totals: tot };
  }, [days]);

  if (days === null) return null;

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>📈 {t('admin.analytics.title')}</div>
      {dayKeys.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('admin.analytics.empty')}
        </div>
      ) : (
        <>
          {/* Souhrn 14 dní */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6, marginBottom: 12 }}>
            {eventKeys.map(e => {
              const meta = FUNNEL_EVENTS.find(f => f.key === e);
              return (
                <div key={e} style={{
                  padding: '6px 10px', borderRadius: 8, background: 'var(--surface-var)',
                  fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 6,
                }}>
                  <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {meta?.emoji ?? '·'} {e}
                  </span>
                  <span style={{ fontWeight: 700 }}>{totals[e]}</span>
                </div>
              );
            })}
          </div>
          {/* Tabulka per den */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 700 }}>
                    {t('admin.analytics.day')}
                  </th>
                  {eventKeys.map(e => (
                    <th key={e} title={e} style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 700, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {FUNNEL_EVENTS.find(f => f.key === e)?.emoji ?? ''} {e.replace(/^(public_|viral_|ref_)/, '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dayKeys.map(d => (
                  <tr key={d} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{d.slice(5)}</td>
                    {eventKeys.map(e => {
                      const v = days[d]?.[e] ?? 0;
                      return (
                        <td key={e} style={{ textAlign: 'right', padding: '4px 6px', color: v > 0 ? 'var(--text)' : 'var(--text-muted)', fontWeight: v > 0 ? 700 : 400 }}>
                          {v || '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Quota progress bar ─────────────────────────────────────────────────────

function QuotaBar({
  label, current, limit, format, measured,
}: {
  label: string;
  current: number;
  limit: number;
  format: (n: number) => string;
  measured?: boolean;
}) {
  const pct = Math.min(100, (current / limit) * 100);
  const color = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : pct >= 40 ? '#F9A825' : 'var(--success)';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 700 }}>
          {label}
          {!measured && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>(odhad)</span>}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          {format(current)} <span style={{ opacity: 0.5 }}>/ {format(limit)}</span>
          <span style={{ marginLeft: 8, fontWeight: 700, color }}>{pct.toFixed(1)}%</span>
        </span>
      </div>
      <div style={{
        height: 8, borderRadius: 6, background: 'var(--surface-var)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: color, transition: 'width .3s',
        }} />
      </div>
    </div>
  );
}

// ─── Club Requests Tab (Etapa 1 — shared clubs) ──────────────────────────

interface ClubRequestsTabProps {
  requests: ClubRequestItem[];
  updating: string | null;
  onApprove: (req: ClubRequestItem) => void;
  onReject: (req: ClubRequestItem) => void;
  onRefresh: () => void;
}

function ClubRequestsTab({
  requests,
  updating,
  onApprove,
  onReject,
  onRefresh,
}: ClubRequestsTabProps) {
  const { t } = useI18n();
  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending').slice(0, 20);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Pending requests */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{t('admin.clubRequests.title')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('admin.clubRequests.subtitle')}</div>
          </div>
          <button
            onClick={onRefresh}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'var(--surface)', border: '1px solid var(--divider)', cursor: 'pointer',
            }}
          >
            ↻
          </button>
        </div>

        {pending.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {t('admin.clubRequests.empty')}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {pending.map(req => (
              <div key={req.id} style={{
                padding: 14, borderRadius: 12, background: 'var(--surface)',
                border: '1px solid var(--divider)',
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{req.catalogName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {t('admin.clubRequests.requester')}: <strong>{req.requesterName}</strong> · {req.requesterRole}
                </div>
                {req.evidenceUrl && (
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    {t('admin.clubRequests.evidence')}: <a href={req.evidenceUrl} target="_blank" rel="noreferrer">{req.evidenceUrl}</a>
                  </div>
                )}
                {req.facrId && (
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    {t('admin.clubRequests.facrId')}: {req.facrId}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {new Date(req.createdAt).toLocaleString()} · UID: <code>{req.requesterUid.slice(0, 8)}…</code>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => onApprove(req)}
                    disabled={updating === req.id}
                    style={{
                      padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                      background: 'var(--success)', color: '#fff', border: 'none', cursor: 'pointer',
                    }}
                  >
                    ✓ {t('admin.clubRequests.approve')}
                  </button>
                  <button
                    onClick={() => onReject(req)}
                    disabled={updating === req.id}
                    style={{
                      padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                      background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer',
                    }}
                  >
                    ✗ {t('admin.clubRequests.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Resolved ({resolved.length})
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {resolved.map(req => (
                <div key={req.id} style={{
                  padding: 10, borderRadius: 8, background: 'var(--surface-var)',
                  fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span>
                    {req.status === 'approved' ? '✅' : '❌'} {req.catalogName} — {req.requesterName}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {req.resolvedAt ? new Date(req.resolvedAt).toLocaleDateString() : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
