/**
 * CollapsibleSection — sdílený accordion pattern pro form sekce.
 *
 * Audit 2026-05-22 Phase 1a: QuickMatchSheet měl ~6 duplicate accordion
 * patterns (Soupiska, Datum a čas, Místo konání, Soutěž a kategorie,
 * Pokročilá nastavení, atd.). Extracted do shared komponenty.
 *
 * Design:
 * - Header s emoji icon + label + optional summary chip
 * - Chevron ▼ rotuje při expand (180°)
 * - Background shift při expanded (surface-var → primary-light)
 * - Border color shift (border → primary)
 * - Smooth transition .15s
 *
 * Tap target: 44+ px tall (Apple HIG min). padding 9 12 + content 18+13=31.
 *
 * Usage:
 *   <CollapsibleSection
 *     icon="📍"
 *     label="Místo konání"
 *     summary={venue && `(${venue})`}
 *     expanded={open}
 *     onToggle={() => setOpen(v => !v)}
 *   >
 *     ...content...
 *   </CollapsibleSection>
 */
import type { ReactNode } from 'react';

interface Props {
  /** Emoji nebo ikona před labelem (např. „📍", „🎯"). */
  icon: string;
  /** Hlavní label sekce. */
  label: string;
  /** Volitelný summary text vedle labelu (např. „(Dnes 19:33)"). */
  summary?: string | false | null;
  /** Expanded state — controlled by parent. */
  expanded: boolean;
  /** Toggle handler. */
  onToggle: () => void;
  /** Obsah který se zobrazí když expanded. */
  children: ReactNode;
  /** Volitelný extra margin nad sekcí. */
  marginTop?: number;
}

export function CollapsibleSection({
  icon,
  label,
  summary,
  expanded,
  onToggle,
  children,
  marginTop,
}: Props) {
  return (
    <div style={marginTop ? { marginTop } : undefined}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 12px', borderRadius: 10,
          background: expanded ? 'var(--primary-light)' : 'var(--surface-var)',
          border: `1.5px solid ${expanded ? 'var(--primary)' : 'var(--border)'}`,
          cursor: 'pointer', textAlign: 'left',
          transition: 'background .15s, border-color .15s',
          minHeight: 44,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 700,
          color: expanded ? 'var(--primary)' : 'var(--text)',
        }}>
          {label}
          {summary && (
            <span style={{
              marginLeft: 6, fontSize: 11,
              color: 'var(--text-muted)', fontWeight: 600,
            }}>
              {summary}
            </span>
          )}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: expanded ? 'var(--primary)' : 'var(--text-muted)',
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform .2s',
        }}>
          ▼
        </span>
      </button>
      {expanded && children}
    </div>
  );
}
