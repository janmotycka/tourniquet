import { CATEGORY_CONFIGS, SUB_CATEGORY_CONFIGS } from '../data/categories.data';
import { SKILL_FOCUS_CONFIGS } from '../data/skill-focus.data';
import { ALL_EXERCISES } from '../data/exercises/index';
import type { PhaseConfig } from '../types/phase.types';
import type { GeneratorInput, TrainingUnit } from '../types/training.types';
import { calculatePhaseDurations, getPhaseLabel } from './phase-splitter';
import { selectExercisesForPhase, selectStationExercises } from './exercise-selector';
import { buildStations } from './station-builder';
import { generateId } from '../utils/id';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function generateTrainingUnit(
  input: GeneratorInput,
  coachNames?: Record<string, string>,
  favoriteIds: string[] = [],
  t?: TranslateFn
): TrainingUnit {
  const {
    category,
    subCategory,
    totalDuration,
    skillFocus,
    numberOfCoaches,
    phaseStructure,
    customExercises = [],
    stationCoachAssignments,
    selectedULabel,
  } = input;

  // Resolve the exercise category — use subCategory bridge if available, else fallback to category
  const exerciseCategory = subCategory
    ? SUB_CATEGORY_CONFIGS[subCategory].exerciseCategory
    : category;

  const categoryConfig = CATEGORY_CONFIGS[exerciseCategory];
  const subCategoryConfig = subCategory ? SUB_CATEGORY_CONFIGS[subCategory] : null;
  const resolve = t ?? ((key: string) => key);

  // Step 1: Calculate phase durations
  const phaseDurations = calculatePhaseDurations(
    exerciseCategory,
    totalDuration,
    phaseStructure,
    input.customPhaseDurations
  );

  // Step 2: Build warmup phase
  const warmupExercises = selectExercisesForPhase(
    'warmup',
    exerciseCategory,
    skillFocus,
    phaseDurations.warmup,
    [],
    customExercises,
    favoriteIds
  );

  // Assign coaches to warmup exercises round-robin (if multiple coaches)
  let warmupCoachAssignments: Record<number, string | null> | undefined;
  if (numberOfCoaches > 1 && coachNames && Object.keys(coachNames).length > 0) {
    const coachIds = Object.keys(coachNames);
    warmupCoachAssignments = {};
    warmupExercises.forEach((_, idx) => {
      warmupCoachAssignments![idx] = coachIds[idx % coachIds.length];
    });
  }

  const warmupPhase: PhaseConfig = {
    type: 'warmup',
    label: getPhaseLabel('warmup'),
    durationMinutes: phaseDurations.warmup,
    percentageOfTotal: phaseDurations.warmup / totalDuration,
    exercises: warmupExercises,
    exerciseCoachAssignments: warmupCoachAssignments,
  };

  // Step 3: Build main phase
  const usedIds = warmupExercises.map((e) => e.id);
  let mainPhase: PhaseConfig;

  const maxStations = subCategoryConfig?.maxStations ?? categoryConfig.maxStations;

  if (numberOfCoaches > 1) {
    // Multi-coach: use stations
    const stationExercises = selectStationExercises(
      exerciseCategory,
      skillFocus,
      Math.min(numberOfCoaches, maxStations),
      usedIds,
      customExercises,
      favoriteIds
    );

    const stations = buildStations(
      stationExercises,
      numberOfCoaches,
      phaseDurations.main,
      stationCoachAssignments,
      coachNames
    );

    mainPhase = {
      type: 'main',
      label: getPhaseLabel('main'),
      durationMinutes: phaseDurations.main,
      percentageOfTotal: phaseDurations.main / totalDuration,
      exercises: [],
      stations,
    };
  } else {
    // Single coach: sequential exercises
    const mainExercises = selectExercisesForPhase(
      'main',
      exerciseCategory,
      skillFocus,
      phaseDurations.main,
      usedIds,
      customExercises,
      favoriteIds
    );

    mainPhase = {
      type: 'main',
      label: getPhaseLabel('main'),
      durationMinutes: phaseDurations.main,
      percentageOfTotal: phaseDurations.main / totalDuration,
      exercises: mainExercises,
    };
  }

  // Step 4: Build phases array
  const phases: PhaseConfig[] = [warmupPhase, mainPhase];

  // Collect all used exercise IDs
  const allUsedIds = [
    ...warmupExercises.map((e) => e.id),
    ...mainPhase.exercises.map((e) => e.id),
    ...(mainPhase.stations?.map((s) => s.exercise.id) ?? []),
  ];

  // Step 5: Build cooldown phase if 3-phase or 4-phase structure
  if ((phaseStructure === '3-phase' || phaseStructure === '4-phase') && phaseDurations.cooldown > 0) {
    // Find a 'hra' (game) exercise to use as the LAST cooldown exercise
    const allPool = [...ALL_EXERCISES, ...customExercises];
    const gameExercises = allPool.filter(
      (e) =>
        e.phaseType === 'cooldown' &&
        e.suitableFor.includes(exerciseCategory) &&
        e.skillFocus.includes('hra') &&
        !allUsedIds.includes(e.id)
    );
    // Pick one game exercise (with slight randomness)
    const gameEx = gameExercises.length > 0
      ? gameExercises[Math.floor(Math.random() * gameExercises.length)]
      : null;

    const gameExId = gameEx ? [gameEx.id] : [];
    const remainingCooldownDuration = gameEx
      ? Math.max(0, phaseDurations.cooldown - gameEx.duration.recommended)
      : phaseDurations.cooldown;

    // Fill remaining cooldown time (excluding game exercise)
    const cooldownExercises = remainingCooldownDuration >= 4
      ? selectExercisesForPhase(
          'cooldown',
          exerciseCategory,
          skillFocus,
          remainingCooldownDuration,
          [...allUsedIds, ...gameExId],
          customExercises,
          favoriteIds
        )
      : [];

    // Game exercise goes LAST
    const finalCooldownExercises = gameEx
      ? [...cooldownExercises, gameEx]
      : cooldownExercises;

    phases.push({
      type: 'cooldown',
      label: getPhaseLabel('cooldown'),
      durationMinutes: phaseDurations.cooldown,
      percentageOfTotal: phaseDurations.cooldown / totalDuration,
      exercises: finalCooldownExercises,
    });

    // Track used cooldown exercise IDs
    finalCooldownExercises.forEach(e => allUsedIds.push(e.id));
  }

  // Step 6: Build stretching phase if 4-phase structure
  if (phaseStructure === '4-phase' && phaseDurations.stretching > 0) {
    const stretchingExercises = selectExercisesForPhase(
      'stretching',
      exerciseCategory,
      skillFocus,
      phaseDurations.stretching,
      allUsedIds,
      customExercises,
      favoriteIds
    );

    phases.push({
      type: 'stretching',
      label: getPhaseLabel('stretching'),
      durationMinutes: phaseDurations.stretching,
      percentageOfTotal: phaseDurations.stretching / totalDuration,
      exercises: stretchingExercises,
    });
  }

  // Step 7: Generate title (localized if t() provided)
  const uLabelPrefix = selectedULabel ? `${selectedULabel} ` : '';
  const labelKey = subCategoryConfig?.label ?? categoryConfig.label;
  const focusLabel = skillFocus.length > 0
    ? skillFocus.slice(0, 2).map(sf => resolve(SKILL_FOCUS_CONFIGS[sf]?.label ?? sf)).join(', ')
    : resolve('generator.defaultFocus');

  const now = new Date().toISOString();

  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    title: `${uLabelPrefix}${resolve(labelKey)} – ${focusLabel}`,
    input,
    phases,
    totalDuration: phases.reduce((sum, p) => sum + p.durationMinutes, 0),
    isSaved: false,
  };
}
