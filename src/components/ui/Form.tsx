/**
 * Sdílené formulářové komponenty pro sjednocené vizuální styly napříč
 * create-stránkami (CreateMatchPage, CreateMatchEventPage, QuickTournamentPage,
 * onboarding atd.).
 *
 * Pattern vizuálně vychází z CreateMatchPage:
 * - FormCard: 'karta' na var(--surface), borderRadius 14, padding 16, gap 12
 * - SectionTitle: h3, fontWeight 700, fontSize 15
 * - FormField: label + control s konzistentním spacing
 * - SelectionTiles: grid se tlačítky (aktivní = primary/white, inaktivní = surface-var)
 */

import type { CSSProperties, ReactNode } from 'react';

// ─── FormCard ────────────────────────────────────────────────────────────────

export function FormCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── SectionTitle ───────────────────────────────────────────────────────────

export function SectionTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <h3 style={{
      fontWeight: 700, fontSize: 15, color: 'var(--text)', margin: 0,
      ...style,
    }}>
      {children}
    </h3>
  );
}

// ─── FormField ──────────────────────────────────────────────────────────────

export function FormField({
  id, label, required, hint, children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} style={{
        display: 'block', fontSize: 12, fontWeight: 600,
        color: 'var(--text-muted)', marginBottom: 6,
      }}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && (
        <div style={{
          fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4,
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ─── FormInput ──────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const formInputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)',
  fontSize: 14, outline: 'none',
};

// ─── SelectionTile — jeden výběr ze mřížky ──────────────────────────────────

export function SelectionTile({
  active, onClick, icon, label, disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon?: string;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '14px 10px', borderRadius: 12, fontWeight: 700, fontSize: 13,
        background: active ? 'var(--primary)' : 'var(--surface-var)',
        color: active ? '#fff' : 'var(--text-muted)',
        border: active ? 'none' : '1.5px solid var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
      }}
    >
      {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

// ─── SelectionTiles — řada výběru ──────────────────────────────────────────

export function SelectionTiles({
  children, style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, ...style }}>
      {children}
    </div>
  );
}

// ─── PrimaryButton ──────────────────────────────────────────────────────────

export function PrimaryButton({
  children, onClick, disabled, style, type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '14px', borderRadius: 12,
        background: disabled ? 'var(--border)' : 'var(--primary)',
        color: disabled ? 'var(--text-muted)' : '#fff',
        border: 'none',
        fontSize: 15, fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
