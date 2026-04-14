import { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useClubsStore } from '../../store/clubs.store';
import { useI18n } from '../../i18n';
import { computePlayerStats, computeTeamStats } from '../../utils/match-stats';
import { exportSeasonPlayerStatsCSV } from '../../utils/export-csv';
import type { PlayerSeasonStats } from '../../utils/match-stats';
import { PageHeader } from '../../components/ui';
import { radius, fontSize, fontWeight } from '../../theme/tokens';
import { getSeasonIdForDate, getCurrentSeason } from '../../utils/season';

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
  const colors = { W: 'var(--success)', D: 'var(--warning)', L: 'var(--danger)' };
  const bgs = { W: 'var(--success-light)', D: 'var(--warning-light)', L: 'var(--danger-light)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 24, height: 24, borderRadius: '50%', fontWeight: fontWeight.extrabold, fontSize: fontSize.xs,
      color: colors[result], background: bgs[result],
    }}>
      {result}
    </span>
  );
}

// ─── StatTile ───────────────────────────────────────────────────────────────
// Velký stat tile — používá fontSize.xl pro hodnotu, fontSize.xs pro label.
// Použito v týmové bilanci (W/D/L/Goals/Points).

function StatTile({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 2, padding: '6px 4px', minWidth: 0,
    }}>
      <div style={{
        fontWeight: fontWeight.extrabold,
        fontSize: fontSize.xl,
        color: color ?? 'var(--text)',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: fontSize.xs,
        color: 'var(--text-muted)',
        fontWeight: fontWeight.medium,
        textAlign: 'center',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </div>
    </div>
  );
}

// ─── MatchStatsPage ─────────────────────────────────────────────────────────

