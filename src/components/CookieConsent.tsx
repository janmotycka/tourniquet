import { useState } from 'react';
import { useI18n } from '../i18n';

const STORAGE_KEY = 'torq_consent';

export function CookieConsent({ onPrivacyPolicy }: { onPrivacyPolicy?: () => void }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  if (dismissed) return null;

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: 'var(--surface)', borderTop: '1px solid var(--border)',
      boxShadow: '0 -2px 12px rgba(0,0,0,.1)',
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      animation: 'slideUp .3s ease-out',
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      <p style={{ flex: 1, margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)', minWidth: 200 }}>
        {t('consent.text')}{' '}
        {onPrivacyPolicy && (
          <button
            onClick={onPrivacyPolicy}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--primary)', fontSize: 13, fontWeight: 600,
              textDecoration: 'underline', cursor: 'pointer',
            }}
          >
            {t('consent.learnMore')}
          </button>
        )}
      </p>

      <button
        onClick={accept}
        style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700,
          fontSize: 13, padding: '8px 20px', borderRadius: 10,
          border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {t('consent.accept')}
      </button>
    </div>
  );
}
