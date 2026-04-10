import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Tournament, Match } from '../../../types/tournament.types';
import { computeMatchElapsed, formatMatchTime } from '../../../utils/tournament-schedule';
import { useI18n } from '../../../i18n';
import type { Locale } from '../../../i18n/context';
import { PublicTeamBadge } from './PublicTeamBadge';
import { LiveReactions } from './LiveReactions';

// ─── Stage separátor pro public view ─────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  group: '', quarterfinal: 'Čtvrtfinále', semifinal: 'Semifinále',
  final: 'Finále', 'third-place': 'O 3. místo', placement: 'O umístění',
};

function renderPublicMatchesWithStages(
  matches: Match[],
  renderFn: (m: Match) => React.ReactNode,
) {
  let lastStage = '';
  let lastPlacement = '';
  return matches.map(m => {
    const stage = m.stage ?? 'group';
    const pl = m.placementLabel ?? '';
    const isNew = stage !== 'group' && (stage !== lastStage || (stage === 'placement' && pl !== lastPlacement));
    lastStage = stage;
    lastPlacement = pl;
    const label = stage === 'placement' && pl ? pl : STAGE_LABELS[stage] ?? '';
    const emoji = stage === 'final' ? '🏆' : stage === 'third-place' ? '🥉' : stage === 'placement' ? '🏅' : stage === 'semifinal' || stage === 'quarterfinal' ? '⚔️' : '';
    return (
      <React.Fragment key={m.id}>
        {isNew && label && (
          <div style={{
            padding: '6px 0 2px', fontSize: 12, fontWeight: 700,
            color: stage === 'final' ? 'var(--warning)' : 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 0.8,
          }}>
            {emoji} {label}
          </div>
        )}
        {renderFn(m)}
      </React.Fragment>
    );
  });
}

// ─── Miniaturní odpočítávač přímo v řádku živého zápasu ────────────────────
function LiveRowTimer({ match: m }: { match: Match }) {
  const [elapsed, setElapsed] = useState(() =>
    computeMatchElapsed(m.startedAt, m.pausedAt, m.pausedElapsed)
  );
  useEffect(() => {
    if (m.pausedAt) return;
    const iv = setInterval(() => setElapsed(computeMatchElapsed(m.startedAt, m.pausedAt, m.pausedElapsed)), 1000);
    return () => clearInterval(iv);
  }, [m.startedAt, m.pausedAt, m.pausedElapsed]);

  const remaining = m.durationMinutes * 60 - elapsed;
  const isOT = remaining < 0;
  const sec = Math.abs(remaining);
  const mm = Math.floor(sec / 60).toString().padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: isOT ? 'var(--danger)' : 'var(--text)', letterSpacing: 0.3 }}>
      {m.pausedAt ? '⏸' : (isOT ? `+${mm}:${ss}` : `${mm}:${ss}`)}
    </span>
  );
}

// ─── Celebration duration ───────────────────────────────────────────────────
const GOAL_CELEBRATION_DURATION = 5000;
const FINISH_CELEBRATION_DURATION = 8000;

// ─── Gólový overlay uvnitř karty zápasu ─────────────────────────────────────
interface GoalInfo {
  matchId: string;
  teamColor: string;
  homeScored: boolean;
  scorerName: string | null;
  scorerNumber: number | null;
  minute: number | null;
  ts: number; // unique timestamp to force animation restart
}

