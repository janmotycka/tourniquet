import { useState, useEffect } from 'react';
import type { Team } from '../../types/tournament.types';
import { subscribeMvpVotes, resetMvpVotes } from '../../services/tournament.firebase';
import type { MvpVote } from '../../services/tournament.firebase';
import { useI18n } from '../../i18n';

interface Props {
  tournamentId: string;
  teams: Team[];
}

export function MvpResults({ tournamentId, teams }: Props) {
  const { t } = useI18n();
  const [votes, setVotes] = useState<MvpVote[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeMvpVotes(tournamentId, setVotes);
    return unsub;
  }, [tournamentId]);

  if (votes.length === 0) return null;

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

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14,
      border: '1.5px solid var(--border)', overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '14px 16px', display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8,
        }}
      >
        <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>
          ⭐ {t('tournament.mvp.resultsTitle')}
        </h3>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
          {votes.length} {votes.length === 1 ? t('tournament.chat.pollVote') : t('tournament.chat.pollVotes')}
        </span>
        <span style={{
          fontSize: 12, color: 'var(--text-muted)',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform .2s',
        }}>▼</span>
      </div>

      {open && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map((pv, i) => {
            const team = teams.find(t => t.id === pv.teamId);
            const pct = Math.round((pv.count / votes.length) * 100);
            return (
              <div key={i} style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 10,
                background: 'var(--surface-var)', overflow: 'hidden',
              }}>
                {/* Progress bar */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`, background: team?.color ?? '#999', opacity: 0.12,
                  borderRadius: 10,
                }} />
                {/* Rank */}
                <span style={{
                  fontSize: i === 0 ? 18 : 14, flexShrink: 0, width: 24, textAlign: 'center',
                  position: 'relative', zIndex: 1,
                }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </span>
                {/* Team dot + player name */}
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: team?.color ?? '#999', flexShrink: 0,
                  position: 'relative', zIndex: 1,
                }} />
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: i === 0 ? 700 : 500,
                  position: 'relative', zIndex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {pv.name}
                </span>
                {/* Count */}
                <span style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                  position: 'relative', zIndex: 1, flexShrink: 0,
                }}>
                  {pv.count} ({pct}%)
                </span>
              </div>
            );
          })}

          {/* Reset button */}
          <button
            onClick={async () => {
              if (confirm(t('tournament.mvp.resetConfirm'))) {
                await resetMvpVotes(tournamentId);
              }
            }}
            style={{
              marginTop: 6, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)',
              cursor: 'pointer', width: '100%',
            }}
          >{t('tournament.mvp.reset')}</button>
        </div>
      )}
    </div>
  );
}
