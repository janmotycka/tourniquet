import type { ReactNode } from 'react';
import { useSubscriptionStore } from '../store/subscription.store';
import { useI18n } from '../i18n';
import { PREMIUM_ENABLED } from '../types/feature-flags';

interface Props {
  /** How many resources the user already has */
  currentCount: number;
  /** Max allowed from getLimits() */
  maxAllowed: number;
  /** Content shown when limit is not exceeded */
  children: ReactNode;
  /** Callback for upgrade */
  onUpgrade?: () => void;
  /** Feature label for display (e.g. "turnajů", "trainings") */
  featureLabel?: string;
}

export function FeatureGate({ currentCount, maxAllowed, children, onUpgrade, featureLabel }: Props) {
  const isPremium = useSubscriptionStore(s => s.isPremium);
  const { t } = useI18n();

  // Premium users have no limits
  if (isPremium() || currentCount < maxAllowed) {
    return <>{children}</>;
  }

  // Audit 2026-06-10: PREMIUM_ENABLED=false → limit zůstává (anti-abuse),
  // ale místo prodejní copy poctivá beta zpráva s kontaktem. Nikdo neuvízne:
  // napíše mail a limit mu (ručně, admin panel) navýšíme.
  if (!PREMIUM_ENABLED) {
    return (
      <div style={{
        background: 'var(--surface-var)',
        borderRadius: 16, padding: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', textAlign: 'center' }}>
          {t('gate.limitReached')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
          {t('gate.limitDesc', { count: String(maxAllowed), label: featureLabel ?? '' })}
          <br />
          {t('gate.betaContactDesc')}
        </div>
        <a
          href="mailto:jan@torq.cz?subject=TORQ%20beta%20%E2%80%94%20nav%C3%BD%C5%A1en%C3%AD%20limitu"
          style={{
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
            padding: '10px 24px', borderRadius: 12, marginTop: 2,
            textDecoration: 'none', boxShadow: 'var(--shadow-sm)',
          }}
        >
          ✉️ {t('gate.betaContactBtn')}
        </a>
      </div>
    );
  }

  // Free user exceeded limit (PREMIUM_ENABLED=true → prodejní gate)
  return (
    <div style={{
      background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
      borderRadius: 16, padding: 20,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      border: '1.5px solid #FFB74D',
    }}>
      <div style={{ fontSize: 36 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--warning)', textAlign: 'center' }}>
        {t('gate.limitReached')}
      </div>
      <div style={{ fontSize: 14, color: '#BF360C', textAlign: 'center', lineHeight: 1.5 }}>
        {t('gate.limitDesc', { count: String(maxAllowed), label: featureLabel ?? '' })}
        <br />
        {t('gate.upgradeDesc', { price: t('subscription.price') })}
      </div>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          style={{
            background: 'linear-gradient(135deg, #E65100 0%, #FF6F00 100%)',
            color: '#fff', fontWeight: 700, fontSize: 15,
            padding: '12px 28px', borderRadius: 12, marginTop: 4,
            boxShadow: '0 4px 12px rgba(230,81,0,.3)',
          }}
        >
          {t('gate.tryFree')}
        </button>
      )}
    </div>
  );
}