function GoalOverlay({ goal, homeScore, awayScore, homeTeamName, awayTeamName }: {
  goal: GoalInfo; homeScore: number; awayScore: number;
  homeTeamName: string; awayTeamName: string;
}) {
  const cr = parseInt(goal.teamColor.slice(1, 3), 16) || 0;
  const cg = parseInt(goal.teamColor.slice(3, 5), 16) || 0;
  const cb = parseInt(goal.teamColor.slice(5, 7), 16) || 0;
  const lum = (0.299 * cr + 0.587 * cg + 0.114 * cb) / 255;
  const textColor = lum > 0.6 ? '#1a1a1a' : '#ffffff';
  const subColor = lum > 0.6 ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.7)';
  const dimColor = lum > 0.6 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.45)';

  // Skóre strany, která dala gól, je zvýrazněné (velké + pop animace)
  const scoredSize = 28;
  const otherSize = 18;

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10,
      background: `linear-gradient(135deg, ${goal.teamColor}ee 0%, ${goal.teamColor}cc 100%)`,
      borderRadius: 12,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 4, padding: '10px 12px',
      animation: `goalCelebration ${GOAL_CELEBRATION_DURATION}ms ease-out forwards`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: textColor, letterSpacing: 2, textTransform: 'uppercase' }}>
        ⚽ GÓÓL!
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span style={{
          fontWeight: 700, fontSize: 13, color: goal.homeScored ? textColor : dimColor,
          textAlign: 'right', lineHeight: 1.2, wordBreak: 'break-word',
          flex: 1, minWidth: 0,
        }}>
          {homeTeamName}
        </span>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 4,
          background: lum > 0.6 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.2)',
          borderRadius: 10, padding: '2px 10px',
          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>
          <span style={{
            fontWeight: 900, fontSize: goal.homeScored ? scoredSize : otherSize,
            color: goal.homeScored ? textColor : dimColor,
            ...(goal.homeScored ? { animation: 'goalScorePop 0.4s ease-out 0.1s both' } : {}),
          }}>
            {homeScore}
          </span>
          <span style={{ fontWeight: 700, fontSize: 16, color: subColor }}>:</span>
          <span style={{
            fontWeight: 900, fontSize: !goal.homeScored ? scoredSize : otherSize,
            color: !goal.homeScored ? textColor : dimColor,
            ...(!goal.homeScored ? { animation: 'goalScorePop 0.4s ease-out 0.1s both' } : {}),
          }}>
            {awayScore}
          </span>
        </div>
        <span style={{
          fontWeight: 700, fontSize: 13, color: !goal.homeScored ? textColor : dimColor,
          textAlign: 'left', lineHeight: 1.2, wordBreak: 'break-word',
          flex: 1, minWidth: 0,
        }}>
          {awayTeamName}
        </span>
      </div>
      {(goal.scorerName || goal.minute !== null) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11 }}>
          {goal.scorerNumber !== null && <span style={{ fontWeight: 800, color: subColor }}>#{goal.scorerNumber}</span>}
          {goal.scorerName && <span style={{ fontWeight: 700, color: textColor }}>{goal.scorerName}</span>}
          {goal.minute !== null && <span style={{ fontWeight: 600, color: subColor }}>· {goal.minute}'</span>}
        </div>
      )}
    </div>
  );
}

