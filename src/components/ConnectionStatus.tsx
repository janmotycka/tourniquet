import { useState, useEffect } from 'react';
import { useI18n } from '../i18n';
import { Z } from '../utils/z-index';
import { firebaseConnected } from '../firebase';

/**
 * Zobrazí banner na vrchu stránky pokud je uživatel offline
 * nebo Firebase spojení je přerušené.
 */
export function ConnectionStatus() {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);
  const [fbConnected, setFbConnected] = useState(firebaseConnected);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll Firebase connection state (lightweight, no network call)
    const interval = setInterval(() => {
      setFbConnected(firebaseConnected);
    }, 2000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const showBanner = !online || (!fbConnected && online);

  if (!showBanner) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: Z.status,
      background: !online ? '#E65100' : '#F57F17', color: '#fff',
      padding: '8px 16px', textAlign: 'center',
      fontSize: 13, fontWeight: 600,
      boxShadow: '0 2px 8px rgba(0,0,0,.2)',
      animation: 'slideDown .3s ease-out',
    }}>
      <style>{`@keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }`}</style>
      {!online ? `📡 ${t('app.offline')}` : '⏳ Obnovuji spojení...'}
    </div>
  );
}
