import { useState, useEffect } from 'react';
import type { Team } from '../../../types/tournament.types';
import { voteFanPoll, subscribeFanPoll, resetFanPoll } from '../../../services/tournament.firebase';
import { useI18n } from '../../../i18n';

/** Unikátní ID návštěvníka — 1 hlas na zařízení */
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
  isAdmin?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function FanPollBanner({ tournamentId, teams, isAdmin }: Props) {
  const { t } = useI18n();
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [myVote, setMyVote] = useState<string | null>(() => {
    try { return localStorage.getItem(`torq_poll_${tournamentId}`); } catch { return null; }
  });
  const [justVoted, setJustVoted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsub = subscribeFanPoll(tournamentId, setVotes);
    return unsub;
  }, [tournamentId]);

  const handleVote = async (teamId: string) => {
    if (teamId === myVote) return; // Same team — ignore
    const voterId = getVoterId();
    setMyVote(teamId);
    setJustVoted(true);
    setExpanded(false);
    try { localStorage.setItem(`torq_poll_${tournamentId}`, teamId); } catch { /* */ }
    await voteFanPoll(tournamentId, voterId, teamId);
    setTimeout(() => setJustVoted(false), 2500);
  };

  const totalVotes = Object.values(votes).reduce((s, n) => s + n, 0);
  const hasVoted = myVote !== null;

  // Top 3 sorted by votes
  const sorted = [...teams].sort((a, b) => {
    const va = votes[a.id] ?? 0;
    const vb = votes[b.id] ?? 0;
    return vb - va || a.name.localeCompare(b.name);
  });
  const podium = sorted.slice(0, 3).filter(t => (votes[t.id] ?? 0) > 0);

  // ── Just voted flash ──
  if (justVoted) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #FFF8E1 0%, #FFFDE7 100%)',
        borderRadius: 12, padding: '14px 16px', textAlign: 'center',
        border: '1px solid #FFE082',
      }}>
        <span style={{ fontSize: 24 }}>🎉</span>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#F57F17', marginTop: 4 }}>
          {t('tournament.chat.pollThanks')}
        </div>
      </div>
    );
  }

  // ── Already voted → compact podium (expandable to change vote) ──
  if (hasVoted) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #FFF8E1 0%, #FFFDE7 100%)',
        borderRadius: 12, overflow: 'hidden',
        border: '1px solid #FFE082',
      }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 14px', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 18 }}>🏆</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F57F17' }}>
              {t('tournament.chat.pollTitle')}
            </div>
            {podium.length > 0 ? (
              <div style={{
                fontSize: 12, color: '#5D4037', marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {podium.map((team, i) => (
                  <span key={team.id}>
                    {i > 0 && <span style={{ margin: '0 4px', color: '#BCAAA4' }}>·</span>}
                    <span>{MEDALS[i]} {team.name}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#A1887F' }}>
                {t('tournament.chat.pollSubtitle')}
              </div>
            )}
          </div>
          {totalVotes > 0 && (
            <span style={{
              fontSize: 11, color: '#F57F17', fontWeight: 600, flexShrink: 0,
              background: 'rgba(245,127,23,.1)', padding: '2px 8px', borderRadius: 10,
            }}>
              {totalVotes} {totalVotes === 1 ? t('tournament.chat.pollVote') : t('tournament.chat.pollVotes')}
            </span>
          )}
          <span style={{
            fontSize: 12, color: '#F57F17', fontWeight: 700,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform .2s', flexShrink: 0,
          }}>▼</span>
        </button>

        {/* Expanded: change vote + results */}
        {expanded && (
          <div style={{ padding: '4px 10px 10px' }}>
            <div style={{ fontSize: 11, color: '#A1887F', marginBottom: 6, textAlign: 'center' }}>
              {t('tournament.chat.pollVoted')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {teams.map(team => {
                const isMyVote = team.id === myVote;
                const teamVotes = votes[team.id] ?? 0;
                return (
                  <button
                    key={team.id}
                    onClick={() => handleVote(team.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 10px', borderRadius: 10,
                      background: isMyVote ? 'rgba(245,127,23,.12)' : 'rgba(255,255,255,.7)',
                      border: isMyVote ? '1.5px solid #F57F17' : '1.5px solid rgba(0,0,0,.06)',
                      cursor: isMyVote ? 'default' : 'pointer', textAlign: 'left',
                      transition: 'transform .1s',
                    }}
                    onPointerDown={e => { if (!isMyVote) e.currentTarget.style.transform = 'scale(.96)'; }}
                    onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                    onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: team.color, flexShrink: 0,
                      border: '1px solid rgba(0,0,0,.1)',
                    }} />
                    <span style={{
                      fontSize: 13, fontWeight: isMyVote ? 700 : 600,
                      color: isMyVote ? '#F57F17' : '#5D4037',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1, minWidth: 0,
                    }}>
                      {team.name}
                    </span>
                    {teamVotes > 0 && (
                      <span style={{ fontSize: 11, color: '#A1887F', flexShrink: 0 }}>
                        {teamVotes}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Admin reset */}
            {isAdmin && totalVotes > 0 && (
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await resetFanPoll(tournamentId);
                    setMyVote(null);
                    try { localStorage.removeItem(`torq_poll_${tournamentId}`); } catch { /* */ }
                  }}
                  style={{
                    padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: 'none', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  {t('tournament.chat.pollReset')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Not voted yet ──
  return (
    <div style={{
      background: 'linear-gradient(135deg, #FFF8E1 0%, #FFFDE7 100%)',
      borderRadius: 12, overflow: 'hidden',
      border: '1px solid #FFE082',
    }}>
      {/* Clickable header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '10px 14px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 18 }}>🏆</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#F57F17' }}>
            {t('tournament.chat.pollTitle')}
          </div>
          <div style={{ fontSize: 12, color: '#A1887F' }}>
            {t('tournament.chat.pollSubtitle')}
          </div>
        </div>
        <span style={{
          fontSize: 12, color: '#F57F17', fontWeight: 700,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform .2s',
        }}>▼</span>
      </button>

      {/* Expanded voting grid */}
      {expanded && (
        <div style={{
          padding: '4px 10px 10px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
        }}>
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => handleVote(team.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 10px', borderRadius: 10,
                background: 'rgba(255,255,255,.7)',
                border: '1.5px solid rgba(0,0,0,.06)',
                cursor: 'pointer', textAlign: 'left',
                transition: 'transform .1s',
              }}
              onPointerDown={e => (e.currentTarget.style.transform = 'scale(.96)')}
              onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: team.color, flexShrink: 0,
                border: '1px solid rgba(0,0,0,.1)',
              }} />
              <span style={{
                fontSize: 13, fontWeight: 600, color: '#5D4037',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1, minWidth: 0,
              }}>
                {team.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
