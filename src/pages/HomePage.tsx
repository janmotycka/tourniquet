import { useEffect, useMemo, useState } from 'react';
import type { Page } from '../App';
import { useAuth } from '../context/AuthContext';
import { useSubscriptionStore } from '../store/subscription.store';
import { useMatchesStore } from '../store/matches.store';
import { useTournamentStore } from '../store/tournament.store';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useI18n } from '../i18n';
import { useLayoutMode } from '../hooks/useLayoutMode';
import { DesktopPage } from '../components/desktop/DesktopPage';
import { ClubSwitcher } from '../components/clubs/ClubSwitcher';
import { useClubsStore } from '../store/clubs.store';
import { OnboardingWizard, isOnboarded } from '../components/onboarding/OnboardingWizard';

interface Props { navigate: (p: Page) => void; }

export function HomePage({ navigate }: Props) {
  const { user } = useAuth();
  const isPremium = useSubscriptionStore(s => s.isPremium);
  const { t } = useI18n();
  const activeClub = useClubsStore(s => {
    const id = s.activeClubId;
    return id ? s.clubs.find(c => c.id === id) : s.clubs[0];
  });
  const clubCount = useClubsStore(s => s.clubs.length);
  const { canInstall, install } = usePWAInstall();
  const { isDesktop } = useLayoutMode();

  // ─── First-time onboarding wizard ────────────────────────────────────────
  // Spustí se, když přihlášený uživatel nemá žádný klub a ještě nedokončil
  // (nebo nepřeskočil) onboarding pro tento UID.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!user?.uid) return;
    if (clubCount === 0 && !isOnboarded(user.uid)) {
      setShowOnboarding(true);
    }
  }, [user?.uid, clubCount]);

  // Live overview — currently running matches & active tournaments
  const matches = useMatchesStore(s => s.matches);
  const tournaments = useTournamentStore(s => s.tournaments);
  const liveMatches = useMemo(() => matches.filter(m => m.status === 'live'), [matches]);
  const activeTournaments = useMemo(() => tournaments.filter(tt => tt.status === 'active'), [tournaments]);
  const hasLive = liveMatches.length > 0 || activeTournaments.length > 0;

  // Wizard JSX shared across mobile/desktop returns (renders as fixed overlay).
  const wizard = showOnboarding ? (
    <OnboardingWizard
      navigate={navigate}
      onComplete={() => setShowOnboarding(false)}
    />
  ) : null;

  if (isDesktop) {
    const upcomingMatches = matches
      .filter(m => m.status !== 'finished' && m.status !== 'live')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 5);

    return (
      <>
      {wizard}
      <DesktopPage
        title={t('home.greeting')}
        subtitle={user?.displayName ?? user?.email ?? t('home.loggedIn')}
      >
        {/* ─── Live now — prominent only when something is live ──────────── */}
        {hasLive && (
          <section style={{
            background: 'var(--surface)',
            border: '1.5px solid #C62828',
            borderRadius: 16,
            padding: '18px 22px',
            marginBottom: 24,
            boxShadow: '0 0 0 4px rgba(198, 40, 40, 0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span aria-hidden style={{
                width: 10, height: 10, borderRadius: '50%',
                background: 'var(--danger)', animation: 'pulse 1.4s ease-in-out infinite',
              }} />
              <h2 style={{
                fontSize: 13, fontWeight: 800, color: 'var(--danger)',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {t('home.liveNow')}
              </h2>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                {liveMatches.length + activeTournaments.length}
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 10,
            }}>
              {liveMatches.map(m => {
                const our = m.isHome ? m.homeScore : m.awayScore;
                const their = m.isHome ? m.awayScore : m.homeScore;
                const ourName = m.clubName ?? t('match.our');
                return (
                  <button
                    key={m.id}
                    onClick={() => navigate({ name: 'match-detail', matchId: m.id })}
                    style={liveCardStyle}
                  >
                    <span style={liveBadgeStyle('var(--danger)')}>LIVE</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {ourName} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>vs</span> {m.opponent}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {m.competition || t('home.match')}
                      </div>
                    </div>
                    <div style={liveScoreStyle}>{our}:{their}</div>
                  </button>
                );
              })}
              {activeTournaments.map(tt => {
                const matchesPlayed = tt.matches.filter(mm => mm.status === 'finished').length;
                const matchesTotal = tt.matches.length;
                return (
                  <button
                    key={tt.id}
                    onClick={() => navigate({ name: 'tournament-detail', tournamentId: tt.id })}
                    style={liveCardStyle}
                  >
                    <span style={liveBadgeStyle('var(--warning)')}>🏆</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{tt.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {tt.teams.length} {t('table.teams').toLowerCase()} · {matchesPlayed}/{matchesTotal} {t('table.matches').toLowerCase()}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Public events feed entry */}
        <button
          onClick={() => navigate({ name: 'public-feed' })}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            width: '100%', padding: '14px 18px',
            background: 'linear-gradient(135deg, #1A237E 0%, #283593 100%)',
            color: '#fff', border: 'none', borderRadius: 14,
            cursor: 'pointer', marginBottom: 24, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(26,35,126,.18)',
          }}
        >
          <span style={{ fontSize: 24 }}>📡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{t('home.publicFeedTitle')}</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{t('home.publicFeedSub')}</div>
          </div>
          <span style={{ fontSize: 18, opacity: 0.8 }}>→</span>
        </button>

        {/* ─── Main 2-column grid: Upcoming | Activity feed ──────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}>
          {/* LEFT: Upcoming matches */}
          <DashSection
            title={t('home.upcoming') || 'Nadcházející'}
            action={upcomingMatches.length > 0 ? { label: t('common.all') || 'Vše', onClick: () => navigate({ name: 'match-list' }) } : undefined}
          >
            {upcomingMatches.length === 0 ? (
              <EmptyRow text={t('home.noUpcoming') || 'Žádné nadcházející zápasy'} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingMatches.map(m => {
                  const ourName = m.clubName ?? t('match.our');
                  const date = m.date ? new Date(m.date).toLocaleDateString() : '—';
                  return (
                    <button
                      key={m.id}
                      onClick={() => navigate({ name: 'match-detail', matchId: m.id })}
                      style={listRowStyle}
                    >
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        minWidth: 48, padding: '4px 8px', borderRadius: 8,
                        background: 'var(--surface-var)',
                      }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {date.split('/')[0] || date.split('.')[0]}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {ourName} <span style={{ color: 'var(--text-muted)' }}>vs</span> {m.opponent}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {m.competition || t('home.match')} · {date}
                        </div>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>→</span>
                    </button>
                  );
                })}
              </div>
            )}
          </DashSection>

          {/* RIGHT: Activity feed / notifications (placeholder for now) */}
          <DashSection title={t('home.activity') || 'Novinky a upozornění'}>
            <EmptyRow text={t('home.activityEmpty') || 'Zatím žádné novinky'} />
            {!isPremium() && (
              <button
                onClick={() => navigate({ name: 'settings' })}
                style={{
                  marginTop: 12,
                  width: '100%',
                  background: 'linear-gradient(135deg, #FFF8E1 0%, #FFE082 100%)',
                  border: '1.5px solid #FFD54F', borderRadius: 12,
                  padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <span style={{ fontSize: 22 }}>⭐</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--warning)' }}>{t('home.premiumBanner')}</div>
                  <div style={{ fontSize: 11, color: '#BF360C', marginTop: 2 }}>{t('subscription.price')}</div>
                </div>
                <span style={{ color: 'var(--warning)' }}>→</span>
              </button>
            )}
          </DashSection>
        </div>
      </DesktopPage>
      </>
    );
  }

  return (
    <>
    {wizard}
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '24px 20px', gap: 20, overflowY: 'auto', paddingBottom: 40,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: activeClub?.logoBase64 ? 'transparent' : 'var(--primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0,
          overflow: 'hidden',
        }}>
          {activeClub?.logoBase64 ? (
            <img src={activeClub.logoBase64} alt="" style={{ width: 56, height: 56, objectFit: 'cover' }} />
          ) : '⚽'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{t('home.greeting')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.displayName ?? user?.email ?? t('home.loggedIn')}
          </p>
        </div>
        <button
          onClick={() => navigate({ name: 'settings' })}
          title={t('home.settings')}
          aria-label={t('home.settings')}
          style={{
            flexShrink: 0, width: 40, height: 40, borderRadius: 12,
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ⚙️
        </button>
      </div>

      {/* Active club switcher — only for multi-club users */}
      {clubCount > 1 && <ClubSwitcher navigate={navigate} />}


      {/* ─── LIVE NOW — currently running matches & tournaments ──────────── */}
      {hasLive && (
        <section
          aria-label={t('home.liveNow')}
          style={{
            background: 'var(--surface)',
            borderRadius: 16,
            padding: '14px 16px 16px',
            border: '1.5px solid #C62828',
            boxShadow: '0 0 0 4px rgba(198, 40, 40, 0.08)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden
              style={{
                width: 10, height: 10, borderRadius: '50%',
                background: 'var(--danger)',
                animation: 'pulse 1.4s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            <h2 style={{ fontWeight: 800, fontSize: 14, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('home.liveNow')}
            </h2>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {liveMatches.length + activeTournaments.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {liveMatches.map(m => {
              const our = m.isHome ? m.homeScore : m.awayScore;
              const their = m.isHome ? m.awayScore : m.homeScore;
              const ourName = m.clubName ?? t('match.our');
              return (
                <button
                  key={m.id}
                  onClick={() => navigate({ name: 'match-detail', matchId: m.id })}
                  style={{
                    background: 'var(--surface-var)',
                    borderRadius: 12, padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', textAlign: 'left',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: '#fff', background: 'var(--danger)',
                    padding: '3px 8px', borderRadius: 6, letterSpacing: 0.5, flexShrink: 0,
                  }}>
                    LIVE
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 14, color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ourName} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>vs</span> {m.opponent}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      {m.competition || t('home.match')}
                    </div>
                  </div>
                  <div style={{
                    fontWeight: 900, fontSize: 18, color: 'var(--text)',
                    background: 'var(--surface)', borderRadius: 8, padding: '4px 10px',
                    flexShrink: 0,
                  }}>
                    {our}:{their}
                  </div>
                </button>
              );
            })}

            {activeTournaments.map(tt => {
              const matchesPlayed = tt.matches.filter(mm => mm.status === 'finished').length;
              const matchesTotal = tt.matches.length;
              return (
                <button
                  key={tt.id}
                  onClick={() => navigate({ name: 'tournament-detail', tournamentId: tt.id })}
                  style={{
                    background: 'var(--surface-var)',
                    borderRadius: 12, padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', textAlign: 'left',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: '#fff', background: 'var(--warning)',
                    padding: '3px 8px', borderRadius: 6, letterSpacing: 0.5, flexShrink: 0,
                  }}>
                    🏆
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 14, color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {tt.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      {tt.teams.length} {t('table.teams').toLowerCase()} · {matchesPlayed}/{matchesTotal} {t('table.matches').toLowerCase()}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 18, flexShrink: 0 }}>→</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Public events feed entry */}
      <button
        onClick={() => navigate({ name: 'public-feed' })}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          width: '100%', padding: '14px 18px',
          background: 'linear-gradient(135deg, #1A237E 0%, #283593 100%)',
          color: '#fff', border: 'none', borderRadius: 14,
          cursor: 'pointer', textAlign: 'left',
          boxShadow: '0 4px 16px rgba(26,35,126,.18)',
        }}
      >
        <span style={{ fontSize: 24 }}>📡</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{t('home.publicFeedTitle')}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{t('home.publicFeedSub')}</div>
        </div>
        <span style={{ fontSize: 18, opacity: 0.8 }}>→</span>
      </button>

      {/* Upgrade CTA banner for free users */}
      {!isPremium() && (
        <button
          onClick={() => navigate({ name: 'settings' })}
          style={{
            background: 'linear-gradient(135deg, #FFF8E1 0%, #FFE082 100%)',
            borderRadius: 14, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            border: '1.5px solid #FFD54F', width: '100%',
          }}
        >
          <span style={{ fontSize: 28, flexShrink: 0 }}>⭐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--warning)' }}>
              {t('home.premiumBanner')}
            </div>
            <div style={{ fontSize: 12, color: '#BF360C', marginTop: 2, lineHeight: 1.4 }}>
              {t('home.premiumBannerSub')} {t('subscription.price')}
            </div>
          </div>
          <span style={{ fontSize: 16, color: 'var(--warning)' }}>→</span>
        </button>
      )}

      {/* Module cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ⚽ Training */}
        <button
          onClick={() => navigate({ name: 'training-home' })}
          style={{
            background: 'var(--primary)', borderRadius: 22, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(var(--primary-rgb, 0,100,0),.20)', width: '100%',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 44 }}>⚽</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>{t('home.training')}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              {t('home.trainingDesc')}
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 16px',
            fontWeight: 700, fontSize: 15, textAlign: 'center',
          }}>
            {t('common.open')}
          </div>
        </button>

        {/* 🏆 Tournament */}
        <button
          onClick={() => navigate({ name: 'tournament-list' })}
          style={{
            background: 'linear-gradient(135deg, #E65100 0%, #FF6F00 100%)',
            borderRadius: 22, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(230,81,0,.25)', width: '100%',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 44 }}>🏆</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>{t('home.tournament')}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              {t('home.tournamentDesc')}
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 16px',
            fontWeight: 700, fontSize: 15, textAlign: 'center',
          }}>
            {t('common.open')}
          </div>
        </button>

        {/* 📋 Match */}
        <button
          onClick={() => navigate({ name: 'match-list' })}
          style={{
            background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
            borderRadius: 22, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(21,101,192,.25)', width: '100%',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 44 }}>📋</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>{t('home.match')}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              {t('home.matchDesc')}
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 16px',
            fontWeight: 700, fontSize: 15, textAlign: 'center',
          }}>
            {t('common.open')}
          </div>
        </button>

        {/* 🏟 My Club */}
        <button
          onClick={() => navigate({ name: 'clubs' })}
          style={{
            background: 'linear-gradient(135deg, #4A148C 0%, #7B1FA2 100%)',
            borderRadius: 22, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(74,20,140,.25)', width: '100%',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 44 }}>🏟</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>{t('home.club')}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              {t('home.clubDesc')}
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 16px',
            fontWeight: 700, fontSize: 15, textAlign: 'center',
          }}>
            {t('common.open')}
          </div>
        </button>

      </div>

      {/* PWA install prompt */}
      {canInstall && (
        <div style={{ padding: '0 20px 8px', textAlign: 'center' }}>
          <button
            onClick={install}
            style={{
              background: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 100%)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              padding: '12px 24px', borderRadius: 12, border: 'none',
              cursor: 'pointer', width: '100%', maxWidth: 400,
              boxShadow: '0 2px 8px rgba(27,94,32,.3)',
            }}
          >
            📲 {t('app.installPWA')}
          </button>
        </div>
      )}

      {/* Beta notice + feedback */}
      <div style={{
        textAlign: 'center', padding: '16px 0 4px', fontSize: 12,
        color: 'var(--text-muted)', lineHeight: 1.5,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          display: 'inline-block', background: 'var(--surface-var)',
          borderRadius: 8, padding: '6px 14px',
          border: '1px solid var(--border)', opacity: 0.7,
        }}>
          🚧 {t('home.betaNotice')}
        </span>
        <a
          href={`mailto:feedback@torq.cz?subject=${encodeURIComponent(t('settings.feedbackSubject'))}`}
          style={{ color: 'var(--text-muted)', textDecoration: 'underline', opacity: 0.6, fontSize: 12 }}
        >
          {t('home.feedbackLink')}
        </a>
      </div>

    </div>
    </>
  );
}

// ─── Desktop dashboard helpers ──────────────────────────────────────────────
const listRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  width: '100%', textAlign: 'left', cursor: 'pointer',
};

const liveCardStyle: React.CSSProperties = {
  background: 'var(--surface-var)',
  borderRadius: 12, padding: '12px 14px',
  display: 'flex', alignItems: 'center', gap: 12,
  width: '100%', textAlign: 'left',
  border: '1px solid var(--border)', cursor: 'pointer',
};

const liveScoreStyle: React.CSSProperties = {
  fontWeight: 900, fontSize: 18, color: 'var(--text)',
  background: 'var(--surface)', borderRadius: 8, padding: '4px 10px',
  flexShrink: 0,
};

function liveBadgeStyle(bg: string): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 800, color: '#fff', background: bg,
    padding: '3px 8px', borderRadius: 6, letterSpacing: 0.5, flexShrink: 0,
  };
}

function DashSection({ title, action, children }: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{
          fontSize: 12, fontWeight: 800, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: 0.6, flex: 1,
        }}>
          {title}
        </h2>
        {action && (
          <button
            onClick={action.onClick}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--primary)', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', padding: 0,
            }}
          >
            {action.label} →
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{
      padding: '24px 16px', textAlign: 'center',
      color: 'var(--text-muted)', fontSize: 13,
      background: 'var(--surface-var)', borderRadius: 10,
      border: '1px dashed var(--border)',
    }}>
      {text}
    </div>
  );
}
