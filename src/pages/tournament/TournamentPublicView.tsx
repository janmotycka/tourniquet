import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../../App';
import { logger } from '../../utils/logger';
import { useTournamentStore } from '../../store/tournament.store';
import type { Tournament } from '../../types/tournament.types';
import { subscribeToPublicTournament } from '../../services/tournament.firebase';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';

import {
  PublicViewErrorBoundary,
  PublicHeader,
  TeamFilterBar,
  PublicStandings,
  PublicResults,
  PublicScorers,
  PublicChat,
  PublicRules,
  JoinPinModal,
  LeaveConfirmModal,
} from '../../components/tournament/public';

interface Props {
  tournamentId: string;
  navigate: (p: Page) => void;
  onJoinIntent?: (tournamentId: string) => void;
  joinIntent?: boolean;
  clearJoinIntent?: () => void;
  adminJoin?: boolean;
  clearAdminJoin?: () => void;
}

type Tab = 'standings' | 'results' | 'scorers' | 'rules' | 'chat';

// ─── Main ─────────────────────────────────────────────────────────────────────
export function TournamentPublicView(props: Props) {
  return (
    <PublicViewErrorBoundary tournamentId={props.tournamentId}>
      <TournamentPublicViewInner {...props} />
    </PublicViewErrorBoundary>
  );
}

