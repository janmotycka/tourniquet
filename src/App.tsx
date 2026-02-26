import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { I18nProvider, useI18n } from './i18n';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { TrainingHomePage } from './pages/TrainingHomePage';
import { GeneratorPage } from './pages/generator/GeneratorPage';
import { TrainingDetailPage } from './pages/TrainingDetailPage';
import { SavedPage } from './pages/SavedPage';
import { ExerciseLibraryPage } from './pages/ExerciseLibraryPage';
import { ManualBuilderPage } from './pages/ManualBuilderPage';
import { CalendarPage } from './pages/CalendarPage';
import { TournamentListPage } from './pages/tournament/TournamentListPage';
import { CreateTournamentPage } from './pages/tournament/CreateTournamentPage';
import { TournamentDetailPage } from './pages/tournament/TournamentDetailPage';
import { TournamentPublicView } from './pages/tournament/TournamentPublicView';
import { ClubsPage } from './pages/tournament/ClubsPage';
import { MatchListPage } from './pages/match/MatchListPage';
import { CreateMatchPage } from './pages/match/CreateMatchPage';
import { MatchDetailPage } from './pages/match/MatchDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { parseTournamentHashFromUrl } from './utils/qr-code';
import { useTournamentStore } from './store/tournament.store';
import { useSubscriptionStore } from './store/subscription.store';
import type { TrainingUnit } from './types/training.types';

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
  | { name: 'clubs' }
  | { name: 'match-list' }
  | { name: 'match-create' }
  | { name: 'match-detail'; matchId: string }
  | { name: 'settings' };

// Hash-based deep linking — pokud URL obsahuje #tournament=xxx, otevře public view
function getInitialPage(): Page {
  const tournamentId = parseTournamentHashFromUrl();
  if (tournamentId) {
    return { name: 'tournament-public', tournamentId };
  }
  return { name: 'home' };
}

// ─── Vnitřní router (vyžaduje auth, kromě public view) ───────────────────────

function AppRouter() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const loadFromFirebase = useTournamentStore(s => s.loadFromFirebase);
  const setFirebaseUid = useTournamentStore(s => s.setFirebaseUid);
  const subscribeToStatus = useSubscriptionStore(s => s.subscribeToStatus);
  const [page, setPage] = useState<Page>(getInitialPage);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // ── Join intent — přežije přesměrování na login ──
  const [joinIntent, setJoinIntent] = useState<{ tournamentId: string } | null>(null);

  // ── Admin join — detekce ?join=1 v URL ──
  const [adminJoin, setAdminJoin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join') === '1';
  });

  // Po přihlášení načteme data z Firebase + subscription listener
  useEffect(() => {
    if (user) {
      loadFromFirebase(user.uid);
      const unsubscribe = subscribeToStatus(user.uid);
      return () => unsubscribe();
    } else {
      setFirebaseUid(null);
    }
  }, [user, loadFromFirebase, setFirebaseUid, subscribeToStatus]);

  // Po přihlášení + existuje joinIntent → přesměrovat zpět na public view
  // joinIntent je v deps: funguje i když je user již přihlášen při nastavení intentu
  useEffect(() => {
    if (user && joinIntent) {
      navigate({ name: 'tournament-public', tournamentId: joinIntent.tournamentId });
    }
  // navigate záměrně není v deps — volá jen setPage (stabilní useState setter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, joinIntent]);

  // Zpracování ?payment=success query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setPaymentSuccess(true);
      // Vyčistit URL
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      // Automaticky skrýt po 5s
      setTimeout(() => setPaymentSuccess(false), 5000);
    }
  }, []);

  const navigate = (p: Page) => {
    if (p.name === 'tournament-public') {
      window.location.hash = `tournament=${p.tournamentId}`;
    } else if (window.location.hash.startsWith('#tournament=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setPage(p);
  };

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
      {/* Payment success toast */}
      {paymentSuccess && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#1B5E20', color: '#fff', padding: '12px 24px', borderRadius: 12,
          fontWeight: 700, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,.25)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>🎉</span> {t('app.premiumActivated')}
        </div>
      )}

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
      {page.name === 'settings' && <SettingsPage navigate={navigate} />}
    </div>
  );
}

// ─── Root: AuthProvider obaluje vše ──────────────────────────────────────────

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </I18nProvider>
  );
}
