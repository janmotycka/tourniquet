import { useState, useMemo, useEffect } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { useConfirmStore } from '../../store/confirm.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { useClubsStore } from '../../store/clubs.store';
import { FeatureGate } from '../../components/FeatureGate';
import { useI18n } from '../../i18n';
import { useToastStore } from '../../store/toast.store';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { DesktopPage, FilterPill, desktopPrimaryButtonStyle, desktopSecondaryButtonStyle } from '../../components/desktop/DesktopPage';
import { PageHeader } from '../../components/ui';
import type { SeasonMatch } from '../../types/match.types';
import { radius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { groupMatchesBySeasonHalf } from '../../utils/season';
import { formatDate } from '../../components/match/match-utils';

interface Props { navigate: (p: Page) => void; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchResult(m: SeasonMatch, t: (key: string, params?: Record<string, string | number>) => string): { label: string; color: string; bg: string } | null {
  if (m.status !== 'finished') return null;
  const ourScore = m.isHome ? m.homeScore : m.awayScore;
  const theirScore = m.isHome ? m.awayScore : m.homeScore;
  if (ourScore > theirScore) return { label: t('match.result.win'), color: 'var(--success)', bg: 'var(--success-light)' };
  if (ourScore < theirScore) return { label: t('match.result.loss'), color: 'var(--danger)', bg: 'var(--danger-light)' };
  return { label: t('match.result.draw'), color: 'var(--warning)', bg: 'var(--warning-light)' };
}

function statusBadge(m: SeasonMatch, t: (key: string, params?: Record<string, string | number>) => string): { label: string; color: string; bg: string } {
  if (m.status === 'live') return { label: t('match.live'), color: '#fff', bg: 'var(--danger)' };
  if (m.status === 'finished') return { label: t('match.played'), color: 'var(--text-muted)', bg: 'var(--surface-var)' };
  return { label: t('match.scheduled'), color: 'var(--primary)', bg: 'var(--primary-light)' };
}

// ─── MatchCard ─────────────────────────────────────────────────────────────────

function MatchCard({ match, onClick, t }: { match: SeasonMatch; onClick: () => void; t: (key: string, params?: Record<string, string | number>) => string }) {
  const result = matchResult(match, t);
  const badge = statusBadge(match, t);
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';

  const leftBorderColor = isLive ? 'var(--danger)' : isFinished ? 'var(--success)' : 'transparent';

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        borderRadius: radius.xl,
        padding: `${spacing.md}px ${spacing.lg}px`,
        boxShadow: isLive
          ? '0 0 12px rgba(198, 40, 40, 0.18), 0 1px 4px rgba(0,0,0,.07)'
          : '0 1px 4px rgba(0,0,0,.07)',
        borderLeft: `3.5px solid ${leftBorderColor}`,
        display: 'flex', flexDirection: 'column', gap: spacing.sm + 2, textAlign: 'left',
        width: '100%', transition: 'transform .1s',
      }}
    >
      {/* Top row: date + time | category badge | status badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: fontSize.sm, color: 'var(--text-muted)', fontWeight: fontWeight.medium, whiteSpace: 'nowrap' }}>
            {formatDate(match.date)} {match.kickoffTime}
          </span>
          {match.ageCategory && (
            <span style={{
              fontSize: fontSize.xs, background: 'var(--primary-light)', color: 'var(--primary)',
              padding: '2px 7px', borderRadius: radius.sm, fontWeight: fontWeight.bold, whiteSpace: 'nowrap',
            }}>
              {match.ageCategory}
            </span>
          )}
          {match.squad && (
            <span style={{
              fontSize: fontSize.xs, background: 'var(--surface-var)', color: 'var(--text)',
              padding: '2px 7px', borderRadius: radius.sm, fontWeight: fontWeight.bold, whiteSpace: 'nowrap',
            }}>
              {match.squad}
            </span>
          )}
        </div>
        <span style={{
          fontSize: fontSize.xs, fontWeight: fontWeight.bold, padding: '3px 8px', borderRadius: radius.sm,
          color: badge.color, background: badge.bg, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {badge.label}
        </span>
      </div>

      {/* Middle: club name (left) | score (center) | opponent (right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontWeight: fontWeight.extrabold, fontSize: 17, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {match.opponent}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: spacing.xs + 2,
            fontSize: fontSize.sm, color: 'var(--text-muted)', marginTop: 2,
          }}>
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: match.isHome ? 'var(--primary)' : 'var(--text-muted)',
              flexShrink: 0,
            }} />
            <span>{match.isHome ? t('match.home') : t('match.away')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0 }}>
          {match.status !== 'planned' && (
            <div style={{
              background: isLive ? 'var(--danger)' : 'var(--surface-var)',
              borderRadius: radius.lg, padding: '8px 14px',
              fontWeight: 900, fontSize: fontSize.xl, color: isLive ? '#fff' : 'var(--text)',
              letterSpacing: 1.5, fontVariantNumeric: 'tabular-nums',
            }}>
              {match.isHome ? match.homeScore : match.awayScore}
              <span style={{ margin: '0 2px', opacity: 0.5 }}>:</span>
              {match.isHome ? match.awayScore : match.homeScore}
            </div>
          )}
          {result && (
            <div style={{
              width: 30, height: 30, borderRadius: radius.md, background: result.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: fontSize.base, color: result.color,
            }}>
              {result.label}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: competition + lineup info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        {match.competition && (
          <span style={{
            fontSize: fontSize.xs, color: 'var(--text-muted)', fontWeight: fontWeight.medium,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 160,
          }}>
            {match.competition}
          </span>
        )}
        {match.lineup.length > 0 && match.status === 'planned' ? (
          (() => {
            const confirmed = match.lineup.filter(l => l.attendance === 'confirmed').length;
            const absent = match.lineup.filter(l => l.attendance === 'absent').length;
            const tentative = match.lineup.length - confirmed - absent;
            return (
              <div style={{ display: 'flex', gap: spacing.sm, fontSize: fontSize.xs, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                <span>{t('match.attendance.summary')}: ✅ {confirmed} · ❔ {tentative} · ❌ {absent}</span>
              </div>
            );
          })()
        ) : match.lineup.length > 0 && (
          <div style={{ display: 'flex', gap: spacing.sm, fontSize: fontSize.xs, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            <span>{t('match.list.starters', { count: match.lineup.filter(l => l.isStarter).length })}</span>
            <span>{t('match.list.subs', { count: match.lineup.filter(l => !l.isStarter).length })}</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MatchListSkeleton() {
  return (
    <div style={{ padding: `${spacing.xl}px ${spacing.lg}px`, display: 'flex', flexDirection: 'column', gap: spacing.sm + 2 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ background: 'var(--surface)', borderRadius: radius.xl, padding: `${spacing.md}px ${spacing.lg}px`, display: 'flex', flexDirection: 'column', gap: spacing.sm + 2, borderLeft: '3.5px solid var(--surface-var)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ height: 14, width: '40%', background: 'var(--surface-var)', borderRadius: radius.sm, animation: 'skeletonPulse 1.5s infinite' }} />
            <div style={{ height: 14, width: 50, background: 'var(--surface-var)', borderRadius: radius.sm, animation: 'skeletonPulse 1.5s infinite' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ height: 20, width: '50%', background: 'var(--surface-var)', borderRadius: radius.sm, animation: 'skeletonPulse 1.5s infinite' }} />
            <div style={{ height: 36, width: 70, background: 'var(--surface-var)', borderRadius: radius.lg, animation: 'skeletonPulse 1.5s infinite' }} />
          </div>
          <div style={{ height: 12, width: '30%', background: 'var(--surface-var)', borderRadius: radius.sm, animation: 'skeletonPulse 1.5s infinite' }} />
        </div>
      ))}
    </div>
  );
}

// ─── Desktop table view ──────────────────────────────────────────────────────

function MatchesTable({ sections, t, onRowClick, onDelete }: {
  sections: Array<{ key: string; label: string; matches: SeasonMatch[] }>;
  t: (key: string, params?: Record<string, string | number>) => string;
  onRowClick: (m: SeasonMatch) => void;
  onDelete: (m: SeasonMatch, e: React.MouseEvent) => void;
}) {
  const totalCols = 7;
  const showHeaders = sections.length > 1;
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
        {sections.map((section, sIdx) => (
          <tbody key={section.key}>
            {showHeaders && (
              <SeasonHeaderRow label={section.label} count={section.matches.length} colSpan={totalCols} />
            )}
            {section.matches.map((m, i) => {
              const isFirstRow = !showHeaders && sIdx === 0 && i === 0;
              return renderMatchRow(m, isFirstRow ? 0 : 1, t, onRowClick, onDelete);
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function renderMatchRow(
  m: SeasonMatch,
  borderTopIndex: number,
  t: (key: string, params?: Record<string, string | number>) => string,
  onRowClick: (m: SeasonMatch) => void,
  onDelete: (m: SeasonMatch, e: React.MouseEvent) => void,
) {
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
        borderTop: borderTopIndex === 0 ? 'none' : '1px solid var(--border)',
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
            background: isLive ? 'var(--danger)' : 'var(--surface-var)',
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

// ─── SeasonHeader ─────────────────────────────────────────────────────────────

function SeasonHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: spacing.sm,
      padding: `${spacing.sm}px ${spacing.xs}px ${spacing.xs}px`,
      marginTop: spacing.xs,
    }}>
      <span style={{
        fontSize: fontSize.sm, fontWeight: fontWeight.extrabold,
        color: 'var(--text)', letterSpacing: 0.2,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: fontSize.xs, fontWeight: fontWeight.bold,
        background: 'var(--surface-var)', color: 'var(--text-muted)',
        padding: '2px 8px', borderRadius: radius.sm,
      }}>
        {count}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

function SeasonHeaderRow({ label, count, colSpan }: { label: string; count: number; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{
        background: 'var(--surface-var)',
        padding: '10px 18px',
        fontWeight: fontWeight.extrabold,
        fontSize: fontSize.sm,
        color: 'var(--text)',
        letterSpacing: 0.2,
      }}>
        <span>{label}</span>
        <span style={{
          marginLeft: spacing.sm,
          fontSize: fontSize.xs, fontWeight: fontWeight.bold,
          background: 'var(--surface)', color: 'var(--text-muted)',
          padding: '2px 8px', borderRadius: radius.sm,
        }}>
          {count}
        </span>
      </td>
    </tr>
  );
}

// ─── CategoryChip ─────────────────────────────────────────────────────────────

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? 'var(--primary)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text-muted)',
        border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
        borderRadius: radius.lg,
        padding: `${spacing.xs}px ${spacing.sm + 2}px`,
        fontSize: fontSize.xs,
        fontWeight: active ? fontWeight.bold : fontWeight.medium,
        cursor: 'pointer',
        transition: 'all .15s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ─── MatchListPage ─────────────────────────────────────────────────────────────

export function MatchListPage({ navigate }: Props) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();
  const allMatches = useMatchesStore(s => s.matches);
  const deleteMatch = useMatchesStore(s => s.deleteMatch);
  const createMatch = useMatchesStore(s => s.createMatch);
  const startMatch = useMatchesStore(s => s.startMatch);
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const clubs = useClubsStore(s => s.clubs);

  // ── Rychlý zápas ─────────────────────────────────────────────────────────
  // Pro casual / přátelák / plácek — trenér nechce dělat setup (lineup, čas,
  // soutěž). Jen zadá soupeře a hraje se. Lineup, kategorie apod. se dají doplnit
  // později (edit), pokud chce zápas uchovat v historii.
  const handleQuickMatch = () => {
    if (preferredSport === 'tennis') {
      navigate({ name: 'match-create' });
      return;
    }
    const opponent = window.prompt(t('match.list.quickMatchPrompt'), '');
    if (opponent === null) return; // user cancelled
    const activeClub = clubs.find(c => c.id === activeClubId);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    // Reasonable defaults pro U11 youth football
    const match = createMatch({
      sport: 'football',
      matchType: 'single',
      clubId: activeClub?.id ?? 'individual-quick',
      clubName: activeClub?.name,
      opponent: (opponent || '').trim() || t('match.list.quickMatchDefaultOpponent'),
      isHome: true,
      date: today,
      kickoffTime: timeStr,
      competition: '',
      durationMinutes: 60,
      periods: 2,
      periodDurationMinutes: 30,
      matchFormat: '7+1',
      lineup: [],
      trackAssists: false,
    });
    startMatch(match.id);
    navigate({ name: 'match-detail', matchId: match.id });
  };

  // Ukaž jen zápasy vybraného sportu a vybraného klubu (legacy = football).
  // Výjimka: zápasy se scope 'individual-*' (rychlé zápasy / tenisové individuální)
  // nepatří žádnému klubu a musí být viditelné bez ohledu na aktivní klub.
  const matches = useMemo(() => {
    return allMatches.filter(m => {
      const mSport = m.sport ?? 'football';
      if (mSport !== preferredSport) return false;
      if (activeClubId && m.clubId && !m.clubId.startsWith('individual-') && m.clubId !== activeClubId) return false;
      return true;
    });
  }, [allMatches, preferredSport, activeClubId]);

  const getLimits = useSubscriptionStore(s => s.getLimits);
  const limits = getLimits();
  const [filter, setFilter] = useState<'all' | 'live' | 'planned' | 'finished'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
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

  // Extract unique age categories from matches
  const categories = useMemo(() => {
    const cats = new Set<string>();
    matches.forEach(m => { if (m.ageCategory) cats.add(m.ageCategory); });
    // Natural sort: U6 < U7 < ... < U19
    return [...cats].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });
  }, [matches]);

  const filtered = useMemo(() => {
    let result = sorted;
    if (filter !== 'all') result = result.filter(m => m.status === filter);
    if (categoryFilter !== 'all') result = result.filter(m => m.ageCategory === categoryFilter);
    return result;
  }, [sorted, filter, categoryFilter]);

  // Group filtered matches by season half (Podzim 2025, Jaro 2026, ...)
  // for section-header rendering. Within each group, original order
  // (status → date desc) is preserved.
  const seasonSections = useMemo(
    () => groupMatchesBySeasonHalf(filtered, t),
    [filtered, t]
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

        {/* Category filter chips */}
        {categories.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs + 2, marginBottom: spacing.md }}>
            <CategoryChip
              label={t('match.list.filterCategoryAll')}
              active={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
            />
            {categories.map(cat => (
              <CategoryChip
                key={cat}
                label={cat}
                active={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
              />
            ))}
          </div>
        )}

        {isHydrating ? (
          <DesktopTableSkeleton />
        ) : matches.length === 0 ? (
          <DesktopEmptyState
            icon="⚽"
            title={t('match.list.noMatchesYet')}
            description={t('match.list.noMatchesYetDesc')}
            action={
              <button
                onClick={() => navigate({ name: 'match-create' })}
                style={desktopPrimaryButtonStyle}
              >
                {t('match.list.createFirst')}
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <DesktopEmptyState
            icon="📋"
            title={categoryFilter !== 'all' ? t('match.list.noMatchesForCategory') : t('match.list.empty')}
            description={categoryFilter !== 'all' ? t('match.list.noMatchesForCategoryDesc') : (filter === 'all' ? t('match.list.emptyDesc') : t('match.list.emptyFilter'))}
            action={filter === 'all' && categoryFilter === 'all' ? (
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
            sections={seasonSections}
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
        background: 'var(--surface)',
        boxShadow: '0 1px 0 var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <PageHeader
          title={t('match.list.title')}
          onBack={() => navigate({ name: 'home' })}
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
              {preferredSport === 'football' && (
                <button
                  onClick={handleQuickMatch}
                  disabled={matches.length >= limits.maxMatches}
                  style={{
                    background: 'var(--surface-var)', color: 'var(--text)', borderRadius: 12,
                    padding: '10px 12px', fontWeight: 700, fontSize: 13,
                    border: '1.5px solid var(--border)',
                    opacity: matches.length >= limits.maxMatches ? 0.5 : 1,
                    cursor: matches.length >= limits.maxMatches ? 'not-allowed' : 'pointer',
                  }}
                  title={t('match.list.quickMatchHint')}
                >
                  ⚡ {t('match.list.quickMatch')}
                </button>
              )}
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
          }
        />
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 12px' }}>
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

        {/* Category filter chips */}
        {categories.length > 1 && (
          <div style={{
            display: 'flex', gap: 6, padding: '0 20px 12px',
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            <CategoryChip
              label={t('match.list.filterCategoryAll')}
              active={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
            />
            {categories.map(cat => (
              <CategoryChip
                key={cat}
                label={cat}
                active={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
              />
            ))}
          </div>
        )}
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
        ) : matches.length === 0 ? (
          /* No matches at all — prominent CTA */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 16, paddingTop: 60,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: 20, background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
            }}>
              ⚽
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>{t('match.list.noMatchesYet')}</div>
            <div style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.5, color: 'var(--text-muted)', maxWidth: 280 }}>
              {t('match.list.noMatchesYetDesc')}
            </div>
            <button
              onClick={() => navigate({ name: 'match-create' })}
              style={{
                background: 'var(--primary)', color: '#fff', borderRadius: 14,
                padding: '14px 28px', fontWeight: 700, fontSize: 16, marginTop: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              {t('match.list.createFirst')}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          /* Matches exist but filter yields nothing */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 16, paddingTop: 60, color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 56 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>
              {categoryFilter !== 'all' ? t('match.list.noMatchesForCategory') : t('match.list.empty')}
            </div>
            <div style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.5 }}>
              {categoryFilter !== 'all'
                ? t('match.list.noMatchesForCategoryDesc')
                : t('match.list.emptyFilter')}
            </div>
          </div>
        ) : (
          seasonSections.map(section => (
            <div key={section.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {seasonSections.length > 1 && (
                <SeasonHeader label={section.label} count={section.matches.length} />
              )}
              {section.matches.map(match => (
                <div key={match.id} style={{ position: 'relative' }}>
                  <MatchCard
                    match={match}
                    t={t}
                    onClick={() => navigate({ name: 'match-detail', matchId: match.id })}
                  />
                  <button
                    onClick={(e) => handleDelete(match, e)}
                    aria-label={t('common.delete')}
                    style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 26, height: 26, borderRadius: 13,
                      background: 'var(--surface)', color: 'var(--danger)',
                      fontWeight: 800, fontSize: 15, lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid var(--border)',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      cursor: 'pointer',
                      zIndex: 2,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
