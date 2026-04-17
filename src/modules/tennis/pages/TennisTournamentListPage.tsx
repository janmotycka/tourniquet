/**
 * TennisTournamentListPage — seznam tenisových turnajů.
 *
 * Design záměrně jednodušší než fotbalová TournamentListPage:
 *  - Jen tenisové turnaje (filtr: active / finished / all)
 *  - Žádný sport picker (už víme, že jsme v tenisu)
 *  - Prázdný stav navádí na vytvoření turnaje
 *
 * V první iteraci podporujeme stejnou Tournament entitu jako fotbal
 * (sport='tennis' discriminátor). Rozlosování pavoka / draw flow
 * se dodá v budoucí iteraci s dedicated TennisCreateTournamentPage.
 */

import { useState, useMemo } from 'react';
import type { Page } from '../../../App';
import { useTournamentStore } from '../../../store/tournament.store';
import { useI18n, getDateLocale } from '../../../i18n';
import { PageHeader } from '../../../components/ui';
import type { Tournament } from '../../../types/tournament.types';

interface Props { navigate: (p: Page) => void; }

type StatusFilter = 'all' | 'active' | 'draft' | 'finished';

export function TennisTournamentListPage({ navigate }: Props) {
  const { t, locale } = useI18n();
  const allTournaments = useTournamentStore(s => s.tournaments);

  const tennisTournaments = useMemo(
    () => allTournaments.filter(tt => (tt.sport ?? 'football') === 'tennis'),
    [allTournaments],
  );

  const [filter, setFilter] = useState<StatusFilter>('all');
  const filtered = useMemo(() => {
    const list = filter === 'all' ? tennisTournaments : tennisTournaments.filter(tt => tt.status === filter);
    // Active → Draft → Finished; within groups newest first
    const order: Record<string, number> = { active: 0, draft: 1, finished: 2 };
    return [...list].sort((a, b) => {
      const oa = order[a.status] ?? 99;
      const ob = order[b.status] ?? 99;
      if (oa !== ob) return oa - ob;
      return b.settings.startDate.localeCompare(a.settings.startDate);
    });
  }, [tennisTournaments, filter]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title={`🎾 ${t('tennis.tournamentList.title')}`}
        subtitle={t('tennis.tournamentList.subtitle')}
        onBack={() => navigate({ name: 'home' })}
      />

      {/* Filter chips */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 16px', flexWrap: 'wrap',
        borderBottom: '1px solid var(--border)',
      }}>
        {(['all', 'active', 'draft', 'finished'] as const).map(f => (
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
            {t(`tennis.tournamentList.filter.${f}`)}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, padding: '12px 16px 92px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <EmptyState
            onCreate={() => navigate({ name: 'tournament-create-choice' })}
            noTournamentsAtAll={tennisTournaments.length === 0}
            t={t}
          />
        ) : filtered.map(tt => (
          <TournamentCard
            key={tt.id}
            tournament={tt}
            onClick={() => navigate({ name: 'tournament-detail', tournamentId: tt.id })}
            locale={locale}
            t={t}
          />
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate({ name: 'tournament-create-choice' })}
        aria-label={t('tennis.tournamentList.createCta')}
        style={{
          position: 'fixed',
          bottom: 'max(20px, env(safe-area-inset-bottom))',
          right: 20, zIndex: 50,
          padding: '14px 20px', borderRadius: 28,
          background: 'linear-gradient(135deg, #00695C 0%, #00897B 100%)',
          color: '#fff', fontWeight: 800, fontSize: 14,
          border: 'none', cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(0,137,123,.35)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>+</span>
        <span>{t('tennis.tournamentList.createCta')}</span>
      </button>
    </div>
  );
}

// ─── Tournament card ────────────────────────────────────────────────────────
function TournamentCard({
  tournament, onClick, locale, t,
}: {
  tournament: Tournament;
  onClick: () => void;
  locale: 'cs' | 'en' | 'de';
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const date = new Date(tournament.settings.startDate + 'T00:00:00').toLocaleDateString(
    getDateLocale(locale),
    { day: 'numeric', month: 'long', year: 'numeric' },
  );
  const finishedMatches = tournament.matches.filter(m => m.status === 'finished').length;
  const totalMatches = tournament.matches.length;
  const statusColor = tournament.status === 'active' ? 'var(--success)'
    : tournament.status === 'finished' ? '#4A148C' : 'var(--warning)';
  const statusBg = tournament.status === 'active' ? 'var(--success-light)'
    : tournament.status === 'finished' ? '#F3E5F5' : 'var(--warning-light)';

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
        textAlign: 'left', width: '100%', color: 'var(--text)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{tournament.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>📅 {date}</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
          color: statusColor, background: statusBg, letterSpacing: 0.3,
          textTransform: 'uppercase', flexShrink: 0,
        }}>
          {t(`tournament.status${tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}`)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-muted)' }}>
        <span>👥 {tournament.teams.length}</span>
        <span>🎾 {finishedMatches}/{totalMatches}</span>
        {tournament.settings.venueName && (
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 200,
          }}>📍 {tournament.settings.venueName}</span>
        )}
      </div>
    </button>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────
function EmptyState({ onCreate, noTournamentsAtAll, t }: {
  onCreate: () => void;
  noTournamentsAtAll: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center', gap: 16,
    }}>
      <div style={{ fontSize: 56 }}>🏆</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
          {noTournamentsAtAll ? t('tennis.tournamentList.emptyTitle') : t('tennis.tournamentList.emptyFilterTitle')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, maxWidth: 300, lineHeight: 1.5 }}>
          {noTournamentsAtAll ? t('tennis.tournamentList.emptyDesc') : t('tennis.tournamentList.emptyFilterDesc')}
        </div>
      </div>
      {noTournamentsAtAll && (
        <button
          onClick={onCreate}
          style={{
            padding: '12px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14,
            background: 'linear-gradient(135deg, #00695C 0%, #00897B 100%)',
            color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,137,123,.25)',
          }}
        >
          + {t('tennis.tournamentList.createCta')}
        </button>
      )}
    </div>
  );
}
