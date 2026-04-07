/**
 * CreateClubModal — modal pro vytvoření pracovního (personal) klubu
 * mimo onboarding (např. z ClubSwitcheru když má uživatel 0 sdílených klubů).
 *
 * Volá Cloud Function `createPersonalClub` a po úspěchu refreshne sharedClubs.
 */

import { useState } from 'react';
import { useI18n } from '../../i18n';
import { useClubsStore } from '../../store/clubs.store';
import { useToastStore } from '../../store/toast.store';
import { useAuth } from '../../context/AuthContext';
import { createPersonalClub } from '../../services/club-functions';
import { logger } from '../../utils/logger';

interface Props {
  onClose: () => void;
  onCreated?: (clubId: string) => void;
}

const CLUB_COLORS = [
  '#1565C0', '#0D47A1', '#2E7D32', '#1B5E20',
  '#C62828', '#E65100', '#6A1B9A', '#283593',
];

export function CreateClubModal({ onClose, onCreated }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const showToast = useToastStore(s => s.show);
  const loadSharedClubs = useClubsStore(s => s.loadSharedClubs);
  const setActiveClubId = useClubsStore(s => s.setActiveClubId);

  const [name, setName] = useState('');
  const [color, setColor] = useState(CLUB_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createPersonalClub({ name: name.trim(), color });
      if (user?.uid) {
        await loadSharedClubs(user.uid);
        await setActiveClubId(res.clubId);
      }
      showToast('success', t('clubs.shared.createPersonalTitle'));
      onCreated?.(res.clubId);
      onClose();
    } catch (err) {
      logger.warn('[CreateClubModal] failed:', err);
      const msg = (err as Error).message || '';
      if (msg.toLowerCase().includes('limit')) {
        setError(t('clubs.shared.createPersonalLimit'));
      } else {
        setError(msg || 'Error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 16, padding: 24,
          maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <h3 style={{ fontWeight: 800, fontSize: 20 }}>{t('clubs.shared.createPersonalTitle')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('clubs.shared.createPersonalHint')}
        </p>

        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('wizard.clubNamePlaceholder')}
          style={{
            padding: '12px 14px', borderRadius: 12, fontSize: 15, fontWeight: 600,
            border: '1.5px solid var(--divider)', background: 'var(--surface)',
          }}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CLUB_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 32, height: 32, borderRadius: 8, border: 'none', background: c,
                outline: color === c ? '3px solid var(--text)' : '2px solid transparent',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>

        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 10, background: '#ffebee', color: '#c62828',
            fontSize: 12, fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          ℹ️ {t('clubs.shared.createPersonalLimit')}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px', borderRadius: 12, background: 'var(--surface-var)',
              color: 'var(--text-muted)', fontWeight: 700, fontSize: 14,
            }}
          >
            ✕
          </button>
          <button
            disabled={busy || !name.trim()}
            onClick={handleCreate}
            style={{
              flex: 2, padding: '12px', borderRadius: 12, background: '#2E7D32', color: '#fff',
              fontWeight: 700, fontSize: 14, opacity: busy || !name.trim() ? 0.6 : 1,
            }}
          >
            {busy ? '…' : t('clubs.shared.createPersonalTitle')}
          </button>
        </div>
      </div>
    </div>
  );
}
