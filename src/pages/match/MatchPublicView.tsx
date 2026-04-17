import { useState, useEffect, useRef, useCallback } from 'react';
import type { PublicSeasonMatch, MatchGoal, MatchCard, MatchSubstitution, MatchLineupPlayer } from '../../types/match.types';
import { subscribeToPublicMatch } from '../../services/match.firebase';
import { formatDate } from '../../components/match/match-utils';
import { useI18n } from '../../i18n';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { TennisTeamPublicView } from '../../modules/tennis/components/TennisTeamPublicView';
import { TennisSinglesPublicView } from '../../modules/tennis/components/TennisSinglesPublicView';
import { OfficialLinkButton } from '../../components/ui';
import { spacing, radius, fontSize, fontWeight } from '../../theme/tokens';

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
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
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
        <div style={{ fontSize: 16, fontWeight: fontWeight.bold, color: 'rgba(255,255,255,.9)', marginTop: spacing.xs }}>
          {scorerName}
        </div>
      )}
      <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>
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
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: spacing.md,
      background: 'linear-gradient(135deg, rgba(27,94,32,.94) 0%, rgba(46,125,50,.94) 100%)',
      animation: `matchFinishCelebration ${FINISH_CELEBRATION_DURATION}ms ease-out forwards`,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.extrabold, color: '#A5D6A7', letterSpacing: 3, textTransform: 'uppercase' }}>
        🏁 {t('matchPublic.finished')}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: spacing.lg, fontSize: 56, fontWeight: 900, color: '#fff',
        letterSpacing: 3,
      }}>
        <span>{match.homeScore}</span>
        <span style={{ fontSize: 32, opacity: 0.5 }}>:</span>
        <span>{match.awayScore}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: fontWeight.bold, color: 'rgba(255,255,255,.85)' }}>
        {match.isHome
          ? `${match.clubName || t('matchPublic.us')} vs ${match.opponent}`
          : `${match.opponent} vs ${match.clubName || t('matchPublic.us')}`}
      </div>
      <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#81C784', letterSpacing: 2, marginTop: spacing.xs }}>
        ✓ {t('matchPublic.fullTime')}
      </div>
    </div>
  );
}

// ─── W/D/L result badge ────────────────────────────────────────────────────

