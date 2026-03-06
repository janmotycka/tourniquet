import { useState, useEffect } from 'react';
import type { Match } from '../../../types/tournament.types';
import { computeMatchElapsed } from '../../../utils/tournament-schedule';

export function LiveBannerTimer({ match }: { match: Match }) {
  const [elapsed, setElapsed] = useState(() =>
    computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed)
  );

  useEffect(() => {
    if (match.pausedAt) return; // zastaven — žádný interval
    const interval = setInterval(() => {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [match.startedAt, match.pausedAt, match.pausedElapsed]);

  const totalSec = match.durationMinutes * 60;
  const remaining = totalSec - elapsed;
  const isOvertime = remaining < 0;
  const displaySec = isOvertime ? Math.abs(remaining) : remaining;
  const mm = Math.floor(displaySec / 60).toString().padStart(2, '0');
  const ss = (displaySec % 60).toString().padStart(2, '0');
  const timeStr = isOvertime ? `+${mm}:${ss}` : `${mm}:${ss}`;

  return (
    <span style={{
      fontWeight: 700, fontSize: 12,
      color: isOvertime ? '#FFCDD2' : '#fff',
      background: isOvertime ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
      padding: '2px 7px', borderRadius: 6, marginLeft: 4,
    }}>
      {match.pausedAt ? '⏸' : '⏱'} {timeStr}
    </span>
  );
}
