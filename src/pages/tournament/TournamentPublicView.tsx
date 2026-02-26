import React, { useState, useEffect, useCallback, Component, type ErrorInfo, type ReactNode } from 'react';
import type { Page } from '../../App';
import { logger } from '../../utils/logger';
import { useTournamentStore } from '../../store/tournament.store';
import {
  computeStandings,
  computeMatchElapsed,
  formatMatchTime,
} from '../../utils/tournament-schedule';
import type { Tournament, Match, Team } from '../../types/tournament.types';
import { subscribeToPublicTournament } from '../../services/tournament.firebase';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';

interface Props {
  tournamentId: string;
  navigate: (p: Page) => void;
  onJoinIntent?: (tournamentId: string) => void;
  joinIntent?: boolean;
  clearJoinIntent?: () => void;
  adminJoin?: boolean;
  clearAdminJoin?: () => void;
}

type Tab = 'standings' | 'results' | 'scorers' | 'rules';

// ─── Error Boundary — zachytí render chyby ────────────────────────────────────
class PublicViewErrorBoundary extends Component<
  { children: ReactNode; tournamentId: string },
  { hasError: boolean; error: string | null }
> {
  constructor(props: { children: ReactNode; tournamentId: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('[PublicView] Render crash:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 20px' }}>
          <div style={{ fontSize: 48 }}>💥</div>
          <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center', color: '#C62828' }}>Chyba zobrazení</h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
            Při zobrazení turnaje došlo k neočekávané chybě.
          </p>
          <pre style={{ fontSize: 11, color: '#C62828', background: '#FFEBEE', padding: '8px 12px', borderRadius: 8, maxWidth: '100%', overflow: 'auto', textAlign: 'left', wordBreak: 'break-word' }}>
            {this.state.error}
          </pre>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 11 }}>ID: {this.props.tournamentId}</p>
          <button onClick={() => window.location.reload()} style={{
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15,
            padding: '12px 24px', borderRadius: 12, marginTop: 8,
          }}>🔄 Obnovit stránku</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Team badge (logo or color dot) ──────────────────────────────────────────
function TeamBadge({ team, size = 12 }: { team: Team | undefined; size?: number }) {
  if (!team) return <div style={{ width: size, height: size, borderRadius: Math.floor(size / 3), background: '#ccc', flexShrink: 0 }} />;
  if (team.logoBase64) {
    return <img src={team.logoBase64} alt={team.name} style={{ width: size, height: size, borderRadius: Math.floor(size / 3), objectFit: 'cover', flexShrink: 0 }} />;
  }
  return <div style={{ width: size, height: size, borderRadius: Math.floor(size / 3), background: team.color ?? '#ccc', flexShrink: 0 }} />;
}

