/**
 * PageHeader — kanonický header pro stránky s back buttonem a titulkem.
 *
 * Nahrazuje opakující se pattern:
 * ```tsx
 * <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', ... }}>
 *   <button onClick={...} style={{ width: 36, height: 36, ... }}>←</button>
 *   <div>
 *     <h1>Title</h1>
 *     <div>Subtitle</div>
 *   </div>
 *   <button>Action</button>
 * </div>
 * ```
 *
 * Použití:
 * ```tsx
 * <PageHeader
 *   title={t('clubs.title')}
 *   subtitle={t('clubs.moduleDesc')}
 *   onBack={() => navigate({ name: 'home' })}
 *   action={<Button variant="primary">+ Nový</Button>}
 * />
 * ```
 *
 * Varianta: `inset` — bez borderBottom + s body padding (pro use case
 * TournamentCreateChoicePage, kde header je součást scrollovatelného obsahu).
 */

import type { ReactNode } from 'react';
import { fontSize, fontWeight, spacing } from '../../theme/tokens';
import { IconButton } from './Button';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  action?: ReactNode;
  /**
   * Varianta headeru:
   * - `bar` (default) — pevný header s borderBottom, surface background
   * - `inset` — inline header bez borderu, inherits page background
   */
  variant?: 'bar' | 'inset';
}

export function PageHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Zpět',
  action,
  variant = 'bar',
}: Props) {
  const isBar = variant === 'bar';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md,
      padding: isBar ? '16px 20px' : `${spacing.lg}px 0 ${spacing.sm}px`,
      borderBottom: isBar ? '1px solid var(--border)' : undefined,
      background: isBar ? 'var(--surface)' : 'transparent',
      flexShrink: 0,
    }}>
      {onBack && (
        <IconButton variant="secondary" aria-label={backLabel} onClick={onBack}>
          ←
        </IconButton>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{
          fontSize: fontSize.lg,     // 18
          fontWeight: fontWeight.extrabold,
          lineHeight: 1.2,
          margin: 0,
          color: 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: fontSize.sm,
            color: 'var(--text-muted)',
            margin: '2px 0 0',
            lineHeight: 1.3,
          }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
