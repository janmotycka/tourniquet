import { useState, useEffect } from 'react';
import { useI18n } from '../i18n';
import { Z } from '../utils/z-index';

/**
 * Zobrazí banner na vrchu stránky pokud je uživatel offline.
 * Automaticky zmizí jakmile se připojení obnoví.
 */
export function ConnectionStatus() {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: Z.status,
      background: '#E65100', color: '#fff',
      padding: '8px 16px', textAlign: 'center',
      fontSize: 13, fontWeight: 600,
      boxShadow: '0 2px 8px rgba(0,0,0,.2)',
      animation: 'slideDown .3s ease-out',
    }}>
      <style>{`@keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }`}</style>
      📡 {t('app.offline')}
    </div>
  );
}