// ─── Team filter bar ─────────────────────────────────────────────────────────
function TeamFilterBar({ tournament, selectedTeamId, onSelect }: {
  tournament: Tournament;
  selectedTeamId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selectedTeam = selectedTeamId ? tournament.teams.find(tm => tm.id === selectedTeamId) : null;

  const handleSelect = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div style={{ padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'relative', zIndex: 10 }}>
      {/* Trigger tlačítko */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
          border: selectedTeam
            ? `2.5px solid ${selectedTeam.color ?? 'var(--primary)'}`
            : '2px dashed var(--primary)',
          background: selectedTeam
            ? `${selectedTeam.color ?? 'var(--primary)'}18`
            : 'var(--primary-light)',
        }}
      >
        {/* Ikona / badge týmu */}
        {selectedTeam ? (
          <TeamBadge team={selectedTeam} size={16} />
        ) : (
          <span style={{ fontSize: 15, lineHeight: 1 }}>⚽</span>
        )}
        <span style={{
          flex: 1, fontWeight: 700, fontSize: 14,
          color: selectedTeam ? 'var(--text)' : 'var(--primary)',
        }}>
          {selectedTeam ? selectedTeam.name : t('tournament.public.selectTeam')}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: selectedTeam ? (selectedTeam.color ?? 'var(--primary)') : 'var(--primary)',
          transition: 'transform .2s', display: 'inline-block',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▾</span>
      </button>

      {/* Custom dropdown panel */}
      {open && (
        <>
          {/* Backdrop pro zavření */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          />
          <div style={{
            position: 'absolute', top: 'calc(100% - 4px)', left: 16, right: 16,
            background: 'var(--surface)', borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,.18)', border: '1px solid var(--border)',
            zIndex: 11, overflow: 'hidden',
          }}>
            {/* "Všechny týmy" položka */}
            <button
              onClick={() => handleSelect(null)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                background: selectedTeamId === null ? 'var(--primary-light)' : 'transparent',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>⚽</span>
              <span style={{
                flex: 1, fontWeight: selectedTeamId === null ? 700 : 600, fontSize: 14,
                color: selectedTeamId === null ? 'var(--primary)' : 'var(--text)',
              }}>{t('tournament.public.filterAll')}</span>
              {selectedTeamId === null && <span style={{ fontSize: 13, color: 'var(--primary)' }}>✓</span>}
            </button>

            {/* Jednotlivé týmy */}
            {tournament.teams.map((team, idx) => {
              const isActive = selectedTeamId === team.id;
              return (
                <button
                  key={team.id}
                  onClick={() => handleSelect(team.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                    background: isActive ? `${team.color ?? 'var(--primary)'}18` : 'transparent',
                    borderBottom: idx < tournament.teams.length - 1 ? '1px solid var(--border)' : 'none',
                    borderLeft: isActive ? `3px solid ${team.color ?? 'var(--primary)'}` : '3px solid transparent',
                  }}
                >
                  <TeamBadge team={team} size={18} />
                  <span style={{
                    flex: 1, fontWeight: isActive ? 700 : 600, fontSize: 14,
                    color: 'var(--text)',
                  }}>{team.name}</span>
                  {isActive && <span style={{ fontSize: 13, color: team.color ?? 'var(--primary)' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Standings (read-only) ────────────────────────────────────────────────────
function PublicStandings({ tournament, selectedTeamId }: { tournament: Tournament; selectedTeamId: string | null }) {
  const { t } = useI18n();
  const standings = computeStandings(tournament.matches, tournament.teams);
  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  if (standings.every(s => s.played === 0)) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🏆</div>
        <p>{t('tournament.public.notStarted')}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 28px 28px 28px 40px 36px', gap: 4, padding: '8px 12px', background: 'var(--surface-var)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
          <span>#</span><span>{t('tournament.public.team')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.played')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.won')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.lost')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.goalsFor')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.points')}</span>
        </div>
        {standings.map((s, idx) => {
          const team = getTeam(s.teamId);
          const isFirst = idx === 0 && s.played > 0;
          const isHighlighted = selectedTeamId === s.teamId;
          const teamColor = team?.color ?? 'var(--primary)';
          return (
            <div key={s.teamId} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 28px 28px 28px 40px 36px', gap: 4,
              padding: '10px 12px', alignItems: 'center',
              borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
              background: isHighlighted ? `${teamColor}18` : isFirst ? 'var(--primary-light)' : 'transparent',
              borderLeft: isHighlighted ? `3px solid ${teamColor}` : '3px solid transparent',
            }}>
              <span style={{ fontWeight: 700, color: isFirst ? 'var(--primary)' : 'var(--text-muted)', fontSize: 13 }}>
                {isFirst ? '🥇' : idx + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TeamBadge team={team} size={14} />
                <span style={{ fontWeight: isHighlighted || isFirst ? 800 : 600, fontSize: 14 }}>{team?.name ?? '?'}</span>
              </div>
              <span style={{ textAlign: 'center', fontSize: 13 }}>{s.played}</span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#2E7D32', fontWeight: 600 }}>{s.won}</span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#C62828', fontWeight: 600 }}>{s.lost}</span>
              <span style={{ textAlign: 'center', fontSize: 12 }}>{s.goalsFor}:{s.goalsAgainst}</span>
              <span style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: isFirst ? 'var(--primary)' : 'var(--text)' }}>{s.points}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
        {t('tournament.public.standingsLegend')}
      </div>
    </div>
  );
}

// ─── Results (read-only) ──────────────────────────────────────────────────────
function PublicResults({ tournament, selectedTeamId }: { tournament: Tournament; selectedTeamId: string | null }) {
  const { t } = useI18n();
  // Filtr: pokud vybrán tým, zobrazit jen zápasy kde tento tým hraje
  const matchFilter = (m: Match) =>
    selectedTeamId === null || m.homeTeamId === selectedTeamId || m.awayTeamId === selectedTeamId;

  // Tři skupiny: živý → plánované → odehrané (nejnovější první)
  const liveMatches = tournament.matches.filter(m => m.status === 'live' && matchFilter(m)).sort((a, b) => a.matchIndex - b.matchIndex);
  const scheduledMatches = tournament.matches.filter(m => m.status === 'scheduled' && matchFilter(m)).sort((a, b) => a.matchIndex - b.matchIndex);
  const finishedMatches = tournament.matches.filter(m => m.status === 'finished' && matchFilter(m)).sort((a, b) => b.matchIndex - a.matchIndex);
  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  // Miniaturní odpočítávač přímo v řádku živého zápasu
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
              <TeamBadge team={homeT} size={14} />
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
              <TeamBadge team={awayT} size={14} />
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
              <TeamBadge team={homeT} size={13} />
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
              <TeamBadge team={awayT} size={13} />
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

// ─── Kritéria pro umístění ────────────────────────────────────────────────────
function StandingsCriteriaBox() {
  const { t } = useI18n();
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
      <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{t('tournament.public.criteriaTitle')}</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
        {t('tournament.public.criteriaDesc')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { n: '1', label: t('tournament.public.criteriaPoints'), desc: t('tournament.public.criteriaPointsDesc') },
          { n: '2', label: t('tournament.public.criteriaH2H'), desc: t('tournament.public.criteriaH2HDesc') },
          { n: '3', label: t('tournament.public.goalDiff'), desc: t('tournament.public.goalDiffDesc') },
          { n: '4', label: t('tournament.public.criteriaGoalsScored'), desc: t('tournament.public.criteriaTotalCount') },
          { n: '5', label: t('tournament.public.alphabet'), desc: t('tournament.public.alphabetDesc') },
        ].map(item => (
          <div key={item.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 10, background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0, marginTop: 1,
            }}>{item.n}</div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{item.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 5 }}>— {item.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tabulka střelců ──────────────────────────────────────────────────────────
function PublicScorers({ tournament }: { tournament: Tournament }) {
  const { t } = useI18n();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Sestavíme tabulku střelců ze všech gólů ve všech zápasech
  const scorerMap = new Map<string, { playerId: string; teamId: string; goals: number; ownGoals: number }>();

  for (const match of tournament.matches) {
    for (const goal of match.goals) {
      if (goal.isOwnGoal) {
        // Vlastní góly evidujeme zvlášť (nepočítají se jako gól hráče)
        const key = `own-${goal.teamId}-${goal.playerId ?? 'unknown'}`;
        const existing = scorerMap.get(key);
        if (existing) {
          existing.ownGoals += 1;
        } else {
          scorerMap.set(key, { playerId: goal.playerId ?? 'unknown', teamId: goal.teamId, goals: 0, ownGoals: 1 });
        }
        continue;
      }
      if (!goal.playerId) continue; // neznámý střelec — přeskočíme
      const key = `${goal.teamId}-${goal.playerId}`;
      const existing = scorerMap.get(key);
      if (existing) {
        existing.goals += 1;
      } else {
        scorerMap.set(key, { playerId: goal.playerId, teamId: goal.teamId, goals: 1, ownGoals: 0 });
      }
    }
  }

  // Seřadíme podle gólů sestupně
  const scorers = Array.from(scorerMap.values())
    .filter(s => s.goals > 0)
    .sort((a, b) => b.goals - a.goals);

  // Celkový počet gólů v turnaji (včetně neznámých)
  const totalGoals = tournament.matches.reduce((sum, m) => sum + m.homeScore + m.awayScore, 0);
  const knownGoals = scorers.reduce((sum, s) => sum + s.goals, 0);
  const unknownGoals = totalGoals - knownGoals;

  // Vrátí zápasy, ve kterých hráč skóroval, s počtem gólů per zápas
  const getMatchBreakdown = (playerId: string, teamId: string) => {
    const breakdown: Array<{ match: Match; goalsInMatch: number }> = [];
    for (const match of tournament.matches) {
      const goalsInMatch = match.goals.filter(
        g => g.playerId === playerId && g.teamId === teamId && !g.isOwnGoal
      ).length;
      if (goalsInMatch > 0) {
        breakdown.push({ match, goalsInMatch });
      }
    }
    return breakdown.sort((a, b) => new Date(a.match.scheduledTime).getTime() - new Date(b.match.scheduledTime).getTime());
  };

  if (scorers.length === 0) {
    return (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🥇</div>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{t('tournament.public.noGoalsYet')}</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>{t('tournament.public.scorersAfterMatches')}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        {/* Hlavička */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🥇</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{t('tournament.public.scorersTable')}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{t('tournament.public.totalGoals', { count: totalGoals })}</span>
        </div>

        {/* Řádky střelců */}
        {scorers.map((scorer, idx) => {
          const key = `${scorer.teamId}-${scorer.playerId}`;
          const team = tournament.teams.find(tm => tm.id === scorer.teamId);
          const player = team?.players.find(p => p.id === scorer.playerId);
          const name = player?.name ?? t('tournament.public.unknownPlayer');
          const jersey = player?.jerseyNumber;

          // Medaile pro top 3
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
          const isFirst = idx === 0;
          const isExpanded = expandedKey === key;
          const matchBreakdown = isExpanded ? getMatchBreakdown(scorer.playerId, scorer.teamId) : [];

          return (
            <div key={key} style={{
              borderBottom: idx < scorers.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {/* Hlavní řádek — kliknutelný */}
              <div
                onClick={() => setExpandedKey(isExpanded ? null : key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 16px',
                  background: isFirst ? 'linear-gradient(90deg, rgba(255,193,7,.08) 0%, transparent 100%)' : 'transparent',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {/* Pořadí */}
                <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                  {medal ? (
                    <span style={{ fontSize: 18 }}>{medal}</span>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{idx + 1}.</span>
                  )}
                </div>

                {/* Tým badge */}
                <TeamBadge team={team} size={16} />

                {/* Jméno + tým */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {name}
                    {jersey != null && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>#{jersey}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {team?.name ?? '—'}
                  </div>
                </div>

                {/* Počet gólů */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: isFirst ? 'rgba(255,193,7,.2)' : 'var(--primary-light)',
                  borderRadius: 10, padding: '4px 10px', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 13 }}>⚽</span>
                  <span style={{ fontWeight: 800, fontSize: 16, color: isFirst ? '#B8860B' : 'var(--primary)' }}>
                    {scorer.goals}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 2 }}>
                  {isExpanded ? '▲' : '▼'}
                </span>
              </div>

              {/* Rozbalený detail zápasů */}
              {isExpanded && (
                <div style={{
                  background: 'var(--bg)',
                  borderTop: '1px solid var(--border)',
                  padding: '8px 16px 10px 56px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  {matchBreakdown.map(({ match, goalsInMatch }) => {
                    const homeTeam = tournament.teams.find(tm => tm.id === match.homeTeamId);
                    const awayTeam = tournament.teams.find(tm => tm.id === match.awayTeamId);
                    const opponentTeam = match.homeTeamId === scorer.teamId ? awayTeam : homeTeam;
                    const isHome = match.homeTeamId === scorer.teamId;
                    const myScore = isHome ? match.homeScore : match.awayScore;
                    const oppScore = isHome ? match.awayScore : match.homeScore;
                    const statusDone = match.status === 'finished';

                    return (
                      <div key={match.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px',
                        background: 'var(--surface)',
                        borderRadius: 10,
                        fontSize: 12,
                      }}>
                        <span style={{ fontSize: 13 }}>⚽</span>
                        <span style={{ fontWeight: 700, color: 'var(--primary)', minWidth: 18 }}>×{goalsInMatch}</span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>vs.</span>
                        <TeamBadge team={opponentTeam} size={12} />
                        <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {opponentTeam?.name ?? '—'}
                        </span>
                        {statusDone && (
                          <span style={{ fontWeight: 700, color: myScore > oppScore ? 'var(--primary)' : myScore < oppScore ? '#C62828' : 'var(--text-muted)', flexShrink: 0 }}>
                            {myScore}:{oppScore}
                          </span>
                        )}
                        {match.status === 'live' && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#C62828', flexShrink: 0 }}>{t('tournament.public.liveLabel')}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Neznámí střelci */}
        {unknownGoals > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
              + {t('tournament.public.noGoals', { count: unknownGoals })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Propozice (read-only) ────────────────────────────────────────────────────
function PublicRules({ tournament }: { tournament: Tournament }) {
  const { t } = useI18n();
  const { settings } = tournament;
  const rules = settings.rules;

  // Výpočet délky turnaje — čas prvního a posledního zápasu
  const sortedMatches = [...tournament.matches].sort((a, b) =>
    new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
  );
  const firstMatch = sortedMatches[0];
  const lastMatch = sortedMatches[sortedMatches.length - 1];
  const endTime = lastMatch
    ? new Date(new Date(lastMatch.scheduledTime).getTime() + lastMatch.durationMinutes * 60 * 1000)
    : null;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

  const totalGoals = tournament.matches.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  const playedMatches = tournament.matches.filter(m => m.status === 'finished').length;
  const totalMatches = tournament.matches.length;
  const rounds = tournament.matches.length > 0
    ? Math.max(...tournament.matches.map(m => m.roundIndex)) + 1
    : 0;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Základní info o turnaji ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{t('tournament.public.tournamentInfo')}</span>
        </div>
        {[
          {
            icon: '📅',
            label: t('tournament.public.date'),
            value: new Date(settings.startDate).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          },
          firstMatch && {
            icon: '🕐',
            label: t('tournament.public.time'),
            value: `${formatTime(firstMatch.scheduledTime)}${endTime ? ` – ${endTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}` : ''}`,
          },
          {
            icon: '👥',
            label: t('tournament.public.teamsCount'),
            value: t('tournament.public.teamsValue', { count: tournament.teams.length }),
          },
          (settings.numberOfPitches ?? 1) > 1 && {
            icon: '🟩',
            label: t('tournament.public.pitches'),
            value: t('tournament.public.pitchesValue', { count: settings.numberOfPitches ?? 1 }),
          },
          rounds > 0 && {
            icon: '🔄',
            label: t('tournament.public.rounds'),
            value: t('tournament.public.roundsValue', { count: rounds }),
          },
          {
            icon: '⚽',
            label: t('tournament.public.matchesCount'),
            value: playedMatches > 0
              ? t('tournament.public.matchesPlayed', { played: playedMatches, total: totalMatches })
              : t('tournament.public.matchesTotal', { count: totalMatches }),
          },
          totalGoals > 0 && {
            icon: '🥅',
            label: t('tournament.public.goalsCount'),
            value: t('tournament.public.goalsValue', { count: totalGoals }),
          },
        ].filter(Boolean).map((item: any, idx, arr) => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '11px 16px',
            borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0, minWidth: 90 }}>{item.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* ── Formát zápasů ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>⏱</span>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{t('tournament.public.matchFormat')}</span>
        </div>
        {[
          { label: t('tournament.public.matchDuration'), value: `${settings.matchDurationMinutes} ${t('common.minutes')}` },
          { label: t('tournament.public.breakDuration'), value: settings.breakBetweenMatchesMinutes === 0 ? t('tournament.public.noBreak') : `${settings.breakBetweenMatchesMinutes} ${t('common.minutes')}` },
          { label: t('tournament.public.pointsForWin'), value: t('tournament.public.pointsWinValue') },
          { label: t('tournament.public.pointsForDraw'), value: t('tournament.public.pointsDrawValue') },
          { label: t('tournament.public.pointsForLoss'), value: t('tournament.public.pointsLossValue') },
        ].map((row, idx, arr) => (
          <div key={row.label} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px',
            borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>{row.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* ── Pravidla pořadatele (jen pokud vyplněna) ── */}
      {rules && rules.trim() !== '' && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: '16px',
          boxShadow: '0 1px 4px rgba(0,0,0,.05)',
        }}>
          <h2 style={{ fontWeight: 800, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📋</span> {t('tournament.public.rulesAndRegulations')}
          </h2>
          <pre style={{
            fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7,
            color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            margin: 0,
          }}>
            {rules}
          </pre>
        </div>
      )}

      {/* ── Kritéria pro umístění ── */}
      <StandingsCriteriaBox />
    </div>
  );
}

// ─── Live banner timer — countdown ────────────────────────────────────────────
function LiveBannerTimer({ match }: { match: Match }) {
  const [elapsed, setElapsed] = useState(() =>
    computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed)
  );

  useEffect(() => {
    if (match.pausedAt) return; // zastaven — žádný interval
    const interval = setInterval(() => {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [match.startedAt, match.pausedAt, match.pausedElapsed]);

  const totalSec = match.durationMinutes * 60;
  const remaining = totalSec - elapsed;
  const isOvertime = remaining < 0;
  const displaySec = isOvertime ? Math.abs(remaining) : remaining;
  const mm = Math.floor(displaySec / 60).toString().padStart(2, '0');
  const ss = (displaySec % 60).toString().padStart(2, '0');
  const timeStr = isOvertime ? `+${mm}:${ss}` : `${mm}:${ss}`;

  return (
    <span style={{
      fontWeight: 700, fontSize: 12,
      color: isOvertime ? '#FFCDD2' : '#fff',
      background: isOvertime ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
      padding: '2px 7px', borderRadius: 6, marginLeft: 4,
    }}>
      {match.pausedAt ? '⏸' : '⏱'} {timeStr}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function TournamentPublicView(props: Props) {
  return (
    <PublicViewErrorBoundary tournamentId={props.tournamentId}>
      <TournamentPublicViewInner {...props} />
    </PublicViewErrorBoundary>
  );
}

function TournamentPublicViewInner({ tournamentId, navigate, onJoinIntent, joinIntent, clearJoinIntent, adminJoin, clearAdminJoin }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('results');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  // Firebase real-time listener — zobrazuje živá data bez přihlášení
  const localTournament = useTournamentStore(s => s.getTournamentById(tournamentId));
  const [firebaseTournament, setFirebaseTournament] = useState<Tournament | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(true);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  useEffect(() => {
    setFirebaseLoading(true);
    setFirebaseError(null);
    logger.debug('[PublicView] Subscribing to tournament:', tournamentId);
    const unsubscribe = subscribeToPublicTournament(
      tournamentId,
      (data) => {
        logger.debug('[PublicView] Data received:', data ? 'tournament loaded' : 'null (not found)');
        if (data) {
          logger.debug('[PublicView] Teams:', data.teams?.length, 'Matches:', data.matches?.length);
        }
        setFirebaseTournament(data);
        setFirebaseLoading(false);
        setLastRefresh(new Date());
      },
      (error) => {
        console.error('[PublicView] Firebase error:', error.message);
        setFirebaseError(error.message);
        setFirebaseLoading(false);
      }
    );
    return unsubscribe;
  }, [tournamentId]);

  // Preferujeme Firebase data, fallback na lokální (pro případ offline)
  const tournament = firebaseTournament ?? localTournament;

  // ── Join as referee flow ────────────────────────────────────────────────────
  const { user } = useAuth();
  const joinTournament = useTournamentStore(s => s.joinTournament);
  const leaveTournament = useTournamentStore(s => s.leaveTournament);
  const isOwner = useTournamentStore(s => s.isOwner);
  const hasJoined = useTournamentStore(s => s.joinedTournaments.some(jt => jt.id === tournamentId));
  const isTournamentOwner = user ? isOwner(tournamentId) : false;
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinPin, setJoinPin] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Auto-open PIN modal when returning from login with intent, or when ?join=1 in URL
  useEffect(() => {
    if (user && joinIntent) {
      setShowJoinModal(true);
    }
  }, [user, joinIntent]);

  useEffect(() => {
    if (adminJoin && !isTournamentOwner && !hasJoined) {
      if (user) {
        // Přihlášený → rovnou zobrazit PIN modal
        setShowJoinModal(true);
      } else {
        // Nepřihlášený → uložit intent a přesměrovat na login
        onJoinIntent?.(tournamentId);
        navigate({ name: 'home' });
      }
      // Vyčistit ?join=1 z URL aby se nezobrazoval při refreshi
      const url = new URL(window.location.href);
      if (url.searchParams.has('join')) {
        url.searchParams.delete('join');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
      clearAdminJoin?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminJoin]);

  const handleLeave = async () => {
    await leaveTournament(tournamentId);
    setShowLeaveConfirm(false);
  };

  const handleJoinSubmit = async () => {
    if (!/^\d{6}$/.test(joinPin)) {
      setJoinError(t('tournament.public.joinPinError'));
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const result = await joinTournament(tournamentId, joinPin);
      if (result.success) {
        clearJoinIntent?.();
        navigate({ name: 'tournament-detail', tournamentId });
      } else {
        setJoinError(result.error ?? t('tournament.public.joinFailed'));
      }
    } catch {
      setJoinError(t('tournament.public.joinFailed'));
    } finally {
      setJoining(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setLastRefresh(new Date());
  }, []);

  const timeSince = Math.round((Date.now() - lastRefresh.getTime()) / 1000);
  const timeSinceLabel = timeSince < 10
    ? t('tournament.public.justNow')
    : timeSince < 60
    ? t('tournament.public.secondsAgo', { count: timeSince })
    : t('tournament.public.minutesAgo', { count: Math.round(timeSince / 60) });

  if (firebaseLoading && !tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>⏳</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('tournament.public.loading')}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14 }}>{t('tournament.public.connecting')}</p>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 11, marginTop: 8 }}>ID: {tournamentId}</p>
      </div>
    );
  }

  if (firebaseError && !tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center', color: '#C62828' }}>{t('tournament.public.connectionError')}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          Nepodařilo se načíst turnaj z databáze.
        </p>
        <pre style={{ fontSize: 11, color: '#C62828', background: '#FFEBEE', padding: '8px 12px', borderRadius: 8, maxWidth: '100%', overflow: 'auto', textAlign: 'left' }}>
          {firebaseError}
        </pre>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 11 }}>ID: {tournamentId}</p>
        <button onClick={() => navigate({ name: 'home' })} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15,
          padding: '12px 24px', borderRadius: 12, marginTop: 8,
        }}>{t('tournament.public.backHome')}</button>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('tournament.public.notFound')}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          {t('tournament.public.notFoundDesc')}
        </p>
        <button onClick={() => navigate({ name: 'home' })} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15,
          padding: '12px 24px', borderRadius: 12,
        }}>{t('tournament.public.backHome')}</button>
      </div>
    );
  }

  const liveMatch = tournament.matches.find(m => m.status === 'live');
  const TABS: { id: Tab; label: string }[] = [
    { id: 'results', label: t('tournament.public.results') },
    { id: 'standings', label: t('tournament.public.standings') },
    { id: 'scorers', label: t('tournament.public.scorers') },
    { id: 'rules', label: t('tournament.public.rules') },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🏆 {tournament.name}
            </h1>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {new Date(tournament.settings.startDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })} · {t('tournament.public.teamsValue', { count: tournament.teams.length })}
            </div>
          </div>
          {/* Tlačítko pro připojení/odpojení rozhodčího — nenápadné, v pravém rohu */}
          {isTournamentOwner ? (
            /* Vlastník — tlačítko pro přechod do admin detailu */
            <button
              onClick={() => navigate({ name: 'tournament-detail', tournamentId })}
              title={t('tournament.public.openAdmin')}
              style={{
                flexShrink: 0, height: 32, borderRadius: 8, padding: '0 10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                background: 'var(--primary)', border: 'none', color: '#fff',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1,
              }}
            >
              ⚙️ Admin
            </button>
          ) : hasJoined ? (
            /* Připojený rozhodčí — volba otevřít admin nebo opustit */
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => navigate({ name: 'tournament-detail', tournamentId })}
                title={t('tournament.public.openAdmin')}
                style={{
                  height: 32, borderRadius: 8, padding: '0 10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: 'var(--primary)', border: 'none', color: '#fff',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1,
                }}
              >
                ⚙️ Admin
              </button>
              <button
                onClick={() => setShowLeaveConfirm(true)}
                title={t('tournament.public.leaveTitle')}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#FFEBEE', border: '1.5px solid #FFCDD2',
                  cursor: 'pointer', fontSize: 16, lineHeight: 1,
                }}
              >
                🚪
              </button>
            </div>
          ) : null /* Nepřipojený divák — žádné admin tlačítko, join jen přes ?join=1 odkaz */}
        </div>

        {/* Live banner s timerem */}
        {liveMatch && (() => {
          const homeTeam = tournament.teams.find(tm => tm.id === liveMatch.homeTeamId);
          const awayTeam = tournament.teams.find(tm => tm.id === liveMatch.awayTeamId);
          return (
            <div style={{
              background: 'linear-gradient(90deg, #B71C1C, #C62828)', color: '#fff',
              padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              {/* Pulzující tečka */}
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#fff', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0 }}>
                {t('tournament.public.liveLabel')}: {homeTeam?.name ?? '?'} {liveMatch.homeScore}:{liveMatch.awayScore} {awayTeam?.name ?? '?'}
              </span>
              {/* Timer */}
              <LiveBannerTimer match={liveMatch} />
            </div>
          );
        })()}

        {/* Tab bar */}
        <div style={{ display: 'flex', padding: '0 8px' }}>
          {TABS.map(tabItem => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)} style={{
              flex: 1, padding: '10px 4px', fontWeight: 600, fontSize: 12,
              color: tab === tabItem.id ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === tabItem.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              whiteSpace: 'nowrap',
            }}>{tabItem.label}</button>
          ))}
        </div>
      </div>

      {/* Team filter bar — jen na záložce Výsledky */}
      {tab === 'results' && tournament.teams.length > 1 && (
        <TeamFilterBar
          tournament={tournament}
          selectedTeamId={selectedTeamId}
          onSelect={setSelectedTeamId}
        />
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'standings' && <PublicStandings tournament={tournament} selectedTeamId={null} />}
        {tab === 'results' && <PublicResults tournament={tournament} selectedTeamId={selectedTeamId} />}
        {tab === 'scorers' && <PublicScorers tournament={tournament} />}
        {tab === 'rules' && <PublicRules tournament={tournament} />}
      </div>

      {/* Refresh footer */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
          {t('tournament.public.lastUpdate')}: {timeSinceLabel}
        </span>
        <button onClick={handleRefresh} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
          padding: '8px 16px', borderRadius: 10,
        }}>
          {t('tournament.public.refresh')}
        </button>
      </div>

      {/* ── PIN Modal ── */}
      {showJoinModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 20, padding: '28px 24px',
            width: '100%', maxWidth: 360,
            boxShadow: '0 12px 40px rgba(0,0,0,.25)',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {/* Title */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
              <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
                {t('tournament.public.joinTitle')}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                {t('tournament.public.joinDesc')}
              </p>
            </div>

            {/* PIN input */}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              value={joinPin}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setJoinPin(val);
                setJoinError('');
              }}
              onKeyDown={e => { if (e.key === 'Enter' && joinPin.length === 6) handleJoinSubmit(); }}
              placeholder="000000"
              style={{
                width: '100%', textAlign: 'center',
                fontSize: 28, fontWeight: 800, letterSpacing: 12,
                padding: '14px 12px', borderRadius: 14,
                border: joinError ? '2px solid #C62828' : '2px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)',
                outline: 'none', caretColor: 'var(--primary)',
                transition: 'border-color .2s',
                boxSizing: 'border-box',
              }}
              onFocus={e => { if (!joinError) e.target.style.borderColor = 'var(--primary)'; }}
              onBlur={e => { if (!joinError) e.target.style.borderColor = 'var(--border)'; }}
            />

            {/* Error message */}
            {joinError && (
              <p style={{
                fontSize: 13, color: '#C62828', fontWeight: 600,
                textAlign: 'center', margin: 0,
                background: '#FFEBEE', padding: '8px 12px', borderRadius: 10,
              }}>
                {joinError}
              </p>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowJoinModal(false); setJoinPin(''); setJoinError(''); clearJoinIntent?.(); }}
                style={{
                  flex: 1, padding: '13px 12px', borderRadius: 12,
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  background: 'var(--bg)', color: 'var(--text-muted)',
                  border: '1.5px solid var(--border)',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleJoinSubmit}
                disabled={joining || joinPin.length !== 6}
                style={{
                  flex: 1, padding: '13px 12px', borderRadius: 12,
                  fontWeight: 700, fontSize: 15, cursor: joining ? 'wait' : 'pointer',
                  background: joinPin.length === 6 ? 'var(--primary)' : 'var(--border)',
                  color: joinPin.length === 6 ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  opacity: joining ? 0.7 : 1,
                  transition: 'background .2s, opacity .2s',
                }}
              >
                {joining ? t('tournament.public.joining') : t('tournament.public.joinConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave confirm modal ── */}
      {showLeaveConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 20, padding: '28px 24px',
            width: '100%', maxWidth: 340,
            boxShadow: '0 12px 40px rgba(0,0,0,.25)',
            display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center',
          }}>
            <div style={{ fontSize: 36 }}>🚪</div>
            <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
              {t('tournament.public.leaveTitle')}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {t('tournament.public.leaveDesc')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                style={{
                  flex: 1, padding: '13px 12px', borderRadius: 12,
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  background: 'var(--bg)', color: 'var(--text-muted)',
                  border: '1.5px solid var(--border)',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleLeave}
                style={{
                  flex: 1, padding: '13px 12px', borderRadius: 12,
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  background: '#C62828', color: '#fff', border: 'none',
                }}
              >
                {t('tournament.public.leaveConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
