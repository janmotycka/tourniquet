import { useState, useEffect, useRef } from 'react';
import type { SeasonMatch, MatchLineupPlayer, MatchGoal } from '../../types/match.types';
import { useMatchesStore } from '../../store/matches.store';
import { useConfirmStore } from '../../store/confirm.store';
import { useI18n } from '../../i18n';
import { computeElapsed, formatTime, formatDate } from './match-utils';
import { GoalModal } from './GoalModal';
import { CardModal } from './CardModal';
import { SubstitutionModal } from './SubstitutionModal';

// ── Substitution assistant logic ──

function useSubstitutionAlert(match: SeasonMatch, elapsed: number): {
  alertActive: boolean;
  nextAlertMinute: number;
  suggestedIn: MatchLineupPlayer[];
  suggestedOut: MatchLineupPlayer[];
} {
  if (!match.substitutionSettings || match.status !== 'live') {
    return { alertActive: false, nextAlertMinute: 0, suggestedIn: [], suggestedOut: [] };
  }

  const { intervalMinutes, playersAtOnce } = match.substitutionSettings;
  const elapsedMinutes = elapsed / 60;

  const nextAlertMinute = Math.ceil(elapsedMinutes / intervalMinutes) * intervalMinutes;
  const alertActive = elapsed > 0 && (nextAlertMinute - elapsedMinutes) <= 0.5;

  const bench = match.lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);
  const suggestedIn = bench.slice(0, playersAtOnce);
  const onField = match.lineup.filter(p => p.isStarter);
  const suggestedOut = onField.slice(0, playersAtOnce);

  return { alertActive, nextAlertMinute, suggestedIn, suggestedOut };
}

// ── Quick goal feedback flash ──

function QuickGoalFlash({ side, onDone }: { side: 'home' | 'away'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: side === 'home' ? 'rgba(46,125,50,.85)' : 'rgba(198,40,40,.6)',
      animation: 'quickGoalFlash 1.2s ease-out forwards',
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 64, animation: 'quickGoalPop .4s ease-out' }}>⚽</div>
    </div>
  );
}

// ── Inline goal edit (assign scorer to quick-added goal) ──

