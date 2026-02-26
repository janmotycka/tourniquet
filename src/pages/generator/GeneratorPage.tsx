import React, { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useGeneratorStore } from '../../store/generator.store';
import { useCoachesStore } from '../../store/coaches.store';
import { useExercisesStore } from '../../store/exercises.store';
import {
  CATEGORY_CONFIGS,
  CATEGORY_GROUP_LIST,
  SUB_CATEGORY_CONFIGS,
} from '../../data/categories.data';
import { SKILL_FOCUS_BY_SUBCATEGORY, SKILL_FOCUS_BY_CATEGORY, SKILL_FOCUS_CONFIGS } from '../../data/skill-focus.data';
import { calculatePhaseDurations, getPhaseLabel } from '../../engine/phase-splitter';
import { generateTrainingUnit } from '../../engine/generator';
import { useI18n } from '../../i18n';
import type { PhaseStructure, CategoryGroup } from '../../types/category.types';
import type { SkillFocus, PhaseType } from '../../types/exercise.types';
import type { GeneratorInput } from '../../types/training.types';

const TOTAL_STEPS = 5;

const PHASE_COLORS: Record<PhaseType, { bg: string; text: string; bar: string }> = {
  warmup: { bg: 'var(--warmup-light)', text: 'var(--warmup-text)', bar: 'var(--warmup)' },
  main: { bg: 'var(--main-ph-light)', text: 'var(--main-ph-text)', bar: 'var(--main-ph)' },
  cooldown: { bg: 'var(--cooldown-light)', text: 'var(--cooldown-text)', bar: 'var(--cooldown)' },
  stretching: { bg: '#FCE4EC', text: '#C2185B', bar: '#E91E63' },
};

