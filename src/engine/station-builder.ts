import type { Exercise } from '../types/exercise.types';
import type { Station } from '../types/phase.types';

let stationCounter = 0;

function generateStationId(): string {
  stationCounter++;
  return `station-${Date.now()}-${stationCounter}`;
}

export function buildStations(
  exercises: Exercise[],
  numberOfStations: number,
  mainPhaseDuration: number,
  coachAssignments?: Record<number, string | null>,
  coachNames?: Record<string, string>
): Station[] {
  if (exercises.length === 0 || numberOfStations <= 1) return [];

  const stationCount = Math.min(numberOfStations, exercises.length);
  const stationDuration = Math.round(mainPhaseDuration / stationCount / 5) * 5;

  return exercises.slice(0, stationCount).map((exercise, index) => {
    const stationNumber = index + 1;
    const coachId = coachAssignments?.[stationNumber] ?? null;
    const coachName = coachId && coachNames ? coachNames[coachId] : undefined;

    return {
      id: generateStationId(),
      stationNumber,
      exercise,
      durationMinutes: stationDuration,
      coachAssigned: coachId,
      coachName,
    };
  });
}
