import { useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { I18nProvider, useI18n } from './i18n';
import { ThemeProvider } from './theme/ThemeContext';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { HomePage } from './pages/HomePage';
import { ToastContainer } from './components/ToastContainer';
import { CookieConsent } from './components/CookieConsent';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ConfirmModal } from './components/ConfirmModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { JoinClubModal } from './components/clubs/JoinClubModal';
import { JoinMatchPairingModal } from './components/match/JoinMatchPairingModal';
import { useTournamentStore } from './store/tournament.store';
import { useSubscriptionStore } from './store/subscription.store';
import { useToastStore } from './store/toast.store';
import { usePageStore } from './store/page.store';
import { useContactsStore } from './store/contacts.store';
import { useMatchesStore } from './store/matches.store';
import { useSimpleSquadsStore } from './store/simpleSquads.store';
import { logger } from './utils/logger';
import { track, sanitizeEventKey } from './services/analytics';
import { useTemplatesStore } from './store/templates.store';
import { useClubsStore } from './store/clubs.store';
import { useTrainingsStore } from './store/trainings.store';
import type { TrainingUnit } from './types/training.types';

// ─── Lazy-loaded stránky (sekundární, ne na kritické cestě) ─────────────────
const TrainingHomePage = lazy(() => import('./pages/TrainingHomePage').then(m => ({ default: m.TrainingHomePage })));
const GeneratorPage = lazy(() => import('./pages/generator/GeneratorPage').then(m => ({ default: m.GeneratorPage })));
const TrainingDetailPage = lazy(() => import('./pages/TrainingDetailPage').then(m => ({ default: m.TrainingDetailPage })));
const SavedPage = lazy(() => import('./pages/SavedPage').then(m => ({ default: m.SavedPage })));
const ExerciseLibraryPage = lazy(() => import('./pages/ExerciseLibraryPage').then(m => ({ default: m.ExerciseLibraryPage })));
const ManualBuilderPage = lazy(() => import('./pages/ManualBuilderPage').then(m => ({ default: m.ManualBuilderPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })));
const TournamentListPage = lazy(() => import('./pages/tournament/TournamentListPage').then(m => ({ default: m.TournamentListPage })));
const TournamentWizardPage = lazy(() => import('./pages/tournament/TournamentWizardPage').then(m => ({ default: m.TournamentWizardPage })));
const TournamentDetailPage = lazy(() => import('./pages/tournament/TournamentDetailPage').then(m => ({ default: m.TournamentDetailPage })));
const ClubsPage = lazy(() => import('./pages/tournament/ClubsPage').then(m => ({ default: m.ClubsPage })));
const MatchListPage = lazy(() => import('./pages/match/MatchListPage').then(m => ({ default: m.MatchListPage })));
const QuickMatchPage = lazy(() => import('./pages/match/QuickMatchPage').then(m => ({ default: m.QuickMatchPage })));
const MatchDetailPage = lazy(() => import('./pages/match/MatchDetailPage').then(m => ({ default: m.MatchDetailPage })));
const MatchStatsPage = lazy(() => import('./pages/match/MatchStatsPage').then(m => ({ default: m.MatchStatsPage })));

const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const ClubMembersPage = lazy(() => import('./pages/ClubMembersPage').then(m => ({ default: m.ClubMembersPage })));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage').then(m => ({ default: m.TermsOfServicePage })));
const TournamentPublicView = lazy(() => import('./pages/tournament/TournamentPublicView').then(m => ({ default: m.TournamentPublicView })));
const RosterFormPage = lazy(() => import('./pages/tournament/RosterFormPage').then(m => ({ default: m.RosterFormPage })));
const RegistrationFormPage = lazy(() => import('./pages/tournament/RegistrationFormPage').then(m => ({ default: m.RegistrationFormPage })));
const MatchPublicView = lazy(() => import('./pages/match/MatchPublicView').then(m => ({ default: m.MatchPublicView })));

