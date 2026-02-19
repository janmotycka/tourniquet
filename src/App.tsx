import { useState } from 'react';
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
import { parseTournamentHashFromUrl } from './utils/qr-code';
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
  | { name: 'clubs' };

// Hash-based deep linking — pokud URL obsahuje #tournament=xxx, otevře public view
function getInitialPage(): Page {
  const tournamentId = parseTournamentHashFromUrl();
  if (tournamentId) {
    return { name: 'tournament-public', tournamentId };
  }
  return { name: 'home' };
}

export default function App() {
  const [page, setPage] = useState<Page>(getInitialPage);

  const navigate = (p: Page) => {
    // Při přechodu na public view nastavíme hash, jinak ho vymažeme
    if (p.name === 'tournament-public') {
      window.location.hash = `tournament=${p.tournamentId}`;
    } else if (window.location.hash.startsWith('#tournament=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setPage(p);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
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
      {page.name === 'tournament-public' && (
        <TournamentPublicView tournamentId={page.tournamentId} navigate={navigate} />
      )}
      {page.name === 'clubs' && <ClubsPage navigate={navigate} />}
    </div>
  );
}
