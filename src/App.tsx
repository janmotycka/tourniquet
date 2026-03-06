import { useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { I18nProvider, useI18n } from './i18n';
import { ThemeProvider } from './theme/ThemeContext';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { TournamentPublicView } from './pages/tournament/TournamentPublicView';
import { RosterFormPage } from './pages/tournament/RosterFormPage';
import { OnboardingModal } from './components/OnboardingModal';
import { ToastContainer } from './components/ToastContainer';
import { CookieConsent } from './components/CookieConsent';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ConfirmModal } from './components/ConfirmModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTournamentStore } from './store/tournament.store';
import { useSubscriptionStore } from './store/subscription.store';
import { useToastStore } from './store/toast.store';
import { usePageStore } from './store/page.store';
import { useContactsStore } from './store/contacts.store';
import { useMatchesStore } from './store/matches.store';
import { useTemplatesStore } from './store/templates.store';
import { useClubsStore } from './store/clubs.store';
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
const CreateTournamentPage = lazy(() => import('./pages/tournament/CreateTournamentPage').then(m => ({ default: m.CreateTournamentPage })));
const TournamentDetailPage = lazy(() => import('./pages/tournament/TournamentDetailPage').then(m => ({ default: m.TournamentDetailPage })));
const ClubsPage = lazy(() => import('./pages/tournament/ClubsPage').then(m => ({ default: m.ClubsPage })));
const MatchListPage = lazy(() => import('./pages/match/MatchListPage').then(m => ({ default: m.MatchListPage })));
const CreateMatchPage = lazy(() => import('./pages/match/CreateMatchPage').then(m => ({ default: m.CreateMatchPage })));
const MatchDetailPage = lazy(() => import('./pages/match/MatchDetailPage').then(m => ({ default: m.MatchDetailPage })));
const MatchStatsPage = lazy(() => import('./pages/match/MatchStatsPage').then(m => ({ default: m.MatchStatsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage').then(m => ({ default: m.TermsOfServicePage })));

export type Page =
  | { name: 'home' }
  | { name: 'training-home' }
  | { name: 'generator' }
  | { name: 'training'; training: TrainingUnit }
  | { name: 'saved' }
  | { name: 'library' }
  | { name: 'manual-builder' }
  | { name: 'calendar' }
  | { name: 'tournament-list' }
  | { name: 'tournament-create' }
  | { name: 'tournament-detail'; tournamentId: string }
  | { name: 'tournament-public'; tournamentId: string }
  | { name: 'roster-form'; tournamentId: string; teamToken: string }
  | { name: 'clubs' }
  | { name: 'match-list' }
  | { name: 'match-create' }
  | { name: 'match-detail'; matchId: string }
  | { name: 'match-stats' }
  | { name: 'settings' }
  | { name: 'privacy-policy' }
  | { name: 'terms-of-service' };

// ─── Fallback spinner pro Suspense ──────────────────────────────────────────

function PageSpinner() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 200, flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 32 }}>⚽</div>
    </div>
  );
}

// ─── Vnitřní router (vyžaduje auth, kromě public view) ───────────────────────

function AppRouter() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const loadFromFirebase = useTournamentStore(s => s.loadFromFirebase);
  const setFirebaseUid = useTournamentStore(s => s.setFirebaseUid);
  const subscribeToStatus = useSubscriptionStore(s => s.subscribeToStatus);
  const showToast = useToastStore(s => s.show);
  const loadContacts = useContactsStore(s => s.loadFromFirebase);
  const loadMatches = useMatchesStore(s => s.loadFromFirebase);
  const setMatchesFirebaseUid = useMatchesStore(s => s.setFirebaseUid);
  const loadTemplates = useTemplatesStore(s => s.loadFromFirebase);
  const loadClubs = useClubsStore(s => s.loadFromFirebase);
  const setClubsFirebaseUid = useClubsStore(s => s.setFirebaseUid);

  const { page, setPage, joinIntent, setJoinIntent, adminJoin, setAdminJoin } = usePageStore();

  const navigate = (p: Page) => {
    if (p.name === 'tournament-public') {
      window.location.hash = `tournament=${p.tournamentId}`;
    } else if (window.location.hash.startsWith('#tournament=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setPage(p);
  };

  // Po přihlášení načteme data z Firebase + subscription listener + kontakty
  useEffect(() => {
    if (user) {
      loadFromFirebase(user.uid);
      loadContacts(user.uid);
      loadMatches(user.uid);
      loadTemplates(user.uid);
      loadClubs(user.uid);
      const unsubscribe = subscribeToStatus(user.uid);
      return () => unsubscribe();
    } else {
      setFirebaseUid(null);
      setMatchesFirebaseUid(null);
      setClubsFirebaseUid(null);
    }
  }, [user, loadFromFirebase, setFirebaseUid, subscribeToStatus, loadContacts, loadMatches, setMatchesFirebaseUid, loadTemplates, loadClubs, setClubsFirebaseUid]);

  // Po přihlášení + existuje joinIntent → přesměrovat zpět na public view
  useEffect(() => {
    if (user && joinIntent) {
      navigate({ name: 'tournament-public', tournamentId: joinIntent.tournamentId });
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
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Načítání Firebase auth stavu
  if (loading) {
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

  // Roster form — trenér vyplní soupisku, nevyžaduje přihlášení
  if (page.name === 'roster-form') {
    return (
      <RosterFormPage
        tournamentId={page.tournamentId}
        teamToken={page.teamToken}
        navigate={navigate}
      />
    );
  }

  // Public view nevyžaduje přihlášení — diváci a rodiče
  if (page.name === 'tournament-public') {
    return (
      <TournamentPublicView
        tournamentId={page.tournamentId}
        navigate={navigate}
        onJoinIntent={(tid) => setJoinIntent({ tournamentId: tid })}
        joinIntent={joinIntent?.tournamentId === page.tournamentId}
        clearJoinIntent={() => setJoinIntent(null)}
        adminJoin={adminJoin}
        clearAdminJoin={() => setAdminJoin(false)}
      />
    );
  }

  // Ostatní stránky vyžadují přihlášení
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <OnboardingModal navigate={navigate} />

      <Suspense fallback={<PageSpinner />}>
        {page.name === 'home' && <HomePage navigate={navigate} />}
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
        {page.name === 'tournament-create' && <CreateTournamentPage navigate={navigate} />}
        {page.name === 'tournament-detail' && (
          <TournamentDetailPage tournamentId={page.tournamentId} navigate={navigate} />
        )}
        {page.name === 'clubs' && <ClubsPage navigate={navigate} />}
        {page.name === 'match-list' && <MatchListPage navigate={navigate} />}
        {page.name === 'match-create' && <CreateMatchPage navigate={navigate} />}
        {page.name === 'match-detail' && <MatchDetailPage matchId={page.matchId} navigate={navigate} />}
        {page.name === 'match-stats' && <MatchStatsPage navigate={navigate} />}
        {page.name === 'settings' && <SettingsPage navigate={navigate} />}
        {page.name === 'privacy-policy' && <PrivacyPolicyPage navigate={navigate} />}
        {page.name === 'terms-of-service' && <TermsOfServicePage navigate={navigate} />}
      </Suspense>
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
            <CookieConsent onPrivacyPolicy={() => usePageStore.getState().setPage({ name: 'privacy-policy' })} />
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
