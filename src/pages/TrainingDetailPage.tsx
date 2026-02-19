import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { Page } from '../App';
import type { TrainingUnit } from '../types/training.types';
import type { PhaseConfig, Station } from '../types/phase.types';
import type { Exercise, PhaseType } from '../types/exercise.types';
import { useTrainingsStore } from '../store/trainings.store';
import { useExercisesStore } from '../store/exercises.store';
import { useCoachesStore } from '../store/coaches.store';
import { ALL_EXERCISES } from '../data/exercises/index';
import { CATEGORY_CONFIGS } from '../data/categories.data';
import { SKILL_FOCUS_CONFIGS } from '../data/skill-focus.data';
import { formatMinutes, formatDate } from '../utils/time';
import { formatTrainingForShare, shareToWhatsApp, copyToClipboard } from '../utils/training-share';

const PHASE_COLORS: Record<PhaseType, { bg: string; text: string; bar: string; label: string }> = {
  warmup: { bg: 'var(--warmup-light)', text: 'var(--warmup-text)', bar: 'var(--warmup)', label: 'Rozcvičení' },
  main: { bg: 'var(--main-ph-light)', text: 'var(--main-ph-text)', bar: 'var(--main-ph)', label: 'Hlavní část' },
  cooldown: { bg: 'var(--cooldown-light)', text: 'var(--cooldown-text)', bar: 'var(--cooldown)', label: 'Závěr' },
};

interface Props {
  training: TrainingUnit;
  navigate: (p: Page) => void;
}

