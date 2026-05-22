/**
 * MatchFormatSelect — native dropdown pro fotbalový formát.
 *
 * Audit 2026-05-22 Phase 1c: dříve 6 chips (3+1, 4+1, ..., 11+1) přetékaly
 * na 360px mobile screen. Native <select> řeší overflow + dává OS-level picker
 * + accessibility zdarma.
 *
 * Audit 2026-05-22 Phase 3 review: edukativní popisky („florbal default")
 * matou trenéra („proč mi tam visí florbal?"). Necháváme jen format string
 * — trenér ví co je co.
 */
import type { MatchFormat } from '../../types/match.types';

interface Props {
  value: MatchFormat;
  onChange: (v: MatchFormat) => void;
  /** Volitelně omezit dostupné formáty (default: všechny). */
  options?: MatchFormat[];
}

const ALL_FORMATS: MatchFormat[] = ['3+1', '4+1', '5+1', '7+1', '8+1', '11+1'];

export function MatchFormatSelect({ value, onChange, options }: Props) {
  const formats = options ?? ALL_FORMATS;

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as MatchFormat)}
      style={{
        padding: '8px 30px 8px 12px',
        borderRadius: 8,
        border: '1.5px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        outline: 'none',
        minHeight: 36,
        appearance: 'none',
        WebkitAppearance: 'none',
        // Custom dropdown arrow (chevron-down) přes background SVG
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
      }}
    >
      {formats.map(f => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
  );
}
