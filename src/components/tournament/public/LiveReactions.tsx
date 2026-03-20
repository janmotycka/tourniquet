import { useState, useEffect, useCallback, useRef } from 'react';
import { sendReaction, subscribeReactions, REACTION_EMOJIS } from '../../../services/tournament.firebase';
import type { ReactionEmoji } from '../../../services/tournament.firebase';

interface TeamInfo {
  id: string;
  name: string;
  color: string;
}

interface Props {
  tournamentId: string;
  matchId: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  readOnly?: boolean;
}

/** Floating emoji that animates upward and fades out */
function FloatingEmoji({ emoji, id, side, onDone }: { emoji: string; id: number; side: 'left' | 'right'; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(id), 1200);
    return () => clearTimeout(t);
  }, [id, onDone]);

  return (
    <span
      style={{
        position: 'absolute',
        bottom: '100%',
        [side]: `${10 + Math.random() * 35}%`,
        fontSize: 18 + Math.random() * 6,
        opacity: 0,
        pointerEvents: 'none',
        animation: 'reactionFloatUp 1.2s ease-out forwards',
      }}
    >
      {emoji}
    </span>
  );
}

function ReactionButton({ emoji, count, color, readOnly, onTap }: {
  emoji: string; count: number; color: string; readOnly: boolean;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '4px 8px', borderRadius: 16,
        background: count > 0 ? `${color}14` : 'rgba(0,0,0,.04)',
        border: count > 0 ? `1.5px solid ${color}40` : '1.5px solid rgba(0,0,0,.06)',
        cursor: readOnly ? 'default' : 'pointer',
        transition: 'background .15s, transform .1s',
        WebkitTapHighlightColor: 'transparent',
        fontSize: 15, lineHeight: 1,
      }}
      onPointerDown={e => {
        if (!readOnly) {
          e.currentTarget.style.transform = 'scale(1.15)';
          setTimeout(() => { if (e.currentTarget) e.currentTarget.style.transform = 'scale(1)'; }, 150);
        }
      }}
    >
      <span>{emoji}</span>
      {count > 0 && (
        <span style={{
          fontSize: 11, fontWeight: 700, color,
          fontVariantNumeric: 'tabular-nums', minWidth: 10, textAlign: 'center',
        }}>
          {count > 999 ? `${Math.floor(count / 1000)}k` : count}
        </span>
      )}
    </button>
  );
}

export function LiveReactions({ tournamentId, matchId, homeTeam, awayTeam, readOnly = false }: Props) {
  // counts: { teamId: { emoji: count } }
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>({});
  const [floaters, setFloaters] = useState<Array<{ id: number; emoji: string; side: 'left' | 'right' }>>([]);
  const nextId = useRef(0);
  const prevCounts = useRef<Record<string, Record<string, number>>>({});
  const lastTap = useRef<Record<string, number>>({});

  useEffect(() => {
    const unsub = subscribeReactions(tournamentId, matchId, (newCounts) => {
      const prev = prevCounts.current;
      // Spawn floaters for external changes
      for (const team of [homeTeam, awayTeam]) {
        const side = team.id === homeTeam.id ? 'left' as const : 'right' as const;
        for (const emoji of REACTION_EMOJIS) {
          const newVal = newCounts[team.id]?.[emoji] ?? 0;
          const oldVal = prev[team.id]?.[emoji] ?? 0;
          const diff = newVal - oldVal;
          if (diff > 0 && diff <= 3) {
            for (let i = 0; i < diff; i++) {
              const fId = nextId.current++;
              setFloaters(f => [...f, { id: fId, emoji, side }]);
            }
          }
        }
      }
      prevCounts.current = JSON.parse(JSON.stringify(newCounts));
      setCounts(newCounts);
    });
    return unsub;
  }, [tournamentId, matchId, homeTeam.id, awayTeam.id]);

  const handleTap = useCallback(async (teamId: string, emoji: ReactionEmoji) => {
    if (readOnly) return;
    const key = `${teamId}_${emoji}`;
    const now = Date.now();
    if (now - (lastTap.current[key] ?? 0) < 400) return;
    lastTap.current[key] = now;

    // Optimistic update
    setCounts(c => ({
      ...c,
      [teamId]: { ...(c[teamId] ?? {}), [emoji]: ((c[teamId]?.[emoji]) ?? 0) + 1 },
    }));
    prevCounts.current = {
      ...prevCounts.current,
      [teamId]: { ...(prevCounts.current[teamId] ?? {}), [emoji]: ((prevCounts.current[teamId]?.[emoji]) ?? 0) + 1 },
    };

    const side = teamId === homeTeam.id ? 'left' as const : 'right' as const;
    const fId = nextId.current++;
    setFloaters(f => [...f, { id: fId, emoji, side }]);

    try {
      await sendReaction(tournamentId, matchId, teamId, emoji);
    } catch { /* silent */ }
  }, [tournamentId, matchId, homeTeam.id, readOnly]);

  const removeFloater = useCallback((id: number) => {
    setFloaters(f => f.filter(fl => fl.id !== id));
  }, []);

  const homeCounts = counts[homeTeam.id] ?? {};
  const awayCounts = counts[awayTeam.id] ?? {};

  return (
    <>
      <style>{`
        @keyframes reactionFloatUp {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          60% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-50px) scale(1.3); }
        }
      `}</style>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '6px 10px 8px', gap: 6 }}>
        {/* Floating emojis */}
        {floaters.map(f => (
          <FloatingEmoji key={f.id} id={f.id} emoji={f.emoji} side={f.side} onDone={removeFloater} />
        ))}

        {/* Home team reactions — left side */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 5 }}>
          {REACTION_EMOJIS.map(emoji => (
            <ReactionButton
              key={emoji}
              emoji={emoji}
              count={homeCounts[emoji] ?? 0}
              color={homeTeam.color}
              readOnly={readOnly}
              onTap={() => handleTap(homeTeam.id, emoji)}
            />
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Away team reactions — right side */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
          {REACTION_EMOJIS.map(emoji => (
            <ReactionButton
              key={emoji}
              emoji={emoji}
              count={awayCounts[emoji] ?? 0}
              color={awayTeam.color}
              readOnly={readOnly}
              onTap={() => handleTap(awayTeam.id, emoji)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
