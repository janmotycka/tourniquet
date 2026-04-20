/**
 * TennisMatchListPage — tenisově specifický seznam zápasů.
 *
 * Design záměrně jiný než fotbalová MatchListPage:
 *  - Zjednodušený filtr (status: vše / plánované / live / dokončené)
 *  - Karty ukazují skóre jako sets (singles) nebo team score (družstva)
 *  - Čistě tenisový branding (modrá, 🎾)
 *  - Žádné fotbalové pojmy (poločasy, formáty X+1, střídání...)
 */

import { useMemo, useState } from 'react';
import type { Page } from '../../../App';
import { useMatchesStore } from '../../../store/matches.store';
import { useClubsStore } from '../../../store/clubs.store';
import { useConfirmStore } from '../../../store/confirm.store';
import { useUserPrefsStore } from '../../../store/userPrefs.store';
import { useI18n } from '../../../i18n';
import { PageHeader } from '../../../components/ui';
import { formatDate } from '../../../components/match/match-utils';
import { aggregateTeamScore, formatSubMatchScore } from '../utils/tennis-team';
import type { SeasonMatch } from '../../../types/match.types';
import { useMyPlayersStore } from '../store/myPlayers.store';

interface Props { navigate: (p: Page) => void; }

type StatusFilter = 'all' | 'planned' | 'live' | 'finished';

/**
 * Tenisový zápas je "finished" když má aspoň jeden sub-match rozhodnutého vítěze,
 * "live" pokud má zadané sety (ale ještě ne dokončený), jinak "planned".
 * Extrahováno mimo komponent — stabilní identita pro useMemo deps.
 */
function effectiveStatus(m: SeasonMatch): 'planned' | 'live' | 'finished' {
  const subs = m.subMatches ?? [];
  if (subs.length === 0) return 'planned';
  const hasWinner = subs.some(s => s.winner !== null);
  const hasSets = subs.some(s => Array.isArray(s.sets) && s.sets.length > 0);
  if (hasWinner) {
    const allDecided = subs.every(s => s.winner !== null);
    return allDecided ? 'finished' : 'live';
  }
  if (hasSets) return 'live';
  return 'planned';
}

export function TennisMatchListPage({ navigate }: Props) {
  const { t } = useI18n();
  const allMatches = useMatchesStore(s => s.matches);
  const deleteMatch = useMatchesStore(s => s.deleteMatch);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const tennisUserType = useUserPrefsStore(s => s.tennisUserType);
  const myPlayers = useMyPlayersStore(s => s.players);
  const ask = useConfirmStore(s => s.ask);

  const [filter, setFilter] = useState<StatusFilter>('all');

  // Tenisové zápasy — filtr závisí na user type:
  //  • Klubový trenér → jen zápasy aktivního klubu
  //  • Individuální trenér/rodič → jen zápasy jeho sledovaných hráčů (myPlayerId)
  const matches = useMemo(() => {
    if (tennisUserType === 'individual') {
      const ids = new Set(myPlayers.map(p => p.id));
      return allMatches.filter(m =>
        (m.sport ?? 'football') === 'tennis' && m.myPlayerId && ids.has(m.myPlayerId),
      );
    }
    // Klubový mód
    return allMatches.filter(m => {
      if ((m.sport ?? 'football') !== 'tennis') return false;
      // Skryj individuální zápasy v klubovém módu
      if (m.myPlayerId) return false;
      if (activeClubId && m.clubId && m.clubId !== activeClubId) return false;
      return true;
    });
  }, [allMatches, activeClubId, tennisUserType, myPlayers]);

  // Pro tenis určujeme "effective status" z výsledků, ne z match.status.
  const sorted = useMemo(() => {
    const order: Record<string, number> = { live: 0, planned: 1, finished: 2 };
    return [...matches].sort((a, b) => {
      const oa = order[effectiveStatus(a)] ?? 99;
      const ob = order[effectiveStatus(b)] ?? 99;
      if (oa !== ob) return oa - ob;
      return b.date.localeCompare(a.date);
    });
  }, [matches]);

  const filtered = useMemo(() => {
    if (filter === 'all') return sorted;
    return sorted.filter(m => effectiveStatus(m) === filter);
  }, [sorted, filter]);

  const handleDelete = async (m: SeasonMatch, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await ask({
      title: t('common.delete'),
      message: t('match.list.deleteConfirm', { opponent: m.opponent }),
      destructive: true,
    });
    if (ok) await deleteMatch(m.id);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title={`🎾 ${t('tennis.matchList.title')}`}
        subtitle={t('tennis.matchList.subtitle')}
        onBack={() => navigate({ name: 'home' })}
      />

      {/* Filter chips */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 16px', flexWrap: 'wrap',
        borderBottom: '1px solid var(--border)',
      }}>
        {(['all', 'planned', 'live', 'finished'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: filter === f ? 'var(--primary)' : 'var(--surface-var)',
              color: filter === f ? '#fff' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer',
            }}
          >
            {t(`tennis.matchList.filter.${f}`)}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, padding: '12px 16px 92px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <EmptyState
            onCreate={() => navigate({ name: 'match-create' })}
            noMatchesAtAll={matches.length === 0}
            t={t}
          />
        ) : (
          filtered.map(m => {
            // V individuálním módu resolvni jméno mého hráče pro card.
            const myPlayer = m.myPlayerId ? myPlayers.find(p => p.id === m.myPlayerId) : null;
            return (
              <TennisMatchCard
                key={m.id}
                match={m}
                myPlayerName={myPlayer?.name}
                onClick={() => navigate({ name: 'match-detail', matchId: m.id })}
                onDelete={e => { void handleDelete(m, e); }}
                t={t}
              />
            );
          })
        )}
      </div>

      {/* FAB — create new tennis match */}
      <button
        onClick={() => navigate({ name: 'match-create' })}
        aria-label={t('tennis.matchList.createCta')}
        style={{
          position: 'fixed',
          bottom: 'max(20px, env(safe-area-inset-bottom))',
          right: 20, zIndex: 50,
          padding: '14px 20px', borderRadius: 28,
          background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
          color: '#fff', fontWeight: 800, fontSize: 14,
          border: 'none', cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(21,101,192,.35)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>+</span>
        <span>{t('tennis.matchList.createCta')}</span>
      </button>
    </div>
  );
}

