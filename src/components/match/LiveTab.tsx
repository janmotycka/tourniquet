import { useState, useEffect, useRef } from 'react';
import type { SeasonMatch, MatchLineupPlayer, MatchGoal } from '../../types/match.types';
import { formatToStarterCount } from '../../types/match.types';
import { useMatchesStore } from '../../store/matches.store';
import { useConfirmStore } from '../../store/confirm.store';
import { useClubsStore } from '../../store/clubs.store';
import { useI18n } from '../../i18n';
import { computeElapsed, formatTime, computePlayingTime, computeCurrentStretch } from './match-utils';
import { GoalModal } from './GoalModal';
import { CardModal } from './CardModal';
import { SubstitutionModal } from './SubstitutionModal';
import { useMatchPerspective } from '../../hooks/useMatchPerspective';

// ── Landscape detection hook ──

function useLandscape() {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight && window.innerWidth < 1024;
  });

  useEffect(() => {
    const check = () => {
      // Only treat as landscape on mobile-sized screens (< 1024px width when landscape)
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth < 1024);
    };

    // Use screen.orientation API if available, fall back to resize
    if (screen.orientation) {
      screen.orientation.addEventListener('change', check);
    }
    window.addEventListener('resize', check);

    return () => {
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', check);
      }
      window.removeEventListener('resize', check);
    };
  }, []);

  return isLandscape;
}

// ── Landscape Scoreboard — fullscreen swipe-to-score ──

