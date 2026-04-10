/**
 * PlayerRosterEditor — mobilní editor hráčů pro klubový roster.
 * Vertikální karty, kliknutím na hráče otevře detail se statistikami.
 */

import { useState } from 'react';
import type { ClubPlayer, AgeCategory } from '../types/club.types';
import type { PlayerStats } from '../utils/player-stats';
import { useI18n } from '../i18n';
import { spacing, radius, fontSize, fontWeight } from '../theme/tokens';

interface Props {
  players: ClubPlayer[];
  ageCategory: AgeCategory;
  clubColor?: string;
  onAdd: (player: Omit<ClubPlayer, 'id'>) => void;
  onRemove: (playerId: string) => void;
  onUpdate: (playerId: string, patch: Partial<ClubPlayer>) => void;
  onPlayerTap?: (player: ClubPlayer) => void;
  getPlayerStats?: (player: ClubPlayer) => PlayerStats | null;
}

/** Lighten a hex color for use as background tint */
function hexToTint(hex: string, opacity = 0.12): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export function PlayerRosterEditor({
  players,
  ageCategory,
  clubColor,
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
  const jerseyBg = clubColor || 'var(--primary)';

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
    padding: `${spacing.sm}px 10px`,
    borderRadius: radius.sm,
    fontSize: fontSize.base,
    border: '1.5px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    boxSizing: 'border-box',
  };

  /** Tiny pill for stat values */
  const StatBadge = ({ icon, value }: { icon: string; value: string | number }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: fontSize.xs, color: 'var(--text-muted)',
      background: 'var(--surface-var)', borderRadius: radius.sm,
      padding: '1px 6px', lineHeight: 1.4,
    }}>
      {icon} {value}
    </span>
  );

  return (
    <div>
      {/* Seznam hráčů */}
      {activePlayers.length === 0 ? (
        <div style={{
          padding: `${spacing.xl}px 0`, textAlign: 'center',
          color: 'var(--text-muted)', fontSize: fontSize.sm,
        }}>
          {t('clubs.noPlayersInCategory')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {activePlayers.map((player) => {
            const stats = getPlayerStats?.(player);
            const isEditing = editingId === player.id;

            if (isEditing) {
              return (
                <div
                  key={player.id}
                  style={{
                    background: 'var(--primary-light)', borderRadius: radius.lg,
                    padding: `10px ${spacing.md}px`,
                    display: 'flex', flexDirection: 'column', gap: spacing.sm,
                  }}
                >
                  <div style={{ display: 'flex', gap: spacing.xs + 2, alignItems: 'center' }}>
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
                  <div style={{ display: 'flex', gap: spacing.xs + 2, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => onRemove(player.id)}
                      style={{
                        padding: '6px 14px', borderRadius: radius.sm,
                        background: 'var(--danger-light)', color: 'var(--danger)',
                        fontSize: fontSize.sm, fontWeight: fontWeight.medium,
                      }}
                    >
                      {t('common.delete')}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: '6px 14px', borderRadius: radius.sm,
                        background: 'var(--primary)', color: '#fff',
                        fontSize: fontSize.sm, fontWeight: fontWeight.medium,
                      }}
                    >
                      {t('common.done')}
                    </button>
                  </div>
                </div>
              );
            }

            const hasStats = stats && (stats.totalGoals > 0 || stats.totalMatches > 0 || stats.seasonAssists > 0);

            return (
              <div
                key={player.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: spacing.md,
                  padding: `10px ${spacing.md}px`, borderRadius: radius.lg,
                  background: 'var(--surface)',
                  cursor: onPlayerTap ? 'pointer' : 'default',
                  border: '1px solid var(--border)',
                  transition: 'background .12s',
                }}
                onClick={() => onPlayerTap?.(player)}
              >
                {/* Jersey number badge with club color */}
                <div style={{
                  width: 36, height: 36, borderRadius: radius.md, flexShrink: 0,
                  background: jerseyBg, color: '#fff',
                  fontWeight: fontWeight.extrabold, fontSize: fontSize.base,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: clubColor ? `0 2px 6px ${hexToTint(clubColor, 0.3)}` : undefined,
                }}>
                  {player.jerseyNumber || '\u2013'}
                </div>

                {/* Name + position/stats */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: fontWeight.medium, fontSize: fontSize.base,
                    color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {player.name}
                  </div>

                  {/* Second row: position badge + birth year + stat badges */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: spacing.xs + 2,
                    marginTop: 3, flexWrap: 'wrap',
                  }}>
                    {player.position && (
                      <span style={{
                        fontSize: fontSize.xs, fontWeight: fontWeight.medium,
                        color: clubColor || 'var(--primary)',
                        background: clubColor ? hexToTint(clubColor, 0.1) : 'var(--primary-light)',
                        borderRadius: radius.sm, padding: '1px 6px', lineHeight: 1.4,
                      }}>
                        {player.position}
                      </span>
                    )}
                    {player.birthYear && (
                      <span style={{ fontSize: fontSize.xs, color: 'var(--text-muted)' }}>
                        {player.birthYear}
                      </span>
                    )}
                    {hasStats && (
                      <>
                        {stats.totalGoals > 0 && <StatBadge icon="\u26BD" value={stats.totalGoals} />}
                        {stats.seasonAssists > 0 && <StatBadge icon="\uD83D\uDC5F" value={stats.seasonAssists} />}
                        {stats.totalMatches > 0 && <StatBadge icon="\uD83D\uDCCB" value={stats.totalMatches} />}
                      </>
                    )}
                    {stats && stats.seasonAvgRating !== null && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        fontSize: fontSize.xs, color: 'var(--warning, #F9A825)',
                        background: 'var(--surface-var)', borderRadius: radius.sm,
                        padding: '1px 6px', lineHeight: 1.4,
                      }}>
                        \u2B50 {stats.seasonAvgRating}
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(player.id);
                  }}
                  style={{
                    width: 32, height: 32, borderRadius: radius.sm,
                    background: 'var(--surface-var)', color: 'var(--text-muted)',
                    fontSize: fontSize.sm, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', cursor: 'pointer',
                  }}
                  aria-label={t('common.edit')}
                >
                  \u270F\uFE0F
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add player form */}
      <div style={{
        display: 'flex', gap: spacing.xs + 2, marginTop: spacing.md,
        alignItems: 'center',
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: 'var(--surface-var)', borderRadius: radius.lg,
      }}>
        <input
          value={addJersey}
          onChange={e => setAddJersey(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onKeyDown={handleKeyDown}
          placeholder="#"
          style={{ ...inputStyle, width: 42, textAlign: 'center', flexShrink: 0, background: 'var(--surface)' }}
        />
        <input
          value={addName}
          onChange={e => setAddName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('clubs.playerNamePlaceholder')}
          style={{ ...inputStyle, flex: 1, minWidth: 0, background: 'var(--surface)' }}
        />
        <input
          value={addBirthYear}
          onChange={e => setAddBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={handleKeyDown}
          placeholder={String(currentYear - 12)}
          style={{ ...inputStyle, width: 56, textAlign: 'center', flexShrink: 0, background: 'var(--surface)' }}
        />
        <button
          onClick={handleAdd}
          disabled={!addName.trim()}
          style={{
            width: 36, height: 36, borderRadius: radius.md, flexShrink: 0,
            background: addName.trim() ? jerseyBg : 'var(--border)',
            color: addName.trim() ? '#fff' : 'var(--text-muted)',
            fontWeight: fontWeight.bold, fontSize: fontSize.lg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: addName.trim() ? 'pointer' : 'default',
          }}
        >+</button>
      </div>

      {/* Player count */}
      <div style={{
        fontSize: fontSize.xs, color: 'var(--text-muted)',
        marginTop: spacing.xs, textAlign: 'right',
        paddingRight: spacing.xs,
      }}>
        {t('clubs.playersCount', { count: activePlayers.length })}
      </div>
    </div>
  );
}
