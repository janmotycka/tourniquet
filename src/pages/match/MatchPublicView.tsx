import { useState, useEffect } from 'react';
import type { PublicSeasonMatch, MatchGoal, MatchCard, MatchSubstitution, MatchLineupPlayer } from '../../types/match.types';
import { subscribeToPublicMatch } from '../../services/match.firebase';
import { useI18n } from '../../i18n';

// ─── Timer helper (same logic as match-utils but for PublicSeasonMatch) ──────

function computeElapsed(m: PublicSeasonMatch): number {
  if (!m.startedAt) return 0;
  const base = m.pausedElapsed;
  if (m.pausedAt) return base;
  return base + Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 1000);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-');
  return `${d}.${mo}.${y}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MatchPublicView({ matchId }: { matchId: string }) {
  const { t } = useI18n();
  const [match, setMatch] = useState<PublicSeasonMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  // Subscribe to public match data
  useEffect(() => {
    const unsub = subscribeToPublicMatch(matchId, (data) => {
      setMatch(data);
      setLoading(false);
    });
    return unsub;
  }, [matchId]);

  // Live timer
  useEffect(() => {
    if (!match || match.status !== 'live' || match.pausedAt) return;
    setElapsed(computeElapsed(match));
    const interval = setInterval(() => setElapsed(computeElapsed(match)), 1000);
    return () => clearInterval(interval);
  }, [match]);

  // Update elapsed on match change (for paused/finished)
  useEffect(() => {
    if (match && match.status !== 'live') {
      setElapsed(computeElapsed(match));
    }
  }, [match]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>⚽</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>{t('app.loading')}</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{t('matchPublic.notFound')}</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', maxWidth: 280 }}>
          {t('matchPublic.notFoundDesc')}
        </p>
      </div>
    );
  }

  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const isPaused = !!match.pausedAt;
  const durationSec = match.durationMinutes * 60;
  const isOvertime = elapsed > durationSec;

  const playerName = (id: string | null) => {
    if (!id) return t('matchPublic.unknownPlayer');
    const p = match.lineup.find(lp => lp.playerId === id);
    return p ? `${p.name}${p.jerseyNumber != null ? ` #${p.jerseyNumber}` : ''}` : t('matchPublic.unknownPlayer');
  };

  const sortedGoals = [...match.goals].sort((a, b) => a.minute - b.minute);
  const sortedCards = [...match.cards].sort((a, b) => a.minute - b.minute);
  const sortedSubs = [...match.substitutions].sort((a, b) => a.minute - b.minute);
  const starters = match.lineup.filter(p => p.isStarter);
  const bench = match.lineup.filter(p => !p.isStarter);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: isLive ? 'linear-gradient(135deg, var(--primary), #0D47A1)' : 'var(--surface)',
        color: isLive ? '#fff' : 'var(--text)',
        padding: '20px 16px 16px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, marginBottom: 4 }}>
          {match.competition} · {formatDate(match.date)} · {match.kickoffTime}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
          {match.isHome ? t('matchPublic.us') : match.opponent} vs {match.isHome ? match.opponent : t('matchPublic.us')}
        </div>

        {/* Score */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          fontSize: 48, fontWeight: 900, letterSpacing: 2,
        }}>
          <span>{match.homeScore}</span>
          <span style={{ fontSize: 28, opacity: 0.5 }}>:</span>
          <span>{match.awayScore}</span>
        </div>

        {/* Status / Timer */}
        <div style={{ marginTop: 8 }}>
          {isLive && !isPaused && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '4px 14px',
              fontSize: 14, fontWeight: 700,
            }}>
              <span style={{ color: '#FF5252', fontSize: 10 }}>●</span>
              {formatTime(elapsed)}
              {isOvertime && <span style={{ fontSize: 11 }}>{t('matchPublic.overtime')}</span>}
            </div>
          )}
          {isLive && isPaused && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '4px 14px',
              fontSize: 14, fontWeight: 700,
            }}>
              ⏸ {formatTime(elapsed)} · {t('matchPublic.paused')}
            </div>
          )}
          {isFinished && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-var)', borderRadius: 20, padding: '4px 14px',
              fontSize: 13, fontWeight: 700, color: 'var(--text-muted)',
            }}>
              ✓ {t('matchPublic.finished')}
            </div>
          )}
          {match.status === 'planned' && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-var)', borderRadius: 20, padding: '4px 14px',
              fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
            }}>
              {t('matchPublic.notStarted')}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Goals */}
        {sortedGoals.length > 0 && (
          <EventSection title={t('matchPublic.goals')} icon="⚽">
            {sortedGoals.map(g => (
              <GoalRow key={g.id} goal={g} playerName={playerName} t={t} />
            ))}
          </EventSection>
        )}

        {/* Cards */}
        {sortedCards.length > 0 && (
          <EventSection title={t('matchPublic.cards')} icon="🟨">
            {sortedCards.map(c => (
              <CardRow key={c.id} card={c} playerName={playerName} />
            ))}
          </EventSection>
        )}

        {/* Substitutions */}
        {sortedSubs.length > 0 && (
          <EventSection title={t('matchPublic.substitutions')} icon="🔄">
            {sortedSubs.map(s => (
              <SubRow key={s.id} sub={s} playerName={playerName} />
            ))}
          </EventSection>
        )}

        {/* Lineup */}
        {match.lineup.length > 0 && (
          <EventSection title={t('matchPublic.lineup')} icon="👕">
            {starters.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                  {t('matchPublic.starters')}
                </div>
                {starters.map(p => <PlayerRow key={p.playerId} player={p} />)}
              </div>
            )}
            {bench.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                  {t('matchPublic.bench')}
                </div>
                {bench.map(p => <PlayerRow key={p.playerId} player={p} />)}
              </div>
            )}
          </EventSection>
        )}

        {/* Finished match promo banner */}
        {isFinished && (
          <div style={{
            padding: '14px 16px', borderRadius: 14,
            background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
            color: '#fff', textAlign: 'center',
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
              ⚽ {t('promo.finishedTitle')}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10, lineHeight: 1.4 }}>
              {t('promo.finishedDesc')}
            </div>
            <a
              href="https://torq.cz"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '8px 20px', borderRadius: 10,
                background: '#fff', color: '#0D47A1', fontWeight: 700, fontSize: 13,
                textDecoration: 'none',
              }}
            >
              {t('promo.tryCta')}
            </a>
          </div>
        )}

        {/* Empty state */}
        {sortedGoals.length === 0 && sortedCards.length === 0 && sortedSubs.length === 0 && match.lineup.length === 0 && (
          <div style={{
            padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)',
            background: 'var(--surface)', borderRadius: 14,
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⚽</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{t('matchPublic.noEvents')}</p>
          </div>
        )}
      </div>

      {/* Footer with branding */}
      <div style={{
        padding: '12px 16px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <span>{t('matchPublic.footer')}</span>
        <a
          href="https://torq.cz"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          ⚡ Powered by <strong style={{ color: 'var(--primary)' }}>TORQ</strong> · torq.cz
        </a>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EventSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{title}</span>
      </div>
      <div style={{ padding: '8px 14px' }}>{children}</div>
    </div>
  );
}

function GoalRow({ goal, playerName, t }: { goal: MatchGoal; playerName: (id: string | null) => string; t: (k: string) => string }) {
  const isOpp = goal.isOpponentGoal;
  const isOG = goal.isOwnGoal;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontWeight: 700, color: 'var(--primary)', minWidth: 28 }}>{goal.minute}'</span>
      <span style={{ fontWeight: 600, flex: 1 }}>
        {isOpp ? t('matchPublic.opponentGoal') : playerName(goal.scorerId)}
        {isOG && <span style={{ color: '#C62828', marginLeft: 4, fontSize: 11 }}>({t('matchPublic.ownGoal')})</span>}
      </span>
      {goal.assistId && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {playerName(goal.assistId)}
        </span>
      )}
    </div>
  );
}

function CardRow({ card, playerName }: { card: MatchCard; playerName: (id: string | null) => string }) {
  const icon = card.type === 'red' ? '🟥' : card.type === 'yellow-red' ? '🟨🟥' : '🟨';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontWeight: 700, color: 'var(--primary)', minWidth: 28 }}>{card.minute}'</span>
      <span>{icon}</span>
      <span style={{ fontWeight: 600, flex: 1 }}>{playerName(card.playerId)}</span>
    </div>
  );
}

function SubRow({ sub, playerName }: { sub: MatchSubstitution; playerName: (id: string | null) => string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontWeight: 700, color: 'var(--primary)', minWidth: 28 }}>{sub.minute}'</span>
      <span style={{ color: '#2E7D32', fontWeight: 600 }}>↑ {playerName(sub.playerInId)}</span>
      <span style={{ color: '#C62828', fontWeight: 600 }}>↓ {playerName(sub.playerOutId)}</span>
    </div>
  );
}

function PlayerRow({ player }: { player: MatchLineupPlayer }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13 }}>
      <span style={{ fontWeight: 700, color: 'var(--text-muted)', minWidth: 24, fontSize: 12 }}>#{player.jerseyNumber}</span>
      <span style={{ fontWeight: 600 }}>{player.name}</span>
      {player.position && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{player.position}</span>}
    </div>
  );
}
