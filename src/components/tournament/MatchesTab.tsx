import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Tournament, Match } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { useConfirmStore } from '../../store/confirm.store';
import { formatMatchTime } from '../../utils/tournament-schedule';
import { isLightColor, isNearWhite, textOnColor } from '../../utils/team-colors';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LiveReactions } from './public/LiveReactions';
import { TeamBadge } from './TeamBadge';
import { MatchCardTimer } from './MatchCardTimer';
import { InlineGoalPanel } from './InlineGoalPanel';

/** Komponenta pro flash při ukončení zápasu v admin view */
function AdminFinishFlash({ status }: { status: string }) {
  const { t } = useI18n();
  const [flash, setFlash] = useState(false);
  const prev = useRef(status);
  useEffect(() => {
    if (prev.current === 'live' && status === 'finished') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFlash(true); // trigger transient flash animation
      const t = setTimeout(() => setFlash(false), 2500);
      return () => clearTimeout(t);
    }
    prev.current = status;
  }, [status]);
  if (!flash) return null;
  return (
    <div style={{
      textAlign: 'center', padding: '5px 0',
      background: 'linear-gradient(90deg, transparent 0%, rgba(102,187,106,.25) 50%, transparent 100%)',
      fontSize: 12, fontWeight: 900, color: '#2E7D32', letterSpacing: 1.5,
    }}>
      🏁 {t('tournament.public.matchFinished').toUpperCase()}
    </div>
  );
}

