import { useEffect, useRef } from 'react';
import { useConfirmStore } from '../store/confirm.store';
import { useI18n } from '../i18n';
import { Z } from '../utils/z-index';

/**
 * Globální potvrzovací modální dialog.
 * Renderuje se jednou v App.tsx, řízený přes useConfirmStore.
 */
export function ConfirmModal() {
  const { t } = useI18n();
  const open = useConfirmStore(s => s.open);
  const options = useConfirmStore(s => s.options);
  const close = useConfirmStore(s => s.close);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus trap — po otevření přesunout focus na potvrzovací tlačítko
  useEffect(() => {
    if (open) {
      confirmBtnRef.current?.focus();
    }
  }, [open]);

  // Esc zavře dialog
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close]);

  if (!open || !options) return null;

  const { title, message, confirmLabel, cancelLabel, destructive } = options;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: Z.confirm,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.5)',
        animation: 'fadeIn .15s ease-out',
      }}
      onClick={() => close(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>

      <div
        style={{
          background: 'var(--surface)', borderRadius: 14,
          padding: 24, maxWidth: 380, width: '90%',
          boxShadow: 'var(--shadow-lg)',
          animation: 'scaleIn .15s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes scaleIn { from { transform: scale(.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>

        <h2 id="confirm-title" style={{ fontWeight: 700, fontSize: 17, margin: '0 0 8px', color: 'var(--text)' }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)', margin: '0 0 20px', whiteSpace: 'pre-line' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={() => close(false)}
            style={{
              padding: '10px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: 'var(--surface-var)', color: 'var(--text)',
              border: '1.5px solid var(--border)', cursor: 'pointer',
            }}
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={() => close(true)}
            style={{
              padding: '10px 18px', borderRadius: 10, fontWeight: 700, fontSize: 14,
              background: destructive ? 'var(--danger)' : 'var(--primary)',
              color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
