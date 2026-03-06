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

  const currentYear = new Date().getFullYear();
  const BIRTH_MIN = 1950;
  const BIRTH_MAX = currentYear - 3; // hráč musí mít alespoň 3 roky

  const parseBirth = (val: string): number | null => {
    if (!val.trim()) return null;
    const n = parseInt(val);
    return isNaN(n) ? null : n;
  };

  const isBirthValid = (birth: number | null): boolean => {
    if (birth === null) return true; // rok není povinný
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
              {t('tournament.detail.roster', { count: players.length })}{readOnly ? t('tournament.detail.rosterReadOnly') : ''}
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
          <span>{t('tournament.create.playerName')}</span>
          <span style={{ textAlign: 'center' }}>{t('tournament.create.birthYear')}</span>
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
                      placeholder={t('tournament.create.playerName')}
                      style={{ padding: '7px', borderRadius: 8, border: '1.5px solid #FFB74D', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }}
                    />
                    <input
                      type="number" min={1990} max={2020} value={editBirth}
                      onChange={e => setEditBirth(e.target.value)}
                      placeholder={t('tournament.create.birthYear')}
                      style={{ padding: '7px', borderRadius: 8, border: '1.5px solid #FFB74D', fontSize: 14, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => saveEdit(p.id)} style={{ flex: 1, padding: '7px', borderRadius: 8, background: '#E65100', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                      ✓ {t('common.save')}
                    </button>
                    <button onClick={async () => { const ok = await ask({ title: t('common.delete'), message: t('tournament.detail.deletePlayer', { name: p.name }), destructive: true }); if (ok) { onRemovePlayer?.(teamId, p.id); setEditingId(null); } }} style={{ padding: '7px 12px', borderRadius: 8, background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 13 }}>
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
                    ...colorSwatch(team.color, 28), borderRadius: 7,
                    color: textOnColor(team.color),
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
              {t('tournament.detail.rosterEmpty')}
            </div>
          )}
        </div>

        {/* Přidat hráče (jen admin) */}
        {!readOnly && (
          <div style={{ padding: '12px 20px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              ➕ {t('common.add')}
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
                placeholder={t('tournament.create.playerName')}
                style={{ padding: '8px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }}
              />
              <input
                type="number" min={1990} max={2020} value={newBirth}
                onChange={e => setNewBirth(e.target.value)}
                placeholder={t('tournament.create.birthYear')}
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
            >{t('common.add')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
