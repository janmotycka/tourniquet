/**
 * Button — kanonický button primitive pro celou aplikaci.
 *
 * Varianty:
 * - **primary**: vyplněný, `var(--primary)`, default
 * - **secondary**: outline, `var(--surface-var)` bg, text muted
 * - **danger**: vyplněný, `var(--danger)`, destructive actions
 * - **success**: vyplněný, `var(--success)`, pozitivní akce
 * - **warning**: vyplněný, `var(--warning)`, planner accent
 * - **ghost**: transparentní, jen text
 *
 * Velikosti:
 * - **sm**: kompaktní (ve řádku se seznamem)
 * - **md**: default (form save, CTA)
 * - **lg**: prominent (hero, landing)
 *
 * Použití:
 * ```tsx
 * <Button variant="primary" onClick={handleSave}>Uložit</Button>
 * <Button variant="danger" size="sm" onClick={handleDelete}>Smazat</Button>
 * <Button variant="secondary" fullWidth>Zpět</Button>
 * ```
 */

import type { ReactNode, CSSProperties, MouseEvent } from 'react';
import { radius, fontSize, fontWeight } from '../../theme/tokens';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'warning'
  | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  style?: CSSProperties;
  className?: string;
  'aria-label'?: string;
  title?: string;
  children: ReactNode;
}

// ─── Token tabulky ──────────────────────────────────────────────────────────

const sizePad: Record<ButtonSize, string> = {
  sm: '8px 14px',
  md: '12px 20px',
  lg: '14px 24px',
};

const sizeFont: Record<ButtonSize, number> = {
  sm: fontSize.sm,   // 12
  md: fontSize.base, // 14
  lg: fontSize.md,   // 15
};

const variantStyles: Record<ButtonVariant, (disabled: boolean) => CSSProperties> = {
  primary: (disabled) => ({
    background: disabled ? 'var(--border)' : 'var(--primary)',
    color: disabled ? 'var(--text-muted)' : '#fff',
  }),
  secondary: (disabled) => ({
    background: 'var(--surface-var)',
    color: disabled ? 'var(--text-disabled)' : 'var(--text-muted)',
    border: '1.5px solid var(--border)',
  }),
  danger: (disabled) => ({
    background: disabled ? 'var(--border)' : 'var(--danger)',
    color: disabled ? 'var(--text-muted)' : '#fff',
  }),
  success: (disabled) => ({
    background: disabled ? 'var(--border)' : 'var(--success)',
    color: disabled ? 'var(--text-muted)' : '#fff',
  }),
  warning: (disabled) => ({
    background: disabled ? 'var(--border)' : 'var(--warning)',
    color: disabled ? 'var(--text-muted)' : '#fff',
  }),
  ghost: (disabled) => ({
    background: 'transparent',
    color: disabled ? 'var(--text-disabled)' : 'var(--text-muted)',
    border: 'none',
  }),
};

// ─── Component ──────────────────────────────────────────────────────────────

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  onClick,
  type = 'button',
  style,
  className,
  children,
  ...rest
}: Props) {
  const isBordered = variant === 'secondary';

  const baseStyle: CSSProperties = {
    padding: sizePad[size],
    borderRadius: radius.lg,
    fontSize: sizeFont[size],
    fontWeight: fontWeight.bold,
    border: isBordered ? undefined : 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled && variant !== 'primary' && variant !== 'danger' && variant !== 'success' && variant !== 'warning' ? 0.6 : 1,
    width: fullWidth ? '100%' : undefined,
    transition: 'transform .1s, box-shadow .15s',
    ...variantStyles[variant](disabled),
    ...style,
  };

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={rest['aria-label']}
      title={rest.title}
      className={className}
      style={baseStyle}
    >
      {children}
    </button>
  );
}

/**
 * IconButton — square button pro ikonku (back ←, close ×, edit ✏️ atd.).
 *
 * Rozměry z `size.iconButton` (36×36), border-radius `radius.md` (10).
 * Výchozí variant 'secondary' (var(--surface-var) background).
 */
interface IconButtonProps {
  variant?: 'secondary' | 'ghost';
  disabled?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  'aria-label': string;
  title?: string;
  small?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}

export function IconButton({
  variant = 'secondary',
  disabled = false,
  onClick,
  small = false,
  style,
  children,
  ...rest
}: IconButtonProps) {
  const dim = small ? 30 : 36;
  const baseStyle: CSSProperties = {
    width: dim,
    height: dim,
    borderRadius: radius.md,
    background: variant === 'secondary' ? 'var(--surface-var)' : 'transparent',
    color: 'var(--text-muted)',
    fontSize: small ? 14 : 16,
    fontWeight: fontWeight.bold,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: variant === 'secondary' ? '1.5px solid var(--border)' : 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
    ...style,
  };

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={rest['aria-label']}
      title={rest.title}
      style={baseStyle}
    >
      {children}
    </button>
  );
}
