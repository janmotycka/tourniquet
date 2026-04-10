/**
 * AttendanceSheet — bottom-sheet pro vyplnění docházky na trénink.
 *
 * Pracuje s hráči klubového rosteru filtrovanými dle clubAgeCategory.
 * Umí přepínat status (present / absent / excused) klikáním na hráče.
 */

import { useMemo, useState } from 'react';
import type { ClubPlayer, AgeCategory as ClubAgeCategory } from '../../types/club.types';
import type { TrainingAttendance, AttendanceStatus } from '../../types/training.types';
import { useI18n } from '../../i18n';

interface Props {
  players: ClubPlayer[];
  ageCategory: ClubAgeCategory;
  initial: TrainingAttendance;
  onSave: (attendance: TrainingAttendance) => void;
  onClose: () => void;
}

const STATUS_ORDER: AttendanceStatus[] = ['present', 'absent', 'excused'];

const STATUS_STYLE: Record<AttendanceStatus, { bg: string; color: string; icon: string }> = {
  present: { bg: 'var(--success-light)', color: 'var(--success)', icon: '✅' },
  absent:  { bg: 'var(--danger-light)', color: 'var(--danger)', icon: '❌' },
  excused: { bg: '#FFF8E1', color: '#F9A825', icon: '🟡' },
};

function nextStatus(s: AttendanceStatus | undefined): AttendanceStatus {
  if (!s) return 'present';
  const idx = STATUS_ORDER.indexOf(s);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

export function AttendanceSheet({ players, ageCategory, initial, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<TrainingAttendance>(initial);

  // Pouze aktivní hráči zvolené kategorie
  const roster = useMemo(
    () => players
      .filter(p => p.active && p.ageCategory === ageCategory)
      .sort((a, b) => (a.lastName ?? a.name).localeCompare(b.lastName ?? b.name)),
    [players, ageCategory],
  );

  const counts = useMemo(() => {
    let present = 0, absent = 0, excused = 0;
    for (const p of roster) {
      const s = draft[p.id];
      if (s === 'present') present++;
      else if (s === 'absent') absent++;
      else if (s === 'excused') excused++;
    }
    return { present, absent, excused, total: roster.length };
  }, [draft, roster]);

  const cycleStatus = (playerId: string) => {
    setDraft(prev => ({ ...prev, [playerId]: nextStatus(prev[playerId]) }));
  };

  const markAllPresent = () => {
    const next: TrainingAttendance = { ...draft };
    for (const p of roster) next[p.id] = 'present';
    setDraft(next);
  };

  const reset = () => setDraft({});

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 320,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 520, padding: '0 0 24px',
          maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '4px 20px 12px', display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontWeight: 800, fontSize: 17 }}>📝 {t('training.attendance.title')}</h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {ageCategory} · {counts.total} {t('clubs.playersLabel')}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 16, background: 'var(--surface-var)',
              color: 'var(--text-muted)', fontSize: 16,
            }}
          >✕</button>
        </div>

        {/* Counts */}
        <div style={{
          display: 'flex', gap: 8, padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, textAlign: 'center', padding: 8, borderRadius: 10, background: 'var(--success-light)' }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--success)' }}>{counts.present}</div>
            <div style={{ fontSize: 10, color: 'var(--success)' }}>{t('training.attendance.present')}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: 8, borderRadius: 10, background: 'var(--danger-light)' }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--danger)' }}>{counts.absent}</div>
            <div style={{ fontSize: 10, color: 'var(--danger)' }}>{t('training.attendance.absent')}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: 8, borderRadius: 10, background: '#FFF8E1' }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#F9A825' }}>{counts.excused}</div>
            <div style={{ fontSize: 10, color: '#F9A825' }}>{t('training.attendance.excused')}</div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 20px' }}>
          <button
            onClick={markAllPresent}
            style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'var(--primary-light)', color: 'var(--primary)',
            }}
          >✅ {t('training.attendance.markAllPresent')}</button>
          <button
            onClick={reset}
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'var(--surface-var)', color: 'var(--text-muted)',
            }}
          >↺</button>
        </div>

        {/* Roster list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 12px' }}>
          {roster.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
              {t('training.attendance.noPlayers')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {roster.map(p => {
                const status = draft[p.id];
                const style = status ? STATUS_STYLE[status] : null;
                return (
                  <button
                    key={p.id}
                    onClick={() => cycleStatus(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: style?.bg ?? 'var(--bg)',
                      border: `1px solid ${style ? style.color : 'var(--border)'}`,
                      color: 'var(--text)', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: 'var(--surface)', color: 'var(--text)',
                      fontWeight: 800, fontSize: 13,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {p.jerseyNumber || '–'}
                    </div>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{
                      fontSize: 18,
                      color: style?.color ?? 'var(--text-muted)',
                      opacity: status ? 1 : 0.4,
                    }}>
                      {style?.icon ?? '○'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px 0', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px', borderRadius: 12, fontWeight: 600, fontSize: 14,
              background: 'var(--surface-var)', color: 'var(--text)',
            }}
          >{t('common.cancel')}</button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            style={{
              flex: 2, padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 14,
              background: 'var(--primary)', color: '#fff',
            }}
          >💾 {t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}
