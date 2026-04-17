/**
 * GroupDrawModal — los týmů (hráčů) do skupin s docházkou.
 *
 * Flow:
 *   1. Trenér označí kdo se dostavil (attendance)
 *   2. Vybere počet skupin (2-4)
 *   3. "Losovat náhodně" → aplikace rozhodí přítomné do skupin rovnoměrně
 *   4. Potvrdí a rozpis zápasů se přepočítá
 *
 * Použitelné pro tenis (draw-at-site) i pozdní fotbalový los.
 */

import { useState, useMemo } from 'react';
import type { Tournament } from '../../types/tournament.types';
import { useTournamentStore } from '../../store/tournament.store';
import { useToastStore } from '../../store/toast.store';
import { useI18n } from '../../i18n';

interface Props {
  tournament: Tournament;
  onClose: () => void;
}

export function GroupDrawModal({ tournament, onClose }: Props) {
  const { t } = useI18n();
  const drawGroups = useTournamentStore(s => s.drawGroups);
  const showToast = useToastStore(s => s.show);

  // Default: všichni jsou přítomní
  const [attendingIds, setAttendingIds] = useState<Set<string>>(
    new Set(tournament.teams.map(tm => tm.id)),
  );
  const [groupCount, setGroupCount] = useState<number>(
    Math.max(2, Math.min(4, Math.ceil(tournament.teams.length / 4))),
  );
  const [preview, setPreview] = useState<{ name: string; teamIds: string[] }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const attendingTeams = tournament.teams.filter(tm => attendingIds.has(tm.id));
  const perGroup = Math.ceil(attendingTeams.length / groupCount);

  const teamMap = useMemo(() => new Map(tournament.teams.map(tm => [tm.id, tm])), [tournament.teams]);

  const toggleAttendance = (teamId: string) => {
    setAttendingIds(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
    setPreview(null);
  };

  const doRandomDraw = () => {
    if (attendingTeams.length < 2) {
      showToast('error', t('tournament.draw.notEnoughTeams'));
      return;
    }
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const shuffled = attendingTeams.map(tm => tm.id).sort(() => Math.random() - 0.5);
    const groups: { name: string; teamIds: string[] }[] = [];
    for (let i = 0; i < groupCount; i++) {
      groups.push({ name: `Skupina ${letters[i]}`, teamIds: [] });
    }
    shuffled.forEach((id, idx) => {
      groups[idx % groupCount].teamIds.push(id);
    });
    setPreview(groups);
    try { navigator.vibrate?.([30, 20, 30]); } catch { /* ignore */ }
  };

  const confirmDraw = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const assignments: Record<string, string[]> = {};
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      preview.forEach((g, i) => { assignments[`group-${letters[i]}`] = g.teamIds; });
      await drawGroups(tournament.id, [...attendingIds], groupCount, assignments);
      showToast('success', t('tournament.draw.success'));
      onClose();
    } catch {
      showToast('error', t('tournament.draw.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 520, maxHeight: '92dvh',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 20px 12px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>🎲 {t('tournament.draw.title')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('tournament.draw.hint')}
            </div>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} style={{
            background: 'var(--surface-var)', border: 'none', borderRadius: 8,
            width: 32, height: 32, fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)',
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {/* Attendance */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontWeight: 700, fontSize: 14, marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>✅ {t('tournament.draw.attendance')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                {attendingTeams.length} / {tournament.teams.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tournament.teams.map(tm => {
                const present = attendingIds.has(tm.id);
                return (
                  <button
                    key={tm.id}
                    onClick={() => toggleAttendance(tm.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 10, textAlign: 'left',
                      background: present ? 'var(--success-light)' : 'var(--surface-var)',
                      border: `1.5px solid ${present ? 'var(--success)' : 'var(--border)'}`,
                      color: present ? 'var(--success)' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{present ? '✅' : '⬜'}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{tm.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Group count */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
              {t('tournament.draw.groupCount')}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => { setGroupCount(n); setPreview(null); }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    background: groupCount === n ? 'var(--primary)' : 'var(--surface-var)',
                    color: groupCount === n ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {n}× {t('tournament.draw.group')}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
              {t('tournament.draw.perGroupHint', { n: perGroup })}
            </div>
          </div>

          {/* Draw preview */}
          {preview ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                📋 {t('tournament.draw.previewTitle')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {preview.map((g, gi) => (
                  <div key={gi} style={{
                    background: 'var(--bg)', borderRadius: 10, padding: '10px 12px',
                    border: '1.5px solid var(--primary)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 6 }}>
                      {g.name}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {g.teamIds.map(id => (
                        <div key={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                          · {teamMap.get(id)?.name ?? '?'}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button
              onClick={doRandomDraw}
              disabled={attendingTeams.length < 2}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, fontWeight: 800, fontSize: 15,
                background: attendingTeams.length >= 2 ? 'var(--primary)' : 'var(--border)',
                color: attendingTeams.length >= 2 ? '#fff' : 'var(--text-muted)',
                border: 'none', cursor: attendingTeams.length >= 2 ? 'pointer' : 'not-allowed',
                marginBottom: 12,
              }}
            >
              🎲 {t('tournament.draw.drawRandomly')}
            </button>
          )}
        </div>

        {/* Footer — confirm */}
        {preview && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 20px', display: 'flex', gap: 10,
          }}>
            <button
              onClick={doRandomDraw}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                background: 'var(--surface-var)', color: 'var(--text)',
                border: '1.5px solid var(--border)', cursor: 'pointer',
              }}
            >
              🎲 {t('tournament.draw.shuffleAgain')}
            </button>
            <button
              onClick={confirmDraw}
              disabled={busy}
              style={{
                flex: 2, padding: '12px', borderRadius: 12, fontWeight: 800, fontSize: 14,
                background: busy ? 'var(--border)' : 'var(--success)',
                color: busy ? 'var(--text-muted)' : '#fff',
                border: 'none', cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? '⏳' : `✓ ${t('tournament.draw.confirm')}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
