/**
 * Stepper — numeric input s − / + tlačítky.
 *
 * Použití:
 * ```tsx
 * <Field label="Počet týmů">
 *   <Stepper value={teamCount} onChange={setTeamCount} min={2} max={32} />
 * </Field>
 *
 * <Stepper value={mins} onChange={setMins} min={0} max={60} step={5} />
 * ```
 *
 * Kanonický replacement pro lokální Stepper komponenty roztroušené napříč
 * `CreateMatchPage`, `TournamentPlannerPage`, `OnboardingWizard`, atd.
 */

import type { CSSProperties } from 'react';
import { radius, fontSize, fontWeight, size as sizeTokens } from '../../theme/tokens';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Volitelný formatter pro zobrazení (např. "5'", "0:30") */
  format?: (v: number) => string;
  /** Aria label pro celý stepper (label řeší obvykle <Field>) */
  'aria-label'?: string;
  style?: CSSProperties;
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  style,
  ...rest
}: Props) {
  const decDisabled = value <= min;
  const incDisabled = value >= max;

  return (
    <div
      role="group"
      aria-label={rest['aria-label']}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'var(--surface-var)',
        borderRadius: radius.md,
        padding: 3,
        ...style,
      }}
    >
      <button
        type="button"
        onClick={() => !decDisabled && onChange(Math.max(min, value - step))}
        disabled={decDisabled}
        aria-label="Decrease"
        style={btnStyle(decDisabled)}
      >
        −
      </button>
      <div style={{
        flex: 1,
        textAlign: 'center',
        fontWeight: fontWeight.extrabold,
        fontSize: fontSize.md,
        color: 'var(--text)',
        userSelect: 'none',
      }}>
        {format ? format(value) : value}
      </div>
      <button
        type="button"
        onClick={() => !incDisabled && onChange(Math.min(max, value + step))}
        disabled={incDisabled}
        aria-label="Increase"
        style={btnStyle(incDisabled)}
      >
        +
      </button>
    </div>
  );
}

function btnStyle(disabled: boolean): CSSProperties {
  return {
    width: sizeTokens.stepperBtn,
    height: sizeTokens.stepperBtn,
    borderRadius: radius.sm,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
    color: disabled ? 'var(--text-disabled)' : 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
  };
}
