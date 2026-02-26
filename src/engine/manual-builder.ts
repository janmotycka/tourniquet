import type { Exercise, PhaseType } from '../types/exercise.types';
import type { PhaseConfig } from '../types/phase.types';
import type { GeneratorInput, TrainingUnit } from '../types/training.types';
import { CATEGORY_CONFIGS, SUB_CATEGORY_CONFIGS } from '../data/categories.data';
import { SKILL_FOCUS_CONFIGS } from '../data/skill-focus.data';
import { getPhaseLabel } from './phase-splitter';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function buildManualTraining(
  input: GeneratorInput,
  exercisesByPhase: Partial<Record<PhaseType, Exercise[]>>,
  t?: TranslateFn
): TrainingUnit {
  const { category, subCategory, skillFocus, selectedULabel } = input;
  const subCatConfig = subCategory ? SUB_CATEGORY_CONFIGS[subCategory] : null;
  const categoryConfig = CATEGORY_CONFIGS[subCatConfig?.exerciseCategory ?? category];
  const resolve = t ?? ((key: string) => key);

  let phaseTypes: PhaseType[];
  if (input.phaseStructure === '2-phase') {
    phaseTypes = ['warmup', 'main'];
  } else if (input.phaseStructure === '4-phase') {
    phaseTypes = ['warmup', 'main', 'cooldown', 'stretching'];
  } else {
    phaseTypes = ['warmup', 'main', 'cooldown'];
  }

  const phases: PhaseConfig[] = phaseTypes.map(pt => {
    const exercises = exercisesByPhase[pt] ?? [];
    const duration = exercises.reduce((s, e) => s + e.duration.recommended, 0);
    return {
      type: pt,
      label: getPhaseLabel(pt),
      durationMinutes: duration,
      percentageOfTotal: 0, // recalculated below
      exercises,
    };
  });

  const totalDuration = phases.reduce((s, p) => s + p.durationMinutes, 0) || input.totalDuration;

  // Recalculate percentages
  const phasesWithPct = phases.map(p => ({
    ...p,
    percentageOfTotal: totalDuration > 0 ? p.durationMinutes / totalDuration : 0,
  }));

  // Title (localized if t() provided)
  const uLabelPrefix = selectedULabel ? `${selectedULabel} ` : '';
  const labelKey = subCatConfig?.label ?? categoryConfig.label;
  const focusLabel = skillFocus.length > 0
    ? skillFocus.slice(0, 2).map(sf => resolve(SKILL_FOCUS_CONFIGS[sf]?.label ?? sf)).join(', ')
    : resolve('manual.customBuild');

  const now = new Date().toISOString();

  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    title: `${uLabelPrefix}${resolve(labelKey)} – ${focusLabel}`,
    input,
    phases: phasesWithPct,
    totalDuration,
    isSaved: false,
  };
}
