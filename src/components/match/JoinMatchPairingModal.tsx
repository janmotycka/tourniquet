/**
 * JoinMatchPairingModal — modal pro opozičního trenéra.
 * Vyvolává se z App.tsx když má user v URL #pair-match=SCOPE:ID:TOKEN.
 *
 * Flow:
 *  1. Parent předá scopeId, matchId, joinToken
 *  2. Uživatel zadá PIN obdržený od home coach-e
 *  3. Klient zavolá joinMatchPairing → ověří hash, zapíše awayCoachUid
 *  4. Po úspěchu → naviguj na match-detail
 */

import { useState, useMemo } from 'react';
import { useI18n } from '../../i18n';
import { usePageStore } from '../../store/page.store';
import { useToastStore } from '../../store/toast.store';
import { useMatchesStore } from '../../store/matches.store';
import { useClubsStore } from '../../store/clubs.store';
import { useAuth } from '../../context/AuthContext';
import { logger } from '../../utils/logger';
import type { Page } from '../../App';

interface Props {
  scopeId: string;
  matchId: string;
  joinToken: string;
  navigate: (p: Page) => void;
}

export function JoinMatchPairingModal({ scopeId, matchId, joinToken, navigate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const showToast = useToastStore(s => s.show);
  const setMatchPairingIntent = usePageStore(s => s.setMatchPairingIntent);
  const joinMatchPairing = useMatchesStore(s => s.joinMatchPairing);

  // Pokud je uživatel v klubu, automaticky použij active club jako awayClub
  const activeClubId = useClubsStore(s => s.activeClubId);
  const sharedClubs = useClubsStore(s => s.sharedClubs);
  const activeClub = useMemo(() => {
    if (!activeClubId) return null;
    return sharedClubs.find(c => c.id === activeClubId) ?? null;
  }, [activeClubId, sharedClubs]);

  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL parameter `joinToken` je jen sanity check — skutečnou autorizaci dělá
  // PIN + Firebase rules (pairing.joinToken musí existovat, awayCoachUid ještě ne).
  void joinToken; // používá se při čtení match.pairing na serveru

  const clearHash = () => {
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch { /* ignore */ }
  };

  const handleClose = () => {
    setMatchPairingIntent(null);
    clearHash();
  };

  const handleJoin = async () => {
    if (pin.length !== 4) {
      setError(t('matchPairing.errorInvalidPin'));
      return;
    }
    if (!user) {
      setError(t('matchPairing.errorMustSignIn'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const awayCoachName = user.displayName || user.email?.split('@')[0] || 'Trenér';
      const result = await joinMatchPairing(
        scopeId,
        matchId,
        pin,
        awayCoachName,
        activeClub?.id,
        activeClub?.displayName,
      );
      if (result.ok) {
        showToast('success', t('matchPairing.joinedToast'));
        setMatchPairingIntent(null);
        clearHash();
        navigate({ name: 'match-detail', matchId });
      } else {
        switch (result.error) {
          case 'not_found': setError(t('matchPairing.errorNotFound')); break;
          case 'no_invite': setError(t('matchPairing.errorNoInvite')); break;
          case 'already_paired': setError(t('matchPairing.errorAlreadyPaired')); break;
          case 'invalid_pin': setError(t('matchPairing.errorInvalidPin')); break;
          case 'network': setError(t('matchPairing.errorNetwork')); break;
        }
      }
    } catch (err) {
      logger.warn('[JoinMatchPairing] failed:', err);
      setError(t('matchPairing.errorNetwork'));
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
              🤝 {t('matchPairing.joinTitle')}
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

          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4, textAlign: 'center' }}>
            {t('matchPairing.joinHint')}
          </p>

          {activeClub && (
            <div style={{
              background: 'var(--primary-light)', borderRadius: 10, padding: '8px 12px',
              fontSize: 12, color: 'var(--primary)', fontWeight: 600, textAlign: 'center',
            }}>
              {t('matchPairing.joinAsClub', { club: activeClub.displayName })}
            </div>
          )}

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(null); }}
            placeholder="0000"
            style={{
              padding: '14px', borderRadius: 12, fontSize: 28, fontWeight: 800,
              letterSpacing: 10, fontFamily: 'monospace', textAlign: 'center',
              border: '1.5px solid var(--border)', background: 'var(--surface-var)',
              outline: 'none', boxSizing: 'border-box',
            }}
            autoFocus
          />

          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 10, background: '#ffebee', color: '#c62828',
              fontSize: 12, fontWeight: 600, textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <button
            disabled={busy || pin.length !== 4 || !user}
            onClick={handleJoin}
            style={{
              background: (busy || pin.length !== 4 || !user) ? 'var(--border)' : 'var(--primary)',
              color: (busy || pin.length !== 4 || !user) ? 'var(--text-muted)' : '#fff',
              fontWeight: 800, fontSize: 15, padding: '13px', borderRadius: 12,
              marginTop: 4, border: 'none',
              cursor: (busy || pin.length !== 4 || !user) ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '…' : t('matchPairing.joinButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
