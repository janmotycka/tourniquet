import type { SeasonMatch, MatchLineupPlayer } from '../../types/match.types';
import { useI18n } from '../../i18n';

export function LineupTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
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
          background: isBench ? 'var(--surface-var)' : 'var(--primary)',
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
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👕 Základní sestava ({starters.length})</h3>
        {starters.map(p => <PlayerRow key={p.playerId} p={p} />)}
      </div>

      {bench.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🪑 Náhradníci ({bench.length})</h3>
          {bench.map(p => <PlayerRow key={p.playerId} p={p} isBench />)}
        </div>
      )}

      {match.substitutions.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{t('match.detail.subsLog', { count: match.substitutions.length })}</h3>
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
