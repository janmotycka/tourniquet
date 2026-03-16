import { useState, useEffect } from 'react';
import { subscribeChatPolls } from '../../../services/tournament.firebase';
import type { ChatPoll } from '../../../services/tournament.firebase';
import { ChatPollCard } from './ChatPollCard';

interface Props {
  tournamentId: string;
  isAdmin?: boolean;
}

/** Zobrazuje admin ankety — může být mimo chat tab */
export function ChatPollsList({ tournamentId, isAdmin }: Props) {
  const [polls, setPolls] = useState<ChatPoll[]>([]);

  useEffect(() => {
    const unsub = subscribeChatPolls(tournamentId, setPolls);
    return unsub;
  }, [tournamentId]);

  if (polls.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {polls.map(poll => (
        <ChatPollCard key={poll.id} tournamentId={tournamentId} poll={poll} isAdmin={isAdmin} />
      ))}
    </div>
  );
}
