import { useState, useRef } from 'react';
import { useI18n } from '../../../i18n';
import type { Club, AgeCategory } from '../../../types/club.types';
import { TEAM_COLORS, colorSwatch } from '../../../utils/team-colors';
import { resizeLogoToBase64 } from './helpers';

interface ClubPickerModalProps {
  clubs: Club[];
  onSelect: (club: Club, category?: AgeCategory) => void;
  onCreateClub: (name: string, color: string, logoBase64: string | null) => Club;
  onClose: () => void;
}

export function ClubPickerModal({ clubs, onSelect, onCreateClub, onClose }: ClubPickerModalProps) {
  const { t } = useI18n();
  const [showNewClub, setShowNewClub] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubColor, setNewClubColor] = useState(TEAM_COLORS[0]);
  const [newClubLogo, setNewClubLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [categoryStep, setCategoryStep] = useState<Club | null>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await resizeLogoToBase64(file);
      setNewClubLogo(b64);
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = () => {
    if (!newClubName.trim()) return;
    const club = onCreateClub(newClubName.trim(), newClubColor, newClubLogo);
    onSelect(club);
  };

  const handleClubClick = (club: Club) => {
    // Pokud klub ma vice kategorii s hraci, nabidni vyber kategorie
    const cats = (club.ageCategories ?? []);
    if (cats.length > 1 && (club.players ?? []).length > 0) {
      setCategoryStep(club);
    } else if (cats.length === 1 && (club.players ?? []).length > 0) {
      // Jedna kategorie -- rovnou s ni
      onSelect(club, cats[0]);
    } else {
      // Zadne kategorie/hraci -- fallback na defaultPlayers
      onSelect(club);
    }
  };

  const getPlayerCount = (club: Club) => {
    const rosterPlayers = (club.players ?? []).filter(p => p.active);
    return rosterPlayers.length > 0 ? rosterPlayers.length : (club.defaultPlayers ?? []).length;
  };

  // -- Krok 2: vyber kategorie --
  if (categoryStep) {
    const cats = (categoryStep.ageCategories ?? []);
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }} onClick={onClose}>
        <div style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px',
          width: '100%', maxWidth: 480, maxHeight: '70vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 12,
        }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setCategoryStep(null)} aria-label="Back" style={{ fontSize: 18, color: 'var(--text-muted)' }}>←</button>
              <h3 style={{ fontWeight: 800, fontSize: 17 }}>{t('clubs.selectCategory')}</h3>
            </div>
            <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)' }}>✕</button>
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            {categoryStep.name} — {t('clubs.selectCategory')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cats.map(cat => {
              const count = (categoryStep.players ?? []).filter(p => p.ageCategory === cat && p.active).length;
              return (
                <button key={cat} onClick={() => onSelect(categoryStep, cat)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--surface-var)', borderRadius: 12, padding: '14px 16px',
                  textAlign: 'left', color: 'var(--text)', width: '100%',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{cat}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {count} {t('clubs.playersLabel')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Moznost bez kategorie (defaultPlayers) */}
          <button onClick={() => onSelect(categoryStep)} style={{
            background: 'var(--surface-var)', borderRadius: 12, padding: '10px 14px',
            fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center',
            border: '1.5px dashed var(--border)', width: '100%',
          }}>
            {t('tournament.create.withoutCategory')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px',
        width: '100%', maxWidth: 480, maxHeight: '70vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontWeight: 800, fontSize: 17 }}>{t('tournament.create.selectClub')}</h3>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)' }}>✕</button>
        </div>

        {clubs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clubs.map(c => (
              <button key={c.id} onClick={() => handleClubClick(c)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--surface-var)', borderRadius: 12, padding: '10px 14px',
                textAlign: 'left', color: 'var(--text)',
              }}>
                {c.logoBase64 ? (
                  <img src={c.logoBase64} alt={c.name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: c.color, flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('tournament.create.playersInRoster', { count: getPlayerCount(c) })}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!showNewClub ? (
          <button onClick={() => setShowNewClub(true)} style={{
            background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 14,
            padding: '12px', borderRadius: 12, border: '2px dashed var(--primary)',
          }}>
            {t('tournament.create.addNewClub')}
          </button>
        ) : (
          <div style={{ background: 'var(--surface-var)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ fontWeight: 700, fontSize: 14 }}>{t('tournament.create.newClub')}</h4>
            <input
              placeholder={t('tournament.create.clubName')}
              value={newClubName}
              onChange={e => setNewClubName(e.target.value)}
              style={{
                width: '100%', padding: '10px', borderRadius: 8, border: '1.5px solid var(--border)',
                fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('tournament.create.colorLabel')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEAM_COLORS.map(c => (
                  <button key={c} onClick={() => setNewClubColor(c)} style={{
                    ...colorSwatch(c, 28),
                    border: newClubColor === c ? '3px solid var(--text)' : '3px solid transparent',
                  }} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('tournament.create.clubLogo')}</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {newClubLogo ? (
                  <img src={newClubLogo} alt="logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: newClubColor }} />
                )}
                <button onClick={() => fileRef.current?.click()} style={{
                  background: 'var(--surface)', border: '1.5px solid var(--border)',
                  padding: '8px 12px', borderRadius: 8, fontSize: 13, color: 'var(--text)',
                }}>
                  {uploading ? t('tournament.create.uploading') : t('tournament.create.uploadLogo')}
                </button>
                {newClubLogo && (
                  <button onClick={() => setNewClubLogo(null)} style={{ fontSize: 13, color: 'var(--text-muted)' }}>✕</button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowNewClub(false)} style={{
                flex: 1, padding: '10px', borderRadius: 10, background: 'var(--surface)',
                border: '1.5px solid var(--border)', fontWeight: 600, fontSize: 14, color: 'var(--text)',
              }}>{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={!newClubName.trim()} style={{
                flex: 2, padding: '10px', borderRadius: 10,
                background: newClubName.trim() ? 'var(--primary)' : 'var(--border)',
                color: newClubName.trim() ? '#fff' : 'var(--text-muted)',
                fontWeight: 700, fontSize: 14,
              }}>{t('tournament.create.saveAndUse')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
