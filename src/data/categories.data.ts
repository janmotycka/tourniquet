import type {
  AgeCategory,
  AgeCategoryConfig,
  ULabel,
  ULabelConfig,
  SubCategory,
  SubCategoryConfig,
  CategoryGroup,
  CategoryGroupConfig,
} from '../types/category.types';

// ─── Legacy AgeCategory configs (kept for backward compat) ─────────────────

export const CATEGORY_CONFIGS: Record<AgeCategory, AgeCategoryConfig> = {
  pripravka: {
    id: 'pripravka',
    label: 'category.pripravka',
    ageRange: 'category.pripravka.age',
    description: 'category.pripravka.desc',
    color: '#FF6B35',
    lightColor: '#FFF0EB',
    icon: 'emoticon-happy-outline',
    defaultPhaseStructure: '2-phase',
    recommendedDurations: [60, 75],
    maxStations: 3,
  },
  'mladsi-zaci': {
    id: 'mladsi-zaci',
    label: 'category.mladsizaci',
    ageRange: 'category.mladsizaci.age',
    description: 'category.mladsizaci.desc',
    color: '#4CAF50',
    lightColor: '#F0FBF0',
    icon: 'soccer',
    defaultPhaseStructure: '3-phase',
    recommendedDurations: [75, 90],
    maxStations: 4,
  },
  'starsi-zaci': {
    id: 'starsi-zaci',
    label: 'category.starsizaci',
    ageRange: 'category.starsizaci.age',
    description: 'category.starsizaci.desc',
    color: '#2196F3',
    lightColor: '#EBF5FF',
    icon: 'trophy-outline',
    defaultPhaseStructure: '3-phase',
    recommendedDurations: [90, 105],
    maxStations: 4,
  },
  dorost: {
    id: 'dorost',
    label: 'category.dorost',
    ageRange: 'category.dorost.age',
    description: 'category.dorost.desc',
    color: '#9C27B0',
    lightColor: '#F5EBF9',
    icon: 'medal-outline',
    defaultPhaseStructure: '3-phase',
    recommendedDurations: [90, 105, 120],
    maxStations: 5,
  },
};

export const CATEGORY_LIST: AgeCategoryConfig[] = Object.values(CATEGORY_CONFIGS);

// ─── SubCategory configs (new 6-value structure) ───────────────────────────

export const SUB_CATEGORY_CONFIGS: Record<SubCategory, SubCategoryConfig> = {
  'mladsi-pripravka': {
    id: 'mladsi-pripravka',
    group: 'pripravka',
    label: 'subcategory.mladsiPripravka',
    ageRange: 'subcategory.mladsiPripravka.age',
    description: 'subcategory.mladsiPripravka.desc',
    color: '#FF6B35',
    lightColor: '#FFF0EB',
    icon: '😊',
    exerciseCategory: 'pripravka',
    defaultPhaseStructure: '2-phase',
    recommendedDuration: 60,
    maxStations: 3,
    uLabels: ['U7', 'U8', 'U9'],
  },
  'starsi-pripravka': {
    id: 'starsi-pripravka',
    group: 'pripravka',
    label: 'subcategory.starsiPripravka',
    ageRange: 'subcategory.starsiPripravka.age',
    description: 'subcategory.starsiPripravka.desc',
    color: '#FF8F35',
    lightColor: '#FFF4EB',
    icon: '🌟',
    exerciseCategory: 'mladsi-zaci',
    defaultPhaseStructure: '3-phase',
    recommendedDuration: 75,
    maxStations: 3,
    uLabels: ['U11'],
  },
  'mladsi-zaci': {
    id: 'mladsi-zaci',
    group: 'zaci',
    label: 'subcategory.mladsiZaci',
    ageRange: 'subcategory.mladsiZaci.age',
    description: 'subcategory.mladsiZaci.desc',
    color: '#4CAF50',
    lightColor: '#F0FBF0',
    icon: '⚽',
    exerciseCategory: 'mladsi-zaci',
    defaultPhaseStructure: '3-phase',
    recommendedDuration: 75,
    maxStations: 4,
    uLabels: ['U12', 'U13'],
  },
  'starsi-zaci': {
    id: 'starsi-zaci',
    group: 'zaci',
    label: 'subcategory.starsiZaci',
    ageRange: 'subcategory.starsiZaci.age',
    description: 'subcategory.starsiZaci.desc',
    color: '#2196F3',
    lightColor: '#EBF5FF',
    icon: '🏆',
    exerciseCategory: 'starsi-zaci',
    defaultPhaseStructure: '3-phase',
    recommendedDuration: 90,
    maxStations: 4,
    uLabels: ['U14', 'U15'],
  },
  'mladsi-dorost': {
    id: 'mladsi-dorost',
    group: 'dorost',
    label: 'subcategory.mladsiDorost',
    ageRange: 'subcategory.mladsiDorost.age',
    description: 'subcategory.mladsiDorost.desc',
    color: '#9C27B0',
    lightColor: '#F5EBF9',
    icon: '🥇',
    exerciseCategory: 'dorost',
    defaultPhaseStructure: '3-phase',
    recommendedDuration: 90,
    maxStations: 5,
    uLabels: ['U17'],
  },
  'starsi-dorost': {
    id: 'starsi-dorost',
    group: 'dorost',
    label: 'subcategory.starsiDorost',
    ageRange: 'subcategory.starsiDorost.age',
    description: 'subcategory.starsiDorost.desc',
    color: '#7B1FA2',
    lightColor: '#F0E6F6',
    icon: '💪',
    exerciseCategory: 'dorost',
    defaultPhaseStructure: '4-phase',
    recommendedDuration: 105,
    maxStations: 5,
    uLabels: ['U19'],
  },
};

