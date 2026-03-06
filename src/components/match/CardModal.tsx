import { useState } from 'react';
import type { SeasonMatch, MatchCard } from '../../types/match.types';
import { computeElapsed, type TFn } from './match-utils';

interface CardModalProps {
  match: SeasonMatch;
  onAdd: (card: Omit<MatchCard, 'id' | 'recordedAt'>) => void;
  onClose: () => void;
  t: TFn;
}

export function CardModal({ match, onAdd, onClose, t }: CardModalProps) {
  const elapsed = computeElapsed(match);
  const currentMinute = Math.floor(elapsed / 60) + 1;
  const [minute, setMinute] = useState(match.status === 'live' ? currentMinute : 1);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [type, setType] = useState<'yellow' | 'red' | 'yellow-red'>('yellow');

  const onFieldPlayers = match.lineup.filter(p => p.isStarter);

  const handleAdd = () => {
    if (!playerId) return;
    onAdd({ playerId, type, minute: Math.max(1, minute) });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px',
          width: '100%', maxHeight: '85dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 18 }}>{t('match.detail.card')}</h3>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)', fontWeight: 700 }}>×</button>
        </div>

        {/* Type */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {([['yellow', t('match.detail.yellowCard')], ['red', t('match.detail.redCard')], ['yellow-red', t('match.detail.yellowRed')]] as [string, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setType(v as 'yellow' | 'red' | 'yellow-red')}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: type === v ? (v === 'yellow' ? '#FFF9C4' : v === 'red' ? '#FFEBEE' : '#FFF3E0') : 'var(--surface-var)',
                color: type === v ? (v === 'yellow' ? '#F9A825' : v === 'red' ? '#C62828' : '#E65100') : 'var(--text-muted)',
                border: `2px solid ${type === v ? 'currentColor' : 'transparent'}`,
              }}
            >{label}</button>
          ))}
        </div>

        {/* Minute */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('match.detail.minute')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMinute(m => Math.max(1, m - 1))}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>−</button>
            <span style={{ fontWeight: 800, fontSize: 22, minWidth: 40, textAlign: 'center', color: '#1565C0' }}>{minute}'</span>
            <button onClick={() => setMinute(m => m + 1)}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>+</button>
          </div>
        </div>

        {/* Player */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('match.detail.player')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {onFieldPlayers.map(p => (
              <button
                key={p.playerId}
                onClick={() => setPlayerId(p.playerId)}
                style={{
                  padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: playerId === p.playerId ? '#E3F2FD' : 'var(--bg)',
                  border: `1.5px solid ${playerId === p.playerId ? '#1565C0' : 'var(--border)'}`,
                  color: playerId === p.playerId ? '#1565C0' : 'var(--text)',
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 7, background: '#1565C0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>{p.jerseyNumber}</span>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={!playerId}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 16,
            background: playerId ? '#1565C0' : 'var(--border)', color: playerId ? '#fff' : 'var(--text-muted)',
          }}
        >
          {t('match.detail.addCard')}
        </button>
      </div>
    </div>
  );
}
