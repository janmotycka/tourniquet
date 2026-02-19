import { ALL_EXERCISES } from '../data/exercises/index';
import type { AgeCategory } from '../types/category.types';
import type { Exercise, PhaseType, SkillFocus } from '../types/exercise.types';

export function selectExercisesForPhase(
  phase: PhaseType,
  category: AgeCategory,
  skillFocus: SkillFocus[],
  targetDuration: number,
  excludeIds: string[] = [],
  extraExercises: Exercise[] = [],
  favoriteIds: string[] = []
): Exercise[] {
  const pool = [...ALL_EXERCISES, ...extraExercises];

  // Step 1: Filter by phase type, category suitability, and exclude already-used
  const candidates = pool.filter(
    (ex) =>
      ex.phaseType === phase &&
      ex.suitableFor.includes(category) &&
      !excludeIds.includes(ex.id)
  );

  if (candidates.length === 0) return [];

  // Step 2: Score by skill focus relevance + favorite bonus
  const scored = candidates.map((ex) => ({
    exercise: ex,
    score: ex.skillFocus.filter((sf) => skillFocus.includes(sf)).length
      + (favoriteIds.includes(ex.id) ? 2 : 0),
    // Add small random jitter for variety across generations
    jitter: Math.random() * 0.5,
  }));

  // Step 3: Sort by score descending, then by jitter (randomize ties)
  scored.sort((a, b) => {
    const scoreDiff = b.score + b.jitter - (a.score + a.jitter);
    return scoreDiff;
  });

  // Step 4: Greedy fill up to targetDuration
  const selected: Exercise[] = [];
  let accumulated = 0;

  for (const { exercise } of scored) {
    if (accumulated >= targetDuration) break;
    if (accumulated + exercise.duration.recommended > targetDuration * 1.15) {
      // Skip if would significantly overshoot
      continue;
    }
    selected.push(exercise);
    accumulated += exercise.duration.recommended;
  }

  // Step 5: If no exercises selected, take top ones regardless of duration
  if (selected.length === 0 && scored.length > 0) {
    selected.push(scored[0].exercise);
  }

  return selected;
}

export function selectStationExercises(
  category: AgeCategory,
  skillFocus: SkillFocus[],
  numberOfStations: number,
  excludeIds: string[] = [],
  extraExercises: Exercise[] = [],
  favoriteIds: string[] = []
): Exercise[] {
  const pool = [...ALL_EXERCISES, ...extraExercises];

  const stationCandidates = pool.filter(
    (ex) =>
      ex.phaseType === 'main' &&
      ex.suitableFor.includes(category) &&
      ex.isStation &&
      !excludeIds.includes(ex.id)
  );

  if (stationCandidates.length === 0) return [];

  const scored = stationCandidates.map((ex) => ({
    exercise: ex,
    score: ex.skillFocus.filter((sf) => skillFocus.includes(sf)).length
      + (favoriteIds.includes(ex.id) ? 2 : 0),
    jitter: Math.random() * 0.5,
  }));

  scored.sort((a, b) => b.score + b.jitter - (a.score + a.jitter));

  return scored.slice(0, numberOfStations).map((s) => s.exercise);
}
