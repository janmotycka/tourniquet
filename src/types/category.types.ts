export type AgeCategory =
  | 'pripravka'
  | 'mladsi-zaci'
  | 'starsi-zaci'
  | 'dorost';

export type SubCategory =
  | 'mladsi-pripravka'
  | 'starsi-pripravka'
  | 'mladsi-zaci'
  | 'starsi-zaci'
  | 'mladsi-dorost'
  | 'starsi-dorost';

export type CategoryGroup = 'pripravka' | 'zaci' | 'dorost';

export type TrainingDuration = number;

export type PhaseStructure = '2-phase' | '3-phase' | '4-phase';

export type ULabel =
  | 'U7' | 'U8' | 'U9'
  | 'U11' | 'U12'
  | 'U13' | 'U14' | 'U15'
  | 'U17' | 'U19';

export interface ULabelConfig {
  label: ULabel;
  ageCategory: AgeCategory;
  subCategory: SubCategory;
  maxAge: number;
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

export interface SubCategoryConfig {
  id: SubCategory;
  group: CategoryGroup;
  label: string;
  ageRange: string;
  description: string;
  color: string;
  lightColor: string;
  icon: string;
  exerciseCategory: AgeCategory;
  defaultPhaseStructure: PhaseStructure;
  recommendedDuration: number;
  maxStations: number;
  uLabels: ULabel[];
}

export interface CategoryGroupConfig {
  id: CategoryGroup;
  label: string;
  color: string;
  icon: string;
  subcategories: SubCategory[];
}
