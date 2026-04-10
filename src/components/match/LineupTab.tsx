import { useState } from 'react';
import type { SeasonMatch, MatchLineupPlayer } from '../../types/match.types';
import { useMatchesStore } from '../../store/matches.store';
import { useI18n } from '../../i18n';

// ── Inline player editor ──

function PlayerEditor({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');

  const starters = match.lineup.filter(p => p.isStarter).sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const benchers = match.lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);

  const handleAdd = () => {
    const j = parseInt(jersey);
    if (!name.trim() || isNaN(j) || j < 1 || j > 99) return;
    const newPlayer: MatchLineupPlayer = {
      playerId: `manual-${Date.now()}-${j}`,
      jerseyNumber: j,
      name: name.trim(),
      isStarter: starters.length < 11,
      substituteOrder: starters.length < 11 ? 0 : benchers.length + 1,
    };
    updateMatch(match.id, { lineup: [...match.lineup, newPlayer] });
    setName('');
    setJersey('');
  };

  const handleRemove = (playerId: string) => {
    updateMatch(match.id, { lineup: match.lineup.filter(p => p.playerId !== playerId) });
  };

  const toggleStarter = (playerId: string) => {
    const player = match.lineup.find(p => p.playerId === playerId);
    if (!player) return;
    const currentStarters = match.lineup.filter(p => p.isStarter);
    if (player.isStarter) {
      // Move to bench
      const benchCount = match.lineup.filter(p => !p.isStarter).length;
      updateMatch(match.id, {
        lineup: match.lineup.map(p =>
          p.playerId === playerId ? { ...p, isStarter: false, substituteOrder: benchCount + 1 } : p
        ),
      });
    } else if (currentStarters.length < 11) {
      updateMatch(match.id, {
        lineup: match.lineup.map(p =>
          p.playerId === playerId ? { ...p, isStarter: true, substituteOrder: 0 } : p
        ),
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Starters */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>👕 {t('match.create.startingLineup')}</h3>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
            background: starters.length === 11 ? 'var(--success-light)' : 'var(--warning-light)',
            color: starters.length === 11 ? 'var(--success)' : 'var(--warning)',
          }}>
            {starters.length}/11
          </span>
        </div>
        {starters.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            {t('match.lineup.emptyStarters')}
          </p>
        )}
        {starters.map(p => (
          <div key={p.playerId} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>{p.jerseyNumber}</div>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{p.name}</span>
            {match.status !== 'finished' && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => toggleStarter(p.playerId)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, background: 'var(--warning-light)', color: 'var(--warning)', border: 'none', cursor: 'pointer' }}>
                  → {t('match.lineup.toBench')}
                </button>
                <button onClick={() => handleRemove(p.playerId)}
                  style={{ fontSize: 13, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: 'var(--danger-light)', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bench */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>🪑 {t('match.create.benchTitle')}</h3>
        {benchers.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
            {t('match.lineup.emptyBench')}
          </p>
        )}
        {benchers.map(p => (
          <div key={p.playerId} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: 'var(--surface-var)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: 'var(--text)', flexShrink: 0,
            }}>{p.jerseyNumber}</div>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{p.name}</span>
            {match.status !== 'finished' && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => toggleStarter(p.playerId)}
                  disabled={starters.length >= 11}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: starters.length >= 11 ? 'var(--surface-var)' : 'var(--success-light)',
                    color: starters.length >= 11 ? 'var(--text-muted)' : 'var(--success)',
                  }}>
                  → {t('match.lineup.toStart')}
                </button>
                <button onClick={() => handleRemove(p.playerId)}
                  style={{ fontSize: 13, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: 'var(--danger-light)', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add player */}
      {match.status !== 'finished' && (
        <div style={{
          borderRadius: 14, padding: '14px 16px',
          border: '2px dashed var(--border)', background: 'transparent',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textAlign: 'center' }}>
            👤 {t('match.create.addPlayerManual')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('match.create.playerNamePlaceholder')}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)',
                fontSize: 14, background: 'var(--bg)', color: 'var(--text)',
              }}
            />
            <input
              type="number"
              value={jersey}
              onChange={e => setJersey(e.target.value)}
              placeholder="#"
              min={1} max={99}
              style={{
                width: 52, padding: '10px 8px', borderRadius: 10, border: '1.5px solid var(--border)',
                fontSize: 14, background: 'var(--bg)', color: 'var(--text)', textAlign: 'center',
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!name.trim() || !jersey}
              style={{
                padding: '10px 16px', borderRadius: 12, fontWeight: 800, fontSize: 16,
                background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: (!name.trim() || !jersey) ? 0.4 : 1,
              }}
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main LineupTab ──

export function LineupTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const [editMode, setEditMode] = useState(false);

  const starters = match.lineup.filter(p => p.isStarter).sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const bench = match.lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);
  const hasLineup = match.lineup.length > 0;

  // If no lineup, show editor directly
  if (!hasLineup || editMode) {
    return (
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {hasLineup && (
          <button
            onClick={() => setEditMode(false)}
            style={{
              alignSelf: 'flex-start', fontSize: 13, fontWeight: 600,
              color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            ← {t('common.back')}
          </button>
        )}
        <PlayerEditor match={match} />
      </div>
    );
  }

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
          {subbedOff && <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>↓{offMin}'</span>}
          {subbedOn && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>↑{onMin}'</span>}
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
      {/* Edit button */}
      {match.status !== 'finished' && (
        <button
          onClick={() => setEditMode(true)}
          style={{
            alignSelf: 'flex-end', fontSize: 13, fontWeight: 700,
            padding: '6px 14px', borderRadius: 10,
            background: 'var(--primary-light)', color: 'var(--primary)',
            border: 'none', cursor: 'pointer',
          }}
        >
          ✏️ {t('match.lineup.edit')}
        </button>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👕 {t('match.lineup.starters')} ({starters.length})</h3>
        {starters.map(p => <PlayerRow key={p.playerId} p={p} />)}
      </div>

      {bench.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🪑 {t('match.lineup.bench')} ({bench.length})</h3>
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
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>↓ {out?.name ?? '?'}</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>↑ {inn?.name ?? '?'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
