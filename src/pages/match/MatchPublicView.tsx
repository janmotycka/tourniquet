import { useState, useEffect, useRef, useCallback } from 'react';
import type { PublicSeasonMatch, MatchGoal, MatchCard, MatchSubstitution, MatchLineupPlayer } from '../../types/match.types';
import { subscribeToPublicMatch } from '../../services/match.firebase';
import { useI18n } from '../../i18n';

// ─── Wake Lock hook ─────────────────────────────────────────────────────────

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

    // Re-acquire on visibility change (e.g. tab switch back)
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

// ─── Notification helpers ───────────────────────────────────────────────────

function useGoalNotifications(enabled: boolean) {
  const permRef = useRef<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      permRef.current = Notification.permission;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    permRef.current = result;
    return result === 'granted';
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (!enabled || permRef.current !== 'granted') return;
    try {
      new Notification(title, { body, icon: '⚽', tag: 'torq-goal' });
    } catch { /* silent */ }
  }, [enabled]);

  return { requestPermission, notify, supported: 'Notification' in window };
}

// ─── Timer helper ──────────────────────────────────────────────────────────

function computeElapsed(m: PublicSeasonMatch): number {
  if (!m.startedAt) return 0;
  const base = m.pausedElapsed;
  if (m.pausedAt) return base;
  return base + Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 1000);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-');
  return `${d}.${mo}.${y}`;
}

// ─── Celebration durations ─────────────────────────────────────────────────

const GOAL_CELEBRATION_DURATION = 5000;
const FINISH_CELEBRATION_DURATION = 8000;

// ─── Goal celebration overlay ──────────────────────────────────────────────

function GoalCelebration({ isOurGoal, scorerName, minute, ts }: {
  isOurGoal: boolean; scorerName: string | null; minute: number; ts: number;
}) {
  const { t } = useI18n();
  return (
    <div key={ts} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: isOurGoal
        ? 'linear-gradient(135deg, rgba(46,125,50,.92) 0%, rgba(27,94,32,.92) 100%)'
        : 'linear-gradient(135deg, rgba(198,40,40,.85) 0%, rgba(183,28,28,.85) 100%)',
      animation: `matchGoalCelebration ${GOAL_CELEBRATION_DURATION}ms ease-out forwards`,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 56, animation: 'matchGoalPop .5s ease-out' }}>⚽</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: 3, textTransform: 'uppercase' }}>
        {t('matchPublic.goal')}
      </div>
      {scorerName && (
        <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,.9)', marginTop: 4 }}>
          {scorerName}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>
        {minute}'
      </div>
    </div>
  );
}

// ─── Full time celebration overlay ─────────────────────────────────────────

