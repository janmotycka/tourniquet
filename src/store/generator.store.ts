import { create } from 'zustand';
import type { AgeCategory, PhaseStructure, TrainingDuration, ULabel } from '../types/category.types';
import type { PhaseType, SkillFocus } from '../types/exercise.types';
import type { TrainingUnit } from '../types/training.types';

interface GeneratorState {
  category: AgeCategory | null;
  selectedULabel: ULabel | null;
  totalDuration: TrainingDuration;
  skillFocus: SkillFocus[];
  numberOfCoaches: number;
  numberOfPlayers: number;
  phaseStructure: PhaseStructure | null;
  customPhaseDurations: Partial<Record<PhaseType, number>>;
  stationCoachAssignments: Record<number, string | null>;
  generatedUnit: TrainingUnit | null;

  setULabel: (label: ULabel, category: AgeCategory) => void;
  setCategory: (category: AgeCategory) => void;
  setTotalDuration: (duration: TrainingDuration) => void;
  toggleSkillFocus: (skill: SkillFocus) => void;
  setNumberOfCoaches: (n: number) => void;
  setNumberOfPlayers: (n: number) => void;
  setPhaseStructure: (structure: PhaseStructure) => void;
  setCustomPhaseDurations: (durations: Partial<Record<PhaseType, number>>) => void;
  setStationCoachAssignment: (stationNumber: number, coachId: string | null) => void;
  setGeneratedUnit: (unit: TrainingUnit) => void;
  reset: () => void;
}

const initialState = {
  category: null as AgeCategory | null,
  selectedULabel: null as ULabel | null,
  totalDuration: 90 as TrainingDuration,
  skillFocus: [] as SkillFocus[],
  numberOfCoaches: 1,
  numberOfPlayers: 12,
  phaseStructure: null as PhaseStructure | null,
  customPhaseDurations: {} as Partial<Record<PhaseType, number>>,
  stationCoachAssignments: {} as Record<number, string | null>,
  generatedUnit: null as TrainingUnit | null,
};

export const useGeneratorStore = create<GeneratorState>((set) => ({
  ...initialState,

  setULabel: (label, category) =>
    set({
      selectedULabel: label,
      category,
      phaseStructure: category === 'pripravka' ? '2-phase' : '3-phase',
      skillFocus: [],
      customPhaseDurations: {},
      stationCoachAssignments: {},
    }),

  setCategory: (category) =>
    set({
      category,
      selectedULabel: null,
      phaseStructure: category === 'pripravka' ? '2-phase' : '3-phase',
      skillFocus: [],
      customPhaseDurations: {},
      stationCoachAssignments: {},
    }),

  setTotalDuration: (totalDuration) =>
    set({ totalDuration, customPhaseDurations: {} }),

  toggleSkillFocus: (skill) =>
    set((state) => ({
      skillFocus: state.skillFocus.includes(skill)
        ? state.skillFocus.filter((s) => s !== skill)
        : state.skillFocus.length < 3
        ? [...state.skillFocus, skill]
        : state.skillFocus,
    })),

  setNumberOfCoaches: (numberOfCoaches) =>
    set({ numberOfCoaches, stationCoachAssignments: {} }),

  setNumberOfPlayers: (numberOfPlayers) => set({ numberOfPlayers }),

  setPhaseStructure: (phaseStructure) =>
    set({ phaseStructure, customPhaseDurations: {} }),

  setCustomPhaseDurations: (customPhaseDurations) =>
    set({ customPhaseDurations }),

  setStationCoachAssignment: (stationNumber, coachId) =>
    set((state) => ({
      stationCoachAssignments: {
        ...state.stationCoachAssignments,
        [stationNumber]: coachId,
      },
    })),

  setGeneratedUnit: (generatedUnit) => set({ generatedUnit }),

  reset: () => set(initialState),
}));
