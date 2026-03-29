import { useState, useEffect, useRef, useCallback } from 'react';
import type { SeasonMatch, MatchLineupPlayer, MatchGoal } from '../../types/match.types';
import { useMatchesStore } from '../../store/matches.store';
import { useConfirmStore } from '../../store/confirm.store';
import { useI18n } from '../../i18n';
import { computeElapsed, formatTime, formatDate, computePlayingTime } from './match-utils';
import { GoalModal } from './GoalModal';
import { CardModal } from './CardModal';
import { SubstitutionModal } from './SubstitutionModal';

// ── Landscape detection hook ──

function useLandscape() {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight && window.innerWidth < 1024;
  });

  useEffect(() => {
    const check = () => {
      // Only treat as landscape on mobile-sized screens (< 1024px width when landscape)
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth < 1024);
    };

    // Use screen.orientation API if available, fall back to resize
    if (screen.orientation) {
      screen.orientation.addEventListener('change', check);
    }
    window.addEventListener('resize', check);

    return () => {
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', check);
      }
      window.removeEventListener('resize', check);
    };
  }, []);

  return isLandscape;
}

// ── Landscape Scoreboard — fullscreen swipe-to-score ──

function LandscapeScoreboard({ match, elapsed, onQuickGoal, onPause, onResume, t }: {
  match: SeasonMatch;
  elapsed: number;
  onQuickGoal: (side: 'ours' | 'theirs') => void;
  onPause: () => void;
  onResume: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const ourScore = match.isHome ? match.homeScore : match.awayScore;
  const theirScore = match.isHome ? match.awayScore : match.homeScore;
  const isPaused = !!match.pausedAt;

  const periods = match.periods ?? 2;
  const currentPeriod = match.currentPeriod ?? 1;
  const periodDuration = match.periodDurationMinutes ?? Math.round(match.durationMinutes / periods);
  const periodSeconds = periodDuration * 60;
  const periodElapsed = elapsed - (currentPeriod - 1) * periodSeconds;
  const periodRemaining = Math.max(0, periodSeconds - periodElapsed);
  const isPeriodOvertime = periodElapsed > periodSeconds;

  // Swipe tracking per side
  const touchStartY = useRef<{ left: number | null; right: number | null }>({ left: null, right: null });
  const [swipeHintShown, setSwipeHintShown] = useState(true);

  // Auto-hide hint after 3s
  useEffect(() => {
    const t = setTimeout(() => setSwipeHintShown(false), 3000);
    return () => clearTimeout(t);
  }, []);

  // Swipe flash feedback
  const [flashSide, setFlashSide] = useState<'left' | 'right' | null>(null);

  const handleTouchStart = (side: 'left' | 'right', y: number) => {
    touchStartY.current[side] = y;
  };

  const handleTouchEnd = (side: 'left' | 'right', y: number) => {
    const startY = touchStartY.current[side];
    if (startY === null) return;
    const diff = startY - y; // positive = swipe up
    touchStartY.current[side] = null;

    if (diff > 40) {
      // Swipe up = goal
      onQuickGoal(side === 'left' ? 'ours' : 'theirs');
      setFlashSide(side);
      setTimeout(() => setFlashSide(null), 600);
    }
  };

  const vibrate = (ms: number = 30) => {
    try { navigator.vibrate?.(ms); } catch {}
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: '#000', color: '#fff',
      display: 'flex', flexDirection: 'row',
      userSelect: 'none', WebkitUserSelect: 'none',
      touchAction: 'none',
    }}>
      <style>{`
        @keyframes landscapeFlash {
          0% { opacity: .4; }
          100% { opacity: 0; }
        }
        @keyframes landscapeHintFade {
          0%, 80% { opacity: .7; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* LEFT half — Our team */}
      <div
        onTouchStart={e => handleTouchStart('left', e.touches[0].clientY)}
        onTouchEnd={e => handleTouchEnd('left', e.changedTouches[0].clientY)}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: flashSide === 'left' ? 'rgba(46,125,50,.3)' : 'transparent',
          transition: 'background .3s',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, opacity: .6, marginBottom: 8, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '90%', textAlign: 'center' }}>
          {match.clubName || t('match.detail.us')}
        </div>
        <div style={{ fontSize: 'min(30vw, 160px)', fontWeight: 900, lineHeight: 1 }}>
          {ourScore}
        </div>
        {flashSide === 'left' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(46,125,50,.4)',
            animation: 'landscapeFlash .6s ease-out forwards',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* CENTER strip — timer + controls */}
      <div
        onClick={() => {
          vibrate();
          if (isPaused) onResume();
          else onPause();
        }}
        style={{
          width: 80, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 6, borderLeft: '1px solid #333', borderRight: '1px solid #333',
          cursor: 'pointer',
        }}
      >
        <div style={{
          fontSize: 11, fontWeight: 700, opacity: .5,
        }}>
          {getPeriodLabel(t, periods, currentPeriod)}
        </div>
        <div style={{
          fontFeatureSettings: '"tnum"', fontWeight: 900, fontSize: 22,
          color: isPeriodOvertime ? '#FFD54F' : isPaused ? '#FF9800' : '#fff',
          letterSpacing: 1,
        }}>
          {isPeriodOvertime ? '+' : ''}{formatTime(isPeriodOvertime ? periodElapsed - periodSeconds : periodRemaining)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: .5 }}>
          {Math.floor(elapsed / 60)}'
        </div>
        {isPaused && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#FF9800',
            animation: 'pulse 1s infinite',
          }}>
            ⏸ PAUSED
          </div>
        )}
      </div>

      {/* RIGHT half — Opponent */}
      <div
        onTouchStart={e => handleTouchStart('right', e.touches[0].clientY)}
        onTouchEnd={e => handleTouchEnd('right', e.changedTouches[0].clientY)}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: flashSide === 'right' ? 'rgba(198,40,40,.3)' : 'transparent',
          transition: 'background .3s',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, opacity: .6, marginBottom: 8, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '90%', textAlign: 'center' }}>
          {match.opponent}
        </div>
        <div style={{ fontSize: 'min(30vw, 160px)', fontWeight: 900, lineHeight: 1 }}>
          {theirScore}
        </div>
        {flashSide === 'right' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(198,40,40,.4)',
            animation: 'landscapeFlash .6s ease-out forwards',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* Swipe hint overlay — auto-fades */}
      {swipeHintShown && (
        <div style={{
          position: 'absolute', bottom: 16, left: 0, right: 0,
          textAlign: 'center', fontSize: 12, fontWeight: 600,
          color: '#fff', opacity: .7,
          animation: 'landscapeHintFade 3s ease-out forwards',
          pointerEvents: 'none',
        }}>
          ↑ {t('match.landscape.swipeHint')} &nbsp;·&nbsp; {t('match.landscape.tapMiddle')}
        </div>
      )}
    </div>
  );
}

// ── Wake Lock — keep screen on during live match ──

function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;

    let released = false;

    const request = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      } catch { /* user denied or not supported */ }
    };

    request();

    const onVisibility = () => {
      if (!released && document.visibilityState === 'visible' && !wakeLockRef.current) {
        request();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, [enabled]);
}

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

function QuickGoalFlash({ side, onDone }: { side: 'ours' | 'theirs'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: side === 'ours' ? 'rgba(46,125,50,.85)' : 'rgba(198,40,40,.6)',
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

function loadFieldPanels(matchId: string): Set<FieldPanel> {
  try {
    const stored = localStorage.getItem(`torq-field-panels-${matchId}`);
    if (stored) return new Set(JSON.parse(stored));
  } catch { /* ignore */ }
  return new Set(['cards', 'subs']); // default: all on
}

function saveFieldPanels(matchId: string, panels: Set<FieldPanel>) {
  localStorage.setItem(`torq-field-panels-${matchId}`, JSON.stringify([...panels]));
}

// ── Period label helper ──

function getPeriodLabel(t: (k: string, p?: Record<string, string | number>) => string, periods: number, current: number): string {
  if (periods === 1) return t('match.period.single');
  if (periods === 2) return t('match.period.half', { n: current });
  if (periods === 3) return t('match.period.third', { n: current });
  return t('match.period.quarter', { n: current });
}

// ── LiveTab component ──

export function LiveTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(() => computeElapsed(match));
  const [goalModal, setGoalModal] = useState<'ours' | 'theirs' | null>(null);
  const [cardModal, setCardModal] = useState(false);
  const [subModal, setSubModal] = useState(false);
  const [quickFlash, setQuickFlash] = useState<'ours' | 'theirs' | null>(null);
  const [editingGoal, setEditingGoal] = useState<MatchGoal | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [enabledPanels, setEnabledPanels] = useState<Set<FieldPanel>>(() => loadFieldPanels(match.id));
  const [showVeoInput, setShowVeoInput] = useState(false);
  const [veoInputValue, setVeoInputValue] = useState('');

  // Undo toast for quick goals
  const [undoToast, setUndoToast] = useState<{ goalId: string; side: 'ours' | 'theirs' } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wake lock — keep screen on during live match
  useWakeLock(match.status === 'live');

  // Landscape detection — show fullscreen scoreboard when phone rotated
  const isLandscape = useLandscape();

  const startMatch = useMatchesStore(s => s.startMatch);
  const finishMatch = useMatchesStore(s => s.finishMatch);
  const pauseMatch = useMatchesStore(s => s.pauseMatch);
  const resumeMatch = useMatchesStore(s => s.resumeMatch);
  const addGoal = useMatchesStore(s => s.addGoal);
  const addCard = useMatchesStore(s => s.addCard);
  const addSubstitution = useMatchesStore(s => s.addSubstitution);
  const removeGoal = useMatchesStore(s => s.removeGoal);
  const updateMatch = useMatchesStore(s => s.updateMatch);

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

  const periods = match.periods ?? 2;
  const periodDuration = match.periodDurationMinutes ?? Math.round(match.durationMinutes / periods);
  const periodSeconds = periodDuration * 60;
  const currentPeriod = match.currentPeriod ?? 1;
  const totalSeconds = match.durationMinutes * 60;

  // Per-period progress
  const periodElapsed = elapsed - (currentPeriod - 1) * periodSeconds;
  const periodRemaining = Math.max(0, periodSeconds - periodElapsed);
  const isPeriodOvertime = periodElapsed > periodSeconds;
  const periodProgress = Math.min(1, periodElapsed / periodSeconds);
  // Total progress
  const isOvertime = elapsed > totalSeconds;
  const progress = Math.min(1, elapsed / totalSeconds);
  const remaining = Math.max(0, totalSeconds - elapsed);

  const getPlayerName = (playerId: string | null) =>
    playerId ? (match.lineup.find(p => p.playerId === playerId)?.name ?? '?') : t('match.detail.unknown');

  const ask = useConfirmStore(s => s.ask);

  const handleFinish = async () => {
    const ok = await ask({ title: t('confirm.endMatch'), message: t('confirm.endMatchMsg') });
    if (ok) finishMatch(match.id);
  };

  // Quick goal — one tap, auto-minute, no modal + undo toast
  const handleQuickGoal = (side: 'ours' | 'theirs') => {
    vibrate(side === 'ours' ? 50 : [30, 30, 30]);
    const minute = Math.max(1, Math.floor(elapsed / 60) + 1);
    const isOpponentGoal = side === 'theirs';
    const goalId = addGoal(match.id, {
      scorerId: null,
      assistId: null,
      isOwnGoal: false,
      isOpponentGoal,
      minute,
    });
    setQuickFlash(side);

    // Show undo toast for 5 seconds
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast({ goalId, side });
    undoTimerRef.current = setTimeout(() => {
      setUndoToast(null);
      undoTimerRef.current = null;
    }, 5000);
  };

  // Long-press for detailed goal modal
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleGoalPointerDown = (side: 'ours' | 'theirs') => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      vibrate(80);
      setGoalModal(side);
    }, 500);
  };

  const handleGoalPointerUp = (side: 'ours' | 'theirs') => {
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
      saveFieldPanels(match.id, next);
      return next;
    });
  };

  // Derive "our" vs "their" scores based on isHome
  const ourScore = match.isHome ? match.homeScore : match.awayScore;
  const theirScore = match.isHome ? match.awayScore : match.homeScore;

  const hasBench = match.lineup.some(p => !p.isStarter);
  const showCards = enabledPanels.has('cards');
  const showSubs = enabledPanels.has('subs') && hasBench;

  // Remember if hint was already shown
  const [hintDismissed] = useState(() => {
    try { return !!localStorage.getItem('torq_goal_hint_seen'); } catch { return false; }
  });

  return (
    <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
        @keyframes undoToastSlide {
          0% { transform: translateY(-20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes scoreFlash {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Quick goal flash */}
      {quickFlash && <QuickGoalFlash side={quickFlash} onDone={() => setQuickFlash(null)} />}

      {/* Landscape fullscreen scoreboard */}
      {isLandscape && match.status === 'live' && (
        <LandscapeScoreboard
          match={match}
          elapsed={elapsed}
          onQuickGoal={handleQuickGoal}
          onPause={() => { vibrate(); pauseMatch(match.id); }}
          onResume={() => { vibrate(); resumeMatch(match.id); }}
          t={t}
        />
      )}

      {/* Undo toast */}
      {undoToast && (
        <div style={{
          position: 'fixed', top: 16, left: 16, right: 16, zIndex: 150,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 14,
          background: undoToast.side === 'ours' ? '#1B5E20' : '#B71C1C',
          color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,.3)',
          animation: 'undoToastSlide .3s ease-out',
          maxWidth: 480, margin: '0 auto',
        }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            ⚽ {undoToast.side === 'ours' ? t('match.detail.goalRecorded') : t('match.detail.opponentGoalRecorded')}
          </span>
          <button
            onClick={() => {
              removeGoal(match.id, undoToast.goalId);
              setUndoToast(null);
              if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
              vibrate();
            }}
            style={{
              padding: '6px 16px', borderRadius: 10, fontWeight: 800, fontSize: 13,
              background: 'rgba(255,255,255,.25)', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            {t('match.detail.undo')}
          </button>
        </div>
      )}

      {/* ── Score card with integrated timer — compact, no duplicate header ── */}
      <div style={{
        background: match.status === 'live' ? 'var(--primary)' : 'var(--surface)',
        borderRadius: 20, padding: match.status === 'live' ? '14px 20px 18px' : '20px',
        boxShadow: match.status === 'live' ? '0 4px 20px rgba(21,101,192,.30)' : '0 1px 4px rgba(0,0,0,.06)',
      }}>
        {/* Timer — compact inline layout for live */}
        {match.status === 'live' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            {periods > 1 && (
              <span style={{
                padding: '2px 10px', borderRadius: 6,
                background: 'rgba(255,255,255,.2)', fontSize: 11, fontWeight: 700, color: '#fff',
              }}>
                {getPeriodLabel(t, periods, currentPeriod)}
              </span>
            )}
            <span style={{
              fontFeatureSettings: '"tnum"', fontWeight: 900, fontSize: 28,
              color: isPeriodOvertime ? '#FFD54F' : '#fff', letterSpacing: 2,
            }}>
              {isPeriodOvertime ? '+' : ''}{formatTime(isPeriodOvertime ? periodElapsed - periodSeconds : periodRemaining)}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.65)' }}>
              {Math.floor(elapsed / 60)}'
            </span>
          </div>
        )}
        {match.status === 'planned' && (
          <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>{t('match.detail.notStarted')}</div>
        )}
        {match.status === 'finished' && (
          <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>{t('match.detail.finished')}</div>
        )}

        {/* Score — large, clear */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: match.status === 'live' ? 'rgba(255,255,255,.7)' : 'var(--text-muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.clubName || t('match.detail.us')}
            </div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: match.status === 'live' ? '#fff' : 'var(--text)' }}>
              {ourScore}
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: match.status === 'live' ? 'rgba(255,255,255,.5)' : 'var(--text-muted)' }}>:</div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: match.status === 'live' ? 'rgba(255,255,255,.7)' : 'var(--text-muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.opponent}
            </div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: match.status === 'live' ? '#fff' : 'var(--text)' }}>
              {theirScore}
            </div>
          </div>
        </div>

        {/* Progress bar + pause — under score, minimal */}
        {match.status === 'live' && (
          <>
            <div style={{ height: 3, background: 'rgba(255,255,255,.2)', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${periodProgress * 100}%`, background: isPeriodOvertime ? '#FFD54F' : '#fff', borderRadius: 3, transition: 'width .5s' }} />
            </div>
            {match.pausedAt && (
              <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>
                ⏸ {t('match.detail.paused')}
              </div>
            )}
          </>
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

      {/* ── Action buttons (sticky during live) ── */}
      <div style={match.status === 'live' ? {
        position: 'sticky', bottom: 0, zIndex: 20,
        background: 'var(--bg)', paddingTop: 10, paddingBottom: 4,
        marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16,
        boxShadow: '0 -4px 12px rgba(0,0,0,.08)',
      } : undefined}>
      {match.status === 'planned' && (
        <button
          onClick={async () => {
            vibrate(50);
            const ok = await ask({ title: t('confirm.startMatch'), message: t('confirm.startMatchMsg') });
            if (ok) startMatch(match.id);
          }}
          style={{
            width: '100%', padding: '18px', borderRadius: 16, fontWeight: 800, fontSize: 18,
            background: '#2E7D32', color: '#fff', boxShadow: '0 4px 12px rgba(46,125,50,.30)',
          }}
        >
          {t('match.detail.startMatch')}
        </button>
      )}

      {match.status === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* ── GOAL BUTTONS — dominant, huge touch targets ── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onPointerDown={() => handleGoalPointerDown('ours')}
              onPointerUp={() => handleGoalPointerUp('ours')}
              onPointerLeave={handleGoalPointerLeave}
              onContextMenu={e => e.preventDefault()}
              style={{
                flex: 1, padding: '24px 10px', borderRadius: 18, fontWeight: 900, fontSize: 20,
                background: '#2E7D32', color: '#fff',
                boxShadow: '0 4px 16px rgba(46,125,50,.35)',
                userSelect: 'none', WebkitUserSelect: 'none',
                touchAction: 'manipulation',
                letterSpacing: 0.5,
              }}
            >
              ⚽ {t('match.detail.ourGoalBtn')}
            </button>
            <button
              onPointerDown={() => handleGoalPointerDown('theirs')}
              onPointerUp={() => handleGoalPointerUp('theirs')}
              onPointerLeave={handleGoalPointerLeave}
              onContextMenu={e => e.preventDefault()}
              style={{
                flex: 1, padding: '24px 10px', borderRadius: 18, fontWeight: 900, fontSize: 20,
                background: '#C62828', color: '#fff',
                boxShadow: '0 4px 16px rgba(198,40,40,.30)',
                userSelect: 'none', WebkitUserSelect: 'none',
                touchAction: 'manipulation',
                letterSpacing: 0.5,
              }}
            >
              ⚽ {t('match.detail.opponentGoalBtn')}
            </button>
          </div>

          {/* Hint — only on first use, then auto-dismiss */}
          {!hintDismissed && match.goals.length === 0 && (
            <div
              onClick={() => { try { localStorage.setItem('torq_goal_hint_seen', '1'); } catch {} }}
              style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: -4 }}
            >
              {t('match.field.quickGoalHint')}
            </div>
          )}

          {/* ── Secondary actions — compact row ── */}
          <div style={{ display: 'flex', gap: 6 }}>
            {showCards && (
              <button
                onClick={() => { vibrate(); setCardModal(true); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                  background: '#FFF9C4', color: '#F9A825',
                }}
              >
                🟨 {t('match.detail.cardBtn')}
              </button>
            )}
            {showSubs && (
              <button
                onClick={() => { vibrate(); setSubModal(true); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                  background: 'var(--primary-light)', color: 'var(--primary)',
                }}
              >
                🔄 {t('match.detail.subBtn')}
              </button>
            )}

            {/* Match controls inline — pause/halftime/finish */}
            {(() => {
              const isLastPeriod = currentPeriod >= periods;
              const canGoNextPeriod = periods > 1 && !isLastPeriod;
              const isPaused = !!match.pausedAt;

              if (!isPaused) {
                return (
                  <>
                    <button
                      onClick={() => { vibrate(); pauseMatch(match.id); }}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                        background: 'var(--surface-var)', color: 'var(--text-muted)',
                      }}
                    >
                      ⏸ {t('match.detail.pauseBtn')}
                    </button>
                    {canGoNextPeriod ? (
                      <button
                        onClick={() => {
                          vibrate(50);
                          pauseMatch(match.id);
                          updateMatch(match.id, { currentPeriod: currentPeriod + 1 });
                        }}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                          background: '#FFF3E0', color: '#E65100',
                        }}
                      >
                        ⏱ {t('match.detail.halftimeBtn')}
                      </button>
                    ) : (
                      <button
                        onClick={() => { vibrate(); handleFinish(); }}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                          background: '#FFEBEE', color: '#C62828',
                        }}
                      >
                        ■ {t('match.detail.finishBtn')}
                      </button>
                    )}
                  </>
                );
              }
              return null;
            })()}
          </div>

          {/* ── Halftime break / Pause state — clear, large buttons ── */}
          {(() => {
            const isLastPeriod = currentPeriod >= periods;
            const canGoNextPeriod = periods > 1 && !isLastPeriod;
            const isPaused = !!match.pausedAt;
            if (!isPaused) return null;

            // Halftime break
            if ((canGoNextPeriod || currentPeriod > 1) && currentPeriod > 1 && !isPeriodOvertime && periodElapsed <= 0) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{
                    textAlign: 'center', padding: '8px', borderRadius: 10,
                    background: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 13,
                  }}>
                    ⏱ {t('match.detail.halftimeBreak')}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => { vibrate(50); resumeMatch(match.id); }}
                      style={{
                        flex: 2, padding: '18px', borderRadius: 16, fontWeight: 800, fontSize: 18,
                        background: '#2E7D32', color: '#fff',
                        boxShadow: '0 4px 12px rgba(46,125,50,.30)',
                      }}
                    >
                      ▶ {t('match.detail.startNextPeriod', { period: getPeriodLabel(t, periods, currentPeriod) })}
                    </button>
                    <button
                      onClick={() => { vibrate(); handleFinish(); }}
                      style={{
                        flex: 1, padding: '18px', borderRadius: 16, fontWeight: 700, fontSize: 14,
                        background: '#FFEBEE', color: '#C62828',
                      }}
                    >
                      ■ {t('match.detail.finishBtn')}
                    </button>
                  </div>
                </div>
              );
            }

            // Regular pause
            return (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { vibrate(); resumeMatch(match.id); }}
                  style={{
                    flex: 1, padding: '16px', borderRadius: 14, fontWeight: 700, fontSize: 15,
                    background: '#E8F5E9', color: '#2E7D32',
                  }}
                >
                  ▶ {t('match.detail.resumeBtn')}
                </button>
                <button
                  onClick={() => { vibrate(); handleFinish(); }}
                  style={{
                    flex: 1, padding: '16px', borderRadius: 14, fontWeight: 700, fontSize: 15,
                    background: '#FFEBEE', color: '#C62828',
                  }}
                >
                  ■ {t('match.detail.finishBtn')}
                </button>
              </div>
            );
          })()}

          {/* ── Panel settings — only show toggle, not always visible ── */}
          <button
            onClick={() => setShowSettings(s => !s)}
            style={{
              alignSelf: 'center', padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: 'transparent', color: 'var(--text-disabled)',
            }}
          >
            ⚙️ {t('match.field.settings')}
          </button>

          {showSettings && (
            <div style={{
              background: 'var(--surface)', borderRadius: 12, padding: '10px 14px',
              display: 'flex', gap: 16,
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" checked={enabledPanels.has('cards')} onChange={() => togglePanel('cards')} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
                🟨 {t('match.field.panelCards')}
              </label>
              {hasBench && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={enabledPanels.has('subs')} onChange={() => togglePanel('subs')} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
                  🔄 {t('match.field.panelSubs')}
                </label>
              )}
            </div>
          )}
        </div>
      )}
      </div>{/* end sticky action buttons */}

      {/* ── Playing time tracker ── */}
      {match.status !== 'planned' && match.lineup.length > 0 && (() => {
        const elapsedMin = Math.max(0, Math.floor(elapsed / 60));
        const playingTime = computePlayingTime(match, elapsedMin);
        const maxTime = Math.max(1, elapsedMin);
        // Sort: on-field first (by minutes desc), then bench (by minutes desc)
        const onFieldIds = new Set<string>();
        // Compute who's currently on field
        const currentlyOnField = new Set(match.lineup.filter(p => p.isStarter).map(p => p.playerId));
        for (const sub of match.substitutions) {
          currentlyOnField.delete(sub.playerOutId);
          currentlyOnField.add(sub.playerInId);
        }
        const sortedPlayers = [...match.lineup].sort((a, b) => {
          const aOn = currentlyOnField.has(a.playerId) ? 1 : 0;
          const bOn = currentlyOnField.has(b.playerId) ? 1 : 0;
          if (aOn !== bOn) return bOn - aOn;
          return (playingTime.get(b.playerId) ?? 0) - (playingTime.get(a.playerId) ?? 0);
        });

        return (
          <details style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden' }}>
            <summary style={{
              padding: '12px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)',
              listStyle: 'none', WebkitAppearance: 'none',
            }}>
              <span>⏱</span> {t('match.detail.playingTime')}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                {sortedPlayers.length} {t('common.players')}
              </span>
            </summary>
            <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedPlayers.map(p => {
                const mins = playingTime.get(p.playerId) ?? 0;
                const pct = maxTime > 0 ? Math.min(100, (mins / maxTime) * 100) : 0;
                const isOn = currentlyOnField.has(p.playerId);
                return (
                  <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: 7,
                      background: isOn ? 'var(--primary)' : 'var(--surface-var)',
                      color: isOn ? '#fff' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                    }}>{p.jerseyNumber}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {p.name}
                    </span>
                    <div style={{ flex: 1, height: 8, background: 'var(--surface-var)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4, transition: 'width .5s',
                        width: `${pct}%`,
                        background: pct > 80 ? '#2E7D32' : pct > 40 ? 'var(--primary)' : pct > 0 ? '#FF9800' : 'transparent',
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 30, textAlign: 'right' }}>
                      {mins}'
                    </span>
                  </div>
                );
              })}
              {/* Fairness indicator */}
              {elapsedMin > 5 && (() => {
                const times = sortedPlayers.map(p => playingTime.get(p.playerId) ?? 0);
                const max = Math.max(...times);
                const min = Math.min(...times);
                const diff = max - min;
                const isFair = diff <= Math.ceil(elapsedMin * 0.3);
                return (
                  <div style={{
                    marginTop: 4, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                    background: isFair ? '#E8F5E9' : '#FFF3E0',
                    color: isFair ? '#2E7D32' : '#E65100',
                    textAlign: 'center',
                  }}>
                    {isFair ? `✓ ${t('match.detail.fairPlayOk')}` : `⚠ ${t('match.detail.fairPlayWarn', { diff })}`}
                  </div>
                );
              })()}
            </div>
          </details>
        );
      })()}

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
                      style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
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

      {/* Substitutions log */}
      {match.substitutions.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-muted)' }}>
            🔄 {t('match.detail.subsLog')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...match.substitutions].sort((a, b) => a.minute - b.minute).map(s => {
              const playerOut = match.lineup.find(p => p.playerId === s.playerOutId);
              const playerIn = match.lineup.find(p => p.playerId === s.playerInId);
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 28 }}>{s.minute}'</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2E7D32' }}>▲ {playerIn?.name ?? '?'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⇄</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#C62828' }}>▼ {playerOut?.name ?? '?'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Post-match summary ── */}
      {match.status === 'finished' && (
        <div style={{
          background: 'linear-gradient(135deg, var(--surface), var(--surface-var))',
          borderRadius: 14, padding: '16px', border: '1.5px solid var(--border)',
        }}>
          <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 12, textAlign: 'center' }}>
            📊 {t('match.detail.matchSummary')}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
            {/* Our stats */}
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary)' }}>{ourScore}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t('match.detail.goals')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{
                padding: '4px 14px', borderRadius: 8, fontWeight: 800, fontSize: 14,
                background: ourScore > theirScore ? '#E8F5E9' : ourScore < theirScore ? '#FFEBEE' : '#FFF3E0',
                color: ourScore > theirScore ? '#2E7D32' : ourScore < theirScore ? '#C62828' : '#E65100',
              }}>
                {ourScore > theirScore ? t('match.result.win') : ourScore < theirScore ? t('match.result.loss') : t('match.result.draw')}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#C62828' }}>{theirScore}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t('match.detail.goals')}</div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 14, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            {match.cards.length > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{match.cards.length}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>🟨 {t('match.detail.cardsCount')}</div>
              </div>
            )}
            {match.substitutions.length > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{match.substitutions.length}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>🔄 {t('match.detail.subsCount')}</div>
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{Math.round(elapsed / 60)}'</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>⏱ {t('match.detail.duration')}</div>
            </div>
          </div>

          {/* Event timeline for finished match */}
          {(match.goals.length > 0 || match.cards.length > 0 || match.substitutions.length > 0) && (() => {
            type TimelineEvent = { minute: number; type: 'goal' | 'card' | 'sub'; label: string; color: string; icon: string };
            const events: TimelineEvent[] = [];

            for (const g of match.goals) {
              const scorer = g.isOpponentGoal ? match.opponent : g.scorerId ? getPlayerName(g.scorerId) : '?';
              events.push({
                minute: g.minute,
                type: 'goal',
                label: g.isOpponentGoal ? `${match.opponent}` : g.isOwnGoal ? t('match.detail.ownGoalLog') : scorer,
                color: g.isOpponentGoal ? '#C62828' : '#2E7D32',
                icon: '⚽',
              });
            }
            for (const c of match.cards) {
              const player = match.lineup.find(p => p.playerId === c.playerId);
              events.push({
                minute: c.minute, type: 'card',
                label: player?.name ?? '?',
                color: c.type === 'red' ? '#C62828' : '#F9A825',
                icon: c.type === 'yellow' ? '🟨' : c.type === 'red' ? '🟥' : '🟨🟥',
              });
            }
            for (const s of match.substitutions) {
              const inP = match.lineup.find(p => p.playerId === s.playerInId);
              const outP = match.lineup.find(p => p.playerId === s.playerOutId);
              events.push({
                minute: s.minute, type: 'sub',
                label: `${inP?.name ?? '?'} ⇄ ${outP?.name ?? '?'}`,
                color: 'var(--text-muted)',
                icon: '🔄',
              });
            }
            events.sort((a, b) => a.minute - b.minute);

            return (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {t('match.detail.eventTimeline')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {events.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 24 }}>{e.minute}'</span>
                      <span style={{ fontSize: 14 }}>{e.icon}</span>
                      <span style={{ fontWeight: 600, color: e.color }}>{e.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── VEO recording ── */}
      {match.veoUrl ? (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>🎥</span>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{t('veo.title')}</span>
            <button
              onClick={() => {
                if (confirm(t('veo.removeConfirm'))) {
                  updateMatch(match.id, { veoUrl: undefined });
                }
              }}
              style={{ fontSize: 11, fontWeight: 600, color: '#C62828', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              {t('veo.remove')}
            </button>
          </div>
          <a
            href={match.veoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', marginTop: 8, padding: '10px 14px', borderRadius: 10,
              background: '#E3F2FD', color: 'var(--primary)', fontWeight: 700, fontSize: 13,
              textDecoration: 'none', textAlign: 'center',
            }}
          >
            {t('veo.watch')}
          </a>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: showVeoInput ? '14px 16px' : '0' }}>
          {!showVeoInput ? (
            <button
              onClick={() => setShowVeoInput(true)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 14, fontWeight: 600, fontSize: 13,
                background: 'var(--surface)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              🎥 {t('veo.add')}
            </button>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🎥</span> {t('veo.title')}
              </div>
              <input
                type="url"
                value={veoInputValue}
                onChange={e => setVeoInputValue(e.target.value)}
                placeholder={t('veo.placeholder')}
                autoFocus
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14,
                  border: '1.5px solid var(--border)', background: 'var(--bg)',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setShowVeoInput(false); setVeoInputValue(''); }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                    background: 'var(--surface-var)', color: 'var(--text-muted)',
                  }}
                >
                  {t('veo.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (veoInputValue.trim()) {
                      updateMatch(match.id, { veoUrl: veoInputValue.trim() });
                      setShowVeoInput(false);
                      setVeoInputValue('');
                    }
                  }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                    background: 'var(--primary)', color: '#fff',
                    opacity: veoInputValue.trim() ? 1 : 0.4,
                  }}
                  disabled={!veoInputValue.trim()}
                >
                  {t('veo.save')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {goalModal !== null && (
        <GoalModal
          match={match}
          isOpponentGoal={goalModal === 'theirs'}
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