// ─── Exercise detail modal ────────────────────────────────────────────────────
function ExerciseModal({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const colors = PHASE_COLORS[ex.phaseType];
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '85dvh', overflowY: 'auto', padding: '0 0 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ background: colors.bg, color: colors.text, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: .5 }}>
              {colors.label}
            </span>
            <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
          </div>
          <h2 style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>{ex.name}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>{ex.description}</p>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { icon: '⏱', val: `${ex.duration.recommended}`, unit: 'minut' },
              { icon: '👥', val: typeof ex.players.max === 'number' ? `${ex.players.min}–${ex.players.max}` : `${ex.players.min}+`, unit: 'hráčů' },
            ].map((m, i) => (
              <div key={i} style={{ flex: 1, background: 'var(--primary-light)', borderRadius: 14, padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20 }}>{m.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--primary)' }}>{m.val}</div>
                <div style={{ fontSize: 12, color: 'var(--primary)', opacity: .7 }}>{m.unit}</div>
              </div>
            ))}
          </div>
          {ex.equipment.length > 0 && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🎒 Pomůcky</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ex.equipment.map(eq => (
                  <span key={eq} style={{ background: 'var(--surface-var)', borderRadius: 8, padding: '4px 10px', fontSize: 13 }}>{eq}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🎯 Zaměření</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ex.skillFocus.map(sf => (
                <span key={sf} style={{ background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 600 }}>
                  {SKILL_FOCUS_CONFIGS[sf]?.label ?? sf}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📋 Postup</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ex.instructions.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 14, lineHeight: 1.6, flex: 1 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
          {ex.coachTip && (
            <div style={{ background: '#FFF8E1', borderRadius: 14, padding: '14px', borderLeft: '3px solid var(--warmup)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 13, color: 'var(--warmup-text)', marginBottom: 6 }}>💡 Tip pro trenéra</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4E342E' }}>{ex.coachTip}</p>
            </div>
          )}
          {ex.variations && ex.variations.length > 0 && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🔀 Varianty</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ex.variations.map((v, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--primary)', marginTop: 8, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, lineHeight: 1.6 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Share modal ─────────────────────────────────────────────────────────────
function ShareModal({ training, onClose }: { training: TrainingUnit; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  const text = formatTrainingForShare(training);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
  };

  const btnStyle = (color: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
    background: 'var(--surface)', borderRadius: 14, width: '100%', textAlign: 'left',
    border: `1.5px solid ${color}30`,
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480,
        padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Sdílet trénink</h2>
        <button style={btnStyle('#25D366')} onClick={() => shareToWhatsApp(text)}>
          <span style={{ fontSize: 30 }}>📱</span>
          <div><div style={{ fontWeight: 700, fontSize: 15 }}>WhatsApp</div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sdílet jako zprávu</div></div>
        </button>
        <button style={btnStyle('#007AFF')} onClick={handleCopy}>
          <span style={{ fontSize: 30 }}>{copied ? '✅' : '📋'}</span>
          <div><div style={{ fontWeight: 700, fontSize: 15 }}>{copied ? 'Zkopírováno!' : 'Kopírovat text'}</div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Kopírovat do schránky</div></div>
        </button>
        <button style={btnStyle('#666')} onClick={() => setShowText(s => !s)}>
          <span style={{ fontSize: 30 }}>📄</span>
          <div><div style={{ fontWeight: 700, fontSize: 15 }}>{showText ? 'Skrýt náhled' : 'Zobrazit text'}</div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Textový přehled</div></div>
        </button>
        {showText && (
          <textarea readOnly value={text} rows={10} style={{
            width: '100%', padding: '12px', borderRadius: 12, border: '1.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 12, lineHeight: 1.5, color: 'var(--text)',
            fontFamily: 'monospace', resize: 'none', boxSizing: 'border-box',
          }} />
        )}
        <button onClick={onClose} style={{ padding: '13px', borderRadius: 14, background: 'var(--surface)', fontWeight: 600, fontSize: 15, marginTop: 4 }}>Zavřít</button>
      </div>
    </div>
  );
}

// ─── Exercise Picker ──────────────────────────────────────────────────────────
function ExercisePicker({ forPhase, category, onSelect, onClose }: {
  forPhase: PhaseType; category: string; onSelect: (ex: Exercise) => void; onClose: () => void;
}) {
  const { customExercises } = useExercisesStore();
  const [search, setSearch] = useState('');

  const pool = useMemo(() =>
    [...ALL_EXERCISES, ...customExercises].filter(ex =>
      ex.phaseType === forPhase && ex.suitableFor.includes(category as never)
    ), [forPhase, category, customExercises]);

  const filtered = search
    ? pool.filter(ex => ex.name.toLowerCase().includes(search.toLowerCase()))
    : pool;

  const colors = PHASE_COLORS[forPhase];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '8px 20px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: colors.bg, color: colors.text, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 8, textTransform: 'uppercase' }}>{colors.label}</span>
          <h3 style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>Vybrat cvičení</h3>
          <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: '0 20px 10px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Hledat..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0
            ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Žádná cvičení</p>
            : filtered.map(ex => (
              <button key={ex.id} onClick={() => { onSelect(ex); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface)', borderRadius: 12, textAlign: 'left', width: '100%', color: 'var(--text)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ex.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ex.duration.recommended} min{ex.equipment.length > 0 ? ` · ${ex.equipment.slice(0, 2).join(', ')}` : ''}</div>
                </div>
                <span style={{ color: 'var(--primary)', fontSize: 20, fontWeight: 700 }}>+</span>
              </button>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── Drag source state shared across phase blocks (lifted via prop) ───────────
interface DragSource { phaseType: PhaseType; exIndex: number; }

// ─── Edit phase block ─────────────────────────────────────────────────────────
function EditPhaseBlock({ phase, allPhases, setEditPhases, coaches, category, dragSource, setDragSource }: {
  phase: PhaseConfig;
  allPhases: PhaseConfig[];
  setEditPhases: Dispatch<SetStateAction<PhaseConfig[]>>;
  coaches: { id: string; name: string; emoji: string }[];
  category: string;
  dragSource: DragSource | null;
  setDragSource: Dispatch<SetStateAction<DragSource | null>>;
}) {
  const colors = PHASE_COLORS[phase.type];
  const [showPicker, setShowPicker] = useState(false);
  const [moveExId, setMoveExId] = useState<string | null>(null);
  const [dropOverIdx, setDropOverIdx] = useState<number | null>(null);

  const hasStations = (phase.stations?.length ?? 0) > 0;

  const updatePhase = (updater: (p: PhaseConfig) => PhaseConfig) => {
    setEditPhases(prev => prev.map(p => p.type === phase.type ? updater(p) : p));
  };

  const removeItem = (idx: number) => {
    if (hasStations) {
      updatePhase(p => ({
        ...p,
        stations: p.stations!.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stationNumber: i + 1 })),
      }));
    } else {
      updatePhase(p => ({ ...p, exercises: p.exercises.filter((_, i) => i !== idx) }));
    }
  };

  const addEx = (ex: Exercise) => {
    if (hasStations) {
      updatePhase(p => ({
        ...p,
        stations: [...(p.stations ?? []), {
          id: `s-${Date.now()}`,
          stationNumber: (p.stations?.length ?? 0) + 1,
          exercise: ex,
          durationMinutes: ex.duration.recommended,
          coachAssigned: null,
        } as Station],
      }));
    } else {
      updatePhase(p => ({ ...p, exercises: [...p.exercises, ex] }));
    }
  };

  const moveToPhase = (exId: string, targetType: PhaseType) => {
    const ex = phase.exercises.find(e => e.id === exId);
    if (!ex) return;
    setEditPhases(prev => prev.map(p => {
      if (p.type === phase.type) return { ...p, exercises: p.exercises.filter(e => e.id !== exId) };
      if (p.type === targetType) return { ...p, exercises: [...p.exercises, ex] };
      return p;
    }));
    setMoveExId(null);
  };

  const updateStationCoach = (idx: number, coachId: string | null) => {
    updatePhase(p => ({
      ...p,
      stations: p.stations!.map((s, i) => i === idx ? {
        ...s, coachAssigned: coachId,
        coachName: coachId ? coaches.find(c => c.id === coachId)?.name : undefined,
      } : s),
    }));
  };

  // Drag & drop handlers
  const handleDragStart = (idx: number) => {
    if (!hasStations) setDragSource({ phaseType: phase.type, exIndex: idx });
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDropOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    setDropOverIdx(null);
    if (!dragSource) return;

    const srcPhase = dragSource.phaseType;
    const srcIdx = dragSource.exIndex;

    setEditPhases(prev => {
      const next = prev.map(p => ({ ...p, exercises: [...p.exercises] }));
      const src = next.find(p => p.type === srcPhase);
      const dst = next.find(p => p.type === phase.type);
      if (!src || !dst) return prev;

      const ex = src.exercises[srcIdx];
      if (!ex) return prev;

      // Remove from source
      src.exercises.splice(srcIdx, 1);

      // Insert into destination
      const insertIdx = srcPhase === phase.type && srcIdx < dropIdx ? dropIdx - 1 : dropIdx;
      const safeInsert = Math.max(0, Math.min(insertIdx, dst.exercises.length));
      dst.exercises.splice(safeInsert, 0, ex);

      return next;
    });
    setDragSource(null);
  };

  const handleDropOnPhaseArea = (e: React.DragEvent) => {
    e.preventDefault();
    setDropOverIdx(null);
    if (!dragSource || dragSource.phaseType === phase.type) return;

    const srcPhase = dragSource.phaseType;
    const srcIdx = dragSource.exIndex;

    setEditPhases(prev => {
      const next = prev.map(p => ({ ...p, exercises: [...p.exercises] }));
      const src = next.find(p => p.type === srcPhase);
      const dst = next.find(p => p.type === phase.type);
      if (!src || !dst) return prev;

      const ex = src.exercises[srcIdx];
      if (!ex) return prev;
      src.exercises.splice(srcIdx, 1);
      dst.exercises.push(ex);
      return next;
    });
    setDragSource(null);
  };

  const computedDuration = hasStations
    ? (phase.stations?.reduce((s, st) => s + st.durationMinutes, 0) ?? 0)
    : phase.exercises.reduce((s, e) => s + e.duration.recommended, 0);

  const items: (Exercise | Station)[] = hasStations ? (phase.stations ?? []) : phase.exercises;

  const isDropTarget = dragSource && dragSource.phaseType !== phase.type && !hasStations;

  return (
    <div
      style={{ background: 'var(--surface)', borderRadius: 16, borderLeft: `4px solid ${colors.bar}`, boxShadow: '0 1px 4px rgba(0,0,0,.05)', overflow: 'visible',
        outline: isDropTarget ? `2px dashed ${colors.bar}` : 'none',
      }}
      onDragOver={isDropTarget ? e => { e.preventDefault(); } : undefined}
      onDrop={isDropTarget ? handleDropOnPhaseArea : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
        <span style={{ background: colors.bg, color: colors.text, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: .5 }}>
          {colors.label}
        </span>
        <span style={{ color: colors.text, fontWeight: 700, fontSize: 14 }}>
          ⏱ {computedDuration > 0 ? computedDuration : phase.durationMinutes} min
        </span>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, idx) => {
          const ex: Exercise = hasStations ? (item as Station).exercise : (item as Exercise);
          const station = hasStations ? (item as Station) : null;
          const isDragging = dragSource?.phaseType === phase.type && dragSource.exIndex === idx;
          const isDropOver = dropOverIdx === idx;

          return (
            <div key={`${ex.id}-${idx}`}>
              {/* Drop zone indicator above */}
              {isDropOver && !hasStations && (
                <div style={{ height: 4, borderRadius: 2, background: 'var(--primary)', margin: '2px 0', transition: 'all .1s' }} />
              )}
              <div
                draggable={!hasStations}
                onDragStart={!hasStations ? () => handleDragStart(idx) : undefined}
                onDragEnd={!hasStations ? () => { setDragSource(null); setDropOverIdx(null); } : undefined}
                onDragOver={!hasStations ? (e) => handleDragOver(e, idx) : undefined}
                onDragLeave={!hasStations ? () => setDropOverIdx(null) : undefined}
                onDrop={!hasStations ? (e) => handleDrop(e, idx) : undefined}
                style={{
                  background: isDragging ? 'var(--primary-light)' : 'var(--surface-var)',
                  borderRadius: 12, padding: '10px 12px',
                  opacity: isDragging ? 0.4 : 1,
                  cursor: hasStations ? 'default' : 'grab',
                  transition: 'opacity .15s, background .15s',
                  border: isDragging ? `2px solid var(--primary)` : '2px solid transparent',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {!hasStations && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 16, cursor: 'grab', padding: '0 2px' }} title="Přetáhni">⠿</span>
                  )}
                  {hasStations && (
                    <div style={{ width: 24, height: 24, borderRadius: 12, background: colors.bar, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                      {station!.stationNumber}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{ex.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ex.duration.recommended} min</div>
                  </div>
                  {!hasStations && (
                    <button onClick={() => setMoveExId(ex.id)}
                      style={{ fontSize: 13, padding: '4px 7px', background: 'var(--primary-light)', borderRadius: 6, color: 'var(--primary)' }}
                      title="Přesunout do jiné fáze">⇄</button>
                  )}
                  <button onClick={() => removeItem(idx)}
                    style={{ fontSize: 13, padding: '4px 7px', background: '#FFEAEA', borderRadius: 6, color: '#dc3545' }}>✕</button>
                </div>

                {hasStations && coaches.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <select value={station!.coachAssigned ?? ''}
                      onChange={e => updateStationCoach(idx, e.target.value === '__none__' ? null : e.target.value || null)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text)' }}>
                      <option value="">— nepřiřazeno —</option>
                      <option value="__none__">🔓 Volné stanoviště</option>
                      {coaches.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Warmup coach assignment in edit mode */}
                {phase.type === 'warmup' && !hasStations && coaches.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <select
                      value={phase.exerciseCoachAssignments?.[idx] ?? ''}
                      onChange={e => {
                        const coachId = e.target.value || null;
                        updatePhase(p => ({
                          ...p,
                          exerciseCoachAssignments: {
                            ...(p.exerciseCoachAssignments ?? {}),
                            [idx]: coachId,
                          }
                        }));
                      }}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text)' }}>
                      <option value="">👤 Bez trenéra</option>
                      {coaches.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div style={{
            fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px',
            textAlign: 'center', border: `1.5px dashed ${isDropTarget ? colors.bar : 'var(--border)'}`,
            borderRadius: 10, background: isDropTarget ? colors.bg : 'transparent',
          }}>
            {isDropTarget ? `Pustit sem → ${colors.label}` : 'Žádná cvičení'}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px 16px' }}>
        <button onClick={() => setShowPicker(true)} style={{
          width: '100%', padding: '10px', borderRadius: 12, border: `1.5px dashed ${colors.bar}`,
          background: colors.bg, color: colors.text, fontWeight: 600, fontSize: 13,
        }}>+ Přidat cvičení</button>
      </div>

      {showPicker && (
        <ExercisePicker forPhase={phase.type} category={category} onSelect={addEx} onClose={() => setShowPicker(false)} />
      )}

      {moveExId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setMoveExId(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 20, padding: 24, maxWidth: 320, width: '100%' }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Přesunout do fáze</h3>
            {(['warmup', 'main', 'cooldown'] as PhaseType[])
              .filter(pt => pt !== phase.type && allPhases.some(p => p.type === pt))
              .map(pt => (
                <button key={pt} onClick={() => moveToPhase(moveExId, pt)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', background: PHASE_COLORS[pt].bg, borderRadius: 12, width: '100%', color: PHASE_COLORS[pt].text, fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: PHASE_COLORS[pt].bar }} />
                  {PHASE_COLORS[pt].label}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── View phase block ─────────────────────────────────────────────────────────
function ExerciseRow({ ex, onClick, numberOfPlayers }: { ex: Exercise; onClick: () => void; numberOfPlayers?: number }) {
  const playerWarning = numberOfPlayers !== undefined && (
    numberOfPlayers < ex.players.min ||
    (ex.players.max !== 'unlimited' && numberOfPlayers > ex.players.max)
  );
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px',
      background: playerWarning ? '#FFFBEA' : 'var(--surface-var)',
      borderRadius: 12, textAlign: 'left', width: '100%', color: 'var(--text)',
      border: playerWarning ? '1.5px solid #F59E0B' : 'none',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          {ex.name}
          {playerWarning && <span title={`Cvičení je pro ${ex.players.min}–${ex.players.max === 'unlimited' ? '∞' : ex.players.max} hráčů`} style={{ fontSize: 14 }}>⚠️</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {ex.duration.recommended} min
          {ex.equipment.length > 0 && ` • ${ex.equipment.slice(0, 2).join(', ')}`}
          {playerWarning && (
            <span style={{ color: '#92400E', fontWeight: 600, marginLeft: 6 }}>
              (vhodné pro {ex.players.min}–{ex.players.max === 'unlimited' ? '∞' : ex.players.max} hráčů)
            </span>
          )}
        </div>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</span>
    </button>
  );
}

function PhaseBlock({ phase, onExerciseClick, numberOfPlayers, coachNames }: {
  phase: PhaseConfig;
  onExerciseClick: (ex: Exercise) => void;
  numberOfPlayers?: number;
  coachNames?: Record<string, string>;
}) {
  const [open, setOpen] = useState(true);
  const colors = PHASE_COLORS[phase.type];
  const hasStations = (phase.stations?.length ?? 0) > 0;
  const exercises = hasStations ? phase.stations!.map(s => s.exercise) : phase.exercises;

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, borderLeft: `4px solid ${colors.bar}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px',
        width: '100%', background: 'none', color: 'var(--text)',
      }}>
        <span style={{ background: colors.bg, color: colors.text, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: .5 }}>
          {colors.label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: colors.text, fontWeight: 700, fontSize: 14 }}>⏱ {phase.durationMinutes} min</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>{open ? '∧' : '∨'}</span>
        </div>
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hasStations ? (
            phase.stations!.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: colors.bar, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 6 }}>
                  {s.stationNumber}
                </div>
                <div style={{ flex: 1 }}>
                  <ExerciseRow ex={s.exercise} onClick={() => onExerciseClick(s.exercise)} numberOfPlayers={numberOfPlayers} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingLeft: 4, flexWrap: 'wrap' }}>
                    {s.coachAssigned === null ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#856404', background: '#FFF3CD', padding: '2px 8px', borderRadius: 6 }}>🔓 Volné stanoviště</span>
                    ) : s.coachName ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: colors.text }}>👤 {s.coachName}</span>
                    ) : null}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>• {s.durationMinutes} min</span>
                  </div>
                </div>
              </div>
            ))
          ) : exercises.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Žádná cvičení</p>
          ) : (
            exercises.map((ex, idx) => (
              <div key={ex.id}>
                {/* Show warmup coach assignment if available */}
                {phase.type === 'warmup' && phase.exerciseCoachAssignments && phase.exerciseCoachAssignments[idx] != null && coachNames && (
                  <div style={{ fontSize: 11, color: 'var(--warmup-text)', fontWeight: 700, padding: '0 2px 3px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>👤</span>
                    <span>{coachNames[phase.exerciseCoachAssignments[idx]!] ?? 'Trenér'}</span>
                  </div>
                )}
                <ExerciseRow ex={ex} onClick={() => onExerciseClick(ex)} numberOfPlayers={numberOfPlayers} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function TrainingDetailPage({ training, navigate }: Props) {
  const [saved, setSaved] = useState(training.isSaved);
  const [selectedEx, setSelectedEx] = useState<Exercise | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPhases, setEditPhases] = useState<PhaseConfig[]>([]);
  const [previewPlayers, setPreviewPlayers] = useState<number | undefined>(training.input.numberOfPlayers);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);

  const saveTraining = useTrainingsStore(s => s.saveTraining);
  const updateTraining = useTrainingsStore(s => s.updateTraining);
  const { savedCoaches } = useCoachesStore();
  const cfg = CATEGORY_CONFIGS[training.input.category];

  // Build coachNames map for warmup assignments
  const coachNamesMap: Record<string, string> = {};
  for (const c of savedCoaches) coachNamesMap[c.id] = c.name;

  const handleSave = () => { saveTraining(training); setSaved(true); };

  const enterEditMode = () => {
    setEditPhases(JSON.parse(JSON.stringify(training.phases)) as PhaseConfig[]);
    setEditMode(true);
  };

  const saveEdits = () => {
    const updatedPhases: PhaseConfig[] = editPhases.map(p => {
      const dur = (p.stations?.length ?? 0) > 0
        ? p.stations!.reduce((s, st) => s + st.durationMinutes, 0)
        : p.exercises.reduce((s, e) => s + e.duration.recommended, 0);
      return { ...p, durationMinutes: dur > 0 ? dur : p.durationMinutes };
    });
    const totalDuration = updatedPhases.reduce((s, p) => s + p.durationMinutes, 0);
    updateTraining(training.id, {
      phases: updatedPhases,
      totalDuration: totalDuration > 0 ? totalDuration : training.totalDuration,
      isSaved: true,
      updatedAt: new Date().toISOString(),
    });
    setSaved(true);
    setEditMode(false);
  };

  const uLabelText = training.input.selectedULabel ? `${training.input.selectedULabel} – ` : '';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'var(--bg)' }}>
        <button onClick={() => navigate({ name: 'home' })} style={{ background: 'none', fontSize: 22, padding: 4, color: 'var(--text)' }}>←</button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{editMode ? '✏️ Úprava' : 'Trénink'}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!editMode && <>
            <button onClick={enterEditMode} style={{ background: 'none', fontSize: 20 }} title="Upravit trénink">✏️</button>
            <button onClick={() => setShowShare(true)} style={{ background: 'none', fontSize: 20 }}>📤</button>
            {!saved
              ? <button onClick={handleSave} style={{ background: 'none', fontSize: 22, color: 'var(--primary)' }}>🔖</button>
              : <span style={{ fontSize: 20 }}>✅</span>
            }
          </>}
          {editMode && (
            <button onClick={() => setEditMode(false)} style={{ background: 'none', fontSize: 20, color: 'var(--text-muted)' }}>✕</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', paddingBottom: 40 }}>
        {/* Info card */}
        <div style={{
          background: 'var(--surface)', borderRadius: 20, borderLeft: `5px solid ${cfg.color}`,
          padding: '18px', marginBottom: 20, boxShadow: '0 1px 6px rgba(0,0,0,.06)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ background: cfg.lightColor, color: cfg.color, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: .5 }}>
              {uLabelText}{cfg.label} • {cfg.ageRange}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>⏱ {formatMinutes(training.totalDuration)}</span>
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>{training.title}</h1>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>🔲 {training.input.numberOfCoaches} {training.input.numberOfCoaches === 1 ? 'stanoviště' : 'stanoviště'}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>🎯 {training.input.skillFocus.map(sf => SKILL_FOCUS_CONFIGS[sf]?.label ?? sf).join(', ')}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📅 {formatDate(training.createdAt)}</span>
          </div>
          {/* Player count control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>
              👥 Počet hráčů: <strong style={{ color: 'var(--text)' }}>{previewPlayers ?? '—'}</strong>
              {previewPlayers && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>(varování u nevhodných cvičení)</span>}
            </span>
            <button onClick={() => setPreviewPlayers(n => Math.max(4, (n ?? 12) - 1))}
              style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 16 }}>−</button>
            <button onClick={() => setPreviewPlayers(n => Math.min(30, (n ?? 12) + 1))}
              style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 16 }}>+</button>
            {previewPlayers && (
              <button onClick={() => setPreviewPlayers(undefined)}
                style={{ fontSize: 12, padding: '3px 8px', borderRadius: 8, background: 'var(--surface-var)', color: 'var(--text-muted)' }}>✕</button>
            )}
          </div>
        </div>

        {/* Phase blocks */}
        <h2 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
          {editMode ? '✏️ Upravit fáze' : 'Průběh tréninku'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {editMode
            ? editPhases.map(phase => (
              <EditPhaseBlock
                key={phase.type}
                phase={phase}
                allPhases={editPhases}
                setEditPhases={setEditPhases}
                coaches={savedCoaches}
                category={training.input.category}
                dragSource={dragSource}
                setDragSource={setDragSource}
              />
            ))
            : training.phases.map(phase => (
              <PhaseBlock
                key={phase.type}
                phase={phase}
                onExerciseClick={setSelectedEx}
                numberOfPlayers={previewPlayers}
                coachNames={coachNamesMap}
              />
            ))
          }
        </div>
      </div>

      {/* Footer */}
      {editMode ? (
        <div style={{ padding: '16px 20px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 10 }}>
          <button onClick={() => setEditMode(false)} style={{ flex: 1, padding: '14px', borderRadius: 14, background: 'var(--surface)', fontWeight: 600, fontSize: 15 }}>Zrušit</button>
          <button onClick={saveEdits} style={{ flex: 2, padding: '14px', borderRadius: 14, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15 }}>💾 Uložit úpravy</button>
        </div>
      ) : !saved ? (
        <div style={{ padding: '16px 20px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <button onClick={handleSave} style={{ width: '100%', padding: '15px', borderRadius: 16, fontWeight: 700, fontSize: 16, background: 'var(--primary)', color: '#fff' }}>
            🔖 Uložit trénink
          </button>
        </div>
      ) : null}

      {selectedEx && <ExerciseModal ex={selectedEx} onClose={() => setSelectedEx(null)} />}
      {showShare && <ShareModal training={training} onClose={() => setShowShare(false)} />}
    </div>
  );
}
