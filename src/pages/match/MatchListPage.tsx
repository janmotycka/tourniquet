import { useState, useMemo, useEffect } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { useConfirmStore } from '../../store/confirm.store';
import { FeatureGate } from '../../components/FeatureGate';
import { useI18n } from '../../i18n';
import { useToastStore } from '../../store/toast.store';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { DesktopPage, FilterPill, desktopPrimaryButtonStyle, desktopSecondaryButtonStyle } from '../../components/desktop/DesktopPage';
import type { SeasonMatch } from '../../types/match.types';

interface Props { navigate: (p: Page) => void; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function matchResult(m: SeasonMatch, t: (key: string, params?: Record<string, string | number>) => string): { label: string; color: string; bg: string } | null {
  if (m.status !== 'finished') return null;
  const ourScore = m.isHome ? m.homeScore : m.awayScore;
  const theirScore = m.isHome ? m.awayScore : m.homeScore;
  if (ourScore > theirScore) return { label: t('match.result.win'), color: '#2E7D32', bg: '#E8F5E9' };
  if (ourScore < theirScore) return { label: t('match.result.loss'), color: '#C62828', bg: '#FFEBEE' };
  return { label: t('match.result.draw'), color: '#E65100', bg: '#FFF3E0' };
}

function statusBadge(m: SeasonMatch, t: (key: string, params?: Record<string, string | number>) => string): { label: string; color: string; bg: string } {
  if (m.status === 'live') return { label: t('match.live'), color: '#fff', bg: '#C62828' };
  if (m.status === 'finished') return { label: t('match.played'), color: '#555', bg: '#EEE' };
  return { label: t('match.scheduled'), color: 'var(--primary)', bg: 'var(--primary-light)' };
}

// ─── MatchCard ─────────────────────────────────────────────────────────────────

function MatchCard({ match, onClick, t }: { match: SeasonMatch; onClick: () => void; t: (key: string, params?: Record<string, string | number>) => string }) {
  const result = matchResult(match, t);
  const badge = statusBadge(match, t);
  const isLive = match.status === 'live';

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
        boxShadow: isLive ? '0 0 0 2px #C62828' : '0 1px 4px rgba(0,0,0,.07)',
        display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left',
        width: '100%', transition: 'transform .1s',
      }}
    >
      {/* Top row: date + competition + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {formatDate(match.date)} {match.kickoffTime}
          </span>
          {match.competition && (
            <span style={{
              fontSize: 11, background: 'var(--surface-var)', color: 'var(--text-muted)',
              padding: '2px 8px', borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap',
              maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {match.competition}
            </span>
          )}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
          color: badge.color, background: badge.bg, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {badge.label}
        </span>
      </div>

      {/* Middle: opponent + home/away + score */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {match.opponent}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {match.isHome ? t('match.home') : t('match.away')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {match.status !== 'planned' && (
            <div style={{
              background: isLive ? '#C62828' : 'var(--surface-var)',
              borderRadius: 12, padding: '8px 14px',
              fontWeight: 900, fontSize: 20, color: isLive ? '#fff' : 'var(--text)',
              letterSpacing: 1,
            }}>
              {match.isHome ? match.homeScore : match.awayScore} : {match.isHome ? match.awayScore : match.homeScore}
            </div>
          )}
          {result && (
            <div style={{
              width: 32, height: 32, borderRadius: 10, background: result.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 15, color: result.color,
            }}>
              {result.label}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: lineup count */}
      {match.lineup.length > 0 && (
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>{t('match.list.starters', { count: match.lineup.filter(l => l.isStarter).length })}</span>
          <span>{t('match.list.subs', { count: match.lineup.filter(l => !l.isStarter).length })}</span>
          {match.substitutions.length > 0 && <span>{t('match.list.substitutions', { count: match.substitutions.length })}</span>}
        </div>
      )}
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MatchListSkeleton() {
  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ height: 14, width: '40%', background: 'var(--surface-var)', borderRadius: 8, animation: 'skeletonPulse 1.5s infinite' }} />
            <div style={{ height: 14, width: 50, background: 'var(--surface-var)', borderRadius: 8, animation: 'skeletonPulse 1.5s infinite' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ height: 20, width: '50%', background: 'var(--surface-var)', borderRadius: 8, animation: 'skeletonPulse 1.5s infinite' }} />
            <div style={{ height: 36, width: 70, background: 'var(--surface-var)', borderRadius: 12, animation: 'skeletonPulse 1.5s infinite' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Desktop table view ──────────────────────────────────────────────────────

function MatchesTable({ matches, t, onRowClick, onDelete }: {
  matches: SeasonMatch[];
  t: (key: string, params?: Record<string, string | number>) => string;
  onRowClick: (m: SeasonMatch) => void;
  onDelete: (m: SeasonMatch, e: React.MouseEvent) => void;
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 14,
      }}>
        <thead>
          <tr style={{
            background: 'var(--surface-var)',
            color: 'var(--text-muted)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            <th style={thStyle}>{t('table.date')}</th>
            <th style={thStyle}>{t('table.opponent')}</th>
            <th style={thStyle}>{t('table.competition')}</th>
            <th style={thStyle}>{t('table.venue')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('table.score')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('table.status')}</th>
            <th style={{ ...thStyle, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => {
            const result = matchResult(m, t);
            const badge = statusBadge(m, t);
            const isLive = m.status === 'live';
            const our = m.isHome ? m.homeScore : m.awayScore;
            const their = m.isHome ? m.awayScore : m.homeScore;
            return (
              <tr
                key={m.id}
                onClick={() => onRowClick(m)}
                style={{
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isLive ? 'rgba(198, 40, 40, 0.04)' : 'transparent',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = isLive ? 'rgba(198, 40, 40, 0.08)' : 'var(--surface-var)')}
                onMouseLeave={e => (e.currentTarget.style.background = isLive ? 'rgba(198, 40, 40, 0.04)' : 'transparent')}
              >
                <td style={tdStyle}>
                  <div style={{ fontWeight: 700, color: 'var(--text)' }}>{formatDate(m.date)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{m.kickoffTime}</div>
                </td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 700, color: 'var(--text)' }}>{m.opponent}</div>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: 'var(--text-muted)' }}>{m.competition || '—'}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {m.isHome ? t('match.home') : t('match.away')}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {m.status === 'planned' ? (
                    <span style={{ color: 'var(--text-disabled)' }}>—</span>
                  ) : (
                    <span style={{
                      fontWeight: 900, fontSize: 16, color: 'var(--text)',
                      background: isLive ? '#C62828' : 'var(--surface-var)',
                      padding: '4px 12px', borderRadius: 8, letterSpacing: 0.5,
                      display: 'inline-block', minWidth: 56,
                      ...(isLive ? { color: '#fff' } : {}),
                    }}>
                      {our}:{their}
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                    color: badge.color, background: badge.bg, whiteSpace: 'nowrap',
                  }}>
                    {badge.label}
                  </span>
                  {result && (
                    <span style={{
                      marginLeft: 6,
                      display: 'inline-block', padding: '4px 8px', borderRadius: 8,
                      background: result.bg, color: result.color, fontWeight: 800, fontSize: 11,
                    }}>
                      {result.label}
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button
                    onClick={(e) => onDelete(m, e)}
                    title={t('common.delete')}
                    style={{
                      background: 'transparent', border: 'none',
                      width: 30, height: 30, borderRadius: 8,
                      cursor: 'pointer', color: 'var(--text-muted)',
                      fontSize: 16, opacity: 0.5,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--surface-var)'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '14px 18px',
  textAlign: 'left',
  fontWeight: 700,
};

const tdStyle: React.CSSProperties = {
  padding: '14px 18px',
  verticalAlign: 'middle',
};

function DesktopTableSkeleton() {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden', padding: 8,
    }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          height: 56, background: 'var(--surface-var)', borderRadius: 8,
          marginBottom: 4, animation: 'skeletonPulse 1.5s infinite',
        }} />
      ))}
    </div>
  );
}

function DesktopEmptyState({ icon, title, description, action }: {
  icon: string; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px dashed var(--border)',
      borderRadius: 14, padding: '64px 24px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 56 }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 460, lineHeight: 1.5 }}>
        {description}
      </div>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

// ─── MatchListPage ─────────────────────────────────────────────────────────────

export function MatchListPage({ navigate }: Props) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();
  const matches = useMatchesStore(s => s.matches);
  const deleteMatch = useMatchesStore(s => s.deleteMatch);
  const getLimits = useSubscriptionStore(s => s.getLimits);
  const limits = getLimits();
  const [filter, setFilter] = useState<'all' | 'live' | 'planned' | 'finished'>('all');
  const [isHydrating, setIsHydrating] = useState(matches.length === 0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (matches.length > 0) { setIsHydrating(false); return; } // hydration state
    const timer = setTimeout(() => setIsHydrating(false), 800);
    return () => clearTimeout(timer);
  }, [matches.length]);

  // Sort: live → planned (newest) → finished (newest)
  // useMemo: přepočítá se jen při změně matches
  const sorted = useMemo(() => {
    const order: Record<string, number> = { live: 0, planned: 1, finished: 2 };
    return [...matches].sort((a, b) => {
      const oa = order[a.status] ?? 99;
      const ob = order[b.status] ?? 99;
      if (oa !== ob) return oa - ob;
      return b.date.localeCompare(a.date);
    });
  }, [matches]);

  const filtered = useMemo(
    () => filter === 'all' ? sorted : sorted.filter(m => m.status === filter),
    [sorted, filter]
  );

  const ask = useConfirmStore(s => s.ask);

  const handleDelete = async (m: SeasonMatch, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await ask({ title: t('common.delete'), message: t('match.list.deleteConfirm', { opponent: m.opponent }), destructive: true });
    if (ok) {
      deleteMatch(m.id);
      useToastStore.getState().show('success', t('toast.matchDeleted'));
    }
  };

  // ─── DESKTOP VARIANT ──────────────────────────────────────────────────────
  if (isDesktop) {
    const filterCounts = {
      all:      sorted.length,
      live:     sorted.filter(m => m.status === 'live').length,
      planned:  sorted.filter(m => m.status === 'planned').length,
      finished: sorted.filter(m => m.status === 'finished').length,
    };

    return (
      <DesktopPage
        title={t('match.list.title')}
        subtitle={t('match.list.matchesLabel')}
        secondaryActions={
          <button
            onClick={() => navigate({ name: 'match-stats' })}
            style={desktopSecondaryButtonStyle}
            title={t('matchStats.title')}
          >
            <span>📊</span> {t('matchStats.title')}
          </button>
        }
        primaryAction={
          <button
            onClick={() => navigate({ name: 'match-create' })}
            style={desktopPrimaryButtonStyle}
            disabled={matches.length >= limits.maxMatches}
          >
            <span style={{ fontSize: 16 }}>+</span> {t('match.list.newMatch')}
          </button>
        }
        filters={
          <>
            <FilterPill active={filter === 'all'}      onClick={() => setFilter('all')}      count={filterCounts.all}>{t('match.list.filterAll')}</FilterPill>
            <FilterPill active={filter === 'live'}     onClick={() => setFilter('live')}     count={filterCounts.live}>{t('match.list.filterLive')}</FilterPill>
            <FilterPill active={filter === 'planned'}  onClick={() => setFilter('planned')}  count={filterCounts.planned}>{t('match.list.filterPlanned')}</FilterPill>
            <FilterPill active={filter === 'finished'} onClick={() => setFilter('finished')} count={filterCounts.finished}>{t('match.list.filterFinished')}</FilterPill>
          </>
        }
      >
        {matches.length >= limits.maxMatches && (
          <div style={{ marginBottom: 16 }}>
            <FeatureGate
              currentCount={matches.length}
              maxAllowed={limits.maxMatches}
              featureLabel={t('match.list.matchesLabel')}
              onUpgrade={() => navigate({ name: 'settings' })}
            >
              <></>
            </FeatureGate>
          </div>
        )}

        {isHydrating ? (
          <DesktopTableSkeleton />
        ) : filtered.length === 0 ? (
          <DesktopEmptyState
            icon="📋"
            title={t('match.list.empty')}
            description={filter === 'all' ? t('match.list.emptyDesc') : t('match.list.emptyFilter')}
            action={filter === 'all' ? (
              <button
                onClick={() => navigate({ name: 'match-create' })}
                style={desktopPrimaryButtonStyle}
              >
                {t('match.list.addFirst')}
              </button>
            ) : null}
          />
        ) : (
          <MatchesTable
            matches={filtered}
            t={t}
            onRowClick={(m) => navigate({ name: 'match-detail', matchId: m.id })}
            onDelete={(m, e) => handleDelete(m, e)}
          />
        )}
      </DesktopPage>
    );
  }

  // ─── MOBILE VARIANT ───────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 12px', background: 'var(--surface)',
        boxShadow: '0 1px 0 var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button
            onClick={() => navigate({ name: 'home' })}
            style={{ background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 14 }}
          >
            {t('common.back')}
          </button>
          <h1 style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>{t('match.list.title')}</h1>
          <button
            onClick={() => navigate({ name: 'match-stats' })}
            style={{
              background: 'var(--surface-var)', borderRadius: 10,
              padding: '8px 12px', fontWeight: 700, fontSize: 16,
            }}
            title={t('matchStats.title')}
          >
            📊
          </button>
          <button
            onClick={() => navigate({ name: 'match-create' })}
            style={{
              background: 'var(--primary)', color: '#fff', borderRadius: 12,
              padding: '10px 16px', fontWeight: 700, fontSize: 14,
            }}
          >
            + {t('match.list.newMatch')}
          </button>
        </div>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([['all', t('match.list.filterAll')], ['live', t('match.list.filterLive')], ['planned', t('match.list.filterPlanned')], ['finished', t('match.list.filterFinished')]] as [string, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key as 'all' | 'live' | 'planned' | 'finished')}
              style={{
                fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 8,
                background: filter === key ? 'var(--primary)' : 'var(--surface-var)',
                color: filter === key ? '#fff' : 'var(--text-muted)',
                flexShrink: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 80 }}>
        {/* FeatureGate pro vytváření nových zápasů */}
        {matches.length >= limits.maxMatches && (
          <FeatureGate
            currentCount={matches.length}
            maxAllowed={limits.maxMatches}
            featureLabel={t('match.list.matchesLabel')}
            onUpgrade={() => navigate({ name: 'settings' })}
          >
            <></>
          </FeatureGate>
        )}

        {isHydrating ? (
          <MatchListSkeleton />
        ) : filtered.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 16, paddingTop: 60, color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 56 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>{t('match.list.empty')}</div>
            <div style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.5 }}>
              {filter === 'all'
                ? t('match.list.emptyDesc')
                : t('match.list.emptyFilter')}
            </div>
            {filter === 'all' && (
              <button
                onClick={() => navigate({ name: 'match-create' })}
                style={{
                  background: 'var(--primary)', color: '#fff', borderRadius: 12,
                  padding: '12px 24px', fontWeight: 700, fontSize: 16, marginTop: 8,
                }}
              >
                {t('match.list.addFirst')}
              </button>
            )}
          </div>
        ) : (
          filtered.map(match => (
            <div key={match.id} style={{ position: 'relative' }}>
              <MatchCard
                match={match}
                t={t}
                onClick={() => navigate({ name: 'match-detail', matchId: match.id })}
              />
              <button
                onClick={(e) => handleDelete(match, e)}
                style={{
                  position: 'absolute', bottom: 10, right: 10,
                  width: 28, height: 28, borderRadius: 8,
                  background: 'var(--surface-var)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0.6,
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