function ResultBadge({ match, t: tFn }: { match: PublicSeasonMatch; t: (key: string) => string }) {
  const ourScore = match.isHome ? match.homeScore : match.awayScore;
  const theirScore = match.isHome ? match.awayScore : match.homeScore;

  let label: string;
  let bg: string;
  let color: string;

  if (ourScore > theirScore) {
    label = tFn('matchPublic.win');
    bg = 'var(--success)';
    color = '#fff';
  } else if (ourScore === theirScore) {
    label = tFn('matchPublic.draw');
    bg = 'var(--warning)';
    color = '#fff';
  } else {
    label = tFn('matchPublic.loss');
    bg = 'var(--danger)';
    color = '#fff';
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: radius.sm,
      background: bg, color,
      fontWeight: fontWeight.extrabold, fontSize: fontSize.sm,
      letterSpacing: 0.5,
      boxShadow: 'var(--shadow-sm)',
    }}>
      {label}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MatchPublicView({ matchId }: { matchId: string }) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();
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
    setElapsed(computeElapsed(match)); // initial sync from match prop
    const interval = setInterval(() => setElapsed(computeElapsed(match)), 1000);
    return () => clearInterval(interval);
  }, [match]);

  // Update elapsed on match change (for paused/finished)
  useEffect(() => {
    if (match && match.status !== 'live') {
      setElapsed(computeElapsed(match)); // sync after match status change
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

        setGoalCelebration({ isOurGoal, scorerName, minute, ts: Date.now() }); // trigger goal celebration animation

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
    // notify and t are stable from hooks; only `match` drives this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  // Cleanup timers
  useEffect(() => () => {
    if (goalTimerRef.current) clearTimeout(goalTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
  }, []);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: spacing.lg }}>
        <div style={{ fontSize: 48 }}>⚽</div>
        <p style={{ color: 'var(--text-muted)', fontSize: fontSize.md }}>{t('app.loading')}</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: spacing.lg }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: fontWeight.bold, fontSize: 17 }}>{t('matchPublic.notFound')}</div>
        <p style={{ color: 'var(--text-muted)', fontSize: fontSize.base, textAlign: 'center', maxWidth: 280 }}>
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

  // Header background: gradient based on status
  const headerBg = isLive
    ? 'linear-gradient(135deg, var(--primary) 0%, #0D47A1 100%)'
    : isFinished
      ? 'linear-gradient(135deg, #263238 0%, #37474F 100%)'
      : 'var(--surface)';

  const headerTextColor = (isLive || isFinished) ? '#fff' : 'var(--text)';

  // Tennis matches — completely different layout (no goals/cards/lineup).
  // Rodiče tenisových hráčů vidí čistě tenisový UI.
  if (match.sport === 'tennis') {
    const clubName = match.clubName || t('matchPublic.us');
    const wrapperStyle: React.CSSProperties = {
      minHeight: '100dvh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', width: '100%',
      maxWidth: isDesktop ? 560 : undefined,
      alignSelf: isDesktop ? 'center' : undefined,
      boxShadow: isDesktop ? 'var(--shadow-lg)' : undefined,
    };
    if (match.matchType === 'team') {
      return (
        <div style={wrapperStyle}>
          <TennisTeamPublicView match={match} clubDisplayName={clubName} />
        </div>
      );
    }
    // Singles (default)
    return (
      <div style={wrapperStyle}>
        <TennisSinglesPublicView match={match} clubDisplayName={clubName} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: isDesktop ? 560 : undefined,
      alignSelf: isDesktop ? 'center' : undefined,
      boxShadow: isDesktop ? 'var(--shadow-lg)' : undefined,
    }}>
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
        @keyframes liveBadgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,82,82,.4); }
          50% { box-shadow: 0 0 0 6px rgba(255,82,82,0); }
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
        background: headerBg,
        color: headerTextColor,
        padding: `${spacing.xl}px ${spacing.lg}px ${spacing.lg}px`,
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Back button */}
        <button
          type="button"
          aria-label={t('common.back') || 'Back'}
          onClick={() => {
            window.location.hash = '';
            window.location.reload();
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.35)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = (isLive || isFinished)
              ? 'rgba(255,255,255,.15)' : 'var(--surface-var)';
          }}
          style={{
            position: 'absolute', left: spacing.md, top: spacing.md, zIndex: 5,
            width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: (isLive || isFinished) ? 'rgba(255,255,255,.15)' : 'var(--surface-var)',
            borderRadius: radius.md,
            fontWeight: fontWeight.bold, fontSize: fontSize.lg, lineHeight: 1,
            color: headerTextColor,
            border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)',
            transition: 'background .15s',
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
                  try { localStorage.setItem(`torq-notif-${matchId}`, '1'); } catch { /* ignore */ }
                }
              } else {
                setNotificationsOn(false);
                try { localStorage.removeItem(`torq-notif-${matchId}`); } catch { /* ignore */ }
              }
            }}
            style={{
              position: 'absolute', right: spacing.md, top: spacing.md,
              background: notificationsOn ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.12)',
              borderRadius: radius.md, padding: `${spacing.xs + 2}px ${spacing.sm + 2}px`,
              fontWeight: fontWeight.bold, fontSize: fontSize.base, color: '#fff',
              border: notificationsOn ? '1.5px solid rgba(255,255,255,.4)' : '1.5px solid transparent',
              cursor: 'pointer', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', gap: spacing.xs,
              transition: 'all .15s',
            }}
            title={t(notificationsOn ? 'matchPublic.notifOff' : 'matchPublic.notifOn')}
          >
            {notificationsOn ? '🔔' : '🔕'}
          </button>
        )}

        {/* Competition + date bar */}
        <div style={{
          fontSize: fontSize.xs, fontWeight: fontWeight.medium,
          opacity: 0.7, marginBottom: spacing.md, letterSpacing: 0.5,
        }}>
          {match.competition && <span>{match.competition} · </span>}
          {formatDate(match.date)} · {match.kickoffTime}
        </div>

        {/* Venue */}
        {match.venue && (
          <div style={{
            fontSize: fontSize.sm, fontWeight: fontWeight.medium,
            opacity: 0.85, marginTop: -spacing.xs, marginBottom: spacing.md,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            📍 <span>{match.venue}</span>
          </div>
        )}

        {/* ── Score display ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Home team */}
          <div style={{ flex: 1, textAlign: 'right', paddingRight: spacing.md, minWidth: 0 }}>
            <div style={{
              fontSize: fontSize.base, fontWeight: fontWeight.extrabold,
              lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {match.isHome ? (match.clubName || t('matchPublic.us')) : match.opponent}
            </div>
            <div style={{ fontSize: 10, fontWeight: fontWeight.medium, opacity: 0.55, marginTop: 2 }}>
              {t('matchPublic.home')}
            </div>
          </div>

          {/* Score box */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: spacing.sm,
            background: (isLive || isFinished) ? 'rgba(0,0,0,.2)' : 'var(--surface-var)',
            borderRadius: radius.lg, padding: `${spacing.sm}px ${spacing.xl}px`,
            minWidth: 130, justifyContent: 'center', flexShrink: 0,
          }}>
            <span
              key={`h-${match.homeScore}`}
              style={{
                fontSize: 48, fontWeight: 900, letterSpacing: 2,
                animation: 'scoreChange .4s ease-out',
              }}
            >
              {match.homeScore}
            </span>
            <span style={{ fontSize: 28, opacity: 0.35, fontWeight: fontWeight.bold }}>:</span>
            <span
              key={`a-${match.awayScore}`}
              style={{
                fontSize: 48, fontWeight: 900, letterSpacing: 2,
                animation: 'scoreChange .4s ease-out',
              }}
            >
              {match.awayScore}
            </span>
          </div>

          {/* Away team */}
          <div style={{ flex: 1, textAlign: 'left', paddingLeft: spacing.md, minWidth: 0 }}>
            <div style={{
              fontSize: fontSize.base, fontWeight: fontWeight.extrabold,
              lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {match.isHome ? match.opponent : (match.clubName || t('matchPublic.us'))}
            </div>
            <div style={{ fontSize: 10, fontWeight: fontWeight.medium, opacity: 0.55, marginTop: 2 }}>
              {t('matchPublic.away')}
            </div>
          </div>
        </div>

        {/* ── Status / Timer + Progress bar ── */}
        <div style={{ marginTop: spacing.sm }}>
          {isLive && !isPaused && (
            <>
              {/* Period label */}
              {periods > 1 && (
                <div style={{ marginBottom: spacing.xs + 2, fontSize: fontSize.sm, fontWeight: fontWeight.bold, opacity: 0.8 }}>
                  {periodLabel}
                </div>
              )}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: spacing.sm,
                background: 'rgba(255,255,255,0.15)', borderRadius: 20,
                padding: `${spacing.xs + 1}px ${spacing.lg}px`,
                fontSize: 16, fontWeight: fontWeight.extrabold, letterSpacing: 1,
                backdropFilter: 'blur(4px)',
              }}>
                {/* Pulsing LIVE dot */}
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  background: '#FF5252',
                  animation: 'livePulse 1.2s infinite, liveBadgePulse 2s infinite',
                }} />
                <span>{formatTime(elapsed)}</span>
                {isPeriodOvertime && (
                  <span style={{
                    fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                    background: 'rgba(255,82,82,.3)', borderRadius: radius.sm,
                    padding: '1px 6px',
                  }}>
                    {t('matchPublic.overtime')}
                  </span>
                )}
              </div>
              {/* Progress bar */}
              <div style={{
                height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 3,
                marginTop: spacing.sm + 2, overflow: 'hidden', maxWidth: 240,
                margin: `${spacing.sm + 2}px auto 0`,
              }}>
                <div style={{
                  height: '100%', width: `${progress * 100}%`,
                  background: isOvertime ? '#FF5252' : 'rgba(255,255,255,.8)',
                  borderRadius: 3, transition: 'width 1s linear',
                }} />
              </div>
              {/* Period dots */}
              {periods > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: spacing.sm }}>
                  {Array.from({ length: periods }, (_, i) => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: i + 1 < currentPeriod ? '#fff' : i + 1 === currentPeriod ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.25)',
                      boxShadow: i + 1 === currentPeriod ? '0 0 6px rgba(255,255,255,.5)' : 'none',
                      transition: 'all .3s',
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
                  <div style={{ marginBottom: spacing.xs + 2, fontSize: fontSize.sm, fontWeight: fontWeight.bold, opacity: 0.8 }}>
                    {periodLabel}
                  </div>
                )}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: inHalftimeBreak ? 'rgba(255,152,0,.3)' : 'rgba(255,255,255,0.15)',
                  borderRadius: 20, padding: `${spacing.xs}px ${spacing.md + 2}px`,
                  fontSize: fontSize.base, fontWeight: fontWeight.bold,
                  backdropFilter: 'blur(4px)',
                }}>
                  {inHalftimeBreak ? `⏱ ${t('matchPublic.halftimeBreak')}` : `⏸ ${formatTime(elapsed)} · ${t('matchPublic.paused')}`}
                </div>
              </>
            );
          })()}
          {isFinished && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
              marginTop: spacing.xs,
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,.15)', borderRadius: 20,
                padding: `${spacing.xs}px ${spacing.md + 2}px`,
                fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#fff',
                backdropFilter: 'blur(4px)',
              }}>
                ✓ {t('matchPublic.fullTime')}
              </div>
              <ResultBadge match={match} t={t} />
            </div>
          )}
          {match.status === 'planned' && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-var)', borderRadius: 20,
              padding: `${spacing.xs}px ${spacing.md + 2}px`,
              fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: 'var(--text-muted)',
            }}>
              {t('matchPublic.notStarted')}
            </div>
          )}
        </div>
      </div>

      {/* ── Auto-refresh hint for live matches ── */}
      {isLive && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
          padding: `${spacing.xs + 2}px ${spacing.lg}px`,
          background: 'var(--success-light)',
          fontSize: fontSize.xs, fontWeight: fontWeight.medium,
          color: 'var(--success)',
        }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', animation: 'livePulse 2s infinite' }} />
          {t('matchPublic.autoRefresh')}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{
        flex: 1, padding: `${spacing.md}px ${spacing.lg}px ${spacing.xl}px`,
        display: 'flex', flexDirection: 'column', gap: spacing.md,
      }}>

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
                  if (match.isHome) runAway++; else runHome++;
                } else {
                  if (match.isHome) runHome++; else runAway++;
                }
                goalScoreMap.set(g.id, `${runHome}:${runAway}`);
              }
              return timeline.map((ev, idx) => {
              const isLast = idx === timeline.length - 1;
              if (ev.type === 'goal') {
                const g = ev.data as MatchGoal;
                const isOpp = g.isOpponentGoal;
                const isOG = g.isOwnGoal;
                const runningScore = goalScoreMap.get(g.id);
                return (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: spacing.sm,
                    padding: `${spacing.xs + 2}px 0`,
                    fontSize: fontSize.sm,
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  }}>
                    <MinuteBadge minute={g.minute} color="var(--primary)" />
                    <span style={{ fontSize: fontSize.md }}>⚽</span>
                    <span style={{
                      fontWeight: fontWeight.medium, flex: 1,
                      color: isOpp ? 'var(--danger)' : 'var(--success)',
                    }}>
                      {isOpp ? t('matchPublic.opponentGoal') : playerName(g.scorerId)}
                      {isOG && (
                        <span style={{ color: 'var(--danger)', marginLeft: spacing.xs, fontSize: fontSize.xs }}>
                          ({t('matchPublic.ownGoal')})
                        </span>
                      )}
                    </span>
                    {g.assistId && (
                      <span style={{ fontSize: fontSize.xs, color: 'var(--text-muted)' }}>
                        {playerName(g.assistId)}
                      </span>
                    )}
                    {runningScore && (
                      <span style={{
                        fontSize: fontSize.xs, fontWeight: fontWeight.extrabold,
                        color: 'var(--primary)', background: 'var(--primary-light)',
                        borderRadius: radius.sm, padding: '2px 7px', letterSpacing: 1,
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
                    display: 'flex', alignItems: 'center', gap: spacing.sm,
                    padding: `${spacing.xs + 2}px 0`,
                    fontSize: fontSize.sm,
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  }}>
                    <MinuteBadge minute={c.minute} color="var(--primary)" />
                    <span style={{ fontSize: fontSize.md }}>{icon}</span>
                    <span style={{ fontWeight: fontWeight.medium, flex: 1 }}>{playerName(c.playerId)}</span>
                  </div>
                );
              }
              // sub
              const s = ev.data as MatchSubstitution;
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: spacing.sm,
                  padding: `${spacing.xs + 2}px 0`,
                  fontSize: fontSize.sm,
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                }}>
                  <MinuteBadge minute={s.minute} color="var(--primary)" />
                  <span style={{ fontSize: fontSize.md }}>🔄</span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ color: 'var(--success)', fontWeight: fontWeight.medium, fontSize: fontSize.sm }}>
                      ↑ {playerName(s.playerInId)}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: fontWeight.medium, fontSize: fontSize.xs }}>
                      ↓ {playerName(s.playerOutId)}
                    </span>
                  </div>
                </div>
              );
            });
            })()}
          </EventSection>
        )}

        {/* ── Lineup ── */}
        {match.lineup.length > 0 ? (
          <EventSection title={t('matchPublic.lineup')} icon="👕">
            {starters.length > 0 && (
              <div style={{ marginBottom: spacing.xs + 2 }}>
                <div style={{
                  fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                  color: 'var(--text-muted)', marginBottom: spacing.xs,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {t('matchPublic.starters')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
                  {starters.map(p => <PlayerChip key={p.playerId} player={p} />)}
                </div>
              </div>
            )}
            {bench.length > 0 && (
              <div>
                <div style={{
                  fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                  color: 'var(--text-muted)', marginBottom: spacing.xs,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {t('matchPublic.bench')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
                  {bench.map(p => <PlayerChip key={p.playerId} player={p} muted />)}
                </div>
              </div>
            )}
          </EventSection>
        ) : match.status === 'planned' && (
          <EventSection title={t('matchPublic.lineup')} icon="👕">
            <div style={{
              padding: `${spacing.md}px ${spacing.sm}px`,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: fontSize.sm,
              lineHeight: 1.5,
            }}>
              🔒 {t('matchPublic.lineupHidden')}
            </div>
          </EventSection>
        )}

        {/* ── VEO recording link ── */}
        {match.veoUrl && (
          <div style={{
            background: 'var(--surface)', borderRadius: radius.xl,
            overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
          }}>
            <a
              href={match.veoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                padding: `${spacing.md + 2}px ${spacing.lg}px`, textDecoration: 'none',
                background: 'linear-gradient(135deg, var(--info) 0%, #0D47A1 100%)',
                color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.base,
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
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.sm,
              padding: `${spacing.xs}px 0`,
            }}>
              <StatBox
                value={match.goals.length}
                label={t('matchPublic.goals')}
                color="var(--primary)"
              />
              <StatBox
                value={match.cards.length}
                label={t('matchPublic.cards')}
                color={match.cards.length > 0 ? 'var(--warning)' : 'var(--text-muted)'}
              />
              <StatBox
                value={match.substitutions.length}
                label={t('matchPublic.substitutions')}
                color="var(--text-muted)"
              />
            </div>
            {elapsed > 0 && (
              <div style={{
                textAlign: 'center', fontSize: fontSize.sm, color: 'var(--text-muted)',
                borderTop: '1px solid var(--border)', paddingTop: spacing.sm, marginTop: spacing.xs,
              }}>
                {t('matchPublic.duration')}: <strong>{Math.floor(elapsed / 60)} min</strong>
              </div>
            )}
          </EventSection>
        )}

        {/* Finished match promo banner */}
        {isFinished && (
          <div style={{
            padding: `${spacing.md + 2}px ${spacing.lg}px`, borderRadius: radius.xl,
            background: 'linear-gradient(135deg, var(--primary) 0%, #0D47A1 100%)',
            color: '#fff', textAlign: 'center',
          }}>
            <div style={{ fontWeight: fontWeight.extrabold, fontSize: fontSize.base, marginBottom: spacing.xs }}>
              ⚽ {t('promo.finishedTitle')}
            </div>
            <div style={{ fontSize: fontSize.sm, opacity: 0.85, marginBottom: spacing.sm + 2, lineHeight: 1.4 }}>
              {t('promo.finishedDesc')}
            </div>
            <a
              href="https://torq.cz"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: `${spacing.sm}px ${spacing.xl}px`,
                borderRadius: radius.md,
                background: '#fff', color: 'var(--primary)', fontWeight: fontWeight.bold, fontSize: fontSize.sm,
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
            padding: `${spacing.xxl}px ${spacing.xl}px`, textAlign: 'center',
            color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: radius.xl,
          }}>
            <div style={{ fontSize: 48, marginBottom: spacing.md }}>🏟️</div>
            <p style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: 'var(--text)', marginBottom: spacing.xs }}>
              {match.isHome
                ? `${match.clubName || t('matchPublic.us')} vs ${match.opponent}`
                : `${match.opponent} vs ${match.clubName || t('matchPublic.us')}`}
            </p>
            <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: 2 }}>
              {t('matchPublic.plannedKickoff')}
            </p>
            <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--primary)' }}>
              {formatDate(match.date)} · {match.kickoffTime}
            </p>
            {match.competition && (
              <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: spacing.sm, opacity: 0.7 }}>
                {match.competition}
              </p>
            )}
          </div>
        )}

        {/* Empty state — live/finished with no events */}
        {match.status !== 'planned' && timeline.length === 0 && match.lineup.length === 0 && (
          <div style={{
            padding: `${spacing.xxl}px ${spacing.xl}px`, textAlign: 'center',
            color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: radius.xl,
          }}>
            <div style={{ fontSize: 36, marginBottom: spacing.sm }}>⚽</div>
            <p style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium }}>
              {t('matchPublic.noEvents')}
            </p>
          </div>
        )}
      </div>

      {/* Official link */}
      {match.officialResultsUrl && (
        <div style={{ padding: `${spacing.md}px ${spacing.lg}px 0` }}>
          <OfficialLinkButton url={match.officialResultsUrl} />
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: `${spacing.md}px ${spacing.lg}px`,
        textAlign: 'center', fontSize: fontSize.xs, color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: spacing.xs + 2,
      }}>
        <span>{t('matchPublic.footer')}</span>
        <a
          href="https://torq.cz"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          Powered by <strong style={{ color: 'var(--primary)' }}>TORQ</strong> · torq.cz
        </a>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EventSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: radius.xl,
      overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        padding: `${spacing.sm + 2}px ${spacing.md + 2}px`,
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: spacing.xs + 2,
      }}>
        <span style={{ fontSize: fontSize.md }}>{icon}</span>
        <span style={{ fontWeight: fontWeight.extrabold, fontSize: fontSize.base }}>{title}</span>
      </div>
      <div style={{ padding: `${spacing.sm}px ${spacing.md + 2}px` }}>{children}</div>
    </div>
  );
}

