import { useState } from 'react';
import type { Page } from '../App';
import { useAuth } from '../context/AuthContext';
import { useSubscriptionStore } from '../store/subscription.store';
import { useTournamentStore } from '../store/tournament.store';
import { useI18n, getCurrencyForLocale } from '../i18n';
import type { Locale } from '../i18n';

interface Props { navigate: (p: Page) => void; }

/** Diagnostický panel — testuje Firebase write/read a zobrazuje stav */
function FirebaseDiagnostics({ user, t: _t }: { user: { uid: string; email?: string | null } | null; t: (k: string, p?: Record<string, string | number>) => string }) {
  const syncError = useTournamentStore(s => s.syncError);
  const tournaments = useTournamentStore(s => s.tournaments);
  const loadFromFirebase = useTournamentStore(s => s.loadFromFirebase);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    if (!user) { setTestResult('Nejste přihlášen.'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      // Test 1: write to a temp node
      const { ref, set, get, remove } = await import('firebase/database');
      const { db } = await import('../firebase');
      const testRef = ref(db, `_diagnostics/${user.uid}`);
      await set(testRef, { test: true, ts: Date.now() });

      // Test 2: read it back
      const snap = await get(testRef);
      if (!snap.exists()) {
        setTestResult('CHYBA: Zápis se zdá OK, ale čtení vrátilo prázdný výsledek. Zkontrolujte Firebase Rules.');
        setTesting(false);
        return;
      }

      // Test 3: cleanup
      await remove(testRef);

      // Test 4: try writing to /public path (same as tournament sync)
      const publicTestRef = ref(db, `public/_test_${user.uid}`);
      await set(publicTestRef, { test: true, ts: Date.now() });
      const publicSnap = await get(publicTestRef);
      await remove(publicTestRef);

      if (!publicSnap.exists()) {
        setTestResult('CHYBA: Zápis do /public selhal. Zkontrolujte Firebase Rules pro cestu /public.');
        setTesting(false);
        return;
      }

      // Test 5: try /tournaments/{uid} path
      const tournamentTestRef = ref(db, `tournaments/${user.uid}/_test`);
      await set(tournamentTestRef, { test: true, ts: Date.now() });
      const tournamentSnap = await get(tournamentTestRef);
      await remove(tournamentTestRef);

      if (!tournamentSnap.exists()) {
        setTestResult('CHYBA: Zápis do /tournaments/{uid} selhal. Zkontrolujte Firebase Rules.');
        setTesting(false);
        return;
      }

      setTestResult(`OK — všechny testy prošly. Firebase je správně nakonfigurován. UID: ${user.uid}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult(`CHYBA: ${msg}\n\nZkontrolujte Firebase Realtime Database → Rules v konzoli.`);
    } finally {
      setTesting(false);
    }
  };

  const handleReload = async () => {
    if (!user) return;
    setTesting(true);
    try {
      await loadFromFirebase(user.uid);
      setTestResult(`Načteno ${useTournamentStore.getState().tournaments.length} turnajů z Firebase.`);
    } catch (err) {
      setTestResult(`Chyba při načítání: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16, padding: 20,
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.firebaseDiag')}</h2>

      {/* Current state */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        UID: <code style={{ fontSize: 11, background: 'var(--surface-var)', padding: '2px 6px', borderRadius: 4 }}>{user?.uid ?? 'nepřihlášen'}</code><br />
        Lokální turnaje: {tournaments.length}
      </div>

      {/* Sync error */}
      {syncError && (
        <div style={{
          background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 10,
          padding: '10px 14px', fontSize: 12, color: '#BF360C', lineHeight: 1.4,
        }}>
          <strong>{t('settings.lastError')}</strong> {syncError}
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div style={{
          background: testResult.startsWith('OK') ? '#E8F5E9' : '#FFEBEE',
          border: `1px solid ${testResult.startsWith('OK') ? '#A5D6A7' : '#EF9A9A'}`,
          borderRadius: 10, padding: '10px 14px', fontSize: 12,
          color: testResult.startsWith('OK') ? '#1B5E20' : '#B71C1C',
          lineHeight: 1.5, whiteSpace: 'pre-wrap',
        }}>
          {testResult}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={runTest}
          disabled={testing}
          style={{
            flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 13,
            background: 'var(--primary-light)', color: 'var(--primary)',
            opacity: testing ? 0.6 : 1,
          }}
        >
          {testing ? 'Testuji...' : 'Test Firebase'}
        </button>
        <button
          onClick={handleReload}
          disabled={testing}
          style={{
            flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 13,
            background: 'var(--surface-var)', color: 'var(--text)',
            opacity: testing ? 0.6 : 1,
          }}
        >
          Znovu načíst
        </button>
      </div>
    </div>
  );
}

export function SettingsPage({ navigate }: Props) {
  const { user, logout } = useAuth();
  const subscription = useSubscriptionStore(s => s.subscription);
  const isPremium = useSubscriptionStore(s => s.isPremium);
  const createCheckoutSession = useSubscriptionStore(s => s.createCheckoutSession);
  const openCustomerPortal = useSubscriptionStore(s => s.openCustomerPortal);
  const { t, locale, setLocale } = useI18n();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = async () => {
    setLoading(true);
    setError('');
    try {
      const currency = getCurrencyForLocale(locale);
      const url = await createCheckoutSession(currency);
      if (url) {
        window.location.href = url;
      } else {
        setError(t('settings.checkoutError'));
      }
    } catch {
      setError(t('settings.stripeError'));
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);
    setError('');
    try {
      const url = await openCustomerPortal();
      if (url) {
        window.location.href = url;
      } else {
        setError(t('settings.portalError'));
      }
    } catch {
      setError(t('settings.stripeError'));
    } finally {
      setLoading(false);
    }
  };

  const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
    free:      { label: t('settings.statusFree'),      color: '#5D4037', bg: '#EFEBE9' },
    active:    { label: t('settings.statusActive'),    color: '#1B5E20', bg: '#E8F5E9' },
    past_due:  { label: t('settings.statusPastDue'),   color: '#E65100', bg: '#FFF3E0' },
    cancelled: { label: t('settings.statusCancelled'), color: '#B71C1C', bg: '#FFEBEE' },
  };
  const st = statusLabels[subscription.status] ?? statusLabels.free;

  const dateLocale = locale === 'cs' ? 'cs-CZ' : 'en-US';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <button onClick={() => navigate({ name: 'home' })} style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
          fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>{t('settings.title')}</h1>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Language / Jazyk */}
        <div style={{
          background: 'var(--surface)', borderRadius: 16, padding: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,.06)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.language')}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['cs', '🇨🇿 Čeština'], ['en', '🇬🇧 English']] as [Locale, string][]).map(([loc, label]) => (
              <button
                key={loc}
                onClick={() => setLocale(loc)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12, fontWeight: 600, fontSize: 14,
                  background: locale === loc ? 'var(--primary)' : 'var(--surface-var)',
                  color: locale === loc ? '#fff' : 'var(--text)',
                  border: locale === loc ? 'none' : '1.5px solid var(--border)',
                  transition: 'all .15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Profil */}
        <div style={{
          background: 'var(--surface)', borderRadius: 16, padding: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,.06)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.profile')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: 'var(--primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              }}>⚽</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{user?.displayName ?? t('settings.coach')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email ?? ''}
              </div>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div style={{
          background: 'var(--surface)', borderRadius: 16, padding: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,.06)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.subscription')}</h2>
            <span style={{
              background: st.bg, color: st.color, fontSize: 12, fontWeight: 700,
              padding: '4px 12px', borderRadius: 8,
            }}>{st.label}</span>
          </div>

          {isPremium() ? (
            <>
              <div style={{
                background: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)',
                borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1B5E20' }}>
                  {t('settings.premiumActive')}
                </div>
                <div style={{ fontSize: 13, color: '#2E7D32', lineHeight: 1.5 }}>
                  {t('settings.premiumDesc')}
                </div>
                {subscription.currentPeriodEnd && (
                  <div style={{ fontSize: 12, color: '#388E3C', marginTop: 4 }}>
                    {subscription.cancelAtPeriodEnd ? t('settings.endsAt') : t('settings.renewsAt')}: {new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale, {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={handleManageSubscription}
                disabled={loading}
                style={{
                  background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
                  fontSize: 15, padding: '12px', borderRadius: 12,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? t('common.loading') : t('settings.manageSubscription')}
              </button>
            </>
          ) : (
            <>
              <div style={{
                background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
                borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#E65100' }}>
                  {t('settings.freePlan')}
                </div>
                <div style={{ fontSize: 13, color: '#BF360C', lineHeight: 1.5 }}>
                  {t('settings.freePlanDesc')}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#E65100', marginTop: 4 }}>
                  {t('settings.premiumOffer', { price: t('subscription.price') })}
                </div>
                <div style={{ fontSize: 12, color: '#BF360C', lineHeight: 1.5 }}>
                  • {t('settings.premiumFeature1')}{'\n'}
                  • {t('settings.premiumFeature2')}{'\n'}
                  • {t('settings.premiumFeature3')}{'\n'}
                  • {t('settings.premiumFeature4')}
                </div>
              </div>
              <button
                onClick={handleSubscribe}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #E65100 0%, #FF6F00 100%)',
                  color: '#fff', fontWeight: 700, fontSize: 16,
                  padding: '14px', borderRadius: 12,
                  boxShadow: '0 4px 12px rgba(230,81,0,.3)',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? t('settings.connecting') : t('settings.tryFree')}
              </button>
            </>
          )}

          {error && (
            <div style={{
              background: '#FFEBEE', color: '#B71C1C', fontSize: 13, fontWeight: 600,
              padding: '8px 12px', borderRadius: 8, textAlign: 'center',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Firebase diagnostics */}
        <FirebaseDiagnostics user={user} t={t} />

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            background: 'var(--surface)', color: '#B71C1C', fontWeight: 600,
            fontSize: 15, padding: '14px', borderRadius: 14,
            border: '1.5px solid #FFCDD2',
          }}
        >
          {t('settings.logout')}
        </button>

      </div>
    </div>
  );
}
