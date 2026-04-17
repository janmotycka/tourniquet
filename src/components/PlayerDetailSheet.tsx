/**
 * PlayerDetailSheet — bottom-sheet s kartou hráče a statistikami.
 */

import { useState } from 'react';
import type { ClubPlayer, Club, AgeCategory } from '../types/club.types';
import { AGE_CATEGORIES_BY_SPORT } from '../types/club.types';
import type { PlayerStats } from '../utils/player-stats';
import { useI18n } from '../i18n';

interface Props {
  player: ClubPlayer;
  club: Club;
  stats: PlayerStats;
  onClose: () => void;
  onEdit: () => void;
  onMoveCategory?: (newCategory: AgeCategory) => void;
}

function StatBox({ value, label, icon, color }: {
  value: string | number; label: string; icon: string; color?: string;
}) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 0, textAlign: 'center',
      padding: '12px 4px', borderRadius: 12,
      background: 'var(--bg)',
    }}>
      <div style={{ fontSize: 13, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

export function PlayerDetailSheet({ player, club, stats, onClose, onEdit, onMoveCategory }: Props) {
  const { t } = useI18n();
  const [moveOpen, setMoveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleMove = (cat: AgeCategory) => {
    if (cat === player.ageCategory) { setMoveOpen(false); return; }
    const msg = t('clubs.moveCategoryConfirm', { name: player.name, from: player.ageCategory, to: cat });
    if (window.confirm(msg)) {
      onMoveCategory?.(cat);
      setMoveOpen(false);
    }
  };

  const history = player.categoryHistory ?? [];

  const age = player.birthYear
    ? new Date().getFullYear() - player.birthYear
    : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'fadeIn .2s ease',
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, padding: '0 0 36px',
          maxHeight: '85dvh', overflowY: 'auto',
          animation: 'slideUp .25s ease',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        <div style={{ padding: '4px 20px 0' }}>
          {/* ── Hlavička hráče ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            marginBottom: 20,
          }}>
            {/* Velký dres číslo */}
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: club.color, color: '#fff',
              fontWeight: 900, fontSize: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,.15)',
            }}>
              {player.jerseyNumber || '–'}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 800, fontSize: 20, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {player.name}
              </div>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                  background: 'var(--primary-light)', color: 'var(--primary)',
                }}>
                  {player.ageCategory}
                </span>
                {player.birthYear && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                    background: 'var(--surface-var)', color: 'var(--text-muted)',
                  }}>
                    {t('playerDetail.born')} {player.birthYear}{age !== null ? ` (${age})` : ''}
                  </span>
                )}
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                  background: 'var(--surface-var)', color: 'var(--text-muted)',
                }}>
                  {club.name}
                </span>
              </div>
            </div>

            {/* Edit & Close */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button
                onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: 8, background: 'var(--surface-var)',
                  color: 'var(--text-muted)', fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
              <button
                onClick={onEdit}
                style={{
                  width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)',
                  color: 'var(--primary)', fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✏️</button>
            </div>
          </div>

          {/* ── Přesun do kategorie + historie ── */}
          {onMoveCategory && (
            <div style={{
              background: 'var(--bg)', borderRadius: 14, padding: '12px 14px',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                  📂 {t('clubs.moveCategory')}
                </div>
                <button
                  onClick={() => setMoveOpen(o => !o)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: 'var(--primary-light)', color: 'var(--primary)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {player.ageCategory} ▾
                </button>
              </div>

              {moveOpen && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10,
                  paddingTop: 10, borderTop: '1px solid var(--border)',
                }}>
                  {AGE_CATEGORIES_BY_SPORT[(club.sport ?? 'football') as 'football' | 'tennis'].map(cat => {
                    const isCurrent = cat === player.ageCategory;
                    return (
                      <button
                        key={cat}
                        onClick={() => handleMove(cat)}
                        disabled={isCurrent}
                        style={{
                          padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: isCurrent ? 'var(--primary)' : 'var(--surface-var)',
                          color: isCurrent ? '#fff' : 'var(--text)',
                          border: 'none', cursor: isCurrent ? 'default' : 'pointer',
                          opacity: isCurrent ? 0.7 : 1,
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}

              {history.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setHistoryOpen(o => !o)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                    }}
                  >
                    <span>🕒 {t('clubs.categoryHistory')} ({history.length})</span>
                    <span>{historyOpen ? '▲' : '▼'}</span>
                  </button>
                  {historyOpen && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[...history]
                        .sort((a, b) => (a.from < b.from ? 1 : -1))
                        .map((h, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              fontSize: 12, color: 'var(--text)',
                              padding: '4px 8px', borderRadius: 6,
                              background: !h.to ? 'var(--primary-light)' : 'var(--surface-var)',
                            }}
                          >
                            <span style={{ fontWeight: 700, minWidth: 36 }}>{h.category}</span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {h.from}{h.to ? ` → ${h.to}` : ' →'}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Souhrn — hlavní čísla ── */}
          <div style={{
            display: 'flex', gap: 8, marginBottom: 16,
          }}>
            <StatBox value={stats.totalGoals} label={t('playerDetail.goals')} icon="⚽" color="var(--success)" />
            <StatBox value={stats.seasonAssists} label={t('playerDetail.assists')} icon="👟" color="var(--info)" />
            <StatBox value={stats.totalMatches} label={t('playerDetail.matches')} icon="📋" color="var(--warning)" />
            <StatBox
              value={stats.seasonAvgRating !== null ? stats.seasonAvgRating.toFixed(1) : '–'}
              label={t('playerDetail.rating')}
              icon="⭐"
              color="var(--warning)"
            />
          </div>

          {/* ── Turnaje ── */}
          <div style={{
            background: 'var(--bg)', borderRadius: 14, padding: '14px 16px',
            marginBottom: 10,
          }}>
            <div style={{
              fontWeight: 700, fontSize: 13, color: 'var(--text-muted)',
              marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              🏆 {t('playerDetail.tournaments')}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>
                  {stats.tournamentsPlayed}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.tournamentsCount')}
                </div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>
                  {stats.tournamentMatches}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.matchesPlayed')}
                </div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>
                  {stats.tournamentGoals}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.goals')}
                </div>
              </div>
            </div>
          </div>

          {/* ── Sezónní zápasy ── */}
          <div style={{
            background: 'var(--bg)', borderRadius: 14, padding: '14px 16px',
            marginBottom: 10,
          }}>
            <div style={{
              fontWeight: 700, fontSize: 13, color: 'var(--text-muted)',
              marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              📋 {t('playerDetail.seasonMatches')}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 30%', textAlign: 'center', padding: '6px 0' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--info)' }}>
                  {stats.seasonMatches}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.matchesPlayed')}
                </div>
              </div>
              <div style={{ flex: '1 1 30%', textAlign: 'center', padding: '6px 0' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>
                  {stats.seasonGoals}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.goals')}
                </div>
              </div>
              <div style={{ flex: '1 1 30%', textAlign: 'center', padding: '6px 0' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--info)' }}>
                  {stats.seasonAssists}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.assists')}
                </div>
              </div>
            </div>

            {/* Karty */}
            {(stats.seasonYellowCards > 0 || stats.seasonRedCards > 0) && (
              <div style={{
                display: 'flex', gap: 12, marginTop: 10, paddingTop: 10,
                borderTop: '1px solid var(--border)',
              }}>
                {stats.seasonYellowCards > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 14, height: 18, borderRadius: 2, background: '#FFEB3B',
                      boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                    }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                      {stats.seasonYellowCards}
                    </span>
                  </div>
                )}
                {stats.seasonRedCards > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 14, height: 18, borderRadius: 2, background: '#F44336',
                      boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                    }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                      {stats.seasonRedCards}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Průměrné atributy ── */}
          {(stats.seasonAvgEffort !== null || stats.seasonAvgTechnique !== null
            || stats.seasonAvgTeamwork !== null || stats.seasonAvgBehavior !== null) && (
            <div style={{
              background: 'var(--bg)', borderRadius: 14, padding: '14px 16px',
              marginBottom: 10,
            }}>
              <div style={{
                fontWeight: 700, fontSize: 13, color: 'var(--text-muted)',
                marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                ⭐ {t('match.ratings.detailed')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {([
                  ['effort', stats.seasonAvgEffort],
                  ['technique', stats.seasonAvgTechnique],
                  ['teamwork', stats.seasonAvgTeamwork],
                  ['behavior', stats.seasonAvgBehavior],
                ] as const).map(([key, val]) => (
                  val !== null && (
                    <div key={key} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '4px 0',
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {t(`match.ratings.${key}`)}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--warning)' }}>
                        {val.toFixed(1)} / 5
                      </span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* ── Tréninky / docházka ── */}
          {stats.trainingsTotal > 0 && (
            <div style={{
              background: 'var(--bg)', borderRadius: 14, padding: '14px 16px',
              marginBottom: 10,
            }}>
              <div style={{
                fontWeight: 700, fontSize: 13, color: 'var(--text-muted)',
                marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                📝 {t('playerDetail.trainings')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>
                    {stats.trainingsPresent}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t('training.attendance.present')}
                  </div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)' }}>
                    {stats.trainingsAbsent}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t('training.attendance.absent')}
                  </div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>
                    {stats.trainingsExcused}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t('training.attendance.excused')}
                  </div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>
                    {stats.attendanceRate ?? 0}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t('playerDetail.attendanceRate')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Empty state — žádné statistiky ── */}
          {stats.totalMatches === 0 && stats.trainingsTotal === 0 && (
            <div style={{
              textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13,
            }}>
              {t('playerDetail.noStats')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