/** Sortable wrapper — stabilní top-level komponenta (nedefinovat uvnitř MatchesTab!) */
function SortableMatchCardWrapper({ matchId, children }: { matchId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: matchId });
  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 10 : undefined,
      position: 'relative',
    }} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export function MatchesTab({ tournament, isVerified, onQuickGoal, onStartMatch, onFinishMatchConfirm, onPauseMatch, onResumeMatch, onEditMatch, onCancelMatch, onReorderMatches }: {
  tournament: Tournament;
  isVerified: boolean;
  onQuickGoal: (matchId: string, teamId: string, playerId: string | null) => void;
  onStartMatch: (matchId: string) => void;
  onFinishMatchConfirm: (matchId: string) => void;
  onPauseMatch: (matchId: string) => void;
  onResumeMatch: (matchId: string) => void;
  onEditMatch: (match: Match) => void;
  onCancelMatch?: (matchId: string) => void;
  onReorderMatches?: (reorderedScheduledIds: string[]) => void;
}) {
  const { t, locale } = useI18n();
  const ask = useConfirmStore(s => s.ask);
  const [openGoalPanel, setOpenGoalPanel] = useState<{ matchId: string; side: 'home' | 'away' } | null>(null);
  const [reorderLocked, setReorderLocked] = useState(true);
  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  const toggleGoal = (matchId: string, side: 'home' | 'away') => {
    setOpenGoalPanel(prev =>
      prev?.matchId === matchId && prev.side === side ? null : { matchId, side }
    );
  };

  // Řazení: live → scheduled (podle času) → finished (od nejnovějšího)
  const liveMatches = tournament.matches.filter(m => m.status === 'live');
  const scheduledMatches = tournament.matches
    .filter(m => m.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  const finishedMatches = tournament.matches
    .filter(m => m.status === 'finished')
    .sort((a, b) => new Date(b.finishedAt ?? b.scheduledTime).getTime() - new Date(a.finishedAt ?? a.scheduledTime).getTime());

  const canReorder = isVerified && !!onReorderMatches && scheduledMatches.length > 1 && !reorderLocked;

  // DnD sensors — pointer (desktop) + touch (mobile) s aktivační vzdáleností
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderMatches) return;
    const ids = scheduledMatches.map(m => m.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    ids.splice(oldIndex, 1);
    ids.splice(newIndex, 0, active.id as string);
    onReorderMatches(ids);
  }, [scheduledMatches, onReorderMatches]);

  if (tournament.matches.length === 0) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('tournament.detail.noMatches')}</div>;
  }

  // Renderovací helper pro jednu kartu zápasu (sdílený pro live/scheduled/finished)
  const renderMatchCard = (match: Match, opts: { showDragHandle?: boolean } = {}) => {
                const homeT = getTeam(match.homeTeamId);
                const awayT = getTeam(match.awayTeamId);
                const isLive = match.status === 'live';
                const isScheduled = match.status === 'scheduled';
                const isFinished = match.status === 'finished';
                const isPaused = isLive && !!match.pausedAt;
                const panelOpen = openGoalPanel?.matchId === match.id;
                const panelSide = panelOpen ? openGoalPanel!.side : null;
                const panelTeamId = panelSide === 'home' ? match.homeTeamId : match.awayTeamId;

                // Barva skóre
                const scoreColor = isScheduled ? 'var(--text-muted)' : isLive ? (isPaused ? '#E65100' : '#C62828') : 'var(--text)';

                return (
                  <div>
                    {/* AdminGoalFlash removed — not needed in admin view */}
                    <AdminFinishFlash status={match.status} />
                    <div style={{
                      background: 'var(--surface)',
                      borderRadius: panelOpen ? '14px 14px 0 0' : 14,
                      border: isLive
                        ? `2px solid ${isPaused ? '#E65100' : '#C62828'}`
                        : isFinished
                        ? '1.5px solid #C8E6C9'
                        : '1.5px solid var(--border)',
                      boxShadow: isLive
                        ? `0 2px 8px rgba(198,40,40,.15)`
                        : '0 1px 3px rgba(0,0,0,.06)',
                      overflow: 'hidden',
                    }}>

                      {/* ══ LIVE zápas — 3-sloupcový layout ══ */}
                      {isLive && (
                        <>
                          {/* Řádek 1: tým A | skóre + timer | tým B */}
                          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px 4px', gap: 8 }}>
                            {/* Levý tým */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <TeamBadge team={homeT} size={14} />
                              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                                {homeT?.name ?? '?'}
                              </span>
                            </div>
                            {/* Střed: skóre + badge */}
                            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 70 }}>
                              <div style={{ fontWeight: 900, fontSize: 24, lineHeight: 1, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>
                                {`${match.homeScore}:${match.awayScore}`}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <div style={{ width: 5, height: 5, borderRadius: 3, background: isPaused ? '#E65100' : '#C62828' }} />
                                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.5, color: isPaused ? '#E65100' : '#C62828' }}>
                                  {isPaused ? t('tournament.detail.paused') : t('tournament.detail.live')}
                                </span>
                              </div>
                              {(tournament.settings.numberOfPitches ?? 1) > 1 && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1 }}>
                                  H{(match.pitchNumber ?? 1)}
                                </span>
                              )}
                            </div>
                            {/* Pravý tým */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word', textAlign: 'right' }}>
                                {awayT?.name ?? '?'}
                              </span>
                              <TeamBadge team={awayT} size={14} />
                            </div>
                          </div>

                          {/* Řádek 2: timer + ⚽ tlačítka přes celou šířku */}
                          <div style={{ display: 'flex', alignItems: 'center', padding: '2px 12px 6px', gap: 8 }}>
                            {/* ⚽ domácí */}
                            {isVerified ? (
                              <button
                                onClick={() => toggleGoal(match.id, 'home')}
                                title={`Gól: ${homeT?.name}`}
                                style={{
                                  flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 14, fontWeight: 800,
                                  background: panelSide === 'home'
                                    ? (homeT?.color ?? '#666')
                                    : (homeT?.color && !isNearWhite(homeT.color) ? homeT.color + '22' : 'var(--surface-var)'),
                                  color: panelSide === 'home'
                                    ? textOnColor(homeT?.color ?? '#666')
                                    : (homeT?.color && !isNearWhite(homeT.color) ? homeT.color : 'var(--text)'),
                                  border: `2px solid ${homeT?.color && !isNearWhite(homeT.color) ? homeT.color : 'var(--border)'}`,
                                  boxShadow: panelSide === 'home' && homeT?.color && isLightColor(homeT.color) ? 'inset 0 0 0 1.5px rgba(0,0,0,0.15)' : undefined,
                                  transition: 'all .12s',
                                }}
                              >⚽ +1</button>
                            ) : <div style={{ flex: 1 }} />}

                            {/* Timer countdown */}
                            <div style={{ flexShrink: 0, minWidth: 60, textAlign: 'center' }}>
                              <MatchCardTimer match={match} variant="list" />
                            </div>

                            {/* ⚽ hosté */}
                            {isVerified ? (
                              <button
                                onClick={() => toggleGoal(match.id, 'away')}
                                title={`Gól: ${awayT?.name}`}
                                style={{
                                  flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 14, fontWeight: 800,
                                  background: panelSide === 'away'
                                    ? (awayT?.color ?? '#666')
                                    : (awayT?.color && !isNearWhite(awayT.color) ? awayT.color + '22' : 'var(--surface-var)'),
                                  color: panelSide === 'away'
                                    ? textOnColor(awayT?.color ?? '#666')
                                    : (awayT?.color && !isNearWhite(awayT.color) ? awayT.color : 'var(--text)'),
                                  border: `2px solid ${awayT?.color && !isNearWhite(awayT.color) ? awayT.color : 'var(--border)'}`,
                                  boxShadow: panelSide === 'away' && awayT?.color && isLightColor(awayT.color) ? 'inset 0 0 0 1.5px rgba(0,0,0,0.15)' : undefined,
                                  transition: 'all .12s',
                                }}
                              >+1 ⚽</button>
                            ) : <div style={{ flex: 1 }} />}
                          </div>

                          {/* Řádek 3: akce bar (jen admin) */}
                          {isVerified && (
                            <div style={{ display: 'flex', gap: 6, padding: '0 12px 9px', alignItems: 'center' }}>
                              {isPaused ? (
                                <button
                                  onClick={() => onResumeMatch(match.id)}
                                  style={{
                                    padding: '6px 14px', borderRadius: 9,
                                    background: '#FFF3E0', color: '#E65100',
                                    fontWeight: 700, fontSize: 13,
                                    border: '1.5px solid #FFB74D',
                                  }}
                                >▶</button>
                              ) : (
                                <button
                                  onClick={() => onPauseMatch(match.id)}
                                  style={{
                                    padding: '6px 14px', borderRadius: 9,
                                    background: 'var(--surface-var)', color: '#E65100',
                                    fontWeight: 700, fontSize: 13,
                                    border: '1px solid #FFB74D',
                                  }}
                                >⏸</button>
                              )}
                              <button
                                onClick={() => onFinishMatchConfirm(match.id)}
                                style={{
                                  flex: 1, padding: '6px 0', borderRadius: 9,
                                  background: '#FFEBEE', color: '#C62828',
                                  fontWeight: 700, fontSize: 13,
                                  border: '1px solid #FFCDD2',
                                }}
                              >⏹ {t('tournament.detail.endBtn')}</button>
                              <button
                                onClick={() => onEditMatch(match)}
                                style={{
                                  padding: '6px 10px', borderRadius: 9,
                                  background: 'var(--surface-var)', color: 'var(--text-muted)',
                                  fontWeight: 700, fontSize: 13,
                                  border: '1px solid var(--border)',
                                }}
                              >✏️</button>
                            </div>
                          )}
                          {/* Admin read-only live reactions */}
                          {(tournament.settings.reactionsEnabled ?? false) && homeT && awayT && (
                            <div style={{ borderTop: '1px solid var(--border)' }}>
                              <LiveReactions
                                tournamentId={tournament.id}
                                matchId={match.id}
                                homeTeam={{ id: homeT.id, name: homeT.name, color: homeT.color }}
                                awayTeam={{ id: awayT.id, name: awayT.name, color: awayT.color }}
                                readOnly
                              />
                            </div>
                          )}
                        </>
                      )}

                      {/* ══ SCHEDULED / FINISHED — kompaktní jednořádkový layout ══ */}
                      {!isLive && (
                        <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', gap: 8 }}>
                          {/* Drag handle — jen scheduled + owner s DnD */}
                          {opts.showDragHandle && (
                            <span
                              className="drag-handle"
                              style={{
                                cursor: 'grab', fontSize: 16, color: 'var(--text-muted)', flexShrink: 0,
                                userSelect: 'none', lineHeight: 1, opacity: 0.5, touchAction: 'none',
                              }}
                            >☰</span>
                          )}
                          {/* Status vlevo: ikonka + čas (jen plánované)/tlačítko */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 40, flexShrink: 0 }}>
                            {isFinished
                              ? <span style={{ fontSize: 11, color: '#2E7D32', flexShrink: 0 }}>✓</span>
                              : isVerified
                              ? (
                                <button
                                  onClick={() => onStartMatch(match.id)}
                                  style={{
                                    width: 32, height: 32, borderRadius: 6,
                                    background: '#FFF3E0', color: '#E65100',
                                    fontWeight: 900, fontSize: 11,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    border: '1px solid #FFB74D',
                                  }}
                                >▶</button>
                              )
                              : <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>·</span>
                            }
                            {!isFinished && (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, textAlign: 'center', minWidth: 32 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.3 }}>
                                  {formatMatchTime(match.scheduledTime, locale)}
                                </span>
                                {(tournament.settings.numberOfPitches ?? 1) > 1 && (
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.2 }}>
                                    H{(match.pitchNumber ?? 1)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Tým A */}
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <TeamBadge team={homeT} size={12} />
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                              {homeT?.name ?? '?'}
                            </span>
                          </div>

                          {/* Skóre střed — podbarvené jako v PublicView */}
                          <div style={{
                            flexShrink: 0,
                            background: isFinished ? '#E8F5E9' : 'transparent',
                            borderRadius: 8,
                            padding: isFinished ? '3px 8px' : '3px 4px',
                            minWidth: 44, textAlign: 'center',
                          }}>
                            <span style={{
                              fontWeight: 900, fontSize: isFinished ? 15 : 16,
                              color: isFinished ? '#2E7D32' : 'var(--text-muted)',
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {isScheduled ? '— : —' : `${match.homeScore} : ${match.awayScore}`}
                            </span>
                          </div>

                          {/* Tým B */}
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word', textAlign: 'right' }}>
                              {awayT?.name ?? '?'}
                            </span>
                            <TeamBadge team={awayT} size={12} />
                          </div>

                          {/* Akce vpravo */}
                          {isVerified && isFinished && (
                            <button
                              onClick={() => onEditMatch(match)}
                              style={{
                                flexShrink: 0, width: 34, height: 34, borderRadius: 8,
                                background: 'var(--surface-var)', color: 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, border: '1px solid var(--border)',
                              }}
                            >✏️</button>
                          )}
                          {/* Cancel scheduled — only when order is unlocked */}
                          {isVerified && isScheduled && onCancelMatch && !reorderLocked && (
                            <button
                              onClick={async () => {
                                const ok = await ask({ title: t('common.delete'), message: t('tournament.match.cancelConfirm'), destructive: true });
                                if (ok) {
                                  onCancelMatch(match.id);
                                }
                              }}
                              style={{
                                flexShrink: 0, width: 34, height: 34, borderRadius: 8,
                                background: '#FFEBEE', color: '#C62828',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, border: '1px solid #FFCDD2',
                              }}
                            >✕</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Inline goal panel */}
                    {panelOpen && isVerified && (
                      <InlineGoalPanel
                        match={match}
                        teams={tournament.teams}
                        teamId={panelTeamId}
                        onGoal={(matchId, teamId, playerId) => {
                          onQuickGoal(matchId, teamId, playerId);
                          setOpenGoalPanel(null);
                        }}
                        onClose={() => setOpenGoalPanel(null)}
                      />
                    )}
                  </div>
                );
  };


  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 🔴 Live */}
      {liveMatches.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#C62828', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            🔴 {t('tournament.detail.nowPlaying')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {liveMatches.map(m => <div key={m.id}>{renderMatchCard(m)}</div>)}
          </div>
        </div>
      )}

      {/* 🕐 Scheduled — s DnD pokud je owner a odemčeno */}
      {scheduledMatches.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              🕐 {t('tournament.detail.upcoming')}
            </span>
            {isVerified && !!onReorderMatches && scheduledMatches.length > 1 && (
              <button
                onClick={() => setReorderLocked(prev => !prev)}
                style={{
                  background: reorderLocked ? 'var(--surface-var)' : 'var(--primary-light)',
                  border: reorderLocked ? '1px solid var(--border)' : '1.5px solid var(--primary)',
                  borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  color: reorderLocked ? 'var(--text-muted)' : 'var(--primary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {reorderLocked ? '🔒' : '🔓'} {reorderLocked ? t('tournament.detail.reorderLocked') : t('tournament.detail.reorderUnlocked')}
              </button>
            )}
          </div>
          {canReorder ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={scheduledMatches.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {scheduledMatches.map(m => (
                    <SortableMatchCardWrapper key={m.id} matchId={m.id}>
                      {renderMatchCard(m, { showDragHandle: canReorder })}
                    </SortableMatchCardWrapper>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {scheduledMatches.map(m => <div key={m.id}>{renderMatchCard(m)}</div>)}
            </div>
          )}
        </div>
      )}

      {/* ✅ Finished */}
      {finishedMatches.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            ✅ {t('tournament.detail.finishedSection')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {finishedMatches.map(m => <div key={m.id}>{renderMatchCard(m)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
