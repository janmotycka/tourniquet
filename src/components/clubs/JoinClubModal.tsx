/**
 * JoinClubModal — modal pro zadání PINu k pozvánce do sdíleného klubu.
 *
 * Vyvolává se z App.tsx když:
 * - existuje clubJoinIntent (z URL ?join=club&id=...)
 * - uživatel je přihlášen (i anonymně)
 *
 * Po úspěšném joinu zavolá loadSharedClubs() a navádí na home.
 */

import { useState } from 'react';
import { useI18n } from '../../i18n';
import { useClubsStore } from '../../store/clubs.store';
import { usePageStore } from '../../store/page.store';
import { useToastStore } from '../../store/toast.store';
import { useAuth } from '../../context/AuthContext';
import { joinClubByInvite } from '../../services/club-functions';
import { logger } from '../../utils/logger';

interface Props {
  inviteId: string;
}

export function JoinClubModal({ inviteId }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const showToast = useToastStore(s => s.show);
  const setClubJoinIntent = usePageStore(s => s.setClubJoinIntent);
  const loadSharedClubs = useClubsStore(s => s.loadSharedClubs);
  const setActiveClubId = useClubsStore(s => s.setActiveClubId);

  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearUrl = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('join');
      url.searchParams.delete('id');
      history.replaceState(null, '', url.pathname + url.search + (url.hash === '#club' ? '' : url.hash));
    } catch {
      // ignore
    }
  };

  const handleClose = () => {
    setClubJoinIntent(null);
    clearUrl();
  };

  const handleJoin = async () => {
    if (pin.length !== 6) {
      setError(t('clubs.join.errorInvalidPin'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await joinClubByInvite({ inviteId, pin });
      if (res.alreadyMember) {
        showToast('info', t('clubs.join.alreadyMember'));
      } else {
        showToast('success', t('clubs.join.joined'));
      }
      // Refresh shared clubs + set active
      if (user?.uid) {
        await loadSharedClubs(user.uid);
        await setActiveClubId(res.clubId);
      }
      handleClose();
    } catch (err) {
      logger.warn('[JoinClub] failed:', err);
      const msg = (err as Error).message || '';
      if (msg.toLowerCase().includes('expired')) {
        setError(t('clubs.join.errorExpired'));
      } else if (msg.toLowerCase().includes('used')) {
        setError(t('clubs.join.errorUsed'));
      } else if (msg.toLowerCase().includes('pin') || msg.toLowerCase().includes('invalid')) {
        setError(t('clubs.join.errorInvalidPin'));
      } else {
        setError(msg || 'Error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 16, padding: 28,
          maxWidth: 380, width: '100%', display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ textAlign: 'center', fontSize: 36 }}>🏟</div>
        <h3 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>
          {t('clubs.join.title')}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          {t('clubs.join.enterPin')}
        </p>

        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(null); }}
          placeholder="000000"
          style={{
            padding: '14px', borderRadius: 12, fontSize: 26, fontWeight: 800,
            letterSpacing: 8, fontFamily: 'monospace', textAlign: 'center',
            border: '1px solid var(--divider)', background: 'var(--surface-var)',
          }}
          autoFocus
        />

        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 10, background: '#ffebee', color: '#c62828',
            fontSize: 13, fontWeight: 600, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <button
          disabled={busy || pin.length !== 6}
          onClick={handleJoin}
          style={{
            padding: '14px', borderRadius: 12, background: '#2E7D32', color: '#fff',
            fontWeight: 700, fontSize: 15, opacity: busy || pin.length !== 6 ? 0.6 : 1,
          }}
        >
          {busy ? '…' : t('clubs.join.join')}
        </button>

        <button
          onClick={handleClose}
          style={{
            padding: '10px', borderRadius: 12, background: 'transparent', color: 'var(--text-muted)',
            fontWeight: 600, fontSize: 13,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
