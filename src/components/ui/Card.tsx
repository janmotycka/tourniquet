/**
 * Card — surface container pro form sekce, list items, info boxy.
 *
 * Varianty:
 * - **default**: `var(--surface)` bg + 1.5px border + subtle shadow
 * - **plain**: jen bg (`var(--surface)`), bez borderu/shadow — pro nested
 * - **muted**: `var(--surface-var)` bg pro info boxy
 * - **dashed**: border dashed, pro empty state / placeholder
 *
 * Padding preset: sm (12), md (14), lg (16)
 */

import type { ReactNode, CSSProperties, MouseEvent } from 'react';
import { radius, spacing } from '../../theme/tokens';

export type CardVariant = 'default' | 'plain' | 'muted' | 'dashed';
export type CardPadding = 'sm' | 'md' | 'lg' | 'none';

interface Props {
  variant?: CardVariant;
  padding?: CardPadding;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  style?: CSSProperties;
  children: ReactNode;
}

const padMap: Record<CardPadding, number | undefined> = {
  none: undefined,
  sm: spacing.md,    // 12
  md: 14,             // málokde potřebujeme 14 — definujeme ad-hoc
  lg: spacing.lg,     // 16
};

const variantStyles: Record<CardVariant, CSSProperties> = {
  default: {
    background: 'var(--surface)',
    border: '1.5px solid var(--border)',
    boxShadow: 'var(--shadow-sm)',
  },
  plain: {
    background: 'var(--surface)',
  },
  muted: {
    background: 'var(--surface-var)',
  },
  dashed: {
    background: 'var(--surface)',
    border: '1.5px dashed var(--border)',
  },
};

export function Card({
  variant = 'default',
  padding = 'lg',
  onClick,
  style,
  children,
}: Props) {
  const base: CSSProperties = {
    borderRadius: radius.xl, // 14
    padding: padMap[padding],
    cursor: onClick ? 'pointer' : undefined,
    ...variantStyles[variant],
    ...style,
  };

  return (
    <div onClick={onClick} style={base}>
      {children}
    </div>
  );
}
