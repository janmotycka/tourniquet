/**
 * TennisPlayerDetailPage — detail tenisového hráče (individuální mód).
 *
 * Header s metadaty + velké stat cards + seznam posledních zápasů.
 * Cíl: rodič / privátní trenér na jedno kliknutí vidí, jak dítě/svěřenec hraje.
 */

import { useMemo } from 'react';
import type { Page } from '../../../App';
import { useI18n } from '../../../i18n';
import { useMyPlayersStore } from '../store/myPlayers.store';
import { useMatchesStore } from '../../../store/matches.store';
import { useConfirmStore } from '../../../store/confirm.store';
import { useToastStore } from '../../../store/toast.store';
import { PageHeader } from '../../../components/ui';
import { computePlayerStats } from '../utils/player-stats';
import { formatSubMatchScore, determineSubMatchWinner } from '../utils/tennis-team';
import { formatDate } from '../../../components/match/match-utils';

interface Props { playerId: string; navigate: (p: Page) => void; }

const RELATION_ICONS: Record<string, string> = {
  child: '👶',
  student: '🎓',
  self: '👤',
  other: '🤝',
};

export function TennisPlayerDetailPage({ playerId, navigate }: Props) {
  const { t } = useI18n();
  const players = useMyPlayersStore(s => s.players);
  const deletePlayer = useMyPlayersStore(s => s.deletePlayer);
  const allMatches = useMatchesStore(s => s.matches);
  const ask = useConfirmStore(s => s.ask);
  const showToast = useToastStore(s => s.show);

  const player = players.find(p => p.id === playerId);

  const playerMatches = useMemo(
    () => allMatches
      .filter(m => (m.sport ?? 'football') === 'tennis' && m.myPlayerId === playerId)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [allMatches, playerId],
  );

  const stats = useMemo(() => computePlayerStats(playerMatches), [playerMatches]);

  if (!player) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40,
      }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700 }}>{t('tennisIndividual.playerDetail.notFound')}</div>
        <button
          onClick={() => navigate({ name: 'clubs' })}
          style={{
            padding: '10px 18px', borderRadius: 10,
            background: 'var(--primary)', color: '#fff',
            fontWeight: 700, border: 'none', cursor: 'pointer',
          }}
        >
          ← {t('common.back')}
        </button>
      </div>
    );
  }

  const handleDelete = async () => {
    const ok = await ask({
      title: t('common.delete'),
      message: t('tennisIndividual.players.deleteConfirm', { name: player.name }),
      destructive: true,
    });
    if (ok) {
      await deletePlayer(player.id);
      showToast('success', t('common.deleted') || 'Smazáno');
      navigate({ name: 'clubs' });
    }
  };

  const icon = player.relation ? RELATION_ICONS[player.relation] : '🎾';
  const winPct = Math.round(stats.winRate * 100);
  const setPct = Math.round(stats.setsWinRate * 100);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 40 }}>
      <PageHeader
        title={player.name}
        onBack={() => navigate({ name: 'clubs' })}
      />

      {/* Player header card */}
      <div style={{
        margin: '12px 16px',
        background: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 100%)',
        color: '#fff', borderRadius: 18, padding: 18,
        display: 'flex', gap: 14, alignItems: 'center',
        boxShadow: '0 6px 18px rgba(74,20,140,.20)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 32,
          background: 'rgba(255,255,255,.18)', fontSize: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{player.name}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {player.category && <span>{player.category}</span>}
            {player.birthYear && <span>{t('tennis.club.born')} {player.birthYear}</span>}
            {player.currentClub && <span>🏟 {player.currentClub}</span>}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionTitle>{t('tennisIndividual.playerDetail.statsTitle')}</SectionTitle>

        {stats.totalMatches === 0 ? (
          <EmptyStats
            onAddMatch={() => navigate({ name: 'match-create' })}
            t={t}
          />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatCard
                icon="🏆"
                value={`${stats.wins}-${stats.losses}`}
                label={t('tennisIndividual.playerDetail.record')}
                highlight
              />
              <StatCard
                icon="📊"
                value={`${winPct}%`}
                label={t('tennisIndividual.playerDetail.winRate')}
              />
              <StatCard
                icon="🎾"
                value={`${stats.setsWon}:${stats.setsLost}`}
                label={t('tennisIndividual.playerDetail.sets')}
              />
              <StatCard
                icon="🏅"
                value={`${setPct}%`}
                label={t('tennisIndividual.playerDetail.setsRate')}
              />
              <StatCard
                icon="🔥"
                value={String(stats.currentWinStreak)}
                label={t('tennisIndividual.playerDetail.currentStreak')}
              />
              <StatCard
                icon="⭐"
                value={String(stats.bestWinStreak)}
                label={t('tennisIndividual.playerDetail.bestStreak')}
              />
            </div>
            {stats.retirements > 0 && (
              <div style={{
                fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px',
                background: 'var(--warning-light)', borderRadius: 8,
              }}>
                ⚠️ {t('tennisIndividual.playerDetail.retirementsCount', { n: stats.retirements })}
              </div>
            )}
          </>
        )}

        {/* Recent matches */}
        {playerMatches.length > 0 && (
          <>
            <SectionTitle style={{ marginTop: 10 }}>
              {t('tennisIndividual.playerDetail.recentMatches')}
            </SectionTitle>
            <div style={{
              background: 'var(--surface)', borderRadius: 12,
              boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
            }}>
              {playerMatches.slice(0, 10).map((m, idx) => {
                const sub = m.subMatches?.[0];
                const winner = sub ? determineSubMatchWinner(sub) : null;
                const won = winner === (m.isHome ? 'home' : 'away');
                const isLast = idx === Math.min(playerMatches.length, 10) - 1;
                return (
                  <button
                    key={m.id}
                    onClick={() => navigate({ name: 'match-detail', matchId: m.id })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px', width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: isLast ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 15,
                      background: winner === null
                        ? 'var(--surface-var)'
                        : won ? 'var(--success-light)' : 'var(--danger-light)',
                      color: winner === null
                        ? 'var(--text-muted)'
                        : won ? 'var(--success)' : 'var(--danger)',
                      fontSize: 12, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {winner === null ? '—' : won ? 'W' : 'L'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        vs {m.opponent}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {formatDate(m.date)}
                        {m.competition && ` · ${m.competition}`}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--text)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {sub ? formatSubMatchScore(sub) : '—'}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Notes */}
        {player.notes && (
          <>
            <SectionTitle style={{ marginTop: 10 }}>
              {t('tennisIndividual.players.notes')}
            </SectionTitle>
            <div style={{
              background: 'var(--surface)', borderRadius: 12, padding: '12px 14px',
              boxShadow: 'var(--shadow-sm)', fontSize: 13, lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}>
              {player.notes}
            </div>
          </>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <button
            onClick={() => navigate({ name: 'match-create' })}
            style={{
              padding: '14px', borderRadius: 12, fontWeight: 800, fontSize: 14,
              background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
              color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(21,101,192,.20)',
            }}
          >
            + {t('tennisIndividual.playerDetail.addMatchCta')}
          </button>
          <button
            onClick={() => { void handleDelete(); }}
            style={{
              padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: 'transparent', color: 'var(--danger)',
              border: '1.5px solid var(--danger)', cursor: 'pointer',
            }}
          >
            🗑 {t('tennisIndividual.playerDetail.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function StatCard({ icon, value, label, highlight }: {
  icon: string; value: string; label: string; highlight?: boolean;
}) {
  return (
    <div style={{
      background: highlight
        ? 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)'
        : 'var(--surface)',
      borderRadius: 12, padding: '14px',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          {label}
        </span>
      </div>
      <div style={{
        fontSize: 24, fontWeight: 900, color: highlight ? '#1B5E20' : 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h3 style={{
      fontSize: 12, fontWeight: 800, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: 0.5, margin: '6px 0 0',
      ...style,
    }}>
      {children}
    </h3>
  );
}

function EmptyStats({ onAddMatch, t }: {
  onAddMatch: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '24px 16px',
      textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10,
      alignItems: 'center', boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontSize: 40 }}>📊</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>
        {t('tennisIndividual.playerDetail.noStatsTitle')}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 280, lineHeight: 1.5 }}>
        {t('tennisIndividual.playerDetail.noStatsDesc')}
      </div>
      <button
        onClick={onAddMatch}
        style={{
          marginTop: 4, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
          color: '#fff', border: 'none', cursor: 'pointer',
        }}
      >
        + {t('tennisIndividual.playerDetail.addFirstMatch')}
      </button>
    </div>
  );
}
