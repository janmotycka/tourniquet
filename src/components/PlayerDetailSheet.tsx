/**
 * PlayerDetailSheet — bottom-sheet s kartou hráče a statistikami.
 */

import type { ClubPlayer, Club } from '../types/club.types';
import type { PlayerStats } from '../utils/player-stats';
import { useI18n } from '../i18n';

interface Props {
  player: ClubPlayer;
  club: Club;
  stats: PlayerStats;
  onClose: () => void;
  onEdit: () => void;
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

export function PlayerDetailSheet({ player, club, stats, onClose, onEdit }: Props) {
  const { t } = useI18n();

  const age = player.birthYear
    ? new Date().getFullYear() - player.birthYear
    : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,.55)',
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
          background: 'var(--surface)', borderRadius: '24px 24px 0 0',
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

          {/* ── Souhrn — hlavní čísla ── */}
          <div style={{
            display: 'flex', gap: 8, marginBottom: 16,
          }}>
            <StatBox value={stats.totalGoals} label={t('playerDetail.goals')} icon="⚽" color="#2E7D32" />
            <StatBox value={stats.seasonAssists} label={t('playerDetail.assists')} icon="👟" color="#1565C0" />
            <StatBox value={stats.totalMatches} label={t('playerDetail.matches')} icon="📋" color="#E65100" />
            <StatBox
              value={stats.seasonAvgRating !== null ? stats.seasonAvgRating.toFixed(1) : '–'}
              label={t('playerDetail.rating')}
              icon="⭐"
              color="#F9A825"
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
                <div style={{ fontSize: 22, fontWeight: 800, color: '#E65100' }}>
                  {stats.tournamentsPlayed}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.tournamentsCount')}
                </div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#E65100' }}>
                  {stats.tournamentMatches}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.matchesPlayed')}
                </div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2E7D32' }}>
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
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1565C0' }}>
                  {stats.seasonMatches}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.matchesPlayed')}
                </div>
              </div>
              <div style={{ flex: '1 1 30%', textAlign: 'center', padding: '6px 0' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2E7D32' }}>
                  {stats.seasonGoals}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('playerDetail.goals')}
                </div>
              </div>
              <div style={{ flex: '1 1 30%', textAlign: 'center', padding: '6px 0' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1565C0' }}>
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

          {/* ── Empty state — žádné statistiky ── */}
          {stats.totalMatches === 0 && (
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