function TournamentPublicViewInner({ tournamentId, navigate, onJoinIntent, joinIntent, clearJoinIntent, adminJoin, clearAdminJoin }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('results');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  // Firebase real-time listener — zobrazuje živá data bez přihlášení
  const localTournament = useTournamentStore(s => s.getTournamentById(tournamentId));
  const [firebaseTournament, setFirebaseTournament] = useState<Tournament | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(true);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  useEffect(() => {
    setFirebaseLoading(true);
    setFirebaseError(null);
    logger.debug('[PublicView] Subscribing to tournament:', tournamentId);
    const unsubscribe = subscribeToPublicTournament(
      tournamentId,
      (data) => {
        logger.debug('[PublicView] Data received:', data ? 'tournament loaded' : 'null (not found)');
        if (data) {
          logger.debug('[PublicView] Teams:', data.teams?.length, 'Matches:', data.matches?.length);
        }
        setFirebaseTournament(data);
        setFirebaseLoading(false);
        setLastRefresh(new Date());
      },
      (error) => {
        logger.error('[PublicView] Firebase error:', error.message);
        setFirebaseError(error.message);
        setFirebaseLoading(false);
      }
    );
    return unsubscribe;
  }, [tournamentId]);

  // Preferujeme Firebase data, fallback na lokální (pro případ offline)
  const tournament = firebaseTournament ?? localTournament;

  // ── Join as referee flow ────────────────────────────────────────────────────
  const { user } = useAuth();
  const joinTournament = useTournamentStore(s => s.joinTournament);
  const leaveTournament = useTournamentStore(s => s.leaveTournament);
  const isOwner = useTournamentStore(s => s.isOwner);
  const hasJoined = useTournamentStore(s => s.joinedTournaments.some(jt => jt.id === tournamentId));
  const isTournamentOwner = user ? isOwner(tournamentId) : false;
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinPin, setJoinPin] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Auto-open PIN modal when returning from login with intent, or when ?join=1 in URL
  useEffect(() => {
    if (user && joinIntent) {
      setShowJoinModal(true);
    }
  }, [user, joinIntent]);

  useEffect(() => {
    // Vždy vyčistit ?join=1 z URL — i pro ownera, aby nedošlo k náhodnému
    // sdílení admin odkazu místo veřejného odkazu pro hosty
    const url = new URL(window.location.href);
    if (url.searchParams.has('join')) {
      url.searchParams.delete('join');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    if (adminJoin && !isTournamentOwner && !hasJoined) {
      if (user) {
        // Přihlášený → rovnou zobrazit PIN modal
        setShowJoinModal(true);
      } else {
        // Nepřihlášený → uložit intent a přesměrovat na login
        onJoinIntent?.(tournamentId);
        navigate({ name: 'home' });
      }
    }
    clearAdminJoin?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminJoin]);

  const handleLeave = async () => {
    await leaveTournament(tournamentId);
    setShowLeaveConfirm(false);
  };

  const handleJoinSubmit = async () => {
    if (!/^\d{6}$/.test(joinPin)) {
      setJoinError(t('tournament.public.joinPinError'));
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const result = await joinTournament(tournamentId, joinPin);
      if (result.success) {
        clearJoinIntent?.();
        navigate({ name: 'tournament-detail', tournamentId });
      } else {
        setJoinError(result.error ?? t('tournament.public.joinFailed'));
      }
    } catch {
      setJoinError(t('tournament.public.joinFailed'));
    } finally {
      setJoining(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setLastRefresh(new Date());
  }, []);

  const timeSince = Math.round((Date.now() - lastRefresh.getTime()) / 1000);
  const timeSinceLabel = timeSince < 10
    ? t('tournament.public.justNow')
    : timeSince < 60
    ? t('tournament.public.secondsAgo', { count: timeSince })
    : t('tournament.public.minutesAgo', { count: Math.round(timeSince / 60) });

  // ── Loading / Error / Not Found states ────────────────────────────────────
  if (firebaseLoading && !tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>⏳</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('tournament.public.loading')}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14 }}>{t('tournament.public.connecting')}</p>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 11, marginTop: 8 }}>ID: {tournamentId}</p>
      </div>
    );
  }

  if (firebaseError && !tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center', color: '#C62828' }}>{t('tournament.public.connectionError')}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          {t('publicView.loadFailed')}
        </p>
        <pre style={{ fontSize: 11, color: '#C62828', background: '#FFEBEE', padding: '8px 12px', borderRadius: 8, maxWidth: '100%', overflow: 'auto', textAlign: 'left' }}>
          {firebaseError}
        </pre>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 11 }}>ID: {tournamentId}</p>
        <button onClick={() => navigate({ name: 'home' })} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15,
          padding: '12px 24px', borderRadius: 12, marginTop: 8,
        }}>{t('tournament.public.backHome')}</button>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('tournament.public.notFound')}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          {t('tournament.public.notFoundDesc')}
        </p>
        <button onClick={() => navigate({ name: 'home' })} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15,
          padding: '12px 24px', borderRadius: 12,
        }}>{t('tournament.public.backHome')}</button>
      </div>
    );
  }

  // ── Render tournament view ────────────────────────────────────────────────
  const liveMatch = tournament.matches.find(m => m.status === 'live');
  const scorersVisible = tournament.settings.scorersVisible ?? true;
  const chatEnabled = tournament.settings.chatEnabled ?? false;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'results', label: t('tournament.public.results') },
    { id: 'standings', label: t('tournament.public.standings') },
    ...(scorersVisible ? [{ id: 'scorers' as Tab, label: t('tournament.public.scorers') }] : []),
    { id: 'rules', label: t('tournament.public.rules') },
    ...(chatEnabled ? [{ id: 'chat' as Tab, label: `💬 ${t('tournament.chat.title')}` }] : []),
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header + live banner + tab bar */}
      <PublicHeader
        tournament={tournament}
        tournamentId={tournamentId}
        navigate={navigate}
        isTournamentOwner={isTournamentOwner}
        hasJoined={hasJoined}
        onShowLeaveConfirm={() => setShowLeaveConfirm(true)}
        liveMatch={liveMatch}
        tab={tab}
        setTab={setTab}
        tabs={TABS}
      />

      {/* Team filter bar — jen na záložce Výsledky */}
      {tab === 'results' && tournament.teams.length > 1 && (
        <TeamFilterBar
          tournament={tournament}
          selectedTeamId={selectedTeamId}
          onSelect={setSelectedTeamId}
        />
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'standings' && <PublicStandings tournament={tournament} selectedTeamId={null} />}
        {tab === 'results' && <PublicResults tournament={tournament} selectedTeamId={selectedTeamId} />}
        {tab === 'scorers' && scorersVisible && <PublicScorers tournament={tournament} />}
        {tab === 'rules' && <PublicRules tournament={tournament} />}
        {tab === 'chat' && chatEnabled && <PublicChat tournamentId={tournament.id} />}
      </div>

      {/* Refresh footer */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
          {t('tournament.public.lastUpdate')}: {timeSinceLabel}
        </span>
        <button onClick={handleRefresh} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
          padding: '8px 16px', borderRadius: 10,
        }}>
          {t('tournament.public.refresh')}
        </button>
      </div>

      {/* ── PIN Modal ── */}
      {showJoinModal && (
        <JoinPinModal
          joinPin={joinPin}
          setJoinPin={setJoinPin}
          joinError={joinError}
          setJoinError={setJoinError}
          joining={joining}
          onSubmit={handleJoinSubmit}
          onClose={() => { setShowJoinModal(false); setJoinPin(''); setJoinError(''); clearJoinIntent?.(); }}
        />
      )}

      {/* ── Leave confirm modal ── */}
      {showLeaveConfirm && (
        <LeaveConfirmModal
          onLeave={handleLeave}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </div>
  );
}
