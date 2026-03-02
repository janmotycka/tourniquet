import { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useClubsStore } from '../../store/clubs.store';
import { useI18n } from '../../i18n';
import { computePlayerStats, computeTeamStats } from '../../utils/match-stats';
import type { PlayerSeasonStats } from '../../utils/match-stats';

interface Props { navigate: (p: Page) => void; }

type SortKey = 'goals' | 'minutes' | 'rating' | 'cards';

function sortPlayers(stats: PlayerSeasonStats[], key: SortKey): PlayerSeasonStats[] {
  return [...stats].sort((a, b) => {
    switch (key) {
      case 'goals': return (b.goals + b.assists) - (a.goals + a.assists) || b.totalMinutes - a.totalMinutes;
      case 'minutes': return b.totalMinutes - a.totalMinutes || b.matchesPlayed - a.matchesPlayed;
      case 'rating': return b.avgRating - a.avgRating || b.matchesPlayed - a.matchesPlayed;
      case 'cards': return (b.yellowCards + b.redCards + b.yellowRedCards) - (a.yellowCards + a.redCards + a.yellowRedCards);
      default: return 0;
    }
  });
}

// ─── FormBadge ──────────────────────────────────────────────────────────────

function FormBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  const colors = { W: '#2E7D32', D: '#E65100', L: '#C62828' };
  const bgs = { W: '#E8F5E9', D: '#FFF3E0', L: '#FFEBEE' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: 6, fontWeight: 800, fontSize: 11,
      color: colors[result], background: bgs[result],
    }}>
      {result}
    </span>
  );
}

