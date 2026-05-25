/**
 * ClubImportModal — bottom-sheet modal pro import hráčů z klubového rosteru.
 *
 * Audit 2026-05-25: extrahováno z QuickMatchSheet pro reuse v LineupTab
 * (PlayerEditor pro existující match). Trenér tak může doplnit klubové hráče
 * i pro match co byl vytvořen bez sestavy.
 *
 * UX:
 * - Bottom sheet (85dvh)
 * - Filter chips per ageCategory (pokud klub má víc kategorií)
 * - Multi-select checkboxy + "Vybrat vše"
 * - Hráče už v lineup zobrazí jako "✓ Již přidán" (disabled)
 * - Confirm button s počtem vybraných
 */
import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import type { ClubPlayer } from '../../types/club.types';

interface Props {
  club: { id: string; name: string; players: ClubPlayer[] };
  /** Jména hráčů, kteří už v lineup jsou (case-insensitive deduplication). */
  existingNames: string[];
  onClose: () => void;
  onConfirm: (picked: ClubPlayer[]) => void;
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 11px', borderRadius: 8,
    background: active ? 'var(--primary)' : 'var(--surface-var)',
    color: active ? '#fff' : 'var(--text-muted)',
    border: '1px solid var(--border)',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  };
}

export function ClubImportModal({ club, existingNames, onClose, onConfirm }: Props) {
  const { t } = useI18n();
  const activePlayers = useMemo(
    () => (club.players ?? []).filter(p => p.active !== false),
    [club.players],
  );
  const existingSet = useMemo(
    () => new Set(existingNames.map(n => n.toLowerCase())),
    [existingNames],
  );

  const categoriesInUse = useMemo(() => {
    const s = new Set<string>();
    for (const p of activePlayers) if (p.ageCategory) s.add(p.ageCategory);
    return [...s].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });
  }, [activePlayers]);

  const [category, setCategory] = useState<string>(
    categoriesInUse.length === 1 ? categoriesInUse[0] : 'all',
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const visiblePlayers = useMemo(() => {
    const filtered = category === 'all'
      ? activePlayers
      : activePlayers.filter(p => p.ageCategory === category);
    return [...filtered].sort((a, b) => {
      const ja = a.jerseyNumber || 999;
      const jb = b.jerseyNumber || 999;
      if (ja !== jb) return ja - jb;
      return a.name.localeCompare(b.name);
    });
  }, [activePlayers, category]);

  const toggleOne = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const visibleSelectable = visiblePlayers.filter(
    p => !existingSet.has(p.name.trim().toLowerCase()),
  );
  const allVisibleSelected = visibleSelectable.length > 0
    && visibleSelectable.every(p => selected[p.id]);

  const toggleAll = () => {
    setSelected(prev => {
      const next = { ...prev };
      const setTo = !allVisibleSelected;
      for (const p of visibleSelectable) next[p.id] = setTo;
      return next;
    });
  };

  const pickedCount = Object.values(selected).filter(Boolean).length;

  const handleConfirm = () => {
    const picked = activePlayers.filter(p => selected[p.id]);
    onConfirm(picked);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480,
          height: '85dvh', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{
          padding: '4px 14px 8px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>
              📥 {t('match.quickSheet.importFromClub')}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {club.name}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {categoriesInUse.length > 1 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            padding: '0 14px 8px',
          }}>
            <button
              type="button"
              onClick={() => setCategory('all')}
              style={chipStyle(category === 'all')}
            >
              {t('match.quickSheet.categoryAll')}
            </button>
            {categoriesInUse.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                style={chipStyle(category === cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
          {visibleSelectable.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              style={{
                width: '100%', padding: '8px', borderRadius: 8,
                background: 'transparent', color: 'var(--primary)',
                border: '1px dashed var(--primary)', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, marginBottom: 8,
              }}
            >
              {allVisibleSelected
                ? t('match.quickSheet.deselectAll')
                : t('match.quickSheet.selectAll')}
            </button>
          )}
          {visiblePlayers.length === 0 ? (
            <div style={{
              padding: '24px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: 13,
            }}>
              {t('match.quickSheet.noClubPlayersInCategory')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {visiblePlayers.map(p => {
                const alreadyAdded = existingSet.has(p.name.trim().toLowerCase());
                const isSelected = !!selected[p.id];
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8,
                      background: alreadyAdded
                        ? 'transparent'
                        : isSelected ? 'var(--primary-light)' : 'var(--surface-var)',
                      border: alreadyAdded
                        ? '1px dashed var(--border)'
                        : isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                      cursor: alreadyAdded ? 'default' : 'pointer',
                      opacity: alreadyAdded ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={alreadyAdded}
                      onChange={() => toggleOne(p.id)}
                      style={{ width: 18, height: 18, cursor: alreadyAdded ? 'default' : 'pointer' }}
                    />
                    <span style={{
                      width: 36, fontSize: 12, fontWeight: 800,
                      textAlign: 'center', color: 'var(--text-muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {p.jerseyNumber > 0 ? `#${p.jerseyNumber}` : '—'}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 14, fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.name}
                      {alreadyAdded && (
                        <span style={{
                          marginLeft: 6, fontSize: 11, fontWeight: 700,
                          color: 'var(--text-muted)',
                        }}>
                          ✓ {t('match.quickSheet.alreadyAdded')}
                        </span>
                      )}
                    </span>
                    {p.birthYear && (
                      <span style={{
                        fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {p.birthYear}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: '8px 14px 14px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleConfirm}
            disabled={pickedCount === 0}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: pickedCount > 0 ? 'var(--primary)' : 'var(--border)',
              color: pickedCount > 0 ? '#fff' : 'var(--text-muted)',
              fontWeight: 800, fontSize: 14,
              cursor: pickedCount > 0 ? 'pointer' : 'default',
            }}
          >
            {pickedCount > 0
              ? t('match.quickSheet.importNPlayers', { n: pickedCount })
              : t('match.quickSheet.selectAtLeastOne')}
          </button>
        </div>
      </div>
    </div>
  );
}
