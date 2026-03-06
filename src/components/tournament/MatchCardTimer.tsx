import { useState, useEffect } from 'react';
import type { Match } from '../../types/tournament.types';
import { computeMatchElapsed } from '../../utils/tournament-schedule';

export function MatchCardTimer({ match, variant = 'card' }: { match: Match; variant?: 'card' | 'list' }) {
  const [elapsed, setElapsed] = useState(() =>
    computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed)
  );

  useEffect(() => {
    // Pokud je pauza — timer se nemá pohybovat
    if (match.pausedAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- timer: initial sync before interval
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
      return;
    }
    setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    const iv = setInterval(() => {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    }, 1000);
    return () => clearInterval(iv);
  }, [match.startedAt, match.pausedAt, match.pausedElapsed]);

  const totalSec = match.durationMinutes * 60;
  const remaining = totalSec - elapsed;
  const isOvertime = remaining < 0;
  const isPaused = !!match.pausedAt;

  // Countdown: kolik zbývá; nadčas = kolik překročeno
  const displaySec = isOvertime ? -remaining : remaining;
  const mm = Math.floor(displaySec / 60).toString().padStart(2, '0');
  const ss = (displaySec % 60).toString().padStart(2, '0');

  const nearEnd = !isOvertime && remaining <= 60;

  if (variant === 'list') {
    // Malá verze pro match list kartu
    const color = isPaused ? '#FFB74D' : isOvertime ? '#EF9A9A' : nearEnd ? '#FFB74D' : 'var(--text-muted)';
    return (
      <span style={{ fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color }}>
        {isPaused ? '⏸ ' : ''}{isOvertime ? `+${mm}:${ss}` : `${mm}:${ss}`}
      </span>
    );
  }

  // Velká verze pro ScoreModal
  const color = isPaused ? '#FF8F00' : isOvertime ? '#C62828' : nearEnd ? '#E65100' : 'var(--text)';
  return (
    <span style={{ fontSize: 32, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color, letterSpacing: -1 }}>
      {isPaused ? '⏸ ' : ''}{isOvertime ? `+${mm}:${ss}` : `${mm}:${ss}`}
    </span>
  );
}
