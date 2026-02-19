import type { AgeCategory } from './category.types';

export type SkillFocus =
  | 'prihrávky'
  | 'střelba'
  | 'driblink'
  | 'pozicování'
  | 'fyzička'
  | 'hlavičky'
  | 'obranná-hra'
  | 'malá-hra'
  | 'koordinace'
  | 'hra';

export type PhaseType = 'warmup' | 'main' | 'cooldown';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Exercise {
  id: string;
  name: string;
  description: string;
  instructions: string[];
  duration: {
    min: number;
    max: number;
    recommended: number;
  };
  players: {
    min: number;
    max: number | 'unlimited';
  };
  equipment: string[];
  phaseType: PhaseType;
  skillFocus: SkillFocus[];
  suitableFor: AgeCategory[];
  difficulty: DifficultyLevel;
  coachTip?: string;
  variations?: string[];
  isStation: boolean;
  isCustom?: boolean;
}
