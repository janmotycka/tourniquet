import type { AgeCategory, PhaseStructure, TrainingDuration } from '../types/category.types';
import type { PhaseType } from '../types/exercise.types';

interface PhaseDistribution {
  warmup: number;
  main: number;
  cooldown: number;
}

const PHASE_DISTRIBUTION: Record<AgeCategory, Record<PhaseStructure, PhaseDistribution>> = {
  pripravka: {
    '2-phase': { warmup: 0.30, main: 0.70, cooldown: 0 },
    '3-phase': { warmup: 0.20, main: 0.55, cooldown: 0.25 },
  },
  'mladsi-zaci': {
    '2-phase': { warmup: 0.25, main: 0.75, cooldown: 0 },
    '3-phase': { warmup: 0.18, main: 0.62, cooldown: 0.20 },
  },
  'starsi-zaci': {
    '2-phase': { warmup: 0.20, main: 0.80, cooldown: 0 },
    '3-phase': { warmup: 0.15, main: 0.65, cooldown: 0.20 },
  },
  dorost: {
    '2-phase': { warmup: 0.18, main: 0.82, cooldown: 0 },
    '3-phase': { warmup: 0.15, main: 0.60, cooldown: 0.25 },
  },
};

function roundToFive(minutes: number): number {
  return Math.round(minutes / 5) * 5;
}

export function calculatePhaseDurations(
  category: AgeCategory,
  totalMinutes: TrainingDuration,
  phaseStructure: PhaseStructure,
  overrides?: Partial<Record<PhaseType, number>>
): Record<PhaseType, number> {
  const distribution = PHASE_DISTRIBUTION[category][phaseStructure];

  if (overrides) {
    const warmup = overrides.warmup ?? roundToFive(distribution.warmup * totalMinutes);
    const cooldown = phaseStructure === '3-phase'
      ? (overrides.cooldown ?? roundToFive(distribution.cooldown * totalMinutes))
      : 0;
    const main = totalMinutes - warmup - cooldown;
    return { warmup, main, cooldown };
  }

  const warmup = roundToFive(distribution.warmup * totalMinutes);
  const cooldown = phaseStructure === '3-phase'
    ? roundToFive(distribution.cooldown * totalMinutes)
    : 0;
  const main = totalMinutes - warmup - cooldown;

  return { warmup, main, cooldown };
}

export function getPhaseLabel(type: PhaseType): string {
  const labels: Record<PhaseType, string> = {
    warmup: 'Rozcvičení',
    main: 'Hlavní část',
    cooldown: 'Závěrečná část',
  };
  return labels[type];
}