export type Page =
  | { name: 'home' }
  | { name: 'public-feed' }
  | { name: 'login' }
  | { name: 'training-home' }
  | { name: 'generator' }
  | { name: 'training'; training: TrainingUnit }
  | { name: 'saved' }
  | { name: 'library' }
  | { name: 'manual-builder' }
  | { name: 'calendar' }
  | { name: 'tournament-list' }
  | { name: 'tournament-wizard' }
  | { name: 'tournament-detail'; tournamentId: string }
  | { name: 'tournament-public'; tournamentId: string }
  | { name: 'roster-form'; tournamentId: string; teamToken: string }
  | { name: 'registration-form'; tournamentId: string }
  | { name: 'clubs' }
  | { name: 'club-members' }
  | { name: 'match-list' }
  | { name: 'match-quick'; prefillFromMatchId?: string; prefillSquadId?: string }
  | { name: 'match-detail'; matchId: string; initialTab?: 'live' | 'lineup' | 'ratings' }
  | { name: 'match-public'; matchId: string }
  | { name: 'match-stats' }
  | { name: 'settings' }
  | { name: 'admin' }
  | { name: 'privacy-policy' }
  | { name: 'terms-of-service' };

// ─── Fallback spinner pro Suspense ──────────────────────────────────────────

function PageSpinner() {
  const icon = '⚽';
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 200, flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
    </div>
  );
}

// ─── Vnitřní router (vyžaduje auth, kromě public view) ───────────────────────

