import { useState, useEffect } from 'react';
import type { Tournament, Match, Goal, Player } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { useConfirmStore } from '../../store/confirm.store';
import { computeMatchElapsed } from '../../utils/tournament-schedule';
import { textOnColor, isLightColor } from '../../utils/team-colors';
import { GoalModal } from './GoalModal';

export function ScoreModal({ match, tournament, onClose, onStart, onFinish, onAddGoal, onRemoveLastGoal, onRemoveGoal, onUpdateGoalPlayer, onReopen, onReset }: {
  match: Match;
  tournament: Tournament;
  onClose: () => void;
  onStart: () => void;
  onFinish: () => void;
  onAddGoal: (goal: Omit<Goal, 'id' | 'recordedAt'>) => void;
  onRemoveLastGoal: () => void;
  onRemoveGoal: (goalId: string) => void;
  onUpdateGoalPlayer: (goalId: string, playerId: string | null) => void;
  onReopen: () => void;
  onReset: () => void;
}) {
  const [showGoalModal, setShowGoalModal] = useState<'home' | 'away' | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const { t } = useI18n();
  const ask = useConfirmStore(s => s.ask);
  const [elapsed, setElapsed] = useState(() => computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
  const homeTeam = tournament.teams.find(tm => tm.id === match.homeTeamId);
  const awayTeam = tournament.teams.find(tm => tm.id === match.awayTeamId);

  // Timer — aktualizace každou sekundu jen když live a není pauza
  useEffect(() => {
    if (match.status !== 'live') return;
    if (match.pausedAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- timer: initial sync before interval
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
      return;
    }
    setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    const interval = setInterval(() => {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [match.status, match.startedAt, match.pausedAt, match.pausedElapsed]);

  const durationSec = match.durationMinutes * 60;
  const remaining = durationSec - elapsed;
  const isOvertime = remaining < 0;
  const isPausedModal = match.status === 'live' && !!match.pausedAt;
  // Countdown display
  const displaySec = isOvertime ? -remaining : remaining;
  const timerMM = Math.floor(displaySec / 60).toString().padStart(2, '0');
  const timerSS = (displaySec % 60).toString().padStart(2, '0');
  const timerLabel = isOvertime ? `+${timerMM}:${timerSS}` : `${timerMM}:${timerSS}`;
  const timerColor = isPausedModal ? '#E65100' : isOvertime ? '#C62828' : remaining <= 60 ? '#E65100' : 'var(--text)';

  const handleGoalModalAdd = (goal: Omit<Goal, 'id' | 'recordedAt'>) => {
    onAddGoal(goal);
    setShowGoalModal(null);
  };

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--surface)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480,
          padding: '0 0 32px', maxHeight: '92dvh', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
          </div>

          <div style={{ padding: '8px 20px 0' }}>
            {/* Status + čas */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                background: match.status === 'live' ? '#FFEBEE' : match.status === 'finished' ? '#F3E5F5' : 'var(--surface-var)',
                color: match.status === 'live' ? '#C62828' : match.status === 'finished' ? '#6A1B9A' : 'var(--text-muted)',
              }}>
                {match.status === 'live' ? t('tournament.public.live') : match.status === 'finished' ? `✅ ${t('match.played')}` : `🕐 ${t('match.scheduled')}`}
              </span>
              {/* Timer — countdown */}
              {match.status === 'live' && (
                <span style={{
                  fontWeight: 800, fontSize: 18, color: timerColor,
                  fontVariantNumeric: 'tabular-nums',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {isPausedModal && <span style={{ fontSize: 13 }}>⏸</span>}
                  {timerLabel}
                  {isOvertime && <span style={{ fontSize: 12, marginLeft: 2 }}>{t('match.detail.overtime')}</span>}
                </span>
              )}
              <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
            </div>

            {/* Live score */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {homeTeam?.logoBase64 ? (
                  <img src={homeTeam.logoBase64} alt={homeTeam.name} style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', margin: '0 auto 5px', display: 'block' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: homeTeam?.color ?? '#ccc', margin: '0 auto 5px' }} />
                )}
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {homeTeam?.name ?? '?'}
                </div>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 48, lineHeight: 1, color: 'var(--text)', letterSpacing: -2 }}>
                  {match.homeScore}<span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>:</span>{match.awayScore}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {awayTeam?.logoBase64 ? (
                  <img src={awayTeam.logoBase64} alt={awayTeam.name} style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', margin: '0 auto 5px', display: 'block' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: awayTeam?.color ?? '#ccc', margin: '0 auto 5px' }} />
                )}
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {awayTeam?.name ?? '?'}
                </div>
              </div>
            </div>

            {/* +1 Gól tlačítka (jen živý zápas) */}
            {match.status === 'live' && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <button onClick={() => setShowGoalModal('home')} style={{
                  flex: 1, background: homeTeam?.color ?? 'var(--primary)',
                  color: textOnColor(homeTeam?.color ?? '#1a3c6e'),
                  fontWeight: 800, fontSize: 20, padding: '18px 10px', borderRadius: 14,
                  boxShadow: homeTeam?.color && isLightColor(homeTeam.color) ? 'inset 0 0 0 2px rgba(0,0,0,0.15)' : undefined,
                }}>
                  +1 ⚽<br />
                  <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>{homeTeam?.name}</span>
                </button>
                <button onClick={() => setShowGoalModal('away')} style={{
                  flex: 1, background: awayTeam?.color ?? '#666',
                  color: textOnColor(awayTeam?.color ?? '#666'),
                  fontWeight: 800, fontSize: 20, padding: '18px 10px', borderRadius: 14,
                  boxShadow: awayTeam?.color && isLightColor(awayTeam.color) ? 'inset 0 0 0 2px rgba(0,0,0,0.15)' : undefined,
                }}>
                  +1 ⚽<br />
                  <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>{awayTeam?.name}</span>
                </button>
              </div>
            )}

            {/* Historie gólů */}
            {match.goals.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {/* Edit mód hlavička — pro live i finished */}
                {(match.status === 'finished' || match.status === 'live') && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                    <button
                      onClick={() => { setEditMode(e => !e); setEditingGoalId(null); }}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                        background: editMode ? '#FFF3E0' : 'var(--surface-var)',
                        color: editMode ? '#E65100' : 'var(--text-muted)',
                        border: editMode ? '1px solid #FFB74D' : '1px solid transparent',
                      }}
                    >
                      {editMode ? `✅ ${t('common.close')}` : `✏️ ${t('common.edit')}`}
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[...match.goals].sort((a, b) => a.minute - b.minute).map(g => {
                    const team = tournament.teams.find(t => t.id === g.teamId);
                    const player = team?.players.find((p: Player) => p.id === g.playerId);
                    const beneficiaryId = g.isOwnGoal
                      ? (g.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId)
                      : g.teamId;
                    const isHomeGoal = beneficiaryId === match.homeTeamId;
                    const playerLabel = g.isOwnGoal
                      ? `⚠️ VG (${team?.name ?? '?'})`
                      : player ? `${player.jerseyNumber}. ${player.name}` : 'bez střelce';
                    const homeBeneficiary = tournament.teams.find(t => t.id === match.homeTeamId);
                    const awayBeneficiary = tournament.teams.find(t => t.id === match.awayTeamId);
                    const isEditing = editMode && editingGoalId === g.id;
                    const scoringTeam = tournament.teams.find(t => t.id === beneficiaryId);

                    return (
                      <div key={g.id}>
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 32px 1fr', gap: 4, alignItems: 'center',
                        }}>
                          {/* Domácí strana */}
                          {isHomeGoal ? (
                            <button
                              onClick={() => editMode && setEditingGoalId(isEditing ? null : g.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5, textAlign: 'left',
                                background: isEditing ? '#FFF3E0' : 'var(--surface-var)',
                                borderRadius: 6, padding: '4px 6px 4px 4px',
                                borderLeft: `3px solid ${homeBeneficiary?.color ?? 'var(--primary)'}`,
                                outline: isEditing ? '2px solid #FFB74D' : 'none',
                                cursor: editMode ? 'pointer' : 'default',
                              }}
                            >
                              <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: homeBeneficiary?.color ?? 'var(--primary)' }} />
                              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                ⚽ {playerLabel}
                              </span>
                              {editMode && <span style={{ fontSize: 10, color: '#E65100', fontWeight: 700, flexShrink: 0 }}>✏️</span>}
                            </button>
                          ) : <div />}

                          <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                            {g.minute}'
                          </div>

                          {/* Hosté strana */}
                          {!isHomeGoal ? (
                            <button
                              onClick={() => editMode && setEditingGoalId(isEditing ? null : g.id)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, textAlign: 'right',
                                background: isEditing ? '#FFF3E0' : 'var(--surface-var)',
                                borderRadius: 6, padding: '4px 4px 4px 6px',
                                borderRight: `3px solid ${awayBeneficiary?.color ?? '#666'}`,
                                outline: isEditing ? '2px solid #FFB74D' : 'none',
                                cursor: editMode ? 'pointer' : 'default',
                              }}
                            >
                              {editMode && <span style={{ fontSize: 10, color: '#E65100', fontWeight: 700, flexShrink: 0 }}>✏️</span>}
                              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {playerLabel} ⚽
                              </span>
                              <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: awayBeneficiary?.color ?? '#666' }} />
                            </button>
                          ) : <div />}
                        </div>

                        {/* Rozbalená editace gólu */}
                        {isEditing && scoringTeam && (
                          <div style={{
                            margin: '4px 0 6px', padding: '10px', borderRadius: 10,
                            background: '#FFF8F0', border: '1px solid #FFB74D',
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#E65100', marginBottom: 8 }}>
                              {t('tournament.detail.assignScorer', { team: scoringTeam.name })}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                              <button
                                onClick={() => { onUpdateGoalPlayer(g.id, null); setEditingGoalId(null); }}
                                style={{
                                  padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                                  background: g.playerId === null ? '#FFB74D' : 'var(--surface-var)',
                                  color: g.playerId === null ? '#fff' : 'var(--text-muted)',
                                  border: '1px dashed var(--border)',
                                }}
                              >— Bez střelce</button>
                              {scoringTeam.players.slice().sort((a, b) => a.jerseyNumber - b.jerseyNumber).map((p: Player) => (
                                <button
                                  key={p.id}
                                  onClick={() => { onUpdateGoalPlayer(g.id, p.id); setEditingGoalId(null); }}
                                  style={{
                                    padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                                    background: g.playerId === p.id ? scoringTeam.color : 'var(--surface-var)',
                                    color: g.playerId === p.id ? '#fff' : 'var(--text)',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                  }}
                                >
                                  <span style={{ background: 'rgba(0,0,0,.15)', borderRadius: 4, padding: '1px 4px', fontSize: 10 }}>{p.jerseyNumber}</span>
                                  {p.name}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => { onRemoveGoal(g.id); setEditingGoalId(null); }}
                              style={{
                                width: '100%', padding: '7px', borderRadius: 8,
                                background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 12,
                              }}
                            >🗑 Smazat tento gól</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {match.status === 'live' && match.goals.length > 0 && (
                  <button onClick={onRemoveLastGoal} style={{
                    marginTop: 8, width: '100%', padding: '8px', borderRadius: 10,
                    background: '#FFEBEE', color: '#C62828', fontWeight: 600, fontSize: 13,
                  }}>
                    ↩ {t('tournament.detail.undoGoal')}
                  </button>
                )}
              </div>
            )}

            {/* Akce */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {match.status === 'scheduled' && (
                <button onClick={onStart} style={{
                  background: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 16,
                  padding: '14px', borderRadius: 14, border: '1.5px solid #FFB74D',
                }}>
                  ▶ Začít zápas
                </button>
              )}
              {match.status === 'live' && (
                <button onClick={onFinish} style={{
                  background: '#B71C1C', color: '#fff', fontWeight: 700, fontSize: 16,
                  padding: '14px', borderRadius: 14,
                }}>
                  ⏹ {t('tournament.detail.endBtn')}
                </button>
              )}
              {match.status === 'finished' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => { const ok = await ask({ title: t('confirm.reopenMatch'), message: t('confirm.reopenMatchMsg') }); if (ok) onReopen(); }}
                    style={{
                      flex: 1, background: 'var(--surface-var)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 14,
                      padding: '11px', borderRadius: 12, border: '1px solid var(--border)',
                    }}
                  >
                    ↩ {t('tournament.detail.reopenBtn')}
                  </button>
                  <button
                    onClick={async () => { const ok = await ask({ title: t('tournament.detail.resetConfirm'), message: t('tournament.detail.resetConfirm'), destructive: true }); if (ok) { onReset(); onClose(); } }}
                    style={{
                      flex: 1, background: '#FFEBEE', color: '#C62828', fontWeight: 600, fontSize: 14,
                      padding: '11px', borderRadius: 12, border: '1px solid #FFCDD2',
                    }}
                  >
                    🔄 Reset zápasu
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Gól sub-modal */}
      {showGoalModal && (
        <GoalModal
          match={{
            ...match,
            homeTeamId: showGoalModal === 'home' ? match.homeTeamId : match.awayTeamId,
            awayTeamId: showGoalModal === 'home' ? match.awayTeamId : match.homeTeamId,
          }}
          teams={tournament.teams}
          onAdd={goal => handleGoalModalAdd({
            ...goal,
            teamId: showGoalModal === 'home' ? match.homeTeamId : match.awayTeamId,
          })}
          onClose={() => setShowGoalModal(null)}
        />
      )}
    </>
  );
}
