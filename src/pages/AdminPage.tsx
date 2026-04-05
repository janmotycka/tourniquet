import { useState, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../firebase';
import { useI18n } from '../i18n';
import { usePageStore } from '../store/page.store';

const ADMIN_UID = 'EmIOqHuZVaWVbWN0imh6D1cttAf1';

interface UserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  lastSignIn: string | null;
  subscription: { status: string; plan: string };
}

type Filter = 'all' | 'premium' | 'free';

export function AdminPage() {
  const { t } = useI18n();
  const setPage = usePageStore(s => s.setPage);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const currentUid = auth.currentUser?.uid;
  const isAdmin = currentUid === ADMIN_UID;

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
  }, [isAdmin]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const listUsers = httpsCallable<unknown, { users: UserInfo[] }>(functions, 'adminListUsers');
      const result = await listUsers({});
      setUsers(result.data.users);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const togglePremium = async (user: UserInfo) => {
    const isPremium = user.subscription.status === 'active';
    const newStatus = isPremium ? 'free' : 'active';
    const newPlan = isPremium ? 'free' : 'premium';

    try {
      setUpdating(user.uid);
      const setSubscription = httpsCallable(functions, 'adminSetSubscription');
      await setSubscription({ targetUid: user.uid, status: newStatus, plan: newPlan });
      setUsers(prev => prev.map(u =>
        u.uid === user.uid
          ? { ...u, subscription: { status: newStatus, plan: newPlan } }
          : u
      ));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update subscription');
    } finally {
      setUpdating(null);
    }
  };

  // Sort: admin first, then premium, then named users, anonymous last
  const sortedAndFiltered = useMemo(() => {
    let list = [...users];

    // Filter
    if (filter === 'premium') list = list.filter(u => u.subscription.status === 'active');
    if (filter === 'free') list = list.filter(u => u.subscription.status !== 'active');

    // Sort
    list.sort((a, b) => {
      // Admin always first
      if (a.uid === ADMIN_UID) return -1;
      if (b.uid === ADMIN_UID) return 1;
      // Premium before free
      const aPremium = a.subscription.status === 'active' ? 1 : 0;
      const bPremium = b.subscription.status === 'active' ? 1 : 0;
      if (aPremium !== bPremium) return bPremium - aPremium;
      // Named before anonymous
      const aAnon = !a.displayName && !a.email ? 1 : 0;
      const bAnon = !b.displayName && !b.email ? 1 : 0;
      if (aAnon !== bAnon) return aAnon - bAnon;
      // By last sign in
      return (b.lastSignIn || '').localeCompare(a.lastSignIn || '');
    });

    return list;
  }, [users, filter]);

  const premiumCount = users.filter(u => u.subscription.status === 'active').length;

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

  return (
    <div style={{ padding: '16px' }}>
      {/* Header */}
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

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {([
          { key: 'all' as Filter, label: `All (${users.length})` },
          { key: 'premium' as Filter, label: `★ Premium (${premiumCount})` },
          { key: 'free' as Filter, label: `Free (${users.length - premiumCount})` },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 12,
              background: filter === tab.key ? 'var(--primary)' : 'var(--surface)',
              color: filter === tab.key ? '#fff' : 'var(--text-muted)',
              border: filter === tab.key ? 'none' : '1px solid var(--border)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: '#FFEBEE', color: '#C62828', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedAndFiltered.map(user => {
            const isPremium = user.subscription.status === 'active';
            const isCurrentUser = user.uid === ADMIN_UID;
            const isAnonymous = !user.displayName && !user.email;
            return (
              <div
                key={user.uid}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 14,
                  background: 'var(--surface)',
                  border: isCurrentUser ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                  opacity: isAnonymous ? 0.6 : 1,
                }}
              >
                {/* Avatar */}
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--surface-var)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: 'var(--text-muted)',
                  }}>
                    {(user.displayName || user.email || '?')[0].toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.displayName || 'Anonymous'}
                    {isCurrentUser && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--primary)' }}>ADMIN</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.email || user.uid.substring(0, 12) + '...'}
                  </div>
                </div>

                {/* Premium toggle */}
                <button
                  onClick={() => togglePremium(user)}
                  disabled={updating === user.uid}
                  style={{
                    padding: '6px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12,
                    flexShrink: 0, cursor: updating === user.uid ? 'wait' : 'pointer',
                    background: isPremium ? '#E8F5E9' : 'var(--surface-var)',
                    color: isPremium ? '#2E7D32' : 'var(--text-muted)',
                    border: isPremium ? '1.5px solid #2E7D32' : '1px solid var(--border)',
                    opacity: updating === user.uid ? 0.5 : 1,
                  }}
                >
                  {updating === user.uid ? '...' : isPremium ? '★ Premium' : 'Free'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
