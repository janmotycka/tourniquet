/**
 * MatchEvent — „Den zápasů" / školní turnaj.
 *
 * Ultra-jednoduchý nástroj pro:
 * - Učitele tělocviku na turnaji s dětmi (3.A hraje 3.B a pak 4.A)
 * - Trenéra amatérů na přáteláku (2 zápasy za sebou, bez sestav)
 * - Rodiče chtějí vidět skóre živě → veřejný odkaz
 *
 * Co NEMÁ (záměrně): sestavy, hráči, ratings, kategorie, kluby, FAČR report.
 * Co MÁ: název, datum, seznam zápasů (tým A vs tým B + skóre).
 */

import type { Sport } from './sport.types';

export type MatchEventMatchStatus = 'planned' | 'live' | 'finished';

export interface MatchEventMatch {
  id: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  status: MatchEventMatchStatus;
  /** Volitelná kategorie zápasu — např. „Chlapci 3.tř", „Finále". */
  note?: string;
  startedAt?: string;   // ISO
  finishedAt?: string;  // ISO
}

export interface MatchEvent {
  id: string;
  ownerUid: string;
  name: string;                // „Turnaj 3.A ve fotbale"
  date: string;                // YYYY-MM-DD
  sport: Sport | 'other';
  venue?: string;              // „Tělocvična", „Hřiště u školy"
  note?: string;
  isPublic: boolean;
  matches: MatchEventMatch[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMatchEventInput {
  name: string;
  date: string;
  sport: Sport | 'other';
  venue?: string;
  note?: string;
  matches?: Array<{ teamA: string; teamB: string; note?: string }>;
}

/** Veřejná verze (pro /public-match-events/, bez ownerUid pro GDPR). */
export interface PublicMatchEvent {
  id: string;
  ownerUid: string;            // pro rules .write kontrolu
  name: string;
  date: string;
  sport: Sport | 'other';
  venue?: string;
  matches: MatchEventMatch[];
  updatedAt: string;
}
