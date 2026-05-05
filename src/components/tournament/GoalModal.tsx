import { useState } from 'react';
import type { Match, Team, Goal, Player } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { computeCurrentMinute } from '../../utils/tournament-schedule';
import { textOnColor, isLightColor } from '../../utils/team-colors';

export function GoalModal({ match, teams, onAdd, onClose }: {
  match: Match;
  teams: Team[];
  onAdd: (goal: Omit<Goal, 'id' | 'recordedAt'>) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [scoringTeamId, setScoringTeamId] = useState(match.homeTeamId);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isOwnGoal, setIsOwnGoal] = useState(false);
  // Auto-minuta z timeru (pokud live), jinak 1
  const [minute, setMinute] = useState(() =>
    match.status === 'live' ? computeCurrentMinute(match.startedAt, match.pausedAt, match.pausedElapsed) : 1
  );
  const [ownGoalTeamId, setOwnGoalTeamId] = useState(match.homeTeamId);

  const scoringTeam = teams.find(tm => tm.id === scoringTeamId);

  const handleAdd = () => {
    onAdd({
      teamId: isOwnGoal ? ownGoalTeamId : scoringTeamId,
      playerId: isOwnGoal ? null : playerId,
      isOwnGoal,
      minute,
    });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '85dvh', overflowY: 'auto', padding: '0 0 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontWeight: 800, fontSize: 18 }}>⚽ {t('tournament.detail.addGoal')}</h2>
            <button onClick={onClose} aria-label={t('common.close')} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
          </div>

          {/* Vlastní gól toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setIsOwnGoal(false)} style={{
              flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: !isOwnGoal ? 'var(--primary)' : 'var(--surface-var)',
              color: !isOwnGoal ? '#fff' : 'var(--text)',
            }}>{t('tournament.detail.addGoal')}</button>
            <button onClick={() => setIsOwnGoal(true)} style={{
              flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: isOwnGoal ? 'var(--danger)' : 'var(--surface-var)',
              color: isOwnGoal ? '#fff' : 'var(--text)',
            }}>{t('tournament.detail.ownGoal')}</button>
          </div>

          {/* Výběr týmu / hráče */}
          {!isOwnGoal ? (
            <>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.detail.goalTeam')}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[match.homeTeamId, match.awayTeamId].map(tid => {
                    const tm = teams.find(x => x.id === tid);
                    return (
                      <button key={tid} onClick={() => { setScoringTeamId(tid); setPlayerId(null); }} style={{
                        flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                        background: scoringTeamId === tid ? tm?.color ?? 'var(--primary)' : 'var(--surface-var)',
                        color: scoringTeamId === tid ? textOnColor(tm?.color ?? '#1a3c6e') : 'var(--text)',
                        boxShadow: scoringTeamId === tid && tm?.color && isLightColor(tm.color) ? 'inset 0 0 0 2px rgba(0,0,0,0.15)' : undefined,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                        {tm?.logoBase64 ? (
                          <img src={tm.logoBase64} alt="" style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover' }} />
                        ) : null}
                        {tm?.name ?? '?'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {scoringTeam && scoringTeam.players.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.detail.scorer')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    <button onClick={() => setPlayerId(null)} style={{
                      padding: '8px 12px', borderRadius: 8, textAlign: 'left', fontWeight: 600, fontSize: 14,
                      background: playerId === null ? 'var(--primary-light)' : 'var(--surface-var)',
                      color: playerId === null ? 'var(--primary)' : 'var(--text)',
                      border: playerId === null ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                    }}>
                      {t('tournament.detail.noScorer')}
                    </button>
                    {scoringTeam.players.map((p: Player) => (
                      <button key={p.id} onClick={() => setPlayerId(p.id)} style={{
                        padding: '8px 12px', borderRadius: 8, textAlign: 'left', fontSize: 14,
                        background: playerId === p.id ? 'var(--primary-light)' : 'var(--surface-var)',
                        color: playerId === p.id ? 'var(--primary)' : 'var(--text)',
                        border: playerId === p.id ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: 6, background: scoringTeam.color,
                          color: textOnColor(scoringTeam.color), fontWeight: 700, fontSize: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          boxShadow: isLightColor(scoringTeam.color) ? 'inset 0 0 0 1.5px rgba(0,0,0,0.15)' : undefined,
                        }}>{p.jerseyNumber}</span>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.detail.ownGoalTeam')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[match.homeTeamId, match.awayTeamId].map(tid => {
                  const tm = teams.find(x => x.id === tid);
                  return (
                    <button key={tid} onClick={() => setOwnGoalTeamId(tid)} style={{
                      flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                      background: ownGoalTeamId === tid ? 'var(--danger)' : 'var(--surface-var)',
                      color: ownGoalTeamId === tid ? '#fff' : 'var(--text)',
                    }}>{tm?.name ?? '?'}</button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Minuta */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t('tournament.detail.goalMinute')}</div>
              {match.status === 'live' && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('tournament.detail.goalMinuteHint')}</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setMinute(m => Math.max(1, m - 1))} aria-label="Decrease" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-var)', fontWeight: 700, fontSize: 16 }}>−</button>
              <span style={{ fontWeight: 800, fontSize: 18, minWidth: 32, textAlign: 'center', color: 'var(--primary)' }}>{minute}</span>
              <button onClick={() => setMinute(m => Math.min(120, m + 1))} aria-label="Increase" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-var)', fontWeight: 700, fontSize: 16 }}>+</button>
            </div>
          </div>

          <button onClick={handleAdd} style={{
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 16,
            padding: '14px', borderRadius: 12, marginTop: 4,
          }}>
            {t('match.detail.addGoal')}
          </button>
        </div>
      </div>
    </div>
  );
}