function AppRouter() {
  const { user, loading, signInAnonymously } = useAuth();
  const { t } = useI18n();
  const loadFromFirebase = useTournamentStore(s => s.loadFromFirebase);
  const subscribeTournaments = useTournamentStore(s => s.subscribeToFirebase);
  const setFirebaseUid = useTournamentStore(s => s.setFirebaseUid);
  const subscribeToStatus = useSubscriptionStore(s => s.subscribeToStatus);
  const showToast = useToastStore(s => s.show);
  const loadContacts = useContactsStore(s => s.loadFromFirebase);
  const subscribeMatches = useMatchesStore(s => s.subscribeToFirebase);
  const retryPendingSync = useMatchesStore(s => s.retryPendingSync);
  const setMatchesFirebaseUid = useMatchesStore(s => s.setFirebaseUid);
  const subscribeSimpleSquads = useSimpleSquadsStore(s => s.subscribeToFirebase);
  const setSimpleSquadsFirebaseUid = useSimpleSquadsStore(s => s.setFirebaseUid);
  const loadTemplates = useTemplatesStore(s => s.loadFromFirebase);
  const loadClubs = useClubsStore(s => s.loadFromFirebase);
  const setClubsFirebaseUid = useClubsStore(s => s.setFirebaseUid);
  const subscribeTrainings = useTrainingsStore(s => s.subscribeToFirebase);
  const setTrainingsFirebaseUid = useTrainingsStore(s => s.setFirebaseUid);

  const { page, setPage, joinIntent, setJoinIntent, adminJoin, setAdminJoin, adminJoinRole, setAdminJoinRole, clubJoinIntent, matchPairingIntent } = usePageStore();

  // Audit 2026-06-11: URL/hash + history entry teď řeší store.setPage centrálně
  // (pageToUrl + pushState) — kvůli hardware back na Androidu. navigate už jen
  // deleguje + scrollne nahoru.
  const navigate = (p: Page) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  // Členství v klubech — určuje scope pro multi-trainer sdílení zápasů.
  // Když přibude/ubere klub → znovu subscribneme matches ve všech scope.
  const memberOfClubs = useClubsStore(s => s.memberOfClubs);
  // Stable string ref pro useEffect deps. Pipe oddělovač protože clubId
  // teoreticky může obsahovat čárku (Firebase push-id obvykle ne, ale zbytečně
  // fragilní; pipe v Firebase push-id neexistuje).
  const memberClubIdsKey = Object.keys(memberOfClubs).sort().join('|');

  // Po přihlášení načteme data z Firebase + subscription listener + kontakty
  // Anonymní uživatelé (spolupořadatelé) potřebují jen firebaseUid pro joinTournament
  useEffect(() => {
    if (user) {
      if (user.isAnonymous) {
        setFirebaseUid(user.uid);
      } else {
        loadFromFirebase(user.uid);
        loadContacts(user.uid);
        setMatchesFirebaseUid(user.uid); // set UID early so sync works even if load fails
        const unsubscribeTournaments = subscribeTournaments(user.uid);
        loadTemplates(user.uid);
        void loadClubs(user.uid);
        // Realtime subscribe pro tréninky (sync mezi zařízeními)
        const unsubscribeTrainings = subscribeTrainings(user.uid);
        const unsubscribeStatus = subscribeToStatus(user.uid);
        // Simple squads — lehké soupisky pro Simple mode (McDonald's cup scénář)
        const unsubscribeSimpleSquads = subscribeSimpleSquads(user.uid);
        return () => {
          unsubscribeTournaments();
          unsubscribeTrainings();
          unsubscribeStatus();
          unsubscribeSimpleSquads();
        };
      }
    } else {
      setFirebaseUid(null);
      setMatchesFirebaseUid(null);
      setSimpleSquadsFirebaseUid(null);
      setClubsFirebaseUid(null);
      setTrainingsFirebaseUid(null);
    }
  }, [user, loadFromFirebase, setFirebaseUid, subscribeToStatus, loadContacts, subscribeTournaments, setMatchesFirebaseUid, subscribeSimpleSquads, setSimpleSquadsFirebaseUid, loadTemplates, loadClubs, setClubsFirebaseUid, subscribeTrainings, setTrainingsFirebaseUid]);

  // Matches subscription musí reagovat na změnu klubového členství —
  // když user vstoupí do sdíleného klubu, musíme začít poslouchat jeho matches.
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    // Scope = [auth uid (legacy per-user), ...clubIds]
    const scopes = [user.uid, ...Object.keys(memberOfClubs)];
    const unsubscribe = subscribeMatches(scopes);
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.isAnonymous, memberClubIdsKey, subscribeMatches]);

  // Analytika: start přihlášené session (1× per session, audit 2026-06-10)
  useEffect(() => {
    if (!user) return;
    track('app_open', { oncePerSession: true });
  }, [user]);

  // Když prohlížeč obnoví spojení → retry pending match syncs (offline write queue)
  useEffect(() => {
    const handleOnline = () => {
      logger.debug('[App] Back online — retrying pending sync');
      retryPendingSync();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [retryPendingSync]);

  // Pozn.: flush persistované offline fronty po reopenu řeší matches store sám —
  // subscribeToFirebase spustí retryPendingSync až po PRVNÍM serverovém snapshotu
  // (reconciliace), takže se nepřepíše zápas smazaný na jiném zařízení. Eager
  // retry odsud by tu reconciliaci obešel (boot-flush-race audit 2026-06-16).

  // Po přihlášení + existuje joinIntent → přesměrovat zpět na public view.
  // joinIntent hned vynulovat — jinak by efekt reaktivně přefíroval (a znovu
  // pushnul history entry) při každém popstate, který obnoví stav s živým
  // intentem (audit 2026-06-11, lens deeplink-boot).
  useEffect(() => {
    if (user && joinIntent) {
      navigate({ name: 'tournament-public', tournamentId: joinIntent.tournamentId });
      setJoinIntent(null);
    }
  // navigate záměrně není v deps — volá jen setPage (stabilní useState setter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, joinIntent]);

  // Zpracování ?payment=success query param → toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      showToast('success', t('app.premiumActivated'), 6000);
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pozn. (audit 2026-07-10): globální simple/advanced režim smazán —
  // progressive disclosure ve formulářích ho nahradila už 2026-05-22.
  // Hash `#mode=simple` z viral bannerů dál funguje jako deep-link marker
  // (anonymní auto-signin + skip onboardingu níže), jen už nepřepíná UI.

  // Audit 2026-06-10 (growth audit P1): změřit přistání s ?ref=… — dosud se
  // parametr nastavoval, ale neměřil → viral funnel byl slepý. Track běží
  // PŘED auth efektem níže (ten ref z URL maže). 1× per session.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref) track(`ref_${sanitizeEventKey(ref)}`, { oncePerSession: true });
    } catch { /* analytika nikdy nesmí rozbít app */ }
  }, []);

  // Audit 2026-04-24 (Martina viral loop test):
  // Rodič, co kliknul na viral banner „Vytvořit zápas za 30 s" v public view,
  // končil na LoginPage (banner slibuje „bez přihlašování" → ale App.tsx:345
  // gate ho posílá na login). Fix: pokud user dorazí s deep-linkem
  // (?ref=public-match nebo #mode=simple), automaticky ho přihlásíme
  // anonymně — onboarding pak projde bez jediného kliku. Plné registraci
  // ho vystavíme jenom když bude chtít premium / cross-device sync.
  useEffect(() => {
    if (user) return; // už přihlášený (nebo anonymně) — nic neděláme
    if (loading) return; // čekáme na auth resolve
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const hash = window.location.hash || '';
    const hasDeepLink =
      ref === 'public-match' ||
      hash.includes('mode=simple') ||
      hash.includes('mode=advanced');
    if (!hasDeepLink) return;
    // Anonymně přihlásíme — AuthContext se postará o zbytek (firebaseUid atd.)
    void signInAnonymously().catch(err => {
      logger.error('[App] anonymous sign-in pro deep-link failed:', err);
    });
    // Cleanup ?ref= z URL, ať nezůstává v address baru po onboardingu
    // (hash #mode=simple je čistěno v OnboardingWizard po spotřebování).
    if (ref) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('ref');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      } catch { /* noop */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  // Sync body[data-page] for CSS hooks
  useEffect(() => {
    document.body.dataset.page = page.name;
    document.body.dataset.layoutMode = 'mobile';
  }, [page.name]);

  // Po přihlášení z login stránky přesměruj na home
  // (musí být PŘED early returns — React hooks nesmí měnit pořadí mezi rendery).
  // replace, ne push: 'login' je tranzientní stránka — kdyby v historii zůstala,
  // hardware back by na ni skočil, efekt by ji znovu přesměroval na home a back
  // by uvázl ve smyčce login↔home (audit 2026-06-11, 3 lensy).
  useEffect(() => {
    if (user && page.name === 'login') {
      setPage({ name: 'home' }, { replace: true });
    }
  }, [user, page.name, setPage]);

  // Veřejné stránky — nevyžadují přihlášení, renderují se i během načítání auth
  if (page.name === 'roster-form') {
    return (
      <Suspense fallback={<PageSpinner />}>
        <RosterFormPage
          tournamentId={page.tournamentId}
          teamToken={page.teamToken}
          navigate={navigate}
        />
      </Suspense>
    );
  }

  if (page.name === 'registration-form') {
    return (
      <Suspense fallback={<PageSpinner />}>
        <RegistrationFormPage
          tournamentId={page.tournamentId}
          navigate={navigate}
        />
      </Suspense>
    );
  }

  if (page.name === 'tournament-public') {
    return (
      <Suspense fallback={<PageSpinner />}>
        <TournamentPublicView
          tournamentId={page.tournamentId}
          navigate={navigate}
          onJoinIntent={(tid, role) => setJoinIntent({ tournamentId: tid, role })}
          joinIntent={joinIntent?.tournamentId === page.tournamentId}
          joinIntentRole={joinIntent?.role}
          clearJoinIntent={() => { setJoinIntent(null); setAdminJoinRole(undefined); }}
          adminJoin={adminJoin}
          adminJoinRole={adminJoinRole}
          clearAdminJoin={() => { setAdminJoin(false); setAdminJoinRole(undefined); }}
        />
      </Suspense>
    );
  }

  if (page.name === 'match-public') {
    return <Suspense fallback={<PageSpinner />}><MatchPublicView matchId={page.matchId} /></Suspense>;
  }

  // Deep-link detection — pro viral loop (Martina): pokud user dorazí s
  // ?ref=public-match nebo #mode=simple, nechceme ho ani na vteřinu přepadnout
  // LandingPage/LoginPage. Místo toho spinner „Zakládám anonymní účet…"
  // dokud anon sign-in (spouštěný v useEffect výše) neprojde.
  const hasViralDeepLink = (() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash || '';
    return params.get('ref') === 'public-match'
      || hash.includes('mode=simple')
      || hash.includes('mode=advanced');
  })();

  // Načítání Firebase auth stavu — jen pro autentizované stránky
  if (loading || (!user && hasViralDeepLink)) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100dvh', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>⚽</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>{t('app.loading')}</p>
      </div>
    );
  }

  // Ostatní stránky vyžadují přihlášení
  if (!user) {
    if (page.name === 'home') {
      return <LandingPage navigate={navigate} onLogin={() => setPage({ name: 'login' })} />;
    }
    return <LoginPage onBack={() => setPage({ name: 'home' })} />;
  }

  const pageContent = (
    <Suspense fallback={<PageSpinner />}>
      {(page.name === 'home' || page.name === 'login') && <HomePage navigate={navigate} />}
      {page.name === 'public-feed' && <LandingPage navigate={navigate} onLogin={() => setPage({ name: 'home' })} />}
      {page.name === 'training-home' && <TrainingHomePage navigate={navigate} />}
      {page.name === 'generator' && <GeneratorPage navigate={navigate} />}
      {page.name === 'training' && (
        <TrainingDetailPage training={page.training} navigate={navigate} />
      )}
      {page.name === 'saved' && <SavedPage navigate={navigate} />}
      {page.name === 'library' && <ExerciseLibraryPage navigate={navigate} />}
      {page.name === 'manual-builder' && <ManualBuilderPage navigate={navigate} />}
      {page.name === 'calendar' && <CalendarPage navigate={navigate} />}
      {page.name === 'tournament-list' && <TournamentListPage navigate={navigate} />}
      {/* Tournament create — sjednoceno na TournamentWizardPage (audit 2026-04-26);
          mrtvý legacy create-flow smazán 2026-07-09. */}
      {page.name === 'tournament-wizard' && <TournamentWizardPage navigate={navigate} />}
      {page.name === 'tournament-detail' && (
        <TournamentDetailPage tournamentId={page.tournamentId} navigate={navigate} />
      )}
      {page.name === 'clubs' && <ClubsPage navigate={navigate} />}
      {page.name === 'club-members' && <ClubMembersPage navigate={navigate} />}
      {page.name === 'match-list' && <MatchListPage navigate={navigate} />}
      {/* match-quick = full page wrapper kolem QuickMatchSheet (audit 2026-04-29)
          — jediný create flow pro zápas (CreateMatchPage smazána 2026-07-09).
          prefillFromMatchId — pokud uvedeno, předvyplní soupisku z minulého
          zápasu (rychlé „další zápas se stejnou sestavou"). */}
      {page.name === 'match-quick' && (
        <QuickMatchPage navigate={navigate} prefillFromMatchId={page.prefillFromMatchId} prefillSquadId={page.prefillSquadId} />
      )}
      {page.name === 'match-detail' && (
        <MatchDetailPage matchId={page.matchId} navigate={navigate} initialTab={page.initialTab} />
      )}
      {page.name === 'match-stats' && <MatchStatsPage navigate={navigate} />}
      {page.name === 'settings' && <SettingsPage navigate={navigate} />}
      {page.name === 'admin' && <AdminPage />}
      {page.name === 'privacy-policy' && <PrivacyPolicyPage navigate={navigate} />}
      {page.name === 'terms-of-service' && <TermsOfServicePage navigate={navigate} />}
    </Suspense>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <main style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {pageContent}
      </main>
      {clubJoinIntent && <JoinClubModal inviteId={clubJoinIntent.inviteId} />}
      {matchPairingIntent && user && !user.isAnonymous && (
        <JoinMatchPairingModal
          scopeId={matchPairingIntent.scopeId}
          matchId={matchPairingIntent.matchId}
          joinToken={matchPairingIntent.joinToken}
          navigate={navigate}
        />
      )}
    </div>
  );
}

// ─── Root: AuthProvider obaluje vše ──────────────────────────────────────────

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <ConnectionStatus />
            <ToastContainer />
            <ConfirmModal />
            <AppRouter />
            <PWAInstallBanner />
            <CookieConsent onPrivacyPolicy={() => usePageStore.getState().setPage({ name: 'privacy-policy' })} />
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
