/**
 * NewMatchPicker — bottom sheet s výběrem typu nového zápasu.
 *
 * 3 varianty:
 *   1. Plný zápas (sezónní, lineup, ratings) — standardní flow
 *   2. Rychlý zápas — bez sestavy, rovnou LIVE (jeden zápas)
 *   3. Den zápasů — ultra-jednoduchý turnaj (víc zápasů + skóre, bez lineupu)
 */

import { useEffect } from 'react';
import { useI18n } from '../../i18n';

interface Props {
  onClose: () => void;
  onFullMatch: () => void;
  onQuickMatch: () => void;
  onMatchEvent: () => void;
  /** Pokud false, skryje rychlý zápas (tenis ho nemá). */
  showQuickMatch?: boolean;
}

export function NewMatchPicker({
  onClose, onFullMatch, onQuickMatch, onMatchEvent, showQuickMatch = true,
}: Props) {
  const { t } = useI18n();

  // Esc zavře
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

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
            {t('match.picker.title')}
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

        <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Plný zápas */}
          <Option
            icon="⚽"
            title={t('match.picker.fullTitle')}
            desc={t('match.picker.fullDesc')}
            onClick={() => { onClose(); onFullMatch(); }}
            primary
          />

          {/* Rychlý zápas (jen fotbal) */}
          {showQuickMatch && (
            <Option
              icon="⚡"
              title={t('match.picker.quickTitle')}
              desc={t('match.picker.quickDesc')}
              onClick={() => { onClose(); onQuickMatch(); }}
            />
          )}

          {/* Den zápasů */}
          <Option
            icon="📊"
            title={t('match.picker.eventTitle')}
            desc={t('match.picker.eventDesc')}
            onClick={() => { onClose(); onMatchEvent(); }}
          />
        </div>
      </div>
    </div>
  );
}

function Option({ icon, title, desc, onClick, primary }: {
  icon: string;
  title: string;
  desc: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '14px 16px', borderRadius: 14,
        background: primary ? 'var(--primary-light)' : 'var(--surface-var)',
        border: primary ? '1.5px solid var(--primary)' : '1px solid var(--border)',
        textAlign: 'left', cursor: 'pointer', width: '100%',
      }}
    >
      <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 800, fontSize: 15,
          color: primary ? 'var(--primary)' : 'var(--text)',
          marginBottom: 2,
        }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {desc}
        </div>
      </div>
      <div style={{
        fontSize: 16, color: primary ? 'var(--primary)' : 'var(--text-muted)',
        alignSelf: 'center', fontWeight: 700,
      }}>
        ›
      </div>
    </button>
  );
}