export function MatchStatsPage({ navigate }: Props) {
  const { t } = useI18n();
  const matches = useMatchesStore(s => s.matches);
  const clubs = useClubsStore(s => s.clubs);
  const [clubFilter, setClubFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // Season filter: null = all seasons; otherwise season id (e.g. "2025-2026").
  // Default to the current season.
  const currentSeasonId = useMemo(() => getCurrentSeason(t).seasonId, [t]);
  const [seasonFilter, setSeasonFilter] = useState<string | null>(currentSeasonId);
  const [sortKey, setSortKey] = useState<SortKey>('goals');

  // Extract unique age categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    matches.forEach(m => { if (m.ageCategory) cats.add(m.ageCategory); });
    return [...cats].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });
  }, [matches]);

  // Extract unique seasons present in matches, sorted by recency (newest first).
  const seasons = useMemo(() => {
    const map = new Map<string, string>();
    matches.forEach(m => {
      const id = getSeasonIdForDate(m.date);
      if (!id) return;
      if (!map.has(id)) {
        const [start, end] = id.split('-');
        map.set(id, t('season.label', { start, end }));
      }
    });
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([id, label]) => ({ id, label }));
  }, [matches, t]);

  // Pre-filter matches by season + category before stats computation
  const filteredMatches = useMemo(() => {
    let result = matches;
    if (seasonFilter) result = result.filter(m => getSeasonIdForDate(m.date) === seasonFilter);
    if (categoryFilter) result = result.filter(m => m.ageCategory === categoryFilter);
    return result;
  }, [matches, seasonFilter, categoryFilter]);

  const teamStats = useMemo(
    () => computeTeamStats(filteredMatches, clubFilter ?? undefined),
    [filteredMatches, clubFilter]
  );

  const playerStats = useMemo(
    () => sortPlayers(computePlayerStats(filteredMatches, clubFilter ?? undefined), sortKey),
    [filteredMatches, clubFilter, sortKey]
  );

  const hasData = teamStats.totalMatches > 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{
        background: 'var(--surface)',
        boxShadow: '0 1px 0 var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <PageHeader
          title={t('matchStats.title')}
          onBack={() => navigate({ name: 'match-list' })}
          action={hasData ? (
            <button
              onClick={() => exportSeasonPlayerStatsCSV(playerStats, t)}
              style={{
                background: 'var(--surface-var)', borderRadius: 10,
                padding: '8px 12px', fontWeight: 600, fontSize: 13,
              }}
            >
              📥 {t('csv.exportPlayerStats')}
            </button>
          ) : undefined}
        />

        {/* Season filter */}
        {seasons.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, padding: '0 20px 12px',
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            <button
              onClick={() => setSeasonFilter(null)}
              style={{
                fontSize: fontSize.sm, fontWeight: !seasonFilter ? fontWeight.bold : fontWeight.medium,
                padding: '5px 11px', borderRadius: radius.sm,
                background: !seasonFilter ? 'var(--primary)' : 'var(--surface)',
                color: !seasonFilter ? '#fff' : 'var(--text-muted)',
                border: !seasonFilter ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                whiteSpace: 'nowrap',
                transition: 'all .15s',
              }}
            >
              {t('season.all')}
            </button>
            {seasons.map(s => (
              <button
                key={s.id}
                onClick={() => setSeasonFilter(s.id)}
                style={{
                  fontSize: fontSize.sm, fontWeight: seasonFilter === s.id ? fontWeight.bold : fontWeight.medium,
                  padding: '5px 11px', borderRadius: radius.sm,
                  background: seasonFilter === s.id ? 'var(--primary)' : 'var(--surface)',
                  color: seasonFilter === s.id ? '#fff' : 'var(--text-muted)',
                  border: seasonFilter === s.id ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                  whiteSpace: 'nowrap',
                  transition: 'all .15s',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Filtr klubu (pokud je vic nez 1) */}
        {clubs.length > 1 && (
          <div style={{ display: 'flex', gap: 6, padding: '0 20px 12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setClubFilter(null)}
              style={{
                fontSize: fontSize.sm, fontWeight: fontWeight.medium, padding: '5px 11px', borderRadius: radius.sm,
                background: !clubFilter ? 'var(--primary)' : 'var(--surface-var)',
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
                  fontSize: fontSize.sm, fontWeight: fontWeight.medium, padding: '5px 11px', borderRadius: radius.sm,
                  background: clubFilter === c.id ? 'var(--primary)' : 'var(--surface-var)',
                  color: clubFilter === c.id ? '#fff' : 'var(--text-muted)',
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Filtr kategorie */}
        {categories.length > 1 && (
          <div style={{
            display: 'flex', gap: 6, padding: '0 20px 12px',
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            <button
              onClick={() => setCategoryFilter(null)}
              style={{
                fontSize: fontSize.sm, fontWeight: !categoryFilter ? fontWeight.bold : fontWeight.medium,
                padding: '5px 11px', borderRadius: radius.sm,
                background: !categoryFilter ? 'var(--primary)' : 'var(--surface)',
                color: !categoryFilter ? '#fff' : 'var(--text-muted)',
                border: !categoryFilter ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                whiteSpace: 'nowrap',
                transition: 'all .15s',
              }}
            >
              {t('match.list.filterCategoryAll')}
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  fontSize: fontSize.sm, fontWeight: categoryFilter === cat ? fontWeight.bold : fontWeight.medium,
                  padding: '5px 11px', borderRadius: radius.sm,
                  background: categoryFilter === cat ? 'var(--primary)' : 'var(--surface)',
                  color: categoryFilter === cat ? '#fff' : 'var(--text-muted)',
                  border: categoryFilter === cat ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                  whiteSpace: 'nowrap',
                  transition: 'all .15s',
                }}
              >
                {cat}
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
            {/* ── Týmová bilance ──────────────────────────────────── */}
            <div style={{
              background: 'var(--surface)',
              borderRadius: radius.xl,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: 'var(--shadow-sm)',
            }}>
              <h2 style={{
                fontWeight: fontWeight.extrabold,
                fontSize: fontSize.lg,
                margin: 0,
              }}>
                {t('matchStats.teamRecord')}
              </h2>

              {/* Big stats grid: Z / V / R / P / Skóre / Body */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                gap: 4,
              }}>
                <StatTile label={t('matchStats.matches')} value={teamStats.totalMatches} />
                <StatTile label={t('matchStats.wins')} value={teamStats.wins} color="var(--success)" />
                <StatTile label={t('matchStats.draws')} value={teamStats.draws} color="var(--warning)" />
                <StatTile label={t('matchStats.losses')} value={teamStats.losses} color="var(--danger)" />
                <StatTile
                  label={t('matchStats.goalsScore')}
                  value={`${teamStats.goalsFor}:${teamStats.goalsAgainst}`}
                />
                <StatTile
                  label={t('matchStats.points')}
                  value={teamStats.wins * 3 + teamStats.draws}
                  color="var(--primary)"
                />
              </div>

              {/* Form (last 5) */}
              {teamStats.form.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  paddingTop: 10,
                  borderTop: '1px solid var(--border)',
                }}>
                  <span style={{
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.bold,
                    color: 'var(--text-muted)',
                  }}>
                    {t('matchStats.form')}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {teamStats.form.map((r, i) => <FormBadge key={i} result={r} />)}
                  </div>
                </div>
              )}

              {/* Clean sheets */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                paddingTop: 10,
                borderTop: '1px solid var(--border)',
              }}>
                <span style={{
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.bold,
                  color: 'var(--text-muted)',
                }}>
                  {t('matchStats.cleanSheets')}
                </span>
                <span style={{
                  fontSize: fontSize.md,
                  fontWeight: fontWeight.extrabold,
                  color: 'var(--text)',
                }}>
                  {teamStats.cleanSheets}
                </span>
              </div>
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
                        background: sortKey === key ? 'var(--primary)' : 'var(--surface-var)',
                        color: sortKey === key ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', borderRadius: 14, background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
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
                        <td style={{ ...tdStyle, fontWeight: p.goals > 0 ? 800 : 400, color: p.goals > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                          {p.goals}
                        </td>
                        <td style={{ ...tdStyle, color: p.assists > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                          {p.assists}
                        </td>
                        <td style={{ ...tdStyle, color: p.yellowCards > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                          {p.yellowCards}
                        </td>
                        <td style={{ ...tdStyle, color: p.redCards + p.yellowRedCards > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
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
                        background: i === 0 ? 'var(--warning-light)' : 'var(--surface-var)',
                        color: i === 0 ? 'var(--warning)' : 'var(--text-muted)',
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
                      <span style={{ fontWeight: 900, fontSize: 18, color: 'var(--success)' }}>
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
