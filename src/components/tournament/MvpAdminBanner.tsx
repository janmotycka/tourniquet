import { useState, useEffect } from 'react';
import type { Team } from '../../types/tournament.types';
import { subscribeMvpVotes, resetMvpVotes } from '../../services/tournament.firebase';
import type { MvpVote } from '../../services/tournament.firebase';
import { useTournamentStore } from '../../store/tournament.store';
import { useI18n } from '../../i18n';

interface Props {
  tournamentId: string;
  teams: Team[];
  mvpVotingEnabled: boolean;
  settings: Record<string, unknown>;
}

export function MvpAdminBanner({ tournamentId, teams, mvpVotingEnabled, settings }: Props) {
  const { t } = useI18n();
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const [votes, setVotes] = useState<MvpVote[]>([]);
  const [dismissed, setDismissed] = useState(false);
  // Pamatuj si že hlasování kdy běželo (aby banner zůstal po zastavení)
  const [wasEnabled, setWasEnabled] = useState(mvpVotingEnabled);

  useEffect(() => {
    if (mvpVotingEnabled) {
      setWasEnabled(true);
      setDismissed(false);
    }
  }, [mvpVotingEnabled]);

  // Subscribe na hlasy — i po zastavení (abychom viděli výsledky)
  useEffect(() => {
    if (!wasEnabled) return;
    const unsub = subscribeMvpVotes(tournamentId, setVotes);
    return unsub;
  }, [tournamentId, wasEnabled]);

  // Nic nezobrazovat pokud nikdy nebylo zapnuto nebo je dismissed
  if (!wasEnabled || dismissed) return null;
  // Pokud je zastaveno a nemá žádné hlasy, taky skrýt
  if (!mvpVotingEnabled && votes.length === 0) return null;

  // Agreguj hlasy per hráč
  const playerVotes: Record<string, { name: string; teamId: string; count: number }> = {};
  for (const v of votes) {
    const key = `${v.teamId}_${v.playerId}`;
    if (!playerVotes[key]) {
      playerVotes[key] = { name: v.playerName, teamId: v.teamId, count: 0 };
    }
    playerVotes[key].count++;
  }
  const sorted = Object.values(playerVotes).sort((a, b) => b.count - a.count);
  const top3 = sorted.slice(0, 3);

  const handleStop = async () => {
    await updateTournament(tournamentId, {
      settings: { ...settings, mvpVotingEnabled: false },
    });
  };

  return (
    <div style={{
      margin: '8px 16px 0', padding: '10px 14px', borderRadius: 12,
      background: 'var(--surface)', border: '1.5px solid var(--border)',
      boxSizing: 'border-box', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: votes.length > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 14 }}>⭐</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{t('tournament.mvp.resultsTitle')}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
            {votes.length} {votes.length === 1 ? t('tournament.chat.pollVote') : t('tournament.chat.pollVotes')}
          </span>
        </div>
        {mvpVotingEnabled && (
          <button
            onClick={handleStop}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2',
              cursor: 'pointer', flexShrink: 0,
            }}
          >{t('tournament.mvp.stop')}</button>
        )}
        {!mvpVotingEnabled && (
          <span style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
            background: 'var(--surface-var)', color: 'var(--text-muted)',
          }}>{t('tournament.mvp.stopped')}</span>
        )}
        {votes.length > 0 && (
          <button
            onClick={async () => {
              if (confirm(t('tournament.mvp.resetConfirm'))) {
                await resetMvpVotes(tournamentId);
              }
            }}
            style={{
              padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >{t('tournament.mvp.reset')}</button>
        )}
        <button
          onClick={() => setDismissed(true)}
          style={{
            padding: '4px 6px', borderRadius: 8, fontSize: 14,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', flexShrink: 0,
          }}
          title={t('common.close')}
        >✕</button>
      </div>

      {/* Top 3 results */}
      {top3.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {top3.map((pv, i) => {
            const team = teams.find(tm => tm.id === pv.teamId);
            const pct = Math.round((pv.count / votes.length) * 100);
            return (
              <div key={i} style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', borderRadius: 8,
                background: 'var(--surface-var)', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`, background: team?.color ?? '#999', opacity: 0.12,
                  borderRadius: 8,
                }} />
                <span style={{ fontSize: i === 0 ? 14 : 12, flexShrink: 0, width: 20, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                </span>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: team?.color ?? '#999', flexShrink: 0,
                  position: 'relative', zIndex: 1,
                }} />
                <span style={{
                  flex: 1, fontSize: 12, fontWeight: i === 0 ? 700 : 500,
                  position: 'relative', zIndex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                  {pv.name}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                  position: 'relative', zIndex: 1, flexShrink: 0,
                }}>
                  {pv.count}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {mvpVotingEnabled && votes.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
          {t('tournament.mvp.noVotesYet')}
        </div>
      )}
    </div>
  );
}