function FullTimeCelebration({ match, ts }: { match: PublicSeasonMatch; ts: number }) {
  const { t } = useI18n();
  return (
    <div key={ts} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
      background: 'linear-gradient(135deg, rgba(27,94,32,.94) 0%, rgba(46,125,50,.94) 100%)',
      animation: `matchFinishCelebration ${FINISH_CELEBRATION_DURATION}ms ease-out forwards`,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#A5D6A7', letterSpacing: 3, textTransform: 'uppercase' }}>
        🏁 {t('matchPublic.finished')}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, fontSize: 56, fontWeight: 900, color: '#fff',
        letterSpacing: 3,
      }}>
        <span>{match.homeScore}</span>
        <span style={{ fontSize: 32, opacity: 0.5 }}>:</span>
        <span>{match.awayScore}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,.85)' }}>
        {match.isHome
          ? `${match.clubName || t('matchPublic.us')} vs ${match.opponent}`
          : `${match.opponent} vs ${match.clubName || t('matchPublic.us')}`}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#81C784', letterSpacing: 2, marginTop: 4 }}>
        ✓ {t('matchPublic.fullTime')}
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MatchPublicView({ matchId }: { matchId: string }) {
  const { t } = useI18n();
  const [match, setMatch] = useState<PublicSeasonMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  // ── Notifications ──
  const [notificationsOn, setNotificationsOn] = useState(() => {
    try { return localStorage.getItem(`torq-notif-${matchId}`) === '1'; } catch { return false; }
  });
  const { requestPermission, notify, supported: notifSupported } = useGoalNotifications(notificationsOn);

  // ── Wake Lock — auto-enable for live matches ──
  const isLiveMatch = match?.status === 'live';
  useWakeLock(isLiveMatch ?? false);

  // ── Celebrations ──
  const [goalCelebration, setGoalCelebration] = useState<{
    isOurGoal: boolean; scorerName: string | null; minute: number; ts: number;
  } | null>(null);
  const [finishCelebration, setFinishCelebration] = useState<{ ts: number } | null>(null);
  const prevScoresRef = useRef<{ home: number; away: number } | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const goalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alreadyShownFinish = useRef(false);

  // Subscribe to public match data
  useEffect(() => {
    const unsub = subscribeToPublicMatch(matchId, (data) => {
      setMatch(data);
      setLoading(false);
    });
    return unsub;
  }, [matchId]);

  // Live timer
  useEffect(() => {
    if (!match || match.status !== 'live' || match.pausedAt) return;
    setElapsed(computeElapsed(match));
    const interval = setInterval(() => setElapsed(computeElapsed(match)), 1000);
    return () => clearInterval(interval);
  }, [match]);

  // Update elapsed on match change (for paused/finished)
  useEffect(() => {
    if (match && match.status !== 'live') {
      setElapsed(computeElapsed(match));
    }
  }, [match]);

  // ── Detect goal / finish transitions for celebrations ──
  useEffect(() => {
    if (!match) return;

    const prevScores = prevScoresRef.current;
    const prevStatus = prevStatusRef.current;
    prevScoresRef.current = { home: match.homeScore, away: match.awayScore };
    prevStatusRef.current = match.status;

    // Goal detection
    if (prevScores) {
      const homeScored = match.homeScore > prevScores.home;
      const awayScored = match.awayScore > prevScores.away;

      if (homeScored || awayScored) {
        const isOurGoal = match.isHome ? homeScored : awayScored;

        // Find the latest goal for scorer info
        let scorerName: string | null = null;
        if (match.goals.length > 0) {
          const latestGoal = match.goals.reduce((a, b) =>
            new Date(b.recordedAt).getTime() > new Date(a.recordedAt).getTime() ? b : a
          );
          if (!latestGoal.isOpponentGoal && latestGoal.scorerId) {
            const player = match.lineup.find(p => p.playerId === latestGoal.scorerId);
            if (player) scorerName = `#${player.jerseyNumber} ${player.name}`;
          }
        }

        const minute = match.goals.length > 0
          ? match.goals.reduce((a, b) =>
              new Date(b.recordedAt).getTime() > new Date(a.recordedAt).getTime() ? b : a
            ).minute
          : Math.floor(computeElapsed(match) / 60) + 1;

        // Clear previous goal timer
        if (goalTimerRef.current) clearTimeout(goalTimerRef.current);

        setGoalCelebration({ isOurGoal, scorerName, minute, ts: Date.now() });

        // Send browser notification
        if (match) {
          const home = match.isHome ? (match.clubName || 'My team') : match.opponent;
          const away = match.isHome ? match.opponent : (match.clubName || 'My team');
          notify(
            `⚽ ${t('matchPublic.goal')}! ${match.homeScore}:${match.awayScore}`,
            `${home} vs ${away}${scorerName ? ` · ${scorerName} ${minute}'` : ''}`,
          );
        }

        goalTimerRef.current = setTimeout(() => {
          setGoalCelebration(null);
          goalTimerRef.current = null;
        }, GOAL_CELEBRATION_DURATION);
      }
    }

    // Finish detection
    if (prevStatus === 'live' && match.status === 'finished' && !alreadyShownFinish.current) {
      alreadyShownFinish.current = true;
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      setFinishCelebration({ ts: Date.now() });
      finishTimerRef.current = setTimeout(() => {
        setFinishCelebration(null);
        finishTimerRef.current = null;
      }, FINISH_CELEBRATION_DURATION);
    }
  }, [match]);

  // Cleanup timers
  useEffect(() => () => {
    if (goalTimerRef.current) clearTimeout(goalTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
  }, []);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>⚽</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>{t('app.loading')}</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{t('matchPublic.notFound')}</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', maxWidth: 280 }}>
          {t('matchPublic.notFoundDesc')}
        </p>
      </div>
    );
  }

  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const isPaused = !!match.pausedAt;
  const periods = match.periods ?? 2;
  const periodDuration = match.periodDurationMinutes ?? Math.round(match.durationMinutes / periods);
  const periodSeconds = periodDuration * 60;
  const currentPeriod = match.currentPeriod ?? 1;
  const durationSec = match.durationMinutes * 60;
  const periodElapsed = elapsed - (currentPeriod - 1) * periodSeconds;
  const isPeriodOvertime = periodElapsed > periodSeconds;
  const isOvertime = elapsed > durationSec;
  const progress = Math.min(1, elapsed / durationSec);

  const periodLabel = periods === 1 ? t('match.period.single')
    : periods === 2 ? t('match.period.half', { n: currentPeriod })
    : periods === 3 ? t('match.period.third', { n: currentPeriod })
    : t('match.period.quarter', { n: currentPeriod });

  const playerName = (id: string | null) => {
    if (!id) return t('matchPublic.unknownPlayer');
    const p = match.lineup.find(lp => lp.playerId === id);
    return p ? `${p.name}${p.jerseyNumber != null ? ` #${p.jerseyNumber}` : ''}` : t('matchPublic.unknownPlayer');
  };

  // Combined timeline
  type TimelineEvent =
    | { type: 'goal'; minute: number; data: MatchGoal }
    | { type: 'card'; minute: number; data: MatchCard }
    | { type: 'sub'; minute: number; data: MatchSubstitution };

  const timeline: TimelineEvent[] = [
    ...match.goals.map(g => ({ type: 'goal' as const, minute: g.minute, data: g })),
    ...match.cards.map(c => ({ type: 'card' as const, minute: c.minute, data: c })),
    ...match.substitutions.map(s => ({ type: 'sub' as const, minute: s.minute, data: s })),
  ].sort((a, b) => a.minute - b.minute);

  const starters = match.lineup.filter(p => p.isStarter);
  const bench = match.lineup.filter(p => !p.isStarter);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes matchGoalCelebration {
          0% { opacity: 0; transform: scale(0.85); }
          8% { opacity: 1; transform: scale(1.03); }
          14% { transform: scale(0.98); }
          18% { opacity: 1; transform: scale(1); }
          80% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.95); }
        }
        @keyframes matchGoalPop {
          0% { transform: scale(0.3) rotate(-20deg); opacity: 0; }
          50% { transform: scale(1.3) rotate(5deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes matchFinishCelebration {
          0% { opacity: 0; transform: scale(0.9); }
          8% { opacity: 1; transform: scale(1.03); }
          14% { transform: scale(0.99); }
          18% { opacity: 1; transform: scale(1); }
          85% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.95); }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }
        @keyframes scoreChange {
          0% { transform: scale(1); }
          30% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* ── Celebration overlays ── */}
      {goalCelebration && (
        <GoalCelebration
          key={goalCelebration.ts}
          isOurGoal={goalCelebration.isOurGoal}
          scorerName={goalCelebration.scorerName}
          minute={goalCelebration.minute}
          ts={goalCelebration.ts}
        />
      )}
      {finishCelebration && match && (
        <FullTimeCelebration key={finishCelebration.ts} match={match} ts={finishCelebration.ts} />
      )}

      {/* ── Header ── */}
      <div style={{
        background: isLive
          ? 'linear-gradient(135deg, var(--primary), #0D47A1)'
          : isFinished
            ? 'linear-gradient(135deg, #1B5E20, #2E7D32)'
            : 'var(--surface)',
        color: (isLive || isFinished) ? '#fff' : 'var(--text)',
        padding: '20px 16px 16px',
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Back button */}
        <button
          onClick={() => {
            window.location.hash = '';
            window.location.reload();
          }}
          style={{
            position: 'absolute', left: 12, top: 14,
            background: 'rgba(255,255,255,.2)', borderRadius: 10, padding: '6px 10px',
            fontWeight: 700, fontSize: 14, color: (isLive || isFinished) ? '#fff' : 'var(--text-muted)',
            border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
        >
          ←
        </button>

        {/* Notification toggle */}
        {notifSupported && isLive && (
          <button
            onClick={async () => {
              if (!notificationsOn) {
                const granted = await requestPermission();
                if (granted) {
                  setNotificationsOn(true);
                  try { localStorage.setItem(`torq-notif-${matchId}`, '1'); } catch {}
                }
              } else {
                setNotificationsOn(false);
                try { localStorage.removeItem(`torq-notif-${matchId}`); } catch {}
              }
            }}
            style={{
              position: 'absolute', right: 12, top: 14,
              background: notificationsOn ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.15)',
              borderRadius: 10, padding: '6px 10px',
              fontWeight: 700, fontSize: 14, color: '#fff',
              border: notificationsOn ? '1.5px solid rgba(255,255,255,.5)' : '1.5px solid transparent',
              cursor: 'pointer', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            title={t(notificationsOn ? 'matchPublic.notifOff' : 'matchPublic.notifOn')}
          >
            {notificationsOn ? '🔔' : '🔕'}
          </button>
        )}

        {/* Competition + date */}
        <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, marginBottom: 10, letterSpacing: 0.5 }}>
          {match.competition && <span>{match.competition} · </span>}
          {formatDate(match.date)} · {match.kickoffTime}
        </div>

        {/* Score — TV style: Team  Score : Score  Team */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0,
        }}>
          {/* Home team */}
          <div style={{ flex: 1, textAlign: 'right', paddingRight: 12, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.isHome ? (match.clubName || t('matchPublic.us')) : match.opponent}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.6, marginTop: 2 }}>
              {t('matchPublic.home')}
            </div>
          </div>

          {/* Score */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 48, fontWeight: 900, letterSpacing: 2,
            minWidth: 120, justifyContent: 'center', flexShrink: 0,
          }}>
            <span key={`h-${match.homeScore}`} style={{ animation: 'scoreChange .4s ease-out' }}>{match.homeScore}</span>
            <span style={{ fontSize: 24, opacity: 0.4 }}>:</span>
            <span key={`a-${match.awayScore}`} style={{ animation: 'scoreChange .4s ease-out' }}>{match.awayScore}</span>
          </div>

          {/* Away team */}
          <div style={{ flex: 1, textAlign: 'left', paddingLeft: 12, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.isHome ? match.opponent : (match.clubName || t('matchPublic.us'))}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.6, marginTop: 2 }}>
              {t('matchPublic.away')}
            </div>
          </div>
        </div>

        {/* Status / Timer + Progress bar */}
        <div style={{ marginTop: 8 }}>
          {isLive && !isPaused && (
            <>
              {/* Period label */}
              {periods > 1 && (
                <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                  {periodLabel}
                </div>
              )}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '5px 16px',
                fontSize: 16, fontWeight: 800, letterSpacing: 1,
              }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  background: '#FF5252', animation: 'livePulse 1.2s infinite',
                  boxShadow: '0 0 8px rgba(255,82,82,.6)',
                }} />
                {formatTime(elapsed)}
                {isPeriodOvertime && <span style={{ fontSize: 11, background: 'rgba(255,82,82,.3)', borderRadius: 8, padding: '1px 6px' }}>{t('matchPublic.overtime')}</span>}
              </div>
              {/* Progress bar */}
              <div style={{
                height: 3, background: 'rgba(255,255,255,.2)', borderRadius: 3,
                marginTop: 10, overflow: 'hidden', maxWidth: 240, margin: '10px auto 0',
              }}>
                <div style={{
                  height: '100%', width: `${progress * 100}%`,
                  background: isOvertime ? '#FF5252' : '#fff',
                  borderRadius: 3, transition: 'width 1s linear',
                }} />
              </div>
              {/* Period dots */}
              {periods > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                  {Array.from({ length: periods }, (_, i) => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: i + 1 < currentPeriod ? '#fff' : i + 1 === currentPeriod ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.3)',
                      boxShadow: i + 1 === currentPeriod ? '0 0 6px rgba(255,255,255,.5)' : 'none',
                    }} />
                  ))}
                </div>
              )}
            </>
          )}
          {isLive && isPaused && (() => {
            const inHalftimeBreak = currentPeriod > 1 && !isPeriodOvertime && periodElapsed <= 0;
            return (
              <>
                {periods > 1 && (
                  <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                    {periodLabel}
                  </div>
                )}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: inHalftimeBreak ? 'rgba(255,152,0,.3)' : 'rgba(255,255,255,0.2)',
                  borderRadius: 20, padding: '4px 14px',
                  fontSize: 14, fontWeight: 700,
                }}>
                  {inHalftimeBreak ? `⏱ ${t('matchPublic.halftimeBreak')}` : `⏸ ${formatTime(elapsed)} · ${t('matchPublic.paused')}`}
                </div>
              </>
            );
          })()}
          {isFinished && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,.2)', borderRadius: 20, padding: '4px 14px',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}>
              ✓ {t('matchPublic.fullTime')}
            </div>
          )}
          {match.status === 'planned' && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-var)', borderRadius: 20, padding: '4px 14px',
              fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
            }}>
              {t('matchPublic.notStarted')}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Combined timeline ── */}
        {timeline.length > 0 && (
          <EventSection title={t('matchPublic.timeline')} icon="📋">
            {(() => {
              // Track running score for goal progression display
              let runHome = 0;
              let runAway = 0;
              const goalOrder = match.goals
                .slice()
                .sort((a, b) => a.minute - b.minute || new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
              const goalScoreMap = new Map<string, string>();
              for (const g of goalOrder) {
                if (g.isOpponentGoal) {
                  match.isHome ? runAway++ : runHome++;
                } else {
                  match.isHome ? runHome++ : runAway++;
                }
                goalScoreMap.set(g.id, `${runHome}:${runAway}`);
              }
              return timeline.map((ev) => {
              if (ev.type === 'goal') {
                const g = ev.data as MatchGoal;
                const isOpp = g.isOpponentGoal;
                const isOG = g.isOwnGoal;
                const runningScore = goalScoreMap.get(g.id);
                return (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                    fontSize: 13, borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--primary)', minWidth: 28 }}>{g.minute}'</span>
                    <span style={{ fontSize: 15 }}>⚽</span>
                    <span style={{ fontWeight: 600, flex: 1, color: isOpp ? '#C62828' : '#2E7D32' }}>
                      {isOpp ? t('matchPublic.opponentGoal') : playerName(g.scorerId)}
                      {isOG && <span style={{ color: '#C62828', marginLeft: 4, fontSize: 11 }}>({t('matchPublic.ownGoal')})</span>}
                    </span>
                    {g.assistId && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {playerName(g.assistId)}
                      </span>
                    )}
                    {runningScore && (
                      <span style={{
                        fontSize: 11, fontWeight: 800, color: 'var(--text-muted)',
                        background: 'var(--surface-var)', borderRadius: 6, padding: '2px 6px',
                        letterSpacing: 1,
                      }}>
                        {runningScore}
                      </span>
                    )}
                  </div>
                );
              }
              if (ev.type === 'card') {
                const c = ev.data as MatchCard;
                const icon = c.type === 'red' ? '🟥' : c.type === 'yellow-red' ? '🟨🟥' : '🟨';
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                    fontSize: 13, borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--primary)', minWidth: 28 }}>{c.minute}'</span>
                    <span style={{ fontSize: 15 }}>{icon}</span>
                    <span style={{ fontWeight: 600, flex: 1 }}>{playerName(c.playerId)}</span>
                  </div>
                );
              }
              // sub
              const s = ev.data as MatchSubstitution;
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                  fontSize: 13, borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontWeight: 700, color: 'var(--primary)', minWidth: 28 }}>{s.minute}'</span>
                  <span style={{ fontSize: 15 }}>🔄</span>
                  <span style={{ color: '#2E7D32', fontWeight: 600 }}>↑ {playerName(s.playerInId)}</span>
                  <span style={{ color: '#C62828', fontWeight: 600 }}>↓ {playerName(s.playerOutId)}</span>
                </div>
              );
            });
            })()}
          </EventSection>
        )}

        {/* ── Lineup ── */}
        {match.lineup.length > 0 && (
          <EventSection title={t('matchPublic.lineup')} icon="👕">
            {starters.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                  {t('matchPublic.starters')}
                </div>
                {starters.map(p => <PlayerRow key={p.playerId} player={p} />)}
              </div>
            )}
            {bench.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                  {t('matchPublic.bench')}
                </div>
                {bench.map(p => <PlayerRow key={p.playerId} player={p} />)}
              </div>
            )}
          </EventSection>
        )}

        {/* ── VEO recording link ── */}
        {match.veoUrl && (
          <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <a
              href={match.veoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px 16px', textDecoration: 'none',
                background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
                color: '#fff', fontWeight: 700, fontSize: 14,
              }}
            >
              {t('veo.watch')}
            </a>
          </div>
        )}

        {/* ── Finished match stats ── */}
        {isFinished && (match.goals.length > 0 || match.cards.length > 0 || match.substitutions.length > 0) && (
          <EventSection title={t('matchPublic.matchStats')} icon="📊">
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
              padding: '4px 0',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary)' }}>{match.goals.length}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{t('matchPublic.goals')}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: match.cards.length > 0 ? '#F9A825' : 'var(--text-muted)' }}>{match.cards.length}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{t('matchPublic.cards')}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-muted)' }}>{match.substitutions.length}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{t('matchPublic.substitutions')}</div>
              </div>
            </div>
            {elapsed > 0 && (
              <div style={{
                textAlign: 'center', fontSize: 12, color: 'var(--text-muted)',
                borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4,
              }}>
                {t('matchPublic.duration')}: <strong>{Math.floor(elapsed / 60)} min</strong>
              </div>
            )}
          </EventSection>
        )}

        {/* Finished match promo banner */}
        {isFinished && (
          <div style={{
            padding: '14px 16px', borderRadius: 14,
            background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
            color: '#fff', textAlign: 'center',
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
              ⚽ {t('promo.finishedTitle')}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10, lineHeight: 1.4 }}>
              {t('promo.finishedDesc')}
            </div>
            <a
              href="https://torq.cz"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '8px 20px', borderRadius: 10,
                background: '#fff', color: '#0D47A1', fontWeight: 700, fontSize: 13,
                textDecoration: 'none',
              }}
            >
              {t('promo.tryCta')}
            </a>
          </div>
        )}

        {/* Empty state — planned match */}
        {match.status === 'planned' && timeline.length === 0 && match.lineup.length === 0 && (
          <div style={{
            padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)',
            background: 'var(--surface)', borderRadius: 14,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {match.isHome
                ? `${match.clubName || t('matchPublic.us')} vs ${match.opponent}`
                : `${match.opponent} vs ${match.clubName || t('matchPublic.us')}`}
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
              {t('matchPublic.plannedKickoff')}
            </p>
            <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--primary)' }}>
              {formatDate(match.date)} · {match.kickoffTime}
            </p>
            {match.competition && (
              <p style={{ fontSize: 12, fontWeight: 600, marginTop: 8, opacity: 0.7 }}>{match.competition}</p>
            )}
          </div>
        )}

        {/* Empty state — live/finished with no events */}
        {match.status !== 'planned' && timeline.length === 0 && match.lineup.length === 0 && (
          <div style={{
            padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)',
            background: 'var(--surface)', borderRadius: 14,
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⚽</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{t('matchPublic.noEvents')}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <span>{t('matchPublic.footer')}</span>
        <a
          href="https://torq.cz"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          ⚡ Powered by <strong style={{ color: 'var(--primary)' }}>TORQ</strong> · torq.cz
        </a>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EventSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{title}</span>
      </div>
      <div style={{ padding: '8px 14px' }}>{children}</div>
    </div>
  );
}

function PlayerRow({ player }: { player: MatchLineupPlayer }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13 }}>
      <span style={{ fontWeight: 700, color: 'var(--text-muted)', minWidth: 24, fontSize: 12 }}>#{player.jerseyNumber}</span>
      <span style={{ fontWeight: 600 }}>{player.name}</span>
      {player.position && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{player.position}</span>}
    </div>
  );
}
