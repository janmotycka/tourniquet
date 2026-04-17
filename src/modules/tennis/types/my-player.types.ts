/**
 * MyPlayer — hráč tracknutý individuálním trenérem nebo rodičem.
 *
 * Na rozdíl od `ClubPlayer` není vázán na klub ani kategorii oddílu.
 * Rodič/trenér si vede flat list lidí, které sleduje (vlastní dítě,
 * svěřenec privátního kouče). Každý má jen to co dává smysl pro tenisu
 * jednotlivce — věkovou kategorii a volitelně externí ID (ČTenis).
 */

import type { AgeCategory } from '../../../types/club.types';

export interface MyPlayer {
  id: string;
  /** Jméno a příjmení. */
  name: string;
  /** Rok narození (volitelný — pro automatickou kategorii). */
  birthYear?: number | null;
  /** Věková kategorie podle ČTenis (Minitenis, Babytenis, …). */
  category?: AgeCategory;
  /** ID v ČTenis systému (pokud trenér zná). Pro budoucí sync / deep-link. */
  cztenisId?: string;
  /** Klub, za který hráč aktuálně hraje (volný text — hráč může střídat kluby). */
  currentClub?: string;
  /** Poznámky trenéra/rodiče (formativní, cíle, slabiny). */
  notes?: string;
  /** Vztah k uživateli (dítě / svěřenec / já). Pro zobrazení, ne pro logiku. */
  relation?: 'child' | 'student' | 'self' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface CreateMyPlayerInput {
  name: string;
  birthYear?: number | null;
  category?: AgeCategory;
  cztenisId?: string;
  currentClub?: string;
  notes?: string;
  relation?: 'child' | 'student' | 'self' | 'other';
}
