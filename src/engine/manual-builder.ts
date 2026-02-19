import type { Exercise, PhaseType } from '../types/exercise.types';
import type { PhaseConfig } from '../types/phase.types';
import type { GeneratorInput, TrainingUnit } from '../types/training.types';
import { CATEGORY_CONFIGS } from '../data/categories.data';
import { SKILL_FOCUS_CONFIGS } from '../data/skill-focus.data';
import { getPhaseLabel } from './phase-splitter';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function buildManualTraining(
  input: GeneratorInput,
  exercisesByPhase: Partial<Record<PhaseType, Exercise[]>>
): TrainingUnit {
  const { category, skillFocus, selectedULabel } = input;
  const categoryConfig = CATEGORY_CONFIGS[category];

  const phaseTypes: PhaseType[] = input.phaseStructure === '2-phase'
    ? ['warmup', 'main']
    : ['warmup', 'main', 'cooldown'];

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

  // Title
  const uLabelPrefix = selectedULabel ? `${selectedULabel} ` : '';
  const focusLabel = skillFocus.length > 0
    ? skillFocus.slice(0, 2).map(sf => SKILL_FOCUS_CONFIGS[sf]?.label ?? sf).join(', ')
    : 'vlastní sestavení';

  const now = new Date().toISOString();

  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    title: `${uLabelPrefix}${categoryConfig.label} – ${focusLabel}`,
    input,
    phases: phasesWithPct,
    totalDuration,
    isSaved: false,
  };
}
