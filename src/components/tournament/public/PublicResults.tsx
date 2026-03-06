import React, { useState, useEffect } from 'react';
import type { Tournament, Match } from '../../../types/tournament.types';
import { computeMatchElapsed, formatMatchTime } from '../../../utils/tournament-schedule';
import { useI18n } from '../../../i18n';
import { PublicTeamBadge } from './PublicTeamBadge';

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
    <span style={{ fontSize: 11, fontWeight: 700, color: isOT ? '#C62828' : '#C62828', letterSpacing: 0.3 }}>
      {m.pausedAt ? '⏸' : (isOT ? `+${mm}:${ss}` : `${mm}:${ss}`)}
    </span>
  );
}

export function PublicResults({ tournament, selectedTeamId }: { tournament: Tournament; selectedTeamId: string | null }) {
  const { t } = useI18n();
  // Filtr: pokud vybrán tým, zobrazit jen zápasy kde tento tým hraje
  const matchFilter = (m: Match) =>
    selectedTeamId === null || m.homeTeamId === selectedTeamId || m.awayTeamId === selectedTeamId;

  // Tři skupiny: živý → plánované → odehrané (nejnovější první)
  const liveMatches = tournament.matches.filter(m => m.status === 'live' && matchFilter(m)).sort((a, b) => a.matchIndex - b.matchIndex);
  const scheduledMatches = tournament.matches.filter(m => m.status === 'scheduled' && matchFilter(m)).sort((a, b) => a.matchIndex - b.matchIndex);
  const finishedMatches = tournament.matches.filter(m => m.status === 'finished' && matchFilter(m)).sort((a, b) => b.matchIndex - a.matchIndex);
  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  function MatchRow({ match, isLive = false }: { match: Match; isLive?: boolean }) {
    const homeT = getTeam(match.homeTeamId);
    const awayT = getTeam(match.awayTeamId);
    // Ukončené zápasy: výchozí stav zavřený, kliknutím se rozbalí
    const [expanded, setExpanded] = useState(false);

    const hasGoals = match.goals.length > 0;
    // Živý zápas vždy zobrazí góly; ukončený jen pokud expanded
    const showGoals = hasGoals && (isLive || expanded);
    const goalsToShow = showGoals ? match.goals : [];

    // Kliknutelný jen ukončený zápas se skóre
    const isClickable = match.status === 'finished';

    // Vizuální styl skóre podle stavu
    const scoreStyle: React.CSSProperties = isLive
      ? { color: '#C62828', fontWeight: 900, fontSize: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }
      : match.status === 'finished'
      ? { background: '#E8F5E9', color: '#2E7D32', borderRadius: 8, padding: '4px 10px', fontWeight: 800, fontSize: 15, minWidth: 50, textAlign: 'center', flexShrink: 0 }
      : { color: 'var(--text-muted)', fontWeight: 600, fontSize: 14, minWidth: 50, textAlign: 'center', flexShrink: 0 };

    // Ikonka stavu vlevo od času
    const statusIcon = isLive
      ? <span style={{ fontSize: 9, color: '#C62828', flexShrink: 0 }}>●</span>
      : match.status === 'finished'
      ? <span style={{ fontSize: 11, color: '#2E7D32', flexShrink: 0 }}>✓</span>
      : <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>·</span>;

    return (
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        border: isLive ? '2px solid #FFCDD2' : match.status === 'finished' ? '1.5px solid #C8E6C9' : '1.5px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,.05)',
        overflow: 'hidden',
      }}>
        {/* Skóre řádek */}
        {isLive ? (
          /* ── LIVE: symetrický layout tým | skóre+timer | tým ── */
          <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Tým domácí — zarovnaný doleva, zalamuje se */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <PublicTeamBadge team={homeT} size={14} />
              <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word' }}>{homeT?.name ?? '?'}</span>
            </div>

            {/* Střed: odpočítávač + skóre — fixní šířka */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 64 }}>
              <LiveRowTimer match={match} />
              <span style={scoreStyle}>{`${match.homeScore} : ${match.awayScore}`}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 5, height: 5, borderRadius: 3, background: '#C62828' }} />
                <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 0.5, color: '#C62828' }}>{t('tournament.public.liveLabel')}</span>
              </div>
            </div>

            {/* Tým hosté — zarovnaný doprava, zalamuje se */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word', textAlign: 'right' }}>{awayT?.name ?? '?'}</span>
              <PublicTeamBadge team={awayT} size={14} />
            </div>
          </div>
        ) : (
          /* ── SCHEDULED / FINISHED: symetrický layout tým | čas+skóre | tým ── */
          <div
            onClick={() => isClickable && setExpanded(e => !e)}
            style={{
              padding: '10px 12px 8px', display: 'flex', alignItems: 'center', gap: 8,
              cursor: isClickable ? 'pointer' : 'default',
            }}
          >
            {/* Tým domácí — zarovnaný doleva, zalamuje se */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <PublicTeamBadge team={homeT} size={13} />
              <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word' }}>{homeT?.name ?? '?'}</span>
            </div>

            {/* Střed: čas (jen plánované) + skóre + chevron */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 60 }}>
              {match.status === 'scheduled' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {statusIcon}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatMatchTime(match.scheduledTime)}</span>
                  </div>
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
              {isClickable && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform .2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  ▾
                </span>
              )}
            </div>

            {/* Tým hosté — zarovnaný doprava, zalamuje se */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word', textAlign: 'right' }}>{awayT?.name ?? '?'}</span>
              <PublicTeamBadge team={awayT} size={13} />
            </div>
          </div>
        )}

        {/* Střelci — levý/pravý layout */}
        {showGoals && (
          <div style={{
            padding: '6px 12px 10px',
            borderTop: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 3,
            background: 'var(--surface-var)',
          }}>
            {goalsToShow.map(goal => {
              const scoringTeam = getTeam(goal.teamId);
              // Vlastní gól: přičítá se soupeři → ukážeme na soupeřově straně
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
                  {/* Domácí */}
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

                  {/* Minuta */}
                  <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {goal.minute}'
                  </div>

                  {/* Hosté */}
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

        {/* "Žádné góly" hint pro ukončené zápasy bez gólů — jen pokud expanded */}
        {isClickable && expanded && !hasGoals && (
          <div style={{ padding: '6px 14px 10px', borderTop: '1px solid var(--border)', background: 'var(--surface-var)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            {t('tournament.public.noGoalsRecorded')}
          </div>
        )}
      </div>
    );
  }

  const totalMatches = liveMatches.length + scheduledMatches.length + finishedMatches.length;

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {totalMatches === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>{t('tournament.public.noMatches')}</div>
      )}

      {/* 1. Živý zápas — vždy nahoře */}
      {liveMatches.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#C62828', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 8, color: '#C62828' }}>●</span> {t('tournament.public.nowPlaying')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {liveMatches.map(m => <MatchRow key={m.id} match={m} isLive />)}
          </div>
        </div>
      )}

      {/* 2. Plánované zápasy */}
      {scheduledMatches.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('tournament.public.remainingMatches')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {scheduledMatches.map(m => <MatchRow key={m.id} match={m} />)}
          </div>
        </div>
      )}

      {/* 3. Odehrané zápasy — nejnovější nahoře */}
      {finishedMatches.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('tournament.public.finishedResults')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {finishedMatches.map(m => <MatchRow key={m.id} match={m} />)}
          </div>
        </div>
      )}
    </div>
  );
}
