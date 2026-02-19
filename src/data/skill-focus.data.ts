import type { AgeCategory } from '../types/category.types';
import type { SkillFocus } from '../types/exercise.types';

export interface SkillFocusConfig {
  id: SkillFocus;
  label: string;
  icon: string;
  description: string;
}

export const SKILL_FOCUS_CONFIGS: Record<SkillFocus, SkillFocusConfig> = {
  koordinace: {
    id: 'koordinace',
    label: 'Koordinace',
    icon: 'run',
    description: 'Pohybová koordinace a motorika',
  },
  driblink: {
    id: 'driblink',
    label: 'Driblink',
    icon: 'soccer',
    description: 'Vedení míče a obcházení soupeře',
  },
  'malá-hra': {
    id: 'malá-hra',
    label: 'Malá hra',
    icon: 'account-group',
    description: 'Herní situace a spolupráce v malých skupinách',
  },
  prihrávky: {
    id: 'prihrávky',
    label: 'Přihrávky',
    icon: 'arrow-decision',
    description: 'Přesnost přihrávky a zpracování míče',
  },
  střelba: {
    id: 'střelba',
    label: 'Střelba',
    icon: 'target',
    description: 'Střelba na bránu a finalizace',
  },
  pozicování: {
    id: 'pozicování',
    label: 'Pozicování',
    icon: 'map-marker-multiple',
    description: 'Pohyb bez míče a taktické rozestavení',
  },
  'obranná-hra': {
    id: 'obranná-hra',
    label: 'Obranná hra',
    icon: 'shield-outline',
    description: 'Obranné principy a pressing',
  },
  fyzička: {
    id: 'fyzička',
    label: 'Fyzička',
    icon: 'lightning-bolt',
    description: 'Kondice, rychlost a vytrvalost',
  },
  hlavičky: {
    id: 'hlavičky',
    label: 'Hlavičky',
    icon: 'head',
    description: 'Hra hlavou a vzdušné souboje',
  },
  hra: {
    id: 'hra',
    label: 'Hra',
    icon: 'soccer',
    description: 'Závěrečná fotbalová hra — všichni zapojeni',
  },
};

export const SKILL_FOCUS_BY_CATEGORY: Record<AgeCategory, SkillFocus[]> = {
  pripravka: ['koordinace', 'driblink', 'malá-hra'],
  'mladsi-zaci': ['prihrávky', 'driblink', 'střelba', 'malá-hra', 'koordinace'],
  'starsi-zaci': ['prihrávky', 'střelba', 'driblink', 'pozicování', 'obranná-hra', 'malá-hra'],
  dorost: ['prihrávky', 'střelba', 'pozicování', 'obranná-hra', 'fyzička', 'malá-hra', 'hlavičky'],
};
