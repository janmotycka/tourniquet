import { useState } from 'react';
import type { SeasonMatch, MatchGoal } from '../../types/match.types';
import { computeElapsed, type TFn } from './match-utils';

interface GoalModalProps {
  match: SeasonMatch;
  isOpponentGoal: boolean;
  onAdd: (goal: Omit<MatchGoal, 'id' | 'recordedAt'>) => void;
  onClose: () => void;
  t: TFn;
}

export function GoalModal({ match, isOpponentGoal, onAdd, onClose, t }: GoalModalProps) {
  const elapsed = computeElapsed(match);
  const currentMinute = Math.floor(elapsed / 60) + 1;
  const [minute, setMinute] = useState(match.status === 'live' ? currentMinute : 1);
  const [scorerId, setScorerId] = useState<string | null>(null);
  const [assistId, setAssistId] = useState<string | null>(null);
  const [isOwnGoal, setIsOwnGoal] = useState(false);

  const onFieldPlayers = match.lineup.filter(p => p.isStarter);

  const handleAdd = () => {
    onAdd({
      scorerId: isOwnGoal || isOpponentGoal ? null : scorerId,
      assistId: isOwnGoal || isOpponentGoal ? null : assistId,
      isOwnGoal,
      isOpponentGoal,
      minute: Math.max(1, minute),
    });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px',
          width: '100%', maxWidth: 480, maxHeight: '85dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 18 }}>
            ⚽ {isOpponentGoal ? t('match.detail.opponentGoal') : t('match.detail.ourGoal')}
          </h3>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)', fontWeight: 700 }}>×</button>
        </div>

        {/* Minute */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('match.detail.minute')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMinute(m => Math.max(1, m - 1))}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>−</button>
            <span style={{ fontWeight: 800, fontSize: 22, minWidth: 40, textAlign: 'center', color: 'var(--primary)' }}>{minute}'</span>
            <button onClick={() => setMinute(m => m + 1)}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>+</button>
          </div>
        </div>

        {!isOpponentGoal && (
          <>
            {/* Own goal toggle */}
            <button
              onClick={() => setIsOwnGoal(v => !v)}
              style={{
                marginBottom: 14, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: isOwnGoal ? '#FFEBEE' : 'var(--surface-var)',
                color: isOwnGoal ? '#C62828' : 'var(--text-muted)',
                border: `1.5px solid ${isOwnGoal ? '#FFCDD2' : 'var(--border)'}`,
              }}
            >
              {isOwnGoal ? t('match.detail.ownGoalConfirmed') : t('match.detail.ownGoal')}
            </button>

            {!isOwnGoal && (
              <>
                {/* Scorer */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    {t('match.detail.scorer')}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button
                      onClick={() => setScorerId(null)}
                      style={{
                        padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                        background: scorerId === null ? 'var(--primary-light)' : 'var(--bg)',
                        border: `1.5px solid ${scorerId === null ? 'var(--primary)' : 'var(--border)'}`,
                        color: scorerId === null ? 'var(--primary)' : 'var(--text-muted)',
                      }}
                    >
                      {t('match.detail.unknownScorer')}
                    </button>
                    {onFieldPlayers.map(p => (
                      <button
                        key={p.playerId}
                        onClick={() => setScorerId(p.playerId)}
                        style={{
                          padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: scorerId === p.playerId ? 'var(--primary-light)' : 'var(--bg)',
                          border: `1.5px solid ${scorerId === p.playerId ? 'var(--primary)' : 'var(--border)'}`,
                          color: scorerId === p.playerId ? 'var(--primary)' : 'var(--text)',
                        }}
                      >
                        <span style={{
                          width: 26, height: 26, borderRadius: 7, background: 'var(--primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                        }}>{p.jerseyNumber}</span>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Assist */}
                {scorerId && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                      {t('match.detail.assist')}
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        onClick={() => setAssistId(null)}
                        style={{
                          padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                          background: assistId === null ? 'var(--bg)' : 'var(--bg)',
                          border: '1.5px solid var(--border)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {t('match.detail.noAssist')}
                      </button>
                      {onFieldPlayers.filter(p => p.playerId !== scorerId).map(p => (
                        <button
                          key={p.playerId}
                          onClick={() => setAssistId(p.playerId)}
                          style={{
                            padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: assistId === p.playerId ? 'var(--primary-light)' : 'var(--bg)',
                            border: `1.5px solid ${assistId === p.playerId ? 'var(--primary)' : 'var(--border)'}`,
                            color: assistId === p.playerId ? 'var(--primary)' : 'var(--text)',
                          }}
                        >
                          <span style={{
                            width: 26, height: 26, borderRadius: 7, background: 'var(--surface-var)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: 'var(--text)', flexShrink: 0,
                          }}>{p.jerseyNumber}</span>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <button
          onClick={handleAdd}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, fontWeight: 800, fontSize: 16,
            background: 'var(--primary)', color: '#fff', marginTop: 8,
          }}
        >
          {t('match.detail.addGoal')}
        </button>
      </div>
    </div>
  );
}