// ─── StatBox ────────────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 12, padding: '10px 14px',
      textAlign: 'center', flex: '1 1 0',
    }}>
      <div style={{ fontWeight: 900, fontSize: 22, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ─── MatchStatsPage ─────────────────────────────────────────────────────────

export function MatchStatsPage({ navigate }: Props) {
  const { t } = useI18n();
  const matches = useMatchesStore(s => s.matches);
  const clubs = useClubsStore(s => s.clubs);
  const [clubFilter, setClubFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('goals');

  const teamStats = useMemo(
    () => computeTeamStats(matches, clubFilter ?? undefined),
    [matches, clubFilter]
  );

  const playerStats = useMemo(
    () => sortPlayers(computePlayerStats(matches, clubFilter ?? undefined), sortKey),
    [matches, clubFilter, sortKey]
  );

  const hasData = teamStats.totalMatches > 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 12px', background: 'var(--surface)',
        boxShadow: '0 1px 0 var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate({ name: 'match-list' })}
            style={{ background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 14 }}
          >
            {t('common.back')}
          </button>
          <h1 style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>{t('matchStats.title')}</h1>
        </div>

        {/* Filtr klubu (pokud je víc než 1) */}
        {clubs.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setClubFilter(null)}
              style={{
                fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 8,
                background: !clubFilter ? '#1565C0' : 'var(--surface-var)',
                color: !clubFilter ? '#fff' : 'var(--text-muted)',
              }}
            >
              {t('matchStats.allClubs')}
            </button>
            {clubs.map(c => (
              <button
                key={c.id}
                onClick={() => setClubFilter(c.id)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 8,
                  background: clubFilter === c.id ? '#1565C0' : 'var(--surface-var)',
                  color: clubFilter === c.id ? '#fff' : 'var(--text-muted)',
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>
        {!hasData ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 16, paddingTop: 60, color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 56 }}>📊</div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>{t('matchStats.noData')}</div>
            <div style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.5 }}>{t('matchStats.noDataDesc')}</div>
          </div>
        ) : (
          <>
            {/* ── Přehled týmu ─────────────────────────────────────── */}
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{t('matchStats.team')}</h2>

              {/* W / D / L + matches */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <StatBox label={t('matchStats.matches')} value={teamStats.totalMatches} />
                <StatBox label={t('matchStats.wins')} value={teamStats.wins} color="#2E7D32" />
                <StatBox label={t('matchStats.draws')} value={teamStats.draws} color="#E65100" />
                <StatBox label={t('matchStats.losses')} value={teamStats.losses} color="#C62828" />
              </div>

              {/* Goals + clean sheets */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <StatBox label={t('matchStats.goalsFor')} value={teamStats.goalsFor} />
                <StatBox label={t('matchStats.goalsAgainst')} value={teamStats.goalsAgainst} />
                <StatBox label={t('matchStats.cleanSheets')} value={teamStats.cleanSheets} />
              </div>

              {/* Form */}
              {teamStats.form.length > 0 && (
                <div style={{
                  background: 'var(--surface)', borderRadius: 12, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {t('matchStats.form')}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {teamStats.form.map((r, i) => <FormBadge key={i} result={r} />)}
                  </div>
                </div>
              )}
            </div>

            {/* ── Tabulka hráčů ──────────────────────────────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontWeight: 800, fontSize: 16 }}>{t('matchStats.players')}</h2>

                {/* Sort tabs */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {([
                    ['goals', t('matchStats.sortByGoals')],
                    ['minutes', t('matchStats.sortByMinutes')],
                    ['rating', t('matchStats.sortByRating')],
                    ['cards', t('matchStats.sortByCards')],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSortKey(key)}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6,
                        background: sortKey === key ? '#1565C0' : 'var(--surface-var)',
                        color: sortKey === key ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', borderRadius: 12, background: 'var(--surface)', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={thStyle}>#</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>{t('matchStats.colPlayer')}</th>
                      <th style={thStyle}>{t('matchStats.colGames')}</th>
                      <th style={thStyle}>{t('matchStats.colGoals')}</th>
                      <th style={thStyle}>{t('matchStats.colAssists')}</th>
                      <th style={thStyle}>{t('matchStats.colYellow')}</th>
                      <th style={thStyle}>{t('matchStats.colRed')}</th>
                      <th style={thStyle}>{t('matchStats.colRating')}</th>
                      <th style={thStyle}>{t('matchStats.colMinutes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((p) => (
                      <tr key={p.playerId} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={tdStyle}>{p.jerseyNumber}</td>
                        <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700 }}>{p.name}</td>
                        <td style={tdStyle}>{p.matchesPlayed}</td>
                        <td style={{ ...tdStyle, fontWeight: p.goals > 0 ? 800 : 400, color: p.goals > 0 ? '#2E7D32' : 'var(--text-muted)' }}>
                          {p.goals}
                        </td>
                        <td style={{ ...tdStyle, color: p.assists > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                          {p.assists}
                        </td>
                        <td style={{ ...tdStyle, color: p.yellowCards > 0 ? '#E65100' : 'var(--text-muted)' }}>
                          {p.yellowCards}
                        </td>
                        <td style={{ ...tdStyle, color: p.redCards + p.yellowRedCards > 0 ? '#C62828' : 'var(--text-muted)' }}>
                          {p.redCards + p.yellowRedCards}
                        </td>
                        <td style={{ ...tdStyle, color: p.avgRating > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                          {p.avgRating > 0 ? p.avgRating.toFixed(1) : '—'}
                        </td>
                        <td style={tdStyle}>{p.totalMinutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Top střelci ────────────────────────────────────── */}
            {playerStats.some(p => p.goals > 0) && (
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{t('matchStats.topScorers')}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {playerStats.filter(p => p.goals > 0).slice(0, 5).map((p, i) => (
                    <div
                      key={p.playerId}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--surface)', borderRadius: 10, padding: '8px 12px',
                      }}
                    >
                      <span style={{
                        width: 26, height: 26, borderRadius: 8,
                        background: i === 0 ? '#FFF8E1' : 'var(--surface-var)',
                        color: i === 0 ? '#F57F17' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 13,
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
                        {p.name}
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>
                          #{p.jerseyNumber}
                        </span>
                      </span>
                      <span style={{ fontWeight: 900, fontSize: 18, color: '#2E7D32' }}>
                        {p.goals}
                      </span>
                      {p.assists > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          +{p.assists}A
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Table styles ───────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '8px 6px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)',
  textAlign: 'center', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap',
};
