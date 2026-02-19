import type { Exercise, PhaseType } from './exercise.types';

export interface Station {
  id: string;
  stationNumber: number;
  exercise: Exercise;
  durationMinutes: number;
  coachAssigned: string | null;  // coachId or null for unmanned station
  coachName?: string;            // resolved display name at generation time
}

export interface PhaseConfig {
  type: PhaseType;
  label: string;
  durationMinutes: number;
  percentageOfTotal: number;
  exercises: Exercise[];
  stations?: Station[];
  exerciseCoachAssignments?: Record<number, string | null>; // exercise index → coachId
  notes?: string;
}
