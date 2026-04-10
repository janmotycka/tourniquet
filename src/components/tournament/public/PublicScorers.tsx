import { useState } from 'react';
import type { Tournament, Match } from '../../../types/tournament.types';
import { useI18n } from '../../../i18n';
import { PublicTeamBadge } from './PublicTeamBadge';

export function PublicScorers({ tournament }: { tournament: Tournament }) {
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
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
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
                <PublicTeamBadge team={team} size={16} />

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
                        <PublicTeamBadge team={opponentTeam} size={12} />
                        <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {opponentTeam?.name ?? '—'}
                        </span>
                        {statusDone && (
                          <span style={{ fontWeight: 700, color: myScore > oppScore ? 'var(--primary)' : myScore < oppScore ? 'var(--danger)' : 'var(--text-muted)', flexShrink: 0 }}>
                            {myScore}:{oppScore}
                          </span>
                        )}
                        {match.status === 'live' && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>{t('tournament.public.liveLabel')}</span>
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
