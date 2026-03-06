import { useState, useRef } from 'react';
import type { AgeCategory } from '../../types/club.types';
import { AGE_CATEGORIES } from '../../types/club.types';
import { TEAM_COLORS, colorSwatch } from '../../utils/team-colors';
import { resizeLogoToBase64 } from './resize-logo';

interface ClubFormProps {
  initial: { name: string; color: string; logoBase64: string | null; ageCategories: AgeCategory[] };
  onSave: (data: { name: string; color: string; logoBase64: string | null; ageCategories: AgeCategory[] }) => void;
  onCancel: () => void;
  title: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  showCategories?: boolean;
}

export function ClubForm({
  initial,
  onSave,
  onCancel,
  title,
  t,
  showCategories,
}: ClubFormProps) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [logoBase64, setLogoBase64] = useState<string | null>(initial.logoBase64);
  const [logoLoading, setLogoLoading] = useState(false);
  const [categories, setCategories] = useState<AgeCategory[]>(initial.ageCategories);
  const logoRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoLoading(true);
    try {
      const b64 = await resizeLogoToBase64(file);
      setLogoBase64(b64);
    } catch {
      alert(t('clubs.imageError'));
    } finally {
      setLogoLoading(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  };

  const toggleCategory = (cat: AgeCategory) => {
    setCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat],
    );
  };

  const canSave = name.trim().length >= 2;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, padding: '0 0 32px',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontWeight: 800, fontSize: 18 }}>{title}</h2>
            <button onClick={onCancel} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
          </div>

          {/* Logo */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('clubs.logoLabel')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 14, overflow: 'hidden',
                border: '2px solid var(--border)', flexShrink: 0,
                background: logoBase64 ? 'transparent' : color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {logoBase64
                  ? <img src={logoBase64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 22 }}>🏟</span>
                }
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleLogoChange}
                />
                <button
                  onClick={() => logoRef.current?.click()}
                  disabled={logoLoading}
                  style={{
                    background: 'var(--primary)', color: '#fff', fontWeight: 600, fontSize: 13,
                    padding: '8px 14px', borderRadius: 8,
                  }}
                >
                  {logoLoading ? t('clubs.uploading') : t('clubs.uploadLogo')}
                </button>
                {logoBase64 && (
                  <button
                    onClick={() => setLogoBase64(null)}
                    style={{
                      background: '#FFEBEE', color: '#C62828', fontWeight: 600, fontSize: 13,
                      padding: '8px 14px', borderRadius: 8,
                    }}
                  >
                    {t('clubs.removeLogo')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Název */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('clubs.nameRequired')}</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('clubs.namePlaceholder')}
              maxLength={40}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, fontSize: 15,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Barva */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('clubs.colorLabel')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TEAM_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    ...colorSwatch(c, 36), borderRadius: 10,
                    border: color === c ? '3px solid var(--text)' : '3px solid transparent',
                    outline: color === c ? '2px solid #fff' : 'none',
                    outlineOffset: -4,
                  }}
                />
              ))}
              <label style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ opacity: 0, position: 'absolute' }} />
                <span style={{ fontSize: 18 }}>🎨</span>
              </label>
            </div>
          </div>

          {/* Věkové kategorie */}
          {showCategories && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('clubs.selectCategories')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {AGE_CATEGORIES.map(cat => {
                  const isSelected = categories.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: isSelected ? 'var(--primary)' : 'var(--surface-var)',
                        color: isSelected ? '#fff' : 'var(--text-muted)',
                        border: isSelected ? '2px solid var(--primary)' : '2px solid var(--border)',
                        transition: 'all .15s',
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Uložit */}
          <button
            onClick={() => canSave && onSave({ name: name.trim(), color, logoBase64, ageCategories: categories })}
            disabled={!canSave}
            style={{
              background: canSave ? 'var(--primary)' : 'var(--border)',
              color: canSave ? '#fff' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 16, padding: '14px', borderRadius: 14, marginTop: 4,
            }}
          >
            {t('clubs.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
