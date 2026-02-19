import { useState, useEffect } from 'react';
import type { Page } from '../../App';
import { useTournamentStore } from '../../store/tournament.store';
import { verifyPin, markPinVerified, isPinVerified } from '../../utils/pin-hash';
import { computeStandings, formatMatchTime, computeMatchElapsed, computeCurrentMinute } from '../../utils/tournament-schedule';
import { getTournamentPublicUrl, generateQRCodeDataUrl } from '../../utils/qr-code';
import type { Tournament, Match, Team, Player, Goal } from '../../types/tournament.types';

interface Props { tournamentId: string; navigate: (p: Page) => void; }

type Tab = 'standings' | 'matches' | 'settings';

// ─── Team logo/color badge ─────────────────────────────────────────────────────
function TeamBadge({ team, size = 12 }: { team?: Team; size?: number }) {
  if (team?.logoBase64) {
    return <img src={team.logoBase64} alt={team.name} style={{ width: size, height: size, borderRadius: size / 3, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return <div style={{ width: size, height: size, borderRadius: size / 3, background: team?.color ?? '#ccc', flexShrink: 0 }} />;
}

// ─── Roster modal ─────────────────────────────────────────────────────────────
function RosterModal({ tournament, teamId, onClose, readOnly = false, onAddPlayer, onRemovePlayer, onUpdatePlayer, onUpdateTeamName }: {
  tournament: Tournament;
  teamId: string;
  onClose: () => void;
  readOnly?: boolean;
  onAddPlayer?: (teamId: string, p: { name: string; jerseyNumber: number; birthYear: number | null }) => void;
  onRemovePlayer?: (teamId: string, playerId: string) => void;
  onUpdatePlayer?: (teamId: string, playerId: string, updates: { name?: string; jerseyNumber?: number; birthYear?: number | null }) => void;
  onUpdateTeamName?: (teamId: string, name: string) => void;
}) {
  const team = tournament.teams.find(t => t.id === teamId);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Název týmu
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  // Nový hráč
  const [newName, setNewName] = useState('');
  const [newJersey, setNewJersey] = useState('');
  const [newBirth, setNewBirth] = useState('');
  const [addError, setAddError] = useState('');
  // Inline edit stav
  const [editName, setEditName] = useState('');
  const [editJersey, setEditJersey] = useState('');
  const [editBirth, setEditBirth] = useState('');
  const [editError, setEditError] = useState('');

  const saveTeamName = () => {
    const trimmed = teamNameDraft.trim();
    if (trimmed && onUpdateTeamName) {
      onUpdateTeamName(teamId, trimmed);
    }
    setEditingTeamName(false);
  };

  if (!team) return null;

  const players = [...team.players].sort((a, b) => a.jerseyNumber - b.jerseyNumber);

  // Zjistí, zda číslo dresu už existuje v týmu (excludePlayerId = ignorovat aktuálně editovaného hráče)
  const isDuplicateJersey = (jersey: number, excludePlayerId?: string) =>
    team.players.some(p => p.jerseyNumber === jersey && p.id !== excludePlayerId);

  const startEdit = (p: Player) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditJersey(String(p.jerseyNumber));
    setEditBirth(p.birthYear != null ? String(p.birthYear) : '');
    setEditError('');
  };

  const saveEdit = (playerId: string) => {
    if (!editName.trim()) return;
    const jersey = parseInt(editJersey);
    if (isNaN(jersey) || jersey < 1 || jersey > 99) return;
    if (isDuplicateJersey(jersey, playerId)) {
      setEditError(`Číslo ${jersey} již má jiný hráč v tomto týmu.`);
      return;
    }
    const birth = editBirth ? parseInt(editBirth) : null;
    onUpdatePlayer?.(teamId, playerId, {
      name: editName.trim(),
      jerseyNumber: jersey,
      birthYear: birth && !isNaN(birth) ? birth : null,
    });
    setEditingId(null);
    setEditError('');
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    const jersey = parseInt(newJersey);
    if (isNaN(jersey) || jersey < 1 || jersey > 99) return;
    if (isDuplicateJersey(jersey)) {
      setAddError(`Číslo ${jersey} již má jiný hráč v tomto týmu.`);
      return;
    }
    const birth = newBirth ? parseInt(newBirth) : null;
    onAddPlayer?.(teamId, {
      name: newName.trim(),
      jerseyNumber: jersey,
      birthYear: birth && !isNaN(birth) ? birth : null,
    });
    setNewName(''); setNewJersey(''); setNewBirth(''); setAddError('');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480,
        padding: '0 0 32px', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px 14px' }}>
          <TeamBadge team={team} size={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {!readOnly && editingTeamName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  autoFocus
                  value={teamNameDraft}
                  onChange={e => setTeamNameDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveTeamName();
                    if (e.key === 'Escape') setEditingTeamName(false);
                  }}
                  style={{
                    flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: 8,
                    border: '1.5px solid var(--primary)', fontSize: 16, fontWeight: 800,
                    background: 'var(--bg)', color: 'var(--text)',
                  }}
                />
                <button onClick={saveTeamName} style={{ padding: '5px 10px', borderRadius: 8, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>✓</button>
                <button onClick={() => setEditingTeamName(false)} style={{ padding: '5px 10px', borderRadius: 8, background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}>✕</button>
              </div>
            ) : (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: readOnly ? 'default' : 'pointer' }}
                onClick={() => {
                  if (!readOnly) {
                    setTeamNameDraft(team.name);
                    setEditingTeamName(true);
                  }
                }}
              >
                <h2 style={{ fontWeight: 800, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</h2>
                {!readOnly && <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>✏️</span>}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Soupiska · {players.length} hráčů{readOnly ? ' (pouze náhled)' : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        {/* Hlavičky sloupců */}
        <div style={{
          display: 'grid', gridTemplateColumns: '36px 1fr 60px 50px',
          gap: 6, padding: '6px 20px', background: 'var(--surface-var)',
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        }}>
          <span style={{ textAlign: 'center' }}>#</span>
          <span>Jméno</span>
          <span style={{ textAlign: 'center' }}>Ročník</span>
          {!readOnly && <span />}
        </div>

        {/* Hráči */}
        <div style={{ flex: 1 }}>
          {players.map(p => (
            <div key={p.id}>
              {editingId === p.id ? (
                /* Inline editace */
                <div style={{ padding: '8px 20px', background: '#FFF8F0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 68px', gap: 6, marginBottom: 8 }}>
                    <input
                      type="number" min={1} max={99} value={editJersey}
                      onChange={e => { setEditJersey(e.target.value); setEditError(''); }}
                      placeholder="#"
                      style={{ padding: '7px', borderRadius: 8, border: `1.5px solid ${editError ? '#C62828' : '#FFB74D'}`, fontSize: 14, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' }}
                    />
                    <input
                      value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(p.id)}
                      placeholder="Jméno hráče"
                      style={{ padding: '7px', borderRadius: 8, border: '1.5px solid #FFB74D', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }}
                    />
                    <input
                      type="number" min={1990} max={2020} value={editBirth}
                      onChange={e => setEditBirth(e.target.value)}
                      placeholder="Ročník"
                      style={{ padding: '7px', borderRadius: 8, border: '1.5px solid #FFB74D', fontSize: 14, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => saveEdit(p.id)} style={{ flex: 1, padding: '7px', borderRadius: 8, background: '#E65100', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                      ✓ Uložit
                    </button>
                    <button onClick={() => { if (confirm(`Smazat hráče ${p.name}?`)) { onRemovePlayer?.(teamId, p.id); setEditingId(null); } }} style={{ padding: '7px 12px', borderRadius: 8, background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 13 }}>
                      🗑
                    </button>
                    <button onClick={() => { setEditingId(null); setEditError(''); }} style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 13 }}>
                      ✕
                    </button>
                  </div>
                  {editError && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#C62828', fontWeight: 600 }}>
                      ⚠️ {editError}
                    </div>
                  )}
                </div>
              ) : (
                /* Normální řádek */
                <div
                  onClick={() => !readOnly && startEdit(p)}
                  style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 60px 50px', gap: 6,
                    padding: '10px 20px', alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                    cursor: readOnly ? 'default' : 'pointer',
                    background: 'transparent',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: team.color, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 12,
                  }}>{p.jerseyNumber}</div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{p.name}</span>
                  <span style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                    {p.birthYear ?? '—'}
                  </span>
                  {!readOnly && (
                    <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>✏️</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {players.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Soupiska je prázdná.
            </div>
          )}
        </div>

        {/* Přidat hráče (jen admin) */}
        {!readOnly && (
          <div style={{ padding: '12px 20px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              ➕ Přidat hráče
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 68px', gap: 6, marginBottom: 8 }}>
              <input
                type="number" min={1} max={99} value={newJersey}
                onChange={e => { setNewJersey(e.target.value); setAddError(''); }}
                placeholder="#"
                style={{ padding: '8px', borderRadius: 9, border: `1.5px solid ${addError ? '#C62828' : 'var(--border)'}`, fontSize: 14, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' }}
              />
              <input
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="Jméno hráče"
                style={{ padding: '8px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }}
              />
              <input
                type="number" min={1990} max={2020} value={newBirth}
                onChange={e => setNewBirth(e.target.value)}
                placeholder="Ročník"
                style={{ padding: '8px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 14, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' }}
              />
            </div>
            {addError && (
              <div style={{ marginBottom: 6, fontSize: 12, color: '#C62828', fontWeight: 600 }}>
                ⚠️ {addError}
              </div>
            )}
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newJersey}
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                background: (!newName.trim() || !newJersey) ? 'var(--border)' : 'var(--primary)',
                color: (!newName.trim() || !newJersey) ? 'var(--text-muted)' : '#fff',
                fontWeight: 700, fontSize: 14,
              }}
            >Přidat hráče</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Standings table ──────────────────────────────────────────────────────────
function StandingsTab({ tournament, onTeamClick }: { tournament: Tournament; onTeamClick?: (teamId: string) => void }) {
  const standings = computeStandings(tournament.matches, tournament.teams);
  const getTeam = (id: string) => tournament.teams.find(t => t.id === id);

  // Zobrazit všechny týmy i když ještě nehrály
  const allTeamIds = tournament.teams.map(t => t.id);
  const standingTeamIds = standings.map(s => s.teamId);
  const displayStandings = [
    ...standings,
    ...allTeamIds
      .filter(id => !standingTeamIds.includes(id))
      .map(teamId => ({ teamId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 })),
  ];

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) 26px 26px 26px 38px 32px', gap: 4, padding: '8px 12px', background: 'var(--surface-var)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
          <span>#</span><span>Tým</span><span style={{ textAlign: 'center' }}>Z</span><span style={{ textAlign: 'center' }}>V</span><span style={{ textAlign: 'center' }}>P</span><span style={{ textAlign: 'center' }}>Skóre</span><span style={{ textAlign: 'center' }}>B</span>
        </div>
        {displayStandings.map((s, idx) => {
          const team = getTeam(s.teamId);
          const isFirst = idx === 0 && s.played > 0;
          return (
            <div
              key={s.teamId}
              onClick={() => onTeamClick?.(s.teamId)}
              style={{
                display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) 26px 26px 26px 38px 32px', gap: 4,
                padding: '10px 12px', alignItems: 'center',
                borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                background: isFirst ? 'var(--primary-light)' : 'transparent',
                cursor: onTeamClick ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontWeight: 700, color: isFirst ? 'var(--primary)' : 'var(--text-muted)', fontSize: 13 }}>
                {isFirst ? '🥇' : idx + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <TeamBadge team={team} size={12} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: isFirst ? 800 : 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? '?'}</div>
                  {onTeamClick && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team?.players.length ?? 0} hráčů</div>
                  )}
                </div>
              </div>
              <span style={{ textAlign: 'center', fontSize: 13 }}>{s.played}</span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#2E7D32', fontWeight: 600 }}>{s.won}</span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#C62828', fontWeight: 600 }}>{s.lost}</span>
              <span style={{ textAlign: 'center', fontSize: 12 }}>{s.goalsFor}:{s.goalsAgainst}</span>
              <span style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: isFirst ? 'var(--primary)' : 'var(--text)' }}>{s.points}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        Z = zápasy · V = výhry · P = prohry · B = body
        {onTeamClick && ' · klikni na tým pro soupisku'}
      </div>
    </div>
  );
}

// ─── Gól sub-modal ────────────────────────────────────────────────────────────
function GoalModal({ match, teams, onAdd, onClose }: {
  match: Match;
  teams: Team[];
  onAdd: (goal: Omit<Goal, 'id' | 'recordedAt'>) => void;
  onClose: () => void;
}) {
  const [scoringTeamId, setScoringTeamId] = useState(match.homeTeamId);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isOwnGoal, setIsOwnGoal] = useState(false);
  // Auto-minuta z timeru (pokud live), jinak 1
  const [minute, setMinute] = useState(() =>
    match.status === 'live' ? computeCurrentMinute(match.startedAt) : 1
  );
  const [ownGoalTeamId, setOwnGoalTeamId] = useState(match.homeTeamId);

  const scoringTeam = teams.find(t => t.id === scoringTeamId);

  const handleAdd = () => {
    onAdd({
      teamId: isOwnGoal ? ownGoalTeamId : scoringTeamId,
      playerId: isOwnGoal ? null : playerId,
      isOwnGoal,
      minute,
    });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '85dvh', overflowY: 'auto', padding: '0 0 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontWeight: 800, fontSize: 18 }}>⚽ Kdo dal gól?</h2>
            <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
          </div>

          {/* Vlastní gól toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setIsOwnGoal(false)} style={{
              flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: !isOwnGoal ? 'var(--primary)' : 'var(--surface-var)',
              color: !isOwnGoal ? '#fff' : 'var(--text)',
            }}>Regulérní gól</button>
            <button onClick={() => setIsOwnGoal(true)} style={{
              flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: isOwnGoal ? '#C62828' : 'var(--surface-var)',
              color: isOwnGoal ? '#fff' : 'var(--text)',
            }}>Vlastní gól</button>
          </div>

          {/* Výběr týmu / hráče */}
          {!isOwnGoal ? (
            <>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Tým, který dal gól:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[match.homeTeamId, match.awayTeamId].map(tid => {
                    const t = teams.find(x => x.id === tid);
                    return (
                      <button key={tid} onClick={() => { setScoringTeamId(tid); setPlayerId(null); }} style={{
                        flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                        background: scoringTeamId === tid ? t?.color ?? 'var(--primary)' : 'var(--surface-var)',
                        color: scoringTeamId === tid ? '#fff' : 'var(--text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                        {t?.logoBase64 ? (
                          <img src={t.logoBase64} alt="" style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover' }} />
                        ) : null}
                        {t?.name ?? '?'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {scoringTeam && scoringTeam.players.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Střelec:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    <button onClick={() => setPlayerId(null)} style={{
                      padding: '8px 12px', borderRadius: 8, textAlign: 'left', fontWeight: 600, fontSize: 14,
                      background: playerId === null ? 'var(--primary-light)' : 'var(--surface-var)',
                      color: playerId === null ? 'var(--primary)' : 'var(--text)',
                      border: playerId === null ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                    }}>
                      — Bez střelce
                    </button>
                    {scoringTeam.players.map((p: Player) => (
                      <button key={p.id} onClick={() => setPlayerId(p.id)} style={{
                        padding: '8px 12px', borderRadius: 8, textAlign: 'left', fontSize: 14,
                        background: playerId === p.id ? 'var(--primary-light)' : 'var(--surface-var)',
                        color: playerId === p.id ? 'var(--primary)' : 'var(--text)',
                        border: playerId === p.id ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: 6, background: scoringTeam.color,
                          color: '#fff', fontWeight: 700, fontSize: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>{p.jerseyNumber}</span>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Tým, který dal vlastní gól (gól se přičte soupeři):</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[match.homeTeamId, match.awayTeamId].map(tid => {
                  const t = teams.find(x => x.id === tid);
                  return (
                    <button key={tid} onClick={() => setOwnGoalTeamId(tid)} style={{
                      flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                      background: ownGoalTeamId === tid ? '#C62828' : 'var(--surface-var)',
                      color: ownGoalTeamId === tid ? '#fff' : 'var(--text)',
                    }}>{t?.name ?? '?'}</button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Minuta */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Minuta gólu</div>
              {match.status === 'live' && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Předvyplněno z odpočítávače</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setMinute(m => Math.max(1, m - 1))} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-var)', fontWeight: 700, fontSize: 16 }}>−</button>
              <span style={{ fontWeight: 800, fontSize: 18, minWidth: 32, textAlign: 'center', color: 'var(--primary)' }}>{minute}</span>
              <button onClick={() => setMinute(m => Math.min(120, m + 1))} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-var)', fontWeight: 700, fontSize: 16 }}>+</button>
            </div>
          </div>

          <button onClick={handleAdd} style={{
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 16,
            padding: '14px', borderRadius: 14, marginTop: 4,
          }}>
            ✅ Zapsat gól
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Score modal ──────────────────────────────────────────────────────────────
function ScoreModal({ match, tournament, onClose, onStart, onFinish, onAddGoal, onRemoveLastGoal, onRemoveGoal, onUpdateGoalPlayer, onReopen, onReset }: {
  match: Match;
  tournament: Tournament;
  onClose: () => void;
  onStart: () => void;
  onFinish: () => void;
  onAddGoal: (goal: Omit<Goal, 'id' | 'recordedAt'>) => void;
  onRemoveLastGoal: () => void;
  onRemoveGoal: (goalId: string) => void;
  onUpdateGoalPlayer: (goalId: string, playerId: string | null) => void;
  onReopen: () => void;
  onReset: () => void;
}) {
  const [showGoalModal, setShowGoalModal] = useState<'home' | 'away' | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(() => computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
  const homeTeam = tournament.teams.find(t => t.id === match.homeTeamId);
  const awayTeam = tournament.teams.find(t => t.id === match.awayTeamId);

  // Timer — aktualizace každou sekundu jen když live a není pauza
  useEffect(() => {
    if (match.status !== 'live') return;
    if (match.pausedAt) {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
      return;
    }
    setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    const interval = setInterval(() => {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [match.status, match.startedAt, match.pausedAt, match.pausedElapsed]);

  const durationSec = match.durationMinutes * 60;
  const remaining = durationSec - elapsed;
  const isOvertime = remaining < 0;
  const isPausedModal = match.status === 'live' && !!match.pausedAt;
  // Countdown display
  const displaySec = isOvertime ? -remaining : remaining;
  const timerMM = Math.floor(displaySec / 60).toString().padStart(2, '0');
  const timerSS = (displaySec % 60).toString().padStart(2, '0');
  const timerLabel = isOvertime ? `+${timerMM}:${timerSS}` : `${timerMM}:${timerSS}`;
  const timerColor = isPausedModal ? '#E65100' : isOvertime ? '#C62828' : remaining <= 60 ? '#E65100' : 'var(--text)';

  const handleGoalModalAdd = (goal: Omit<Goal, 'id' | 'recordedAt'>) => {
    onAddGoal(goal);
    setShowGoalModal(null);
  };

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--surface)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480,
          padding: '0 0 32px', maxHeight: '92dvh', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
          </div>

          <div style={{ padding: '8px 20px 0' }}>
            {/* Status + čas */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                background: match.status === 'live' ? '#FFEBEE' : match.status === 'finished' ? '#F3E5F5' : 'var(--surface-var)',
                color: match.status === 'live' ? '#C62828' : match.status === 'finished' ? '#6A1B9A' : 'var(--text-muted)',
              }}>
                {match.status === 'live' ? '🔴 ŽIVĚ' : match.status === 'finished' ? '✅ Ukončeno' : '🕐 Naplánováno'}
              </span>
              {/* Timer — countdown */}
              {match.status === 'live' && (
                <span style={{
                  fontWeight: 800, fontSize: 18, color: timerColor,
                  fontVariantNumeric: 'tabular-nums',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {isPausedModal && <span style={{ fontSize: 13 }}>⏸</span>}
                  {timerLabel}
                  {isOvertime && <span style={{ fontSize: 12, marginLeft: 2 }}>nadčas</span>}
                </span>
              )}
              <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
            </div>

            {/* Live score */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {homeTeam?.logoBase64 ? (
                  <img src={homeTeam.logoBase64} alt={homeTeam.name} style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', margin: '0 auto 5px', display: 'block' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: homeTeam?.color ?? '#ccc', margin: '0 auto 5px' }} />
                )}
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {homeTeam?.name ?? '?'}
                </div>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 48, lineHeight: 1, color: 'var(--text)', letterSpacing: -2 }}>
                  {match.homeScore}<span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>:</span>{match.awayScore}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {awayTeam?.logoBase64 ? (
                  <img src={awayTeam.logoBase64} alt={awayTeam.name} style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', margin: '0 auto 5px', display: 'block' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: awayTeam?.color ?? '#ccc', margin: '0 auto 5px' }} />
                )}
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {awayTeam?.name ?? '?'}
                </div>
              </div>
            </div>

            {/* +1 Gól tlačítka (jen živý zápas) */}
            {match.status === 'live' && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <button onClick={() => setShowGoalModal('home')} style={{
                  flex: 1, background: homeTeam?.color ?? 'var(--primary)', color: '#fff',
                  fontWeight: 800, fontSize: 20, padding: '18px 10px', borderRadius: 14,
                }}>
                  +1 ⚽<br />
                  <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>{homeTeam?.name}</span>
                </button>
                <button onClick={() => setShowGoalModal('away')} style={{
                  flex: 1, background: awayTeam?.color ?? '#666', color: '#fff',
                  fontWeight: 800, fontSize: 20, padding: '18px 10px', borderRadius: 14,
                }}>
                  +1 ⚽<br />
                  <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>{awayTeam?.name}</span>
                </button>
              </div>
            )}

            {/* Historie gólů */}
            {match.goals.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {/* Edit mód hlavička — pro live i finished */}
                {(match.status === 'finished' || match.status === 'live') && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                    <button
                      onClick={() => { setEditMode(e => !e); setEditingGoalId(null); }}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                        background: editMode ? '#FFF3E0' : 'var(--surface-var)',
                        color: editMode ? '#E65100' : 'var(--text-muted)',
                        border: editMode ? '1px solid #FFB74D' : '1px solid transparent',
                      }}
                    >
                      {editMode ? '✅ Hotovo' : '✏️ Upravit góly'}
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[...match.goals].sort((a, b) => a.minute - b.minute).map(g => {
                    const team = tournament.teams.find(t => t.id === g.teamId);
                    const player = team?.players.find((p: Player) => p.id === g.playerId);
                    const beneficiaryId = g.isOwnGoal
                      ? (g.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId)
                      : g.teamId;
                    const isHomeGoal = beneficiaryId === match.homeTeamId;
                    const playerLabel = g.isOwnGoal
                      ? `⚠️ VG (${team?.name ?? '?'})`
                      : player ? `${player.jerseyNumber}. ${player.name}` : 'bez střelce';
                    const homeBeneficiary = tournament.teams.find(t => t.id === match.homeTeamId);
                    const awayBeneficiary = tournament.teams.find(t => t.id === match.awayTeamId);
                    const isEditing = editMode && editingGoalId === g.id;
                    const scoringTeam = tournament.teams.find(t => t.id === beneficiaryId);

                    return (
                      <div key={g.id}>
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 32px 1fr', gap: 4, alignItems: 'center',
                        }}>
                          {/* Domácí strana */}
                          {isHomeGoal ? (
                            <button
                              onClick={() => editMode && setEditingGoalId(isEditing ? null : g.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5, textAlign: 'left',
                                background: isEditing ? '#FFF3E0' : 'var(--surface-var)',
                                borderRadius: 6, padding: '4px 6px 4px 4px',
                                borderLeft: `3px solid ${homeBeneficiary?.color ?? 'var(--primary)'}`,
                                outline: isEditing ? '2px solid #FFB74D' : 'none',
                                cursor: editMode ? 'pointer' : 'default',
                              }}
                            >
                              <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: homeBeneficiary?.color ?? 'var(--primary)' }} />
                              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                ⚽ {playerLabel}
                              </span>
                              {editMode && <span style={{ fontSize: 10, color: '#E65100', fontWeight: 700, flexShrink: 0 }}>✏️</span>}
                            </button>
                          ) : <div />}

                          <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                            {g.minute}'
                          </div>

                          {/* Hosté strana */}
                          {!isHomeGoal ? (
                            <button
                              onClick={() => editMode && setEditingGoalId(isEditing ? null : g.id)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, textAlign: 'right',
                                background: isEditing ? '#FFF3E0' : 'var(--surface-var)',
                                borderRadius: 6, padding: '4px 4px 4px 6px',
                                borderRight: `3px solid ${awayBeneficiary?.color ?? '#666'}`,
                                outline: isEditing ? '2px solid #FFB74D' : 'none',
                                cursor: editMode ? 'pointer' : 'default',
                              }}
                            >
                              {editMode && <span style={{ fontSize: 10, color: '#E65100', fontWeight: 700, flexShrink: 0 }}>✏️</span>}
                              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {playerLabel} ⚽
                              </span>
                              <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: awayBeneficiary?.color ?? '#666' }} />
                            </button>
                          ) : <div />}
                        </div>

                        {/* Rozbalená editace gólu */}
                        {isEditing && scoringTeam && (
                          <div style={{
                            margin: '4px 0 6px', padding: '10px', borderRadius: 10,
                            background: '#FFF8F0', border: '1px solid #FFB74D',
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#E65100', marginBottom: 8 }}>
                              Přiřadit střelce ({scoringTeam.name}):
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                              <button
                                onClick={() => { onUpdateGoalPlayer(g.id, null); setEditingGoalId(null); }}
                                style={{
                                  padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                                  background: g.playerId === null ? '#FFB74D' : 'var(--surface-var)',
                                  color: g.playerId === null ? '#fff' : 'var(--text-muted)',
                                  border: '1px dashed var(--border)',
                                }}
                              >— Bez střelce</button>
                              {scoringTeam.players.slice().sort((a, b) => a.jerseyNumber - b.jerseyNumber).map((p: Player) => (
                                <button
                                  key={p.id}
                                  onClick={() => { onUpdateGoalPlayer(g.id, p.id); setEditingGoalId(null); }}
                                  style={{
                                    padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                                    background: g.playerId === p.id ? scoringTeam.color : 'var(--surface-var)',
                                    color: g.playerId === p.id ? '#fff' : 'var(--text)',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                  }}
                                >
                                  <span style={{ background: 'rgba(0,0,0,.15)', borderRadius: 4, padding: '1px 4px', fontSize: 10 }}>{p.jerseyNumber}</span>
                                  {p.name}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => { onRemoveGoal(g.id); setEditingGoalId(null); }}
                              style={{
                                width: '100%', padding: '7px', borderRadius: 8,
                                background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 12,
                              }}
                            >🗑 Smazat tento gól</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {match.status === 'live' && match.goals.length > 0 && (
                  <button onClick={onRemoveLastGoal} style={{
                    marginTop: 8, width: '100%', padding: '8px', borderRadius: 10,
                    background: '#FFEBEE', color: '#C62828', fontWeight: 600, fontSize: 13,
                  }}>
                    ↩ Zrušit poslední gól
                  </button>
                )}
              </div>
            )}

            {/* Akce */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {match.status === 'scheduled' && (
                <button onClick={onStart} style={{
                  background: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 16,
                  padding: '14px', borderRadius: 14, border: '1.5px solid #FFB74D',
                }}>
                  ▶ Začít zápas
                </button>
              )}
              {match.status === 'live' && (
                <button onClick={onFinish} style={{
                  background: '#B71C1C', color: '#fff', fontWeight: 700, fontSize: 16,
                  padding: '14px', borderRadius: 14,
                }}>
                  ⏹ Ukončit zápas
                </button>
              )}
              {match.status === 'finished' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { if (confirm('Znovu spustit zápas? Výsledek zůstane, ale zápas se označí jako ŽIVĚ.')) onReopen(); }}
                    style={{
                      flex: 1, background: 'var(--surface-var)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 14,
                      padding: '11px', borderRadius: 12, border: '1px solid var(--border)',
                    }}
                  >
                    ↩ Znovu spustit
                  </button>
                  <button
                    onClick={() => { if (confirm('Resetovat zápas? Tím se smažou všechny góly a skóre se vrátí na 0:0. Zápas bude jako nový.')) { onReset(); onClose(); } }}
                    style={{
                      flex: 1, background: '#FFEBEE', color: '#C62828', fontWeight: 600, fontSize: 14,
                      padding: '11px', borderRadius: 12, border: '1px solid #FFCDD2',
                    }}
                  >
                    🔄 Reset zápasu
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Gól sub-modal */}
      {showGoalModal && (
        <GoalModal
          match={{
            ...match,
            homeTeamId: showGoalModal === 'home' ? match.homeTeamId : match.awayTeamId,
            awayTeamId: showGoalModal === 'home' ? match.awayTeamId : match.homeTeamId,
          }}
          teams={tournament.teams}
          onAdd={goal => handleGoalModalAdd({
            ...goal,
            teamId: showGoalModal === 'home' ? match.homeTeamId : match.awayTeamId,
          })}
          onClose={() => setShowGoalModal(null)}
        />
      )}
    </>
  );
}

// ─── Match card timer — countdown + pauza podpora ─────────────────────────────
// Zobrazuje zbývající čas do konce (countdown). Nadčas s "+".
function MatchCardTimer({ match, variant = 'card' }: { match: Match; variant?: 'card' | 'list' }) {
  const [elapsed, setElapsed] = useState(() =>
    computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed)
  );

  useEffect(() => {
    // Pokud je pauza — timer se nemá pohybovat
    if (match.pausedAt) {
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

// ─── Inline gól panel — tým je už předvybraný, stačí vybrat hráče ─────────────
function InlineGoalPanel({ match, teams, teamId, onGoal, onClose }: {
  match: Match;
  teams: Team[];
  teamId: string;         // předvybraný tým (domácí nebo hosté)
  onGoal: (matchId: string, teamId: string, playerId: string | null) => void;
  onClose: () => void;
}) {
  const team = teams.find(t => t.id === teamId);
  const teamColor = team?.color ?? '#666';

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: '0 0 14px 14px',
      boxShadow: `0 0 0 2px ${teamColor}`,
      overflow: 'hidden',
    }}>
      {/* Hlavička s barvou týmu */}
      <div style={{
        background: teamColor, padding: '6px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {team?.logoBase64
            ? <img src={team.logoBase64} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
            : null
          }
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>
            ⚽ {team?.name ?? '?'}
          </span>
        </div>
        <button onClick={onClose} style={{ color: 'rgba(255,255,255,.75)', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>✕</button>
      </div>

      {/* Hráči */}
      <div style={{ padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {/* Bez střelce */}
        <button
          onClick={() => { onGoal(match.id, teamId, null); onClose(); }}
          style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            border: '1.5px dashed var(--border)',
          }}
        >
          — Bez střelce
        </button>

        {(team?.players ?? [])
          .slice()
          .sort((a, b) => a.jerseyNumber - b.jerseyNumber)
          .map(p => (
            <button
              key={p.id}
              onClick={() => { onGoal(match.id, teamId, p.id); onClose(); }}
              style={{
                padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: teamColor, color: '#fff',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <span style={{
                background: 'rgba(255,255,255,.22)', borderRadius: 4, padding: '1px 5px',
                fontSize: 11, fontWeight: 800, minWidth: 20, textAlign: 'center',
              }}>{p.jerseyNumber}</span>
              {p.name}
            </button>
          ))}

        {(team?.players ?? []).length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
            Žádní hráči v soupisce.
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Matches tab ──────────────────────────────────────────────────────────────
function MatchesTab({ tournament, isVerified, onQuickGoal, onStartMatch, onFinishMatchConfirm, onPauseMatch, onResumeMatch, onEditMatch }: {
  tournament: Tournament;
  isVerified: boolean;
  onQuickGoal: (matchId: string, teamId: string, playerId: string | null) => void;
  onStartMatch: (matchId: string) => void;
  onFinishMatchConfirm: (matchId: string) => void;
  onPauseMatch: (matchId: string) => void;
  onResumeMatch: (matchId: string) => void;
  onEditMatch: (match: Match) => void;
}) {
  const [openGoalPanel, setOpenGoalPanel] = useState<{ matchId: string; side: 'home' | 'away' } | null>(null);
  const rounds = [...new Set(tournament.matches.map(m => m.roundIndex))].sort((a, b) => a - b);
  const getTeam = (id: string) => tournament.teams.find(t => t.id === id);

  const toggleGoal = (matchId: string, side: 'home' | 'away') => {
    setOpenGoalPanel(prev =>
      prev?.matchId === matchId && prev.side === side ? null : { matchId, side }
    );
  };

  if (tournament.matches.length === 0) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>Žádné zápasy.</div>;
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rounds.map(roundIdx => {
        const roundMatches = tournament.matches.filter(m => m.roundIndex === roundIdx);
        return (
          <div key={roundIdx}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Runda {roundIdx + 1}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {roundMatches.map(match => {
                const homeT = getTeam(match.homeTeamId);
                const awayT = getTeam(match.awayTeamId);
                const isLive = match.status === 'live';
                const isScheduled = match.status === 'scheduled';
                const isFinished = match.status === 'finished';
                const isPaused = isLive && !!match.pausedAt;
                const panelOpen = openGoalPanel?.matchId === match.id;
                const panelSide = panelOpen ? openGoalPanel!.side : null;
                const panelTeamId = panelSide === 'home' ? match.homeTeamId : match.awayTeamId;

                // Barva skóre
                const scoreColor = isScheduled ? 'var(--text-muted)' : isLive ? (isPaused ? '#E65100' : '#C62828') : 'var(--text)';

                return (
                  <div key={match.id}>
                    <div style={{
                      background: 'var(--surface)',
                      borderRadius: panelOpen ? '14px 14px 0 0' : 14,
                      border: isLive
                        ? `2px solid ${isPaused ? '#E65100' : '#C62828'}`
                        : isFinished
                        ? '1.5px solid #C8E6C9'
                        : '1.5px solid var(--border)',
                      boxShadow: isLive
                        ? `0 2px 8px rgba(198,40,40,.15)`
                        : '0 1px 3px rgba(0,0,0,.06)',
                      overflow: 'hidden',
                    }}>

                      {/* ══ LIVE zápas — 3-sloupcový layout ══ */}
                      {isLive && (
                        <>
                          {/* Řádek 1: tým A | skóre + timer | tým B */}
                          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px 4px', gap: 8 }}>
                            {/* Levý tým */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <TeamBadge team={homeT} size={14} />
                              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {homeT?.name ?? '?'}
                              </span>
                            </div>
                            {/* Střed: skóre + badge */}
                            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 70 }}>
                              <div style={{ fontWeight: 900, fontSize: 24, lineHeight: 1, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>
                                {`${match.homeScore}:${match.awayScore}`}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <div style={{ width: 5, height: 5, borderRadius: 3, background: isPaused ? '#E65100' : '#C62828' }} />
                                <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 0.5, color: isPaused ? '#E65100' : '#C62828' }}>
                                  {isPaused ? 'PAUZA' : 'ŽIVĚ'}
                                </span>
                              </div>
                            </div>
                            {/* Pravý tým */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                {awayT?.name ?? '?'}
                              </span>
                              <TeamBadge team={awayT} size={14} />
                            </div>
                          </div>

                          {/* Řádek 2: timer + ⚽ tlačítka přes celou šířku */}
                          <div style={{ display: 'flex', alignItems: 'center', padding: '2px 12px 6px', gap: 8 }}>
                            {/* ⚽ domácí */}
                            {isVerified ? (
                              <button
                                onClick={() => toggleGoal(match.id, 'home')}
                                title={`Gól: ${homeT?.name}`}
                                style={{
                                  flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 14, fontWeight: 800,
                                  background: panelSide === 'home' ? (homeT?.color ?? '#666') : (homeT?.color ? homeT.color + '22' : 'var(--surface-var)'),
                                  color: panelSide === 'home' ? '#fff' : (homeT?.color ?? 'var(--text-muted)'),
                                  border: `2px solid ${homeT?.color ?? '#ccc'}`,
                                  transition: 'all .12s',
                                }}
                              >⚽ +1</button>
                            ) : <div style={{ flex: 1 }} />}

                            {/* Timer countdown */}
                            <div style={{ flexShrink: 0, minWidth: 60, textAlign: 'center' }}>
                              <MatchCardTimer match={match} variant="list" />
                            </div>

                            {/* ⚽ hosté */}
                            {isVerified ? (
                              <button
                                onClick={() => toggleGoal(match.id, 'away')}
                                title={`Gól: ${awayT?.name}`}
                                style={{
                                  flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 14, fontWeight: 800,
                                  background: panelSide === 'away' ? (awayT?.color ?? '#666') : (awayT?.color ? awayT.color + '22' : 'var(--surface-var)'),
                                  color: panelSide === 'away' ? '#fff' : (awayT?.color ?? 'var(--text-muted)'),
                                  border: `2px solid ${awayT?.color ?? '#ccc'}`,
                                  transition: 'all .12s',
                                }}
                              >+1 ⚽</button>
                            ) : <div style={{ flex: 1 }} />}
                          </div>

                          {/* Řádek 3: akce bar (jen admin) */}
                          {isVerified && (
                            <div style={{ display: 'flex', gap: 6, padding: '0 12px 9px', alignItems: 'center' }}>
                              {isPaused ? (
                                <button
                                  onClick={() => onResumeMatch(match.id)}
                                  style={{
                                    padding: '6px 14px', borderRadius: 9,
                                    background: '#FFF3E0', color: '#E65100',
                                    fontWeight: 700, fontSize: 13,
                                    border: '1.5px solid #FFB74D',
                                  }}
                                >▶</button>
                              ) : (
                                <button
                                  onClick={() => onPauseMatch(match.id)}
                                  style={{
                                    padding: '6px 14px', borderRadius: 9,
                                    background: 'var(--surface-var)', color: '#E65100',
                                    fontWeight: 700, fontSize: 13,
                                    border: '1px solid #FFB74D',
                                  }}
                                >⏸</button>
                              )}
                              <button
                                onClick={() => onFinishMatchConfirm(match.id)}
                                style={{
                                  flex: 1, padding: '6px 0', borderRadius: 9,
                                  background: '#FFEBEE', color: '#C62828',
                                  fontWeight: 700, fontSize: 13,
                                  border: '1px solid #FFCDD2',
                                }}
                              >⏹ Ukončit</button>
                              <button
                                onClick={() => onEditMatch(match)}
                                style={{
                                  padding: '6px 10px', borderRadius: 9,
                                  background: 'var(--surface-var)', color: 'var(--text-muted)',
                                  fontWeight: 700, fontSize: 13,
                                  border: '1px solid var(--border)',
                                }}
                              >✏️</button>
                            </div>
                          )}
                        </>
                      )}

                      {/* ══ SCHEDULED / FINISHED — kompaktní jednořádkový layout ══ */}
                      {!isLive && (
                        <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', gap: 8 }}>
                          {/* Status vlevo: ikonka + čas/tlačítko */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 48, flexShrink: 0 }}>
                            {isFinished
                              ? <span style={{ fontSize: 11, color: '#2E7D32', flexShrink: 0 }}>✓</span>
                              : isVerified
                              ? (
                                <button
                                  onClick={() => onStartMatch(match.id)}
                                  style={{
                                    width: 22, height: 22, borderRadius: 6,
                                    background: '#FFF3E0', color: '#E65100',
                                    fontWeight: 900, fontSize: 11,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    border: '1px solid #FFB74D',
                                  }}
                                >▶</button>
                              )
                              : <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>·</span>
                            }
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                              {formatMatchTime(match.scheduledTime)}
                            </span>
                          </div>

                          {/* Tým A */}
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <TeamBadge team={homeT} size={12} />
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {homeT?.name ?? '?'}
                            </span>
                          </div>

                          {/* Skóre střed — podbarvené jako v PublicView */}
                          <div style={{
                            flexShrink: 0,
                            background: isFinished ? '#E8F5E9' : 'transparent',
                            borderRadius: 8,
                            padding: isFinished ? '3px 8px' : '3px 4px',
                            minWidth: 44, textAlign: 'center',
                          }}>
                            <span style={{
                              fontWeight: 900, fontSize: isFinished ? 15 : 16,
                              color: isFinished ? '#2E7D32' : 'var(--text-muted)',
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {isScheduled ? '— : —' : `${match.homeScore} : ${match.awayScore}`}
                            </span>
                          </div>

                          {/* Tým B */}
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                              {awayT?.name ?? '?'}
                            </span>
                            <TeamBadge team={awayT} size={12} />
                          </div>

                          {/* Akce vpravo */}
                          {isVerified && isFinished && (
                            <button
                              onClick={() => onEditMatch(match)}
                              style={{
                                flexShrink: 0, width: 30, height: 30, borderRadius: 8,
                                background: 'var(--surface-var)', color: 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, border: '1px solid var(--border)',
                              }}
                            >✏️</button>
                          )}
                          {/* placeholder pro alignment */}
                          {(!isVerified || isScheduled) && <div style={{ width: 30, flexShrink: 0 }} />}
                        </div>
                      )}
                    </div>

                    {/* Inline goal panel */}
                    {panelOpen && isVerified && (
                      <InlineGoalPanel
                        match={match}
                        teams={tournament.teams}
                        teamId={panelTeamId}
                        onGoal={(matchId, teamId, playerId) => {
                          onQuickGoal(matchId, teamId, playerId);
                          setOpenGoalPanel(null);
                        }}
                        onClose={() => setOpenGoalPanel(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Settings tab ─────────────────────────────────────────────────────────────
function SettingsTab({ tournament, navigate }: { tournament: Tournament; navigate: (p: Page) => void }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rulesEdit, setRulesEdit] = useState(tournament.settings.rules ?? '');
  const [rulesSaved, setRulesSaved] = useState(false);
  const deleteTournament = useTournamentStore(s => s.deleteTournament);
  const updateTournament = useTournamentStore(s => s.updateTournament);

  useEffect(() => {
    generateQRCodeDataUrl(tournament.id).then(setQrUrl).catch(() => {});
  }, [tournament.id]);

  const publicUrl = getTournamentPublicUrl(tournament.id);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    if (confirm(`Smazat turnaj "${tournament.name}"? Tato akce je nevratná.`)) {
      deleteTournament(tournament.id);
      navigate({ name: 'tournament-list' });
    }
  };

  const handlePublicView = () => {
    navigate({ name: 'tournament-public', tournamentId: tournament.id });
  };

  const handleSaveRules = () => {
    updateTournament(tournament.id, { settings: { ...tournament.settings, rules: rulesEdit.trim() || undefined } });
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 2000);
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* QR kód */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, alignSelf: 'flex-start' }}>📱 QR kód pro hosty</h3>
        {qrUrl
          ? <img src={qrUrl} alt="QR kód turnaje" style={{ width: 200, height: 200, borderRadius: 12 }} />
          : <div style={{ width: 200, height: 200, borderRadius: 12, background: 'var(--surface-var)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Načítání…</div>
        }
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
          Naskenováním QR kódu si hosté zobrazí živou tabulku a výsledky.
        </p>
        <button onClick={handleCopy} style={{
          background: copied ? '#2E7D32' : 'var(--primary)', color: '#fff', fontWeight: 700,
          fontSize: 14, padding: '10px 20px', borderRadius: 10, transition: 'background .2s',
        }}>
          {copied ? '✅ Zkopírováno!' : '🔗 Kopírovat odkaz'}
        </button>
        <button onClick={handlePublicView} style={{
          background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
          fontSize: 14, padding: '10px 20px', borderRadius: 10,
        }}>
          👁 Zobrazit jako host
        </button>
      </div>

      {/* Propozice */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>📋 Pravidla / propozice</h3>
        <textarea
          value={rulesEdit}
          onChange={e => { setRulesEdit(e.target.value); setRulesSaved(false); }}
          placeholder="Popis pravidel, délka poločasů, penalty, formát skupin..."
          rows={5}
          style={{
            width: '100%', padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)',
            fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            resize: 'vertical', lineHeight: 1.5,
          }}
        />
        <button onClick={handleSaveRules} style={{
          background: rulesSaved ? '#2E7D32' : 'var(--primary)', color: '#fff',
          fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 10,
          alignSelf: 'flex-start', transition: 'background .2s',
        }}>
          {rulesSaved ? '✅ Uloženo!' : '💾 Uložit propozice'}
        </button>
      </div>

      {/* Pravidla pro umístění v tabulce */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🏅 Kritéria pro umístění v tabulce</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          V případě shody bodů rozhodují tato kritéria postupně:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { n: '1', label: 'Počet bodů', desc: 'výhra = 3 body, remíza = 1 bod, prohra = 0 bodů' },
            { n: '2', label: 'Gólový rozdíl', desc: 'vstřelené góly minus obdržené góly' },
            { n: '3', label: 'Vstřelené góly', desc: 'celkový počet gólů ve prospěch týmu' },
            { n: '4', label: 'Abeceda', desc: 'název týmu dle českého abecedního pořadí' },
          ].map(item => (
            <div key={item.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 11, background: 'var(--primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0, marginTop: 1,
              }}>{item.n}</div>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{item.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>— {item.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 12, padding: '8px 12px', background: 'var(--surface-var)', borderRadius: 10,
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
          borderLeft: '3px solid var(--primary)',
        }}>
          💡 <strong>Tip:</strong> Tato pravidla jsou automatická. Pokud chcete použít jiná kritéria (např. vzájemné zápasy), popište je v propozicích a rozhodněte manuálně.
        </div>
      </div>

      {/* Informace */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>ℹ️ Informace</h3>
        {[
          { label: 'Délka zápasu', value: `${tournament.settings.matchDurationMinutes} min` },
          { label: 'Přestávka', value: `${tournament.settings.breakBetweenMatchesMinutes} min` },
          { label: 'Počet týmů', value: String(tournament.teams.length) },
          { label: 'Celkem zápasů', value: String(tournament.matches.length) },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Nebezpečná zóna */}
      <button onClick={handleDelete} style={{
        background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 14,
        padding: '14px', borderRadius: 14, border: '1.5px solid #FFCDD2',
      }}>
        🗑 Smazat turnaj
      </button>
    </div>
  );
}

// ─── PIN gate ─────────────────────────────────────────────────────────────────
function PinGate({ tournament, onVerified }: { tournament: Tournament; onVerified: () => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (input.length < 4) { setError('PIN musí mít alespoň 4 číslice'); return; }
    setLoading(true);
    const ok = await verifyPin(input, tournament.pinHash);
    setLoading(false);
    if (ok) {
      markPinVerified(tournament.id);
      onVerified();
    } else {
      setError('Nesprávný PIN. Zkuste to znovu.');
      setInput('');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 20, padding: '28px 24px',
        width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
          <h2 style={{ fontWeight: 800, fontSize: 20 }}>Zadejte PIN organizátora</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>
            Pro zápis výsledků je vyžadován PIN.
          </p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={input}
          onChange={e => { setInput(e.target.value.replace(/\D/g, '')); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
          placeholder="••••"
          autoFocus
          style={{
            width: '100%', padding: '14px', borderRadius: 12, fontSize: 24,
            border: `2px solid ${error ? '#C62828' : 'var(--border)'}`,
            background: 'var(--bg)', color: 'var(--text)', letterSpacing: 10,
            textAlign: 'center', boxSizing: 'border-box',
          }}
        />
        {error && <div style={{ color: '#C62828', fontSize: 13, textAlign: 'center' }}>⚠️ {error}</div>}
        <button onClick={handleVerify} disabled={loading || input.length < 4} style={{
          background: loading || input.length < 4 ? 'var(--border)' : 'var(--primary)',
          color: loading || input.length < 4 ? 'var(--text-muted)' : '#fff',
          fontWeight: 700, fontSize: 16, padding: '14px', borderRadius: 12,
        }}>
          {loading ? 'Ověřuji…' : 'Potvrdit PIN'}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function TournamentDetailPage({ tournamentId, navigate }: Props) {
  const [tab, setTab] = useState<Tab>('standings');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showPinGate, setShowPinGate] = useState(false);
  const [pinVerified, setPinVerified] = useState(() => isPinVerified(tournamentId));

  const tournament = useTournamentStore(s => s.getTournamentById(tournamentId));
  const startMatch = useTournamentStore(s => s.startMatch);
  const finishMatch = useTournamentStore(s => s.finishMatch);
  const addGoal = useTournamentStore(s => s.addGoal);
  const removeLastGoal = useTournamentStore(s => s.removeLastGoal);
  const removeGoal = useTournamentStore(s => s.removeGoal);
  const updateGoalPlayer = useTournamentStore(s => s.updateGoalPlayer);
  const reopenMatch = useTournamentStore(s => s.reopenMatch);
  const resetMatch = useTournamentStore(s => s.resetMatch);
  const pauseMatch = useTournamentStore(s => s.pauseMatch);
  const resumeMatch = useTournamentStore(s => s.resumeMatch);
  const addPlayer = useTournamentStore(s => s.addPlayer);
  const removePlayer = useTournamentStore(s => s.removePlayer);
  const updatePlayer = useTournamentStore(s => s.updatePlayer);
  const updateTeamName = useTournamentStore(s => s.updateTeamName);
  const [rosterTeamId, setRosterTeamId] = useState<string | null>(null);

  if (!tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 40 }}>😕</div>
        <p>Turnaj nenalezen</p>
        <button onClick={() => navigate({ name: 'tournament-list' })} style={{ color: 'var(--primary)', fontWeight: 700 }}>← Zpět</button>
      </div>
    );
  }

  const liveMatch = tournament.matches.find(m => m.status === 'live');


  const handleQuickGoal = (matchId: string, teamId: string, playerId: string | null) => {
    if (!pinVerified) return;
    const match = tournament.matches.find(m => m.id === matchId);
    if (!match) return;
    addGoal(tournamentId, matchId, {
      teamId,
      playerId,
      isOwnGoal: false,
      minute: computeCurrentMinute(match.startedAt, match.pausedAt, match.pausedElapsed),
    });
  };

  const handleStartMatchInline = (matchId: string) => {
    if (!pinVerified) return;
    startMatch(tournamentId, matchId);
  };

  const handleFinishMatchConfirm = (matchId: string) => {
    if (!pinVerified) return;
    if (confirm('Ukončit zápas?')) {
      finishMatch(tournamentId, matchId);
    }
  };

  const handlePauseMatch = (matchId: string) => {
    if (!pinVerified) return;
    pauseMatch(tournamentId, matchId);
  };

  const handleResumeMatch = (matchId: string) => {
    if (!pinVerified) return;
    resumeMatch(tournamentId, matchId);
  };

  const STATUS_LABELS: Record<string, string> = {
    draft: 'Příprava', active: 'Probíhá', finished: 'Ukončen',
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'standings', label: '🏅 Tabulka' },
    { id: 'matches', label: '⚽ Zápasy' },
    { id: 'settings', label: '⚙️ Nastavení' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
          <button onClick={() => navigate({ name: 'tournament-list' })} style={{
            width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
            fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🏆 {tournament.name}
            </h1>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {STATUS_LABELS[tournament.status]} · {tournament.teams.length} týmů
            </div>
          </div>
          {!pinVerified && (
            <button onClick={() => setShowPinGate(true)} style={{
              background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 12,
              fontWeight: 600, padding: '6px 10px', borderRadius: 8, flexShrink: 0,
            }}>🔐 PIN</button>
          )}
          {pinVerified && (
            <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 600, padding: '4px 8px', background: '#E8F5E9', borderRadius: 8, flexShrink: 0 }}>
              ✅ Admin
            </span>
          )}
        </div>

        {/* Live banner */}
        {liveMatch && (
          <div style={{
            background: '#C62828', color: '#fff', padding: '6px 16px',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />
            ŽIVĚ: {tournament.teams.find(t => t.id === liveMatch.homeTeamId)?.name} {liveMatch.homeScore}:{liveMatch.awayScore} {tournament.teams.find(t => t.id === liveMatch.awayTeamId)?.name}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', padding: '0 16px', gap: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '10px 6px', fontWeight: 600, fontSize: 13,
              color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              transition: 'all .15s',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'standings' && <StandingsTab tournament={tournament} onTeamClick={setRosterTeamId} />}
        {tab === 'matches' && (
          <MatchesTab
            tournament={tournament}
            isVerified={pinVerified}
            onQuickGoal={handleQuickGoal}
            onStartMatch={handleStartMatchInline}
            onFinishMatchConfirm={handleFinishMatchConfirm}
            onPauseMatch={handlePauseMatch}
            onResumeMatch={handleResumeMatch}
            onEditMatch={setSelectedMatch}
          />
        )}
        {tab === 'settings' && <SettingsTab tournament={tournament} navigate={navigate} />}
      </div>

      {/* PIN gate */}
      {showPinGate && (
        <PinGate
          tournament={tournament}
          onVerified={() => { setPinVerified(true); setShowPinGate(false); }}
        />
      )}

      {/* Score modal */}
      {selectedMatch && (
        <ScoreModal
          match={selectedMatch}
          tournament={tournament}
          onClose={() => setSelectedMatch(null)}
          onStart={() => {
            startMatch(tournamentId, selectedMatch.id);
            setSelectedMatch(prev => prev ? { ...prev, status: 'live', startedAt: new Date().toISOString() } : null);
          }}
          onFinish={() => {
            finishMatch(tournamentId, selectedMatch.id);
            setSelectedMatch(null);
          }}
          onAddGoal={goal => {
            addGoal(tournamentId, selectedMatch.id, goal);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onRemoveLastGoal={() => {
            removeLastGoal(tournamentId, selectedMatch.id);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onRemoveGoal={goalId => {
            removeGoal(tournamentId, selectedMatch.id, goalId);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onUpdateGoalPlayer={(goalId, playerId) => {
            updateGoalPlayer(tournamentId, selectedMatch.id, goalId, playerId);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onReopen={() => {
            reopenMatch(tournamentId, selectedMatch.id);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onReset={() => {
            resetMatch(tournamentId, selectedMatch.id);
          }}
        />
      )}

      {/* Roster modal */}
      {rosterTeamId && tournament && pinVerified && (
        <RosterModal
          tournament={tournament}
          teamId={rosterTeamId}
          onClose={() => setRosterTeamId(null)}
          onAddPlayer={(teamId, p) => addPlayer(tournamentId, teamId, p)}
          onRemovePlayer={(teamId, playerId) => removePlayer(tournamentId, teamId, playerId)}
          onUpdatePlayer={(teamId, playerId, updates) => updatePlayer(tournamentId, teamId, playerId, updates)}
          onUpdateTeamName={(teamId, name) => updateTeamName(tournamentId, teamId, name)}
        />
      )}
      {/* Roster modal pro hosta (jen čtení) */}
      {rosterTeamId && tournament && !pinVerified && (
        <RosterModal
          tournament={tournament}
          teamId={rosterTeamId}
          onClose={() => setRosterTeamId(null)}
          readOnly
        />
      )}
    </div>
  );
}
