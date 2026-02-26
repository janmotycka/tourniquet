import { useState, useMemo } from 'react';
import type { Page } from '../App';
import { ALL_EXERCISES } from '../data/exercises/index';
import { useExercisesStore } from '../store/exercises.store';
import {
  CATEGORY_GROUP_LIST,
  SUB_CATEGORY_CONFIGS,
} from '../data/categories.data';
import { SKILL_FOCUS_BY_SUBCATEGORY, SKILL_FOCUS_BY_CATEGORY, SKILL_FOCUS_CONFIGS } from '../data/skill-focus.data';
import { buildManualTraining } from '../engine/manual-builder';
import type { AgeCategory, SubCategory, CategoryGroup } from '../types/category.types';
import type { Exercise, PhaseType, SkillFocus } from '../types/exercise.types';
import type { GeneratorInput } from '../types/training.types';
import { useI18n } from '../i18n';

interface Props { navigate: (p: Page) => void; }

const PHASE_TABS: { type: PhaseType; labelKey: string; icon: string; color: string; bg: string; bar: string }[] = [
  { type: 'warmup', labelKey: 'phase.warmup', icon: '🟠', color: 'var(--warmup-text)', bg: 'var(--warmup-light)', bar: 'var(--warmup)' },
  { type: 'main', labelKey: 'phase.main', icon: '🔵', color: 'var(--main-ph-text)', bg: 'var(--main-ph-light)', bar: 'var(--main-ph)' },
  { type: 'cooldown', labelKey: 'phase.cooldown', icon: '🟢', color: 'var(--cooldown-text)', bg: 'var(--cooldown-light)', bar: 'var(--cooldown)' },
  { type: 'stretching', labelKey: 'phase.stretching', icon: '🩷', color: '#C2185B', bg: '#FCE4EC', bar: '#E91E63' },
];

