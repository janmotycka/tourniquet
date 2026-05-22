/**
 * MatchFormatSelect — native dropdown pro fotbalový formát.
 *
 * Audit 2026-05-22 Phase 1c: dříve 6 chips (3+1, 4+1, ..., 11+1) přetékaly
 * na 360px mobile screen. Native <select> řeší overflow + dává OS-level picker
 * + accessibility zdarma.
 *
 * Option labels obsahují edukativní hint („5+1 — malá kopaná, 6 hráčů celkem").
 * Pomáhá trenérovi pochopit co znamená co.
 */
import type { MatchFormat } from '../../types/match.types';

interface Props {
  value: MatchFormat;
  onChange: (v: MatchFormat) => void;
  /** Volitelně omezit dostupné formáty (default: všechny). */
  options?: MatchFormat[];
}

const ALL_FORMATS: MatchFormat[] = ['3+1', '4+1', '5+1', '7+1', '8+1', '11+1'];

/**
 * Edukativní hint pro každý formát (cs).
 * 5+1 = 5 hráčů v poli + 1 brankář = 6 celkem.
 */
const FORMAT_DESCRIPTIONS_CS: Record<MatchFormat, string> = {
  '3+1': '3+1 — mini fotbal, 4 hráči celkem',
  '4+1': '4+1 — florbal default, 5 hráčů',
  '5+1': '5+1 — malá kopaná, 6 hráčů',
  '7+1': '7+1 — přípravka, 8 hráčů',
  '8+1': '8+1 — žáci, 9 hráčů',
  '11+1': '11+1 — velké hřiště, 12 hráčů',
};

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
          {FORMAT_DESCRIPTIONS_CS[f]}
        </option>
      ))}
    </select>
  );
}
