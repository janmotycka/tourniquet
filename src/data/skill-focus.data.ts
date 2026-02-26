import type { AgeCategory, SubCategory } from '../types/category.types';
import type { SkillFocus } from '../types/exercise.types';

export interface SkillFocusConfig {
  id: SkillFocus;
  label: string;
  icon: string;
  description: string;
}

/** Maps SkillFocus ID → i18n key for label. Handles diacritics removal. */
function skillKey(id: SkillFocus): string {
  const map: Record<SkillFocus, string> = {
    koordinace: 'skill.koordinace',
    driblink: 'skill.driblink',
    'malá-hra': 'skill.mala-hra',
    prihrávky: 'skill.prihravky',
    střelba: 'skill.strelba',
    pozicování: 'skill.pozicovani',
    'obranná-hra': 'skill.obranna-hra',
    fyzička: 'skill.fyzicka',
    hlavičky: 'skill.hlavicky',
    hra: 'skill.hra',
  };
  return map[id];
}

export const SKILL_FOCUS_CONFIGS: Record<SkillFocus, SkillFocusConfig> = {
  koordinace: {
    id: 'koordinace',
    label: 'skill.koordinace',
    icon: 'run',
    description: 'skill.koordinace.desc',
  },
  driblink: {
    id: 'driblink',
    label: 'skill.driblink',
    icon: 'soccer',
    description: 'skill.driblink.desc',
  },
  'malá-hra': {
    id: 'malá-hra',
    label: 'skill.mala-hra',
    icon: 'account-group',
    description: 'skill.mala-hra.desc',
  },
  prihrávky: {
    id: 'prihrávky',
    label: 'skill.prihravky',
    icon: 'arrow-decision',
    description: 'skill.prihravky.desc',
  },
  střelba: {
    id: 'střelba',
    label: 'skill.strelba',
    icon: 'target',
    description: 'skill.strelba.desc',
  },
  pozicování: {
    id: 'pozicování',
    label: 'skill.pozicovani',
    icon: 'map-marker-multiple',
    description: 'skill.pozicovani.desc',
  },
  'obranná-hra': {
    id: 'obranná-hra',
    label: 'skill.obranna-hra',
    icon: 'shield-outline',
    description: 'skill.obranna-hra.desc',
  },
  fyzička: {
    id: 'fyzička',
    label: 'skill.fyzicka',
    icon: 'lightning-bolt',
    description: 'skill.fyzicka.desc',
  },
  hlavičky: {
    id: 'hlavičky',
    label: 'skill.hlavicky',
    icon: 'head',
    description: 'skill.hlavicky.desc',
  },
  hra: {
    id: 'hra',
    label: 'skill.hra',
    icon: 'soccer',
    description: 'skill.hra.desc',
  },
};

export { skillKey as getSkillI18nKey };

export const SKILL_FOCUS_BY_CATEGORY: Record<AgeCategory, SkillFocus[]> = {
  pripravka: ['koordinace', 'driblink', 'malá-hra'],
  'mladsi-zaci': ['prihrávky', 'driblink', 'střelba', 'malá-hra', 'koordinace'],
  'starsi-zaci': ['prihrávky', 'střelba', 'driblink', 'pozicování', 'obranná-hra', 'malá-hra'],
  dorost: ['prihrávky', 'střelba', 'pozicování', 'obranná-hra', 'fyzička', 'malá-hra', 'hlavičky'],
};

export const SKILL_FOCUS_BY_SUBCATEGORY: Record<SubCategory, SkillFocus[]> = {
  'mladsi-pripravka': ['koordinace', 'driblink', 'malá-hra'],
  'starsi-pripravka': ['koordinace', 'driblink', 'prihrávky', 'malá-hra'],
  'mladsi-zaci': ['prihrávky', 'driblink', 'střelba', 'malá-hra', 'koordinace'],
  'starsi-zaci': ['prihrávky', 'střelba', 'driblink', 'pozicování', 'obranná-hra', 'malá-hra'],
  'mladsi-dorost': ['prihrávky', 'střelba', 'pozicování', 'obranná-hra', 'fyzička', 'malá-hra', 'hlavičky'],
  'starsi-dorost': ['prihrávky', 'střelba', 'pozicování', 'obranná-hra', 'fyzička', 'malá-hra', 'hlavičky'],
};
