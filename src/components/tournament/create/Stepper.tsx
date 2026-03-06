interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  unit: string;
}

export function Stepper({ value, min, max, step = 1, onChange, label, unit }: StepperProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{value} {unit}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label="Decrease"
          style={{
            width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
            fontWeight: 700, fontSize: 20, color: value <= min ? 'var(--text-muted)' : 'var(--text)',
          }}
        >−</button>
        <span style={{ fontWeight: 800, fontSize: 18, minWidth: 36, textAlign: 'center', color: 'var(--primary)' }}>{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label="Increase"
          style={{
            width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
            fontWeight: 700, fontSize: 20, color: value >= max ? 'var(--text-muted)' : 'var(--text)',
          }}
        >+</button>
      </div>
    </div>
  );
}
