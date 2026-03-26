import { useState, useEffect, useMemo } from 'react';
import type { Page } from '../App';
import type { CatalogEntry } from '../types/tournament.types';
import type { MatchCatalogEntry } from '../types/match.types';
import { subscribeToCatalog } from '../services/catalog.firebase';
import { subscribeToMatchCatalog } from '../services/match.firebase';
import { useI18n } from '../i18n';

interface Props {
  navigate: (p: Page) => void;
  onLogin: () => void;
}

type Filter = 'all' | 'matches' | 'tournaments';

// ─── Unified feed item ─────────────────────────────────────────────────────

type FeedItem =
  | { kind: 'tournament'; data: CatalogEntry; status: 'live' | 'upcoming' | 'finished' }
  | { kind: 'match'; data: MatchCatalogEntry; status: 'live' | 'upcoming' | 'finished' };

// ─── Component ──────────────────────────────────────────────────────────────

export function LandingPage({ navigate, onLogin }: Props) {
  const { t } = useI18n();
  const [tournaments, setTournaments] = useState<CatalogEntry[]>([]);
  const [matches, setMatches] = useState<MatchCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let tLoaded = false;
    let mLoaded = false;
    const done = () => { if (tLoaded && mLoaded) setLoading(false); };

    const unsubT = subscribeToCatalog((list) => {
      setTournaments(list);
      tLoaded = true;
      done();
    });
    const unsubM = subscribeToMatchCatalog((list) => {
      setMatches(list);
      mLoaded = true;
      done();
    });
    return () => { unsubT(); unsubM(); };
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  // Build unified feed
  const feed = useMemo(() => {
    const items: FeedItem[] = [];

    // Tournaments
    for (const t of tournaments) {
      const status = t.status === 'active' ? 'live'
        : (t.status === 'draft' && t.startDate >= todayStr) ? 'upcoming'
        : t.status === 'finished' ? 'finished'
        : null;
      if (status) items.push({ kind: 'tournament', data: t, status });
    }

    // Matches
    for (const m of matches) {
      const status = m.status === 'live' ? 'live'
        : m.status === 'planned' ? 'upcoming'
        : m.status === 'finished' ? 'finished'
        : null;
      if (status) items.push({ kind: 'match', data: m, status });
    }

    return items;
  }, [tournaments, matches, todayStr]);

  // Apply filter + search
  const filtered = useMemo(() => {
    let result = feed;
    if (filter === 'matches') result = result.filter(i => i.kind === 'match');
    if (filter === 'tournaments') result = result.filter(i => i.kind === 'tournament');

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(i => {
        if (i.kind === 'tournament') return i.data.name.toLowerCase().includes(q);
        return (i.data.clubName + ' ' + i.data.opponent + ' ' + i.data.competition).toLowerCase().includes(q);
      });
    }
    return result;
  }, [feed, filter, search]);

  const live = filtered.filter(i => i.status === 'live');
  const upcoming = filtered.filter(i => i.status === 'upcoming');
  const recent = filtered
    .filter(i => i.status === 'finished')
    .sort((a, b) => b.data.updatedAt.localeCompare(a.data.updatedAt))
    .slice(0, 10);

  const hasAny = live.length > 0 || upcoming.length > 0 || recent.length > 0;

  const matchCount = feed.filter(i => i.kind === 'match').length;
  const tournamentCount = feed.filter(i => i.kind === 'tournament').length;

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1A237E 0%, #283593 50%, #3949AB 100%)',
        color: '#fff', padding: '40px 24px 32px', textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'rgba(255,255,255,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, margin: '0 auto 16px',
          backdropFilter: 'blur(8px)',
        }}>⚽</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>TORQ</h1>
        <p style={{ fontSize: 15, opacity: 0.9, marginTop: 8, lineHeight: 1.5, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
          {t('landing.hero')}
        </p>
        <p style={{ fontSize: 13, opacity: 0.65, marginTop: 4, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
          {t('landing.heroSub')}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={onLogin}
            style={{
              padding: '12px 28px', borderRadius: 14, fontWeight: 800, fontSize: 15,
              background: '#fff', color: '#1A237E', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,.2)',
            }}
          >
            {t('landing.loginCta')}
          </button>
        </div>

        <span style={{
          fontSize: 11, opacity: 0.5, display: 'inline-block', marginTop: 12,
        }}>
          🚧 {t('home.betaNotice')}
        </span>
      </div>

      {/* ─── Catalog ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '16px 16px 32px', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Filter chips + search */}
        {!loading && feed.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { key: 'all' as Filter, label: t('landing.filterAll'), count: feed.length },
                { key: 'matches' as Filter, label: `⚽ ${t('landing.filterMatches')}`, count: matchCount },
                { key: 'tournaments' as Filter, label: `🏆 ${t('landing.filterTournaments')}`, count: tournamentCount },
              ]).map(chip => (
                <button
                  key={chip.key}
                  onClick={() => setFilter(chip.key)}
                  style={{
                    padding: '6px 12px', borderRadius: 10, fontWeight: 600, fontSize: 12,
                    background: filter === chip.key ? 'var(--primary)' : 'var(--surface)',
                    color: filter === chip.key ? '#fff' : 'var(--text-muted)',
                    border: filter === chip.key ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  {chip.label} {chip.count > 0 && <span style={{ opacity: 0.7 }}>({chip.count})</span>}
                </button>
              ))}
            </div>
            {feed.length > 5 && (
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('landing.searchPlaceholder')}
                style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 13,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
                }}
              />
            )}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚽</div>
            {t('common.loading')}
          </div>
        )}

        {!loading && !hasAny && (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: 'var(--text-muted)', fontSize: 14,
          }}>
            {search ? t('landing.noResults') : t('landing.noTournaments')}
          </div>
        )}

        {/* LIVE */}
        {live.length > 0 && (
          <FeedSection
            title={`🔴 ${t('landing.liveTitle')}`}
            items={live}
            navigate={navigate}
            t={t}
          />
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <FeedSection
            title={`📅 ${t('landing.upcomingTitle')}`}
            items={upcoming}
            navigate={navigate}
            t={t}
          />
        )}

        {/* Recent */}
        {recent.length > 0 && (
          <FeedSection
            title={`🏆 ${t('landing.recentTitle')}`}
            items={recent}
            navigate={navigate}
            t={t}
          />
        )}
      </div>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center', padding: '16px 24px 24px',
        fontSize: 12, color: 'var(--text-muted)',
      }}>
        <span>TORQ · torq.cz</span>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
  } catch {
    return dateStr;
  }
}

