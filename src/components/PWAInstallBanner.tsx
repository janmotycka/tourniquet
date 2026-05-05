import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useI18n } from '../i18n';

const DISMISS_KEY = 'torq_pwa_dismiss';

/**
 * Bannner na instalaci PWA — zobrazí se při 2+ návštěvě,
 * pokud uživatel ještě neinstaloval a nedismissoval.
 */
export function PWAInstallBanner() {
  const { canInstall, install } = usePWAInstall();
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => {
    try {
      const ts = localStorage.getItem(DISMISS_KEY);
      if (!ts) return false;
      // Po 7 dnech znovu ukázat
      return Date.now() - Number(ts) < 7 * 24 * 60 * 60 * 1000;
    } catch { return false; }
  });

  if (!canInstall || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  };

  const handleInstall = async () => {
    await install();
    handleDismiss();
  };

  return (
    <div style={{
      position: 'fixed', bottom: 'env(safe-area-inset-bottom, 16px)',
      left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)', maxWidth: 448,
      background: 'var(--primary)', color: '#fff',
      borderRadius: 16, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,.25)',
      zIndex: 9998, animation: 'slideUp .4s ease-out',
    }}>
      <span style={{ fontSize: 28, flexShrink: 0 }}>⚽</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{t('pwa.installTitle')}</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{t('pwa.installDesc')}</div>
      </div>
      <button
        onClick={handleInstall}
        style={{
          background: '#fff', color: 'var(--primary)',
          fontWeight: 700, fontSize: 13, padding: '8px 16px',
          borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
        }}
      >
        {t('pwa.install')}
      </button>
      <button
        onClick={handleDismiss}
        style={{
          background: 'transparent', color: 'rgba(255,255,255,.7)',
          border: 'none', cursor: 'pointer', fontSize: 18,
          padding: 4, lineHeight: 1, flexShrink: 0,
        }}
        aria-label={t('common.close')}
      >
        ×
      </button>
    </div>
  );
}