// ─── FULL TIME overlay uvnitř karty zápasu ──────────────────────────────────
// ─── Řádek zápasu ───────────────────────────────────────────────────────────
function MatchRow({ match, isLive = false, tournament, t, locale, goalOverlay }: {
  match: Match; isLive?: boolean; tournament: Tournament;
  t: (key: string, params?: Record<string, string | number>) => string; locale: Locale;
  goalOverlay?: GoalInfo | null;
}) {
  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);
  const homeT = getTeam(match.homeTeamId);
  const awayT = getTeam(match.awayTeamId);
  const [expanded, setExpanded] = useState(false);

  const hasGoals = match.goals.length > 0;
  const showGoals = hasGoals && (isLive || expanded);
  const goalsToShow = showGoals ? match.goals : [];
  const isClickable = match.status === 'finished';

  const scoreStyle: React.CSSProperties = isLive
    ? { color: 'var(--danger)', fontWeight: 900, fontSize: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }
    : match.status === 'finished'
    ? { background: 'var(--success-light)', color: 'var(--success)', borderRadius: 8, padding: '4px 10px', fontWeight: 800, fontSize: 15, minWidth: 50, textAlign: 'center', flexShrink: 0 }
    : { color: 'var(--text-muted)', fontWeight: 600, fontSize: 14, minWidth: 50, textAlign: 'center', flexShrink: 0 };

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 14,
      border: isLive ? '2px solid #FFCDD2' : match.status === 'finished' ? '1.5px solid #C8E6C9' : '1.5px solid var(--border)',
      boxShadow: '0 1px 3px rgba(0,0,0,.05)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Goal celebration overlay — inside the match card */}
      {goalOverlay && (
        <GoalOverlay
          key={goalOverlay.ts}
          goal={goalOverlay}
          homeScore={match.homeScore}
          awayScore={match.awayScore}
          homeTeamName={homeT?.name ?? '?'}
          awayTeamName={awayT?.name ?? '?'}
        />
      )}

      {isLive ? (
        <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <PublicTeamBadge team={homeT} size={14} />
            <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word' }}>{homeT?.name ?? '?'}</span>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 64 }}>
            <LiveRowTimer match={match} />
            <span style={scoreStyle}>{`${match.homeScore} : ${match.awayScore}`}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--danger)' }} />
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.5, color: 'var(--danger)' }}>{t('tournament.public.liveLabel')}</span>
            </div>
            {(tournament.settings.numberOfPitches ?? 1) > 1 && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
                {t('tournament.public.pitch', { n: match.pitchNumber ?? 1 })}
              </span>
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word', textAlign: 'right' }}>{awayT?.name ?? '?'}</span>
            <PublicTeamBadge team={awayT} size={14} />
          </div>
        </div>
      ) : (
        <div
          onClick={() => isClickable && setExpanded(e => !e)}
          style={{
            padding: '10px 12px 8px', display: 'flex', alignItems: 'center', gap: 8,
            cursor: isClickable ? 'pointer' : 'default',
          }}
        >
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <PublicTeamBadge team={homeT} size={13} />
            <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word' }}>{homeT?.name ?? '?'}</span>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 60 }}>
            {match.status === 'scheduled' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatMatchTime(match.scheduledTime, locale)}</span>
                {(tournament.settings.numberOfPitches ?? 1) > 1 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
                    {t('tournament.public.pitch', { n: match.pitchNumber ?? 1 })}
                  </span>
                )}
              </div>
            )}
            <span style={scoreStyle}>
              {match.status === 'scheduled' ? '— : —' : `${match.homeScore} : ${match.awayScore}`}
            </span>
            {match.status === 'finished' && match.homePenaltyScore != null && match.awayPenaltyScore != null && (
              <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)' }}>
                pen {match.homePenaltyScore}:{match.awayPenaltyScore}
              </div>
            )}
            {match.status === 'live' && (match.penaltyKicks?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <div style={{ display: 'flex', gap: 1 }}>
                  {match.penaltyKicks!.filter(k => k.side === 'home').map((k, i) => (
                    <span key={i} style={{ fontSize: 10 }}>{k.scored ? '⚽' : '❌'}</span>
                  ))}
                </div>
                <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--warning)' }}>
                  pen {match.homePenaltyScore ?? 0}:{match.awayPenaltyScore ?? 0}
                </span>
                <div style={{ display: 'flex', gap: 1 }}>
                  {match.penaltyKicks!.filter(k => k.side === 'away').map((k, i) => (
                    <span key={i} style={{ fontSize: 10 }}>{k.scored ? '⚽' : '❌'}</span>
                  ))}
                </div>
              </div>
            )}
            {isClickable && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform .2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ▾
              </span>
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word', textAlign: 'right' }}>{awayT?.name ?? '?'}</span>
            <PublicTeamBadge team={awayT} size={13} />
          </div>
        </div>
      )}

      {showGoals && (
        <div style={{
          padding: '6px 12px 10px',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 3,
          background: 'var(--surface-var)',
        }}>
          {goalsToShow.map(goal => {
            const scoringTeam = getTeam(goal.teamId);
            const beneficiaryId = goal.isOwnGoal
              ? (goal.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId)
              : goal.teamId;
            const isHomeGoal = beneficiaryId === match.homeTeamId;
            const player = scoringTeam?.players.find(p => p.id === goal.playerId);

            let label: string;
            if (goal.isOwnGoal) {
              label = `⚠️ VG (${scoringTeam?.name ?? '?'})`;
            } else if (player) {
              label = `${player.jerseyNumber}. ${player.name}`;
            } else {
              label = t('tournament.public.noScorer');
            }

            return (
              <div key={goal.id} style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', gap: 2, alignItems: 'center' }}>
                {isHomeGoal ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    background: 'rgba(0,0,0,.04)', borderRadius: 5, padding: '3px 6px',
                    borderLeft: `2.5px solid ${homeT?.color ?? 'var(--primary)'}`,
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}>
                      ⚽ {label}
                    </span>
                  </div>
                ) : <div />}
                <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                  {goal.minute}'
                </div>
                {!isHomeGoal ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3,
                    background: 'rgba(0,0,0,.04)', borderRadius: 5, padding: '3px 6px',
                    borderRight: `2.5px solid ${awayT?.color ?? '#666'}`,
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word', textAlign: 'right' }}>
                      {label} ⚽
                    </span>
                  </div>
                ) : <div />}
              </div>
            );
          })}
        </div>
      )}

      {isLive && (tournament.settings.reactionsEnabled ?? false) && homeT && awayT && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <LiveReactions
            tournamentId={tournament.id}
            matchId={match.id}
            homeTeam={{ id: homeT.id, name: homeT.name, color: homeT.color }}
            awayTeam={{ id: awayT.id, name: awayT.name, color: awayT.color }}
          />
        </div>
      )}

      {isClickable && expanded && !hasGoals && (
        <div style={{ padding: '6px 14px 10px', borderTop: '1px solid var(--border)', background: 'var(--surface-var)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          {t('tournament.public.noGoalsRecorded')}
        </div>
      )}
    </div>
  );
}

