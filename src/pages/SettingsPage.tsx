import { useState } from 'react';
import type { Page } from '../App';
import { useAuth } from '../context/AuthContext';
import { useSubscriptionStore } from '../store/subscription.store';
import { useI18n, getCurrencyForLocale } from '../i18n';
import type { Locale } from '../i18n';
import { useTheme } from '../theme/ThemeContext';
import type { ThemePreference } from '../theme/ThemeContext';

interface Props { navigate: (p: Page) => void; }

export function SettingsPage({ navigate }: Props) {
  const { user, logout } = useAuth();
  const subscription = useSubscriptionStore(s => s.subscription);
  const isPremium = useSubscriptionStore(s => s.isPremium);
  const createCheckoutSession = useSubscriptionStore(s => s.createCheckoutSession);
  const openCustomerPortal = useSubscriptionStore(s => s.openCustomerPortal);
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

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

        {/* Theme / Vzhled */}
        <div style={{
          background: 'var(--surface)', borderRadius: 16, padding: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,.06)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.theme')}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['light', t('settings.themeLight')], ['dark', t('settings.themeDark')], ['auto', t('settings.themeAuto')]] as [ThemePreference, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTheme(val)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12, fontWeight: 600, fontSize: 14,
                  background: theme === val ? 'var(--primary)' : 'var(--surface-var)',
                  color: theme === val ? '#fff' : 'var(--text)',
                  border: theme === val ? 'none' : '1.5px solid var(--border)',
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
