import { useState } from 'react';
import type { SeasonMatch, MatchLineupPlayer } from '../../types/match.types';
import { computeElapsed, type TFn } from './match-utils';

interface SubstitutionModalProps {
  match: SeasonMatch;
  onAdd: (sub: { minute: number; playerOutId: string; playerInId: string }) => void;
  onClose: () => void;
  suggestedIn: MatchLineupPlayer[];
  suggestedOut: MatchLineupPlayer[];
  t: TFn;
}

export function SubstitutionModal({ match, onAdd, onClose, suggestedIn, suggestedOut, t }: SubstitutionModalProps) {
  const elapsed = computeElapsed(match);
  const currentMinute = Math.floor(elapsed / 60) + 1;
  const [minute, setMinute] = useState(match.status === 'live' ? currentMinute : 1);
  const [playerOutId, setPlayerOutId] = useState<string>(suggestedOut[0]?.playerId ?? '');
  const [playerInId, setPlayerInId] = useState<string>(suggestedIn[0]?.playerId ?? '');

  const onField = match.lineup.filter(p => p.isStarter);
  const bench = match.lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);

  const handleAdd = () => {
    if (!playerOutId || !playerInId) return;
    onAdd({ minute: Math.max(1, minute), playerOutId, playerInId });
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
          <h3 style={{ fontWeight: 800, fontSize: 18 }}>{t('match.detail.substitution')}</h3>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)', fontWeight: 700 }}>×</button>
        </div>

        {/* Minute */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('match.detail.minute')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMinute(m => Math.max(1, m - 1))}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>−</button>
            <span style={{ fontWeight: 800, fontSize: 22, minWidth: 40, textAlign: 'center', color: '#1565C0' }}>{minute}'</span>
            <button onClick={() => setMinute(m => m + 1)}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>+</button>
          </div>
        </div>

        {/* Player OUT */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#C62828', display: 'block', marginBottom: 6 }}>
            {t('match.detail.playerOut')}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {onField.map(p => (
              <button
                key={p.playerId}
                onClick={() => setPlayerOutId(p.playerId)}
                style={{
                  padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: playerOutId === p.playerId ? '#FFEBEE' : 'var(--bg)',
                  border: `1.5px solid ${playerOutId === p.playerId ? '#C62828' : 'var(--border)'}`,
                  color: playerOutId === p.playerId ? '#C62828' : 'var(--text)',
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 7, background: '#C62828',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>{p.jerseyNumber}</span>
                {p.name}
                {suggestedOut.some(s => s.playerId === p.playerId) && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#C62828', fontWeight: 700 }}>{t('match.detail.recommended')}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Player IN */}
        {bench.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#2E7D32', display: 'block', marginBottom: 6 }}>
              {t('match.detail.playerIn')}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bench.map(p => (
                <button
                  key={p.playerId}
                  onClick={() => setPlayerInId(p.playerId)}
                  style={{
                    padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: playerInId === p.playerId ? '#E8F5E9' : 'var(--bg)',
                    border: `1.5px solid ${playerInId === p.playerId ? '#2E7D32' : 'var(--border)'}`,
                    color: playerInId === p.playerId ? '#2E7D32' : 'var(--text)',
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: 7, background: '#2E7D32',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                  }}>{p.jerseyNumber}</span>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{p.substituteOrder}</span>
                  {suggestedIn.some(s => s.playerId === p.playerId) && (
                    <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 700 }}>{t('match.detail.recommended')}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={!playerOutId || !playerInId}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 16,
            background: (playerOutId && playerInId) ? '#1565C0' : 'var(--border)',
            color: (playerOutId && playerInId) ? '#fff' : 'var(--text-muted)',
          }}
        >
          {t('match.detail.confirmSub')}
        </button>
      </div>
    </div>
  );
}
