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
import { logger } from '../../utils/logger';
import { OpponentAutocomplete, type CatalogClub } from './OpponentAutocomplete';

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
  const showToast = useToastStore(s => s.show);
  const createClub = useClubsStore(s => s.createClub);

  const [name, setName] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogClub | null>(null);
  const [color, setColor] = useState(CLUB_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCatalogSelect = (club: CatalogClub) => {
    setOfficialName(club.name);
    if (!name) setName(club.name.length > 20 ? club.name.split(' ').slice(0, 3).join(' ') : club.name);
    setSelectedCatalog(club);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const newClub = await createClub({
        name: name.trim(),
        color,
      });
      showToast('success', t('clubs.shared.createPersonalTitle'));
      onCreated?.(newClub.id);
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
            <h3 style={{ fontWeight: 800, fontSize: 17, margin: 0 }}>{t('clubs.shared.createPersonalTitle')}</h3>
            <button
              onClick={onClose}
              aria-label={t('common.cancel')}
              style={{
                background: 'var(--surface-var)', width: 30, height: 30, borderRadius: 15,
                fontSize: 14, color: 'var(--text-muted)', border: 'none', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
            Najdi svůj klub v katalogu nebo zadej název ručně.
          </p>

          {/* Vyhledání v katalogu */}
          <div>
            <label style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
              display: 'block', marginBottom: 6,
            }}>
              🔍 Najít klub v katalogu
            </label>
            <OpponentAutocomplete
              value={officialName}
              onChange={setOfficialName}
              onSelect={handleCatalogSelect}
              placeholder="Začni psát název klubu..."
              autoFocus
            />
            {selectedCatalog && (
              <div style={{
                marginTop: 6, padding: '6px 10px', borderRadius: 8,
                background: 'var(--success-light)', fontSize: 11,
                color: 'var(--success)', fontWeight: 600,
              }}>
                ✅ {selectedCatalog.name}{selectedCatalog.city ? ` · ${selectedCatalog.city}` : ''}
              </div>
            )}
          </div>

          {/* Zkrácený název (zobrazovaný) */}
          <div>
            <label style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
              display: 'block', marginBottom: 6,
            }}>
              Zobrazovaný název <span style={{ fontWeight: 400 }}>(pro tabulky a rozpis)</span>
            </label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); }}
              placeholder="např. SFK Vrchovina"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--bg)',
                fontSize: 14, fontWeight: 600, color: 'var(--text)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {officialName && name && officialName !== name && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Oficiální: {officialName} → zobrazuje se jako: <strong>{name}</strong>
              </div>
            )}
          </div>

          {/* Barva */}
          <div>
            <label style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
              display: 'block', marginBottom: 6,
            }}>
              {t('wizard.clubColor')}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CLUB_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Barva ${c}`}
                  style={{
                    width: 32, height: 32, borderRadius: 10, background: c,
                    border: color === c ? '3px solid var(--text)' : '3px solid transparent',
                    outline: color === c ? '2px solid #fff' : 'none',
                    outlineOffset: -4,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
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

          {/* Save */}
          <button
            disabled={busy || !name.trim()}
            onClick={handleCreate}
            style={{
              background: (busy || !name.trim()) ? 'var(--border)' : 'var(--primary)',
              color: (busy || !name.trim()) ? 'var(--text-muted)' : '#fff',
              fontWeight: 800, fontSize: 15, padding: '13px', borderRadius: 12,
              marginTop: 4, border: 'none',
              cursor: (busy || !name.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '…' : t('clubs.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
