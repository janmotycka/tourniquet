import { useState, useEffect, useCallback, useRef } from 'react';
import type { Page } from '../../App';
import { logger } from '../../utils/logger';
import { track } from '../../services/analytics';
import { useTournamentStore } from '../../store/tournament.store';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import type { Tournament } from '../../types/tournament.types';
import { subscribeToPublicTournament, subscribeToChatMessages, subscribeMvpVotes } from '../../services/tournament.firebase';
import type { MvpVote } from '../../services/tournament.firebase';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { markPinVerified } from '../../utils/pin-hash';
import { computeStandings } from '../../utils/tournament-schedule';

import {
  PublicViewErrorBoundary,
  PublicHeader,
  TeamFilterBar,
  PublicStandings,
  PublicResults,
  PublicScorers,
  PublicChat,
  JoinPinModal,
  LeaveConfirmModal,
} from '../../components/tournament/public';
import { MvpVoting } from '../../components/tournament/public/MvpVoting';
import { ChatPollsList } from '../../components/tournament/public/ChatPollsList';
import { OfficialLinkButton } from '../../components/ui';
import { TennisTournamentPublicView } from '../../modules/tennis/pages/TennisTournamentPublicView';
import { translateAwardTitle } from '../../components/tournament/SettingsTab';

interface Props {
  tournamentId: string;
  navigate: (p: Page) => void;
  onJoinIntent?: (tournamentId: string, role?: 'admin') => void;
  joinIntent?: boolean;
  joinIntentRole?: 'admin';
  clearJoinIntent?: () => void;
  adminJoin?: boolean;
  adminJoinRole?: 'admin';
  clearAdminJoin?: () => void;
}

type Tab = 'standings' | 'results' | 'scorers' | 'chat';

// ─── Main ─────────────────────────────────────────────────────────────────────
export function TournamentPublicView(props: Props) {
  return (
    <PublicViewErrorBoundary tournamentId={props.tournamentId}>
      <TournamentPublicViewInner {...props} />
    </PublicViewErrorBoundary>
  );
}

