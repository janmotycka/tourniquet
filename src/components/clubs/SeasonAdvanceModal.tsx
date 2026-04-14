/**
 * SeasonAdvanceModal — bottom sheet pro bulk posun všech hráčů o kategorii výš.
 *
 * Zobrazuje preview tabulku (současná kategorie → nová kategorie, počet hráčů),
 * warning o nevratnosti a confirm button. Po potvrzení zavolá
 * `advanceAllPlayersCategory` na clubs store.
 */

import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { useClubsStore } from '../../store/clubs.store';
import { useToastStore } from '../../store/toast.store';
import { getNextAgeCategory } from '../../store/clubs.store';
import type { Club, AgeCategory } from '../../types/club.types';
import { Button } from '../ui';
import { radius, spacing, fontSize, fontWeight, modal } from '../../theme/tokens';
import { logger } from '../../utils/logger';

interface Props {
  club: Club;
  onClose: () => void;
}

interface PreviewRow {
  current: AgeCategory;
  next: AgeCategory | null;  // null = zůstává
  count: number;
}

export function SeasonAdvanceModal({ club, onClose }: Props) {
  const { t } = useI18n();
  const showToast = useToastStore(s => s.show);
  const advanceAllPlayersCategory = useClubsStore(s => s.advanceAllPlayersCategory);

  const [busy, setBusy] = useState(false);

  // Agregace hráčů podle aktuální kategorie (jen aktivní).
  const { rows, movableCount } = useMemo(() => {
    const byCategory = new Map<AgeCategory, number>();
    for (const p of club.players ?? []) {
      if (!p.active) continue;
      byCategory.set(p.ageCategory, (byCategory.get(p.ageCategory) ?? 0) + 1);
    }
    // Stabilní řazení podle AGE_CATEGORIES (mládež od nejmladší po U19, pak dospělí).
    const order: AgeCategory[] = [
      'U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12',
      'U13', 'U14', 'U15', 'U17', 'U19',
      'Dorost', 'Muži', 'Muži B', 'Ženy',
    ];
    const rows: PreviewRow[] = order
      .filter(cat => byCategory.has(cat))
      .map(cat => {
        const next = getNextAgeCategory(cat);
        return { current: cat, next, count: byCategory.get(cat) ?? 0 };
      });

    // Počet hráčů, kteří se reálně posunou (kategorie má `next != null`).
    const movableCount = rows
      .filter(r => r.next !== null)
      .reduce((sum, r) => sum + r.count, 0);

    return { rows, movableCount };
  }, [club.players]);

  const handleConfirm = async () => {
    if (busy || movableCount === 0) return;
    setBusy(true);
    try {
      const { movedCount } = await advanceAllPlayersCategory(club.id);
      showToast(
        'success',
        t('clubs.seasonAdvance.success', { count: String(movedCount) }),
      );
      onClose();
    } catch (err) {
      logger.warn('[SeasonAdvance] failed:', err);
      showToast('error', (err as Error).message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: modal.borderRadius,
          width: '100%',
          maxWidth: modal.maxWidth,
          padding: `0 0 ${spacing.xl}px`,
          maxHeight: modal.maxHeight,
          overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div style={{
          display: 'flex', justifyContent: 'center', padding: '10px 0 2px',
        }}>
          <div style={{
            width: 40, height: 4, borderRadius: 2, background: 'var(--border)',
          }} />
        </div>

        <div style={{
          padding: `${spacing.sm}px ${spacing.lg}px 0`,
          display: 'flex', flexDirection: 'column', gap: spacing.md,
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h3 style={{
              fontWeight: fontWeight.extrabold,
              fontSize: fontSize.md,
              margin: 0,
              color: 'var(--text)',
            }}>
              {t('clubs.seasonAdvance.title')}
            </h3>
            <button
              onClick={onClose}
              aria-label={t('common.cancel')}
              style={{
                background: 'var(--surface-var)', width: 30, height: 30, borderRadius: 15,
                fontSize: fontSize.base, color: 'var(--text-muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          {rows.length === 0 ? (
            <div style={{
              padding: `${spacing.lg}px`,
              borderRadius: radius.md,
              background: 'var(--surface-var)',
              fontSize: fontSize.sm,
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              {t('clubs.seasonAdvance.noActivePlayers')}
            </div>
          ) : (
            <>
              {/* Preview */}
              <div>
                <div style={{
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.bold,
                  color: 'var(--text-muted)',
                  marginBottom: spacing.xs,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}>
                  {t('clubs.seasonAdvance.preview')}
                </div>
                <div style={{
                  background: 'var(--surface-var)',
                  borderRadius: radius.md,
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  display: 'flex', flexDirection: 'column',
                }}>
                  {rows.map(row => (
                    <div
                      key={row.current}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `${spacing.sm}px 0`,
                        borderBottom: '1px solid var(--border)',
                        fontSize: fontSize.base,
                      }}
                    >
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: spacing.xs,
                      }}>
                        <span style={{
                          fontWeight: fontWeight.extrabold, color: 'var(--text)',
                          minWidth: 36,
                        }}>
                          {row.current}
                        </span>
                        <span style={{
                          fontSize: fontSize.sm,
                          color: 'var(--text-muted)',
                          fontWeight: fontWeight.medium,
                        }}>
                          ({row.count})
                        </span>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: spacing.xs,
                      }}>
                        <span style={{
                          color: 'var(--text-muted)', fontSize: fontSize.base,
                        }}>→</span>
                        {row.next ? (
                          <span style={{
                            fontWeight: fontWeight.extrabold,
                            color: 'var(--primary)',
                          }}>
                            {row.next}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: fontSize.sm,
                            color: 'var(--text-muted)',
                            fontStyle: 'italic',
                          }}>
                            {t('clubs.seasonAdvance.staysLabel')} {row.current}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warning */}
              <div style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                borderRadius: radius.md,
                background: 'var(--warning-light, rgba(255, 152, 0, 0.12))',
                border: '1px solid var(--warning, #FB8C00)',
                fontSize: fontSize.xs,
                color: 'var(--text)',
                lineHeight: 1.5,
              }}>
                ⚠️ {t('clubs.seasonAdvance.warning')}
              </div>
            </>
          )}

          {/* Actions */}
          <div style={{
            display: 'flex', gap: spacing.sm, marginTop: spacing.xs,
          }}>
            <Button
              variant="secondary"
              fullWidth
              onClick={onClose}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleConfirm}
              disabled={busy || movableCount === 0}
            >
              {busy
                ? '…'
                : t('clubs.seasonAdvance.confirm', { count: String(movableCount) })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
