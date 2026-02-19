import type { AgeCategory, TrainingDuration, PhaseStructure, ULabel } from './category.types';
import type { Exercise, SkillFocus, PhaseType } from './exercise.types';
import type { PhaseConfig } from './phase.types';

export interface GeneratorInput {
  category: AgeCategory;
  selectedULabel?: ULabel;
  totalDuration: TrainingDuration;
  skillFocus: SkillFocus[];
  numberOfCoaches: number;
  numberOfPlayers?: number;
  phaseStructure: PhaseStructure;
  customPhaseDurations?: Partial<Record<PhaseType, number>>;
  stationCoachAssignments?: Record<number, string | null>;
  customExercises?: Exercise[];
}

export interface TrainingUnit {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  input: GeneratorInput;
  phases: PhaseConfig[];
  totalDuration: number;
  isSaved: boolean;
  userNotes?: string;
  scheduledDate?: string; // ISO date YYYY-MM-DD
}
