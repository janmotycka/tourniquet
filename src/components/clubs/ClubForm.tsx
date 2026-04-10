import { useState, useRef } from 'react';
import type { AgeCategory } from '../../types/club.types';
import { AGE_CATEGORIES } from '../../types/club.types';
import { TEAM_COLORS, colorSwatch } from '../../utils/team-colors';
import { resizeLogoToBase64 } from './resize-logo';
import { useToastStore } from '../../store/toast.store';
import { Field, Input, Button, IconButton, PageHeader } from '../ui';
import { radius, fontSize, fontWeight, spacing, modal } from '../../theme/tokens';

interface ClubFormProps {
  initial: { name: string; color: string; logoBase64: string | null; ageCategories: AgeCategory[] };
  onSave: (data: { name: string; color: string; logoBase64: string | null; ageCategories: AgeCategory[] }) => void;
  onCancel: () => void;
  title: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  showCategories?: boolean;
  /**
   * Render mode:
   * - 'sheet' (default): bottom sheet s overlay — krátké quick-actions.
   * - 'page': plná stránka s headerem ← back + title — pro větší forms
   *   (vytvoření klubu z ClubsPage). Bez overlay, bez drag handle,
   *   stejný vzhled jako TournamentCreateChoicePage.
   */
  mode?: 'sheet' | 'page';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ClubForm({
  initial,
  onSave,
  onCancel,
  title,
  t,
  showCategories,
  mode = 'sheet',
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
      useToastStore.getState().show('error', t('clubs.imageError'));
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

  // ─── Inner form body — stejné pro oba módy ────────────────────────────────
  const body = (
    <>
      {/* Logo */}
      <Field label={t('clubs.logoLabel')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <div style={{
            width: 56, height: 56, borderRadius: radius.lg, overflow: 'hidden',
            border: '1.5px solid var(--border)', flexShrink: 0,
            background: logoBase64 ? 'transparent' : color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {logoBase64
              ? <img src={logoBase64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 20 }}>🏟</span>
            }
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleLogoChange}
            />
            <Button
              variant="primary"
              size="sm"
              disabled={logoLoading}
              onClick={() => logoRef.current?.click()}
            >
              {logoLoading ? t('clubs.uploading') : t('clubs.uploadLogo')}
            </Button>
            {logoBase64 && (
              <Button variant="danger" size="sm" onClick={() => setLogoBase64(null)}>
                {t('clubs.removeLogo')}
              </Button>
            )}
          </div>
        </div>
      </Field>

      {/* Název */}
      <Field label={t('clubs.nameRequired')}>
        <Input
          value={name}
          onChange={v => setName(v)}
          placeholder={t('clubs.namePlaceholder')}
          maxLength={40}
        />
      </Field>

      {/* Barva */}
      <Field label={t('clubs.colorLabel')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
          {TEAM_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Barva ${c}`}
              style={{
                ...colorSwatch(c, 32),
                borderRadius: radius.md,
                border: color === c ? '3px solid var(--text)' : '3px solid transparent',
                outline: color === c ? '2px solid #fff' : 'none',
                outlineOffset: -4,
                cursor: 'pointer',
              }}
            />
          ))}
          <label
            style={{
              width: 32, height: 32, borderRadius: radius.md, overflow: 'hidden',
              border: '1.5px solid var(--border)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}
          >
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 16 }}>🎨</span>
          </label>
        </div>
      </Field>

      {/* Věkové kategorie */}
      {showCategories && (
        <Field label={t('clubs.selectCategories')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {AGE_CATEGORIES.map(cat => {
              const isSelected = categories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: radius.md,
                    fontSize: fontSize.sm + 1,
                    fontWeight: fontWeight.bold,
                    background: isSelected ? 'var(--primary)' : 'var(--surface-var)',
                    color: isSelected ? '#fff' : 'var(--text-muted)',
                    border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    transition: 'all .15s',
                    cursor: 'pointer',
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {/* Uložit */}
      <Button
        variant="primary"
        size="md"
        fullWidth
        disabled={!canSave}
        onClick={() => canSave && onSave({ name: name.trim(), color, logoBase64, ageCategories: categories })}
        style={{ marginTop: spacing.xs }}
      >
        {t('clubs.save')}
      </Button>
    </>
  );

  // ─── Page mode — full-screen layout jako TournamentCreateChoicePage ──────
  if (mode === 'page') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        padding: `${spacing.lg}px ${spacing.lg}px ${spacing.xl}px`,
        gap: spacing.md,
        minHeight: '100dvh',
        boxSizing: 'border-box',
      }}>
        <PageHeader
          title={title}
          onBack={onCancel}
          backLabel={t('common.back')}
          variant="inset"
        />

        {/* Form body */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: spacing.md + 2,
        }}>
          {body}
        </div>
      </div>
    );
  }

  // ─── Sheet mode (default) — bottom sheet s overlay ───────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: modal.borderRadius,
          width: '100%', maxWidth: modal.maxWidth, padding: `0 0 ${spacing.xl}px`,
          maxHeight: modal.maxHeight, overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        <div style={{
          padding: `6px ${spacing.lg}px 0`,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.md + 2,
        }}>
          {/* Header with close button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{
              fontWeight: fontWeight.extrabold,
              fontSize: fontSize.lg - 1,
              margin: 0,
            }}>
              {title}
            </h2>
            <IconButton small variant="secondary" aria-label={t('common.cancel')} onClick={onCancel}>
              ✕
            </IconButton>
          </div>

          {body}
        </div>
      </div>
    </div>
  );
}
