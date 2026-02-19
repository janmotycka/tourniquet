import React, { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useGeneratorStore } from '../../store/generator.store';
import { useCoachesStore } from '../../store/coaches.store';
import { useExercisesStore } from '../../store/exercises.store';
import { CATEGORY_LIST, CATEGORY_CONFIGS, U_LABELS_BY_CATEGORY, U_LABEL_CONFIGS } from '../../data/categories.data';
import { SKILL_FOCUS_BY_CATEGORY, SKILL_FOCUS_CONFIGS } from '../../data/skill-focus.data';
import { calculatePhaseDurations, getPhaseLabel } from '../../engine/phase-splitter';
import { generateTrainingUnit } from '../../engine/generator';
import type { AgeCategory, TrainingDuration, PhaseStructure, ULabel } from '../../types/category.types';
import type { SkillFocus, PhaseType } from '../../types/exercise.types';
import type { GeneratorInput } from '../../types/training.types';

const DURATIONS: TrainingDuration[] = [60, 75, 90, 105, 120];
const TOTAL_STEPS = 5;

const PHASE_COLORS: Record<PhaseType, { bg: string; text: string; bar: string }> = {
  warmup: { bg: 'var(--warmup-light)', text: 'var(--warmup-text)', bar: 'var(--warmup)' },
  main: { bg: 'var(--main-ph-light)', text: 'var(--main-ph-text)', bar: 'var(--main-ph)' },
  cooldown: { bg: 'var(--cooldown-light)', text: 'var(--cooldown-text)', bar: 'var(--cooldown)' },
};