function TournamentPublicViewInner({ tournamentId, navigate, onJoinIntent, joinIntent, joinIntentRole, clearJoinIntent, adminJoin, adminJoinRole, clearAdminJoin }: Props) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();
  const [tab, setTab] = useState<Tab>('results');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [mvpVotesMain, setMvpVotesMain] = useState<MvpVote[]>([]);

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

  // Analytika: divácká návštěva turnaje (anonymní denní čítač, audit 2026-06-10)
  useEffect(() => {
    track('public_tournament_view', { oncePerSession: true });
  }, []);

  // Subscribe na MVP hlasy (pro awards sekci — "Hráč, který zaujal diváky")
  useEffect(() => {
    const unsub = subscribeMvpVotes(tournamentId, setMvpVotesMain);
    return unsub;
  }, [tournamentId]);

  // Preferujeme Firebase data, fallback na lokální (pro případ offline)
  const tournament = firebaseTournament ?? localTournament;
  const isTennisTournament = !!(tournament && (tournament.sport ?? 'football') === 'tennis');

  // ── Join as referee flow ────────────────────────────────────────────────────
  const { user, signInAnonymously } = useAuth();
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
    // Vždy vyčistit ?join=1&role=admin z URL — i pro ownera, aby nedošlo k náhodnému
    // sdílení admin odkazu místo veřejného odkazu pro hosty
    const url = new URL(window.location.href);
    if (url.searchParams.has('join')) {
      url.searchParams.delete('join');
      url.searchParams.delete('role');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    if (adminJoin && !isTournamentOwner && !hasJoined) {
      if (user) {
        // Přihlášený → rovnou zobrazit PIN modal
        setShowJoinModal(true);
      } else {
        // Nepřihlášený → anonymní přihlášení, zůstat na stránce
        onJoinIntent?.(tournamentId, adminJoinRole);
        signInAnonymously();
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
      // Determine role: from URL param or from join intent
      const joinRole = adminJoinRole ?? joinIntentRole;
      const result = await joinTournament(tournamentId, joinPin, joinRole);
      if (result.success) {
        markPinVerified(tournamentId);
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

  // ── Unread chat messages ───────────────────────────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0);
  const lastReadRef = useRef<string>('');
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // Když uživatel otevře chat tab → označ vše jako přečtené
  useEffect(() => {
    if (tab === 'chat') {
      setUnreadCount(0);
      const now = new Date().toISOString();
      lastReadRef.current = now;
      try { localStorage.setItem(`torq_chat_read_${tournamentId}`, now); } catch { /* */ }
    }
  }, [tab, tournamentId]);

  // Subscribe na chat zprávy pro detekci nepřečtených
  useEffect(() => {
    try {
      lastReadRef.current = localStorage.getItem(`torq_chat_read_${tournamentId}`) ?? '';
    } catch { /* */ }

    const unsub = subscribeToChatMessages(tournamentId, (msgs) => {
      if (tabRef.current !== 'chat' && msgs.length > 0) {
        const lr = lastReadRef.current;
        if (lr) {
          const count = msgs.filter(m => m.createdAt > lr).length;
          setUnreadCount(count);
        } else {
          // Nikdy neotevřel chat → ukázat počet všech zpráv
          setUnreadCount(msgs.length);
        }
      }
    });
    return unsub;
  }, [tournamentId]);

  const handleRefresh = useCallback(() => {
    setLastRefresh(new Date());
  }, []);

  // Tenis turnaj → deleguj na tenisový public view (oddělené UI).
  // Rodiče tenisových hráčů nemají vidět fotbalové sekce (chat, MVP, ...).
  // Delegaci děláme až za všechny hooky (React rules of hooks).
  if (isTennisTournament) {
    return <TennisTournamentPublicView tournamentId={tournamentId} navigate={navigate} />;
  }

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
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center', color: 'var(--danger)' }}>{t('tournament.public.connectionError')}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          {t('publicView.loadFailed')}
        </p>
        <pre style={{ fontSize: 11, color: 'var(--danger)', background: 'var(--danger-light)', padding: '8px 12px', borderRadius: 8, maxWidth: '100%', overflow: 'auto', textAlign: 'left' }}>
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
  const scorersVisible = tournament.settings.scorersVisible ?? false;
  const chatEnabled = tournament.settings.chatEnabled ?? false;

  const chatLabel = unreadCount > 0
    ? `💬 ${t('tournament.chat.title')} (${unreadCount > 99 ? '99+' : unreadCount})`
    : `💬 ${t('tournament.chat.title')}`;

  const TABS: { id: Tab; label: string; highlight?: boolean }[] = [
    { id: 'results', label: t('tournament.public.results') },
    { id: 'standings', label: t('tournament.public.standings') },
    ...(scorersVisible ? [{ id: 'scorers' as Tab, label: t('tournament.public.scorers') }] : []),
    ...(chatEnabled ? [{ id: 'chat' as Tab, label: chatLabel, highlight: unreadCount > 0 }] : []),
  ];

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      width: '100%',
      maxWidth: isDesktop ? 560 : undefined,
      alignSelf: isDesktop ? 'center' : undefined,
      boxShadow: isDesktop ? '0 0 40px rgba(0,0,0,.08)' : undefined,
    }}>
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
        setTab={(tab) => { if (tab !== 'rules') setTab(tab); }}
        tabs={TABS}
      />

      {/* Scrollable content area — header + tabs zůstávají fixed nahoře */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' as never }}>
        {/* Team filter bar — jen na záložce Výsledky */}
        {tab === 'results' && tournament.teams.length > 1 && (
          <TeamFilterBar
            tournament={tournament}
            selectedTeamId={selectedTeamId}
            onSelect={setSelectedTeamId}
          />
        )}

        {/* FinishedBanner přesunut DOLŮ pod obsah (Audit 2026-04-29 A5):
            předtím tlačil primární obsah (výsledky/tabulka) dolů, marketing
            byl výš než výsledky. Teď ho rendrujeme až po hlavní content
            (viz konec scrollable area níže). */}

        {/* Awards + Auto awards — visible when any exist */}
        {(() => {
          const manualAwards = tournament.settings.awards ?? [];

          // Auto: Nejlepší střelec z gólů
          const topScorers: { name: string; teamId: string; teamName: string; goals: number }[] = (() => {
            const scorerMap = new Map<string, { name: string; teamId: string; goals: number }>();
            for (const match of tournament.matches) {
              for (const goal of match.goals) {
                if (goal.isOwnGoal || !goal.playerId) continue;
                const key = `${goal.teamId}-${goal.playerId}`;
                const tm = tournament.teams.find(t2 => t2.id === goal.teamId);
                const player = tm?.players?.find(p => p.id === goal.playerId);
                const existing = scorerMap.get(key);
                if (existing) existing.goals++;
                else scorerMap.set(key, { name: player?.name ?? '?', teamId: goal.teamId, goals: 1 });
              }
            }
            const sorted = Array.from(scorerMap.values()).sort((a, b) => b.goals - a.goals);
            if (sorted.length === 0) return [];
            const maxGoals = sorted[0].goals;
            // Vrať všechny se stejným počtem gólů (remíza)
            return sorted.filter(s => s.goals === maxGoals).map(s => {
              const tm = tournament.teams.find(t2 => t2.id === s.teamId);
              return { ...s, teamName: tm?.name ?? '?' };
            });
          })();

          // Auto: Fan Favorite z MVP hlasování
          let fanFavorite: { name: string; teamId: string; teamName: string; votes: number } | null = null;
          if (mvpVotesMain.length >= 3) {
            const playerVotes: Record<string, { name: string; teamId: string; count: number }> = {};
            for (const v of mvpVotesMain) {
              const key = `${v.teamId}_${v.playerId}`;
              if (!playerVotes[key]) playerVotes[key] = { name: v.playerName, teamId: v.teamId, count: 0 };
              playerVotes[key].count++;
            }
            const sorted = Object.values(playerVotes).sort((a, b) => b.count - a.count);
            if (sorted[0]) {
              const mvpTeam = tournament.teams.find(tm => tm.id === sorted[0].teamId);
              fanFavorite = { name: sorted[0].name, teamId: sorted[0].teamId, teamName: mvpTeam?.name ?? '?', votes: sorted[0].count };
            }
          }

          const isAdmin = isTournamentOwner || hasJoined;
          const isFinished = tournament.status === 'finished';
          const awardsVisible = tournament.settings.awardsVisible ?? false;
          // Hosté vidí ocenění jen když je toggle zapnutý; admin vidí vždy
          if (!awardsVisible && !isAdmin) return null;
          // Auto-awards (střelec, fan favorite) se zobrazí až po skončení turnaje — nikdy během hry
          const showAutoAwards = isFinished;

          // Pokud admin vybral konkrétního střelce, zobrazit jen jeho; jinak auto top scorers
          const selectedScorer = manualAwards.find(a => a.title === 'tournament.awards.bestScorer');
          const visibleTopScorers = showAutoAwards
            ? (selectedScorer
                ? topScorers.filter(s => s.name === selectedScorer.playerName && s.teamId === selectedScorer.teamId)
                : topScorers)
            : [];
          const visibleFanFavorite = showAutoAwards ? fanFavorite : null;

          // Filtruj bestScorer z manual awards (zobrazí se v auto sekci)
          const filteredManualAwards = manualAwards.filter(a => a.title !== 'tournament.awards.bestScorer');

          const hasContent = filteredManualAwards.length > 0 || visibleTopScorers.length > 0 || visibleFanFavorite;
          if (!hasContent) return null;

          return (
            <div style={{ padding: '12px 16px 0', boxSizing: 'border-box', overflow: 'hidden', maxWidth: '100%', minWidth: 0 }}>
              <div style={{
                background: 'linear-gradient(135deg, #FFF8E1 0%, #FFFDE7 100%)',
                borderRadius: 14, padding: '12px 14px',
                border: '1.5px solid #FFD54F',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>🏅</span>
                  <span style={{ fontWeight: 800, fontSize: 14, color: '#F57F17' }}>{t('tournament.awards.title')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredManualAwards.map((award, i) => {
                    const team = award.teamId ? tournament.teams.find(tm => tm.id === award.teamId) : null;
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.7)', color: '#5D4037',
                      }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>🏆</span>
                        {team?.color && (
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: team.color, flexShrink: 0,
                          }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{translateAwardTitle(award.title, t)}: </span>
                          <span style={{ fontSize: 13 }}>
                            {award.playerName}{team ? ` (${team.name})` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Best Scorer — auto from goals (only after tournament ends for guests) */}
                  {visibleTopScorers.map((scorer, i) => {
                    const scorerTeam = tournament.teams.find(tm => tm.id === scorer.teamId);
                    return (
                      <div key={`scorer-${i}`} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.7)', color: '#5D4037',
                      }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>⚽</span>
                        {scorerTeam?.color && (
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: scorerTeam.color, flexShrink: 0,
                          }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{t('tournament.awards.bestScorer')}: </span>
                          <span style={{ fontSize: 13 }}>
                            {scorer.name} ({scorer.teamName})
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                          {scorer.goals} ⚽
                        </span>
                      </div>
                    );
                  })}

                  {/* Fan Favorite — from MVP voting (only after tournament ends for guests) */}
                  {visibleFanFavorite && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,.7)', color: '#5D4037',
                    }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>⭐</span>
                      {(() => {
                        const team = tournament.teams.find(tm => tm.id === visibleFanFavorite!.teamId);
                        return team?.color ? (
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: team.color, flexShrink: 0,
                          }} />
                        ) : null;
                      })()}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{t('tournament.awards.fanFavorite')}: </span>
                        <span style={{ fontSize: 13 }}>
                          {visibleFanFavorite.name} ({visibleFanFavorite.teamName})
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {visibleFanFavorite.votes} ⭐
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* MVP voting — visible on all tabs when enabled */}
        {(tournament.settings.mvpVotingEnabled ?? false) && tournament.teams.length > 1 && (
          <div style={{ padding: '12px 16px 0', boxSizing: 'border-box', overflow: 'hidden', maxWidth: '100%', minWidth: 0 }}>
            <MvpVoting tournamentId={tournament.id} teams={tournament.teams} />
          </div>
        )}

        {/* Chat polls — visible on all tabs except chat (to avoid duplicates) */}
        {tab !== 'chat' && (
          <div style={{ padding: '12px 16px 0', boxSizing: 'border-box', overflow: 'hidden', maxWidth: '100%', minWidth: 0 }}>
            <ChatPollsList tournamentId={tournament.id} isAdmin={isTournamentOwner || hasJoined} />
          </div>
        )}

        {/* Tab content */}
        {tab === 'chat' && chatEnabled ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 300 }}>
            <PublicChat tournamentId={tournament.id} teams={tournament.teams} isAdmin={isTournamentOwner || hasJoined} />
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            {tab === 'standings' && <PublicStandings tournament={tournament} selectedTeamId={null} onSwitchToResults={() => { setTab('results'); window.scrollTo(0, 0); }} />}
            {tab === 'results' && <PublicResults tournament={tournament} selectedTeamId={selectedTeamId} />}
            {tab === 'scorers' && scorersVisible && <PublicScorers tournament={tournament} />}
          </div>
        )}

        {/* FinishedBanner přesunut sem (Audit 2026-04-29 A5): byl nahoře →
            tlačil výsledky/tabulku dolů. Teď až POD obsahem na 'results' tabu,
            kde dává kontextový smysl (po vidění finálních výsledků chce user
            sdílet). Na ostatních tabech (standings/scorers/chat) skryto. */}
        {tournament.status === 'finished' && tab === 'results' && (
          <FinishedBanner tournament={tournament} isGuest={!isTournamentOwner && !hasJoined} />
        )}
      </div>

      {/* Refresh footer */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        {tournament.settings.officialResultsUrl && (
          <OfficialLinkButton url={tournament.settings.officialResultsUrl} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
            {t('tournament.public.lastUpdate')}: {timeSinceLabel}
          </span>
          <button onClick={handleRefresh} style={{
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
            padding: '8px 16px', borderRadius: 12,
          }}>
            {t('tournament.public.refresh')}
          </button>
        </div>
        {/* TORQ branding */}
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          <a
            href="https://torq.cz/?ref=powered_by_tournament"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('viral_tournament_cta_click')}
            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            ⚡ Powered by <strong style={{ color: 'var(--primary)' }}>TORQ</strong> · torq.cz
          </a>
        </div>
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

// ─── Finished Tournament Banner ────────────────────────────────────────────
function FinishedBanner({ tournament, isGuest }: { tournament: Tournament; isGuest: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [mvpVotes, setMvpVotes] = useState<MvpVote[]>([]);

  // Subscribe na MVP hlasy pro shrnutí
  useEffect(() => {
    const unsub = subscribeMvpVotes(tournament.id, setMvpVotes);
    return unsub;
  }, [tournament.id]);

  const buildSummary = () => {
    const lines: string[] = [];

    // Header
    lines.push(`🏆 ${tournament.name.toUpperCase()}`);
    lines.push('');

    // Tabulka — top 3
    const standings = computeStandings(tournament.matches, tournament.teams);
    const medals = ['🥇', '🥈', '🥉'];
    lines.push(`*${t('tournament.share.results')}*`);
    standings.slice(0, 3).forEach((s, i) => {
      const team = tournament.teams.find(tm => tm.id === s.teamId);
      if (team) {
        lines.push(`${medals[i]} ${team.name}  (${s.points} b, ${s.goalsFor}:${s.goalsAgainst})`);
      }
    });

    // Střelci — top 3
    const scorerMap = new Map<string, { name: string; teamName: string; goals: number }>();
    for (const match of tournament.matches) {
      for (const goal of match.goals) {
        if (goal.isOwnGoal || !goal.playerId) continue;
        const key = `${goal.teamId}-${goal.playerId}`;
        const team = tournament.teams.find(tm => tm.id === goal.teamId);
        const player = team?.players?.find(p => p.id === goal.playerId);
        const existing = scorerMap.get(key);
        if (existing) {
          existing.goals++;
        } else {
          scorerMap.set(key, { name: player?.name ?? '?', teamName: team?.name ?? '?', goals: 1 });
        }
      }
    }
    const topScorers = Array.from(scorerMap.values()).sort((a, b) => b.goals - a.goals).slice(0, 3);
    if (topScorers.length > 0) {
      lines.push('');
      lines.push(`⚽ *${t('tournament.share.scorers')}*`);
      topScorers.forEach((s, i) => {
        lines.push(`${medals[i]} ${s.name} (${s.teamName}) - ${s.goals}`);
      });
    }

    // MVP — pokud proběhlo hlasování
    if (mvpVotes.length > 0) {
      const playerVotes: Record<string, { name: string; teamId: string; count: number }> = {};
      for (const v of mvpVotes) {
        const key = `${v.teamId}_${v.playerId}`;
        if (!playerVotes[key]) {
          playerVotes[key] = { name: v.playerName, teamId: v.teamId, count: 0 };
        }
        playerVotes[key].count++;
      }
      const mvpSorted = Object.values(playerVotes).sort((a, b) => b.count - a.count);
      const mvpWinner = mvpSorted[0];
      const mvpTeam = tournament.teams.find(tm => tm.id === mvpWinner.teamId);
      lines.push('');
      lines.push(`⭐ *${t('tournament.share.mvp')}*`);
      lines.push(`${mvpWinner.name} (${mvpTeam?.name ?? '?'}) - ${t('tournament.share.votes').replace('{count}', String(mvpWinner.count))}`);
    }

    // Ocenění turnaje
    const awards = tournament.settings.awards ?? [];
    if (awards.length > 0) {
      lines.push('');
      lines.push(`🏅 *${t('tournament.share.awards')}*`);
      for (const award of awards) {
        const team = award.teamId ? tournament.teams.find(tm => tm.id === award.teamId) : null;
        lines.push(`${translateAwardTitle(award.title, t)}: ${award.playerName}${team ? ` (${team.name})` : ''}`);
      }
    }

    // Statistiky
    const totalGoals = tournament.matches.reduce((sum, m) => sum + m.homeScore + m.awayScore, 0);
    const finishedMatches = tournament.matches.filter(m => m.status === 'finished').length;
    lines.push('');
    lines.push(`📊 ${t('tournament.share.stats').replace('{matches}', String(finishedMatches)).replace('{goals}', String(totalGoals))}`);

    // Odkaz
    lines.push('');
    const url = `${window.location.origin}${window.location.pathname}#tournament=${tournament.id}`;
    lines.push(`👉 ${t('tournament.share.fullResults')}: ${url}`);

    return lines.join('\n');
  };

  const getPublicUrl = () =>
    `${window.location.origin}${window.location.pathname}#tournament=${tournament.id}`;

  const handleCopyText = async () => {
    const text = buildSummary();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    const text = buildSummary();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleFacebook = () => {
    const url = getPublicUrl();
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=600,height=400');
  };

  const handleNativeShare = async () => {
    const text = buildSummary();
    const url = getPublicUrl();
    try {
      await navigator.share({ title: tournament.name, text, url });
    } catch { /* user cancelled */ }
  };

  return (
    <div style={{ padding: '12px 16px', flexShrink: 0 }}>
      <div style={{
        borderRadius: 14, overflow: 'hidden',
        border: '1.5px solid var(--border)', background: 'var(--surface)',
      }}>
        {/* Share row — visible to everyone */}
        <div style={{
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
            {t('promo.shareSummary')}
          </span>

          {/* WhatsApp */}
          <button
            onClick={handleWhatsApp}
            title="WhatsApp"
            style={{
              background: '#25D366', border: 'none', borderRadius: 8, cursor: 'pointer',
              width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.11.546 4.095 1.504 5.82L0 24l6.335-1.627A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.82c-1.87 0-3.63-.5-5.14-1.37l-.37-.22-3.76.97.99-3.65-.24-.38A9.79 9.79 0 012.18 12c0-5.42 4.4-9.82 9.82-9.82 5.42 0 9.82 4.4 9.82 9.82 0 5.42-4.4 9.82-9.82 9.82z"/>
            </svg>
          </button>

          {/* Facebook */}
          <button
            onClick={handleFacebook}
            title="Facebook"
            style={{
              background: '#1877F2', border: 'none', borderRadius: 8, cursor: 'pointer',
              width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </button>

          {/* Copy text */}
          <button
            onClick={handleCopyText}
            title={t('promo.shareSummary')}
            style={{
              background: 'var(--surface-var)', border: '1px solid var(--border)',
              borderRadius: 8, cursor: 'pointer',
              width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}
          >
            {copied ? '✅' : '📋'}
          </button>

          {/* Native share (mobile) */}
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleNativeShare}
              title={t('promo.shareSummary')}
              style={{
                background: 'var(--surface-var)', border: '1px solid var(--border)',
                borderRadius: 8, cursor: 'pointer',
                width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
              }}
            >
              📤
            </button>
          )}
        </div>

        {/* Promo — only for guests */}
        {isGuest && (
          <a
            href={(typeof window !== 'undefined' ? window.location.origin : 'https://torq.cz') + '/?ref=public_tournament#mode=simple'}
            onClick={() => track('viral_tournament_cta_click')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', textDecoration: 'none',
              borderTop: '1px solid var(--border)',
              background: 'var(--primary-gradient)',
              color: '#fff',
            }}
          >
            <span style={{ fontSize: 14 }}>⚡</span>
            <span style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>
              <strong>{t('promo.finishedTitle')}</strong>{' '}
              {t('promo.finishedDesc')}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {t('promo.tryCta')}
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
