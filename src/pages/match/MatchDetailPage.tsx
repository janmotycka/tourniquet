import { useState, useEffect } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useI18n } from '../../i18n';
import type { SeasonMatch, MatchLineupPlayer, MatchGoal, MatchCard, PlayerRating } from '../../types/match.types';

interface Props { matchId: string; navigate: (p: Page) => void; }

type Tab = 'live' | 'lineup' | 'ratings';
type TFn = (key: string, params?: Record<string, string | number>) => string;

// ─── Elapsed time helpers ──────────────────────────────────────────────────────

/** Vrátí celkový počet sekund od zahájení zápasu (s ohledem na pauzy) */
function computeElapsed(match: SeasonMatch): number {
  if (!match.startedAt) return 0;
  const base = match.pausedElapsed;
  if (match.pausedAt) return base; // zápas je pozastaven
  const sinceStart = Math.floor((Date.now() - new Date(match.startedAt).getTime()) / 1000);
  return base + sinceStart;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

// ─── Star rating component ────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {([1, 2, 3, 4, 5] as const).map(star => (
        <button
          key={star}
          onClick={() => onChange(star)}
          style={{
            fontSize: 24, lineHeight: 1, padding: 2, borderRadius: 4,
            color: star <= value ? '#FFB300' : '#ccc',
            background: 'none', border: 'none',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ─── GoalModal ────────────────────────────────────────────────────────────────

function GoalModal({ match, isOpponentGoal, onAdd, onClose, t }: {
  match: SeasonMatch;
  isOpponentGoal: boolean;
  onAdd: (goal: Omit<MatchGoal, 'id' | 'recordedAt'>) => void;
  onClose: () => void;
  t: TFn;
}) {
  const elapsed = computeElapsed(match);
  const currentMinute = Math.floor(elapsed / 60) + 1;
  const [minute, setMinute] = useState(match.status === 'live' ? currentMinute : 1);
  const [scorerId, setScorerId] = useState<string | null>(null);
  const [assistId, setAssistId] = useState<string | null>(null);
  const [isOwnGoal, setIsOwnGoal] = useState(false);

  const onFieldPlayers = match.lineup.filter(p => p.isStarter);

  const handleAdd = () => {
    onAdd({
      scorerId: isOwnGoal || isOpponentGoal ? null : scorerId,
      assistId: isOwnGoal || isOpponentGoal ? null : assistId,
      isOwnGoal,
      isOpponentGoal,
      minute: Math.max(1, minute),
    });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px',
          width: '100%', maxHeight: '85dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 18 }}>
            ⚽ {isOpponentGoal ? t('match.detail.opponentGoal') : t('match.detail.ourGoal')}
          </h3>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)', fontWeight: 700 }}>×</button>
        </div>

        {/* Minute */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('match.detail.minute')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMinute(m => Math.max(1, m - 1))}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>−</button>
            <span style={{ fontWeight: 800, fontSize: 22, minWidth: 40, textAlign: 'center', color: '#1565C0' }}>{minute}'</span>
            <button onClick={() => setMinute(m => m + 1)}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>+</button>
          </div>
        </div>

        {!isOpponentGoal && (
          <>
            {/* Own goal toggle */}
            <button
              onClick={() => setIsOwnGoal(v => !v)}
              style={{
                marginBottom: 14, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: isOwnGoal ? '#FFEBEE' : 'var(--surface-var)',
                color: isOwnGoal ? '#C62828' : 'var(--text-muted)',
                border: `1.5px solid ${isOwnGoal ? '#FFCDD2' : 'var(--border)'}`,
              }}
            >
              {isOwnGoal ? t('match.detail.ownGoalConfirmed') : t('match.detail.ownGoal')}
            </button>

            {!isOwnGoal && (
              <>
                {/* Scorer */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    {t('match.detail.scorer')}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button
                      onClick={() => setScorerId(null)}
                      style={{
                        padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                        background: scorerId === null ? '#E3F2FD' : 'var(--bg)',
                        border: `1.5px solid ${scorerId === null ? '#1565C0' : 'var(--border)'}`,
                        color: scorerId === null ? '#1565C0' : 'var(--text-muted)',
                      }}
                    >
                      {t('match.detail.unknownScorer')}
                    </button>
                    {onFieldPlayers.map(p => (
                      <button
                        key={p.playerId}
                        onClick={() => setScorerId(p.playerId)}
                        style={{
                          padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: scorerId === p.playerId ? '#E3F2FD' : 'var(--bg)',
                          border: `1.5px solid ${scorerId === p.playerId ? '#1565C0' : 'var(--border)'}`,
                          color: scorerId === p.playerId ? '#1565C0' : 'var(--text)',
                        }}
                      >
                        <span style={{
                          width: 26, height: 26, borderRadius: 7, background: '#1565C0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                        }}>{p.jerseyNumber}</span>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Assist */}
                {scorerId && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                      {t('match.detail.assist')}
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        onClick={() => setAssistId(null)}
                        style={{
                          padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                          background: assistId === null ? 'var(--bg)' : 'var(--bg)',
                          border: '1.5px solid var(--border)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {t('match.detail.noAssist')}
                      </button>
                      {onFieldPlayers.filter(p => p.playerId !== scorerId).map(p => (
                        <button
                          key={p.playerId}
                          onClick={() => setAssistId(p.playerId)}
                          style={{
                            padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: assistId === p.playerId ? '#E3F2FD' : 'var(--bg)',
                            border: `1.5px solid ${assistId === p.playerId ? '#1565C0' : 'var(--border)'}`,
                            color: assistId === p.playerId ? '#1565C0' : 'var(--text)',
                          }}
                        >
                          <span style={{
                            width: 26, height: 26, borderRadius: 7, background: 'var(--surface-var)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: 'var(--text)', flexShrink: 0,
                          }}>{p.jerseyNumber}</span>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <button
          onClick={handleAdd}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 16,
            background: '#1565C0', color: '#fff', marginTop: 8,
          }}
        >
          {t('match.detail.addGoal')}
        </button>
      </div>
    </div>
  );
}

// ─── CardModal ────────────────────────────────────────────────────────────────

function CardModal({ match, onAdd, onClose, t }: {
  match: SeasonMatch;
  onAdd: (card: Omit<MatchCard, 'id' | 'recordedAt'>) => void;
  onClose: () => void;
  t: TFn;
}) {
  const elapsed = computeElapsed(match);
  const currentMinute = Math.floor(elapsed / 60) + 1;
  const [minute, setMinute] = useState(match.status === 'live' ? currentMinute : 1);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [type, setType] = useState<'yellow' | 'red' | 'yellow-red'>('yellow');

  const onFieldPlayers = match.lineup.filter(p => p.isStarter);

  const handleAdd = () => {
    if (!playerId) return;
    onAdd({ playerId, type, minute: Math.max(1, minute) });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px',
          width: '100%', maxHeight: '85dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 18 }}>{t('match.detail.card')}</h3>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)', fontWeight: 700 }}>×</button>
        </div>

        {/* Type */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {([['yellow', t('match.detail.yellowCard')], ['red', t('match.detail.redCard')], ['yellow-red', t('match.detail.yellowRed')]] as [string, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setType(v as 'yellow' | 'red' | 'yellow-red')}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: type === v ? (v === 'yellow' ? '#FFF9C4' : v === 'red' ? '#FFEBEE' : '#FFF3E0') : 'var(--surface-var)',
                color: type === v ? (v === 'yellow' ? '#F9A825' : v === 'red' ? '#C62828' : '#E65100') : 'var(--text-muted)',
                border: `2px solid ${type === v ? 'currentColor' : 'transparent'}`,
              }}
            >{label}</button>
          ))}
        </div>

        {/* Minute */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('match.detail.minute')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMinute(m => Math.max(1, m - 1))}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>−</button>
            <span style={{ fontWeight: 800, fontSize: 22, minWidth: 40, textAlign: 'center', color: '#1565C0' }}>{minute}'</span>
            <button onClick={() => setMinute(m => m + 1)}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>+</button>
          </div>
        </div>

        {/* Player */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('match.detail.player')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {onFieldPlayers.map(p => (
              <button
                key={p.playerId}
                onClick={() => setPlayerId(p.playerId)}
                style={{
                  padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: playerId === p.playerId ? '#E3F2FD' : 'var(--bg)',
                  border: `1.5px solid ${playerId === p.playerId ? '#1565C0' : 'var(--border)'}`,
                  color: playerId === p.playerId ? '#1565C0' : 'var(--text)',
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 7, background: '#1565C0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>{p.jerseyNumber}</span>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={!playerId}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 16,
            background: playerId ? '#1565C0' : 'var(--border)', color: playerId ? '#fff' : 'var(--text-muted)',
          }}
        >
          {t('match.detail.addCard')}
        </button>
      </div>
    </div>
  );
}

// ─── SubstitutionModal ────────────────────────────────────────────────────────

function SubstitutionModal({ match, onAdd, onClose, suggestedIn, suggestedOut, t }: {
  match: SeasonMatch;
  onAdd: (sub: { minute: number; playerOutId: string; playerInId: string }) => void;
  onClose: () => void;
  suggestedIn: MatchLineupPlayer[];
  suggestedOut: MatchLineupPlayer[];
  t: TFn;
}) {
  const elapsed = computeElapsed(match);
  const currentMinute = Math.floor(elapsed / 60) + 1;
  const [minute, setMinute] = useState(match.status === 'live' ? currentMinute : 1);
  const [playerOutId, setPlayerOutId] = useState<string>(suggestedOut[0]?.playerId ?? '');
  const [playerInId, setPlayerInId] = useState<string>(suggestedIn[0]?.playerId ?? '');

  const onField = match.lineup.filter(p => p.isStarter);
  const bench = match.lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);

  const handleAdd = () => {
    if (!playerOutId || !playerInId) return;
    onAdd({ minute: Math.max(1, minute), playerOutId, playerInId });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px',
          width: '100%', maxHeight: '85dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 18 }}>{t('match.detail.substitution')}</h3>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)', fontWeight: 700 }}>×</button>
        </div>

        {/* Minute */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('match.detail.minute')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMinute(m => Math.max(1, m - 1))}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>−</button>
            <span style={{ fontWeight: 800, fontSize: 22, minWidth: 40, textAlign: 'center', color: '#1565C0' }}>{minute}'</span>
            <button onClick={() => setMinute(m => m + 1)}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700 }}>+</button>
          </div>
        </div>

        {/* Player OUT */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#C62828', display: 'block', marginBottom: 6 }}>
            {t('match.detail.playerOut')}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {onField.map(p => (
              <button
                key={p.playerId}
                onClick={() => setPlayerOutId(p.playerId)}
                style={{
                  padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: playerOutId === p.playerId ? '#FFEBEE' : 'var(--bg)',
                  border: `1.5px solid ${playerOutId === p.playerId ? '#C62828' : 'var(--border)'}`,
                  color: playerOutId === p.playerId ? '#C62828' : 'var(--text)',
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 7, background: '#C62828',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>{p.jerseyNumber}</span>
                {p.name}
                {suggestedOut.some(s => s.playerId === p.playerId) && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#C62828', fontWeight: 700 }}>{t('match.detail.recommended')}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Player IN */}
        {bench.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#2E7D32', display: 'block', marginBottom: 6 }}>
              {t('match.detail.playerIn')}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bench.map(p => (
                <button
                  key={p.playerId}
                  onClick={() => setPlayerInId(p.playerId)}
                  style={{
                    padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: playerInId === p.playerId ? '#E8F5E9' : 'var(--bg)',
                    border: `1.5px solid ${playerInId === p.playerId ? '#2E7D32' : 'var(--border)'}`,
                    color: playerInId === p.playerId ? '#2E7D32' : 'var(--text)',
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: 7, background: '#2E7D32',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                  }}>{p.jerseyNumber}</span>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{p.substituteOrder}</span>
                  {suggestedIn.some(s => s.playerId === p.playerId) && (
                    <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 700 }}>{t('match.detail.recommended')}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={!playerOutId || !playerInId}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 16,
            background: (playerOutId && playerInId) ? '#1565C0' : 'var(--border)',
            color: (playerOutId && playerInId) ? '#fff' : 'var(--text-muted)',
          }}
        >
          ✅ Potvrdit střídání
        </button>
      </div>
    </div>
  );
}

// ─── Substitution assistant logic ─────────────────────────────────────────────

function useSubstitutionAlert(match: SeasonMatch, elapsed: number): {
  alertActive: boolean;
  nextAlertMinute: number;
  suggestedIn: MatchLineupPlayer[];
  suggestedOut: MatchLineupPlayer[];
} {
  if (!match.substitutionSettings || match.status !== 'live') {
    return { alertActive: false, nextAlertMinute: 0, suggestedIn: [], suggestedOut: [] };
  }

  const { intervalMinutes, playersAtOnce } = match.substitutionSettings;
  const elapsedMinutes = elapsed / 60;

  // Next alert minute
  const nextAlertMinute = Math.ceil(elapsedMinutes / intervalMinutes) * intervalMinutes;
  const alertActive = elapsed > 0 && (nextAlertMinute - elapsedMinutes) <= 0.5; // 30s window

  // Bench sorted by substituteOrder
  const bench = match.lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);
  const suggestedIn = bench.slice(0, playersAtOnce);

  // Players on field who haven't been subbed out (just isStarter=true currently)
  const onField = match.lineup.filter(p => p.isStarter);
  // Suggest players who played longest (we don't track per-player time, so suggest randomly from field)
  const suggestedOut = onField.slice(0, playersAtOnce);

  return { alertActive, nextAlertMinute, suggestedIn, suggestedOut };
}

// ─── Live Tab ─────────────────────────────────────────────────────────────────

function LiveTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(() => computeElapsed(match));
  const [goalModal, setGoalModal] = useState<'home' | 'away' | null>(null);
  const [cardModal, setCardModal] = useState(false);
  const [subModal, setSubModal] = useState(false);

  const startMatch = useMatchesStore(s => s.startMatch);
  const finishMatch = useMatchesStore(s => s.finishMatch);
  const pauseMatch = useMatchesStore(s => s.pauseMatch);
  const resumeMatch = useMatchesStore(s => s.resumeMatch);
  const addGoal = useMatchesStore(s => s.addGoal);
  const addCard = useMatchesStore(s => s.addCard);
  const addSubstitution = useMatchesStore(s => s.addSubstitution);
  const removeGoal = useMatchesStore(s => s.removeGoal);

  // Tick timer every second when live
  useEffect(() => {
    if (match.status !== 'live' || match.pausedAt) return;
    const interval = setInterval(() => setElapsed(computeElapsed(match)), 1000);
    return () => clearInterval(interval);
  }, [match]);

  const { alertActive, nextAlertMinute, suggestedIn, suggestedOut } = useSubstitutionAlert(match, elapsed);

  const totalSeconds = match.durationMinutes * 60;
  const remaining = Math.max(0, totalSeconds - elapsed);
  const isOvertime = elapsed > totalSeconds;
  const progress = Math.min(1, elapsed / totalSeconds);

  const timerColor = isOvertime ? '#C62828' : elapsed > totalSeconds - 60 ? '#E65100' : '#1565C0';

  const getPlayerName = (playerId: string | null) =>
    playerId ? (match.lineup.find(p => p.playerId === playerId)?.name ?? '?') : 'Neznámý';

  const handleFinish = () => {
    if (confirm('Ukončit zápas? Výsledek bude uložen.')) {
      finishMatch(match.id);
    }
  };

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Match header: opponent + date */}
      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)' }}>
          {match.isHome ? 'My' : match.opponent} vs {match.isHome ? match.opponent : 'My'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
          {formatDate(match.date)} · {match.kickoffTime}
          {match.competition && ` · ${match.competition}`}
        </div>
      </div>

      {/* Score card */}
      <div style={{
        background: match.status === 'live' ? '#1565C0' : 'var(--surface)',
        borderRadius: 20, padding: '20px',
        boxShadow: match.status === 'live' ? '0 4px 20px rgba(21,101,192,.30)' : '0 1px 4px rgba(0,0,0,.06)',
      }}>
        {/* Timer */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          {match.status === 'live' && (
            <>
              <div style={{
                fontFeatureSettings: '"tnum"', fontWeight: 900, fontSize: 36,
                color: match.status === 'live' ? '#fff' : timerColor,
                letterSpacing: 2,
              }}>
                {isOvertime ? '+' : ''}{formatTime(isOvertime ? elapsed - totalSeconds : remaining)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginTop: 2 }}>
                {isOvertime ? 'NASTAVENÍ' : `zbývá · ${Math.floor(elapsed / 60)}'`}
              </div>
              {/* Progress bar */}
              <div style={{ height: 4, background: 'rgba(255,255,255,.25)', borderRadius: 4, marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress * 100}%`, background: '#fff', borderRadius: 4, transition: 'width .5s' }} />
              </div>
            </>
          )}
          {match.status === 'planned' && (
            <div style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 600 }}>{t('match.detail.notStarted')}</div>
          )}
          {match.status === 'finished' && (
            <div style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 600 }}>{t('match.detail.finished')}</div>
          )}
        </div>

        {/* Score */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: match.status === 'live' ? 'rgba(255,255,255,.8)' : 'var(--text-muted)', marginBottom: 4 }}>
              {match.isHome ? '🏠 My' : '✈️ My'}
            </div>
            <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: match.status === 'live' ? '#fff' : 'var(--text)' }}>
              {match.homeScore}
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: match.status === 'live' ? 'rgba(255,255,255,.6)' : 'var(--text-muted)' }}>:</div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: match.status === 'live' ? 'rgba(255,255,255,.8)' : 'var(--text-muted)', marginBottom: 4 }}>
              {match.isHome ? '✈️ ' : '🏠 '}{match.opponent}
            </div>
            <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: match.status === 'live' ? '#fff' : 'var(--text)' }}>
              {match.awayScore}
            </div>
          </div>
        </div>

        {/* Pause indicator */}
        {match.pausedAt && match.status === 'live' && (
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,.8)', fontWeight: 600 }}>
            ⏸ Pozastaveno
          </div>
        )}
      </div>

      {/* Substitution alert banner */}
      {alertActive && match.status === 'live' && match.lineup.some(p => !p.isStarter) && (
        <div style={{
          background: '#FF6F00', borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          boxShadow: '0 0 0 2px #E65100',
          animation: 'pulse 1s infinite',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>🔄 Čas na střídání!</div>
            {suggestedIn.length > 0 && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.85)', marginTop: 2 }}>
                Doporučeno: {suggestedIn.map(p => p.name).join(', ')} nastupuje
              </div>
            )}
          </div>
          <button
            onClick={() => setSubModal(true)}
            style={{
              background: '#fff', color: '#E65100', borderRadius: 10,
              padding: '8px 14px', fontWeight: 800, fontSize: 13, flexShrink: 0,
            }}
          >
            Potvrdit
          </button>
        </div>
      )}

      {/* Next substitution info */}
      {!alertActive && match.status === 'live' && match.substitutionSettings && match.lineup.some(p => !p.isStarter) && (
        <div style={{
          background: 'var(--surface)', borderRadius: 12, padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>🔄 Příští střídání v</span>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{Math.ceil(nextAlertMinute)}'</span>
        </div>
      )}

      {/* Action buttons */}
      {match.status === 'planned' && (
        <button
          onClick={() => startMatch(match.id)}
          style={{
            width: '100%', padding: '16px', borderRadius: 16, fontWeight: 800, fontSize: 17,
            background: '#2E7D32', color: '#fff', boxShadow: '0 4px 12px rgba(46,125,50,.30)',
          }}
        >
          ▶ Spustit zápas
        </button>
      )}

      {match.status === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Goal buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setGoalModal('home')}
              style={{
                flex: 1, padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 15,
                background: '#2E7D32', color: '#fff',
              }}
            >
              ⚽ Náš gól
            </button>
            <button
              onClick={() => setGoalModal('away')}
              style={{
                flex: 1, padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 15,
                background: '#FFEBEE', color: '#C62828', border: '1.5px solid #FFCDD2',
              }}
            >
              ⚽ Gól soupeře
            </button>
          </div>

          {/* Card + Sub buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setCardModal(true)}
              style={{
                flex: 1, padding: '12px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                background: '#FFF9C4', color: '#F9A825', border: '1.5px solid #FFE082',
              }}
            >
              🟨 Karta
            </button>
            {match.lineup.some(p => !p.isStarter) && (
              <button
                onClick={() => setSubModal(true)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                  background: '#E3F2FD', color: '#1565C0', border: '1.5px solid #BBDEFB',
                }}
              >
                🔄 Střídání
              </button>
            )}
          </div>

          {/* Pause / Finish */}
          <div style={{ display: 'flex', gap: 10 }}>
            {!match.pausedAt ? (
              <button
                onClick={() => pauseMatch(match.id)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                  background: 'var(--surface-var)', color: 'var(--text)',
                }}
              >
                ⏸ Pauza
              </button>
            ) : (
              <button
                onClick={() => resumeMatch(match.id)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                  background: '#E8F5E9', color: '#2E7D32',
                }}
              >
                ▶ Pokračovat
              </button>
            )}
            <button
              onClick={handleFinish}
              style={{
                flex: 1, padding: '12px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                background: '#FFEBEE', color: '#C62828', border: '1.5px solid #FFCDD2',
              }}
            >
              ⏹ Ukončit
            </button>
          </div>
        </div>
      )}

      {/* Goals log */}
      {match.goals.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-muted)' }}>⚽ Průběh gólů</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...match.goals].reverse().map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 28 }}>{g.minute}'</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: g.isOpponentGoal ? '#C62828' : '#2E7D32', flex: 1 }}>
                  {g.isOpponentGoal
                    ? `${match.opponent} ⚽`
                    : g.isOwnGoal
                      ? 'Vlastní gól'
                      : `${getPlayerName(g.scorerId)}${g.assistId ? ` (${getPlayerName(g.assistId)})` : ''}`}
                </span>
                {match.status !== 'finished' && (
                  <button
                    onClick={() => removeGoal(match.id, g.id)}
                    style={{ fontSize: 13, color: '#C62828', fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: '#FFEBEE' }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cards log */}
      {match.cards.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-muted)' }}>🟨 Karty</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        </div>
      )}

      {/* Modals */}
      {goalModal !== null && (
        <GoalModal
          match={match}
          isOpponentGoal={goalModal === 'away'}
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
    </div>
  );
}

// ─── Lineup Tab ───────────────────────────────────────────────────────────────

function LineupTab({ match }: { match: SeasonMatch }) {
  const starters = match.lineup.filter(p => p.isStarter).sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const bench = match.lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);

  const getPlayerGoals = (playerId: string) =>
    match.goals.filter(g => g.scorerId === playerId && !g.isOwnGoal && !g.isOpponentGoal).length;
  const getPlayerCards = (playerId: string) =>
    match.cards.filter(c => c.playerId === playerId);
  const subbedOnMinute = (playerId: string) => {
    const sub = match.substitutions.find(s => s.playerInId === playerId);
    return sub?.minute ?? null;
  };
  const subbedOffMinute = (playerId: string) => {
    const sub = match.substitutions.find(s => s.playerOutId === playerId);
    return sub?.minute ?? null;
  };

  const PlayerRow = ({ p, isBench = false }: { p: MatchLineupPlayer; isBench?: boolean }) => {
    const goals = getPlayerGoals(p.playerId);
    const cards = getPlayerCards(p.playerId);
    const offMin = subbedOffMinute(p.playerId);
    const onMin = subbedOnMinute(p.playerId);
    const subbedOff = offMin !== null;
    const subbedOn = onMin !== null;

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
        borderBottom: '1px solid var(--border)',
        opacity: (isBench && !subbedOn) ? 0.65 : 1,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: isBench ? 'var(--surface-var)' : '#1565C0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: isBench ? 'var(--text)' : '#fff',
        }}>
          {p.jerseyNumber}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name}
          </div>
          {p.position && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.position}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {goals > 0 && <span style={{ fontSize: 13 }}>⚽×{goals}</span>}
          {cards.map((c, i) => (
            <span key={i} style={{ fontSize: 14 }}>
              {c.type === 'yellow' ? '🟨' : c.type === 'red' ? '🟥' : '🟨🟥'}
            </span>
          ))}
          {subbedOff && <span style={{ fontSize: 11, color: '#C62828', fontWeight: 700 }}>↓{offMin}'</span>}
          {subbedOn && <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 700 }}>↑{onMin}'</span>}
          {isBench && !subbedOn && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-var)', padding: '2px 6px', borderRadius: 6 }}>
              #{p.substituteOrder}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '14px 16px' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👕 Základní sestava ({starters.length})</h3>
        {starters.map(p => <PlayerRow key={p.playerId} p={p} />)}
      </div>

      {bench.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🪑 Náhradníci ({bench.length})</h3>
          {bench.map(p => <PlayerRow key={p.playerId} p={p} isBench />)}
        </div>
      )}

      {match.substitutions.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>🔄 Střídání ({match.substitutions.length})</h3>
          {match.substitutions.map(s => {
            const out = match.lineup.find(p => p.playerId === s.playerOutId);
            const inn = match.lineup.find(p => p.playerId === s.playerInId);
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-muted)', minWidth: 28 }}>{s.minute}'</span>
                <span style={{ color: '#C62828', fontWeight: 600 }}>↓ {out?.name ?? '?'}</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ color: '#2E7D32', fontWeight: 600 }}>↑ {inn?.name ?? '?'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Ratings Tab ──────────────────────────────────────────────────────────────

function RatingsTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const saveRatings = useMatchesStore(s => s.saveRatings);
  const [ratings, setRatings] = useState<PlayerRating[]>(match.ratings.length > 0 ? match.ratings : []);
  const [note, setNote] = useState(match.note ?? '');
  const [saved, setSaved] = useState(false);

  const allPlayers = [...match.lineup].sort((a, b) => {
    if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
    return a.jerseyNumber - b.jerseyNumber;
  });

  const getRating = (playerId: string): number =>
    ratings.find(r => r.playerId === playerId)?.stars ?? 0;

  const setRating = (playerId: string, stars: 1 | 2 | 3 | 4 | 5) => {
    setRatings(prev => {
      const existing = prev.findIndex(r => r.playerId === playerId);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], stars };
        return next;
      }
      return [...prev, { playerId, stars }];
    });
    setSaved(false);
  };

  const handleSave = () => {
    saveRatings(match.id, ratings, note.trim() || undefined);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {match.status !== 'finished' && (
        <div style={{
          background: '#FFF3E0', borderRadius: 12, padding: '10px 14px',
          fontSize: 13, color: '#E65100', fontWeight: 600,
        }}>
          💡 Hodnocení je dostupné po ukončení zápasu, ale můžete zadávat i průběžně.
        </div>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '14px 16px' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>⭐ Hodnocení hráčů</h3>
        {allPlayers.map(p => (
          <div key={p.playerId} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: p.isStarter ? '#1565C0' : 'var(--surface-var)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: p.isStarter ? '#fff' : 'var(--text)',
            }}>
              {p.jerseyNumber}
            </div>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            <StarRating value={getRating(p.playerId)} onChange={stars => setRating(p.playerId, stars)} />
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>📝 Trenérova poznámka</h3>
        <textarea
          value={note}
          onChange={e => { setNote(e.target.value); setSaved(false); }}
          placeholder={t('match.detail.notesPlaceholder')}
          rows={4}
          style={{
            width: '100%', padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)',
            fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            resize: 'vertical', lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSave}
          style={{
            background: saved ? '#2E7D32' : '#1565C0', color: '#fff',
            fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 10,
            alignSelf: 'flex-start', transition: 'background .2s',
          }}
        >
          {saved ? '✅ Uloženo!' : '💾 Uložit hodnocení'}
        </button>
      </div>
    </div>
  );
}

// ─── MatchDetailPage ──────────────────────────────────────────────────────────

export function MatchDetailPage({ matchId, navigate }: Props) {
  const { t } = useI18n();
  const match = useMatchesStore(s => s.getMatchById(matchId));
  const matches = useMatchesStore(s => s.matches); // Subscribe for reactivity
  const [tab, setTab] = useState<Tab>('live');

  // Re-read match on any store change
  const currentMatch = matches.find(m => m.id === matchId) ?? match;

  if (!currentMatch) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{t('match.detail.notFound')}</div>
        <button onClick={() => navigate({ name: 'match-list' })}
          style={{ background: '#1565C0', color: '#fff', borderRadius: 12, padding: '10px 20px', fontWeight: 700 }}>
          ← Zpět na seznam
        </button>
      </div>
    );
  }

  const isLive = currentMatch.status === 'live';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px', background: 'var(--surface)',
        boxShadow: '0 1px 0 var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button
            onClick={() => navigate({ name: 'match-list' })}
            style={{ background: 'var(--surface-var)', borderRadius: 10, padding: '7px 12px', fontWeight: 700, fontSize: 14 }}
          >
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentMatch.isHome ? 'My' : currentMatch.opponent} vs {currentMatch.isHome ? currentMatch.opponent : 'My'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {formatDate(currentMatch.date)} · {currentMatch.kickoffTime}
              {isLive && <span style={{ color: '#C62828', fontWeight: 700, marginLeft: 6 }}>● ŽIVĚ</span>}
            </div>
          </div>
          <div style={{
            fontWeight: 900, fontSize: 20, color: isLive ? '#1565C0' : 'var(--text)',
            letterSpacing: 1, flexShrink: 0,
          }}>
            {currentMatch.homeScore}:{currentMatch.awayScore}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([['live', isLive ? '● Live' : '📋 Zápas'], ['lineup', '👕 Sestava'], ['ratings', '⭐ Hodnocení']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 10, fontWeight: 700, fontSize: 12,
                background: tab === key ? (isLive && key === 'live' ? '#1565C0' : 'var(--primary)') : 'var(--surface-var)',
                color: tab === key ? '#fff' : 'var(--text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {tab === 'live' && <LiveTab match={currentMatch} />}
        {tab === 'lineup' && <LineupTab match={currentMatch} />}
        {tab === 'ratings' && <RatingsTab match={currentMatch} />}
      </div>
    </div>
  );
}
