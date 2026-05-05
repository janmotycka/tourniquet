import { useState, useEffect, useMemo, useRef } from 'react';
import type { Page } from '../App';
import type { CatalogEntry } from '../types/tournament.types';
import type { MatchCatalogEntry } from '../types/match.types';
import { subscribeToCatalog } from '../services/catalog.firebase';
import { subscribeToMatchCatalog } from '../services/match.firebase';
import { formatDate } from '../components/match/match-utils';
import type { Sport } from '../types/sport.types';
import { SPORTS, resolveSport } from '../types/sport.types';
import { useI18n } from '../i18n';
import { useAuth } from '../context/AuthContext';

interface Props {
  navigate: (p: Page) => void;
  onLogin: () => void;
}

type Filter = 'all' | 'matches' | 'tournaments';
type CategoryFilter = 'all' | 'youth' | 'adults' | string; // string = konkrétní kategorie (U9, Muži, ...)

const ADULT_CATEGORIES = new Set(['Dorost', 'Muži', 'Muži B', 'Ženy']);
function isYouthCategory(cat: string | undefined): boolean {
  if (!cat) return false;
  return !ADULT_CATEGORIES.has(cat);
}

// ─── Unified feed item ─────────────────────────────────────────────────────

type FeedItem =
  | { kind: 'tournament'; data: CatalogEntry; status: 'live' | 'upcoming' | 'finished' }
  | { kind: 'match'; data: MatchCatalogEntry; status: 'live' | 'upcoming' | 'finished' };

// ─── Component ──────────────────────────────────────────────────────────────

