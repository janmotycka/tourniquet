import type { Page } from '../App';
import { useAuth } from '../context/AuthContext';
import { useSubscriptionStore } from '../store/subscription.store';
import { useI18n } from '../i18n';

interface Props { navigate: (p: Page) => void; }

export function HomePage({ navigate }: Props) {
  const { user } = useAuth();
  const isPremium = useSubscriptionStore(s => s.isPremium);
  const { t } = useI18n();

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '24px 20px', gap: 20, overflowY: 'auto', paddingBottom: 40,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, background: 'var(--primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0,
        }}>
          ⚽
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{t('home.greeting')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.displayName ?? user?.email ?? t('home.loggedIn')}
          </p>
        </div>
        <button
          onClick={() => navigate({ name: 'settings' })}
          title={t('home.settings')}
          style={{
            flexShrink: 0, width: 40, height: 40, borderRadius: 12,
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ⚙️
        </button>
      </div>

      {/* Upgrade CTA banner for free users */}
      {!isPremium() && (
        <button
          onClick={() => navigate({ name: 'settings' })}
          style={{
            background: 'linear-gradient(135deg, #FFF8E1 0%, #FFE082 100%)',
            borderRadius: 14, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            border: '1.5px solid #FFD54F', width: '100%',
          }}
        >
          <span style={{ fontSize: 28, flexShrink: 0 }}>⭐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#E65100' }}>
              {t('home.premiumBanner')}
            </div>
            <div style={{ fontSize: 12, color: '#BF360C', marginTop: 2, lineHeight: 1.4 }}>
              {t('home.premiumBannerSub')} {t('subscription.price')}
            </div>
          </div>
          <span style={{ fontSize: 16, color: '#E65100' }}>→</span>
        </button>
      )}

      {/* Module cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ⚽ Training */}
        <button
          onClick={() => navigate({ name: 'training-home' })}
          style={{
            background: 'var(--primary)', borderRadius: 22, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(var(--primary-rgb, 0,100,0),.20)', width: '100%',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 44 }}>⚽</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>{t('home.training')}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              {t('home.trainingDesc')}
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 16px',
            fontWeight: 700, fontSize: 15, textAlign: 'center',
          }}>
            {t('common.open')}
          </div>
        </button>

        {/* 🏆 Tournament */}
        <button
          onClick={() => navigate({ name: 'tournament-list' })}
          style={{
            background: 'linear-gradient(135deg, #E65100 0%, #FF6F00 100%)',
            borderRadius: 22, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(230,81,0,.25)', width: '100%',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 44 }}>🏆</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>{t('home.tournament')}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              {t('home.tournamentDesc')}
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 16px',
            fontWeight: 700, fontSize: 15, textAlign: 'center',
          }}>
            {t('common.open')}
          </div>
        </button>

        {/* 📋 Match */}
        <button
          onClick={() => navigate({ name: 'match-list' })}
          style={{
            background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
            borderRadius: 22, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(21,101,192,.25)', width: '100%',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 44 }}>📋</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>{t('home.match')}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              {t('home.matchDesc')}
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 16px',
            fontWeight: 700, fontSize: 15, textAlign: 'center',
          }}>
            {t('common.open')}
          </div>
        </button>

      </div>

      {/* Disabled club module chip */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--surface)', borderRadius: 20, padding: '10px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,.06)', opacity: 0.55,
          border: '1.5px dashed var(--border)',
        }}>
          <span style={{ fontSize: 18 }}>🏟</span>
          <div>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{t('home.club')}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>{t('common.soon')}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
