import type { CSSProperties, ReactNode } from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Z } from '../../utils/z-index';

// ─── Shared dropdown panel styles ──────────────────────────────────────────

/** Reusable dropdown menu that appears below a trigger element.
 *
 * Features:
 * - Consistent styling across the app
 * - Backdrop click to close
 * - Auto-close on item select
 * - Keyboard Escape to close
 */

export interface DropdownItem {
  id: string;
  label: ReactNode;
  /** Left icon/badge */
  icon?: ReactNode;
  /** Right side content (checkmark, count, etc.) */
  right?: ReactNode;
  /** Active/selected state */
  active?: boolean;
  /** Left accent color bar */
  accentColor?: string;
  /** Separator after this item */
  separator?: boolean;
  onClick: () => void;
}

interface DropdownProps {
  /** The trigger button content */
  trigger: ReactNode;
  /** Trigger button style overrides */
  triggerStyle?: CSSProperties;
  /** Menu items */
  items: DropdownItem[];
  /** Dropdown opens on left or right side */
  align?: 'left' | 'right';
  /** Custom header above items */
  header?: ReactNode;
  /** Custom width */
  width?: number | string;
  /** Controlled open state (optional) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Dropdown({
  trigger, triggerStyle, items, align = 'right',
  header, width, open: controlledOpen, onOpenChange,
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = useCallback((v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  }, [onOpenChange]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, setOpen]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!isOpen)}
        style={{
          ...defaultTriggerStyle,
          ...triggerStyle,
        }}
      >
        {trigger}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: Z.sheet - 1 }}
          />
          {/* Panel */}
          <div style={{
            ...panelStyle,
            ...(align === 'left' ? { left: 0 } : { right: 0 }),
            ...(width ? { width, minWidth: 'unset' } : {}),
          }}>
            {header}
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
                style={{
                  ...itemStyle,
                  background: item.active ? 'var(--primary-light, rgba(21,101,192,.08))' : 'transparent',
                  borderLeft: item.accentColor
                    ? `3px solid ${item.accentColor}`
                    : '3px solid transparent',
                  borderBottom: item.separator ? '1px solid var(--border)' : 'none',
                }}
              >
                {item.icon && (
                  <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.icon}
                  </span>
                )}
                <span style={{
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontWeight: item.active ? 700 : 600,
                  color: item.active ? 'var(--primary)' : 'var(--text)',
                }}>
                  {item.label}
                </span>
                {item.right && (
                  <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {item.right}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────

const defaultTriggerStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', cursor: 'pointer',
  padding: 0, margin: 0,
};

export const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  zIndex: Z.sheet,
  background: 'var(--surface)',
  borderRadius: 14,
  border: '1px solid var(--border)',
  boxShadow: '0 8px 32px rgba(0,0,0,.15)',
  minWidth: 200,
  overflow: 'hidden',
};

export const itemStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text)',
  textAlign: 'left',
};

// ─── Icon circle helper ────────────────────────────────────────────────────

export function DropdownIconCircle({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{
      width: 28, height: 28, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: color, flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

// ─── Color dot helper ──────────────────────────────────────────────────────

export function ColorDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: color, flexShrink: 0,
      display: 'inline-block',
      border: '1.5px solid rgba(0,0,0,.1)',
    }} />
  );
}
