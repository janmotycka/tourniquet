import { useState } from 'react';
import type { Team } from '../../../types/tournament.types';
import { voteMvp } from '../../../services/tournament.firebase';
import { useI18n } from '../../../i18n';
import { textOnColor, isLightColor } from '../../../utils/team-colors';

/** Unikátní ID návštěvníka */
function getVoterId(): string {
  const KEY = 'torq_voter_id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'anon_' + Math.random().toString(36).slice(2);
  }
}

interface Props {
  tournamentId: string;
  teams: Team[];
}

export function MvpVoting({ tournamentId, teams }: Props) {
  const { t } = useI18n();
  const [hasVoted, setHasVoted] = useState(() => {
    try { return !!localStorage.getItem(`torq_mvp_${tournamentId}`); } catch { return false; }
  });
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [votedPlayer, setVotedPlayer] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Už hlasoval → nic nezobrazovat
  if (hasVoted) return null;

  // Pokud právě odeslal hlas — krátký děkovný text
  if (votedPlayer) {
    return (
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '14px',
        boxShadow: 'var(--shadow-sm)', marginBottom: 8,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>⭐</div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{t('tournament.mvp.thanks')}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {t('tournament.mvp.yourPick')}: <strong>{votedPlayer}</strong>
        </div>
      </div>
    );
  }

  const selectedTeam = selectedTeamId ? teams.find(t => t.id === selectedTeamId) : null;
  const playersWithNames = selectedTeam?.players.filter(p => p.name.trim()) ?? [];

  const handleVote = async (playerId: string, playerName: string) => {
    if (sending || !selectedTeamId) return;
    setSending(true);
    try {
      const voterId = getVoterId();
      await voteMvp(tournamentId, voterId, {
        teamId: selectedTeamId,
        playerId,
        playerName,
      });
      setVotedPlayer(playerName);
      try { localStorage.setItem(`torq_mvp_${tournamentId}`, playerId); } catch { /* */ }
      // Po 3 sekundách úplně skryj
      setTimeout(() => setHasVoted(true), 3000);
    } catch {
      // silent fail
    }
    setSending(false);
  };

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '12px 14px',
      boxShadow: 'var(--shadow-sm)', marginBottom: 8,
      boxSizing: 'border-box', overflow: 'hidden', maxWidth: '100%', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>⭐</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{t('tournament.mvp.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {selectedTeamId ? t('tournament.mvp.pickPlayer') : t('tournament.mvp.pickTeam')}
          </div>
        </div>
        {selectedTeamId && (
          <button
            onClick={() => setSelectedTeamId(null)}
            style={{
              background: 'none', border: 'none', fontSize: 12, color: 'var(--primary)',
              fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
            }}
          >{t('common.back')}</button>
        )}
      </div>

      {/* Step 1: Výběr týmu */}
      {!selectedTeamId && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6 }}>
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 10px', borderRadius: 10,
                background: 'var(--surface-var)', cursor: 'pointer',
                border: 'none', textAlign: 'left',
                minWidth: 0, boxSizing: 'border-box', overflow: 'hidden',
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: '50%', background: team.color,
                flexShrink: 0, border: '1px solid rgba(0,0,0,.1)',
              }} />
              <span style={{
                fontSize: 12, fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                minWidth: 0,
              }}>
                {team.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Výběr hráče */}
      {selectedTeam && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {playersWithNames.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
              {t('tournament.mvp.noPlayers')}
            </div>
          ) : (
            playersWithNames.map(player => (
              <button
                key={player.id}
                onClick={() => handleVote(player.id, player.name)}
                disabled={sending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 10,
                  background: 'var(--surface-var)', cursor: 'pointer',
                  border: 'none', textAlign: 'left', width: '100%',
                  opacity: sending ? 0.5 : 1,
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: selectedTeam.color, color: textOnColor(selectedTeam.color),
                  boxShadow: isLightColor(selectedTeam.color) ? 'inset 0 0 0 1.5px rgba(0,0,0,0.15)' : undefined,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {player.jerseyNumber}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{player.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