function LandscapeScoreboard({ match, elapsed, onQuickGoal, onPause, onResume, t, myTeamName, theirTeamName, myScore, theirScore }: {
  match: SeasonMatch;
  elapsed: number;
  onQuickGoal: (side: 'ours' | 'theirs') => void;
  onPause: () => void;
  onResume: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
  myTeamName: string;
  theirTeamName: string;
  myScore: number;
  theirScore: number;
}) {
  const ourScore = myScore;
  const isPaused = !!match.pausedAt;
  const activeClubLS = useClubsStore(s => s.clubs.find(c => c.id === match.clubId));
  const clubDisplayName = myTeamName || match.clubName || activeClubLS?.name || t('match.detail.us');
  const opponentDisplayName = theirTeamName || match.opponent;

  const periods = match.periods ?? 2;
  const currentPeriod = match.currentPeriod ?? 1;
  const periodDuration = match.periodDurationMinutes ?? Math.round(match.durationMinutes / periods);
  const periodSeconds = periodDuration * 60;
  const periodElapsed = elapsed - (currentPeriod - 1) * periodSeconds;
  const periodRemaining = Math.max(0, periodSeconds - periodElapsed);
  const isPeriodOvertime = periodElapsed > periodSeconds;

  // Swipe tracking per side
  const touchStartY = useRef<{ left: number | null; right: number | null }>({ left: null, right: null });
  const [swipeHintShown, setSwipeHintShown] = useState(true);

  // Auto-hide hint after 3s
  useEffect(() => {
    const t = setTimeout(() => setSwipeHintShown(false), 3000);
    return () => clearTimeout(t);
  }, []);

  // Swipe flash feedback
  const [flashSide, setFlashSide] = useState<'left' | 'right' | null>(null);

  const handleTouchStart = (side: 'left' | 'right', y: number) => {
    touchStartY.current[side] = y;
  };

  const handleTouchEnd = (side: 'left' | 'right', y: number) => {
    const startY = touchStartY.current[side];
    if (startY === null) return;
    const diff = startY - y; // positive = swipe up
    touchStartY.current[side] = null;

    if (diff > 40) {
      // Swipe up = goal
      onQuickGoal(side === 'left' ? 'ours' : 'theirs');
      setFlashSide(side);
      setTimeout(() => setFlashSide(null), 600);
    }
  };

  const vibrate = (ms: number = 30) => {
    try { navigator.vibrate?.(ms); } catch { /* ignore */ }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: '#000', color: '#fff',
      display: 'flex', flexDirection: 'row',
      userSelect: 'none', WebkitUserSelect: 'none',
      touchAction: 'none',
    }}>
      <style>{`
        @keyframes landscapeFlash {
          0% { opacity: .4; }
          100% { opacity: 0; }
        }
        @keyframes landscapeHintFade {
          0%, 80% { opacity: .7; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* LEFT half — Our team */}
      <div
        onTouchStart={e => handleTouchStart('left', e.touches[0].clientY)}
        onTouchEnd={e => handleTouchEnd('left', e.changedTouches[0].clientY)}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: flashSide === 'left' ? 'rgba(46,125,50,.3)' : 'transparent',
          transition: 'background .3s',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, opacity: .6, marginBottom: 8, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '90%', textAlign: 'center' }}>
          {clubDisplayName}
        </div>
        <div style={{ fontSize: 'min(30vw, 160px)', fontWeight: 900, lineHeight: 1 }}>
          {ourScore}
        </div>
        {flashSide === 'left' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(46,125,50,.4)',
            animation: 'landscapeFlash .6s ease-out forwards',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* CENTER strip — timer + controls */}
      <div
        onClick={() => {
          vibrate();
          if (isPaused) onResume();
          else onPause();
        }}
        style={{
          width: 80, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 6, borderLeft: '1px solid #333', borderRight: '1px solid #333',
          cursor: 'pointer',
        }}
      >
        <div style={{
          fontSize: 11, fontWeight: 700, opacity: .5,
        }}>
          {getPeriodLabel(t, periods, currentPeriod)}
        </div>
        <div style={{
          fontFeatureSettings: '"tnum"', fontWeight: 900, fontSize: 22,
          color: isPeriodOvertime ? '#FFD54F' : isPaused ? '#FF9800' : '#fff',
          letterSpacing: 1,
        }}>
          {isPeriodOvertime ? '+' : ''}{formatTime(isPeriodOvertime ? periodElapsed - periodSeconds : periodRemaining)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: .5 }}>
          {Math.floor(elapsed / 60)}'
        </div>
        {isPaused && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#FF9800',
            animation: 'pulse 1s infinite',
          }}>
            {t('match.detail.pausedBadge')}
          </div>
        )}
      </div>

      {/* RIGHT half — Opponent */}
      <div
        onTouchStart={e => handleTouchStart('right', e.touches[0].clientY)}
        onTouchEnd={e => handleTouchEnd('right', e.changedTouches[0].clientY)}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: flashSide === 'right' ? 'rgba(198,40,40,.3)' : 'transparent',
          transition: 'background .3s',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, opacity: .6, marginBottom: 8, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '90%', textAlign: 'center' }}>
          {opponentDisplayName}
        </div>
        <div style={{ fontSize: 'min(30vw, 160px)', fontWeight: 900, lineHeight: 1 }}>
          {theirScore}
        </div>
        {flashSide === 'right' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(198,40,40,.4)',
            animation: 'landscapeFlash .6s ease-out forwards',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* Swipe hint overlay — auto-fades */}
      {swipeHintShown && (
        <div style={{
          position: 'absolute', bottom: 16, left: 0, right: 0,
          textAlign: 'center', fontSize: 12, fontWeight: 600,
          color: '#fff', opacity: .7,
          animation: 'landscapeHintFade 3s ease-out forwards',
          pointerEvents: 'none',
        }}>
          ↑ {t('match.landscape.swipeHint')} &nbsp;·&nbsp; {t('match.landscape.tapMiddle')}
        </div>
      )}
    </div>
  );
}

// ── Wake Lock — keep screen on during live match ──

function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;

    let released = false;

    const request = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      } catch { /* user denied or not supported */ }
    };

    request();

    const onVisibility = () => {
      if (!released && document.visibilityState === 'visible' && !wakeLockRef.current) {
        request();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, [enabled]);
}

// ── Substitution assistant logic ──

/**
 * Substitution queue — deterministic assistant ve stylu "fronty návrhů".
 *
 * Jak to funguje:
 *   - Po každé uplynulé intervalMinutes vzroste cíl (target) o `playersAtOnce`
 *   - Provedené střídání z fronty odečte 1, "odložené" taky
 *   - Co zbude = návrh na střídání (1..N párů), který pulzuje dokud trenér nepotvrdí
 *
 * Pairing:
 *   - OUT: hráč s nejvíce odehranými minutami
 *   - IN: hráč z lavičky s nejméně odehranými minutami (nejdelší odpočinek)
 *   Tím se zátěž rovnoměrně rozkládá.
 */
export interface SubPair {
  out: MatchLineupPlayer;
  in: MatchLineupPlayer;
  outMinutes: number;
  inMinutes: number;
}

export interface SubCandidate {
  player: MatchLineupPlayer;
  minutes: number;       // odehrané minuty celkem
  benchMinutes: number;  // čas na lavici celkem
  stretchMinutes: number; // aktuální střih — od posledního střídání
}

function useSubstitutionQueue(
  match: SeasonMatch,
  elapsed: number,
  dismissedOffset: number,
): {
  pairs: SubPair[];
  nextAlertMinute: number;
  alertActive: boolean;
  elapsedMinutes: number;
  queueSize: number;
  /** Nezobrazený "raw" počet čekajících návrhů (bez cap podle lavice/hřiště).
   *  Používá se pro Odložit — aby jeden klik vyčistil celou frontu. */
  rawPending: number;
  benchCandidates: SubCandidate[];   // všichni z lavičky, seřazení "nejvíc odpočatý první"
  onFieldCandidates: SubCandidate[]; // všichni na hřišti, seřazení "nejvíc unavený první"
} {
  // Pauza nebo ne-live → asistent je neaktivní (trenér zrovna nestřídá).
  if (!match.substitutionSettings || match.status !== 'live' || match.pausedAt) {
    return {
      pairs: [], nextAlertMinute: 0, alertActive: false, elapsedMinutes: 0, queueSize: 0,
      rawPending: 0,
      benchCandidates: [], onFieldCandidates: [],
    };
  }

  const { intervalMinutes, playersAtOnce } = match.substitutionSettings;
  const elapsedMinutes = elapsed / 60;
  const intervalsPassed = Math.floor(elapsedMinutes / intervalMinutes);
  const nextAlertMinute = (intervalsPassed + 1) * intervalMinutes;

  const targetSubs = intervalsPassed * playersAtOnce;
  const actualSubs = match.substitutions.length;

  const bench = match.lineup.filter(p => !p.isStarter);
  const onField = match.lineup.filter(p => p.isStarter);

  const rawQueue = targetSubs - actualSubs - dismissedOffset;
  const queueSize = Math.max(0, Math.min(rawQueue, onField.length, bench.length));
  const rawPending = Math.max(0, rawQueue);

  const playingTime = computePlayingTime(match, elapsedMinutes);
  const stretchTime = computeCurrentStretch(match, elapsedMinutes);
  const elapsedMinsInt = Math.max(0, Math.round(elapsedMinutes));

  // OUT: primárně podle aktuálního střihu (nejdelší nepřetržitá účast nejvíc unavený),
  // fallback na total playing time (např. když nikdo nestřídal, střih = total)
  const onFieldCandidates: SubCandidate[] = [...onField]
    .map(p => {
      const m = Math.round(playingTime.get(p.playerId) ?? 0);
      const s = Math.round(stretchTime.get(p.playerId) ?? 0);
      return { player: p, minutes: m, benchMinutes: Math.max(0, elapsedMinsInt - m), stretchMinutes: s };
    })
    .sort((a, b) => b.stretchMinutes - a.stretchMinutes || b.minutes - a.minutes);

  // IN: primárně podle aktuálního střihu na lavici (nejdelší odpočinek první),
  // fallback na total playing time (kdo hrál míň celkově)
  const benchCandidates: SubCandidate[] = [...bench]
    .map(p => {
      const m = Math.round(playingTime.get(p.playerId) ?? 0);
      const s = Math.round(stretchTime.get(p.playerId) ?? 0);
      return { player: p, minutes: m, benchMinutes: Math.max(0, elapsedMinsInt - m), stretchMinutes: s };
    })
    .sort((a, b) => b.stretchMinutes - a.stretchMinutes || a.minutes - b.minutes);

  const pairs: SubPair[] = [];
  for (let i = 0; i < queueSize; i++) {
    const out = onFieldCandidates[i];
    const inC = benchCandidates[i];
    if (!out || !inC) break;
    pairs.push({
      out: out.player,
      in: inC.player,
      outMinutes: out.minutes,
      inMinutes: inC.minutes,
    });
  }

  return {
    pairs, nextAlertMinute,
    alertActive: queueSize > 0,
    elapsedMinutes, queueSize, rawPending,
    benchCandidates, onFieldCandidates,
  };
}

// (QuickGoalFlash removed — goal feedback is now inline on the score card)

// ── Inline goal edit (assign scorer to quick-added goal) ──

function InlineGoalEdit({ match, goal, onClose }: {
  match: SeasonMatch; goal: MatchGoal; onClose: () => void;
}) {
  const { t } = useI18n();
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const onFieldPlayers = match.lineup.filter(p => p.isStarter);

  const handleAssignScorer = (scorerId: string | null, assistId?: string | null) => {
    const updatedGoals = match.goals.map(g =>
      g.id === goal.id ? { ...g, scorerId, assistId: assistId ?? null } : g
    );
    updateMatch(match.id, { goals: updatedGoals });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '16px 16px 32px',
          width: '100%', maxWidth: 480, maxHeight: '75dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontWeight: 800, fontSize: 17, margin: 0 }}>
            ⚽ {t('match.field.assignScorer')}
          </h3>
          <button onClick={onClose} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 10, background: 'var(--surface-var)',
            fontSize: 15, color: 'var(--text-muted)', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Minute badge */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginBottom: 14, fontSize: 12, color: 'var(--text-muted)',
        }}>
          <span style={{
            padding: '2px 10px', borderRadius: 10, background: 'var(--primary-light)',
            fontWeight: 700, color: 'var(--primary)',
          }}>{goal.minute}'</span>
          <span>{t('match.detail.whoScored')}</span>
        </div>

        {/* Player grid — 2 columns for quick tapping */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 10 }}>
          {onFieldPlayers.map(p => (
            <button
              key={p.playerId}
              onClick={() => handleAssignScorer(p.playerId)}
              style={{
                padding: '10px 8px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                background: 'var(--surface-var)', border: '1.5px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 8, background: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>{p.jerseyNumber}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            </button>
          ))}
        </div>

        {/* Unknown scorer — less prominent at bottom */}
        <button
          onClick={() => handleAssignScorer(null)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: 'transparent', color: 'var(--text-muted)', textAlign: 'center',
            border: '1px dashed var(--border)', cursor: 'pointer',
          }}
        >
          {t('match.detail.unknownScorer')}
        </button>
      </div>
    </div>
  );
}

// ── Configurable field panels ──

type FieldPanel = 'cards' | 'subs';

function loadFieldPanels(matchId: string): Set<FieldPanel> {
  try {
    const stored = localStorage.getItem(`torq-field-panels-${matchId}`);
    if (stored) return new Set(JSON.parse(stored));
  } catch { /* ignore */ }
  return new Set(['cards', 'subs']); // default: all on
}

function saveFieldPanels(matchId: string, panels: Set<FieldPanel>) {
  localStorage.setItem(`torq-field-panels-${matchId}`, JSON.stringify([...panels]));
}

// ── Period label helper ──

function getPeriodLabel(t: (k: string, p?: Record<string, string | number>) => string, periods: number, current: number): string {
  if (periods === 1) return t('match.period.single');
  if (periods === 2) return t('match.period.half', { n: current });
  if (periods === 3) return t('match.period.third', { n: current });
  return t('match.period.quarter', { n: current });
}

// ── LiveTab component ──

export function LiveTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  // Název klubu — z match dat, nebo z aktivního klubu v store
  const activeClub = useClubsStore(s => s.clubs.find(c => c.id === match.clubId));
  const clubDisplayName = match.clubName || activeClub?.name || t('match.detail.us');
  const [elapsed, setElapsed] = useState(() => computeElapsed(match));
  const [goalModal, setGoalModal] = useState<'ours' | 'theirs' | null>(null);
  const [cardModal, setCardModal] = useState(false);
  const [subModal, setSubModal] = useState(false);

  // Při pauze nebo ukončení zápasu automaticky zavři modal střídání — trenér
  // během pauzy nestřídá (může mít poločas, přestávku atd.).
  useEffect(() => {
    if ((match.pausedAt || match.status !== 'live') && subModal) {
      setSubModal(false);
    }
  }, [match.pausedAt, match.status, subModal]);
  const [quickFlash, setQuickFlash] = useState<'ours' | 'theirs' | null>(null);
  const [editingGoal, setEditingGoal] = useState<MatchGoal | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [enabledPanels, setEnabledPanels] = useState<Set<FieldPanel>>(() => loadFieldPanels(match.id));
  const [showVeoInput, setShowVeoInput] = useState(false);
  const [veoInputValue, setVeoInputValue] = useState('');

  // Auto-dismiss quickFlash after 1.5s
  useEffect(() => {
    if (!quickFlash) return;
    const t = setTimeout(() => setQuickFlash(null), 1500);
    return () => clearTimeout(t);
  }, [quickFlash]);

  // Undo toast for quick goals
  const [undoToast, setUndoToast] = useState<{ goalId: string; side: 'ours' | 'theirs' } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sub undo toast — po batch střídání ukáž "↶ Zrušit" na 8s
  const [subUndoToast, setSubUndoToast] = useState<{ subIds: string[]; count: number } | null>(null);
  const subUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wake lock — keep screen on during live match
  useWakeLock(match.status === 'live');

  // Landscape detection — show fullscreen scoreboard when phone rotated
  const isLandscape = useLandscape();

  const startMatch = useMatchesStore(s => s.startMatch);
  const finishMatch = useMatchesStore(s => s.finishMatch);
  const pauseMatch = useMatchesStore(s => s.pauseMatch);
  const resumeMatch = useMatchesStore(s => s.resumeMatch);
  const addGoal = useMatchesStore(s => s.addGoal);
  const addCard = useMatchesStore(s => s.addCard);
  const addSubstitution = useMatchesStore(s => s.addSubstitution);
  const undoSubstitutions = useMatchesStore(s => s.undoSubstitutions);
  const removeGoal = useMatchesStore(s => s.removeGoal);
  const updateMatch = useMatchesStore(s => s.updateMatch);

  // Cross-team pairing perspective — pro away coach flippujeme tlačítka a názvy.
  // „Můj gól" away coach-e = `isOpponentGoal: true` z creator pohledu.
  const perspective = useMatchPerspective(match);
  const isAwayView = perspective.role === 'away';

  // Haptic feedback helper
  const vibrate = (ms: number | number[] = 30) => {
    try { navigator.vibrate?.(ms); } catch { /* not supported */ }
  };

  // Tick timer
  // Použij ref k aktuálnímu match, aby se interval nezakládal znovu při každém
  // Firebase sync (dřív dep `[match]` → každá změna zápasu = clearInterval + setInterval
  // → parazitní re-renders a jank).
  const matchRef = useRef(match);
  useEffect(() => { matchRef.current = match; }, [match]);

  useEffect(() => {
    if (match.status !== 'live' || match.pausedAt) return;
    const interval = setInterval(() => setElapsed(computeElapsed(matchRef.current)), 1000);
    return () => clearInterval(interval);
  }, [match.status, match.pausedAt]);

  // Sync elapsed on match timing data change (start/pause/resume)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsed(computeElapsed(match));
  }, [match.startedAt, match.pausedAt, match.pausedElapsed]);

  // Počet "odložených" návrhů — trenér klikl na "Odložit", zmizí dokud nepřijde další interval
  const [dismissedOffset, setDismissedOffset] = useState(0);
  const {
    alertActive, nextAlertMinute, pairs, queueSize, rawPending, elapsedMinutes,
    benchCandidates, onFieldCandidates,
  } = useSubstitutionQueue(match, elapsed, dismissedOffset);

  // Pro kompatibilitu s původní SubstitutionModal — posílá první návrh
  const suggestedOut = pairs.map(p => p.out);
  const suggestedIn = pairs.map(p => p.in);

  // Multi-select: trenér označí 1–N hráčů ven a 1–N hráčů dovnitř, pak dá "Provést"
  const [selectedOutIds, setSelectedOutIds] = useState<string[]>([]);
  const [selectedInIds, setSelectedInIds] = useState<string[]>([]);

  // Resetnout výběr kdykoli fronta spadne na 0 (vyřešeno)
  useEffect(() => {
    if (queueSize === 0) {
      if (selectedOutIds.length > 0) setSelectedOutIds([]);
      if (selectedInIds.length > 0) setSelectedInIds([]);
    }
  }, [queueSize, selectedOutIds.length, selectedInIds.length]);

  // Haptické upozornění při nárůstu fronty (nový návrh vznikl)
  const prevQueueRef = useRef(queueSize);
  useEffect(() => {
    if (queueSize > prevQueueRef.current) {
      try { navigator.vibrate?.([60, 60, 60]); } catch { /* ignore */ }
    }
    prevQueueRef.current = queueSize;
  }, [queueSize]);

  // Toggle výběru v obou sloupcích (tap přidá / odebere)
  // Jakmile má uživatel na obou stranách stejný počet, tap na přebývající
  // stranu by porušil párování — ale povolíme to (coach to ihned vidí v UI
  // a confirm button hlásí "chybí X").
  const toggleOut = (id: string) => {
    try { navigator.vibrate?.(15); } catch { /* ignore */ }
    setSelectedOutIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleIn = (id: string) => {
    try { navigator.vibrate?.(15); } catch { /* ignore */ }
    setSelectedInIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Provést batch střídání — VYŽADUJE exact count match (žádné zahození hráče)
  const handleConfirmBatch = () => {
    const out = selectedOutIds.length;
    const inn = selectedInIds.length;
    if (out === 0 || inn === 0 || out !== inn) return;
    try { navigator.vibrate?.([40, 30, 40]); } catch { /* ignore */ }
    const minute = Math.max(0, Math.round(elapsedMinutes));
    const newSubIds: string[] = [];
    for (let i = 0; i < out; i++) {
      const id = addSubstitution(match.id, {
        playerOutId: selectedOutIds[i],
        playerInId: selectedInIds[i],
        minute,
      });
      if (id) newSubIds.push(id);
    }
    setSelectedOutIds([]);
    setSelectedInIds([]);

    // Ukaž undo toast na 8 s
    if (subUndoTimerRef.current) clearTimeout(subUndoTimerRef.current);
    setSubUndoToast({ subIds: newSubIds, count: out });
    subUndoTimerRef.current = setTimeout(() => {
      setSubUndoToast(null);
      subUndoTimerRef.current = null;
    }, 8000);
  };

  // Odložit VŠECHNY aktuální návrhy — znovu se objeví až po dalším intervalu.
  // Používáme rawPending (bez cap podle lavice/hřiště), aby jeden klik vyčistil
  // frontu kompletně. Jinak by se čekající nad limit lavice neodstranili.
  const handleDismissQueue = () => {
    setDismissedOffset(d => d + rawPending);
    setSelectedOutIds([]);
    setSelectedInIds([]);
  };

  // Confirm button state
  const outCount = selectedOutIds.length;
  const inCount = selectedInIds.length;
  const canConfirm = outCount > 0 && outCount === inCount;
  // Lidsky srozumitelná diagnoza proč confirm není hotový
  const confirmHint = (() => {
    if (outCount === 0 && inCount === 0) return 'subSelectBoth';
    if (outCount > inCount) return 'subSelectMoreIn';
    if (inCount > outCount) return 'subSelectMoreOut';
    return null;
  })();

  const periods = match.periods ?? 2;
  const periodDuration = match.periodDurationMinutes ?? Math.round(match.durationMinutes / periods);
  const periodSeconds = periodDuration * 60;
  const currentPeriod = match.currentPeriod ?? 1;

  // Per-period progress
  const periodElapsed = elapsed - (currentPeriod - 1) * periodSeconds;
  const periodRemaining = Math.max(0, periodSeconds - periodElapsed);
  const isPeriodOvertime = periodElapsed > periodSeconds;
  const periodProgress = Math.min(1, periodElapsed / periodSeconds);
  // Total progress
  // (isOvertime/progress/remaining derivations reserved for future UI)

  // Signál "konec periody" — pipnutí + banner hned jak čas vyprší
  // Uložíme v ref, abychom pipli jen JEDNOU při přechodu přes 0
  const periodEndAnnouncedRef = useRef<number>(-1);
  useEffect(() => {
    if (match.status !== 'live' || match.pausedAt) return;
    if (!isPeriodOvertime) return;
    // Pipni jen jednou pro každý period index
    if (periodEndAnnouncedRef.current === currentPeriod) return;
    periodEndAnnouncedRef.current = currentPeriod;
    try { navigator.vibrate?.([150, 80, 150]); } catch { /* ignore */ }
  }, [isPeriodOvertime, currentPeriod, match.status, match.pausedAt]);

  const getPlayerName = (playerId: string | null) =>
    playerId ? (match.lineup.find(p => p.playerId === playerId)?.name ?? '?') : t('match.detail.unknown');

  const ask = useConfirmStore(s => s.ask);

  const handleFinish = async () => {
    const ok = await ask({ title: t('confirm.endMatch'), message: t('confirm.endMatchMsg') });
    if (ok) finishMatch(match.id);
  };

  // Quick goal — one tap, auto-minute, no modal + undo/scorer toast.
  // `side: 'ours'` znamená „z pohledu aktuálně přihlášeného trenéra". Pro away
  // coach-e to je opposite v datech (isOpponentGoal: true) — creator je v datech
  // pořád „home", takže musíme flipnout.
  const handleQuickGoal = (side: 'ours' | 'theirs') => {
    vibrate(side === 'ours' ? 50 : [30, 30, 30]);
    const minute = Math.max(1, Math.floor(elapsed / 60) + 1);
    // Away coach: „náš" (ours) → opponent goal v datech; „jejich" (theirs) → creator goal.
    const isOpponentGoal = isAwayView ? side === 'ours' : side === 'theirs';
    const goalId = addGoal(match.id, {
      scorerId: null,
      assistId: null,
      isOwnGoal: false,
      isOpponentGoal,
      minute,
    });
    setQuickFlash(side);

    // Zobraz undo/scorer toast — 8s pro náš gól (čas na výběr střelce), 5s pro soupeřův
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast({ goalId, side });
    undoTimerRef.current = setTimeout(() => {
      setUndoToast(null);
      undoTimerRef.current = null;
    }, side === 'ours' ? 8000 : 5000);
  };

  // Přiřadit střelce ke gólu z inline pickeru
  const assignScorerToGoal = (goalId: string, scorerId: string | null) => {
    vibrate(30);
    const updatedGoals = match.goals.map(g =>
      g.id === goalId ? { ...g, scorerId, assistId: g.assistId ?? null } : g
    );
    updateMatch(match.id, { goals: updatedGoals });
    setUndoToast(null);
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
  };

  // Long-press for detailed goal modal
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleGoalPointerDown = (side: 'ours' | 'theirs') => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      vibrate(80);
      setGoalModal(side);
    }, 500);
  };

  const handleGoalPointerUp = (side: 'ours' | 'theirs') => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressTriggered.current) {
      handleQuickGoal(side);
    }
  };

  const handleGoalPointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const togglePanel = (panel: FieldPanel) => {
    setEnabledPanels(prev => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel); else next.add(panel);
      saveFieldPanels(match.id, next);
      return next;
    });
  };

  // "Our" vs "their" skóre — bere v potaz perspective (pro away coach flipped).
  const ourScore = perspective.myScore;
  const theirScore = perspective.theirScore;

  const hasBench = match.lineup.some(p => !p.isStarter);
  const showCards = enabledPanels.has('cards');
  const showSubs = enabledPanels.has('subs') && hasBench;

  // Remember if hint was already shown
  const [hintDismissed] = useState(() => {
    try { return !!localStorage.getItem('torq_goal_hint_seen'); } catch { return false; }
  });

  return (
    <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .7; }
        }
        @keyframes undoToastSlide {
          0% { transform: translateY(-20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes undoToastSlideUp {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes scoreFlash {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes goalCardTint {
          0% { opacity: .35; }
          60% { opacity: .35; }
          100% { opacity: 0; }
        }
        @keyframes goalShimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes goalBannerFade {
          0% { opacity: 0; transform: translateY(4px); }
          15% { opacity: 1; transform: translateY(0); }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Away coach info — vysvětli omezení (nemá svou sestavu, jen score) */}
      {isAwayView && match.status === 'live' && (
        <div style={{
          margin: '8px 16px 0',
          padding: '8px 12px', borderRadius: 10,
          background: 'var(--surface-var)', border: '1px solid var(--border)',
          fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4,
        }}>
          ℹ️ {t('matchPairing.awayLimitationHint')}
        </div>
      )}

      {/* Landscape fullscreen scoreboard */}
      {isLandscape && match.status === 'live' && (
        <LandscapeScoreboard
          match={match}
          elapsed={elapsed}
          onQuickGoal={handleQuickGoal}
          onPause={() => { vibrate(); pauseMatch(match.id); }}
          onResume={() => { vibrate(); resumeMatch(match.id); }}
          t={t}
          myTeamName={perspective.myTeamName}
          theirTeamName={perspective.theirTeamName}
          myScore={perspective.myScore}
          theirScore={perspective.theirScore}
        />
      )}

      {/* Undo / scorer picker toast */}
      {undoToast && (() => {
        const isOurs = undoToast.side === 'ours';
        // Scorer picker má smysl jen když mám lineup (== home coach / viewer).
        // Away coach vidí jen undo — nemá svoji sestavu v datech.
        let currentOnField: MatchLineupPlayer[] = [];
        if (isOurs && !isAwayView) {
          const onFieldIds = new Set(match.lineup.filter(p => p.isStarter).map(p => p.playerId));
          for (const sub of match.substitutions) {
            onFieldIds.delete(sub.playerOutId);
            onFieldIds.add(sub.playerInId);
          }
          currentOnField = match.lineup
            .filter(p => onFieldIds.has(p.playerId))
            .sort((a, b) => a.jerseyNumber - b.jerseyNumber);
        }
        const currentGoal = match.goals.find(g => g.id === undoToast.goalId);
        const hasScorer = !!currentGoal?.scorerId;
        // Toast se objeví NAD sticky gólovými tlačítky (v dosahu palce).
        // Pozice: fixed bottom, nad sticky footerem s goal buttons (~156px vysoké) + safe-area.
        return (
          <div style={{
            position: 'fixed',
            bottom: 'calc(168px + env(safe-area-inset-bottom, 0px))',
            left: 16, right: 16, zIndex: 150,
            padding: '10px 14px', borderRadius: 14,
            background: isOurs ? '#1B5E20' : '#B71C1C',
            color: '#fff', boxShadow: '0 -4px 20px rgba(0,0,0,.3)',
            animation: 'undoToastSlideUp .25s ease-out',
            maxWidth: 480, marginLeft: 'auto', marginRight: 'auto',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {/* Header: goal recorded + undo */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>
                ⚽ {isOurs ? t('match.detail.goalRecorded') : t('match.detail.opponentGoalRecorded')}
                {hasScorer && currentGoal && (() => {
                  const scorer = match.lineup.find(p => p.playerId === currentGoal.scorerId);
                  return scorer ? ` · ${scorer.name}` : '';
                })()}
              </span>
              <button
                onClick={() => {
                  removeGoal(match.id, undoToast.goalId);
                  setUndoToast(null);
                  if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
                  vibrate();
                }}
                style={{
                  padding: '6px 14px', borderRadius: 10, fontWeight: 800, fontSize: 12,
                  background: 'rgba(255,255,255,.25)', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0,
                }}
              >
                ↶ {t('match.detail.undo')}
              </button>
            </div>

            {/* Inline scorer picker — jen pro náš gól, jen pokud nebyl ještě přiřazen */}
            {isOurs && !hasScorer && currentOnField.length > 0 && (
              <>
                <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginTop: 2 }}>
                  {t('match.detail.whoScored')}
                </div>
                <div style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap',
                }}>
                  {currentOnField.slice(0, 8).map(p => (
                    <button
                      key={p.playerId}
                      onClick={() => assignScorerToGoal(undoToast.goalId, p.playerId)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: 'rgba(255,255,255,.18)', color: '#fff',
                        padding: '5px 9px', borderRadius: 8,
                        border: '1px solid rgba(255,255,255,.25)',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        minWidth: 0, maxWidth: '100%',
                      }}
                    >
                      <span style={{
                        background: 'rgba(255,255,255,.25)', color: '#fff',
                        padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 900,
                        flexShrink: 0,
                      }}>{p.jerseyNumber}</span>
                      <span style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{p.name}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      // Skip — jen zavři toast, scorer zůstane null
                      setUndoToast(null);
                      if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
                    }}
                    style={{
                      background: 'transparent', color: 'rgba(255,255,255,.75)',
                      padding: '5px 9px', borderRadius: 8,
                      border: '1px dashed rgba(255,255,255,.35)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {t('match.detail.scorerUnknown')}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Sub undo toast — nad sticky gólovými tlačítky v dosahu palce */}
      {subUndoToast && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(168px + env(safe-area-inset-bottom, 0px))',
          left: 16, right: 16, zIndex: 150,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 14,
          background: 'var(--primary)', color: '#fff',
          boxShadow: '0 -4px 20px rgba(0,0,0,.3)',
          animation: 'undoToastSlideUp .25s ease-out',
          maxWidth: 480, marginLeft: 'auto', marginRight: 'auto',
        }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            🔄 {t('match.detail.subDone', { count: subUndoToast.count })}
          </span>
          <button
            onClick={() => {
              undoSubstitutions(match.id, subUndoToast.subIds);
              setSubUndoToast(null);
              if (subUndoTimerRef.current) { clearTimeout(subUndoTimerRef.current); subUndoTimerRef.current = null; }
              vibrate();
            }}
            style={{
              padding: '6px 14px', borderRadius: 10, fontWeight: 800, fontSize: 12,
              background: 'rgba(255,255,255,.25)', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            ↶ {t('match.detail.undo')}
          </button>
        </div>
      )}

      {/* Period end banner — viditelný signál že uběhla doba periody */}
      {match.status === 'live' && isPeriodOvertime && (
        <div style={{
          background: 'linear-gradient(135deg, #FF6F00 0%, #E65100 100%)',
          color: '#fff', borderRadius: 14,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          boxShadow: '0 2px 10px rgba(230,81,0,.3)',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>
            ⏰ {currentPeriod < periods
              ? t('match.detail.periodOvertimeHalftime')
              : t('match.detail.periodOvertimeFinish')}
          </span>
          <span style={{ fontSize: 12, opacity: 0.85 }}>
            +{formatTime(periodElapsed - periodSeconds)}
          </span>
        </div>
      )}

      {/* ── Score card with integrated timer — compact, no duplicate header ── */}
      <div style={{
        background: match.status === 'live' ? 'var(--primary)' : 'var(--surface)',
        borderRadius: 20, padding: match.status === 'live' ? '14px 20px 18px' : '20px',
        boxShadow: match.status === 'live' ? '0 4px 20px rgba(21,101,192,.30)' : '0 1px 4px rgba(0,0,0,.06)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Goal flash tint overlay — contained within score card */}
        {quickFlash && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 20,
            background: quickFlash === 'ours' ? 'rgba(46,125,50,.5)' : 'rgba(198,40,40,.45)',
            animation: 'goalCardTint 1.5s ease-out forwards',
            pointerEvents: 'none', zIndex: 1,
          }} />
        )}
        {/* Shimmer overlay */}
        {quickFlash && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 20,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,213,79,.3) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'goalShimmer 1s ease-out forwards',
            pointerEvents: 'none', zIndex: 1,
          }} />
        )}
        {/* Timer — compact inline layout for live */}
        {match.status === 'live' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            {/* LIVE / PAUSED badge */}
            <span style={{
              padding: '2px 10px', borderRadius: 6, fontSize: 10, fontWeight: 800, letterSpacing: 1,
              background: match.pausedAt ? 'rgba(255,152,0,.3)' : 'rgba(76,175,80,.3)',
              color: match.pausedAt ? '#FFD54F' : '#A5D6A7',
              animation: match.pausedAt ? undefined : 'pulse 2s infinite',
            }}>
              {match.pausedAt ? t('match.detail.pausedBadge') : t('match.detail.liveBadge')}
            </span>
            {periods > 1 && (
              <span style={{
                padding: '2px 10px', borderRadius: 6,
                background: 'rgba(255,255,255,.2)', fontSize: 11, fontWeight: 700, color: '#fff',
              }}>
                {getPeriodLabel(t, periods, currentPeriod)}
              </span>
            )}
            <span style={{
              fontFeatureSettings: '"tnum"', fontWeight: 900, fontSize: 28,
              color: isPeriodOvertime ? '#FFD54F' : '#fff', letterSpacing: 2,
            }}>
              {isPeriodOvertime ? '+' : ''}{formatTime(isPeriodOvertime ? periodElapsed - periodSeconds : periodRemaining)}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.65)' }}>
              {Math.floor(elapsed / 60)}'
            </span>
          </div>
        )}
        {match.status === 'planned' && (
          <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>{t('match.detail.notStarted')}</div>
        )}
        {match.status === 'finished' && (
          <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>{t('match.detail.finished')}</div>
        )}

        {/* Score — large, clear */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: match.status === 'live' ? 'rgba(255,255,255,.7)' : 'var(--text-muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {clubDisplayName}
            </div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: match.status === 'live' ? '#fff' : 'var(--text)', animation: quickFlash === 'ours' ? 'scoreFlash .5s ease-out' : undefined }}>
              {ourScore}
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: match.status === 'live' ? 'rgba(255,255,255,.5)' : 'var(--text-muted)' }}>:</div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: match.status === 'live' ? 'rgba(255,255,255,.7)' : 'var(--text-muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.opponent}
            </div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: match.status === 'live' ? '#fff' : 'var(--text)', animation: quickFlash === 'theirs' ? 'scoreFlash .5s ease-out' : undefined }}>
              {theirScore}
            </div>
          </div>
        </div>

        {/* Goal banner — brief inline flash */}
        {quickFlash && (
          <div style={{
            textAlign: 'center', marginTop: 8, fontSize: 14, fontWeight: 800,
            color: '#fff', letterSpacing: 1,
            animation: 'goalBannerFade 1.5s ease-out forwards',
            position: 'relative', zIndex: 2,
          }}>
            ⚽ GÓÓL!
          </div>
        )}

        {/* Progress bar + pause — under score, minimal */}
        {match.status === 'live' && (
          <>
            <div style={{ height: 3, background: 'rgba(255,255,255,.2)', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${periodProgress * 100}%`, background: isPeriodOvertime ? '#FFD54F' : '#fff', borderRadius: 3, transition: 'width .5s' }} />
            </div>
          </>
        )}
      </div>

      {/* ── Sub alert — multi-select: označ N ven, N dovnitř, proveď batch ── */}
      {alertActive && match.status === 'live' && hasBench && (() => {
        return (
          <div style={{
            background: 'linear-gradient(135deg, #FF6F00 0%, #E65100 100%)',
            borderRadius: 16, padding: '12px 10px 10px',
            boxShadow: '0 0 0 2px #E65100, 0 6px 20px rgba(230,81,0,.35)',
            animation: 'pulse 1.4s ease-in-out infinite',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 18 }}>🔄</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 14, color: '#fff', lineHeight: 1.1 }}>
                    {t('match.detail.subAlert')}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'rgba(255,255,255,.9)', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t('match.detail.subMultiHint')}
                  </div>
                </div>
              </div>
              <span style={{
                background: 'rgba(255,255,255,.18)', color: '#fff',
                borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 800, flexShrink: 0,
              }}>
                {queueSize}×
              </span>
            </div>

            {/* Dvousloupce — DOLŮ (armuj) | NAHORU (tap = proveď) */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
              background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: 6,
              maxHeight: 360, overflowY: 'auto',
            }}>
              {/* OUT sloupec — multi-select, pořadí = pořadí tapů */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <div style={{
                  fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 0.5,
                  textAlign: 'center', padding: '2px 0', position: 'sticky', top: 0,
                  background: 'rgba(230,81,0,.85)', backdropFilter: 'blur(8px)', zIndex: 1,
                }}>
                  ↓ {t('match.detail.subOutCol')} {selectedOutIds.length > 0 && `(${selectedOutIds.length})`}
                </div>
                {onFieldCandidates.map((c) => {
                  const orderIdx = selectedOutIds.indexOf(c.player.playerId);
                  const isSelected = orderIdx !== -1;
                  return (
                    <button
                      key={c.player.playerId}
                      onClick={() => toggleOut(c.player.playerId)}
                      style={{
                        position: 'relative',
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: isSelected ? '#fff' : 'rgba(255,255,255,.92)',
                        color: 'var(--text)',
                        borderRadius: 10, padding: '8px 8px',
                        cursor: 'pointer', textAlign: 'left',
                        border: isSelected ? '2px solid var(--danger)' : '2px solid transparent',
                        boxShadow: isSelected ? '0 2px 8px rgba(198,40,40,.3)' : 'none',
                        minWidth: 0,
                      }}
                    >
                      <span style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: 'var(--danger-light)', color: 'var(--danger)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 900,
                      }}>{c.player.jerseyNumber}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontWeight: 700, fontSize: 12,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {c.player.name}
                        </div>
                        <div style={{
                          fontSize: 11, fontWeight: 800,
                          color: c.stretchMinutes >= 15 ? 'var(--danger)'
                            : c.stretchMinutes >= 10 ? 'var(--warning)'
                            : 'var(--text-muted)',
                        }}>
                          {c.stretchMinutes}' {t('match.detail.subOnFieldNow')}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={{
                          position: 'absolute', top: 4, right: 4,
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'var(--danger)', color: '#fff',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 900,
                        }}>{orderIdx + 1}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* IN sloupec — multi-select, pořadí = pořadí tapů */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <div style={{
                  fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 0.5,
                  textAlign: 'center', padding: '2px 0', position: 'sticky', top: 0,
                  background: 'rgba(230,81,0,.85)', backdropFilter: 'blur(8px)', zIndex: 1,
                }}>
                  ↑ {t('match.detail.subInCol')} {selectedInIds.length > 0 && `(${selectedInIds.length})`}
                </div>
                {benchCandidates.map((c) => {
                  const orderIdx = selectedInIds.indexOf(c.player.playerId);
                  const isSelected = orderIdx !== -1;
                  return (
                    <button
                      key={c.player.playerId}
                      onClick={() => toggleIn(c.player.playerId)}
                      style={{
                        position: 'relative',
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: isSelected ? '#fff' : 'rgba(255,255,255,.92)',
                        color: 'var(--text)',
                        borderRadius: 10, padding: '8px 8px',
                        cursor: 'pointer', textAlign: 'left',
                        border: isSelected ? '2px solid var(--success)' : '2px solid transparent',
                        boxShadow: isSelected ? '0 2px 8px rgba(46,125,50,.3)' : 'none',
                        minWidth: 0,
                      }}
                    >
                      <span style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: 'var(--success-light)', color: 'var(--success)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 900,
                      }}>{c.player.jerseyNumber}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontWeight: 700, fontSize: 12,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {c.player.name}
                        </div>
                        <div style={{
                          fontSize: 11, fontWeight: 800,
                          color: c.stretchMinutes >= 15 ? 'var(--success)'
                            : c.stretchMinutes >= 10 ? 'var(--primary)'
                            : 'var(--text-muted)',
                        }}>
                          {c.stretchMinutes}' {t('match.detail.subOnBenchNow')}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={{
                          position: 'absolute', top: 4, right: 4,
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'var(--success)', color: '#fff',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 900,
                        }}>{orderIdx + 1}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Velké potvrzovací tlačítko — VYŽADUJE stejný počet OUT a IN */}
            <button
              onClick={handleConfirmBatch}
              disabled={!canConfirm}
              style={{
                background: canConfirm ? '#fff' : 'rgba(255,255,255,.4)',
                color: canConfirm ? '#E65100' : 'rgba(255,255,255,.9)',
                border: 'none', borderRadius: 12,
                padding: '12px', fontWeight: 900, fontSize: 15,
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                boxShadow: canConfirm ? '0 3px 10px rgba(0,0,0,.2)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {canConfirm
                ? `✓ ${t('match.detail.subExecuteN', { count: outCount })}`
                : confirmHint === 'subSelectBoth'
                  ? t('match.detail.subSelectBoth')
                  : confirmHint === 'subSelectMoreIn'
                    ? t('match.detail.subSelectMoreInN', { missing: outCount - inCount })
                    : t('match.detail.subSelectMoreOutN', { missing: inCount - outCount })
              }
            </button>

            {/* Sekundární akce */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleDismissQueue}
                style={{
                  flex: 1, background: 'rgba(255,255,255,.15)', color: '#fff',
                  border: '1px solid rgba(255,255,255,.25)', borderRadius: 10,
                  padding: '8px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >
                ⏭ {t('match.detail.subPostpone')}
              </button>
              <button
                onClick={() => setSubModal(true)}
                style={{
                  flex: 1, background: 'rgba(255,255,255,.15)', color: '#fff',
                  border: '1px solid rgba(255,255,255,.25)', borderRadius: 10,
                  padding: '8px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >
                ⚙️ {t('match.detail.subManualPick')}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Next sub info — jen když fronta je prázdná */}
      {!alertActive && match.status === 'live' && match.substitutionSettings && hasBench && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>{t('match.detail.nextSub')}</span>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{Math.ceil(nextAlertMinute)}'</span>
        </div>
      )}

      {/* Pre-match checklist — viditelný signál co je připravené, co ne */}
      {match.status === 'planned' && (() => {
        const starters = match.lineup.filter(p => p.isStarter);
        const targetStarters = match.matchFormat ? formatToStarterCount(match.matchFormat) : 11;
        const bench = match.lineup.filter(p => !p.isStarter);
        const checks = [
          {
            ok: starters.length >= targetStarters,
            label: t('match.detail.checkLineup', { n: starters.length, target: targetStarters }),
          },
          {
            ok: bench.length > 0,
            label: t('match.detail.checkBench', { n: bench.length }),
            soft: true, // "nice to have" — not blocking
          },
          {
            ok: !!match.venue?.trim(),
            label: match.venue?.trim() ? t('match.detail.checkVenueOk', { venue: match.venue }) : t('match.detail.checkVenueMissing'),
            soft: true,
          },
          {
            ok: !!match.kickoffTime,
            label: match.kickoffTime ? t('match.detail.checkKickoffOk', { time: match.kickoffTime }) : t('match.detail.checkKickoffMissing'),
          },
        ];
        const allReady = checks.filter(c => !c.soft).every(c => c.ok);
        return (
          <div style={{
            background: allReady ? 'var(--success-light)' : 'var(--warning-light)',
            borderRadius: 14, padding: '12px 14px',
            border: `1px solid ${allReady ? 'var(--success)' : 'var(--warning)'}`,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{
              fontWeight: 800, fontSize: 13,
              color: allReady ? 'var(--success)' : 'var(--warning)',
            }}>
              {allReady ? `✅ ${t('match.detail.checkReady')}` : `⚠️ ${t('match.detail.checkNotReady')}`}
            </div>
            {checks.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12,
                color: c.ok ? 'var(--success)' : c.soft ? 'var(--text-muted)' : 'var(--warning)',
                opacity: c.soft && !c.ok ? 0.75 : 1,
              }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{c.ok ? '✅' : c.soft ? '·' : '⚠'}</span>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Action buttons (sticky during live) ── */}
      <div style={match.status === 'live' ? {
        position: 'sticky', bottom: 0, zIndex: 20,
        background: 'var(--bg)', paddingTop: 10, paddingBottom: 4,
        marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16,
        boxShadow: '0 -4px 12px rgba(0,0,0,.08)',
      } : undefined}>
      {match.status === 'planned' && (
        <button
          onClick={async () => {
            vibrate(50);
            const ok = await ask({ title: t('confirm.startMatch'), message: t('confirm.startMatchMsg') });
            if (ok) startMatch(match.id);
          }}
          style={{
            width: '100%', padding: '18px', borderRadius: 16, fontWeight: 800, fontSize: 18,
            background: 'var(--success)', color: '#fff', boxShadow: '0 4px 12px rgba(46,125,50,.30)',
          }}
        >
          {t('match.detail.startMatch')}
        </button>
      )}

      {match.status === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* ── SCORING BUTTONS — sport-aware (goal pro fotbal, set pro tenis) ── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onPointerDown={() => handleGoalPointerDown('ours')}
              onPointerUp={() => handleGoalPointerUp('ours')}
              onPointerLeave={handleGoalPointerLeave}
              onContextMenu={e => e.preventDefault()}
              style={{
                flex: 1, padding: '24px 10px', borderRadius: 18, fontWeight: 900, fontSize: 20,
                background: 'var(--success)', color: '#fff',
                boxShadow: '0 4px 16px rgba(46,125,50,.35)',
                userSelect: 'none', WebkitUserSelect: 'none',
                touchAction: 'manipulation',
                letterSpacing: 0.5,
              }}
            >
              {match.sport === 'tennis' ? `🎾 ${t('match.detail.ourSetBtn')}` : `⚽ ${t('match.detail.ourGoalBtn')}`}
            </button>
            <button
              onPointerDown={() => handleGoalPointerDown('theirs')}
              onPointerUp={() => handleGoalPointerUp('theirs')}
              onPointerLeave={handleGoalPointerLeave}
              onContextMenu={e => e.preventDefault()}
              style={{
                flex: 1, padding: '24px 10px', borderRadius: 18, fontWeight: 900, fontSize: 20,
                background: 'var(--danger)', color: '#fff',
                boxShadow: '0 4px 16px rgba(198,40,40,.30)',
                userSelect: 'none', WebkitUserSelect: 'none',
                touchAction: 'manipulation',
                letterSpacing: 0.5,
              }}
            >
              {match.sport === 'tennis' ? `🎾 ${t('match.detail.opponentSetBtn')}` : `⚽ ${t('match.detail.opponentGoalBtn')}`}
            </button>
          </div>

          {/* Hint — only on first use, then auto-dismiss */}
          {!hintDismissed && match.goals.length === 0 && (
            <div
              onClick={() => { try { localStorage.setItem('torq_goal_hint_seen', '1'); } catch { /* ignore */ } }}
              style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: -4 }}
            >
              {t('match.field.quickGoalHint')}
            </div>
          )}

          {/* ── Secondary actions — compact row ──
              Pro away coach-e (paired): karty a střídání dělá home coach (má lineup).
              Away coach jen zaznamenává skóre svého týmu — detaily (střelci, karty,
              střídání) pořád patří creator-ovi. */}
          <div style={{ display: 'flex', gap: 6 }}>
            {showCards && !isAwayView && (
              <button
                onClick={() => { vibrate(); setCardModal(true); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                  background: '#FFF9C4', color: '#F9A825',
                }}
              >
                {t('match.detail.cardBtn')}
              </button>
            )}
            {showSubs && !isAwayView && (
              <button
                onClick={() => { vibrate(); setSubModal(true); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                  background: 'var(--primary-light)', color: 'var(--primary)',
                }}
              >
                {t('match.detail.subBtn')}
              </button>
            )}

            {/* Match controls inline — pause/halftime/finish */}
            {(() => {
              const isLastPeriod = currentPeriod >= periods;
              const canGoNextPeriod = periods > 1 && !isLastPeriod;
              const isPaused = !!match.pausedAt;

              if (!isPaused) {
                return (
                  <>
                    <button
                      onClick={() => { vibrate(); pauseMatch(match.id); }}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                        background: 'var(--surface-var)', color: 'var(--text-muted)',
                      }}
                    >
                      ⏸ {t('match.detail.pauseBtn')}
                    </button>
                    {canGoNextPeriod ? (
                      <button
                        onClick={() => {
                          vibrate(50);
                          pauseMatch(match.id);
                          updateMatch(match.id, { currentPeriod: currentPeriod + 1 });
                        }}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                          background: 'var(--warning-light)', color: 'var(--warning)',
                        }}
                      >
                        ⏱ {t('match.detail.halftimeBtn')}
                      </button>
                    ) : (
                      <button
                        onClick={() => { vibrate(); handleFinish(); }}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                          background: 'var(--danger-light)', color: 'var(--danger)',
                        }}
                      >
                        ■ {t('match.detail.finishBtn')}
                      </button>
                    )}
                  </>
                );
              }
              return null;
            })()}
          </div>

          {/* ── Halftime break / Pause state — clear, large buttons ── */}
          {(() => {
            const isPaused = !!match.pausedAt;
            if (!isPaused) return null;

            // Halftime break — detect when period just transitioned (periodElapsed near zero or negative).
            // Threshold accounts for overtime spillover from the previous period (coach pressed
            // halftime after playing into overtime, so elapsed may exceed the period boundary).
            // 120s covers up to 2 minutes of overtime before halftime was pressed.
            const halftimeThreshold = Math.min(120, periodSeconds * 0.1);
            if (currentPeriod > 1 && periodElapsed <= halftimeThreshold) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{
                    textAlign: 'center', padding: '8px', borderRadius: 10,
                    background: 'var(--warning-light)', color: 'var(--warning)', fontWeight: 700, fontSize: 13,
                  }}>
                    ⏱ {t('match.detail.halftimeBreak')}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => { vibrate(50); resumeMatch(match.id); }}
                      style={{
                        flex: 2, padding: '18px', borderRadius: 16, fontWeight: 800, fontSize: 18,
                        background: 'var(--success)', color: '#fff',
                        boxShadow: '0 4px 12px rgba(46,125,50,.30)',
                      }}
                    >
                      ▶ {t('match.detail.startNextPeriod', { period: getPeriodLabel(t, periods, currentPeriod) })}
                    </button>
                    <button
                      onClick={() => { vibrate(); handleFinish(); }}
                      style={{
                        flex: 1, padding: '18px', borderRadius: 16, fontWeight: 700, fontSize: 14,
                        background: 'var(--danger-light)', color: 'var(--danger)',
                      }}
                    >
                      ■ {t('match.detail.finishBtn')}
                    </button>
                  </div>
                </div>
              );
            }

            // Regular pause
            return (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { vibrate(); resumeMatch(match.id); }}
                  style={{
                    flex: 1, padding: '16px', borderRadius: 14, fontWeight: 700, fontSize: 15,
                    background: 'var(--success-light)', color: 'var(--success)',
                  }}
                >
                  ▶ {t('match.detail.resumeBtn')}
                </button>
                <button
                  onClick={() => { vibrate(); handleFinish(); }}
                  style={{
                    flex: 1, padding: '16px', borderRadius: 14, fontWeight: 700, fontSize: 15,
                    background: 'var(--danger-light)', color: 'var(--danger)',
                  }}
                >
                  ■ {t('match.detail.finishBtn')}
                </button>
              </div>
            );
          })()}

          {/* ── Panel settings — only show toggle, not always visible ── */}
          <button
            onClick={() => setShowSettings(s => !s)}
            style={{
              alignSelf: 'center', padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: 'transparent', color: 'var(--text-disabled)',
            }}
          >
            ⚙️ {t('match.field.settings')}
          </button>

          {showSettings && (
            <div style={{
              background: 'var(--surface)', borderRadius: 12, padding: '10px 14px',
              display: 'flex', gap: 16,
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" checked={enabledPanels.has('cards')} onChange={() => togglePanel('cards')} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
                🟨 {t('match.field.panelCards')}
              </label>
              {hasBench && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={enabledPanels.has('subs')} onChange={() => togglePanel('subs')} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
                  🔄 {t('match.field.panelSubs')}
                </label>
              )}
            </div>
          )}
        </div>
      )}
      </div>{/* end sticky action buttons */}

      {/* ── Playing time tracker ── */}
      {match.status !== 'planned' && match.lineup.length > 0 && (() => {
        const elapsedMin = Math.max(0, Math.floor(elapsed / 60));
        const playingTime = computePlayingTime(match, elapsedMin);
        const maxTime = Math.max(1, elapsedMin);
        // Sort: on-field first (by minutes desc), then bench (by minutes desc)
        // Compute who's currently on field
        const currentlyOnField = new Set(match.lineup.filter(p => p.isStarter).map(p => p.playerId));
        for (const sub of match.substitutions) {
          currentlyOnField.delete(sub.playerOutId);
          currentlyOnField.add(sub.playerInId);
        }
        const sortedPlayers = [...match.lineup].sort((a, b) => {
          const aOn = currentlyOnField.has(a.playerId) ? 1 : 0;
          const bOn = currentlyOnField.has(b.playerId) ? 1 : 0;
          if (aOn !== bOn) return bOn - aOn;
          return (playingTime.get(b.playerId) ?? 0) - (playingTime.get(a.playerId) ?? 0);
        });

        return (
          <details style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden' }}>
            <summary style={{
              padding: '12px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)',
              listStyle: 'none', WebkitAppearance: 'none',
            }}>
              <span>⏱</span> {t('match.detail.playingTime')}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                {sortedPlayers.length} {t('common.players')}
              </span>
            </summary>
            <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedPlayers.map(p => {
                const mins = playingTime.get(p.playerId) ?? 0;
                const benchMins = Math.max(0, elapsedMin - mins);
                const pct = maxTime > 0 ? Math.min(100, (mins / maxTime) * 100) : 0;
                const isOn = currentlyOnField.has(p.playerId);
                return (
                  <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: 7,
                      background: isOn ? 'var(--primary)' : 'var(--surface-var)',
                      color: isOn ? '#fff' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                    }}>{p.jerseyNumber}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {p.name}
                    </span>
                    <div style={{ flex: 1, height: 8, background: 'var(--surface-var)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4, transition: 'width .5s',
                        width: `${pct}%`,
                        background: pct > 80 ? 'var(--success)' : pct > 40 ? 'var(--primary)' : pct > 0 ? '#FF9800' : 'transparent',
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 30, textAlign: 'right' }}>
                      {mins}'
                    </span>
                    <span
                      title={t('match.detail.benchTime')}
                      style={{
                        fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
                        minWidth: 34, textAlign: 'right',
                      }}
                    >
                      🪑 {benchMins}'
                    </span>
                  </div>
                );
              })}
              {/* Fairness indicator */}
              {elapsedMin > 5 && (() => {
                const times = sortedPlayers.map(p => playingTime.get(p.playerId) ?? 0);
                const max = Math.max(...times);
                const min = Math.min(...times);
                const diff = max - min;
                const isFair = diff <= Math.ceil(elapsedMin * 0.3);
                return (
                  <div style={{
                    marginTop: 4, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                    background: isFair ? 'var(--success-light)' : 'var(--warning-light)',
                    color: isFair ? 'var(--success)' : 'var(--warning)',
                    textAlign: 'center',
                  }}>
                    {isFair ? `✓ ${t('match.detail.fairPlayOk')}` : `⚠ ${t('match.detail.fairPlayWarn', { diff })}`}
                  </div>
                );
              })()}
            </div>
          </details>
        );
      })()}

      {/* ── Goals log (clickable to assign scorer) ── */}
      {match.goals.length > 0 && (
        <details style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden' }}>
          <summary style={{
            padding: '12px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)',
            listStyle: 'none', WebkitAppearance: 'none',
          }}>
            {t('match.detail.goalsLog')}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {match.goals.length}
            </span>
          </summary>
          <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...match.goals].reverse().map(g => {
              const isUnassigned = !g.isOpponentGoal && !g.isOwnGoal && !g.scorerId;
              // Z pohledu aktuálního trenéra — je to „můj" gól? (flipnuto pro away)
              const isMyGoal = perspective.isGoalMine(g);
              // Edit gólu dovolíme jen pokud mám přístup ke sestavě = home/viewer
              // s creator lineup. Away coach gól nelze edit (nemá svoji sestavu).
              const canEditThis = match.status !== 'finished' && !isAwayView && !g.isOpponentGoal;
              return (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 28 }}>{g.minute}'</span>
                  <span
                    onClick={() => {
                      if (canEditThis) setEditingGoal(g);
                    }}
                    style={{
                      fontSize: 13, fontWeight: 600, flex: 1,
                      color: isMyGoal ? 'var(--success)' : 'var(--danger)',
                      cursor: canEditThis ? 'pointer' : 'default',
                      textDecoration: isUnassigned && !isAwayView ? 'underline dashed' : 'none',
                      textDecorationColor: 'var(--text-muted)',
                    }}
                  >
                    {isAwayView
                      // Pro away coach: flipnuté popisky
                      ? (g.isOpponentGoal
                          ? `${perspective.myTeamName} ⚽`   // creator pohled "opp" = away coach-ův tým
                          : g.isOwnGoal
                            ? t('match.detail.ownGoalLog')
                            : `${perspective.theirTeamName} ⚽`)
                      : (g.isOpponentGoal
                          ? `${match.opponent} ⚽`
                          : g.isOwnGoal
                            ? t('match.detail.ownGoalLog')
                            : g.scorerId
                              ? `${getPlayerName(g.scorerId)}${g.assistId ? ` (${getPlayerName(g.assistId)})` : ''}`
                              : `⚽ ${t('match.field.tapToAssign')}`)}
                  </span>
                  {match.status !== 'finished' && (
                    <button
                      onClick={() => removeGoal(match.id, g.id)}
                      aria-label="Remove goal"
                      style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Cards log */}
      {match.cards.length > 0 && (
        <details style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden' }}>
          <summary style={{
            padding: '12px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)',
            listStyle: 'none', WebkitAppearance: 'none',
          }}>
            {t('match.detail.cardsLog')}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {match.cards.length}
            </span>
          </summary>
          <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {match.cards.map(c => {
              const player = match.lineup.find(p => p.playerId === c.playerId);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 28 }}>{c.minute}'</span>
                  <span style={{ fontSize: 16 }}>{c.type === 'yellow' ? '🟨' : c.type === 'red' ? '🟥' : '🟨🟥'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{player?.name ?? '?'}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Substitutions log */}
      {match.substitutions.length > 0 && (
        <details style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden' }}>
          <summary style={{
            padding: '12px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)',
            listStyle: 'none', WebkitAppearance: 'none',
          }}>
            <span>🔄</span> {t('match.detail.subsLog')}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {match.substitutions.length}
            </span>
          </summary>
          <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...match.substitutions].sort((a, b) => a.minute - b.minute).map(s => {
              const playerOut = match.lineup.find(p => p.playerId === s.playerOutId);
              const playerIn = match.lineup.find(p => p.playerId === s.playerInId);
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 28 }}>{s.minute}'</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>▲ {playerIn?.name ?? '?'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⇄</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}>▼ {playerOut?.name ?? '?'}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* ── Post-match summary sekce odstraněna — obsahovala jen duplicitní info
          (skóre je v headeru, gólové průběhy + střídání + karty mají samostatné
          sbalitelné sekce). Shrnutí pro rodiče se posílá přes WhatsApp — viz
          MatchDetailPage "📢 Shrnutí pro rodiče". */}

      {/* ── VEO recording ── */}
      {match.veoUrl ? (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>🎥</span>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{t('veo.title')}</span>
            <button
              onClick={async () => {
                const ok = await ask({ title: t('veo.removeConfirm'), message: '' });
                if (ok) updateMatch(match.id, { veoUrl: undefined });
              }}
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              {t('veo.remove')}
            </button>
          </div>
          <a
            href={match.veoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', marginTop: 8, padding: '10px 14px', borderRadius: 10,
              background: 'var(--info-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 13,
              textDecoration: 'none', textAlign: 'center',
            }}
          >
            {t('veo.watch')}
          </a>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: showVeoInput ? '14px 16px' : '0' }}>
          {!showVeoInput ? (
            <button
              onClick={() => setShowVeoInput(true)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 14, fontWeight: 600, fontSize: 13,
                background: 'var(--surface)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              🎥 {t('veo.add')}
            </button>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🎥</span> {t('veo.title')}
              </div>
              <input
                type="url"
                value={veoInputValue}
                onChange={e => setVeoInputValue(e.target.value)}
                placeholder={t('veo.placeholder')}
                autoFocus
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14,
                  border: '1.5px solid var(--border)', background: 'var(--bg)',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setShowVeoInput(false); setVeoInputValue(''); }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                    background: 'var(--surface-var)', color: 'var(--text-muted)',
                  }}
                >
                  {t('veo.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (veoInputValue.trim()) {
                      updateMatch(match.id, { veoUrl: veoInputValue.trim() });
                      setShowVeoInput(false);
                      setVeoInputValue('');
                    }
                  }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                    background: 'var(--primary)', color: '#fff',
                    opacity: veoInputValue.trim() ? 1 : 0.4,
                  }}
                  disabled={!veoInputValue.trim()}
                >
                  {t('veo.save')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {goalModal !== null && (
        <GoalModal
          match={match}
          isOpponentGoal={goalModal === 'theirs'}
          onAdd={g => addGoal(match.id, g)}
          onClose={() => setGoalModal(null)}
          t={t}
        />
      )}
      {cardModal && (
        <CardModal match={match} onAdd={c => addCard(match.id, c)} onClose={() => setCardModal(false)} t={t} />
      )}
      {subModal && (
        <SubstitutionModal
          match={match}
          onAdd={s => addSubstitution(match.id, s)}
          onClose={() => setSubModal(false)}
          suggestedIn={suggestedIn}
          suggestedOut={suggestedOut}
          t={t}
        />
      )}
      {editingGoal && (
        <InlineGoalEdit
          match={match}
          goal={editingGoal}
          onClose={() => setEditingGoal(null)}
        />
      )}
    </div>
  );
}
