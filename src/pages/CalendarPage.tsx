import { useState, useMemo } from 'react';
import type { Page } from '../App';
import { useTrainingsStore } from '../store/trainings.store';
import { CATEGORY_CONFIGS } from '../data/categories.data';
import { formatMinutes } from '../utils/time';
import type { TrainingUnit } from '../types/training.types';

interface Props { navigate: (p: Page) => void; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayYMD(): string {
  return toYMD(new Date());
}

function formatScheduledDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
}

const DAY_NAMES = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

// ─── Schedule Modal (pick a training to assign to a day) ───────────────────
function ScheduleModal({ date, savedTrainings, onSchedule, onClose }: {
  date: string;
  savedTrainings: TrainingUnit[];
  onSchedule: (trainingId: string, date: string) => void;
  onClose: () => void;
}) {
  const available = savedTrainings.filter(t => t.isSaved);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '75dvh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '8px 20px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>📅 Přiřadit trénink</h3>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{formatScheduledDate(date)}</div>
          <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {available.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
              Nejsou žádné uložené tréninky. Nejprve vytvořte a uložte trénink.
            </p>
          ) : (
            available.map(t => {
              const cfg = CATEGORY_CONFIGS[t.input.category];
              return (
                <button key={t.id} onClick={() => { onSchedule(t.id, date); onClose(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    background: 'var(--surface)', borderRadius: 12, textAlign: 'left', width: '100%', color: 'var(--text)',
                  }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: cfg.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cfg.label} · {formatMinutes(t.totalDuration)}</div>
                  </div>
                  <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 16 }}>+</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Share helper ─────────────────────────────────────────────────────────────
function buildShareText(trainings: TrainingUnit[]): string {
  return trainings.map(t => {
    const cfg = CATEGORY_CONFIGS[t.input.category];
    const dateStr = t.scheduledDate ? `📅 ${formatScheduledDate(t.scheduledDate)}\n` : '';
    const phases = t.phases.map(p => {
      if (p.stations && p.stations.length > 0) {
        const stationLines = p.stations.map(s =>
          `  • Stanoviště ${s.stationNumber}: ${s.exercise.name} (${s.durationMinutes} min)${s.coachName ? ` – ${s.coachName}` : ''}`
        ).join('\n');
        return `*${p.label}* (${p.durationMinutes} min)\n${stationLines}`;
      }
      const exLines = p.exercises.map(e => `  • ${e.name} (${e.duration.recommended} min)`).join('\n');
      return `*${p.label}* (${p.durationMinutes} min)\n${exLines}`;
    }).join('\n\n');
    return `🏆 *${t.title}*\n${dateStr}${cfg.label} · ${formatMinutes(t.totalDuration)}\n\n${phases}`;
  }).join('\n\n---\n\n');
}

// ─── Monthly Grid View ────────────────────────────────────────────────────────
function MonthView({ year, month, scheduledByDate, onDayClick }: {
  year: number;
  month: number;
  scheduledByDate: Map<string, TrainingUnit[]>;
  onDayClick: (dateStr: string, trainings: TrainingUnit[]) => void;
}) {
  const today = todayYMD();

  // Build grid: week starts Monday
  const firstDay = new Date(year, month, 1);
  // getDay(): 0=Sun, 1=Mon … 6=Sat → convert to Mon=0 … Sun=6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1;
    cells.push(dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null);
  }

  return (
    <div>
      {/* Day name headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map((dayNum, idx) => {
          if (dayNum === null) {
            return <div key={`empty-${idx}`} style={{ aspectRatio: '1', borderRadius: 10 }} />;
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const trainingsOnDay = scheduledByDate.get(dateStr) ?? [];
          const isToday = dateStr === today;
          const isWeekend = idx % 7 >= 5;
          const hasTrain = trainingsOnDay.length > 0;

          return (
            <button key={dateStr} onClick={() => onDayClick(dateStr, trainingsOnDay)}
              style={{
                aspectRatio: '1', borderRadius: 10, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2, padding: 2,
                background: isToday ? 'var(--primary)' : hasTrain ? 'var(--primary-light)' : 'var(--surface)',
                border: isToday ? 'none' : hasTrain ? '1.5px solid var(--primary)' : '1px solid transparent',
                color: isToday ? '#fff' : isWeekend ? 'var(--text-muted)' : 'var(--text)',
                position: 'relative',
              }}>
              <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 600, lineHeight: 1 }}>{dayNum}</span>
              {hasTrain && (
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' }}>
                  {trainingsOnDay.slice(0, 3).map((t, i) => (
                    <div key={i} style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: isToday ? 'rgba(255,255,255,.8)' : CATEGORY_CONFIGS[t.input.category].color,
                    }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agenda List View ─────────────────────────────────────────────────────────
function AgendaView({
  savedTrainings,
  selectedIds,
  multiSelect,
  onToggleSelect,
  onNavigate,
  onSchedule,
  onUnschedule,
}: {
  savedTrainings: TrainingUnit[];
  selectedIds: Set<string>;
  multiSelect: boolean;
  onToggleSelect: (id: string) => void;
  onNavigate: (t: TrainingUnit) => void;
  onSchedule: (t: TrainingUnit) => void;
  onUnschedule: (id: string) => void;
}) {
  const scheduled = savedTrainings.filter(t => t.scheduledDate).sort((a, b) => (a.scheduledDate! > b.scheduledDate! ? 1 : -1));
  const unscheduled = savedTrainings.filter(t => !t.scheduledDate);

  const renderRow = (t: TrainingUnit, showDate: boolean) => {
    const cfg = CATEGORY_CONFIGS[t.input.category];
    const sel = selectedIds.has(t.id);
    return (
      <div key={t.id} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px',
        background: sel ? 'var(--primary-light)' : 'var(--surface)',
        borderRadius: 14, border: sel ? '1.5px solid var(--primary)' : '1px solid transparent',
        boxShadow: '0 1px 4px rgba(0,0,0,.05)',
      }}>
        {multiSelect && (
          <button onClick={() => onToggleSelect(t.id)} style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
            background: sel ? 'var(--primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800,
          }}>{sel ? '✓' : ''}</button>
        )}
        <button onClick={() => onNavigate(t)}
          style={{ flex: 1, textAlign: 'left', background: 'none', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: cfg.color, flexShrink: 0 }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {showDate && t.scheduledDate && <span>{formatScheduledDate(t.scheduledDate)} · </span>}
              {cfg.label} · {formatMinutes(t.totalDuration)}
            </div>
          </div>
        </button>
        {!multiSelect && (
          t.scheduledDate ? (
            <button onClick={() => onUnschedule(t.id)} title="Odebrat datum"
              style={{ background: 'none', fontSize: 16, color: 'var(--text-muted)', padding: '4px 6px' }}>🗓</button>
          ) : (
            <button onClick={() => onSchedule(t)} title="Naplánovat"
              style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 12, padding: '6px 10px', borderRadius: 8 }}>+ Naplánovat</button>
          )
        )}
      </div>
    );
  };

  if (savedTrainings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Žádné uložené tréninky</div>
        <div style={{ fontSize: 14 }}>Nejprve vytvořte a uložte trénink.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {scheduled.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 8 }}>
            Naplánované ({scheduled.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scheduled.map(t => renderRow(t, true))}
          </div>
        </div>
      )}
      {unscheduled.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 8 }}>
            Neplánované ({unscheduled.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unscheduled.map(t => renderRow(t, false))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main CalendarPage ────────────────────────────────────────────────────────
export function CalendarPage({ navigate }: Props) {
  const { savedTrainings, scheduleTraining } = useTrainingsStore(s => ({
    savedTrainings: s.savedTrainings,
    scheduleTraining: s.scheduleTraining,
  }));

  const now = new Date();
  const [viewTab, setViewTab] = useState<'month' | 'agenda'>('month');
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth()); // 0-based

  // Schedule modal
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<TrainingUnit | null>(null); // for agenda "+ Naplánovat" with date picker

  // Day click modal (show trainings on that day OR open schedule modal for empty days)
  const [dayClickDate, setDayClickDate] = useState<string | null>(null);
  const [dayClickTrainings, setDayClickTrainings] = useState<TrainingUnit[]>([]);

  // Multi-select
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Build lookup map: dateStr → trainings
  const scheduledByDate = useMemo(() => {
    const map = new Map<string, TrainingUnit[]>();
    for (const t of savedTrainings) {
      if (t.scheduledDate) {
        const arr = map.get(t.scheduledDate) ?? [];
        arr.push(t);
        map.set(t.scheduledDate, arr);
      }
    }
    return map;
  }, [savedTrainings]);

  const handleDayClick = (dateStr: string, trainings: TrainingUnit[]) => {
    if (trainings.length === 0) {
      // Open schedule modal to assign a training
      setScheduleDate(dateStr);
    } else {
      // Show day detail
      setDayClickDate(dateStr);
      setDayClickTrainings(trainings);
    }
  };

  const handleSchedule = (trainingId: string, date: string) => {
    scheduleTraining(trainingId, date);
  };

  const handleUnschedule = (id: string) => {
    scheduleTraining(id, null);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleShareSelected = () => {
    const toShare = savedTrainings.filter(t => selectedIds.has(t.id));
    if (toShare.length === 0) return;
    const text = buildShareText(toShare);
    const encoded = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/?text=${encoded}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {
        window.open(whatsappUrl, '_blank');
      });
    } else {
      window.open(whatsappUrl, '_blank');
    }
  };

  const handleCopySelected = () => {
    const toShare = savedTrainings.filter(t => selectedIds.has(t.id));
    if (toShare.length === 0) return;
    navigator.clipboard.writeText(buildShareText(toShare)).then(() => {
      alert('Tréninky zkopírovány do schránky!');
    });
  };

  // Navigate calendar months
  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  // For agenda "+ Naplánovat" → open date picker modal
  const handleAgendaSchedule = (t: TrainingUnit) => {
    setScheduleTarget(t);
    const today = todayYMD();
    setScheduleDate(today);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px' }}>
        <button onClick={() => navigate({ name: 'home' })} style={{ background: 'none', fontSize: 22, padding: 4, color: 'var(--text)' }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>Kalendář</h1>
        <button onClick={() => {
          setMultiSelect(s => {
            if (s) setSelectedIds(new Set());
            return !s;
          });
        }} style={{
          background: multiSelect ? 'var(--primary)' : 'var(--surface-var)',
          color: multiSelect ? '#fff' : 'var(--text)',
          padding: '7px 12px', borderRadius: 10, fontWeight: 700, fontSize: 12,
        }}>
          {multiSelect ? '✕ Zrušit' : 'Vybrat'}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', margin: '0 20px 16px', background: 'var(--surface-var)', borderRadius: 14, padding: 4, gap: 4 }}>
        {(['month', 'agenda'] as const).map(tab => (
          <button key={tab} onClick={() => setViewTab(tab)} style={{
            flex: 1, padding: '9px', borderRadius: 10, fontWeight: 700, fontSize: 13,
            background: viewTab === tab ? 'var(--surface)' : 'transparent',
            color: viewTab === tab ? 'var(--text)' : 'var(--text-muted)',
            boxShadow: viewTab === tab ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
            transition: 'all .15s',
          }}>
            {tab === 'month' ? '📅 Měsíc' : '📋 Seznam'}
          </button>
        ))}
      </div>

      {/* Month navigation (only in month view) */}
      {viewTab === 'month' && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px 12px' }}>
          <button onClick={prevMonth} style={{ background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px', color: 'var(--text)', fontWeight: 700 }}>‹</button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 16, textTransform: 'capitalize' }}>
            {formatMonthYear(calYear, calMonth)}
          </span>
          <button onClick={nextMonth} style={{ background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px', color: 'var(--text)', fontWeight: 700 }}>›</button>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 24px' }}>
        {viewTab === 'month' ? (
          <MonthView
            year={calYear}
            month={calMonth}
            scheduledByDate={scheduledByDate}
            onDayClick={handleDayClick}
          />
        ) : (
          <AgendaView
            savedTrainings={savedTrainings}
            selectedIds={selectedIds}
            multiSelect={multiSelect}
            onToggleSelect={handleToggleSelect}
            onNavigate={t => navigate({ name: 'training', training: t })}
            onSchedule={handleAgendaSchedule}
            onUnschedule={handleUnschedule}
          />
        )}
      </div>

      {/* Multi-select sticky footer */}
      {multiSelect && selectedIds.size > 0 && (
        <div style={{
          padding: '14px 20px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg)',
          display: 'flex', gap: 10,
        }}>
          <button onClick={handleCopySelected} style={{
            flex: 1, padding: '13px', borderRadius: 14, fontWeight: 700, fontSize: 14,
            background: 'var(--surface-var)', color: 'var(--text)',
          }}>
            📋 Kopírovat ({selectedIds.size})
          </button>
          <button onClick={handleShareSelected} style={{
            flex: 2, padding: '13px', borderRadius: 14, fontWeight: 700, fontSize: 14,
            background: '#25D366', color: '#fff',
          }}>
            📲 Sdílet {selectedIds.size} {selectedIds.size === 1 ? 'trénink' : selectedIds.size < 5 ? 'tréninky' : 'tréninků'}
          </button>
        </div>
      )}

      {/* Schedule modal — when clicking empty day */}
      {scheduleDate && !scheduleTarget && (
        <ScheduleModal
          date={scheduleDate}
          savedTrainings={savedTrainings}
          onSchedule={handleSchedule}
          onClose={() => setScheduleDate(null)}
        />
      )}

      {/* Date picker modal — when clicking "+ Naplánovat" in agenda */}
      {scheduleTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => { setScheduleTarget(null); setScheduleDate(null); }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg)', borderRadius: 24, padding: '24px', maxWidth: 340, width: '100%',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <h3 style={{ fontWeight: 800, fontSize: 18 }}>📅 Naplánovat trénink</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: -8, lineHeight: 1.5 }}>{scheduleTarget.title}</p>
            <input
              type="date"
              value={scheduleDate ?? ''}
              min={todayYMD()}
              onChange={e => setScheduleDate(e.target.value)}
              style={{
                padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border)',
                background: 'var(--surface)', fontSize: 15, color: 'var(--text)', width: '100%', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setScheduleTarget(null); setScheduleDate(null); }}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--surface-var)', fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                Zrušit
              </button>
              <button
                disabled={!scheduleDate}
                onClick={() => {
                  if (scheduleDate) {
                    handleSchedule(scheduleTarget.id, scheduleDate);
                    setScheduleTarget(null);
                    setScheduleDate(null);
                  }
                }}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                  background: scheduleDate ? 'var(--primary)' : 'var(--border)',
                  color: scheduleDate ? '#fff' : 'var(--text-disabled)',
                }}>
                Uložit datum
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day-click detail modal (multiple trainings on a day) */}
      {dayClickDate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setDayClickDate(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480,
            maxHeight: '65dvh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
            <div style={{ padding: '8px 20px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>{formatScheduledDate(dayClickDate)}</h3>
              <button onClick={() => setDayClickDate(null)}
                style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dayClickTrainings.map(t => {
                const cfg = CATEGORY_CONFIGS[t.input.category];
                return (
                  <button key={t.id}
                    onClick={() => { setDayClickDate(null); navigate({ name: 'training', training: t }); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                      background: 'var(--surface)', borderRadius: 14, textAlign: 'left', width: '100%', color: 'var(--text)',
                    }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, background: cfg.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cfg.label} · {formatMinutes(t.totalDuration)}</div>
                    </div>
                    <span style={{ color: 'var(--text-muted)' }}>›</span>
                  </button>
                );
              })}
              {/* Also offer to add another training on this day */}
              <button onClick={() => { setDayClickDate(null); setScheduleDate(dayClickDate); }}
                style={{
                  padding: '12px', borderRadius: 12, border: '1.5px dashed var(--primary)',
                  background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600, fontSize: 13, marginTop: 4,
                }}>+ Přidat další trénink</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
