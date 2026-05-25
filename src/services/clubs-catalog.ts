/**
 * clubsCatalog — sdílený loader pro klubový katalog (FAČR kluby).
 *
 * Audit 2026-05-25: extrahováno z OpponentAutocomplete.tsx, aby šlo
 * reuse v QuickMatchSheet bez Fast Refresh lint error (component file
 * smí exportovat jen komponenty).
 *
 * Module-level cache — sdíleno napříč všemi callery, jeden Firebase fetch
 * za session. Subsequent calls vrátí cached promise.
 */

import { ref as dbRef, get as dbGet } from 'firebase/database';
import { db } from '../firebase';
import { logger } from '../utils/logger';
import type { Sport } from '../types/sport.types';

export interface CatalogClub {
  id: string;
  name: string;
  city?: string;
  logoUrl?: string;
  logoBase64?: string;
  source?: string;
  /** Sport katalogového záznamu. Legacy záznamy bez sport = 'football'. */
  sport?: Sport;
}

let cachedCatalog: CatalogClub[] | null = null;
let catalogLoading: Promise<CatalogClub[]> | null = null;

export async function loadClubsCatalog(): Promise<CatalogClub[]> {
  if (cachedCatalog) return cachedCatalog;
  if (catalogLoading) return catalogLoading;

  catalogLoading = dbGet(dbRef(db, 'clubsCatalog'))
    .then(snap => {
      const data = snap.val() as Record<string, CatalogClub> | null;
      cachedCatalog = data ? Object.values(data) : [];
      return cachedCatalog;
    })
    .catch(err => {
      logger.warn('[clubsCatalog] Catalog load failed:', err);
      cachedCatalog = [];
      return cachedCatalog;
    })
    .finally(() => {
      catalogLoading = null;
    });

  return catalogLoading;
}