// ─── Exercise Picker ──────────────────────────────────────────────────────────
function ExercisePicker({ forPhase, category, onSelect, onClose }: {
  forPhase: PhaseType; category: AgeCategory; onSelect: (ex: Exercise) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const { customExercises } = useExercisesStore();
  const [search, setSearch] = useState('');

  const pool = useMemo(() =>
    [...ALL_EXERCISES, ...customExercises].filter(ex =>
      ex.phaseType === forPhase && ex.suitableFor.includes(category)
    ), [forPhase, category, customExercises]);

  const filtered = search
    ? pool.filter(ex => ex.name.toLowerCase().includes(search.toLowerCase()))
    : pool;

  const tab = PHASE_TABS.find(p => p.type === forPhase)!;

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
          <span style={{ background: tab.bg, color: tab.color, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 8, textTransform: 'uppercase' }}>{t(tab.labelKey)}</span>
          <h3 style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>{t('manual.addExercise')}</h3>
          <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: '0 20px 10px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`🔍 ${t('common.search')}`}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0
            ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>{t('exercises.noExercisesForCategory')}</p>
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
  const { t } = useI18n();
  const [builderStep, setBuilderStep] = useState<'setup' | 'build'>('setup');

  // Setup state
  const [subCategory, setSubCategory] = useState<SubCategory | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<CategoryGroup | null>(null);
  const [totalDuration, setTotalDuration] = useState<number>(90);
  const [skillFocus, setSkillFocus] = useState<SkillFocus[]>([]);

  // Derived
  const subCatCfg = subCategory ? SUB_CATEGORY_CONFIGS[subCategory] : null;
  const exerciseCategory: AgeCategory | null = subCatCfg?.exerciseCategory ?? null;

  // Build state
  const [activePhase, setActivePhase] = useState<PhaseType>('warmup');
  const [exercisesByPhase, setExercisesByPhase] = useState<Partial<Record<PhaseType, Exercise[]>>>({
    warmup: [], main: [], cooldown: [], stretching: [],
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
    if (!exerciseCategory) return;
    const input: GeneratorInput = {
      category: exerciseCategory,
      subCategory: subCategory ?? undefined,
      totalDuration,
      skillFocus,
      numberOfCoaches: 1,
      phaseStructure: '3-phase',
    };
    const unit = buildManualTraining(input, exercisesByPhase, t);
    navigate({ name: 'training', training: unit });
  };

  const canProceedSetup = !!subCategory;
  const hasAnyExercises = Object.values(exercisesByPhase).some(arr => (arr?.length ?? 0) > 0);

  // Available skill focuses
  const availableSkillFocus = subCategory
    ? SKILL_FOCUS_BY_SUBCATEGORY[subCategory]
    : exerciseCategory
    ? SKILL_FOCUS_BY_CATEGORY[exerciseCategory]
    : [];

  // ── SETUP STEP ──────────────────────────────────────────────────────────────
  if (builderStep === 'setup') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px' }}>
          <button onClick={() => navigate({ name: 'home' })} style={{ background: 'none', fontSize: 22, padding: 4, color: 'var(--text)' }}>←</button>
          <h1 style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>{t('manual.title')}</h1>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Category groups */}
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{t('manual.category')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATEGORY_GROUP_LIST.map(group => {
                const isExpanded = expandedGroup === group.id;
                const subCats = group.subcategories.map(id => SUB_CATEGORY_CONFIGS[id]);
                return (
                  <div key={group.id}>
                    <button onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                        borderRadius: isExpanded ? '14px 14px 0 0' : 14,
                        border: `2px solid ${subCats.some(sc => sc.id === subCategory) ? group.color : 'var(--border)'}`,
                        background: subCats.some(sc => sc.id === subCategory) ? group.color + '15' : 'var(--surface)',
                        textAlign: 'left', width: '100%', color: 'var(--text)', transition: 'all .15s',
                      }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: group.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: '#fff' }}>
                        {group.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{t(group.label)}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subCats.map(sc => t(sc.label)).join(' · ')}</div>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{isExpanded ? '∧' : '∨'}</span>
                    </button>
                    {isExpanded && (
                      <div style={{ background: group.color + '10', border: `2px solid ${group.color}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {subCats.map(sc => {
                          const sel = subCategory === sc.id;
                          return (
                            <button key={sc.id} onClick={() => { setSubCategory(sc.id); setExpandedGroup(null); setTotalDuration(sc.recommendedDuration); setSkillFocus([]); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12,
                                border: `2px solid ${sel ? sc.color : sc.color + '40'}`,
                                background: sel ? sc.color + '20' : '#fff',
                                textAlign: 'left', width: '100%',
                              }}>
                              <span style={{ fontSize: 18 }}>{sc.icon}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 14, color: sel ? sc.color : 'var(--text)' }}>{t(sc.label)}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t(sc.ageRange)}</div>
                              </div>
                              {sel && <span style={{ color: sc.color, fontWeight: 800 }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Duration slider */}
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{t('manual.duration')}</h2>
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--primary)' }}>{totalDuration}</span>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('common.minutes')}</span>
              </div>
              <input type="range" min={30} max={120} step={5} value={totalDuration}
                onChange={(e) => setTotalDuration(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>30</span>
                <span>120</span>
              </div>
            </div>
          </div>

          {/* Skill focus */}
          {subCategory && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{t('manual.focus')} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>({t('generator.optional')})</span></h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {availableSkillFocus.map(skill => {
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
                      }}>{t(cfg2.label)}</button>
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
          }}>{t('manual.buildTraining')}</button>
        </div>
      </div>
    );
  }

  // ── BUILD STEP ───────────────────────────────────────────────────────────────
  const activePhaseDef = PHASE_TABS.find(p => p.type === activePhase)!;
  const activeExercises = exercisesByPhase[activePhase] ?? [];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px' }}>
        <button onClick={() => setBuilderStep('setup')} style={{ background: 'none', fontSize: 22, padding: 4, color: 'var(--text)' }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: 18, flex: 1 }}>
          {subCatCfg ? t(subCatCfg.label) : ''}
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
      <div style={{ display: 'flex', padding: '12px 20px 0', gap: 6, overflowX: 'auto' }}>
        {PHASE_TABS.map(tab => {
          const count = (exercisesByPhase[tab.type] ?? []).length;
          const mins = (exercisesByPhase[tab.type] ?? []).reduce((s, e) => s + e.duration.recommended, 0);
          const active = activePhase === tab.type;
          return (
            <button key={tab.type} onClick={() => setActivePhase(tab.type)}
              style={{
                flex: 1, padding: '10px 6px', borderRadius: 12, fontWeight: 700, fontSize: 11,
                border: `2px solid ${active ? tab.bar : 'var(--border)'}`,
                background: active ? tab.bg : 'var(--surface)',
                color: active ? tab.color : 'var(--text)',
                minWidth: 0, whiteSpace: 'nowrap',
              }}>
              <div>{tab.icon} {t(tab.labelKey)}</div>
              <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, color: active ? tab.color : 'var(--text-muted)' }}>
                {count} {t('manual.exerciseAbbr')} · {mins} min
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
            <div style={{ fontSize: 14 }}>{t('manual.noExercisesInPhase')} „{t(activePhaseDef.labelKey)}"</div>
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
          padding: '12px', borderRadius: 12, border: `1.5px dashed ${activePhaseDef.bar}`,
          background: activePhaseDef.bg, color: activePhaseDef.color, fontWeight: 600, fontSize: 13,
          marginTop: 4,
        }}>{t('manual.addToPhase', { phase: t(activePhaseDef.labelKey).toLowerCase() })}</button>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 20px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
        <button onClick={handleGenerate} disabled={!hasAnyExercises} style={{
          width: '100%', padding: '15px', borderRadius: 16, fontWeight: 700, fontSize: 16,
          background: hasAnyExercises ? 'var(--primary)' : 'var(--border)',
          color: hasAnyExercises ? '#fff' : 'var(--text-disabled)',
        }}>{t('manual.createTraining')}</button>
      </div>

      {/* Exercise picker */}
      {showPicker && exerciseCategory && (
        <ExercisePicker
          forPhase={activePhase}
          category={exerciseCategory}
          onSelect={ex => { addEx(ex); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
