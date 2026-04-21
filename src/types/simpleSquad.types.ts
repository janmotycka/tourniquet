/**
 * SimpleSquad — lehká soupiska pro Simple mode.
 *
 * Scénář: učitel TV jede s dětmi na McDonald's Cup. Hraje 4-8 zápasů za
 * den se stejnou partou. Nechce pokaždé vypisovat 12 jmen.
 *
 * Řešení: jednoduchý seznam jmen bez vazby na klub. Učitel si může mít
 * víc part (3.A, 3.B, holky…). Parta se nabídne v QuickMatchSheet.
 *
 * Není to klub (žádné role, členství, sdílení, kategorie). Je to prostě
 * jméno + pole jmen hráčů.
 */

import type { Sport } from './sport.types';

export interface SimpleSquad {
  id: string;
  ownerUid: string;
  name: string;                    // "3.A", "Středeční parta"
  sport: Sport;                    // pro filtrování
  players: string[];               // jen jména, žádné ID, dresy, kategorie
  /** Kolikrát už byla parta použita — pro řazení nejčastěji-používaných nahoru. */
  usageCount?: number;
  /** Poslední použití — pro sekundární řazení. */
  lastUsedAt?: string;             // ISO
  createdAt: string;
  updatedAt: string;
}

export interface CreateSimpleSquadInput {
  name: string;
  sport: Sport;
  players: string[];
}