// ─── Tennis match card ──────────────────────────────────────────────────────
function TennisMatchCard({
  match, myPlayerName, onClick, onDelete, t,
}: {
  match: SeasonMatch;
  /** Pokud zápas patří individuálnímu hráči, zobrazí se jeho jméno místo „my vs soupeř". */
  myPlayerName?: string;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const isTeam = match.matchType === 'team';
  // Effective status: odvozen ze sub-matches (tenis si status neřídí přes timer).
  const subs = match.subMatches ?? [];
  const hasWinner = subs.some(s => s.winner !== null);
  const hasSets = subs.some(s => Array.isArray(s.sets) && s.sets.length > 0);
  const allDecided = subs.length > 0 && subs.every(s => s.winner !== null);
  const isFinished = hasWinner && allDecided;
  const isLive = !isFinished && (hasWinner || hasSets);

  // Skóre: team match → agregát ze sub-matches, singles → první sub-match nebo home/awayScore
  let scoreText = '—';
  if (isTeam) {
    const agg = aggregateTeamScore(match.subMatches ?? []);
    scoreText = `${agg.home}:${agg.away}`;
  } else if (match.subMatches && match.subMatches[0]) {
    scoreText = formatSubMatchScore(match.subMatches[0]);
  } else if (match.status !== 'planned') {
    scoreText = `${match.homeScore}:${match.awayScore}`;
  }

  // Individuální mód → primární je jméno mého hráče (ne "we").
  const ourLabel = myPlayerName ?? match.clubName ?? t('match.our');
  const homeLabel = match.isHome ? ourLabel : match.opponent;
  const awayLabel = match.isHome ? match.opponent : ourLabel;

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
        border: isLive ? '1.5px solid var(--danger)' : '1px solid var(--border)',
        cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>
          {isLive && (
            <span style={{
              color: '#fff', background: 'var(--danger)',
              padding: '2px 8px', borderRadius: 6,
              animation: 'tenLivePulse 1.4s ease-in-out infinite',
            }}>● LIVE</span>
          )}
          {isFinished && (
            <span style={{
              color: 'var(--text-muted)', background: 'var(--surface-var)',
              padding: '2px 8px', borderRadius: 6,
            }}>{t('match.status.finished')}</span>
          )}
          <span style={{
            color: 'var(--primary)', background: 'var(--primary-light)',
            padding: '2px 8px', borderRadius: 6,
          }}>{isTeam ? t('tennis.matchList.teamBadge') : t('tennis.matchList.singlesBadge')}</span>
          {match.ageCategory && (
            <span style={{
              color: 'var(--text-muted)', background: 'var(--surface-var)',
              padding: '2px 8px', borderRadius: 6,
            }}>{match.ageCategory}</span>
          )}
        </div>
        <button
          onClick={onDelete}
          aria-label={t('common.delete')}
          style={{
            width: 26, height: 26, borderRadius: 13,
            background: 'transparent', border: 'none',
            color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
          }}
        >🗑</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 14, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {homeLabel} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>vs</span> {awayLabel}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {formatDate(match.date)} · {match.kickoffTime}
            {match.competition && ` · ${match.competition}`}
          </div>
        </div>
        <div style={{
          fontWeight: 900, fontSize: isTeam ? 22 : 14,
          color: isLive ? 'var(--danger)' : 'var(--text)',
          letterSpacing: isTeam ? 1 : 0,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 60, textAlign: 'right', flexShrink: 0,
        }}>
          {scoreText}
        </div>
      </div>

      <style>{`@keyframes tenLivePulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }`}</style>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────
function EmptyState({ onCreate, noMatchesAtAll, t }: {
  onCreate: () => void;
  noMatchesAtAll: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center', gap: 16,
    }}>
      <div style={{ fontSize: 56 }}>🎾</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
          {noMatchesAtAll ? t('tennis.matchList.emptyTitle') : t('tennis.matchList.emptyFilterTitle')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, maxWidth: 300, lineHeight: 1.5 }}>
          {noMatchesAtAll ? t('tennis.matchList.emptyDesc') : t('tennis.matchList.emptyFilterDesc')}
        </div>
      </div>
      {noMatchesAtAll && (
        <button
          onClick={onCreate}
          style={{
            padding: '12px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14,
            background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
            color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(21,101,192,.25)',
          }}
        >
          + {t('tennis.matchList.createCta')}
        </button>
      )}
    </div>
  );
}
