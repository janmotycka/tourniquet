import { useState, useMemo } from 'react';
import type { Tournament, Standing, PenaltyResult } from '../../types/tournament.types';
import { DEFAULT_TIEBREAKER_ORDER } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { useTournamentStore } from '../../store/tournament.store';
import { computeStandings } from '../../utils/tournament-schedule';
import { BracketView } from '../../components/BracketView';
import { TeamBadge } from './TeamBadge';
import { StandingsCriteriaBox } from './public/StandingsCriteriaBox';

export function StandingsTab({ tournament, onTeamClick, isOwner }: { tournament: Tournament; onTeamClick?: (teamId: string) => void; isOwner?: boolean }) {
  const { t } = useI18n();
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const [penaltyPair, setPenaltyPair] = useState<{ teamA: string; teamB: string } | null>(null);
  const [penaltyA, setPenaltyA] = useState(0);
  const [penaltyB, setPenaltyB] = useState(0);
  const [penaltySaved, setPenaltySaved] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  const hasLiveMatch = tournament.matches.some(m => m.status === 'live');

  const standings = useMemo(() => computeStandings(
    tournament.matches,
    tournament.teams,
    tournament.settings.tiebreakerOrder,
    tournament.settings.penaltyResults,
    true, // includeLive — admin sees live standings
  ), [tournament.matches, tournament.teams, tournament.settings.tiebreakerOrder, tournament.settings.penaltyResults]);

  // Base standings WITHOUT live matches (for position change calculation)
  const baseStandings = useMemo(() => hasLiveMatch ? computeStandings(
    tournament.matches,
    tournament.teams,
    tournament.settings.tiebreakerOrder,
    tournament.settings.penaltyResults,
    false,
  ) : null, [hasLiveMatch, tournament.matches, tournament.teams, tournament.settings.tiebreakerOrder, tournament.settings.penaltyResults]);

  const basePositionMap = useMemo(() => {
    const map = new Map<string, number>();
    if (baseStandings) {
      baseStandings.forEach((s, i) => map.set(s.teamId, i + 1));
    }
    return map;
  }, [baseStandings]);

  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  const isTeamInLive = (teamId: string) => hasLiveMatch && tournament.matches.some(
    m => m.status === 'live' && (m.homeTeamId === teamId || m.awayTeamId === teamId),
  );

  // Detekce remízujících párů kde penalties je v tiebreaker order
  // Seskupíme týmy dle bodů a vygenerujeme všechny páry uvnitř skupiny
  const tbOrder = tournament.settings.tiebreakerOrder ?? DEFAULT_TIEBREAKER_ORDER;
  const hasPenaltyCriterion = tbOrder.includes('penalties');
  const tiedPairs: Array<{ teamA: string; teamB: string; resolved: boolean }> = [];
  if (hasPenaltyCriterion) {
    const pointGroups = new Map<number, Standing[]>();
    for (const s of standings) {
      if (s.played === 0) continue;
      const arr = pointGroups.get(s.points) ?? [];
      arr.push(s);
      pointGroups.set(s.points, arr);
    }
    for (const group of pointGroups.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          const existing = (tournament.settings.penaltyResults ?? []).find(
            pr => (pr.teamAId === a.teamId && pr.teamBId === b.teamId) ||
                  (pr.teamAId === b.teamId && pr.teamBId === a.teamId),
          );
          tiedPairs.push({ teamA: a.teamId, teamB: b.teamId, resolved: !!existing });
        }
      }
    }
  }

  const openPenaltyModal = (teamA: string, teamB: string) => {
    const existing = (tournament.settings.penaltyResults ?? []).find(
      pr => (pr.teamAId === teamA && pr.teamBId === teamB) ||
            (pr.teamAId === teamB && pr.teamBId === teamA),
    );
    setPenaltyA(existing ? (existing.teamAId === teamA ? existing.teamAScore : existing.teamBScore) : 0);
    setPenaltyB(existing ? (existing.teamAId === teamB ? existing.teamAScore : existing.teamBScore) : 0);
    setPenaltyPair({ teamA, teamB });
    setPenaltySaved(false);
  };

  const handleSavePenalty = async () => {
    if (!penaltyPair) return;
    const currentResults = tournament.settings.penaltyResults ?? [];
    // Odstranit existující záznam pro tento pár
    const filtered = currentResults.filter(
      pr => !((pr.teamAId === penaltyPair.teamA && pr.teamBId === penaltyPair.teamB) ||
              (pr.teamAId === penaltyPair.teamB && pr.teamBId === penaltyPair.teamA)),
    );
    const newResult: PenaltyResult = {
      teamAId: penaltyPair.teamA,
      teamBId: penaltyPair.teamB,
      teamAScore: penaltyA,
      teamBScore: penaltyB,
    };
    await updateTournament(tournament.id, {
      settings: { ...tournament.settings, penaltyResults: [...filtered, newResult] },
    });
    setPenaltySaved(true);
    setTimeout(() => { setPenaltyPair(null); setPenaltySaved(false); }, 1200);
  };

  // Zobrazit všechny týmy i když ještě nehrály
  const allTeamIds = tournament.teams.map(tm => tm.id);
  const standingTeamIds = standings.map(s => s.teamId);
  const displayStandings = [
    ...standings,
    ...allTeamIds
      .filter(id => !standingTeamIds.includes(id))
      .map(teamId => ({ teamId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 })),
  ];

  const format = tournament.settings.format ?? 'round-robin';
  const groups = tournament.settings.groups ?? [];

  // Pro groups-knockout: zobrazit per-group tabulky
  if (format === 'groups-knockout' && groups.length > 0) {
    return (
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map(group => {
          const groupTeams = tournament.teams.filter(tm => group.teamIds.includes(tm.id));
          const groupMatches = tournament.matches.filter(m => m.groupId === group.id);
          const groupStandings = computeStandings(groupMatches, groupTeams, tournament.settings.tiebreakerOrder, tournament.settings.penaltyResults, true);
          const groupBaseStandings = hasLiveMatch
            ? computeStandings(groupMatches, groupTeams, tournament.settings.tiebreakerOrder, tournament.settings.penaltyResults, false)
            : null;
          const groupBaseMap = new Map<string, number>();
          if (groupBaseStandings) {
            groupBaseStandings.forEach((s, i) => groupBaseMap.set(s.teamId, i + 1));
          }

          return (
            <div key={group.id}>
              <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, color: 'var(--primary)' }}>
                {group.name}
              </h3>
              <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 22px 22px 22px 36px 30px', gap: 4, padding: '7px 10px', background: 'var(--surface-var)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                  <span>#</span><span>{t('tournament.teamA').replace(/ A$/, '')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.played')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.won')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.lost')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.goalsFor')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.points')}</span>
                </div>
                {groupStandings.map((s, idx) => {
                  const team = getTeam(s.teamId);
                  const isAdvancing = idx < (tournament.settings.advancePerGroup ?? 1) && s.played > 0;
                  const inLive = isTeamInLive(s.teamId);
                  const gCurrentPos = idx + 1;
                  const gBasePos = groupBaseMap.get(s.teamId);
                  const gRawChange = gBasePos != null ? gBasePos - gCurrentPos : 0;
                  const gPosChange = inLive ? gRawChange : 0;
                  return (
                    <div
                      key={s.teamId}
                      onClick={() => onTeamClick?.(s.teamId)}
                      style={{
                        display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) 26px 26px 26px 38px 32px', gap: 4,
                        padding: '10px 12px', alignItems: 'center',
                        borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                        background: isAdvancing ? 'var(--primary-light)' : inLive ? 'rgba(183,28,28,.04)' : 'transparent',
                        cursor: onTeamClick ? 'pointer' : 'default',
                      }}
                    >
                      <span style={{
                        fontWeight: 700, fontSize: 12, textAlign: 'center',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
                        color: gPosChange > 0 ? '#2E7D32' : gPosChange < 0 ? '#C62828' : isAdvancing ? 'var(--primary)' : 'var(--text-muted)',
                      }}>
                        <span>{gCurrentPos}</span>
                        {gPosChange !== 0 && (
                          <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 800, color: gPosChange > 0 ? '#2E7D32' : '#C62828' }}>
                            {gPosChange > 0 ? '▲' : '▼'}
                          </span>
                        )}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <TeamBadge team={team} size={12} />
                        <span style={{ fontWeight: isAdvancing ? 800 : 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? '?'}</span>
                      </div>
                      <span style={{ textAlign: 'center', fontSize: 13 }}>{s.played}</span>
                      <span style={{ textAlign: 'center', fontSize: 13, color: '#2E7D32', fontWeight: 600 }}>{s.won}</span>
                      <span style={{ textAlign: 'center', fontSize: 13, color: '#C62828', fontWeight: 600 }}>{s.lost}</span>
                      <span style={{ textAlign: 'center', fontSize: 12 }}>{s.goalsFor}:{s.goalsAgainst}</span>
                      <span style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: isAdvancing ? 'var(--primary)' : 'var(--text)' }}>{s.points}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Knockout bracket — vizuální pavoučkový diagram */}
        {tournament.matches.some(m => m.stage && m.stage !== 'group') && (
          <BracketView
            matches={tournament.matches.filter(m => m.stage && m.stage !== 'group')}
            teams={tournament.teams}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 22px 22px 22px 36px 30px', gap: 4, padding: '7px 10px', background: 'var(--surface-var)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
          <span>#</span><span>{t('tournament.teamA').replace(/ A$/, '')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.played')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.won')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.lost')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.goalsFor')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.points')}</span>
        </div>
        {displayStandings.map((s, idx) => {
          const team = getTeam(s.teamId);
          const isFirst = idx === 0 && s.played > 0;
          const inLive = isTeamInLive(s.teamId);
          const currentPos = idx + 1;
          const basePos = basePositionMap.get(s.teamId);
          const rawChange = basePos != null ? basePos - currentPos : 0;
          const posChange = inLive ? rawChange : 0;
          return (
            <div
              key={s.teamId}
              onClick={() => onTeamClick?.(s.teamId)}
              style={{
                display: 'grid', gridTemplateColumns: '22px 1fr 22px 22px 22px 36px 30px', gap: 4,
                padding: '8px 10px', alignItems: 'center',
                borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                background: isFirst ? 'var(--primary-light)' : inLive ? 'rgba(183,28,28,.04)' : 'transparent',
                cursor: onTeamClick ? 'pointer' : 'default',
              }}
            >
              <span style={{
                fontWeight: 700, fontSize: 12, textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
                color: posChange > 0 ? '#2E7D32' : posChange < 0 ? '#C62828' : isFirst ? 'var(--primary)' : 'var(--text-muted)',
              }}>
                <span>{isFirst ? '🥇' : currentPos}</span>
                {posChange !== 0 && (
                  <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 800, color: posChange > 0 ? '#2E7D32' : '#C62828' }}>
                    {posChange > 0 ? '▲' : '▼'}
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <TeamBadge team={team} size={14} />
                <span style={{ fontWeight: isFirst ? 800 : 600, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? '?'}</span>
              </div>
              <span style={{ textAlign: 'center', fontSize: 12 }}>{s.played}</span>
              <span style={{ textAlign: 'center', fontSize: 12, color: '#2E7D32', fontWeight: 600 }}>{s.won}</span>
              <span style={{ textAlign: 'center', fontSize: 12, color: '#C62828', fontWeight: 600 }}>{s.lost}</span>
              <span style={{ textAlign: 'center', fontSize: 11 }}>{s.goalsFor}:{s.goalsAgainst}</span>
              <span style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, color: isFirst ? 'var(--primary)' : 'var(--text)' }}>{s.points}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        {t('tournament.detail.played')} · {t('tournament.detail.won')} · {t('tournament.detail.lost')} · {t('tournament.detail.goalsFor')} · {t('tournament.detail.points')}
      </div>

      {/* Penalty resolution for tied teams */}
      {isOwner && tiedPairs.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
            ⚽ {t('tournament.tiebreaker.penaltyTitle')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tiedPairs.map(pair => {
              const teamA = getTeam(pair.teamA);
              const teamB = getTeam(pair.teamB);
              return (
                <button
                  key={`${pair.teamA}-${pair.teamB}`}
                  onClick={() => openPenaltyModal(pair.teamA, pair.teamB)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                    borderRadius: 10, background: 'var(--surface-var)', textAlign: 'left',
                    border: pair.resolved ? '1.5px solid #2E7D32' : '1.5px solid #FF8F00',
                  }}
                >
                  <TeamBadge team={teamA} size={14} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {teamA?.name} vs {teamB?.name}
                  </span>
                  <TeamBadge team={teamB} size={14} />
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: pair.resolved ? '#E8F5E9' : '#FFF3E0',
                    color: pair.resolved ? '#2E7D32' : '#E65100',
                  }}>
                    {pair.resolved ? '✅' : t('tournament.tiebreaker.resolvePenalty')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Penalty modal */}
      {penaltyPair && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setPenaltyPair(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
            padding: '0 0 32px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
            <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontWeight: 800, fontSize: 18 }}>⚽ {t('tournament.tiebreaker.penaltyTitle')}</h2>
                <button onClick={() => setPenaltyPair(null)} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
              </div>

              {/* Tým A */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <TeamBadge team={getTeam(penaltyPair.teamA)} size={18} />
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{getTeam(penaltyPair.teamA)?.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setPenaltyA(v => Math.max(0, v - 1))} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 18 }}>−</button>
                  <span style={{ fontWeight: 800, fontSize: 22, minWidth: 32, textAlign: 'center', color: 'var(--primary)' }}>{penaltyA}</span>
                  <button onClick={() => setPenaltyA(v => v + 1)} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 18 }}>+</button>
                </div>
              </div>

              {/* Tým B */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <TeamBadge team={getTeam(penaltyPair.teamB)} size={18} />
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{getTeam(penaltyPair.teamB)?.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setPenaltyB(v => Math.max(0, v - 1))} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 18 }}>−</button>
                  <span style={{ fontWeight: 800, fontSize: 22, minWidth: 32, textAlign: 'center', color: 'var(--primary)' }}>{penaltyB}</span>
                  <button onClick={() => setPenaltyB(v => v + 1)} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 18 }}>+</button>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                {t('tournament.tiebreaker.penaltyGoals')}
              </div>

              <button
                onClick={handleSavePenalty}
                disabled={penaltyA === penaltyB}
                style={{
                  background: penaltySaved ? '#2E7D32' : (penaltyA === penaltyB ? 'var(--surface-var)' : 'var(--primary)'),
                  color: penaltyA === penaltyB ? 'var(--text-muted)' : '#fff',
                  fontWeight: 700, fontSize: 15, padding: '14px', borderRadius: 12,
                  transition: 'background .2s', opacity: penaltyA === penaltyB ? 0.5 : 1,
                }}
              >
                {penaltySaved ? `✅ ${t('tournament.tiebreaker.penaltySaved')}` : `💾 ${t('tournament.tiebreaker.resolvePenalty')}`}
              </button>
              {penaltyA === penaltyB && (
                <div style={{ fontSize: 12, color: '#E65100', textAlign: 'center', marginTop: -8 }}>
                  {t('tournament.detail.penaltyMustHaveWinner')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