// ─── DraggablePhaseBar ─────────────────────────────────────────────────────────
function DraggablePhaseBar({
  totalDuration,
  warmup,
  cooldown,
  stretching,
  phaseStructure,
  onWarmupChange,
  onCooldownChange,
  onStretchingChange,
}: {
  totalDuration: number;
  warmup: number;
  cooldown: number;
  stretching: number;
  phaseStructure: PhaseStructure;
  onWarmupChange: (v: number) => void;
  onCooldownChange: (v: number) => void;
  onStretchingChange: (v: number) => void;
}) {
  const { t } = useI18n();
  const barRef = React.useRef<HTMLDivElement>(null);
  const hasCooldown = phaseStructure === '3-phase' || phaseStructure === '4-phase';
  const hasStretching = phaseStructure === '4-phase';
  const main = totalDuration - warmup - (hasCooldown ? cooldown : 0) - (hasStretching ? stretching : 0);

  const getBarWidth = () => barRef.current?.getBoundingClientRect().width ?? 1;
  const snapTo5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

  const startDrag = (handle: 'warmup' | 'cooldown' | 'stretching', e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const barW = getBarWidth();
    const startWarmup = warmup;
    const startCooldown = cooldown;
    const startStretching = stretching;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const deltaMin = (dx / barW) * totalDuration;
      if (handle === 'warmup') {
        onWarmupChange(snapTo5(startWarmup + deltaMin));
      } else if (handle === 'cooldown') {
        if (hasStretching) {
          // cooldown handle between cooldown and stretching
          onCooldownChange(snapTo5(startCooldown + deltaMin));
        } else {
          onCooldownChange(snapTo5(startCooldown - deltaMin));
        }
      } else {
        onStretchingChange(snapTo5(startStretching - deltaMin));
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const warmupPct = (warmup / totalDuration) * 100;
  const mainPct = (main / totalDuration) * 100;
  const cooldownPct = hasCooldown ? (cooldown / totalDuration) * 100 : 0;
  const stretchingPct = hasStretching ? (stretching / totalDuration) * 100 : 0;

  const HANDLE_W = 20;

  // Compute phase list for legend
  const legendItems = [
    { label: t('phase.warmup'), min: warmup, color: PHASE_COLORS.warmup },
    { label: t('phase.main'), min: main, color: PHASE_COLORS.main },
    ...(hasCooldown ? [{ label: t('phase.cooldown'), min: cooldown, color: PHASE_COLORS.cooldown }] : []),
    ...(hasStretching ? [{ label: t('phase.stretching'), min: stretching, color: PHASE_COLORS.stretching }] : []),
  ];

  return (
    <div>
      {/* Draggable bar */}
      <div ref={barRef} style={{ position: 'relative', height: 44, display: 'flex', borderRadius: 10, overflow: 'visible', userSelect: 'none', touchAction: 'none', gap: 0 }}>
        {/* Warmup segment */}
        <div style={{
          width: `${warmupPct}%`, background: PHASE_COLORS.warmup.bar,
          borderRadius: '10px 0 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'width .05s',
        }}>
          {warmupPct >= 15 && <span style={{ fontSize: 11, color: '#fff', fontWeight: 800, whiteSpace: 'nowrap' }}>{warmup} {t('common.min')}</span>}
        </div>

        {/* Handle 1: warmup|main */}
        <div
          onPointerDown={(e) => startDrag('warmup', e)}
          style={{
            position: 'absolute', left: `calc(${warmupPct}% - ${HANDLE_W / 2}px)`,
            width: HANDLE_W, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'ew-resize', zIndex: 10,
          }}>
          <div style={{ width: 6, height: 28, borderRadius: 3, background: '#fff', boxShadow: '0 0 0 2px rgba(0,0,0,.25)' }} />
        </div>

        {/* Main segment */}
        <div style={{
          width: `${mainPct}%`, background: PHASE_COLORS.main.bar,
          borderRadius: (!hasCooldown && !hasStretching) ? '0 10px 10px 0' : '0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'width .05s',
        }}>
          {mainPct >= 20 && <span style={{ fontSize: 11, color: '#fff', fontWeight: 800, whiteSpace: 'nowrap' }}>{main} {t('common.min')}</span>}
        </div>

        {hasCooldown && <>
          {/* Handle 2: main|cooldown */}
          <div
            onPointerDown={(e) => startDrag('cooldown', e)}
            style={{
              position: 'absolute',
              left: `calc(${warmupPct + mainPct}% - ${HANDLE_W / 2}px)`,
              width: HANDLE_W, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'ew-resize', zIndex: 10,
            }}>
            <div style={{ width: 6, height: 28, borderRadius: 3, background: '#fff', boxShadow: '0 0 0 2px rgba(0,0,0,.25)' }} />
          </div>

          {/* Cooldown segment */}
          <div style={{
            width: `${cooldownPct}%`, background: PHASE_COLORS.cooldown.bar,
            borderRadius: hasStretching ? '0' : '0 10px 10px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'width .05s',
          }}>
            {cooldownPct >= 12 && <span style={{ fontSize: 11, color: '#fff', fontWeight: 800, whiteSpace: 'nowrap' }}>{cooldown} {t('common.min')}</span>}
          </div>
        </>}

        {hasStretching && <>
          {/* Handle 3: cooldown|stretching */}
          <div
            onPointerDown={(e) => startDrag('stretching', e)}
            style={{
              position: 'absolute',
              right: `calc(${stretchingPct}% - ${HANDLE_W / 2}px)`,
              width: HANDLE_W, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'ew-resize', zIndex: 10,
            }}>
            <div style={{ width: 6, height: 28, borderRadius: 3, background: '#fff', boxShadow: '0 0 0 2px rgba(0,0,0,.25)' }} />
          </div>

          {/* Stretching segment */}
          <div style={{
            width: `${stretchingPct}%`, background: PHASE_COLORS.stretching.bar,
            borderRadius: '0 10px 10px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'width .05s',
          }}>
            {stretchingPct >= 10 && <span style={{ fontSize: 11, color: '#fff', fontWeight: 800, whiteSpace: 'nowrap' }}>{stretching} {t('common.min')}</span>}
          </div>
        </>}
      </div>

      {/* Legend chips below bar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {legendItems.map(item => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
            background: item.color.bg, borderRadius: 8,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: item.color.bar }} />
            <span style={{ fontSize: 12, color: item.color.text, fontWeight: 700 }}>{item.label}</span>
            <span style={{ fontSize: 12, color: item.color.text, fontWeight: 700 }}>{item.min} {t('common.min')}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{t('generator.dragHint')}</p>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', gap: 5 }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div key={i} style={{
            height: 6, borderRadius: 3, transition: 'all .2s',
            width: i === step ? 24 : 8,
            background: i <= step ? 'var(--primary)' : 'var(--border)',
            opacity: i < step ? 0.4 : 1,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('generator.step', { n: step + 1 })} / {TOTAL_STEPS}</span>
    </div>
  );
}

function NavBar({ onBack, step }: { onBack: () => void; step: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
      <button onClick={onBack} style={{ background: 'none', fontSize: 22, padding: 4, color: 'var(--text)' }}>
        {step === 0 ? '✕' : '←'}
      </button>
      <StepIndicator step={step} />
      <div style={{ width: 32 }} />
    </div>
  );
}

function FooterBtn({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <div style={{ padding: '16px 20px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
      <button onClick={onClick} disabled={disabled} style={{
        width: '100%', padding: '15px', borderRadius: 16, fontWeight: 700, fontSize: 16,
        background: disabled ? 'var(--border)' : 'var(--primary)',
        color: disabled ? 'var(--text-disabled)' : '#fff',
        transition: 'all .15s',
      }}>
        {label}
      </button>
    </div>
  );
}

interface Props { navigate: (p: Page) => void; }

export function GeneratorPage({ navigate }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [expandedGroup, setExpandedGroup] = useState<CategoryGroup | null>(null);
  const [newCoachName, setNewCoachName] = useState('');
  const [preferFavorites, setPreferFavorites] = useState(false);

  const store = useGeneratorStore();
  const { savedCoaches, addCoach } = useCoachesStore();
  const { customExercises, favoriteIds } = useExercisesStore();

  // Effective category for exercise selection
  const exerciseCategory = store.subCategory
    ? SUB_CATEGORY_CONFIGS[store.subCategory].exerciseCategory
    : store.category;

  const effectivePhaseStructure = store.phaseStructure ??
    (store.subCategory
      ? SUB_CATEGORY_CONFIGS[store.subCategory].defaultPhaseStructure
      : store.category ? CATEGORY_CONFIGS[store.category].defaultPhaseStructure : '3-phase');

  const phaseDurations = useMemo(() => {
    if (!exerciseCategory) return null;
    return calculatePhaseDurations(exerciseCategory, store.totalDuration, effectivePhaseStructure, store.customPhaseDurations);
  }, [exerciseCategory, store.totalDuration, effectivePhaseStructure, store.customPhaseDurations]);

  const goBack = () => {
    if (step === 0) navigate({ name: 'home' });
    else setStep(s => s - 1);
  };

  const handleGenerate = () => {
    if (!exerciseCategory || store.skillFocus.length === 0) return;

    const coachNamesMap: Record<string, string> = {};
    for (const c of savedCoaches) coachNamesMap[c.id] = c.name;

    const input: GeneratorInput = {
      category: exerciseCategory,
      subCategory: store.subCategory ?? undefined,
      selectedULabel: store.selectedULabel ?? undefined,
      totalDuration: store.totalDuration,
      skillFocus: store.skillFocus,
      numberOfCoaches: store.numberOfCoaches,
      numberOfPlayers: store.numberOfPlayers,
      phaseStructure: effectivePhaseStructure,
      customPhaseDurations: store.customPhaseDurations,
      stationCoachAssignments: store.stationCoachAssignments,
      customExercises,
    };
    const unit = generateTrainingUnit(input, coachNamesMap, preferFavorites ? favoriteIds : [], t);
    store.setGeneratedUnit(unit);
    navigate({ name: 'training', training: unit });
  };

  // Phase types for current structure
  let phaseTypes: PhaseType[];
  if (effectivePhaseStructure === '2-phase') {
    phaseTypes = ['warmup', 'main'];
  } else if (effectivePhaseStructure === '4-phase') {
    phaseTypes = ['warmup', 'main', 'cooldown', 'stretching'];
  } else {
    phaseTypes = ['warmup', 'main', 'cooldown'];
  }

  // Phase slider logic
  const handleWarmupSlider = (val: number) => {
    const warmup = val;
    const hasCooldown = effectivePhaseStructure === '3-phase' || effectivePhaseStructure === '4-phase';
    const hasStretching = effectivePhaseStructure === '4-phase';
    const cooldown = hasCooldown
      ? (store.customPhaseDurations.cooldown ?? (phaseDurations?.cooldown ?? 15))
      : 0;
    const stretching = hasStretching
      ? (store.customPhaseDurations.stretching ?? (phaseDurations?.stretching ?? 10))
      : 0;
    const main = store.totalDuration - warmup - cooldown - stretching;
    if (main >= 5) {
      store.setCustomPhaseDurations({ warmup, ...(hasCooldown ? { cooldown } : {}), ...(hasStretching ? { stretching } : {}) });
    }
  };

  const handleCooldownSlider = (val: number) => {
    const warmup = store.customPhaseDurations.warmup ?? (phaseDurations?.warmup ?? 15);
    const hasStretching = effectivePhaseStructure === '4-phase';
    const stretching = hasStretching
      ? (store.customPhaseDurations.stretching ?? (phaseDurations?.stretching ?? 10))
      : 0;
    const cooldown = val;
    const main = store.totalDuration - warmup - cooldown - stretching;
    if (main >= 5) {
      store.setCustomPhaseDurations({ warmup, cooldown, ...(hasStretching ? { stretching } : {}) });
    }
  };

  const handleStretchingSlider = (val: number) => {
    const warmup = store.customPhaseDurations.warmup ?? (phaseDurations?.warmup ?? 15);
    const cooldown = store.customPhaseDurations.cooldown ?? (phaseDurations?.cooldown ?? 15);
    const stretching = val;
    const main = store.totalDuration - warmup - cooldown - stretching;
    if (main >= 5) {
      store.setCustomPhaseDurations({ warmup, cooldown, stretching });
    }
  };

  const currentWarmup = phaseDurations?.warmup ?? 15;
  const currentCooldown = phaseDurations?.cooldown ?? 0;
  const currentStretching = phaseDurations?.stretching ?? 0;

  const handleAddCoach = () => {
    if (newCoachName.trim()) {
      addCoach(newCoachName.trim());
      setNewCoachName('');
    }
  };

  // Available skill focuses for the selected subcategory or category
  const availableSkillFocus = store.subCategory
    ? SKILL_FOCUS_BY_SUBCATEGORY[store.subCategory]
    : store.category
    ? SKILL_FOCUS_BY_CATEGORY[store.category]
    : [];

  // Subcategory config for display
  const subCatCfg = store.subCategory ? SUB_CATEGORY_CONFIGS[store.subCategory] : null;

  // Recommended duration for the selected subcategory
  const recommendedDuration = subCatCfg?.recommendedDuration ?? 90;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar onBack={goBack} step={step} />

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ───── STEP 0: CATEGORY GROUPS + SUBCATEGORY ───── */}
        {step === 0 && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>{t('generator.selectCategory')}</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>{t('generator.selectCategoryDesc')}</p>
            </div>

            {CATEGORY_GROUP_LIST.map(group => {
              const isExpanded = expandedGroup === group.id;
              const subCats = group.subcategories.map(id => SUB_CATEGORY_CONFIGS[id]);
              const isSelected = store.subCategory != null && subCats.some(sc => sc.id === store.subCategory);

              return (
                <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* Group header */}
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: 16,
                      borderRadius: isExpanded ? '16px 16px 0 0' : 16,
                      border: `2px solid ${isSelected ? group.color : 'var(--border)'}`,
                      borderBottom: isExpanded ? `2px solid ${group.color}` : undefined,
                      background: isSelected ? group.color + '15' : 'var(--surface)',
                      textAlign: 'left', width: '100%', transition: 'all .15s', color: 'var(--text)',
                    }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, background: group.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24, flexShrink: 0, color: '#fff',
                    }}>
                      {group.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{t(group.label)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {subCats.map(sc => t(sc.label)).join(' · ')}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 16, color: isSelected ? group.color : 'var(--text-muted)',
                      transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s',
                    }}>›</span>
                  </button>

                  {/* Subcategory cards */}
                  {isExpanded && (
                    <div style={{
                      background: group.color + '10',
                      border: `2px solid ${group.color}`,
                      borderTop: 'none',
                      borderRadius: '0 0 16px 16px',
                      padding: '12px 12px 16px',
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      {subCats.map(sc => {
                        const sel = store.subCategory === sc.id;
                        return (
                          <button
                            key={sc.id}
                            onClick={() => store.setSubCategory(sc.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '12px 14px', borderRadius: 14,
                              border: `2px solid ${sel ? sc.color : sc.color + '40'}`,
                              background: sel ? sc.color + '20' : '#fff',
                              textAlign: 'left', width: '100%', transition: 'all .15s',
                            }}>
                            <span style={{ fontSize: 22, flexShrink: 0 }}>{sc.icon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 15, color: sel ? sc.color : 'var(--text)' }}>
                                {t(sc.label)}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                {t(sc.ageRange)} · {sc.uLabels.join(', ')}
                              </div>
                            </div>
                            {sel && <span style={{ color: sc.color, fontSize: 18, fontWeight: 800 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Selection summary */}
            {store.subCategory && subCatCfg && (
              <div style={{
                background: subCatCfg.lightColor,
                border: `2px solid ${subCatCfg.color}`,
                borderRadius: 14, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>✓</span>
                <div>
                  <div style={{ fontWeight: 700, color: subCatCfg.color, fontSize: 15 }}>
                    {t(subCatCfg.label)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t(subCatCfg.ageRange)} · {t(subCatCfg.description)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───── STEP 1: DURATION SLIDER + PHASE STRUCTURE ───── */}
        {step === 1 && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>{t('generator.trainingDuration')}</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>{t('generator.durationDesc')}</p>
            </div>

            {/* Duration slider */}
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <span style={{ fontSize: 44, fontWeight: 900, color: 'var(--primary)', lineHeight: 1 }}>{store.totalDuration}</span>
                <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 600 }}>{t('common.minutes')}</span>
              </div>

              <input
                type="range"
                min={30}
                max={120}
                step={5}
                value={store.totalDuration}
                onChange={(e) => store.setTotalDuration(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--primary)',
                  height: 6,
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>30 {t('common.min')}</span>
                {store.totalDuration !== recommendedDuration && (
                  <button
                    onClick={() => store.setTotalDuration(recommendedDuration)}
                    style={{
                      background: 'var(--secondary)', color: '#fff', fontSize: 11, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 8,
                    }}
                  >
                    {t('generator.recommended')}: {recommendedDuration} {t('common.min')}
                  </button>
                )}
                <span>120 {t('common.min')}</span>
              </div>
            </div>

            {/* Phase structure */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('generator.phaseStructure')}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['2-phase', '3-phase', '4-phase'] as PhaseStructure[]).map(ps => {
                  const sel = effectivePhaseStructure === ps;
                  const labelKey = `generator.${ps.replace('-', '')}` as 'generator.2phase' | 'generator.3phase' | 'generator.4phase';
                  const descKey = `generator.${ps.replace('-', '')}Desc` as 'generator.2phaseDesc' | 'generator.3phaseDesc' | 'generator.4phaseDesc';
                  return (
                    <button key={ps} onClick={() => store.setPhaseStructure(ps)}
                      style={{
                        flex: 1, padding: '12px 8px', borderRadius: 14, textAlign: 'center',
                        border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                        background: sel ? 'var(--primary-light)' : 'var(--surface)',
                        transition: 'all .15s', color: 'var(--text)',
                      }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: sel ? 'var(--primary)' : 'inherit' }}>
                        {t(labelKey)}
                      </div>
                      <div style={{ fontSize: 10, color: sel ? 'var(--primary)' : 'var(--text-muted)', marginTop: 3, lineHeight: 1.3 }}>
                        {t(descKey)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Phase draggable bar */}
            {phaseDurations && (
              <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('generator.phaseLayout')}</h3>
                <DraggablePhaseBar
                  totalDuration={store.totalDuration}
                  warmup={currentWarmup}
                  cooldown={currentCooldown}
                  stretching={currentStretching}
                  phaseStructure={effectivePhaseStructure}
                  onWarmupChange={handleWarmupSlider}
                  onCooldownChange={handleCooldownSlider}
                  onStretchingChange={handleStretchingSlider}
                />
              </div>
            )}
          </div>
        )}

        {/* ───── STEP 2: FOCUS ───── */}
        {step === 2 && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>{t('generator.skillFocus')}</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>{t('generator.focusDesc')}</p>
            </div>
            {store.skillFocus.length >= 3 && (
              <div style={{ background: 'var(--primary-light)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>ℹ️</span>
                <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>{t('generator.maxFocus')}</span>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableSkillFocus.map(skill => {
                const cfg = SKILL_FOCUS_CONFIGS[skill as SkillFocus];
                const sel = store.skillFocus.includes(skill as SkillFocus);
                const dis = store.skillFocus.length >= 3 && !sel;
                return (
                  <button key={skill} onClick={() => !dis && store.toggleSkillFocus(skill as SkillFocus)}
                    disabled={dis && !sel}
                    style={{
                      padding: '10px 16px', borderRadius: 20, fontWeight: 600, fontSize: 14,
                      border: `2px solid ${sel ? 'var(--primary)' : dis ? 'var(--border)' : 'var(--primary)'}`,
                      background: sel ? 'var(--primary)' : dis ? 'var(--surface-var)' : 'var(--surface)',
                      color: sel ? '#fff' : dis ? 'var(--text-disabled)' : 'var(--primary)',
                      transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                    {sel && <span>✓</span>}
                    {t(cfg.label)}
                  </button>
                );
              })}
            </div>
            {store.skillFocus.length > 0 && (
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{t('generator.selectedFocus')}</span>
                {store.skillFocus.map(s => (
                  <span key={s} style={{ fontSize: 14, fontWeight: 600 }}>• {t(SKILL_FOCUS_CONFIGS[s as SkillFocus].label)}</span>
                ))}
              </div>
            )}

            {/* Favorites toggle */}
            <button
              onClick={() => setPreferFavorites(f => !f)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: preferFavorites ? '#FFF8E1' : 'var(--surface)', borderRadius: 16,
                border: `2px solid ${preferFavorites ? '#F4A100' : 'var(--border)'}`,
                textAlign: 'left', width: '100%',
              }}>
              <span style={{ fontSize: 24 }}>{preferFavorites ? '⭐' : '☆'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: preferFavorites ? '#856404' : 'var(--text)' }}>
                  {t('generator.preferFavorites')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {favoriteIds.length > 0
                    ? t('generator.favoritesCount', { count: favoriteIds.length })
                    : t('generator.noFavorites')}
                </div>
              </div>
              <div style={{
                width: 24, height: 24, borderRadius: 12,
                background: preferFavorites ? '#F4A100' : 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {preferFavorites && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
              </div>
            </button>
          </div>
        )}

        {/* ───── STEP 3: COACHES ───── */}
        {step === 3 && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>{t('generator.coachesTitle')}</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>{t('generator.coachesDesc')}</p>
            </div>

            {/* Number of players stepper */}
            <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>👥</span> {t('generator.playerCount')}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>{t('generator.playerWarning')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
                <button onClick={() => store.setNumberOfPlayers(Math.max(4, store.numberOfPlayers - 1))}
                  disabled={store.numberOfPlayers <= 4}
                  style={{
                    width: 44, height: 44, borderRadius: 22, fontSize: 22, fontWeight: 700,
                    background: store.numberOfPlayers <= 4 ? 'var(--surface-var)' : 'var(--primary-light)',
                    color: store.numberOfPlayers <= 4 ? 'var(--text-disabled)' : 'var(--primary)',
                  }}>−</button>
                <div style={{ textAlign: 'center', minWidth: 60 }}>
                  <div style={{ fontSize: 40, fontWeight: 900, color: 'var(--primary)', lineHeight: 1 }}>{store.numberOfPlayers}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t('common.players')}</div>
                </div>
                <button onClick={() => store.setNumberOfPlayers(Math.min(30, store.numberOfPlayers + 1))}
                  disabled={store.numberOfPlayers >= 30}
                  style={{
                    width: 44, height: 44, borderRadius: 22, fontSize: 22, fontWeight: 700,
                    background: store.numberOfPlayers >= 30 ? 'var(--surface-var)' : 'var(--primary-light)',
                    color: store.numberOfPlayers >= 30 ? 'var(--text-disabled)' : 'var(--primary)',
                  }}>+</button>
              </div>
            </div>

            {/* Station count stepper */}
            <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
              <button onClick={() => store.setNumberOfCoaches(Math.max(1, store.numberOfCoaches - 1))}
                disabled={store.numberOfCoaches <= 1}
                style={{
                  width: 48, height: 48, borderRadius: 24, fontSize: 22, fontWeight: 700,
                  background: store.numberOfCoaches <= 1 ? 'var(--surface-var)' : 'var(--primary-light)',
                  color: store.numberOfCoaches <= 1 ? 'var(--text-disabled)' : 'var(--primary)',
                }}>−</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 44, fontWeight: 900, color: 'var(--primary)', lineHeight: 1 }}>{store.numberOfCoaches}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  {t('generator.stations')}
                </div>
              </div>
              <button onClick={() => store.setNumberOfCoaches(Math.min(5, store.numberOfCoaches + 1))}
                disabled={store.numberOfCoaches >= 5}
                style={{
                  width: 48, height: 48, borderRadius: 24, fontSize: 22, fontWeight: 700,
                  background: store.numberOfCoaches >= 5 ? 'var(--surface-var)' : 'var(--primary-light)',
                  color: store.numberOfCoaches >= 5 ? 'var(--text-disabled)' : 'var(--primary)',
                }}>+</button>
            </div>

            {/* Info box */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20 }}>{store.numberOfCoaches === 1 ? '📋' : '🔲'}</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 14 }}>
                  {store.numberOfCoaches === 1 ? t('generator.sequentialTraining') : t('generator.stationTraining')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--primary)', opacity: .8, marginTop: 3, lineHeight: 1.5 }}>
                  {store.numberOfCoaches === 1 ? t('generator.sequentialDesc') : t('generator.stationDesc')}
                </div>
              </div>
            </div>

            {/* Station assignments */}
            {store.numberOfCoaches > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('generator.coachAssignment')}</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('generator.optional')}</span>
                </div>

                {/* Add coach inline */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={newCoachName}
                    onChange={e => setNewCoachName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddCoach()}
                    placeholder={t('generator.coachPlaceholder')}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 12,
                      border: '1.5px solid var(--border)', background: 'var(--surface)',
                      fontSize: 14, color: 'var(--text)',
                    }}
                  />
                  <button onClick={handleAddCoach} disabled={!newCoachName.trim()}
                    style={{
                      padding: '10px 16px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                      background: newCoachName.trim() ? 'var(--primary)' : 'var(--border)',
                      color: newCoachName.trim() ? '#fff' : 'var(--text-disabled)',
                    }}>+ {t('common.add')}</button>
                </div>

                {/* Station rows */}
                {Array.from({ length: store.numberOfCoaches }, (_, i) => {
                  const stationNum = i + 1;
                  const assignedId = store.stationCoachAssignments[stationNum];
                  return (
                    <div key={stationNum} style={{
                      background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, color: 'var(--primary)', fontSize: 14, flexShrink: 0,
                      }}>S{stationNum}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('generator.stationLabel', { n: stationNum })}</div>
                        <select
                          value={assignedId ?? ''}
                          onChange={e => store.setStationCoachAssignment(stationNum, e.target.value === '__none__' ? null : e.target.value || null)}
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: 10,
                            border: '1.5px solid var(--border)', background: 'var(--bg)',
                            fontSize: 14, color: 'var(--text)',
                          }}>
                          <option value="">{t('generator.unassigned')}</option>
                          <option value="__none__">{t('generator.freeStation')}</option>
                          {savedCoaches.map(c => (
                            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}

                {savedCoaches.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
                    {t('generator.addCoachHint')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ───── STEP 4: REVIEW ───── */}
        {step === 4 && exerciseCategory && phaseDurations && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>{t('generator.reviewTitle')}</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>{t('generator.reviewDesc')}</p>
            </div>

            {/* Summary */}
            <div style={{ background: 'var(--surface)', borderRadius: 16, overflow: 'hidden' }}>
              {[
                {
                  icon: '👥',
                  label: t('manual.category'),
                  value: store.subCategory
                    ? `${store.selectedULabel ? store.selectedULabel + ' – ' : ''}${t(SUB_CATEGORY_CONFIGS[store.subCategory].label)} (${t(SUB_CATEGORY_CONFIGS[store.subCategory].ageRange)})`
                    : exerciseCategory
                    ? `${store.selectedULabel ? store.selectedULabel + ' – ' : ''}${t(CATEGORY_CONFIGS[exerciseCategory].label)}`
                    : '',
                },
                { icon: '⏱️', label: t('generator.trainingDuration'), value: `${store.totalDuration} ${t('common.minutes')}` },
                { icon: '🎯', label: t('manual.focus'), value: store.skillFocus.map(s => t(SKILL_FOCUS_CONFIGS[s as SkillFocus].label)).join(', ') },
                { icon: '🔲', label: t('generator.stations'), value: store.numberOfCoaches === 1 ? t('generator.sequential') : t('generator.stationsCount', { n: store.numberOfCoaches }) },
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
                  borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontSize: 18 }}>{row.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}>{row.label}</span>
                  <span style={{ fontWeight: 600, fontSize: 14, textAlign: 'right', maxWidth: '60%' }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Phase durations */}
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('generator.phaseDurations')}</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('generator.total')}: {store.totalDuration} {t('common.min')}</span>
              </div>
              <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
                {phaseTypes.map(pt => (
                  <div key={pt} style={{ flex: phaseDurations[pt] / store.totalDuration, background: PHASE_COLORS[pt].bar, borderRadius: 3 }} />
                ))}
              </div>
              {phaseTypes.map(pt => (
                <div key={pt} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: PHASE_COLORS[pt].bar, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14 }}>{t(getPhaseLabel(pt))}</span>
                  <span style={{
                    background: PHASE_COLORS[pt].bg, color: PHASE_COLORS[pt].text,
                    fontWeight: 700, fontSize: 14, padding: '4px 10px', borderRadius: 8,
                  }}>{phaseDurations[pt]} {t('common.min')}</span>
                </div>
              ))}
            </div>

            {/* Notice */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10 }}>
              <span>ℹ️</span>
              <span style={{ fontSize: 13, color: 'var(--primary)', lineHeight: 1.5 }}>
                {t('generator.reviewNotice')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {step < 4 ? (
        <FooterBtn
          label={t('generator.continue')}
          disabled={
            (step === 0 && !store.subCategory) ||
            (step === 2 && store.skillFocus.length === 0)
          }
          onClick={() => setStep(s => s + 1)}
        />
      ) : (
        <FooterBtn label={`⚡ ${t('generator.generate')}`} onClick={handleGenerate} />
      )}
    </div>
  );
}
