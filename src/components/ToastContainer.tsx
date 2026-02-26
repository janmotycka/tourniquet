import { useToastStore, type ToastEntry, type ToastType } from '../store/toast.store';

// ─── Barvy a ikony podle typu ─────────────────────────────────────────────────

const STYLE: Record<ToastType, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: '#1B5E20', border: '#2E7D32', color: '#fff',     icon: '✓' },
  error:   { bg: '#B71C1C', border: '#C62828', color: '#fff',     icon: '✕' },
  warning: { bg: '#E65100', border: '#F57C00', color: '#fff',     icon: '⚠' },
  info:    { bg: '#0D47A1', border: '#1565C0', color: '#fff',     icon: 'ℹ' },
};

// ─── Jeden toast ──────────────────────────────────────────────────────────────

function Toast({ toast }: { toast: ToastEntry }) {
  const dismiss = useToastStore(s => s.dismiss);
  const s = STYLE[toast.type];

  return (
    <div
      role="alert"
      onClick={() => dismiss(toast.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: s.bg, border: `1px solid ${s.border}`,
        color: s.color, borderRadius: 12, padding: '12px 16px',
        boxShadow: '0 4px 20px rgba(0,0,0,.3)',
        cursor: 'pointer', maxWidth: 360, width: '100%',
        animation: 'toastIn 0.2s ease',
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: '50%',
        background: 'rgba(255,255,255,.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 13, flexShrink: 0,
      }}>
        {s.icon}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, flex: 1 }}>
        {toast.message}
      </span>
      <span style={{ fontSize: 16, opacity: 0.7, flexShrink: 0, paddingLeft: 4 }}>✕</span>
    </div>
  );
}

// ─── Kontejner – fixní pozice nahoře ─────────────────────────────────────────

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8,
        alignItems: 'center', width: '100%', maxWidth: 400, padding: '0 16px',
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{ width: '100%', pointerEvents: 'auto' }}>
            <Toast toast={t} />
          </div>
        ))}
      </div>
    </>
  );
}
