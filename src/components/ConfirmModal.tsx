import { useEffect, useRef, useState } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [typedText, setTypedText] = useState('');

  // Focus trap — po otevření přesunout focus na správné místo (input > button)
  useEffect(() => {
    if (!open) { setTypedText(''); return; }
    const hasInput = !!options?.requireTypeText;
    if (hasInput) {
      inputRef.current?.focus();
    } else {
      confirmBtnRef.current?.focus();
    }
  }, [open, options?.requireTypeText]);

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

  const { title, message, confirmLabel, cancelLabel, destructive, requireTypeText, requireTypeTextLabel } = options;
  const needsType = !!requireTypeText;
  const typeMatches = !needsType || typedText === requireTypeText;

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
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)', margin: '0 0 16px', whiteSpace: 'pre-line' }}>
          {message}
        </p>

        {/* Retype-to-confirm guard — user musí přepsat přesný text (název klubu) */}
        {needsType && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              {requireTypeTextLabel ?? t('confirm.typeToConfirm', { text: requireTypeText! })}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typedText}
              onChange={e => setTypedText(e.target.value)}
              placeholder={requireTypeText}
              autoComplete="off"
              spellCheck={false}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', borderRadius: 10,
                fontSize: 14, fontFamily: 'monospace',
                border: `1.5px solid ${typeMatches ? 'var(--success, #22c55e)' : 'var(--border)'}`,
                background: 'var(--surface-var)', color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>
        )}

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
            disabled={!typeMatches}
            style={{
              padding: '10px 18px', borderRadius: 10, fontWeight: 700, fontSize: 14,
              background: !typeMatches
                ? 'var(--border)'
                : destructive ? 'var(--danger)' : 'var(--primary)',
              color: !typeMatches ? 'var(--text-muted)' : '#fff',
              border: 'none',
              cursor: !typeMatches ? 'not-allowed' : 'pointer',
              opacity: !typeMatches ? 0.7 : 1,
            }}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
