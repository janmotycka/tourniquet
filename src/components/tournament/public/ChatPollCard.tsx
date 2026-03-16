import { useState, useEffect } from 'react';
import type { ChatPoll } from '../../../services/tournament.firebase';
import { voteChatPoll, subscribeChatPollVotes, deleteChatPoll } from '../../../services/tournament.firebase';
import { useI18n } from '../../../i18n';

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
  poll: ChatPoll;
  isAdmin?: boolean;
}

export function ChatPollCard({ tournamentId, poll, isAdmin }: Props) {
  const { t } = useI18n();
  const [rawVotes, setRawVotes] = useState<Record<string, string>>({});
  const [myVote, setMyVote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = subscribeChatPollVotes(tournamentId, poll.id, (votes) => {
      setRawVotes(votes);
      const voterId = getVoterId();
      setMyVote(votes[voterId] ?? null);
    });
    return unsub;
  }, [tournamentId, poll.id]);

  const voteCounts: Record<string, number> = {};
  let totalVotes = 0;
  for (const option of poll.options) {
    voteCounts[option] = 0;
  }
  for (const optionText of Object.values(rawVotes)) {
    voteCounts[optionText] = (voteCounts[optionText] ?? 0) + 1;
    totalVotes++;
  }

  const hasVoted = myVote !== null;
  // Show results for admin always, for fans only after voting
  const showResults = isAdmin || hasVoted;

  // Fan already voted → hide the entire card
  if (hasVoted && !isAdmin) return null;

  const handleVote = async (option: string) => {
    if (sending) return;
    setSending(true);
    try {
      const voterId = getVoterId();
      await voteChatPoll(tournamentId, poll.id, voterId, option);
      setMyVote(option);
    } catch { /* */ }
    setSending(false);
  };

  const handleDelete = async () => {
    try {
      await deleteChatPoll(tournamentId, poll.id);
    } catch { /* */ }
  };

  // Barvy pro options
  const colors = ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#8E24AA', '#FF6D00'];

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '12px 14px',
      boxShadow: '0 1px 4px rgba(0,0,0,.05)', marginBottom: 4,
      border: '1.5px solid var(--border)',
      boxSizing: 'border-box', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>📊</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{poll.question}</div>
          {totalVotes > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {totalVotes} {totalVotes === 1 ? t('tournament.chat.pollVote') : t('tournament.chat.pollVotes')}
            </div>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={handleDelete}
            style={{
              padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2',
              cursor: 'pointer', flexShrink: 0,
            }}
          >🗑</button>
        )}
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {poll.options.map((option, i) => {
          const count = voteCounts[option] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMyChoice = myVote === option;
          const color = colors[i % colors.length];

          return (
            <button
              key={i}
              onClick={() => !isAdmin && handleVote(option)}
              disabled={sending || isAdmin}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 10, overflow: 'hidden',
                background: 'var(--surface-var)',
                border: isMyChoice ? `2px solid ${color}` : '2px solid transparent',
                cursor: isAdmin ? 'default' : 'pointer', width: '100%', textAlign: 'left',
                transition: 'border-color .15s',
                opacity: sending ? 0.6 : 1,
              }}
            >
              {/* Progress bar */}
              {showResults && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`, background: color, opacity: 0.12,
                  transition: 'width .3s ease', borderRadius: 10,
                }} />
              )}

              <span style={{
                flex: 1, fontSize: 13, fontWeight: isMyChoice ? 700 : 500,
                position: 'relative', zIndex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {option}
              </span>

              {showResults && (
                <span style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                  position: 'relative', zIndex: 1, flexShrink: 0,
                }}>
                  {count > 0 ? `${count}` : ''}
                  {pct > 0 && (
                    <span style={{ fontWeight: 400, marginLeft: 2 }}>({pct}%)</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Admin sees total votes summary */}
      {isAdmin && totalVotes === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
          {t('tournament.mvp.noVotesYet')}
        </div>
      )}
    </div>
  );
}
