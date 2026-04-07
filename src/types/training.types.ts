import type { AgeCategory, TrainingDuration, PhaseStructure, ULabel, SubCategory } from './category.types';
import type { Exercise, SkillFocus, PhaseType } from './exercise.types';
import type { PhaseConfig } from './phase.types';
import type { AgeCategory as ClubAgeCategory } from './club.types';

// ─── Docházka na trénink ────────────────────────────────────────────────────
export type AttendanceStatus = 'present' | 'absent' | 'excused';
export type TrainingAttendance = Record<string, AttendanceStatus>;

export interface GeneratorInput {
  category: AgeCategory;
  subCategory?: SubCategory;
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
  scheduledTime?: string; // HH:MM (volitelné)

  // Přiřazení k týmu/kategorii klubu (Phase 3 — kalendářová událost)
  clubId?: string;
  clubAgeCategory?: ClubAgeCategory;

  // Docházka — playerId → status; existuje až po vyplnění
  attendance?: TrainingAttendance;
}
