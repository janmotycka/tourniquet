/**
 * Field — wrapper pro form field s labelem.
 *
 * Input — styled text/date/time/number input.
 *
 * Tyto dvě komponenty nahrazují opakující se JSX:
 * ```tsx
 * <div>
 *   <label style={labelStyle}>Název</label>
 *   <input style={inputStyle} value={...} />
 * </div>
 * ```
 *
 * Na něco jednoduššího:
 * ```tsx
 * <Field label="Název">
 *   <Input value={...} onChange={...} />
 * </Field>
 * ```
 */

import type { ReactNode, CSSProperties, ChangeEvent, InputHTMLAttributes } from 'react';
import { radius, fontSize, fontWeight, spacing } from '../../theme/tokens';

// ─── Field wrapper ──────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  /** Error message zobrazená pod polem */
  error?: string;
  /** Nápověda zobrazená pod labelem */
  hint?: string;
  style?: CSSProperties;
}

export function Field({ label, htmlFor, children, error, hint, style }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: fontSize.sm,
          fontWeight: fontWeight.medium,
          color: 'var(--text-muted)',
          lineHeight: 1.3,
        }}
      >
        {label}
      </label>
      {hint && (
        <div style={{
          fontSize: fontSize.xs,
          color: 'var(--text-muted)',
          lineHeight: 1.4,
        }}>
          {hint}
        </div>
      )}
      {children}
      {error && (
        <div style={{
          fontSize: fontSize.xs,
          color: 'var(--danger)',
          fontWeight: fontWeight.medium,
          marginTop: 2,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Input ─────────────────────────────────────────────────────────────────

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  value: string | number;
  onChange: (value: string, e: ChangeEvent<HTMLInputElement>) => void;
  invalid?: boolean;
}

export function Input({
  value,
  onChange,
  invalid = false,
  style,
  ...rest
}: InputProps) {
  return (
    <input
      {...rest}
      value={value}
      onChange={e => onChange(e.target.value, e)}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: radius.md,
        border: `1.5px solid ${invalid ? 'var(--danger)' : 'var(--border)'}`,
        background: 'var(--bg)',
        fontSize: fontSize.base,
        fontWeight: fontWeight.medium,
        color: 'var(--text)',
        outline: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

// ─── InfoBox — informační panel (status / help) ────────────────────────────

interface InfoBoxProps {
  variant?: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
  style?: CSSProperties;
}

export function InfoBox({ variant = 'info', children, style }: InfoBoxProps) {
  const colors = {
    info: { bg: 'var(--surface-var)', fg: 'var(--text-muted)' },
    warning: { bg: 'var(--warning-light)', fg: 'var(--warning)' },
    danger: { bg: 'var(--danger-light)', fg: 'var(--danger)' },
    success: { bg: 'var(--success-light)', fg: 'var(--success)' },
  }[variant];

  return (
    <div style={{
      padding: `10px ${spacing.md}px`,
      borderRadius: radius.md,
      background: colors.bg,
      color: colors.fg,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      lineHeight: 1.5,
      ...style,
    }}>
      {children}
    </div>
  );
}
