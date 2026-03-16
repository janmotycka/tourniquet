/**
 * Firebase Realtime Database — Catalog service
 *
 * Lightweight public index of tournaments for the landing page.
 * Path: /catalog/{tournamentId}
 */

import { ref, set, remove, onValue, off, DataSnapshot } from 'firebase/database';
import { db } from '../firebase';
import type { Tournament, CatalogEntry, TournamentFormat } from '../types/tournament.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const catalogRef = () => ref(db, 'catalog');
const catalogEntryRef = (id: string) => ref(db, `catalog/${id}`);

// ─── Konverze ────────────────────────────────────────────────────────────────

/** Vytvoří odlehčený záznam katalogu z plného turnaje */
export function toCatalogEntry(tournament: Tournament): CatalogEntry {
  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    startDate: tournament.settings.startDate,
    startTime: tournament.settings.startTime,
    teamCount: tournament.teams.length,
    teamNames: tournament.teams.map(t => t.name),
    teamColors: tournament.teams.map(t => t.color),
    format: tournament.settings.format ?? 'round-robin',
    ownerUid: tournament.ownerUid,
    updatedAt: tournament.updatedAt,
  };
}

// ─── Zápis ───────────────────────────────────────────────────────────────────

/** Uloží/aktualizuje záznam v katalogu */
export async function saveCatalogEntry(tournament: Tournament): Promise<void> {
  const entry = toCatalogEntry(tournament);
  await set(catalogEntryRef(tournament.id), entry);
}

/** Smaže záznam z katalogu */
export async function deleteCatalogEntry(tournamentId: string): Promise<void> {
  await remove(catalogEntryRef(tournamentId));
}

// ─── Real-time listener ──────────────────────────────────────────────────────

/** Subscribuje na celý katalog — vrací pole katalogových záznamů */
export function subscribeToCatalog(
  callback: (entries: CatalogEntry[]) => void,
): () => void {
  const r = catalogRef();

  const handler = (snapshot: DataSnapshot) => {
    const entries: CatalogEntry[] = [];
    if (snapshot.exists()) {
      const data = snapshot.val() as Record<string, unknown>;
      for (const val of Object.values(data)) {
        const entry = val as CatalogEntry;
        // Normalizace — zajistíme že teamNames a teamColors jsou vždy array
        if (!Array.isArray(entry.teamNames)) {
          entry.teamNames = typeof entry.teamNames === 'object' && entry.teamNames
            ? Object.values(entry.teamNames)
            : [];
        }
        if (!Array.isArray(entry.teamColors)) {
          entry.teamColors = typeof entry.teamColors === 'object' && entry.teamColors
            ? Object.values(entry.teamColors)
            : [];
        }
        entry.format = entry.format ?? ('round-robin' as TournamentFormat);
        entries.push(entry);
      }
    }
    callback(entries);
  };

  onValue(r, handler, () => callback([]));
  return () => off(r, 'value', handler);
}