// ─── Feed Section ──────────────────────────────────────────────────────────

function FeedSection({
  title, items, navigate, t,
}: {
  title: string;
  items: FeedItem[];
  navigate: (p: Page) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          item.kind === 'tournament'
            ? <TournamentCard key={`t-${item.data.id}`} entry={item.data} navigate={navigate} t={t} variant={item.status} />
            : <MatchCard key={`m-${item.data.id}`} entry={item.data} navigate={navigate} t={t} variant={item.status} />
        ))}
      </div>
    </div>
  );
}

// ─── Tournament Card ─────────────────────────────────────────────────────────

function TournamentCard({
  entry, navigate, t, variant,
}: {
  entry: CatalogEntry;
  navigate: (p: Page) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  variant: 'live' | 'upcoming' | 'finished';
}) {
  const teamCountLabel = (count: number) => {
    if (count === 1) return `${count} ${t('landing.team')}`;
    if (count >= 2 && count <= 4) return `${count} ${t('landing.teamsCount')}`;
    return `${count} ${t('landing.teams')}`;
  };

  const formatKey = `landing.format.${entry.format}` as const;

  return (
    <button
      onClick={() => navigate({ name: 'tournament-public', tournamentId: entry.id })}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px', borderRadius: 14,
        background: 'var(--surface)',
        border: variant === 'live' ? '1.5px solid #E53935' : '1.5px solid var(--border)',
        cursor: 'pointer', width: '100%', textAlign: 'left',
        boxShadow: variant === 'live' ? '0 0 0 1px rgba(229,57,53,.15), 0 2px 12px rgba(229,57,53,.12)' : '0 1px 4px rgba(0,0,0,.05)',
        transition: 'transform .1s, box-shadow .15s',
        animation: variant === 'live' ? 'liveCardPulse 2s ease-in-out infinite' : 'none',
      }}
    >
      {/* Team colors strip */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        flexShrink: 0,
      }}>
        {(entry.teamColors ?? []).slice(0, 6).map((color, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color,
            border: '1px solid rgba(0,0,0,.08)',
          }} />
        ))}
        {entry.teamCount > 6 && (
          <div style={{
            fontSize: 8, color: 'var(--text-muted)', textAlign: 'center',
            lineHeight: 1,
          }}>+{entry.teamCount - 6}</div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
            background: '#FFF3E0', color: '#E65100', flexShrink: 0,
          }}>🏆</span>
          <span style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {entry.name}
          </span>
        </div>
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          <span>{formatDate(entry.startDate)}</span>
          <span>{entry.startTime}</span>
          <span>{teamCountLabel(entry.teamCount)}</span>
          <span>{t(formatKey)}</span>
        </div>
      </div>

      {/* Status badge */}
      <StatusBadge variant={variant} t={t} />
    </button>
  );
}

