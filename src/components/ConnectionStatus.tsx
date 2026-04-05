import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../i18n';
import { Z } from '../utils/z-index';
import { firebaseConnected } from '../firebase';
import { useMatchesStore } from '../store/matches.store';

/**
 * Zobrazí banner na vrchu stránky pokud je uživatel offline,
 * Firebase spojení je přerušené, nebo existují nesynchonizované změny.
 */
export function ConnectionStatus() {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);
  const [fbConnected, setFbConnected] = useState(firebaseConnected);
  const syncError = useMatchesStore(s => s.syncError);
  const pendingSync = useMatchesStore(s => s.pendingSync);
  const retryPendingSync = useMatchesStore(s => s.retryPendingSync);

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

  // Auto-retry pending syncs when connection restores
  useEffect(() => {
    if (online && fbConnected && pendingSync.length > 0) {
      retryPendingSync();
    }
  }, [online, fbConnected, pendingSync.length, retryPendingSync]);

  const handleRetry = useCallback(() => {
    retryPendingSync();
  }, [retryPendingSync]);

  const isOffline = !online;
  const isReconnecting = !fbConnected && online;
  const hasPending = pendingSync.length > 0;
  const showBanner = isOffline || isReconnecting || syncError || hasPending;

  if (!showBanner) return null;

  // Priority: offline > reconnecting > sync error > pending
  const bg = isOffline ? '#E65100' : isReconnecting ? '#F57F17' : syncError ? '#C62828' : '#E65100';
  const message = isOffline
    ? `📡 ${t('app.offline')}`
    : isReconnecting
      ? `⏳ ${t('app.reconnecting')}`
      : syncError
        ? `⚠️ ${syncError}`
        : `🔄 ${t('app.pendingSync', { count: pendingSync.length })}`;

  return (
    <div style={{
      position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, zIndex: Z.status,
      background: bg, color: '#fff',
      padding: '8px 16px', textAlign: 'center',
      fontSize: 13, fontWeight: 600,
      boxShadow: '0 2px 8px rgba(0,0,0,.2)',
      animation: 'slideDown .3s ease-out',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <style>{`@keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }`}</style>
      <span>{message}</span>
      {(hasPending || syncError) && online && (
        <button
          onClick={handleRetry}
          style={{
            background: 'rgba(255,255,255,.25)', border: 'none', borderRadius: 6,
            color: '#fff', fontWeight: 700, fontSize: 11, padding: '3px 10px',
            cursor: 'pointer',
          }}
        >
          {t('app.retrySync')}
        </button>
      )}
    </div>
  );
}