// ─── DraggablePhaseBar ─────────────────────────────────────────────────────────
function DraggablePhaseBar({
  totalDuration,
  warmup,
  cooldown,
  is3Phase,
  onWarmupChange,
  onCooldownChange,
}: {
  totalDuration: number;
  warmup: number;
  cooldown: number;
  is3Phase: boolean;
  onWarmupChange: (v: number) => void;
  onCooldownChange: (v: number) => void;
}) {
  const barRef = React.useRef<HTMLDivElement>(null);
  const main = totalDuration - warmup - (is3Phase ? cooldown : 0);

  const getBarWidth = () => barRef.current?.getBoundingClientRect().width ?? 1;

  const snapTo5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

  const startDrag = (handle: 'warmup' | 'cooldown', e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const barW = getBarWidth();
    const startWarmup = warmup;
    const startCooldown = cooldown;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const deltaMin = (dx / barW) * totalDuration;
      if (handle === 'warmup') {
        const newWarmup = snapTo5(startWarmup + deltaMin);
        onWarmupChange(newWarmup);
      } else {
        const newCooldown = snapTo5(startCooldown - deltaMin);
        onCooldownChange(newCooldown);
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
  const cooldownPct = is3Phase ? (cooldown / totalDuration) * 100 : 0;

  const HANDLE_W = 20;

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
          {warmupPct >= 15 && <span style={{ fontSize: 11, color: '#fff', fontWeight: 800, whiteSpace: 'nowrap' }}>{warmup} min</span>}
        </div>

        {/* Handle 1: warmup|main */}
        <div
          onPointerDown={(e) => startDrag('warmup', e)}
          style={{
            position: 'absolute', left: `calc(${warmupPct}% - ${HANDLE_W / 2}px)`,
            width: HANDLE_W, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'ew-resize', zIndex: 10,
          }}>
          <div style={{
            width: 6, height: 28, borderRadius: 3, background: '#fff',
            boxShadow: '0 0 0 2px rgba(0,0,0,.25)',
          }} />
        </div>

        {/* Main segment */}
        <div style={{
          width: `${mainPct}%`, background: PHASE_COLORS.main.bar,
          borderRadius: is3Phase ? '0' : '0 10px 10px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'width .05s',
        }}>
          {mainPct >= 20 && <span style={{ fontSize: 11, color: '#fff', fontWeight: 800, whiteSpace: 'nowrap' }}>{main} min</span>}
        </div>

        {is3Phase && <>
          {/* Handle 2: main|cooldown */}
          <div
            onPointerDown={(e) => startDrag('cooldown', e)}
            style={{
              position: 'absolute', right: `calc(${cooldownPct}% - ${HANDLE_W / 2}px)`,
              width: HANDLE_W, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'ew-resize', zIndex: 10,
            }}>
            <div style={{
              width: 6, height: 28, borderRadius: 3, background: '#fff',
              boxShadow: '0 0 0 2px rgba(0,0,0,.25)',
            }} />
          </div>

          {/* Cooldown segment */}
          <div style={{
            width: `${cooldownPct}%`, background: PHASE_COLORS.cooldown.bar,
            borderRadius: '0 10px 10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'width .05s',
          }}>
            {cooldownPct >= 15 && <span style={{ fontSize: 11, color: '#fff', fontWeight: 800, whiteSpace: 'nowrap' }}>{cooldown} min</span>}
          </div>
        </>}
      </div>

      {/* Legend chips below bar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Rozcvičení', min: warmup, color: PHASE_COLORS.warmup },
          { label: 'Hlavní část', min: main, color: PHASE_COLORS.main },
          ...(is3Phase ? [{ label: 'Závěr', min: cooldown, color: PHASE_COLORS.cooldown }] : []),
        ].map(item => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
            background: item.color.bg, borderRadius: 8,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: item.color.bar }} />
            <span style={{ fontSize: 12, color: item.color.text, fontWeight: 700 }}>{item.label}</span>
            <span style={{ fontSize: 12, color: item.color.text, fontWeight: 700 }}>{item.min} min</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Přetáhni hranici pro změnu délky fáze</p>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
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
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Krok {step + 1} z {TOTAL_STEPS}</span>
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
  const [step, setStep] = useState(0);
  const [expandedCategory, setExpandedCategory] = useState<AgeCategory | null>(null);
  const [newCoachName, setNewCoachName] = useState('');
  const [preferFavorites, setPreferFavorites] = useState(false);

  const store = useGeneratorStore();
  const { savedCoaches, addCoach } = useCoachesStore();
  const { customExercises, favoriteIds } = useExercisesStore();

  const effectivePhaseStructure = store.phaseStructure ??
    (store.category ? CATEGORY_CONFIGS[store.category].defaultPhaseStructure : '3-phase');

  const phaseDurations = useMemo(() => {
    if (!store.category) return null;
    return calculatePhaseDurations(store.category, store.totalDuration, effectivePhaseStructure, store.customPhaseDurations);
  }, [store.category, store.totalDuration, effectivePhaseStructure, store.customPhaseDurations]);

  const goBack = () => {
    if (step === 0) navigate({ name: 'home' });
    else setStep(s => s - 1);
  };

  const handleGenerate = () => {
    if (!store.category || store.skillFocus.length === 0) return;

    const coachNamesMap: Record<string, string> = {};
    for (const c of savedCoaches) coachNamesMap[c.id] = c.name;

    const input: GeneratorInput = {
      category: store.category,
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
    const unit = generateTrainingUnit(input, coachNamesMap, preferFavorites ? favoriteIds : []);
    store.setGeneratedUnit(unit);
    navigate({ name: 'training', training: unit });
  };

  const phaseTypes: PhaseType[] = effectivePhaseStructure === '2-phase'
    ? ['warmup', 'main'] : ['warmup', 'main', 'cooldown'];

  // Phase slider logic
  const handleWarmupSlider = (val: number) => {
    const warmup = val;
    const cooldown = effectivePhaseStructure === '3-phase'
      ? (store.customPhaseDurations.cooldown ?? (phaseDurations?.cooldown ?? 15))
      : 0;
    const main = store.totalDuration - warmup - cooldown;
    if (main >= 5) {
      store.setCustomPhaseDurations({ warmup, cooldown: effectivePhaseStructure === '3-phase' ? cooldown : 0 });
    }
  };

  const handleCooldownSlider = (val: number) => {
    const warmup = store.customPhaseDurations.warmup ?? (phaseDurations?.warmup ?? 15);
    const cooldown = val;
    const main = store.totalDuration - warmup - cooldown;
    if (main >= 5) {
      store.setCustomPhaseDurations({ warmup, cooldown });
    }
  };

  const currentWarmup = phaseDurations?.warmup ?? 15;
  const currentCooldown = phaseDurations?.cooldown ?? 0;

  const handleAddCoach = () => {
    if (newCoachName.trim()) {
      addCoach(newCoachName.trim());
      setNewCoachName('');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar onBack={goBack} step={step} />

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ───── STEP 0: CATEGORY + U-LABEL ───── */}
        {step === 0 && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>Věková kategorie</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>Vyberte kategorii a ročník vašeho týmu.</p>
            </div>
            {CATEGORY_LIST.map(cfg => {
              const isExpanded = expandedCategory === cfg.id;
              const uLabels = U_LABELS_BY_CATEGORY[cfg.id];
              return (
                <div key={cfg.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* Category header card */}
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : cfg.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: 16,
                      borderRadius: isExpanded ? '16px 16px 0 0' : 16,
                      border: `2px solid ${store.category === cfg.id ? cfg.color : 'var(--border)'}`,
                      borderBottom: isExpanded ? `2px solid ${cfg.color}` : undefined,
                      background: store.category === cfg.id ? cfg.lightColor : 'var(--surface)',
                      textAlign: 'left', width: '100%', transition: 'all .15s', color: 'var(--text)',
                    }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                      {cfg.id === 'pripravka' ? '😊' : cfg.id === 'mladsi-zaci' ? '⚽' : cfg.id === 'starsi-zaci' ? '🏆' : '🥇'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{cfg.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: cfg.color, marginTop: 2, textTransform: 'uppercase', letterSpacing: .5 }}>{cfg.ageRange}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {uLabels.join(' · ')}
                      </div>
                    </div>
                    <span style={{ fontSize: 16, color: store.category === cfg.id ? cfg.color : 'var(--text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
                  </button>

                  {/* U-label chips */}
                  {isExpanded && (
                    <div style={{
                      background: cfg.lightColor,
                      border: `2px solid ${cfg.color}`,
                      borderTop: 'none',
                      borderRadius: '0 0 16px 16px',
                      padding: '12px 16px 16px',
                      display: 'flex', flexWrap: 'wrap', gap: 8,
                    }}>
                      {uLabels.map(ul => {
                        const ulConfig = U_LABEL_CONFIGS.find(c => c.label === ul)!;
                        const sel = store.selectedULabel === ul;
                        return (
                          <button
                            key={ul}
                            onClick={() => store.setULabel(ul as ULabel, cfg.id as AgeCategory)}
                            style={{
                              padding: '10px 16px', borderRadius: 20,
                              border: `2px solid ${sel ? cfg.color : cfg.color + '60'}`,
                              background: sel ? cfg.color : '#fff',
                              color: sel ? '#fff' : cfg.color,
                              fontWeight: 700, fontSize: 15, transition: 'all .15s',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                            }}>
                            <span>{ul}</span>
                            <span style={{ fontSize: 10, fontWeight: 500, opacity: .85 }}>{ulConfig.displayAge}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {store.selectedULabel && store.category && (
              <div style={{
                background: CATEGORY_CONFIGS[store.category].lightColor,
                border: `2px solid ${CATEGORY_CONFIGS[store.category].color}`,
                borderRadius: 14, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>✓</span>
                <div>
                  <div style={{ fontWeight: 700, color: CATEGORY_CONFIGS[store.category].color, fontSize: 15 }}>
                    {store.selectedULabel} – {CATEGORY_CONFIGS[store.category].label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {U_LABEL_CONFIGS.find(c => c.label === store.selectedULabel)?.displayAge}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───── STEP 1: DURATION + SLIDERS ───── */}
        {step === 1 && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>Délka tréninku</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>Vyberte celkovou délku a upravte rozložení fází.</p>
            </div>

            {/* Duration grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {DURATIONS.map(d => {
                const rec = d === 90;
                const sel = store.totalDuration === d;
                return (
                  <button key={d} onClick={() => store.setTotalDuration(d)}
                    style={{
                      padding: '18px 10px', borderRadius: 14, position: 'relative',
                      border: `2px solid ${sel ? 'var(--primary)' : rec ? 'var(--primary)' : 'var(--border)'}`,
                      background: sel ? 'var(--primary)' : 'var(--surface)',
                      color: sel ? '#fff' : 'var(--text)', transition: 'all .15s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                    <span style={{ fontWeight: 800, fontSize: 22 }}>{d}</span>
                    <span style={{ fontSize: 11, opacity: sel ? .7 : .5 }}>min</span>
                    {rec && !sel && (
                      <span style={{
                        position: 'absolute', top: -8, right: -8,
                        background: 'var(--secondary)', color: '#fff', fontSize: 9, fontWeight: 700,
                        padding: '2px 6px', borderRadius: 8,
                      }}>Doporučeno</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Phase structure */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>Struktura fází</h3>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['2-phase', '3-phase'] as PhaseStructure[]).map(ps => {
                  const sel = effectivePhaseStructure === ps;
                  return (
                    <button key={ps} onClick={() => store.setPhaseStructure(ps)}
                      style={{
                        flex: 1, padding: '14px', borderRadius: 14, textAlign: 'left',
                        border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                        background: sel ? 'var(--primary-light)' : 'var(--surface)',
                        transition: 'all .15s', color: 'var(--text)',
                      }}>
                      <div style={{ fontWeight: 700, color: sel ? 'var(--primary)' : 'inherit' }}>
                        {ps === '2-phase' ? '2 fáze' : '3 fáze'}
                      </div>
                      <div style={{ fontSize: 12, color: sel ? 'var(--primary)' : 'var(--text-muted)', marginTop: 3 }}>
                        {ps === '2-phase' ? 'Rozcvičení + Hlavní' : 'Rozcvičení + Hlavní + Závěr'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Phase draggable bar */}
            {phaseDurations && (
              <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15 }}>Rozložení fází</h3>
                <DraggablePhaseBar
                  totalDuration={store.totalDuration}
                  warmup={currentWarmup}
                  cooldown={currentCooldown}
                  is3Phase={effectivePhaseStructure === '3-phase'}
                  onWarmupChange={handleWarmupSlider}
                  onCooldownChange={handleCooldownSlider}
                />
              </div>
            )}
          </div>
        )}

        {/* ───── STEP 2: FOCUS ───── */}
        {step === 2 && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>Zaměření tréninku</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>Vyberte 1–3 dovednosti, na které chcete zaměřit trénink.</p>
            </div>
            {store.skillFocus.length >= 3 && (
              <div style={{ background: 'var(--primary-light)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>ℹ️</span>
                <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>Vybrali jste maximum 3 zaměření</span>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(store.category ? SKILL_FOCUS_BY_CATEGORY[store.category] : []).map(skill => {
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
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            {store.skillFocus.length > 0 && (
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Vybrané zaměření</span>
                {store.skillFocus.map(s => (
                  <span key={s} style={{ fontSize: 14, fontWeight: 600 }}>• {SKILL_FOCUS_CONFIGS[s as SkillFocus].label}</span>
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
                  Preferovat oblíbená cvičení
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {favoriteIds.length > 0
                    ? `Máte ${favoriteIds.length} oblíbených — generátor je upřednostní`
                    : 'Žádná oblíbená cvičení (označte v knihovně)'}
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
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>Trenéři a hráči</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>Nastavte počet hráčů, stanovišť a přiřaďte trenéry.</p>
            </div>

            {/* Number of players stepper */}
            <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>👥</span> Počet hráčů
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>slouží pro varování u cvičení</span>
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
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>hráčů</div>
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
                  {store.numberOfCoaches === 1 ? 'stanoviště' : 'stanoviště'}
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
                  {store.numberOfCoaches === 1 ? 'Sekvenční trénink' : 'Stanovišťový trénink'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--primary)', opacity: .8, marginTop: 3, lineHeight: 1.5 }}>
                  {store.numberOfCoaches === 1
                    ? 'Cvičení budou za sebou — jedno po druhém.'
                    : 'Každé stanoviště může mít trenéra nebo jít bez dozoru (volná hra).'}
                </div>
              </div>
            </div>

            {/* Station assignments */}
            {store.numberOfCoaches > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15 }}>Přiřazení trenérů</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>volitelné</span>
                </div>

                {/* Add coach inline */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={newCoachName}
                    onChange={e => setNewCoachName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddCoach()}
                    placeholder="Jméno trenéra..."
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
                    }}>+ Přidat</button>
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
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Stanoviště {stationNum}</div>
                        <select
                          value={assignedId ?? ''}
                          onChange={e => store.setStationCoachAssignment(stationNum, e.target.value === '__none__' ? null : e.target.value || null)}
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: 10,
                            border: '1.5px solid var(--border)', background: 'var(--bg)',
                            fontSize: 14, color: 'var(--text)',
                          }}>
                          <option value="">— nepřiřazeno —</option>
                          <option value="__none__">🔓 Volné stanoviště (bez trenéra)</option>
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
                    Přidejte jméno trenéra výše pro přiřazení ke stanovišti.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ───── STEP 4: REVIEW ───── */}
        {step === 4 && store.category && phaseDurations && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 22 }}>Přehled tréninku</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>Zkontrolujte nastavení a vygenerujte trénink.</p>
            </div>

            {/* Summary */}
            <div style={{ background: 'var(--surface)', borderRadius: 16, overflow: 'hidden' }}>
              {[
                {
                  icon: '👥',
                  label: 'Kategorie',
                  value: store.selectedULabel
                    ? `${store.selectedULabel} – ${CATEGORY_CONFIGS[store.category].label} (${CATEGORY_CONFIGS[store.category].ageRange})`
                    : `${CATEGORY_CONFIGS[store.category].label} (${CATEGORY_CONFIGS[store.category].ageRange})`
                },
                { icon: '⏱️', label: 'Délka', value: `${store.totalDuration} minut` },
                { icon: '🎯', label: 'Zaměření', value: store.skillFocus.map(s => SKILL_FOCUS_CONFIGS[s as SkillFocus].label).join(', ') },
                { icon: '🔲', label: 'Stanoviště', value: store.numberOfCoaches === 1 ? '1 (sekvenční)' : `${store.numberOfCoaches} stanoviště` },
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
                <h3 style={{ fontWeight: 700, fontSize: 15 }}>Délky fází</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Celkem: {store.totalDuration} min</span>
              </div>
              <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
                {phaseTypes.map(pt => (
                  <div key={pt} style={{ flex: phaseDurations[pt] / store.totalDuration, background: PHASE_COLORS[pt].bar, borderRadius: 3 }} />
                ))}
              </div>
              {phaseTypes.map(pt => (
                <div key={pt} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: PHASE_COLORS[pt].bar, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14 }}>{getPhaseLabel(pt)}</span>
                  <span style={{
                    background: PHASE_COLORS[pt].bg, color: PHASE_COLORS[pt].text,
                    fontWeight: 700, fontSize: 14, padding: '4px 10px', borderRadius: 8,
                  }}>{phaseDurations[pt]} min</span>
                </div>
              ))}
            </div>

            {/* Notice */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10 }}>
              <span>ℹ️</span>
              <span style={{ fontSize: 13, color: 'var(--primary)', lineHeight: 1.5 }}>
                Aplikace vybere vhodná cvičení z knihovny. Každé vygenerování může být trochu jiné.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {step < 4 ? (
        <FooterBtn
          label="Pokračovat"
          disabled={
            (step === 0 && !store.selectedULabel) ||
            (step === 2 && store.skillFocus.length === 0)
          }
          onClick={() => setStep(s => s + 1)}
        />
      ) : (
        <FooterBtn label="⚡ Vygenerovat trénink" onClick={handleGenerate} />
      )}
    </div>
  );
}
