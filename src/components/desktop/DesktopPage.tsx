import type { ReactNode } from 'react';

// ─── DesktopPage ──────────────────────────────────────────────────────────────
// Standard desktop page chrome: title row + optional filters + content area.
// Use inside the DesktopShell main slot. Keeps spacing/typography consistent
// across MatchList, TournamentList, Admin, MatchStats etc.

interface Props {
  title: string;
  subtitle?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
}

export function DesktopPage({ title, subtitle, primaryAction, secondaryActions, filters, children }: Props) {
  return (
    <div style={{
      padding: '32px 40px 48px',
      maxWidth: 1400,
      margin: '0 auto',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    }}>
      {/* Header row */}
      <header style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--text)',
            lineHeight: 1.2,
          }}>{title}</h1>
          {subtitle && (
            <p style={{
              marginTop: 6,
              fontSize: 14,
              color: 'var(--text-muted)',
            }}>{subtitle}</p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {secondaryActions}
          {primaryAction}
        </div>
      </header>

      {/* Filters row */}
      {filters && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          {filters}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Reusable primary button styling for desktop ────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export const desktopPrimaryButtonStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '11px 20px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
};

// eslint-disable-next-line react-refresh/only-export-components
export const desktopSecondaryButtonStyle: React.CSSProperties = {
  background: 'var(--surface-var)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
};

// ─── Reusable filter pill ────────────────────────────────────────────────────
export function FilterPill({ active, onClick, children, count }: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--primary)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text-sub)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {children}
      {count !== undefined && (
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          background: active ? 'rgba(255,255,255,0.2)' : 'var(--surface-var)',
          color: active ? '#fff' : 'var(--text-muted)',
          padding: '1px 7px',
          borderRadius: 10,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}
