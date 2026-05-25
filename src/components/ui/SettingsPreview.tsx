/**
 * Settings Preview pattern — Linear/Vercel-style settings rows.
 *
 * Použití: smart defaults jsou viditelné jako řádky, klikni inline editor pro úpravu.
 * Žádný "advanced toggle", žádný kitchen sink. Honza projde očima a pokračuje,
 * Petr klikne na řádky které mu vadí.
 *
 * Použito v:
 *  - TournamentWizardPage (Step 4) — organizační volby (pauza, registrace, fee, pravidla)
 *  - QuickMatchSheet — match format + délka zápasu
 *
 * Komponenty:
 *  - SettingRow: ikona · label · inline editor (border-bottom mezi řádky)
 *  - Toggle: iOS-style switch (lepší než nativní checkbox)
 *  - ChipPair: 2 kompaktní chipy pro binary numeric (1/2)
 *  - CompactNumberInput: number + unit suffix (5 min, 100 Kč), nullable variant
 *  - ExpandableTextEditor: '+ Přidat' tlačítko → expanduje textarea
 */

import { useState, type ReactNode, type CSSProperties } from 'react';

interface SettingRowProps {
  icon: string;
  label: string;
  hint?: string;
  isLast?: boolean;
  children: ReactNode;
}

export function SettingRow({ icon, label, hint, isLast, children }: SettingRowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      minHeight: 44,
    }}>
      <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// iOS-style toggle (vizuálně lepší než nativní checkbox v settings rows)
export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: checked ? 'var(--primary)' : 'var(--border)',
        border: 'none', cursor: 'pointer',
        position: 'relative',
        transition: 'background .2s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3, left: checked ? 21 : 3,
        width: 20, height: 20, borderRadius: 10,
        background: '#fff',
        transition: 'left .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }} />
    </button>
  );
}

// Pair/N chips for inline numeric/string choice
export function ChipPair<T extends number | string>({
  value, options, onChange,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {options.map(opt => {
        const active = value === opt.v;
        return (
          <button
            key={String(opt.v)}
            type="button"
            onClick={() => onChange(opt.v)}
            style={{
              minWidth: 40, minHeight: 36, padding: '8px 12px', borderRadius: 8,
              fontSize: 13, fontWeight: 700,
              background: active ? 'var(--primary)' : 'var(--surface-var)',
              color: active ? '#fff' : 'var(--text-muted)',
              border: active ? 'none' : '1.5px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Compact number input with unit suffix (used inline in settings rows)
// Audit 2026-05-25: type="text" + inputMode="numeric" místo type="number",
// abychom se zbavili desktopových spinner arrows (zabíraly prostor v 60px
// width inputu → render "02↕" místo "20"). Mobile dostane numerickou
// klávesnici stejně skrz inputMode.
export function CompactNumberInput({
  value, min, max, unit, onChange, nullable, width = 64,
}: {
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
  /** Pokud true, hodnota 0 se interně považuje za "—" (nezadáno). */
  nullable?: boolean;
  /** Šířka inputu v px (default 60). */
  width?: number;
}) {
  const isEmpty = nullable && value === 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={isEmpty ? '' : String(value)}
        placeholder={isEmpty ? '—' : undefined}
        onChange={e => {
          // Akceptuj jen číslice (strip whitespace, mínus, atd.)
          const raw = e.target.value.replace(/\D/g, '');
          if (raw === '') { onChange(0); return; }
          const n = parseInt(raw, 10);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        onFocus={e => e.currentTarget.select()}
        style={{
          width, padding: '8px 8px', minHeight: 36,
          fontSize: 16, fontWeight: 700, textAlign: 'center',
          borderRadius: 8, border: '1.5px solid var(--border)',
          background: 'var(--surface)', color: 'var(--text)',
        }}
      />
      {unit && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
          {unit}
        </span>
      )}
    </div>
  );
}

// Expandable text editor — initially shows "+ Přidat", click reveals textarea.
// Once user typed, shows truncated preview + "upravit" button.
export function ExpandableTextEditor({
  value, placeholder, onChange, addLabel, width = 200,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  addLabel: string;
  width?: number;
}) {
  const [open, setOpen] = useState(value.trim().length > 0);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--primary)', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', padding: '4px 8px',
        }}
      >
        + {addLabel}
      </button>
    );
  }
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      style={{
        width, padding: '6px 10px',
        fontSize: 12, lineHeight: 1.4,
        borderRadius: 8, border: '1.5px solid var(--border)',
        background: 'var(--surface)', color: 'var(--text)',
        fontFamily: 'inherit', resize: 'vertical',
      }}
    />
  );
}

/**
 * Container pro Settings Preview — flex column bez vlastního paddingu.
 * Použij uvnitř FormCard nebo vlastní karty.
 */
export function SettingsList({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
      {children}
    </div>
  );
}
