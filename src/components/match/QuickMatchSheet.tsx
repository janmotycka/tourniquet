/**
 * QuickMatchSheet — inline bottom sheet pro vytvoření rychlého zápasu.
 *
 * Nahrazuje `window.prompt` (nekonzistentní nativní dialog) za integrovaný
 * bottom sheet ve stejném stylu jako NewMatchPicker / ShareMatchSheet.
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';

interface Props {
  onClose: () => void;
  onCreate: (opponent: string, roster: string[]) => void;
}

export function QuickMatchSheet({ onClose, onCreate }: Props) {
  const { t } = useI18n();
  const [opponent, setOpponent] = useState('');
  const [rosterText, setRosterText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus po malém delay (čeká na slide-in animaci)
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleStart = () => {
    // Roster: jedno jméno na řádek. Prázdné řádky vynecháme.
    const roster = rosterText
      .split(/\r?\n/)
      .map(n => n.trim())
      .filter(n => n.length > 0);
    onCreate(opponent, roster);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'fadeIn .2s ease',
      }}
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, padding: '0 0 24px',
          animation: 'slideUp .25s ease',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 18px 14px',
        }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
            ⚡ {t('match.list.quickMatch')}
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: 'var(--primary-light)', borderRadius: 10,
            padding: '10px 12px', fontSize: 12, color: 'var(--primary)',
            lineHeight: 1.45,
          }}>
            💡 {t('match.list.quickMatchHint')}
          </div>

          <div>
            <label htmlFor="quick-opponent" style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text)' }}>
              {t('match.quickSheet.opponentLabel')}
            </label>
            <input
              id="quick-opponent"
              ref={inputRef}
              type="text"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              placeholder={t('match.quickSheet.opponentPlaceholder')}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '12px 14px', borderRadius: 12,
                border: '1.5px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)',
                fontSize: 15, outline: 'none',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {t('match.quickSheet.opponentHint')}
            </div>
          </div>

          {/* Roster (volitelné) — hráči se dají manuálně zadat bez vazby na klub */}
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', padding: '6px 0' }}>
              👥 {t('match.quickSheet.rosterToggle')}
            </summary>
            <div style={{ marginTop: 10 }}>
              <textarea
                value={rosterText}
                onChange={e => setRosterText(e.target.value)}
                placeholder={t('match.quickSheet.rosterPlaceholder')}
                rows={5}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px', borderRadius: 10,
                  border: '1.5px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: 14, outline: 'none', resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                {t('match.quickSheet.rosterHint')}
              </div>
            </div>
          </details>

          <button
            onClick={handleStart}
            style={{
              padding: '14px', borderRadius: 12,
              background: 'var(--primary)', color: '#fff', border: 'none',
              fontWeight: 800, fontSize: 15, cursor: 'pointer',
              marginTop: 4, boxShadow: 'var(--shadow-sm)',
            }}
          >
            ⚡ {t('match.quickSheet.startCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
