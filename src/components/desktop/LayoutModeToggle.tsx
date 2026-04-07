import { useLayoutMode } from '../../hooks/useLayoutMode';
import type { LayoutModePreference } from '../../hooks/useLayoutMode';
import { useI18n } from '../../i18n';

// Compact 3-segment toggle: Auto · Mobile · Desktop
// Used in topbar and Settings.

interface Props {
  variant?: 'compact' | 'full';
}

export function LayoutModeToggle({ variant = 'compact' }: Props) {
  const { preference, setPreference } = useLayoutMode();
  const { t } = useI18n();

  const options: { value: LayoutModePreference; icon: string; label: string }[] = [
    { value: 'auto',    icon: '🔄', label: t('layout.auto') },
    { value: 'mobile',  icon: '📱', label: t('layout.mobile') },
    { value: 'desktop', icon: '🖥', label: t('layout.desktop') },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t('layout.toggleLabel')}
      style={{
        display: 'inline-flex',
        background: 'var(--surface-var)',
        borderRadius: 10,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map(opt => {
        const selected = preference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreference(opt.value)}
            title={opt.label}
            style={{
              background: selected ? 'var(--surface)' : 'transparent',
              color: selected ? 'var(--text)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 8,
              padding: variant === 'full' ? '8px 14px' : '6px 10px',
              fontSize: variant === 'full' ? 14 : 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: selected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background .15s, color .15s',
            }}
          >
            <span aria-hidden>{opt.icon}</span>
            {variant === 'full' && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
