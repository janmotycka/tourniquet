export type AgeCategory =
  | 'pripravka'
  | 'mladsi-zaci'
  | 'starsi-zaci'
  | 'dorost';

export type TrainingDuration = 60 | 75 | 90 | 105 | 120;

export type PhaseStructure = '2-phase' | '3-phase';

export type ULabel =
  | 'U7' | 'U8' | 'U9'
  | 'U11' | 'U12'
  | 'U13' | 'U14' | 'U15'
  | 'U17' | 'U19';

export interface ULabelConfig {
  label: ULabel;
  ageCategory: AgeCategory;
  displayAge: string;
}

export interface AgeCategoryConfig {
  id: AgeCategory;
  label: string;
  ageRange: string;
  description: string;
  color: string;
  lightColor: string;
  icon: string;
  defaultPhaseStructure: PhaseStructure;
  recommendedDurations: TrainingDuration[];
  maxStations: number;
}