export const SUB_CATEGORY_LIST: SubCategoryConfig[] = Object.values(SUB_CATEGORY_CONFIGS);

// ─── CategoryGroup configs ─────────────────────────────────────────────────

export const CATEGORY_GROUP_CONFIGS: Record<CategoryGroup, CategoryGroupConfig> = {
  pripravka: {
    id: 'pripravka',
    label: 'group.pripravka',
    color: '#FF6B35',
    icon: '😊',
    subcategories: ['mladsi-pripravka', 'starsi-pripravka'],
  },
  zaci: {
    id: 'zaci',
    label: 'group.zaci',
    color: '#4CAF50',
    icon: '⚽',
    subcategories: ['mladsi-zaci', 'starsi-zaci'],
  },
  dorost: {
    id: 'dorost',
    label: 'group.dorost',
    color: '#9C27B0',
    icon: '🥇',
    subcategories: ['mladsi-dorost', 'starsi-dorost'],
  },
};

export const CATEGORY_GROUP_LIST: CategoryGroupConfig[] = Object.values(CATEGORY_GROUP_CONFIGS);

// ─── U-Label configs ───────────────────────────────────────────────────────

export const U_LABEL_CONFIGS: ULabelConfig[] = [
  { label: 'U7',  ageCategory: 'pripravka',   subCategory: 'mladsi-pripravka', maxAge: 7 },
  { label: 'U8',  ageCategory: 'pripravka',   subCategory: 'mladsi-pripravka', maxAge: 8 },
  { label: 'U9',  ageCategory: 'pripravka',   subCategory: 'mladsi-pripravka', maxAge: 9 },
  { label: 'U11', ageCategory: 'mladsi-zaci', subCategory: 'starsi-pripravka', maxAge: 11 },
  { label: 'U12', ageCategory: 'mladsi-zaci', subCategory: 'mladsi-zaci',      maxAge: 12 },
  { label: 'U13', ageCategory: 'starsi-zaci', subCategory: 'mladsi-zaci',      maxAge: 13 },
  { label: 'U14', ageCategory: 'starsi-zaci', subCategory: 'starsi-zaci',      maxAge: 14 },
  { label: 'U15', ageCategory: 'starsi-zaci', subCategory: 'starsi-zaci',      maxAge: 15 },
  { label: 'U17', ageCategory: 'dorost',      subCategory: 'mladsi-dorost',    maxAge: 17 },
  { label: 'U19', ageCategory: 'dorost',      subCategory: 'starsi-dorost',    maxAge: 19 },
];

export const U_LABELS_BY_CATEGORY: Record<AgeCategory, ULabel[]> = {
  pripravka:       ['U7', 'U8', 'U9'],
  'mladsi-zaci':   ['U11', 'U12'],
  'starsi-zaci':   ['U13', 'U14', 'U15'],
  dorost:          ['U17', 'U19'],
};

export const U_LABEL_MAP: Record<ULabel, AgeCategory> = Object.fromEntries(
  U_LABEL_CONFIGS.map(c => [c.label, c.ageCategory])
) as Record<ULabel, AgeCategory>;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Get the internal AgeCategory for exercise filtering from a SubCategory */
export function getExerciseCategory(sub: SubCategory): AgeCategory {
  return SUB_CATEGORY_CONFIGS[sub].exerciseCategory;
}

/** Get SubCategory from a ULabel */
export function getSubCategoryForULabel(ul: ULabel): SubCategory {
  const cfg = U_LABEL_CONFIGS.find(c => c.label === ul);
  return cfg?.subCategory ?? 'mladsi-pripravka';
}