/** Compact minute badge used in timeline rows */
function MinuteBadge({ minute, color }: { minute: number; color: string }) {
  return (
    <span style={{
      fontWeight: fontWeight.bold, color,
      minWidth: 30, textAlign: 'center',
      fontSize: fontSize.xs,
      background: 'var(--primary-light)',
      borderRadius: radius.sm,
      padding: '2px 4px',
    }}>
      {minute}'
    </span>
  );
}

/** Stat box for finished match stats grid */
function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: `${spacing.sm}px ${spacing.xs}px`,
      background: 'var(--surface-var)', borderRadius: radius.md,
    }}>
      <div style={{ fontSize: fontSize.xl, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

/** Player chip for lineup display (compact, wrappable) */
function PlayerChip({ player, muted }: { player: MatchLineupPlayer; muted?: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: spacing.xs,
      padding: `3px ${spacing.sm}px`,
      background: muted ? 'var(--bg)' : 'var(--surface-var)',
      borderRadius: radius.sm,
      fontSize: fontSize.sm,
    }}>
      <span style={{
        fontWeight: fontWeight.bold,
        color: muted ? 'var(--text-disabled)' : 'var(--primary)',
        fontSize: fontSize.xs,
      }}>
        #{player.jerseyNumber}
      </span>
      <span style={{
        fontWeight: fontWeight.medium,
        color: muted ? 'var(--text-muted)' : 'var(--text)',
      }}>
        {player.name}
      </span>
      {player.position && (
        <span style={{
          fontSize: 10, color: 'var(--text-disabled)',
          fontWeight: fontWeight.medium,
        }}>
          {player.position}
        </span>
      )}
    </div>
  );
}
