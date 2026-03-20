import { useState } from 'react';
import type { Tournament, Player } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { useConfirmStore } from '../../store/confirm.store';
import { colorSwatch, textOnColor } from '../../utils/team-colors';
import { TeamBadge } from './TeamBadge';

export function RosterModal({ tournament, teamId, onClose, readOnly = false, onAddPlayer, onRemovePlayer, onUpdatePlayer, onUpdateTeamName }: {
  tournament: Tournament;
  teamId: string;
  onClose: () => void;
  readOnly?: boolean;
  onAddPlayer?: (teamId: string, p: { name: string; jerseyNumber: number; birthYear: number | null }) => void;
  onRemovePlayer?: (teamId: string, playerId: string) => void;
  onUpdatePlayer?: (teamId: string, playerId: string, updates: { name?: string; jerseyNumber?: number; birthYear?: number | null }) => void;
  onUpdateTeamName?: (teamId: string, name: string) => void;
}) {
  const { t } = useI18n();
  const ask = useConfirmStore(s => s.ask);
  const team = tournament.teams.find(tm => tm.id === teamId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [newJersey, setNewJersey] = useState('');
  const [newBirth, setNewBirth] = useState('');
  const [addError, setAddError] = useState('');
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

  const isDuplicateJersey = (jersey: number, excludePlayerId?: string) =>
    team.players.some(p => p.jerseyNumber === jersey && p.id !== excludePlayerId);

  const startEdit = (p: Player) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditJersey(String(p.jerseyNumber));
    setEditBirth(p.birthYear != null ? String(p.birthYear) : '');
    setEditError('');
  };

  const currentYear = new Date().getFullYear();
  const BIRTH_MIN = 1950;
  const BIRTH_MAX = currentYear - 3;

  const parseBirth = (val: string): number | null => {
    if (!val.trim()) return null;
    const n = parseInt(val);
    return isNaN(n) ? null : n;
  };

  const isBirthValid = (birth: number | null): boolean => {
    if (birth === null) return true;
    return birth >= BIRTH_MIN && birth <= BIRTH_MAX;
  };

  const saveEdit = (playerId: string) => {
    if (!editName.trim()) return;
    const jersey = parseInt(editJersey);
    if (isNaN(jersey) || jersey < 1 || jersey > 99) return;
    if (isDuplicateJersey(jersey, playerId)) {
      setEditError(t('tournament.detail.duplicateJersey', { jersey }));
      return;
    }
    const birth = parseBirth(editBirth);
    if (!isBirthValid(birth)) {
      setEditError(t('tournament.detail.invalidBirthYear', { min: BIRTH_MIN, max: BIRTH_MAX }));
      return;
    }
    onUpdatePlayer?.(teamId, playerId, {
      name: editName.trim(),
      jerseyNumber: jersey,
      birthYear: birth,
    });
    setEditingId(null);
    setEditError('');
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    const jersey = parseInt(newJersey);
    if (isNaN(jersey) || jersey < 1 || jersey > 99) return;
    if (isDuplicateJersey(jersey)) {
      setAddError(t('tournament.detail.duplicateJersey', { jersey }));
      return;
    }
    const birth = parseBirth(newBirth);
    if (!isBirthValid(birth)) {
      setAddError(t('tournament.detail.invalidBirthYear', { min: BIRTH_MIN, max: BIRTH_MAX }));
      return;
    }
    onAddPlayer?.(teamId, {
      name: newName.trim(),
      jerseyNumber: jersey,
      birthYear: birth,
    });
    setNewName(''); setNewJersey(''); setNewBirth(''); setAddError('');
  };

  const inp: React.CSSProperties = {
    padding: '6px 8px', borderRadius: 7, border: '1.5px solid var(--border)',
    fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' as const,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        padding: '0 0 20px', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 10px' }}>
          <TeamBadge team={team} size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {!readOnly && editingTeamName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  autoFocus
                  value={teamNameDraft}
                  onChange={e => setTeamNameDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveTeamName();
                    if (e.key === 'Escape') setEditingTeamName(false);
                  }}
                  style={{
                    flex: 1, minWidth: 0, padding: '4px 8px', borderRadius: 7,
                    border: '1.5px solid var(--primary)', fontSize: 15, fontWeight: 800,
                    background: 'var(--bg)', color: 'var(--text)',
                  }}
                />
                <button onClick={saveTeamName} style={{ padding: '4px 8px', borderRadius: 7, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>✓</button>
                <button onClick={() => setEditingTeamName(false)} style={{ padding: '4px 8px', borderRadius: 7, background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>✕</button>
              </div>
            ) : (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: readOnly ? 'default' : 'pointer' }}
                onClick={() => {
                  if (!readOnly) {
                    setTeamNameDraft(team.name);
                    setEditingTeamName(true);
                  }
                }}
              >
                <h2 style={{ fontWeight: 800, fontSize: 16, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</h2>
                {!readOnly && <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>✏️</span>}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('tournament.detail.roster', { count: players.length })}{readOnly ? t('tournament.detail.rosterReadOnly') : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 14, flexShrink: 0, border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Player rows — compact */}
        <div style={{ flex: 1 }}>
          {players.map(p => (
            <div key={p.id}>
              {editingId === p.id ? (
                <div style={{ padding: '6px 14px', background: '#FFF8F0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    <input
                      type="number" min={1} max={99} value={editJersey}
                      onChange={e => { setEditJersey(e.target.value); setEditError(''); }}
                      placeholder="#"
                      style={{ ...inp, width: 44, textAlign: 'center' }}
                    />
                    <input
                      value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(p.id)}
                      placeholder={t('tournament.create.playerName')}
                      style={{ ...inp, flex: 1, minWidth: 0 }}
                    />
                    <input
                      type="number" min={1990} max={2020} value={editBirth}
                      onChange={e => setEditBirth(e.target.value)}
                      placeholder={t('tournament.create.birthYear')}
                      style={{ ...inp, width: 58, textAlign: 'center' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => saveEdit(p.id)} style={{ flex: 1, padding: '6px', borderRadius: 7, background: '#E65100', color: '#fff', fontWeight: 700, fontSize: 12, border: 'none' }}>
                      ✓ {t('common.save')}
                    </button>
                    <button onClick={async () => { const ok = await ask({ title: t('common.delete'), message: t('tournament.detail.deletePlayer', { name: p.name }), destructive: true }); if (ok) { onRemovePlayer?.(teamId, p.id); setEditingId(null); } }} style={{ padding: '6px 10px', borderRadius: 7, background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 12, border: 'none' }}>
                      🗑
                    </button>
                    <button onClick={() => { setEditingId(null); setEditError(''); }} style={{ padding: '6px 10px', borderRadius: 7, background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 12, border: 'none' }}>
                      ✕
                    </button>
                  </div>
                  {editError && (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#C62828', fontWeight: 600 }}>
                      ⚠️ {editError}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => !readOnly && startEdit(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px',
                    borderBottom: '1px solid var(--border)',
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  <div style={{
                    ...colorSwatch(team.color, 24), borderRadius: 6,
                    color: textOnColor(team.color),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 11, flexShrink: 0,
                  }}>{p.jerseyNumber}</div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {p.birthYear ?? '—'}
                  </span>
                  {!readOnly && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>✏️</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {players.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {t('tournament.detail.rosterEmpty')}
            </div>
          )}
        </div>

        {/* Add player */}
        {!readOnly && (
          <div style={{ padding: '8px 14px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
              ➕ {t('common.add')}
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <input
                type="number" min={1} max={99} value={newJersey}
                onChange={e => { setNewJersey(e.target.value); setAddError(''); }}
                placeholder="#"
                style={{ ...inp, width: 44, textAlign: 'center', borderColor: addError ? '#C62828' : 'var(--border)' }}
              />
              <input
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder={t('tournament.create.playerName')}
                style={{ ...inp, flex: 1, minWidth: 0 }}
              />
              <input
                type="number" min={1990} max={2020} value={newBirth}
                onChange={e => setNewBirth(e.target.value)}
                placeholder={t('tournament.create.birthYear')}
                style={{ ...inp, width: 58, textAlign: 'center' }}
              />
            </div>
            {addError && (
              <div style={{ marginBottom: 4, fontSize: 11, color: '#C62828', fontWeight: 600 }}>
                ⚠️ {addError}
              </div>
            )}
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newJersey}
              style={{
                width: '100%', padding: '8px', borderRadius: 8,
                background: (!newName.trim() || !newJersey) ? 'var(--border)' : 'var(--primary)',
                color: (!newName.trim() || !newJersey) ? 'var(--text-muted)' : '#fff',
                fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
              }}
            >{t('common.add')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