export function PublicResults({ tournament, selectedTeamId }: { tournament: Tournament; selectedTeamId: string | null }) {
  const { t, locale } = useI18n();

  const { liveMatches, scheduledMatches, finishedMatches } = useMemo(() => {
    const matchFilter = (m: Match) =>
      selectedTeamId === null || m.homeTeamId === selectedTeamId || m.awayTeamId === selectedTeamId;
    return {
      liveMatches: tournament.matches.filter(m => m.status === 'live' && matchFilter(m)).sort((a, b) => a.matchIndex - b.matchIndex),
      scheduledMatches: tournament.matches.filter(m => m.status === 'scheduled' && matchFilter(m)).sort((a, b) => a.matchIndex - b.matchIndex),
      finishedMatches: tournament.matches.filter(m => m.status === 'finished' && matchFilter(m)).sort((a, b) => b.matchIndex - a.matchIndex),
    };
  }, [tournament.matches, selectedTeamId]);
  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  // ── Track recently finished matches for FULL TIME celebration ──
  const [recentlyFinished, setRecentlyFinished] = useState<Set<string>>(new Set());
  const prevLiveIds = useRef<Set<string>>(new Set());
  const finishTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Guard: each match can only trigger FULL TIME once per component lifecycle
  const alreadyShownFinish = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentLiveIds = new Set(liveMatches.map(m => m.id));
    const currentFinishedIds = new Set(finishedMatches.map(m => m.id));

    // Detect matches that transitioned from live → finished (and haven't been shown yet)
    const justFinished = [...prevLiveIds.current].filter(
      id => !currentLiveIds.has(id) && currentFinishedIds.has(id) && !alreadyShownFinish.current.has(id)
    );
    prevLiveIds.current = currentLiveIds;

    if (justFinished.length > 0) {
      justFinished.forEach(id => alreadyShownFinish.current.add(id));

      setRecentlyFinished(prev => {
        const next = new Set(prev);
        justFinished.forEach(id => next.add(id));
        return next;
      });

      for (const id of justFinished) {
        const timer = setTimeout(() => {
          setRecentlyFinished(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          finishTimers.current.delete(id);
        }, FINISH_CELEBRATION_DURATION);
        finishTimers.current.set(id, timer);
      }
    }
  }, [liveMatches, finishedMatches]);

  // ── Combined list: live matches + recently finished, sorted by matchIndex ──
  const combinedLiveSection = useMemo(() => {
    const recentlyFinishedMatches = finishedMatches.filter(m => recentlyFinished.has(m.id));
    return [...liveMatches, ...recentlyFinishedMatches].sort((a, b) => a.matchIndex - b.matchIndex);
  }, [liveMatches, finishedMatches, recentlyFinished]);

  // ── Track goal celebrations per match (multiple can run simultaneously) ──
  const [activeGoals, setActiveGoals] = useState<Map<string, GoalInfo>>(new Map());
  const prevLiveScores = useRef<Map<string, { home: number; away: number }>>(new Map());
  const goalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const prev = prevLiveScores.current;

    for (const match of liveMatches) {
      const old = prev.get(match.id);
      if (!old) {
        prev.set(match.id, { home: match.homeScore, away: match.awayScore });
        continue;
      }

      const homeScored = match.homeScore > old.home;
      const awayScored = match.awayScore > old.away;

      prev.set(match.id, { home: match.homeScore, away: match.awayScore });

      if (homeScored || awayScored) {
        const homeTeam = getTeam(match.homeTeamId);
        const awayTeam = getTeam(match.awayTeamId);
        const benefitTeam = homeScored ? homeTeam : awayTeam;

        const latestGoal = match.goals.length > 0
          ? match.goals.reduce((a, b) =>
            new Date(b.recordedAt).getTime() > new Date(a.recordedAt).getTime() ? b : a
          )
          : null;

        let scorerName: string | null = null;
        let scorerNumber: number | null = null;
        let minute: number | null = null;

        if (latestGoal) {
          minute = latestGoal.minute;
          const scoringTeam = getTeam(latestGoal.teamId);
          const player = scoringTeam?.players.find(p => p.id === latestGoal.playerId);
          if (player) {
            scorerName = player.name;
            scorerNumber = player.jerseyNumber;
          }
          if (latestGoal.isOwnGoal) {
            scorerName = `${t('tournament.public.ownGoalShort')} (${scoringTeam?.name ?? '?'})`;
            scorerNumber = null;
          }
        }

        const goalInfo: GoalInfo = {
          matchId: match.id,
          teamColor: benefitTeam?.color ?? '#F57F17',
          homeScored: homeScored,
          scorerName, scorerNumber, minute,
          ts: Date.now(),
        };

        // Add goal for this match (each match gets its own overlay)
        setActiveGoals(prev => new Map(prev).set(match.id, goalInfo));

        // Clear any previous timer for this match and set new one
        const existingTimer = goalTimers.current.get(match.id);
        if (existingTimer) clearTimeout(existingTimer);
        const timer = setTimeout(() => {
          setActiveGoals(prev => {
            const next = new Map(prev);
            next.delete(match.id);
            return next;
          });
          goalTimers.current.delete(match.id);
        }, GOAL_CELEBRATION_DURATION);
        goalTimers.current.set(match.id, timer);
      }
    }

    const liveIds = new Set(liveMatches.map(m => m.id));
    for (const id of prev.keys()) {
      if (!liveIds.has(id)) prev.delete(id);
    }
    // getTeam and t are stable within a render cycle; tracking them would
    // cause spurious re-runs of the goal-celebration effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMatches, finishedMatches]);

  const totalMatches = liveMatches.length + scheduledMatches.length + finishedMatches.length;

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @keyframes goalCelebration {
          0% { opacity: 0; transform: scale(0.85); }
          6% { opacity: 1; transform: scale(1.04); }
          10% { transform: scale(0.98); }
          14% { transform: scale(1.01); }
          18% { opacity: 1; transform: scale(1); }
          85% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.95); }
        }
        @keyframes goalScorePop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes finishCelebration {
          0% { opacity: 0; transform: scale(0.9); }
          8% { opacity: 1; transform: scale(1.03); }
          14% { transform: scale(0.99); }
          18% { opacity: 1; transform: scale(1); }
          85% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.95); }
        }
      `}</style>
      {totalMatches === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>{t('tournament.public.noMatches')}</div>
      )}

      {/* 1. Živé zápasy + právě dohrané (seřazené podle matchIndex) */}
      {combinedLiveSection.length > 0 && (
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--danger)' }}>●</span> {t('tournament.public.nowPlaying')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {combinedLiveSection.map(m => {
                if (recentlyFinished.has(m.id)) {
                  const ht = getTeam(m.homeTeamId);
                  const at = getTeam(m.awayTeamId);
                  return (
                    <div key={`finish-${m.id}`} style={{
                      borderRadius: 14,
                      border: '2px solid #2E7D32',
                      overflow: 'hidden',
                      animation: `finishCelebration ${FINISH_CELEBRATION_DURATION}ms ease-out forwards`,
                    }}>
                      <div style={{
                        background: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 100%)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 8, padding: '18px 16px',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#A5D6A7', letterSpacing: 2, textTransform: 'uppercase' }}>
                          🏁 {t('tournament.public.matchFinished')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%' }}>
                          <span style={{
                            fontWeight: 700, fontSize: 14, color: '#fff',
                            textAlign: 'right', lineHeight: 1.3, wordBreak: 'break-word',
                            flex: 1, minWidth: 0,
                          }}>
                            {ht?.name ?? '?'}
                          </span>
                          <span style={{
                            fontWeight: 900, fontSize: 28, color: '#fff',
                            background: 'rgba(255,255,255,.2)', borderRadius: 12, padding: '4px 16px',
                            fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                          }}>
                            {m.homeScore} : {m.awayScore}
                          </span>
                          <span style={{
                            fontWeight: 700, fontSize: 14, color: '#fff',
                            textAlign: 'left', lineHeight: 1.3, wordBreak: 'break-word',
                            flex: 1, minWidth: 0,
                          }}>
                            {at?.name ?? '?'}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#81C784', letterSpacing: 1 }}>
                          ✓ FULL TIME
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <MatchRow
                    key={m.id} match={m} isLive tournament={tournament} t={t} locale={locale}
                    goalOverlay={activeGoals.get(m.id) ?? null}
                  />
                );
              })}
            </div>
          </div>
      )}

      {/* 2. Plánované zápasy */}
      {scheduledMatches.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('tournament.public.remainingMatches')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {renderPublicMatchesWithStages(scheduledMatches, m => <MatchRow match={m} tournament={tournament} t={t} locale={locale} />)}
          </div>
        </div>
      )}

      {/* 3. Odehrané zápasy */}
      {finishedMatches.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('tournament.public.finishedResults')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {renderPublicMatchesWithStages(finishedMatches, m => <MatchRow match={m} tournament={tournament} t={t} locale={locale} />)}
          </div>
        </div>
      )}
    </div>
  );
}
