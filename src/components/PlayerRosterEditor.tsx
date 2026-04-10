/**
 * PlayerRosterEditor — mobilní editor hráčů pro klubový roster.
 * Vertikální karty, kliknutím na hráče otevře detail se statistikami.
 */

import { useState } from 'react';
import type { ClubPlayer, AgeCategory } from '../types/club.types';
import type { PlayerStats } from '../utils/player-stats';
import { useI18n } from '../i18n';

interface Props {
  players: ClubPlayer[];
  ageCategory: AgeCategory;
  onAdd: (player: Omit<ClubPlayer, 'id'>) => void;
  onRemove: (playerId: string) => void;
  onUpdate: (playerId: string, patch: Partial<ClubPlayer>) => void;
  onPlayerTap?: (player: ClubPlayer) => void;
  getPlayerStats?: (player: ClubPlayer) => PlayerStats | null;
}

export function PlayerRosterEditor({
  players,
  ageCategory,
  onAdd,
  onRemove,
  onUpdate,
  onPlayerTap,
  getPlayerStats,
}: Props) {
  const { t } = useI18n();
  const [addName, setAddName] = useState('');
  const [addJersey, setAddJersey] = useState('');
  const [addBirthYear, setAddBirthYear] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const activePlayers = players.filter(p => p.active);
  const currentYear = new Date().getFullYear();

  const handleAdd = () => {
    if (!addName.trim()) return;
    const jersey = parseInt(addJersey) || 0;
    const birthYear = parseInt(addBirthYear) || null;
    onAdd({
      name: addName.trim(),
      jerseyNumber: jersey,
      birthYear,
      ageCategory,
      active: true,
    });
    setAddName('');
    setAddJersey('');
    setAddBirthYear('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px', borderRadius: 8, fontSize: 14,
    border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
    boxSizing: 'border-box',
  };

  return (
    <div>
      {/* Seznam hráčů — vertikální karty */}
      {activePlayers.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {t('clubs.noPlayersInCategory')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activePlayers.map((player) => {
            const stats = getPlayerStats?.(player);
            const isEditing = editingId === player.id;

            if (isEditing) {
              return (
                <div
                  key={player.id}
                  style={{
                    background: 'var(--primary-light)', borderRadius: 12,
                    padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      value={player.jerseyNumber || ''}
                      onChange={e => onUpdate(player.id, { jerseyNumber: parseInt(e.target.value) || 0 })}
                      style={{ ...inputStyle, width: 48, textAlign: 'center' }}
                      placeholder="#"
                    />
                    <input
                      value={player.name}
                      onChange={e => onUpdate(player.id, { name: e.target.value })}
                      style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    />
                    <input
                      value={player.birthYear ?? ''}
                      onChange={e => onUpdate(player.id, { birthYear: parseInt(e.target.value) || null })}
                      style={{ ...inputStyle, width: 64, textAlign: 'center' }}
                      placeholder={t('clubs.yearShort')}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => onRemove(player.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 8, background: 'var(--danger-light)',
                        color: 'var(--danger)', fontSize: 12, fontWeight: 600,
                      }}
                    >🗑 {t('common.delete')}</button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: '6px 14px', borderRadius: 8, background: 'var(--primary)',
                        color: '#fff', fontSize: 12, fontWeight: 600,
                      }}
                    >✓ {t('common.done')}</button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={player.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 12,
                  background: 'var(--surface)', cursor: onPlayerTap ? 'pointer' : 'default',
                  border: '1px solid var(--border)',
                  transition: 'background .12s',
                }}
                onClick={() => onPlayerTap?.(player)}
              >
                {/* Číslo dresu */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'var(--primary)', color: '#fff',
                  fontWeight: 800, fontSize: 14, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {player.jerseyNumber || '–'}
                </div>

                {/* Jméno + mini stats */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 600, fontSize: 14, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {player.name}
                  </div>
                  {/* Druhý řádek: rok narození + mini stats */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    {player.birthYear && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {player.birthYear}
                      </span>
                    )}
                    {stats && stats.totalGoals > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        ⚽ {stats.totalGoals}
                      </span>
                    )}
                    {stats && stats.seasonAssists > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        👟 {stats.seasonAssists}
                      </span>
                    )}
                    {stats && stats.totalMatches > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        📋 {stats.totalMatches}
                      </span>
                    )}
                    {stats && stats.seasonAvgRating !== null && (
                      <span style={{ fontSize: 11, color: '#F9A825' }}>
                        ⭐ {stats.seasonAvgRating}
                      </span>
                    )}
                  </div>
                </div>

                {/* Editační tlačítko */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(player.id);
                  }}
                  style={{
                    width: 32, height: 32, borderRadius: 8, background: 'var(--surface-var)',
                    color: 'var(--text-muted)', fontSize: 13, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >✏️</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline přidání hráče */}
      <div style={{
        display: 'flex', gap: 6, marginTop: 10, alignItems: 'center',
        padding: '8px 0',
      }}>
        <input
          value={addJersey}
          onChange={e => setAddJersey(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onKeyDown={handleKeyDown}
          placeholder="#"
          style={{ ...inputStyle, width: 42, textAlign: 'center', flexShrink: 0 }}
        />
        <input
          value={addName}
          onChange={e => setAddName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('clubs.playerNamePlaceholder')}
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
        <input
          value={addBirthYear}
          onChange={e => setAddBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={handleKeyDown}
          placeholder={String(currentYear - 12)}
          style={{ ...inputStyle, width: 56, textAlign: 'center', flexShrink: 0 }}
        />
        <button
          onClick={handleAdd}
          disabled={!addName.trim()}
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: addName.trim() ? 'var(--primary)' : 'var(--border)',
            color: addName.trim() ? '#fff' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >+</button>
      </div>

      {/* Počet hráčů */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
        {t('clubs.playersCount', { count: activePlayers.length })}
      </div>
    </div>
  );
}
