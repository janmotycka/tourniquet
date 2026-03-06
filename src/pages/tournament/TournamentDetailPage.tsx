import { useState } from 'react';
import type { Page } from '../../App';
import { useTournamentStore } from '../../store/tournament.store';
import { isPinVerified } from '../../utils/pin-hash';
import { computeCurrentMinute } from '../../utils/tournament-schedule';
import type { Match } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { useConfirmStore } from '../../store/confirm.store';
import { StandingsTab } from '../../components/tournament/StandingsTab';
import { MatchesTab } from '../../components/tournament/MatchesTab';
import { ScorersTab } from '../../components/tournament/ScorersTab';
import { SettingsTab } from '../../components/tournament/SettingsTab';
import { ScoreModal } from '../../components/tournament/ScoreModal';
import { RosterModal } from '../../components/tournament/RosterModal';
import { PinGate } from '../../components/tournament/PinGate';

interface Props { tournamentId: string; navigate: (p: Page) => void; }

type Tab = 'standings' | 'matches' | 'scorers' | 'settings';

// ─── Main component ───────────────────────────────────────────────────────────
export function TournamentDetailPage({ tournamentId, navigate }: Props) {
  const [tab, setTab] = useState<Tab>('matches');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showPinGate, setShowPinGate] = useState(false);
  const { t } = useI18n();
  const ask = useConfirmStore(s => s.ask);

  const tournament = useTournamentStore(s => s.getTournamentById(tournamentId));
  const isOwner = useTournamentStore(s => s.isOwner(tournamentId));
  const leaveTournament = useTournamentStore(s => s.leaveTournament);

  const [pinVerified, setPinVerified] = useState(() => isPinVerified(tournamentId) || !isOwner);
  const startMatch = useTournamentStore(s => s.startMatch);
  const finishMatch = useTournamentStore(s => s.finishMatch);
  const addGoal = useTournamentStore(s => s.addGoal);
  const removeLastGoal = useTournamentStore(s => s.removeLastGoal);
  const removeGoal = useTournamentStore(s => s.removeGoal);
  const updateGoalPlayer = useTournamentStore(s => s.updateGoalPlayer);
  const reopenMatch = useTournamentStore(s => s.reopenMatch);
  const resetMatch = useTournamentStore(s => s.resetMatch);
  const pauseMatch = useTournamentStore(s => s.pauseMatch);
  const resumeMatch = useTournamentStore(s => s.resumeMatch);
  const cancelMatchStore = useTournamentStore(s => s.cancelMatch);
  const reorderMatchesStore = useTournamentStore(s => s.reorderMatches);
  const addPlayer = useTournamentStore(s => s.addPlayer);
  const removePlayer = useTournamentStore(s => s.removePlayer);
  const updatePlayer = useTournamentStore(s => s.updatePlayer);
  const updateTeamName = useTournamentStore(s => s.updateTeamName);
  const [rosterTeamId, setRosterTeamId] = useState<string | null>(null);

  if (!tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 40 }}>😕</div>
        <p>Turnaj nenalezen</p>
        <button onClick={() => navigate({ name: 'tournament-list' })} style={{ color: 'var(--primary)', fontWeight: 700 }}>← Zpět</button>
      </div>
    );
  }

  const liveMatch = tournament.matches.find(m => m.status === 'live');


  const handleQuickGoal = (matchId: string, teamId: string, playerId: string | null) => {
    if (!pinVerified) return;
    const match = tournament.matches.find(m => m.id === matchId);
    if (!match) return;
    addGoal(tournamentId, matchId, {
      teamId,
      playerId,
      isOwnGoal: false,
      minute: computeCurrentMinute(match.startedAt, match.pausedAt, match.pausedElapsed),
    });
  };

  const handleStartMatchInline = (matchId: string) => {
    if (!pinVerified) return;
    startMatch(tournamentId, matchId);
  };

  const handleFinishMatchConfirm = async (matchId: string) => {
    if (!pinVerified) return;
    const ok = await ask({ title: t('confirm.endMatch'), message: t('confirm.endMatchMsg') });
    if (ok) {
      finishMatch(tournamentId, matchId);
    }
  };

  const handlePauseMatch = (matchId: string) => {
    if (!pinVerified) return;
    pauseMatch(tournamentId, matchId);
  };

  const handleResumeMatch = (matchId: string) => {
    if (!pinVerified) return;
    resumeMatch(tournamentId, matchId);
  };

  const STATUS_LABELS: Record<string, string> = {
    draft: 'Příprava', active: 'Probíhá', finished: 'Ukončen',
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'matches', label: '⚽ Zápasy' },
    { id: 'standings', label: '🏅 Tabulka' },
    { id: 'scorers', label: '🥇 Střelci' },
    { id: 'settings', label: '⚙️ Nastavení' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
          <button onClick={() => navigate({ name: 'tournament-list' })} aria-label="Back" style={{
            width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
            fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🏆 {tournament.name}
            </h1>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {STATUS_LABELS[tournament.status]} · {tournament.teams.length} týmů
            </div>
          </div>
          {!pinVerified && (
            <button onClick={() => setShowPinGate(true)} style={{
              background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 12,
              fontWeight: 600, padding: '6px 10px', borderRadius: 8, flexShrink: 0,
            }}>🔐 PIN</button>
          )}
          {pinVerified && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 600, padding: '4px 8px', background: '#E8F5E9', borderRadius: 8 }}>
                ✅ Admin
              </span>
              {!isOwner && (
                <button
                  onClick={async () => {
                    const ok = await ask({ title: t('confirm.leaveTournament'), message: t('confirm.leaveTournamentMsg') });
                    if (ok) {
                      leaveTournament(tournamentId);
                      navigate({ name: 'tournament-list' });
                    }
                  }}
                  title="Opustit turnaj"
                  aria-label="Opustit turnaj"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#FFEBEE', border: '1.5px solid #FFCDD2',
                    cursor: 'pointer', fontSize: 16, lineHeight: 1,
                  }}
                >
                  🚪
                </button>
              )}
            </div>
          )}
        </div>

        {/* Live banner */}
        {liveMatch && (
          <div style={{
            background: '#C62828', color: '#fff', padding: '6px 16px',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />
            ŽIVĚ: {tournament.teams.find(t => t.id === liveMatch.homeTeamId)?.name} {liveMatch.homeScore}:{liveMatch.awayScore} {tournament.teams.find(t => t.id === liveMatch.awayTeamId)?.name}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', padding: '0 16px', gap: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '10px 6px', fontWeight: 600, fontSize: 13,
              color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              transition: 'all .15s',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'standings' && <StandingsTab tournament={tournament} onTeamClick={setRosterTeamId} isOwner={isOwner} />}
        {tab === 'matches' && (
          <MatchesTab
            tournament={tournament}
            isVerified={pinVerified}
            onQuickGoal={handleQuickGoal}
            onStartMatch={handleStartMatchInline}
            onFinishMatchConfirm={handleFinishMatchConfirm}
            onPauseMatch={handlePauseMatch}
            onResumeMatch={handleResumeMatch}
            onEditMatch={setSelectedMatch}
            onCancelMatch={isOwner ? (matchId) => cancelMatchStore(tournamentId, matchId) : undefined}
            onReorderMatches={isOwner ? (ids) => reorderMatchesStore(tournamentId, ids) : undefined}
          />
        )}
        {tab === 'scorers' && <ScorersTab tournament={tournament} />}
        {tab === 'settings' && <SettingsTab tournament={tournament} navigate={navigate} isOwner={isOwner} leaveTournament={leaveTournament} />}
      </div>

      {/* PIN gate */}
      {showPinGate && (
        <PinGate
          tournament={tournament}
          onVerified={() => { setPinVerified(true); setShowPinGate(false); }}
          onClose={() => setShowPinGate(false)}
        />
      )}

      {/* Score modal */}
      {selectedMatch && (
        <ScoreModal
          match={selectedMatch}
          tournament={tournament}
          onClose={() => setSelectedMatch(null)}
          onStart={() => {
            startMatch(tournamentId, selectedMatch.id);
            setSelectedMatch(prev => prev ? { ...prev, status: 'live', startedAt: new Date().toISOString() } : null);
          }}
          onFinish={() => {
            finishMatch(tournamentId, selectedMatch.id);
            setSelectedMatch(null);
          }}
          onAddGoal={goal => {
            addGoal(tournamentId, selectedMatch.id, goal);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onRemoveLastGoal={() => {
            removeLastGoal(tournamentId, selectedMatch.id);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onRemoveGoal={goalId => {
            removeGoal(tournamentId, selectedMatch.id, goalId);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onUpdateGoalPlayer={(goalId, playerId) => {
            updateGoalPlayer(tournamentId, selectedMatch.id, goalId, playerId);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onReopen={() => {
            reopenMatch(tournamentId, selectedMatch.id);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onReset={() => {
            resetMatch(tournamentId, selectedMatch.id);
          }}
        />
      )}

      {/* Roster modal */}
      {rosterTeamId && tournament && pinVerified && (
        <RosterModal
          tournament={tournament}
          teamId={rosterTeamId}
          onClose={() => setRosterTeamId(null)}
          onAddPlayer={(teamId, p) => addPlayer(tournamentId, teamId, p)}
          onRemovePlayer={(teamId, playerId) => removePlayer(tournamentId, teamId, playerId)}
          onUpdatePlayer={(teamId, playerId, updates) => updatePlayer(tournamentId, teamId, playerId, updates)}
          onUpdateTeamName={(teamId, name) => updateTeamName(tournamentId, teamId, name)}
        />
      )}
      {/* Roster modal pro hosta (jen čtení) */}
      {rosterTeamId && tournament && !pinVerified && (
        <RosterModal
          tournament={tournament}
          teamId={rosterTeamId}
          onClose={() => setRosterTeamId(null)}
          readOnly
        />
      )}
    </div>
  );
}
