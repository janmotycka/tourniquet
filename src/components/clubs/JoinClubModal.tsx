/**
 * JoinClubModal — modal pro zadání PINu k pozvánce do sdíleného klubu.
 *
 * Vyvolává se z App.tsx když:
 * - existuje clubJoinIntent (z URL ?join=club&id=...)
 * - uživatel je přihlášen (i anonymně)
 *
 * Po úspěšném joinu refreshne clubs store a navádí na home.
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
  const loadFromFirebase = useClubsStore(s => s.loadFromFirebase);
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
      // Refresh clubs + set active
      if (user?.uid) {
        await loadFromFirebase(user.uid);
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
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, padding: '0 0 24px',
          maxHeight: '90dvh', overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        <div style={{ padding: '6px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 800, fontSize: 17, margin: 0 }}>
              🏟 {t('clubs.join.title')}
            </h3>
            <button
              onClick={handleClose}
              aria-label={t('common.cancel')}
              style={{
                background: 'var(--surface-var)', width: 30, height: 30, borderRadius: 15,
                fontSize: 14, color: 'var(--text-muted)', border: 'none', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4, textAlign: 'center' }}>
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
              padding: '14px', borderRadius: 12, fontSize: 24, fontWeight: 800,
              letterSpacing: 8, fontFamily: 'monospace', textAlign: 'center',
              border: '1.5px solid var(--border)', background: 'var(--surface-var)',
              outline: 'none', boxSizing: 'border-box',
            }}
            autoFocus
          />

          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 10, background: 'var(--danger-light)', color: 'var(--danger)',
              fontSize: 12, fontWeight: 600, textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <button
            disabled={busy || pin.length !== 6}
            onClick={handleJoin}
            style={{
              background: (busy || pin.length !== 6) ? 'var(--border)' : 'var(--primary)',
              color: (busy || pin.length !== 6) ? 'var(--text-muted)' : '#fff',
              fontWeight: 800, fontSize: 15, padding: '13px', borderRadius: 12,
              marginTop: 4, border: 'none',
              cursor: (busy || pin.length !== 6) ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '…' : t('clubs.join.join')}
          </button>
        </div>
      </div>
    </div>
  );
}
