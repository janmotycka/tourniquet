import type { Exercise } from '../../types/exercise.types';
import { pripravkaExercises } from './pripravka.exercises';
import { mladsiZaciExercises } from './mladsizaci.exercises';
import { starsiZaciExercises } from './starsizaci.exercises';
import { dorostExercises } from './dorost.exercises';
import { stretchingExercises } from './stretching.exercises';
import { freePlayExercises } from './freeplay.exercises';

export const ALL_EXERCISES: Exercise[] = [
  ...pripravkaExercises,
  ...mladsiZaciExercises,
  ...starsiZaciExercises,
  ...dorostExercises,
  ...stretchingExercises,
  ...freePlayExercises,
];

export {
  pripravkaExercises,
  mladsiZaciExercises,
  starsiZaciExercises,
  dorostExercises,
  stretchingExercises,
  freePlayExercises,
};
