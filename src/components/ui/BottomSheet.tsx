/**
 * BottomSheet — jednotný modal/bottom-sheet primitiv.
 *
 * Konsoliduje pattern z EditMatchSheet, ShareMatchSheet, PlayerDetailSheet,
 * GoalModal, CardModal, SubstitutionModal a desítek dalších míst.
 *
 * Použití:
 * ```tsx
 * <BottomSheet open={open} onClose={close} title="Edit zápasu" icon="✏️">
 *   <div>…obsah…</div>
 * </BottomSheet>
 * ```
 *
 * - Zavření: klik na overlay, Escape, nebo onClose handler
 * - Animace: fadeIn overlay + slideUp sheet
 * - Bottom sheet na mobile, centered card na desktopu (CSS nechává na auto)
 * - Safe-area inset bottom pro iPhone notch
 */

import { useEffect, type ReactNode } from 'react';
import { modal, radius, spacing, fontSize, fontWeight } from '../../theme/tokens';
import { Z } from '../../utils/z-index';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Volitelný titulek v header sekci */
  title?: string;
  /** Emoji/ikona vedle titulku */
  icon?: string;
  /** Podtitulek pod titulkem */
  subtitle?: string;
  /** Skrytý close button (×) vpravo nahoře. Default true */
  showClose?: boolean;
  /** Skrytý drag handle (čárka nahoře). Default true */
  showHandle?: boolean;
  /** Max height override (default 90dvh). */
  maxHeight?: string | number;
  /** Dodatečný style na vnější overlay */
  overlayStyle?: React.CSSProperties;
  /** Aria label pro overlay */
  ariaLabel?: string;
  /** Render sticky footer (tlačítka atd.) */
  footer?: ReactNode;
}

export function BottomSheet({
  open,
  onClose,
  children,
  title,
  icon,
  subtitle,
  showClose = true,
  showHandle = true,
  maxHeight,
  overlayStyle,
  ariaLabel,
  footer,
}: Props) {
  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title ?? 'Dialog'}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.detail,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'bs-fadeIn .2s ease',
        ...overlayStyle,
      }}
    >
      <style>{`
        @keyframes bs-fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes bs-slideUp { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: modal.borderRadius,
          width: '100%',
          maxWidth: modal.maxWidth,
          maxHeight: maxHeight ?? modal.maxHeight,
          display: 'flex', flexDirection: 'column',
          animation: 'bs-slideUp .25s ease',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}
      >
        {/* Handle */}
        {showHandle && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: `${spacing.sm + 2}px 0 ${spacing.xs + 2}px` }}>
            <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2 }} />
          </div>
        )}

        {/* Header */}
        {(title || icon || showClose) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: `0 ${spacing.lg}px ${spacing.sm + 2}px`,
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0 }}>
              {icon && <span style={{ fontSize: fontSize.lg }}>{icon}</span>}
              <div style={{ minWidth: 0 }}>
                {title && (
                  <div style={{ fontWeight: fontWeight.extrabold, fontSize: fontSize.md, color: 'var(--text)' }}>
                    {title}
                  </div>
                )}
                {subtitle && (
                  <div style={{ fontSize: fontSize.xs, color: 'var(--text-muted)', marginTop: 2 }}>
                    {subtitle}
                  </div>
                )}
              </div>
            </div>
            {showClose && (
              <button
                onClick={onClose}
                aria-label="Zavřít"
                style={{
                  background: 'var(--surface-var)', border: 'none', borderRadius: radius.sm,
                  width: 32, height: 32, fontSize: 16, cursor: 'pointer',
                  color: 'var(--text-muted)', flexShrink: 0,
                }}
              >✕</button>
            )}
          </div>
        )}

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: spacing.lg }}>
          {children}
        </div>

        {/* Sticky footer */}
        {footer && (
          <div style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            padding: spacing.md,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
