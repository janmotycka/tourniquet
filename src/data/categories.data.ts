import type { AgeCategory, AgeCategoryConfig, ULabel, ULabelConfig } from '../types/category.types';

export const CATEGORY_CONFIGS: Record<AgeCategory, AgeCategoryConfig> = {
  pripravka: {
    id: 'pripravka',
    label: 'Přípravka',
    ageRange: '5–8 let',
    description: 'Hra, zábava a pohyb. Děti se učí milovat fotbal.',
    color: '#FF6B35',
    lightColor: '#FFF0EB',
    icon: 'emoticon-happy-outline',
    defaultPhaseStructure: '2-phase',
    recommendedDurations: [60, 75],
    maxStations: 3,
  },
  'mladsi-zaci': {
    id: 'mladsi-zaci',
    label: 'Mladší žáci',
    ageRange: '9–12 let',
    description: 'Technické základy a malé hry. Rozvoj individuálních dovedností.',
    color: '#4CAF50',
    lightColor: '#F0FBF0',
    icon: 'soccer',
    defaultPhaseStructure: '3-phase',
    recommendedDurations: [75, 90],
    maxStations: 4,
  },
  'starsi-zaci': {
    id: 'starsi-zaci',
    label: 'Starší žáci',
    ageRange: '13–15 let',
    description: 'Technika a základní taktika. Skupinová spolupráce.',
    color: '#2196F3',
    lightColor: '#EBF5FF',
    icon: 'trophy-outline',
    defaultPhaseStructure: '3-phase',
    recommendedDurations: [90, 105],
    maxStations: 4,
  },
  dorost: {
    id: 'dorost',
    label: 'Dorost',
    ageRange: '15–19 let',
    description: 'Pokročilá taktika, kondice a výkonnostní trénink.',
    color: '#9C27B0',
    lightColor: '#F5EBF9',
    icon: 'medal-outline',
    defaultPhaseStructure: '3-phase',
    recommendedDurations: [90, 105, 120],
    maxStations: 5,
  },
};

export const CATEGORY_LIST: AgeCategoryConfig[] = Object.values(CATEGORY_CONFIGS);

export const U_LABEL_CONFIGS: ULabelConfig[] = [
  { label: 'U7',  ageCategory: 'pripravka',   displayAge: 'do 7 let' },
  { label: 'U8',  ageCategory: 'pripravka',   displayAge: 'do 8 let' },
  { label: 'U9',  ageCategory: 'pripravka',   displayAge: 'do 9 let' },
  { label: 'U11', ageCategory: 'mladsi-zaci', displayAge: 'do 11 let' },
  { label: 'U12', ageCategory: 'mladsi-zaci', displayAge: 'do 12 let' },
  { label: 'U13', ageCategory: 'starsi-zaci', displayAge: 'do 13 let' },
  { label: 'U14', ageCategory: 'starsi-zaci', displayAge: 'do 14 let' },
  { label: 'U15', ageCategory: 'starsi-zaci', displayAge: 'do 15 let' },
  { label: 'U17', ageCategory: 'dorost',      displayAge: 'do 17 let' },
  { label: 'U19', ageCategory: 'dorost',      displayAge: 'do 19 let' },
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