// ─── Match Card ──────────────────────────────────────────────────────────────

function MatchCard({
  entry, navigate, t, variant,
}: {
  entry: MatchCatalogEntry;
  navigate: (p: Page) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  variant: 'live' | 'upcoming' | 'finished';
}) {
  const ourScore = entry.isHome ? entry.homeScore : entry.awayScore;
  const theirScore = entry.isHome ? entry.awayScore : entry.homeScore;
  const clubLabel = entry.clubName || t('match.detail.us');

  return (
    <button
      onClick={() => navigate({ name: 'match-public', matchId: entry.id })}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px', borderRadius: 14,
        background: 'var(--surface)',
        border: variant === 'live' ? '1.5px solid #E53935' : '1.5px solid var(--border)',
        cursor: 'pointer', width: '100%', textAlign: 'left',
        boxShadow: variant === 'live' ? '0 0 0 1px rgba(229,57,53,.15), 0 2px 12px rgba(229,57,53,.12)' : '0 1px 4px rgba(0,0,0,.05)',
        transition: 'transform .1s, box-shadow .15s',
        animation: variant === 'live' ? 'liveCardPulse 2s ease-in-out infinite' : 'none',
      }}
    >
      {/* Score or ball icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: variant === 'live' ? '#C62828' : 'var(--surface-var)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: variant !== 'upcoming' ? 15 : 20,
        color: variant === 'live' ? '#fff' : 'var(--text)',
        letterSpacing: 1,
      }}>
        {variant === 'upcoming' ? '⚽' : `${ourScore}:${theirScore}`}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
            background: '#E3F2FD', color: '#1565C0', flexShrink: 0,
          }}>⚽</span>
          <span style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {clubLabel} vs {entry.opponent}
          </span>
        </div>
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          <span>{formatDate(entry.date)}</span>
          <span>{entry.kickoffTime}</span>
          {entry.competition && <span>{entry.competition}</span>}
        </div>
      </div>

      {/* Status badge */}
      <StatusBadge variant={variant} t={t} />
    </button>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ variant, t }: { variant: 'live' | 'upcoming' | 'finished'; t: (key: string) => string }) {
  if (variant === 'live') {
    return (
      <span style={{
        background: '#E53935', color: '#fff',
        padding: '4px 10px', borderRadius: 8,
        fontSize: 11, fontWeight: 800, flexShrink: 0,
        animation: 'pulse 2s infinite',
      }}>
        {t('landing.live')}
      </span>
    );
  }
  if (variant === 'finished') {
    return (
      <span style={{
        background: 'var(--surface-var)', color: 'var(--text-muted)',
        padding: '4px 10px', borderRadius: 8,
        fontSize: 11, fontWeight: 600, flexShrink: 0,
      }}>
        ✅
      </span>
    );
  }
  return (
    <span style={{
      background: '#E3F2FD', color: '#1565C0',
      padding: '4px 10px', borderRadius: 8,
      fontSize: 11, fontWeight: 600, flexShrink: 0,
    }}>
      📅
    </span>
  );
}
