import { useState, useEffect } from 'react';
import type { SeasonMatch, MatchLineupPlayer } from '../../types/match.types';
import { useMatchesStore } from '../../store/matches.store';
import { useConfirmStore } from '../../store/confirm.store';
import { useI18n } from '../../i18n';
import { computeElapsed, formatTime, formatDate } from './match-utils';
import { GoalModal } from './GoalModal';
import { CardModal } from './CardModal';
import { SubstitutionModal } from './SubstitutionModal';

// ---- Substitution assistant logic ----

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

// ---- LiveTab component ----

export function LiveTab({ match }: { match: SeasonMatch }) {
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

  const timerColor = isOvertime ? '#C62828' : elapsed > totalSeconds - 60 ? '#E65100' : 'var(--primary)';

  const getPlayerName = (playerId: string | null) =>
    playerId ? (match.lineup.find(p => p.playerId === playerId)?.name ?? '?') : 'Neznámý';

  const ask = useConfirmStore(s => s.ask);

  const handleFinish = async () => {
    const ok = await ask({ title: t('confirm.endMatch'), message: t('confirm.endMatchMsg') });
    if (ok) {
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
        background: match.status === 'live' ? 'var(--primary)' : 'var(--surface)',
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
            {t('common.confirm')}
          </button>
        </div>
      )}

      {/* Next substitution info */}
      {!alertActive && match.status === 'live' && match.substitutionSettings && match.lineup.some(p => !p.isStarter) && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: '10px 14px',
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
              {t('match.detail.opponentGoalBtn')}
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
              {t('match.detail.cardBtn')}
            </button>
            {match.lineup.some(p => !p.isStarter) && (
              <button
                onClick={() => setSubModal(true)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                  background: 'var(--primary-light)', color: 'var(--primary)', border: '1.5px solid #BBDEFB',
                }}
              >
                {t('match.detail.subBtn')}
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
                {t('match.detail.pauseBtn')}
              </button>
            ) : (
              <button
                onClick={() => resumeMatch(match.id)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                  background: '#E8F5E9', color: '#2E7D32',
                }}
              >
                {t('match.detail.resumeBtn')}
              </button>
            )}
            <button
              onClick={handleFinish}
              style={{
                flex: 1, padding: '12px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                background: '#FFEBEE', color: '#C62828', border: '1.5px solid #FFCDD2',
              }}
            >
              {t('match.detail.finishBtn')}
            </button>
          </div>
        </div>
      )}

      {/* Goals log */}
      {match.goals.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-muted)' }}>{t('match.detail.goalsLog')}</h3>
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
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
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
