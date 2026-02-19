import { useState, useMemo } from 'react';
import type { Page } from '../App';
import { ALL_EXERCISES } from '../data/exercises/index';
import { useExercisesStore } from '../store/exercises.store';
import { CATEGORY_LIST, CATEGORY_CONFIGS, U_LABELS_BY_CATEGORY } from '../data/categories.data';
import { SKILL_FOCUS_BY_CATEGORY, SKILL_FOCUS_CONFIGS } from '../data/skill-focus.data';
import { buildManualTraining } from '../engine/manual-builder';
import type { AgeCategory, TrainingDuration, ULabel } from '../types/category.types';
import type { Exercise, PhaseType, SkillFocus } from '../types/exercise.types';
import type { GeneratorInput } from '../types/training.types';

interface Props { navigate: (p: Page) => void; }

const DURATIONS: TrainingDuration[] = [60, 75, 90, 105, 120];

const PHASE_TABS: { type: PhaseType; label: string; icon: string; color: string; bg: string }[] = [
  { type: 'warmup', label: 'Rozcvičení', icon: '🟠', color: 'var(--warmup-text)', bg: 'var(--warmup-light)' },
  { type: 'main', label: 'Hlavní část', icon: '🔵', color: 'var(--main-ph-text)', bg: 'var(--main-ph-light)' },
  { type: 'cooldown', label: 'Závěr', icon: '🟢', color: 'var(--cooldown-text)', bg: 'var(--cooldown-light)' },
];
const PHASE_BAR: Record<PhaseType, string> = {
  warmup: 'var(--warmup)',
  main: 'var(--main-ph)',
  cooldown: 'var(--cooldown)',
};

