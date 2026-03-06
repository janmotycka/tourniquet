export function StarRating({ value, onChange }: { value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {([1, 2, 3, 4, 5] as const).map(star => (
        <button
          key={star}
          onClick={() => onChange(star)}
          style={{
            fontSize: 24, lineHeight: 1, padding: 2, borderRadius: 4,
            color: star <= value ? '#FFB300' : '#ccc',
            background: 'none', border: 'none',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