export function LandingPage({ navigate, onLogin }: Props) {
  const { t, locale, setLocale } = useI18n();
  const { user } = useAuth();
  const isLoggedOut = !user;
  const [tournaments, setTournaments] = useState<CatalogEntry[]>([]);
  const [matches, setMatches] = useState<MatchCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [sportFilter, setSportFilter] = useState<Sport | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
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

    // Matches — Audit 2026-04-29 (P0.1 fix): planned match s datem v minulosti
    // (např. 18.04. dnes 29.04.) musí být v "finished/archive", ne "upcoming".
    // Předtím se kontroloval jen status, ne datum → matches z minulých sezón
    // viseli na home jako nadcházející.
    for (const m of matches) {
      const isPastDate = m.date && m.date < todayStr;
      const status = m.status === 'live' ? 'live'
        : (m.status === 'planned' && !isPastDate) ? 'upcoming'
        : (m.status === 'finished' || (m.status === 'planned' && isPastDate)) ? 'finished'
        : null;
      if (status) items.push({ kind: 'match', data: m, status });
    }

    return items;
  }, [tournaments, matches, todayStr]);

  // Apply sport + filter + category + search
  const filtered = useMemo(() => {
    let result = feed;

    // Sport filter — primární rozhodnutí: který sport uživatel sleduje
    if (sportFilter !== 'all') {
      result = result.filter(i => resolveSport(i.data.sport) === sportFilter);
    }

    if (filter === 'matches') result = result.filter(i => i.kind === 'match');
    if (filter === 'tournaments') result = result.filter(i => i.kind === 'tournament');

    // Category filter (applies jen na zápasy; turnaje zůstávají pokud filter není matches)
    if (categoryFilter !== 'all') {
      result = result.filter(i => {
        if (i.kind !== 'match') return filter !== 'matches'; // mimo 'matches' filter turnaje prochází
        const cat = i.data.ageCategory;
        if (categoryFilter === 'youth') return isYouthCategory(cat);
        if (categoryFilter === 'adults') return cat && ADULT_CATEGORIES.has(cat);
        return cat === categoryFilter;
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(i => {
        if (i.kind === 'tournament') return i.data.name.toLowerCase().includes(q);
        return (i.data.clubName + ' ' + i.data.opponent + ' ' + i.data.competition).toLowerCase().includes(q);
      });
    }
    return result;
  }, [feed, filter, sportFilter, categoryFilter, search]);

  // Jaké sporty existují v celém feedu?
  const availableSports = useMemo(() => {
    const set = new Set<Sport>();
    for (const t of tournaments) set.add(resolveSport(t.sport));
    for (const m of matches) set.add(resolveSport(m.sport));
    return Array.from(set);
  }, [tournaments, matches]);
  const showSportChips = availableSports.length >= 2;

  // Jaké kategorie existují v match feedu?
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      if (m.ageCategory) set.add(m.ageCategory);
    }
    return Array.from(set).sort();
  }, [matches]);

  const hasYouthMatches = availableCategories.some(c => isYouthCategory(c));
  const hasAdultMatches = availableCategories.some(c => ADULT_CATEGORIES.has(c));
  const showCategoryChips = filter !== 'tournaments' && availableCategories.length > 0 && (hasYouthMatches || hasAdultMatches);

  const live = filtered.filter(i => i.status === 'live');
  const upcoming = filtered.filter(i => i.status === 'upcoming');

  // Split finished events into "recent" (last 7 days) and "older" (archive)
  const RECENT_DAYS = 7;
  const recentCutoff = useMemo(
    // eslint-disable-next-line react-hooks/purity
    () => new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    [],
  );

  const allFinished = filtered
    .filter(i => i.status === 'finished')
    .sort((a, b) => (b.data.updatedAt ?? '').localeCompare(a.data.updatedAt ?? ''));

  const recent = allFinished.filter(i => {
    const dateStr = i.kind === 'tournament' ? i.data.startDate : i.data.date;
    return dateStr >= recentCutoff;
  });

  const archive = allFinished
    .filter(i => {
      const dateStr = i.kind === 'tournament' ? i.data.startDate : i.data.date;
      return dateStr < recentCutoff;
    })
    .slice(0, 30);

  const [archiveOpen, setArchiveOpen] = useState(false);

  const hasAny = live.length > 0 || upcoming.length > 0 || recent.length > 0 || archive.length > 0;

  const matchCount = feed.filter(i => i.kind === 'match').length;
  const tournamentCount = feed.filter(i => i.kind === 'tournament').length;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
    }}>
      {/* ─── Hero — vyvážené proporce, pro oba (CTA se liší) ─────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1A237E 0%, #283593 50%, #3949AB 100%)',
        color: '#fff',
        padding: '28px 20px 24px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {!isLoggedOut && (
          <button
            onClick={() => navigate({ name: 'home' })}
            aria-label="Zpět"
            style={{
              position: 'absolute', top: 12, left: 12,
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, cursor: 'pointer', color: '#fff',
              backdropFilter: 'blur(8px)',
              zIndex: 2,
            }}
          >←</button>
        )}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background:
            'radial-gradient(circle at 20% 10%, rgba(255,255,255,.12), transparent 45%), ' +
            'radial-gradient(circle at 85% 90%, rgba(121,134,203,.35), transparent 55%)',
        }} />

        <div style={{ position: 'relative', maxWidth: 480, margin: '0 auto' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'rgba(255,255,255,.15)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, marginBottom: 12,
            backdropFilter: 'blur(8px)',
          }}>⚽</div>

          <h1 style={{
            fontSize: 'clamp(20px, 5vw, 26px)', fontWeight: 900,
            margin: 0, lineHeight: 1.2, letterSpacing: '-0.01em',
          }}>
            TORQ
          </h1>
          <p style={{
            fontSize: 'clamp(13px, 3.2vw, 15px)', opacity: 0.9,
            marginTop: 4, marginBottom: 18, lineHeight: 1.4,
          }}>
            {t('landing.hero.subtitle')}
          </p>
          <button
            onClick={() => isLoggedOut ? onLogin() : navigate({ name: 'home' })}
            style={{
              padding: '11px 24px', borderRadius: 12, fontWeight: 800, fontSize: 14,
              background: '#fff', color: '#1A237E', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,.18)',
              minHeight: 42,
            }}
          >
            {isLoggedOut ? t('landing.hero.ctaPrimary') : t('landing.hero.ctaBackToApp')}
          </button>
          <div style={{ fontSize: 10, opacity: 0.55, marginTop: 10 }}>
            🚧 {t('home.betaNotice')}
          </div>
        </div>
      </div>

      {/* ─── Feature highlights — kompaktnější a symetrické ─────────────── */}
      <div style={{
        maxWidth: 780, margin: '0 auto', width: '100%', boxSizing: 'border-box',
        padding: '16px 16px 4px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
        }}>
          {([
            { icon: '🏆', title: t('landing.features.tournaments') },
            { icon: '⚽', title: t('landing.features.matches') },
            { icon: '👥', title: t('landing.features.clubs') },
          ]).map((f) => (
            <div key={f.title} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '12px 8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{f.icon}</div>
              <div style={{
                fontSize: 12, fontWeight: 800, color: 'var(--text)',
              }}>{f.title}</div>
            </div>
          ))}
        </div>
        <div style={{
          textAlign: 'center',
          marginTop: 10,
          fontSize: 11,
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}>
          ⭐ {t('landing.socialProof')}
        </div>
      </div>


      {/* ─── Catalog ──────────────────────────────────────────────────────── */}
      {/* NOTE: outer is plain block (no flex, no overflow). Sticky filter chips
          are bound to the page's scrolling ancestor (window on mobile, <main>
          on desktop). Any `display: flex` / `overflow` here would break that. */}
      <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Filter chips + search — sticky at top when scrolling */}
        {!loading && feed.length > 0 && (
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--bg)',
            padding: '16px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            borderBottom: '1px solid var(--border)',
            backdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(248, 249, 252, 0.92)',
          }}>
            {/* Primární filtr: sport — jen když jsou v datech alespoň 2 sporty */}
            {showSportChips && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setSportFilter('all')}
                  style={{
                    padding: '7px 12px', borderRadius: 12, fontWeight: 700, fontSize: 13,
                    background: sportFilter === 'all' ? 'var(--primary)' : 'var(--surface)',
                    color: sportFilter === 'all' ? '#fff' : 'var(--text-muted)',
                    border: sportFilter === 'all' ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  {t('landing.filterSportAll')}
                </button>
                {SPORTS.filter(s => availableSports.includes(s.id)).map(sp => (
                  <button
                    key={sp.id}
                    onClick={() => setSportFilter(sp.id)}
                    style={{
                      padding: '7px 12px', borderRadius: 12, fontWeight: 700, fontSize: 13,
                      background: sportFilter === sp.id ? 'var(--primary)' : 'var(--surface)',
                      color: sportFilter === sp.id ? '#fff' : 'var(--text-muted)',
                      border: sportFilter === sp.id ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    {sp.icon} {t(sp.labelKey)}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                { key: 'all' as Filter, label: t('landing.filterAll'), count: feed.length },
                { key: 'matches' as Filter, label: `⚽ ${t('landing.filterMatches')}`, count: matchCount },
                { key: 'tournaments' as Filter, label: `🏆 ${t('landing.filterTournaments')}`, count: tournamentCount },
              ]).map(chip => (
                <button
                  key={chip.key}
                  onClick={() => setFilter(chip.key)}
                  style={{
                    padding: '8px 14px', borderRadius: 12, fontWeight: 700, fontSize: 13,
                    background: filter === chip.key ? 'var(--primary)' : 'var(--surface)',
                    color: filter === chip.key ? '#fff' : 'var(--text-muted)',
                    border: filter === chip.key ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer', transition: 'all .15s',
                    boxShadow: filter === chip.key ? '0 2px 8px rgba(26,35,126,.2)' : 'none',
                  }}
                >
                  {chip.label} {chip.count > 0 && <span style={{ opacity: 0.7 }}>({chip.count})</span>}
                </button>
              ))}
            </div>

            {/* Sekundární filtr: kategorie zápasů */}
            {showCategoryChips && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  { key: 'all' as const, label: t('landing.filterCategoryAll') },
                  ...(hasYouthMatches ? [{ key: 'youth' as const, label: `👶 ${t('landing.filterYouth')}` }] : []),
                  ...(hasAdultMatches ? [{ key: 'adults' as const, label: `👤 ${t('landing.filterAdults')}` }] : []),
                  ...availableCategories.map(c => ({ key: c, label: c })),
                ]).map(chip => (
                  <button
                    key={chip.key}
                    onClick={() => setCategoryFilter(chip.key)}
                    style={{
                      padding: '6px 10px', borderRadius: 10, fontWeight: 600, fontSize: 12,
                      background: categoryFilter === chip.key ? 'var(--primary-light, rgba(26,35,126,.12))' : 'transparent',
                      color: categoryFilter === chip.key ? 'var(--primary)' : 'var(--text-muted)',
                      border: categoryFilter === chip.key ? '1px solid var(--primary)' : '1px solid var(--border)',
                      cursor: 'pointer', transition: 'all .15s',
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
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

        <div style={{ padding: '16px 16px 32px' }}>

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

        {/* Archive — collapsible older finished events */}
        {archive.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setArchiveOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '12px 14px', borderRadius: 12,
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'background .15s',
              }}
            >
              <span>🗄 {t('landing.archiveTitle')} ({archive.length})</span>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{archiveOpen ? '▲' : '▼'}</span>
            </button>
            {archiveOpen && (
              <div style={{ marginTop: 10 }}>
                <FeedSection
                  title=""
                  items={archive}
                  navigate={navigate}
                  t={t}
                />
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center', padding: '16px 24px 24px',
        fontSize: 12, color: 'var(--text-muted)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { loc: 'cs' as const, flag: '🇨🇿' },
            { loc: 'en' as const, flag: '🇬🇧' },
            { loc: 'de' as const, flag: '🇩🇪' },
          ]).map(({ loc, flag }) => (
            <button
              key={loc}
              onClick={() => setLocale(loc)}
              aria-label={`Language: ${loc.toUpperCase()}`}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 6px',
                borderRadius: 6,
                fontSize: 20,
                opacity: locale === loc ? 1 : 0.4,
                cursor: 'pointer',
                transition: 'opacity .15s',
              }}
            >
              {flag}
            </button>
          ))}
        </div>
        <span>TORQ · torq.cz</span>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// formatDate je sdílená utility, naimportováno z match-utils (viz import výše).

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
      {title && (
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>
          {title}
        </h2>
      )}
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
            background: 'var(--warning-light)', color: 'var(--warning)', flexShrink: 0,
          }}>{entry.sport === 'tennis' ? '🎾' : '🏆'}</span>
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

  // Detect score changes for flash animation
  const prevScoreRef = useRef({ home: entry.homeScore, away: entry.awayScore });
  const [goalFlash, setGoalFlash] = useState(false);

  useEffect(() => {
    const prev = prevScoreRef.current;
    if (prev.home !== entry.homeScore || prev.away !== entry.awayScore) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGoalFlash(true); // goal flash animation
      const timer = setTimeout(() => setGoalFlash(false), 2000);
      prevScoreRef.current = { home: entry.homeScore, away: entry.awayScore };
      return () => clearTimeout(timer);
    }
  }, [entry.homeScore, entry.awayScore]);

  return (
    <button
      onClick={() => navigate({ name: 'match-public', matchId: entry.id })}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px', borderRadius: 14,
        background: goalFlash ? 'rgba(46,125,50,.08)' : 'var(--surface)',
        border: variant === 'live' ? '1.5px solid #E53935' : '1.5px solid var(--border)',
        cursor: 'pointer', width: '100%', textAlign: 'left',
        boxShadow: goalFlash
          ? '0 0 0 2px rgba(46,125,50,.4), 0 4px 20px rgba(46,125,50,.15)'
          : variant === 'live' ? '0 0 0 1px rgba(229,57,53,.15), 0 2px 12px rgba(229,57,53,.12)' : '0 1px 4px rgba(0,0,0,.05)',
        transition: 'all .3s ease',
        animation: variant === 'live' && !goalFlash ? 'liveCardPulse 2s ease-in-out infinite' : 'none',
      }}
    >
      {/* Score or ball icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: goalFlash ? 'var(--success)' : variant === 'live' ? 'var(--danger)' : 'var(--surface-var)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: variant !== 'upcoming' ? 15 : 20,
        color: goalFlash || variant === 'live' ? '#fff' : 'var(--text)',
        letterSpacing: 1,
        transition: 'all .3s ease',
        transform: goalFlash ? 'scale(1.15)' : 'scale(1)',
      }}>
        {variant === 'upcoming' ? '⚽' : goalFlash ? '⚽' : `${ourScore}:${theirScore}`}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
            background: 'var(--info-light)', color: 'var(--info)', flexShrink: 0,
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
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span>{formatDate(entry.date)}</span>
          <span>{entry.kickoffTime}</span>
          {entry.competition && <span>{entry.competition}</span>}
          {entry.ageCategory && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
              background: 'var(--info-light)', color: 'var(--info)',
              letterSpacing: 0.3,
            }}>
              {entry.ageCategory}
            </span>
          )}
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
      background: 'var(--info-light)', color: 'var(--info)',
      padding: '4px 10px', borderRadius: 8,
      fontSize: 11, fontWeight: 600, flexShrink: 0,
    }}>
      📅
    </span>
  );
}
