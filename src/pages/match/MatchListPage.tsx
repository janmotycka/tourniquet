import { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { FeatureGate } from '../../components/FeatureGate';
import { useI18n } from '../../i18n';
import type { SeasonMatch } from '../../types/match.types';

interface Props { navigate: (p: Page) => void; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function matchResult(m: SeasonMatch, t: (key: string, params?: Record<string, string | number>) => string): { label: string; color: string; bg: string } | null {
  if (m.status !== 'finished') return null;
  if (m.homeScore > m.awayScore) return { label: t('match.result.win'), color: '#2E7D32', bg: '#E8F5E9' };
  if (m.homeScore < m.awayScore) return { label: t('match.result.loss'), color: '#C62828', bg: '#FFEBEE' };
  return { label: t('match.result.draw'), color: '#E65100', bg: '#FFF3E0' };
}

function statusBadge(m: SeasonMatch, t: (key: string, params?: Record<string, string | number>) => string): { label: string; color: string; bg: string } {
  if (m.status === 'live') return { label: t('match.live'), color: '#fff', bg: '#C62828' };
  if (m.status === 'finished') return { label: t('match.played'), color: '#555', bg: '#EEE' };
  return { label: t('match.scheduled'), color: '#1565C0', bg: '#E3F2FD' };
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
        background: 'var(--surface)', borderRadius: 16, padding: '14px 16px',
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
              {match.homeScore} : {match.awayScore}
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

// ─── MatchListPage ─────────────────────────────────────────────────────────────

export function MatchListPage({ navigate }: Props) {
  const { t } = useI18n();
  const matches = useMatchesStore(s => s.matches);
  const deleteMatch = useMatchesStore(s => s.deleteMatch);
  const getLimits = useSubscriptionStore(s => s.getLimits);
  const limits = getLimits();
  const [filter, setFilter] = useState<'all' | 'live' | 'planned' | 'finished'>('all');

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

  const handleDelete = (m: SeasonMatch, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('match.list.deleteConfirm', { opponent: m.opponent }))) {
      deleteMatch(m.id);
    }
  };

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
              background: '#1565C0', color: '#fff', borderRadius: 12,
              padding: '10px 16px', fontWeight: 700, fontSize: 14,
            }}
          >
            {t('match.list.newMatch')}
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
                background: filter === key ? '#1565C0' : 'var(--surface-var)',
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

        {filtered.length === 0 ? (
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
                  background: '#1565C0', color: '#fff', borderRadius: 14,
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
                  position: 'absolute', top: 10, right: 10,
                  width: 28, height: 28, borderRadius: 8,
                  background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
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