function InlineGoalEdit({ match, goal, onClose }: {
  match: SeasonMatch; goal: MatchGoal; onClose: () => void;
}) {
  const { t } = useI18n();
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const onFieldPlayers = match.lineup.filter(p => p.isStarter);

  const handleAssignScorer = (scorerId: string | null, assistId?: string | null) => {
    const updatedGoals = match.goals.map(g =>
      g.id === goal.id ? { ...g, scorerId, assistId: assistId ?? null } : g
    );
    updateMatch(match.id, { goals: updatedGoals });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '16px 16px 32px',
          width: '100%', maxWidth: 480, maxHeight: '75dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16 }}>
            ⚽ {t('match.field.assignScorer')} ({goal.minute}')
          </h3>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)', fontWeight: 700 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            onClick={() => handleAssignScorer(null)}
            style={{
              padding: '12px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600,
              background: 'var(--surface-var)', color: 'var(--text-muted)', textAlign: 'left',
            }}
          >
            {t('match.detail.unknownScorer')}
          </button>
          {onFieldPlayers.map(p => (
            <button
              key={p.playerId}
              onClick={() => handleAssignScorer(p.playerId)}
              style={{
                padding: '12px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                background: 'var(--bg)', border: '1.5px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: 8, background: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>{p.jerseyNumber}</span>
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Configurable field panels ──

type FieldPanel = 'cards' | 'subs';
const FIELD_PANELS_KEY = 'torq-field-panels';

function loadFieldPanels(): Set<FieldPanel> {
  try {
    const stored = localStorage.getItem(FIELD_PANELS_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch { /* ignore */ }
  return new Set(['cards', 'subs']); // default: all on
}

function saveFieldPanels(panels: Set<FieldPanel>) {
  localStorage.setItem(FIELD_PANELS_KEY, JSON.stringify([...panels]));
}

// ── LiveTab component ──

export function LiveTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(() => computeElapsed(match));
  const [goalModal, setGoalModal] = useState<'home' | 'away' | null>(null);
  const [cardModal, setCardModal] = useState(false);
  const [subModal, setSubModal] = useState(false);
  const [quickFlash, setQuickFlash] = useState<'home' | 'away' | null>(null);
  const [editingGoal, setEditingGoal] = useState<MatchGoal | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [enabledPanels, setEnabledPanels] = useState<Set<FieldPanel>>(() => loadFieldPanels());

  const startMatch = useMatchesStore(s => s.startMatch);
  const finishMatch = useMatchesStore(s => s.finishMatch);
  const pauseMatch = useMatchesStore(s => s.pauseMatch);
  const resumeMatch = useMatchesStore(s => s.resumeMatch);
  const addGoal = useMatchesStore(s => s.addGoal);
  const addCard = useMatchesStore(s => s.addCard);
  const addSubstitution = useMatchesStore(s => s.addSubstitution);
  const removeGoal = useMatchesStore(s => s.removeGoal);

  // Haptic feedback helper
  const vibrate = (ms: number = 30) => {
    try { navigator.vibrate?.(ms); } catch { /* not supported */ }
  };

  // Tick timer
  useEffect(() => {
    if (match.status !== 'live' || match.pausedAt) return;
    const interval = setInterval(() => setElapsed(computeElapsed(match)), 1000);
    return () => clearInterval(interval);
  }, [match]);

  // Sync elapsed on match data change
  useEffect(() => {
    setElapsed(computeElapsed(match));
  }, [match.startedAt, match.pausedAt, match.pausedElapsed]);

  const { alertActive, nextAlertMinute, suggestedIn, suggestedOut } = useSubstitutionAlert(match, elapsed);

  const totalSeconds = match.durationMinutes * 60;
  const remaining = Math.max(0, totalSeconds - elapsed);
  const isOvertime = elapsed > totalSeconds;
  const progress = Math.min(1, elapsed / totalSeconds);

  const getPlayerName = (playerId: string | null) =>
    playerId ? (match.lineup.find(p => p.playerId === playerId)?.name ?? '?') : t('match.detail.unknown');

  const ask = useConfirmStore(s => s.ask);

  const handleFinish = async () => {
    const ok = await ask({ title: t('confirm.endMatch'), message: t('confirm.endMatchMsg') });
    if (ok) finishMatch(match.id);
  };

  // Quick goal — one tap, auto-minute, no modal
  const handleQuickGoal = (side: 'home' | 'away') => {
    vibrate(50);
    const minute = Math.max(1, Math.floor(elapsed / 60) + 1);
    const isOpponentGoal = side === 'away';
    addGoal(match.id, {
      scorerId: null,
      assistId: null,
      isOwnGoal: false,
      isOpponentGoal,
      minute,
    });
    setQuickFlash(side);
  };

  // Long-press for detailed goal modal
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleGoalPointerDown = (side: 'home' | 'away') => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      vibrate(80);
      setGoalModal(side);
    }, 500);
  };

  const handleGoalPointerUp = (side: 'home' | 'away') => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressTriggered.current) {
      handleQuickGoal(side);
    }
  };

  const handleGoalPointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const togglePanel = (panel: FieldPanel) => {
    setEnabledPanels(prev => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel); else next.add(panel);
      saveFieldPanels(next);
      return next;
    });
  };

  const hasBench = match.lineup.some(p => !p.isStarter);
  const showCards = enabledPanels.has('cards');
  const showSubs = enabledPanels.has('subs') && hasBench;

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        @keyframes quickGoalFlash {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes quickGoalPop {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .7; }
        }
      `}</style>

      {/* Quick goal flash */}
      {quickFlash && <QuickGoalFlash side={quickFlash} onDone={() => setQuickFlash(null)} />}

      {/* Match header */}
      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)' }}>
          {match.isHome ? t('match.detail.us') : match.opponent} {t('match.detail.vs')} {match.isHome ? match.opponent : t('match.detail.us')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
          {formatDate(match.date)} · {match.kickoffTime}
          {match.competition && ` · ${match.competition}`}
        </div>
      </div>

      {/* Score card with timer */}
      <div style={{
        background: match.status === 'live' ? 'var(--primary)' : 'var(--surface)',
        borderRadius: 20, padding: '20px',
        boxShadow: match.status === 'live' ? '0 4px 20px rgba(21,101,192,.30)' : '0 1px 4px rgba(0,0,0,.06)',
      }}>
        {/* Timer */}
        {match.status === 'live' && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{
              fontFeatureSettings: '"tnum"', fontWeight: 900, fontSize: 36,
              color: '#fff', letterSpacing: 2,
            }}>
              {isOvertime ? '+' : ''}{formatTime(isOvertime ? elapsed - totalSeconds : remaining)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginTop: 2 }}>
              {isOvertime ? t('match.detail.overtime') : t('match.detail.remaining', { min: Math.floor(elapsed / 60) })}
            </div>
            {/* Progress bar */}
            <div style={{ height: 4, background: 'rgba(255,255,255,.25)', borderRadius: 4, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress * 100}%`, background: '#fff', borderRadius: 4, transition: 'width .5s' }} />
            </div>
          </div>
        )}
        {match.status === 'planned' && (
          <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>{t('match.detail.notStarted')}</div>
        )}
        {match.status === 'finished' && (
          <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>{t('match.detail.finished')}</div>
        )}

        {/* Score */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: match.status === 'live' ? 'rgba(255,255,255,.8)' : 'var(--text-muted)', marginBottom: 4 }}>
              {match.isHome ? `🏠 ${t('match.detail.us')}` : `✈️ ${t('match.detail.us')}`}
            </div>
            <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: match.status === 'live' ? '#fff' : 'var(--text)' }}>
              {match.homeScore}
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: match.status === 'live' ? 'rgba(255,255,255,.6)' : 'var(--text-muted)' }}>:</div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: match.status === 'live' ? 'rgba(255,255,255,.8)' : 'var(--text-muted)', marginBottom: 4 }}>
              {match.isHome ? '✈️ ' : '🏠 '}{match.opponent}
            </div>
            <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: match.status === 'live' ? '#fff' : 'var(--text)' }}>
              {match.awayScore}
            </div>
          </div>
        </div>

        {/* Pause indicator */}
        {match.pausedAt && match.status === 'live' && (
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,.8)', fontWeight: 600 }}>
            {t('match.detail.paused')}
          </div>
        )}
      </div>

      {/* Sub alert */}
      {alertActive && match.status === 'live' && hasBench && (
        <div style={{
          background: '#FF6F00', borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          boxShadow: '0 0 0 2px #E65100',
          animation: 'pulse 1s infinite',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>{t('match.detail.subAlert')}</div>
            {suggestedIn.length > 0 && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.85)', marginTop: 2 }}>
                {t('match.detail.subAlertSuggested', { players: suggestedIn.map(p => p.name).join(', ') })}
              </div>
            )}
          </div>
          <button
            onClick={() => setSubModal(true)}
            style={{
              background: '#fff', color: '#E65100', borderRadius: 10,
              padding: '8px 14px', fontWeight: 800, fontSize: 13, flexShrink: 0,
            }}
          >
            {t('common.confirm')}
          </button>
        </div>
      )}

      {/* Next sub info */}
      {!alertActive && match.status === 'live' && match.substitutionSettings && hasBench && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>{t('match.detail.nextSub')}</span>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{Math.ceil(nextAlertMinute)}'</span>
        </div>
      )}

      {/* ── Action buttons ── */}
      {match.status === 'planned' && (
        <button
          onClick={() => { vibrate(50); startMatch(match.id); }}
          style={{
            width: '100%', padding: '18px', borderRadius: 16, fontWeight: 800, fontSize: 18,
            background: '#2E7D32', color: '#fff', boxShadow: '0 4px 12px rgba(46,125,50,.30)',
          }}
        >
          {t('match.detail.startMatch')}
        </button>
      )}

      {match.status === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* ── Goal buttons — big touch targets ── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onPointerDown={() => handleGoalPointerDown('home')}
              onPointerUp={() => handleGoalPointerUp('home')}
              onPointerLeave={handleGoalPointerLeave}
              onContextMenu={e => e.preventDefault()}
              style={{
                flex: 1, padding: '18px 10px', borderRadius: 16, fontWeight: 800, fontSize: 16,
                background: '#2E7D32', color: '#fff',
                boxShadow: '0 2px 8px rgba(46,125,50,.25)',
                userSelect: 'none', WebkitUserSelect: 'none',
                touchAction: 'manipulation',
              }}
            >
              ⚽ {t('match.detail.ourGoalBtn')}
            </button>
            <button
              onPointerDown={() => handleGoalPointerDown('away')}
              onPointerUp={() => handleGoalPointerUp('away')}
              onPointerLeave={handleGoalPointerLeave}
              onContextMenu={e => e.preventDefault()}
              style={{
                flex: 1, padding: '18px 10px', borderRadius: 16, fontWeight: 800, fontSize: 16,
                background: '#FFEBEE', color: '#C62828', border: '2px solid #FFCDD2',
                userSelect: 'none', WebkitUserSelect: 'none',
                touchAction: 'manipulation',
              }}
            >
              {t('match.detail.opponentGoalBtn')}
            </button>
          </div>

          {/* Hint for long-press */}
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: -6 }}>
            {t('match.field.quickGoalHint')}
          </div>

          {/* Optional panels: cards + subs */}
          {(showCards || showSubs) && (
            <div style={{ display: 'flex', gap: 10 }}>
              {showCards && (
                <button
                  onClick={() => { vibrate(); setCardModal(true); }}
                  style={{
                    flex: 1, padding: '14px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                    background: '#FFF9C4', color: '#F9A825', border: '1.5px solid #FFE082',
                  }}
                >
                  {t('match.detail.cardBtn')}
                </button>
              )}
              {showSubs && (
                <button
                  onClick={() => { vibrate(); setSubModal(true); }}
                  style={{
                    flex: 1, padding: '14px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                    background: 'var(--primary-light)', color: 'var(--primary)', border: '1.5px solid #BBDEFB',
                  }}
                >
                  {t('match.detail.subBtn')}
                </button>
              )}
            </div>
          )}

          {/* Pause / Finish */}
          <div style={{ display: 'flex', gap: 10 }}>
            {!match.pausedAt ? (
              <button
                onClick={() => { vibrate(); pauseMatch(match.id); }}
                style={{
                  flex: 1, padding: '14px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                  background: 'var(--surface-var)', color: 'var(--text)',
                }}
              >
                {t('match.detail.pauseBtn')}
              </button>
            ) : (
              <button
                onClick={() => { vibrate(); resumeMatch(match.id); }}
                style={{
                  flex: 1, padding: '14px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                  background: '#E8F5E9', color: '#2E7D32',
                }}
              >
                {t('match.detail.resumeBtn')}
              </button>
            )}
            <button
              onClick={() => { vibrate(); handleFinish(); }}
              style={{
                flex: 1, padding: '14px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                background: '#FFEBEE', color: '#C62828', border: '1.5px solid #FFCDD2',
              }}
            >
              {t('match.detail.finishBtn')}
            </button>
          </div>

          {/* ── Settings toggle ── */}
          <button
            onClick={() => setShowSettings(s => !s)}
            style={{
              alignSelf: 'center', padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: showSettings ? 'var(--primary-light)' : 'var(--surface-var)',
              color: showSettings ? 'var(--primary)' : 'var(--text-muted)',
            }}
          >
            ⚙️ {t('match.field.settings')}
          </button>

          {showSettings && (
            <div style={{
              background: 'var(--surface)', borderRadius: 14, padding: '12px 16px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>
                {t('match.field.showPanels')}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enabledPanels.has('cards')}
                  onChange={() => togglePanel('cards')}
                  style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                />
                🟨 {t('match.field.panelCards')}
              </label>
              {hasBench && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={enabledPanels.has('subs')}
                    onChange={() => togglePanel('subs')}
                    style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                  />
                  🔄 {t('match.field.panelSubs')}
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Goals log (clickable to assign scorer) ── */}
      {match.goals.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-muted)' }}>
            {t('match.detail.goalsLog')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...match.goals].reverse().map(g => {
              const isUnassigned = !g.isOpponentGoal && !g.isOwnGoal && !g.scorerId;
              return (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 28 }}>{g.minute}'</span>
                  <span
                    onClick={() => {
                      if (match.status !== 'finished' && !g.isOpponentGoal) setEditingGoal(g);
                    }}
                    style={{
                      fontSize: 13, fontWeight: 600, flex: 1,
                      color: g.isOpponentGoal ? '#C62828' : '#2E7D32',
                      cursor: match.status !== 'finished' && !g.isOpponentGoal ? 'pointer' : 'default',
                      textDecoration: isUnassigned ? 'underline dashed' : 'none',
                      textDecorationColor: 'var(--text-muted)',
                    }}
                  >
                    {g.isOpponentGoal
                      ? `${match.opponent} ⚽`
                      : g.isOwnGoal
                        ? t('match.detail.ownGoalLog')
                        : g.scorerId
                          ? `${getPlayerName(g.scorerId)}${g.assistId ? ` (${getPlayerName(g.assistId)})` : ''}`
                          : `⚽ ${t('match.field.tapToAssign')}`}
                  </span>
                  {match.status !== 'finished' && (
                    <button
                      onClick={() => removeGoal(match.id, g.id)}
                      style={{ fontSize: 13, color: '#C62828', fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: '#FFEBEE' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cards log */}
      {match.cards.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-muted)' }}>{t('match.detail.cardsLog')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {match.cards.map(c => {
              const player = match.lineup.find(p => p.playerId === c.playerId);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 28 }}>{c.minute}'</span>
                  <span style={{ fontSize: 16 }}>{c.type === 'yellow' ? '🟨' : c.type === 'red' ? '🟥' : '🟨🟥'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{player?.name ?? '?'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {goalModal !== null && (
        <GoalModal
          match={match}
          isOpponentGoal={goalModal === 'away'}
          onAdd={g => addGoal(match.id, g)}
          onClose={() => setGoalModal(null)}
          t={t}
        />
      )}
      {cardModal && (
        <CardModal match={match} onAdd={c => addCard(match.id, c)} onClose={() => setCardModal(false)} t={t} />
      )}
      {subModal && (
        <SubstitutionModal
          match={match}
          onAdd={s => addSubstitution(match.id, s)}
          onClose={() => setSubModal(false)}
          suggestedIn={suggestedIn}
          suggestedOut={suggestedOut}
          t={t}
        />
      )}
      {editingGoal && (
        <InlineGoalEdit
          match={match}
          goal={editingGoal}
          onClose={() => setEditingGoal(null)}
        />
      )}
    </div>
  );
}