// ─── Exercise Picker ──────────────────────────────────────────────────────────
function ExercisePicker({ forPhase, category, onSelect, onClose }: {
  forPhase: PhaseType; category: AgeCategory; onSelect: (ex: Exercise) => void; onClose: () => void;
}) {
  const { customExercises } = useExercisesStore();
  const [search, setSearch] = useState('');

  const pool = useMemo(() =>
    [...ALL_EXERCISES, ...customExercises].filter(ex =>
      ex.phaseType === forPhase && ex.suitableFor.includes(category)
    ), [forPhase, category, customExercises]);

  const filtered = search
    ? pool.filter(ex => ex.name.toLowerCase().includes(search.toLowerCase()))
    : pool;

  const tab = PHASE_TABS.find(t => t.type === forPhase)!;

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
          <span style={{ background: tab.bg, color: tab.color, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 8, textTransform: 'uppercase' }}>{tab.label}</span>
          <h3 style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>Přidat cvičení</h3>
          <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: '0 20px 10px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Hledat..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0
            ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Žádná cvičení pro tuto kategorii</p>
            : filtered.map(ex => (
              <button key={ex.id} onClick={() => { onSelect(ex); }}
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

// ─── Main page ────────────────────────────────────────────────────────────────
export function ManualBuilderPage({ navigate }: Props) {
  const [builderStep, setBuilderStep] = useState<'setup' | 'build'>('setup');

  // Setup state
  const [category, setCategory] = useState<AgeCategory | null>(null);
  const [selectedULabel, setSelectedULabel] = useState<ULabel | null>(null);
  const [expandedCat, setExpandedCat] = useState<AgeCategory | null>(null);
  const [totalDuration, setTotalDuration] = useState<TrainingDuration>(90);
  const [skillFocus, setSkillFocus] = useState<SkillFocus[]>([]);

  // Build state
  const [activePhase, setActivePhase] = useState<PhaseType>('warmup');
  const [exercisesByPhase, setExercisesByPhase] = useState<Partial<Record<PhaseType, Exercise[]>>>({
    warmup: [], main: [], cooldown: [],
  });
  const [showPicker, setShowPicker] = useState(false);

  const totalExMinutes = Object.values(exercisesByPhase).flat().reduce((s, e) => s + e.duration.recommended, 0);

  const removeEx = (phase: PhaseType, idx: number) => {
    setExercisesByPhase(prev => ({
      ...prev,
      [phase]: (prev[phase] ?? []).filter((_, i) => i !== idx),
    }));
  };

  const moveEx = (phase: PhaseType, idx: number, dir: -1 | 1) => {
    setExercisesByPhase(prev => {
      const arr = [...(prev[phase] ?? [])];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return prev;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...prev, [phase]: arr };
    });
  };

  const addEx = (ex: Exercise) => {
    setExercisesByPhase(prev => ({
      ...prev,
      [activePhase]: [...(prev[activePhase] ?? []), ex],
    }));
  };

  const handleGenerate = () => {
    if (!category) return;
    const input: GeneratorInput = {
      category,
      selectedULabel: selectedULabel ?? undefined,
      totalDuration,
      skillFocus,
      numberOfCoaches: 1,
      phaseStructure: '3-phase',
    };
    const unit = buildManualTraining(input, exercisesByPhase);
    navigate({ name: 'training', training: unit });
  };

  const canProceedSetup = !!category;
  const hasAnyExercises = Object.values(exercisesByPhase).some(arr => (arr?.length ?? 0) > 0);

  // ── SETUP STEP ──────────────────────────────────────────────────────────────
  if (builderStep === 'setup') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px' }}>
          <button onClick={() => navigate({ name: 'home' })} style={{ background: 'none', fontSize: 22, padding: 4, color: 'var(--text)' }}>←</button>
          <h1 style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>Sestavit ručně</h1>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Category */}
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>Kategorie</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATEGORY_LIST.map(cfg => {
                const isExpanded = expandedCat === cfg.id;
                const uLabels = U_LABELS_BY_CATEGORY[cfg.id];
                return (
                  <div key={cfg.id}>
                    <button onClick={() => setExpandedCat(isExpanded ? null : cfg.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                        borderRadius: isExpanded ? '14px 14px 0 0' : 14,
                        border: `2px solid ${category === cfg.id ? cfg.color : 'var(--border)'}`,
                        background: category === cfg.id ? cfg.lightColor : 'var(--surface)',
                        textAlign: 'left', width: '100%', color: 'var(--text)', transition: 'all .15s',
                      }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        {cfg.id === 'pripravka' ? '😊' : cfg.id === 'mladsi-zaci' ? '⚽' : cfg.id === 'starsi-zaci' ? '🏆' : '🥇'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{cfg.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cfg.ageRange}</div>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{isExpanded ? '∧' : '∨'}</span>
                    </button>
                    {isExpanded && (
                      <div style={{ background: 'var(--surface)', border: `2px solid ${cfg.color}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '12px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {uLabels.map(ul => (
                            <button key={ul} onClick={() => { setCategory(cfg.id); setSelectedULabel(ul); setExpandedCat(null); }}
                              style={{
                                padding: '8px 14px', borderRadius: 12, fontWeight: 700, fontSize: 13,
                                border: `2px solid ${selectedULabel === ul && category === cfg.id ? cfg.color : 'var(--border)'}`,
                                background: selectedULabel === ul && category === cfg.id ? cfg.lightColor : 'var(--surface-var)',
                                color: selectedULabel === ul && category === cfg.id ? cfg.color : 'var(--text)',
                              }}>{ul}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>Délka tréninku</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {DURATIONS.map(d => (
                <button key={d} onClick={() => setTotalDuration(d)}
                  style={{
                    flex: 1, padding: '12px 4px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                    border: `2px solid ${totalDuration === d ? 'var(--primary)' : 'var(--border)'}`,
                    background: totalDuration === d ? 'var(--primary)' : 'var(--surface)',
                    color: totalDuration === d ? '#fff' : 'var(--text)',
                  }}>
                  {d}
                  {d === 90 && <div style={{ fontSize: 9, opacity: .8 }}>★</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Skill focus */}
          {category && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Zaměření <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>(nepovinné)</span></h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {SKILL_FOCUS_BY_CATEGORY[category].map(skill => {
                  const cfg2 = SKILL_FOCUS_CONFIGS[skill as SkillFocus];
                  const sel = skillFocus.includes(skill as SkillFocus);
                  return (
                    <button key={skill}
                      onClick={() => setSkillFocus(prev =>
                        prev.includes(skill as SkillFocus)
                          ? prev.filter(s => s !== skill)
                          : [...prev, skill as SkillFocus]
                      )}
                      style={{
                        padding: '8px 14px', borderRadius: 20, fontWeight: 600, fontSize: 13,
                        border: `2px solid ${sel ? 'var(--primary)' : 'var(--primary)'}`,
                        background: sel ? 'var(--primary)' : 'var(--surface)',
                        color: sel ? '#fff' : 'var(--primary)',
                      }}>{cfg2.label}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <button onClick={() => setBuilderStep('build')} disabled={!canProceedSetup} style={{
            width: '100%', padding: '15px', borderRadius: 16, fontWeight: 700, fontSize: 16,
            background: canProceedSetup ? 'var(--primary)' : 'var(--border)',
            color: canProceedSetup ? '#fff' : 'var(--text-disabled)',
          }}>Sestavit trénink →</button>
        </div>
      </div>
    );
  }

  // ── BUILD STEP ───────────────────────────────────────────────────────────────
  const activePhaseDef = PHASE_TABS.find(t => t.type === activePhase)!;
  const activeExercises = exercisesByPhase[activePhase] ?? [];
  const catCfg = category ? CATEGORY_CONFIGS[category] : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px' }}>
        <button onClick={() => setBuilderStep('setup')} style={{ background: 'none', fontSize: 22, padding: 4, color: 'var(--text)' }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: 18, flex: 1 }}>
          {selectedULabel ? `${selectedULabel} ` : ''}{catCfg?.label ?? ''}
        </h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{totalExMinutes}/{totalDuration} min</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: 'var(--border)', margin: '0 20px 0' }}>
        <div style={{
          height: '100%', background: totalExMinutes > totalDuration ? '#dc3545' : 'var(--primary)',
          width: `${Math.min(100, totalExMinutes / totalDuration * 100)}%`,
          borderRadius: 3, transition: 'width .3s',
        }} />
      </div>

      {/* Phase tabs */}
      <div style={{ display: 'flex', padding: '12px 20px 0', gap: 8 }}>
        {PHASE_TABS.map(tab => {
          const count = (exercisesByPhase[tab.type] ?? []).length;
          const mins = (exercisesByPhase[tab.type] ?? []).reduce((s, e) => s + e.duration.recommended, 0);
          const active = activePhase === tab.type;
          return (
            <button key={tab.type} onClick={() => setActivePhase(tab.type)}
              style={{
                flex: 1, padding: '10px 6px', borderRadius: 12, fontWeight: 700, fontSize: 12,
                border: `2px solid ${active ? PHASE_BAR[tab.type] : 'var(--border)'}`,
                background: active ? tab.bg : 'var(--surface)',
                color: active ? tab.color : 'var(--text)',
              }}>
              <div>{tab.icon} {tab.label}</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, color: active ? tab.color : 'var(--text-muted)' }}>
                {count} cv. · {mins} min
              </div>
            </button>
          );
        })}
      </div>

      {/* Exercise list for active phase */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {activeExercises.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>{activePhaseDef.icon}</div>
            <div style={{ fontSize: 14 }}>Zatím žádná cvičení ve fázi „{activePhaseDef.label}"</div>
          </div>
        ) : (
          activeExercises.map((ex, idx) => (
            <div key={`${ex.id}-${idx}`} style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button onClick={() => moveEx(activePhase, idx, -1)} disabled={idx === 0}
                  style={{ fontSize: 11, padding: '1px 5px', background: 'none', color: idx === 0 ? 'var(--border)' : 'var(--text-muted)', lineHeight: 1 }}>▲</button>
                <button onClick={() => moveEx(activePhase, idx, 1)} disabled={idx === activeExercises.length - 1}
                  style={{ fontSize: 11, padding: '1px 5px', background: 'none', color: idx === activeExercises.length - 1 ? 'var(--border)' : 'var(--text-muted)', lineHeight: 1 }}>▼</button>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{ex.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ex.duration.recommended} min</div>
              </div>
              <button onClick={() => removeEx(activePhase, idx)}
                style={{ fontSize: 14, padding: '5px 8px', background: '#FFEAEA', borderRadius: 8, color: '#dc3545' }}>✕</button>
            </div>
          ))
        )}

        {/* Add button */}
        <button onClick={() => setShowPicker(true)} style={{
          padding: '12px', borderRadius: 12, border: `1.5px dashed ${PHASE_BAR[activePhase]}`,
          background: activePhaseDef.bg, color: activePhaseDef.color, fontWeight: 600, fontSize: 13,
          marginTop: 4,
        }}>+ Přidat cvičení do {activePhaseDef.label.toLowerCase()}</button>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 20px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
        <button onClick={handleGenerate} disabled={!hasAnyExercises} style={{
          width: '100%', padding: '15px', borderRadius: 16, fontWeight: 700, fontSize: 16,
          background: hasAnyExercises ? 'var(--primary)' : 'var(--border)',
          color: hasAnyExercises ? '#fff' : 'var(--text-disabled)',
        }}>✓ Vytvořit trénink</button>
      </div>

      {/* Exercise picker */}
      {showPicker && category && (
        <ExercisePicker
          forPhase={activePhase}
          category={category}
          onSelect={ex => { addEx(ex); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
