import { useState, useMemo, useEffect } from 'react';
import { useTournamentStore } from '../../store/tournament.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { computeStandings } from '../../utils/tournament-schedule';
import { FeatureGate } from '../../components/FeatureGate';
import { useI18n, getDateLocale } from '../../i18n';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { DesktopPage, desktopPrimaryButtonStyle, desktopSecondaryButtonStyle } from '../../components/desktop/DesktopPage';
import { PageHeader } from '../../components/ui';
import type { Page } from '../../App';
import type { Tournament } from '../../types/tournament.types';
import { colorSwatch } from '../../utils/team-colors';

interface Props { navigate: (p: Page) => void; }

function getStatusLabels(t: (key: string, params?: Record<string, string | number>) => string): Record<string, { label: string; color: string; bg: string }> {
  return {
    draft:    { label: t('tournament.statusDraft'),    color: '#5D4037', bg: 'var(--warning-light)' },
    active:   { label: t('tournament.statusActive'),   color: '#1B5E20', bg: 'var(--success-light)' },
    finished: { label: t('tournament.statusFinished'), color: '#4A148C', bg: '#F3E5F5' },
  };
}

const PODIUM_EMOJI = ['🥇', '🥈', '🥉'];

function TournamentCard({ t, onClick, isJoined, statusLabels }: { t: Tournament; onClick: () => void; isJoined?: boolean; statusLabels: Record<string, { label: string; color: string; bg: string }> }) {
  const { t: tr, locale } = useI18n();
  const st = statusLabels[t.status];
  const date = new Date(t.settings.startDate).toLocaleDateString(getDateLocale(locale), {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const finishedMatches = t.matches.filter(m => m.status === 'finished').length;

  // Pódium pro ukončené turnaje
  const podium = t.status === 'finished'
    ? computeStandings(t.matches, t.teams, t.settings.tiebreakerOrder, t.settings.penaltyResults).slice(0, 3)
    : null;

  return (
    <button onClick={onClick} style={{
      background: 'var(--surface)', borderRadius: 14, padding: '16px',
      display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left',
      boxShadow: 'var(--shadow-sm)', width: '100%', color: 'var(--text)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, paddingRight: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{t.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>📅 {date}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{
            background: st.bg, color: st.color, fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap',
          }}>{st.label}</span>
          {isJoined && (
            <span style={{
              background: 'var(--info-light)', color: 'var(--info)', fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 6,
            }}>{tr('tournament.list.shared')}</span>
          )}
        </div>
      </div>

      {/* Pódium pro ukončené turnaje */}
      {podium && podium.length > 0 ? (
        <div style={{ display: 'flex', gap: 6 }}>
          {podium.map((s, idx) => {
            const team = t.teams.find(tm => tm.id === s.teamId);
            return (
              <div key={s.teamId} style={{
                flex: 1, background: 'var(--surface-var)', borderRadius: 10,
                padding: '8px 10px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{PODIUM_EMOJI[idx]}</span>
                  {team?.logoBase64 ? (
                    <img src={team.logoBase64} alt={team.name} style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover' }} />
                  ) : (
                    <div style={colorSwatch(team?.color ?? '#ccc', 18)} />
                  )}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', color: 'var(--text)', lineHeight: 1.2 }}>
                  {team?.name ?? '?'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.points} b</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
          }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary)' }}>{t.teams.length}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('tournament.list.teamsUnit')}</span>
          </div>
          <div style={{
            background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
          }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary)' }}>{t.matches.length}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('tournament.list.matchesUnit')}</span>
          </div>
          <div style={{
            background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
          }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: finishedMatches > 0 ? '#43A047' : 'var(--text-muted)' }}>
              {finishedMatches}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('tournament.list.playedUnit')}</span>
          </div>
        </div>
      )}

      {/* Progress bar (pouze pro ne-ukončené) */}
      {t.status !== 'finished' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'var(--primary)',
              width: t.matches.length > 0 ? `${(finishedMatches / t.matches.length) * 100}%` : '0%',
              transition: 'width .3s',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>
            {t.matches.length > 0 ? Math.round((finishedMatches / t.matches.length) * 100) : 0}%
          </span>
        </div>
      )}
    </button>
  );
}

export function TournamentListPage({ navigate }: Props) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();
  const tournaments = useTournamentStore(s => s.tournaments);
  const joinedTournaments = useTournamentStore(s => s.joinedTournaments);
  const joinTournament = useTournamentStore(s => s.joinTournament);
  const syncError = useTournamentStore(s => s.syncError);
  const clearSyncError = useTournamentStore(s => s.clearSyncError);
  const getLimits = useSubscriptionStore(s => s.getLimits);
  const limits = getLimits();
  const statusLabels = getStatusLabels(t);

  // Join modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  // Handle join
  const handleJoin = async () => {
    // Extract tournament ID from pasted URL if needed
    let id = joinId.trim();
    if (id.includes('tournament=')) {
      const match = id.match(/tournament=([^&]+)/);
      if (match) id = match[1];
    }

    if (!id) {
      setJoinError(t('tournament.list.enterIdOrLink'));
      return;
    }
    if (!/^\d{6}$/.test(joinPin)) {
      setJoinError(t('tournament.list.pinFormat'));
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      const result = await joinTournament(id, joinPin);
      if (result.success) {
        setShowJoinModal(false);
        setJoinId('');
        setJoinPin('');
        setJoinError('');
        navigate({ name: 'tournament-detail', tournamentId: id });
      } else {
        setJoinError(result.error ?? t('tournament.list.joinFailed'));
      }
    } catch {
      setJoinError(t('tournament.list.joinError'));
    } finally {
      setJoining(false);
    }
  };

  // Merge owned + joined tournaments with _isJoined flag
  type MergedTournament = Tournament & { _isJoined: boolean };

  // Archiv toggle
  const [archiveExpanded, setArchiveExpanded] = useState(false);

  // Vyhledávání
  const [searchQuery, setSearchQuery] = useState('');
  // Sport filter — default = preferredSport (sporty jsou oddělené).
  // Uživatel může přepnout na 'all' nebo druhý sport ručně chip barem.
  // Audit 2026-04-25: Florbal je Simple-only, sem se nedostane. Pro typové
  // bezpečí zúžíme — pokud preferredSport je floorball, fallback na 'all'.
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const initialSportFilter: 'all' | 'football' | 'tennis' =
    preferredSport === 'football' || preferredSport === 'tennis' ? preferredSport : 'all';
  const [sportFilter, setSportFilter] = useState<'all' | 'football' | 'tennis'>(initialSportFilter);
  // Když se přepne sport v Nastavení, aktualizuj filtr.
  useEffect(() => {
    if (preferredSport === 'football' || preferredSport === 'tennis') {
      setSportFilter(preferredSport);
    }
  }, [preferredSport]);

  // Rozdělit na aktivní (active/draft) a archivované (finished), filtrovat podle hledání
  const { activeTournaments, archivedTournaments } = useMemo(() => {
    const merged: MergedTournament[] = [
      ...tournaments.map(t => ({ ...t, _isJoined: false })),
      ...joinedTournaments.map(t => ({ ...t, _isJoined: true })),
    ].filter(t => {
      // Sport filter
      if (sportFilter !== 'all' && (t.sport ?? 'football') !== sportFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q)
        || t.teams.some(team => team.name.toLowerCase().includes(q));
    });
    const active: MergedTournament[] = [];
    const archived: MergedTournament[] = [];
    for (const t of merged) {
      if (t.status === 'finished') archived.push(t);
      else active.push(t);
    }
    // active/draft: active first, then draft; within group by nearest date asc
    const statusOrder: Record<string, number> = { active: 0, draft: 1 };
    active.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      return new Date(a.settings.startDate).getTime() - new Date(b.settings.startDate).getTime();
    });
    // finished: nejnovější nahoře (desc)
    archived.sort((a, b) => new Date(b.settings.startDate).getTime() - new Date(a.settings.startDate).getTime());
    return { activeTournaments: active, archivedTournaments: archived };
  }, [tournaments, joinedTournaments, searchQuery, sportFilter]);

  // Jaké sporty jsou v datech? (pro skrytí filtru když je jen 1 sport)
  const availableSports = useMemo(() => {
    const set = new Set<'football' | 'tennis'>();
    for (const t of tournaments) set.add((t.sport ?? 'football') as 'football' | 'tennis');
    for (const t of joinedTournaments) set.add((t.sport ?? 'football') as 'football' | 'tennis');
    return [...set];
  }, [tournaments, joinedTournaments]);
  const showSportFilter = availableSports.length >= 2;

  // Shared join modal — used by both mobile and desktop variants
  const joinModal = showJoinModal && (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }} onClick={() => setShowJoinModal(false)}>
      <div style={{
        background: 'var(--surface)', borderRadius: 20, padding: 24,
        width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: 'var(--shadow-lg)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontWeight: 800, fontSize: 18, textAlign: 'center' }}>
          {t('tournament.list.joinTitle')}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('tournament.list.joinIdLabel')}
          </label>
          <input
            type="text"
            value={joinId}
            onChange={e => { setJoinId(e.target.value); setJoinError(''); }}
            placeholder={t('tournament.list.joinPlaceholder')}
            style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 15,
              border: '1px solid var(--border)', background: 'var(--surface-var)',
              color: 'var(--text)', outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('tournament.list.joinPinLabel')}
          </label>
          <input
            type="password"
            value={joinPin}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              setJoinPin(val);
              setJoinError('');
            }}
            placeholder="000000"
            maxLength={6}
            inputMode="numeric"
            style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 15,
              border: '1px solid var(--border)', background: 'var(--surface-var)',
              color: 'var(--text)', outline: 'none', letterSpacing: 4,
            }}
          />
        </div>
        {joinError && (
          <div style={{
            background: 'var(--warning-light)', color: 'var(--warning)', fontSize: 13, fontWeight: 600,
            padding: '8px 12px', borderRadius: 8, textAlign: 'center',
          }}>
            {joinError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={() => { setShowJoinModal(false); setJoinId(''); setJoinPin(''); setJoinError(''); }}
            style={{
              flex: 1, padding: '12px', borderRadius: 12, fontSize: 15, fontWeight: 600,
              background: 'var(--surface-var)', color: 'var(--text)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              flex: 1, padding: '12px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: 'var(--primary)', color: '#fff',
              opacity: joining ? 0.6 : 1, cursor: joining ? 'not-allowed' : 'pointer',
            }}
          >
            {joining ? t('tournament.list.joining') : t('tournament.list.joinBtn')}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── DESKTOP VARIANT ──────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <>
        <DesktopPage
          title={t('tournament.list.pageTitle')}
          subtitle={t('tournament.list.featureLabelTournaments')}
          secondaryActions={
            <>
              <button onClick={() => navigate({ name: 'clubs' })} style={desktopSecondaryButtonStyle}>
                <span>🏟</span> {t('tournament.list.clubsBtn')}
              </button>
              <button onClick={() => setShowJoinModal(true)} style={desktopSecondaryButtonStyle}>
                <span>🔗</span> {t('tournament.list.joinBtn')}
              </button>
            </>
          }
          primaryAction={
            <button
              onClick={() => navigate({ name: 'tournament-wizard' })}
              style={desktopPrimaryButtonStyle}
              disabled={tournaments.length >= limits.maxTournaments}
            >
              <span style={{ fontSize: 16 }}>+</span> {t('common.new')}
            </button>
          }
          filters={
            tournaments.length + joinedTournaments.length > 3 ? (
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('common.search')}
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  fontSize: 14, color: 'var(--text)', outline: 'none',
                  minWidth: 280,
                }}
              />
            ) : undefined
          }
        >
          {tournaments.length >= limits.maxTournaments && (
            <div style={{ marginBottom: 16 }}>
              <FeatureGate
                currentCount={tournaments.length}
                maxAllowed={limits.maxTournaments}
                featureLabel={t('tournament.list.featureLabelTournaments')}
                onUpgrade={() => navigate({ name: 'settings' })}
              >
                <></>
              </FeatureGate>
            </div>
          )}

          {activeTournaments.length === 0 && archivedTournaments.length === 0 ? (
            <div style={{
              background: 'var(--surface)', border: '1px dashed var(--border)',
              borderRadius: 14, padding: '64px 24px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}>
              <div style={{ fontSize: 56 }}>🏆</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>{t('tournament.list.noTournaments')}</div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 460, lineHeight: 1.5 }}>
                {t('tournament.list.emptyDesc')}
              </div>
              <button onClick={() => navigate({ name: 'tournament-wizard' })} style={{ ...desktopPrimaryButtonStyle, marginTop: 8 }}>
                + {t('tournament.list.createTournament')}
              </button>
            </div>
          ) : (
            <>
              <TournamentsTable
                rows={activeTournaments}
                statusLabels={statusLabels}
                t={t}
                onRowClick={(tt) => navigate({ name: 'tournament-detail', tournamentId: tt.id })}
              />

              {archivedTournaments.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <button
                    onClick={() => setArchiveExpanded(prev => !prev)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', borderRadius: 10,
                      background: 'var(--surface-var)', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 11, transition: 'transform .2s', transform: archiveExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    📦 {t('tournament.archive')} ({archivedTournaments.length})
                  </button>
                  {archiveExpanded && (
                    <div style={{ marginTop: 12 }}>
                      <TournamentsTable
                        rows={archivedTournaments}
                        statusLabels={statusLabels}
                        t={t}
                        onRowClick={(tt) => navigate({ name: 'tournament-detail', tournamentId: tt.id })}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </DesktopPage>
        {joinModal}
      </>
    );
  }

  // ─── MOBILE VARIANT ───────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <PageHeader
        title={`🏆 ${t('tournament.list.pageTitle')}`}
        onBack={() => navigate({ name: 'home' })}
        action={
          <button
            onClick={() => navigate({ name: 'tournament-wizard' })}
            style={{
              background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
              padding: '8px 16px', borderRadius: 12,
            }}
          >
            + {t('common.new')}
          </button>
        }
      />

      {/* Sync error banner */}
      {syncError && (
        <div style={{
          margin: '12px 20px 0', padding: '12px 16px', borderRadius: 12,
          background: 'var(--warning-light)', border: '1px solid #FFB74D',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--warning)' }}>
              {t('tournament.list.syncFailed')}
            </div>
            <div style={{ fontSize: 12, color: '#BF360C', marginTop: 4, lineHeight: 1.4 }}>
              {syncError}
            </div>
            <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 6, lineHeight: 1.4 }}>
              {t('tournament.list.syncHint')}<br />
              {t('tournament.list.syncHintPaths')}
            </div>
          </div>
          <button onClick={clearSyncError} style={{ fontSize: 16, color: 'var(--warning)', padding: 4 }}>✕</button>
        </div>
      )}

      {/* Sport filter chips */}
      {showSportFilter && (
        <div style={{ padding: '12px 20px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            { key: 'all' as const, label: t('landing.filterSportAll'), icon: '' },
            { key: 'football' as const, label: t('sport.football'), icon: '⚽' },
            { key: 'tennis' as const, label: t('sport.tennis'), icon: '🎾' },
          ]).filter(chip => chip.key === 'all' || availableSports.includes(chip.key))
            .map(chip => (
              <button
                key={chip.key}
                onClick={() => setSportFilter(chip.key)}
                style={{
                  padding: '7px 12px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                  background: sportFilter === chip.key ? 'var(--primary)' : 'var(--surface)',
                  color: sportFilter === chip.key ? '#fff' : 'var(--text-muted)',
                  border: sportFilter === chip.key ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                {chip.icon} {chip.label}
              </button>
            ))}
        </div>
      )}

      {/* Search */}
      {(tournaments.length + joinedTournaments.length) > 3 && (
        <div style={{ padding: '12px 20px 0' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('common.search')}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              fontSize: 14, color: 'var(--text)', outline: 'none',
            }}
          />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {activeTournaments.length === 0 && archivedTournaments.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '60px 20px' }}>
            <div style={{ fontSize: 64 }}>🏆</div>
            <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('tournament.list.noTournaments')}</h2>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 15, lineHeight: 1.5 }}>
              {t('tournament.list.emptyDesc')}
            </p>
            <button onClick={() => navigate({ name: 'tournament-wizard' })} style={{
              background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 16,
              padding: '14px 32px', borderRadius: 12, marginTop: 8,
            }}>
              ➕ {t('tournament.list.createTournament')}
            </button>
          </div>
        ) : (
          <>
            {/* Aktivní a rozpracované turnaje */}
            {activeTournaments.map(t => (
              <TournamentCard
                key={t.id}
                t={t}
                isJoined={t._isJoined}
                statusLabels={statusLabels}
                onClick={() => navigate({ name: 'tournament-detail', tournamentId: t.id })}
              />
            ))}

            <FeatureGate
              currentCount={tournaments.length}
              maxAllowed={limits.maxTournaments}
              featureLabel={t('tournament.list.featureLabelTournaments')}
              onUpgrade={() => navigate({ name: 'settings' })}
            >
              <button onClick={() => navigate({ name: 'tournament-wizard' })} style={{
                background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 15,
                padding: '14px', borderRadius: 14, border: '2px dashed var(--primary)', opacity: 0.8,
                marginTop: 4, width: '100%',
              }}>
                ➕ {t('tournament.list.createNew')}
              </button>
            </FeatureGate>

            {/* Archiv ukončených turnajů */}
            {archivedTournaments.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => setArchiveExpanded(prev => !prev)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '12px 16px', borderRadius: 14,
                    background: 'var(--surface-var)',
                    color: 'var(--text-muted)', fontWeight: 700, fontSize: 14,
                  }}
                >
                  <span style={{
                    display: 'inline-block', transition: 'transform .2s',
                    transform: archiveExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    fontSize: 12,
                  }}>▶</span>
                  <span>📦 {t('tournament.archive')} ({archivedTournaments.length})</span>
                </button>

                {archiveExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {archivedTournaments.map(t => (
                      <TournamentCard
                        key={t.id}
                        t={t}
                        isJoined={t._isJoined}
                        statusLabels={statusLabels}
                        onClick={() => navigate({ name: 'tournament-detail', tournamentId: t.id })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Připojit se jako co-host (sekundární akce) */}
      <div style={{ padding: '0 20px 16px' }}>
        <button
          onClick={() => setShowJoinModal(true)}
          style={{
            width: '100%', padding: '10px', borderRadius: 10,
            background: 'transparent', color: 'var(--text-muted)',
            fontWeight: 600, fontSize: 13,
            border: '1.5px dashed var(--border)',
          }}
        >
          🔗 {t('tournament.list.joinBtn')}
        </button>
      </div>

      {joinModal}
    </div>
  );
}

// ─── Desktop tournaments table ───────────────────────────────────────────────

type TournamentRow = Tournament & { _isJoined: boolean };

function TournamentsTable({ rows, statusLabels, t, onRowClick }: {
  rows: TournamentRow[];
  statusLabels: Record<string, { label: string; color: string; bg: string }>;
  t: (key: string, params?: Record<string, string | number>) => string;
  onRowClick: (tt: TournamentRow) => void;
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <th style={{ padding: '14px 18px', textAlign: 'left' }}>{t('table.name')}</th>
            <th style={{ padding: '14px 18px', textAlign: 'left' }}>{t('table.date')}</th>
            <th style={{ padding: '14px 18px', textAlign: 'center' }}>{t('table.teams')}</th>
            <th style={{ padding: '14px 18px', textAlign: 'center' }}>{t('table.matches')}</th>
            <th style={{ padding: '14px 18px', textAlign: 'left' }}>{t('table.status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tt, i) => {
            const st = statusLabels[tt.status];
            const finished = tt.matches.filter(m => m.status === 'finished').length;
            const total = tt.matches.length;
            const progress = total > 0 ? Math.round((finished / total) * 100) : 0;
            return (
              <tr
                key={tt.id}
                onClick={() => onRowClick(tt)}
                style={{
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer', transition: 'background .12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-var)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '14px 18px', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {tt._isJoined && (
                      <span title="Joined" style={{
                        fontSize: 10, fontWeight: 800, color: 'var(--info)', background: 'var(--info-light)',
                        padding: '2px 8px', borderRadius: 6,
                      }}>JOINED</span>
                    )}
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{tt.name}</span>
                  </div>
                </td>
                <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                  {new Date(tt.settings.startDate).toLocaleDateString()}
                </td>
                <td style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--text)', fontWeight: 600 }}>
                  {tt.teams.length}
                </td>
                <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{finished}/{total}</span>
                    <div style={{ width: 60, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${progress}%`,
                        background: progress === 100 ? '#43A047' : 'var(--primary)',
                      }} />
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 18px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                    color: st.color, background: st.bg, whiteSpace: 'nowrap',
                  }}>
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
