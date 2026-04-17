/**
 * Sport — sdílený discriminator napříč moduly.
 *
 * Aplikace je multi-sport ready. Nová entita (tournament, match, club) MUSÍ
 * nést `sport` field. Backward-compat: entity bez sport fieldu = 'football'.
 *
 * Přidání nového sportu:
 * 1. Přidat do Sport union typu níže
 * 2. Přidat do SPORTS pole s metadatou (label, icon)
 * 3. Implementovat sport-specific logic v modulech, které ho podporují
 */

export type Sport = 'football' | 'tennis';

export interface SportMeta {
  id: Sport;
  icon: string;
  labelKey: string;  // i18n klíč pro název
  shortLabelKey: string;
}

export const SPORTS: SportMeta[] = [
  { id: 'football', icon: '⚽', labelKey: 'sport.football', shortLabelKey: 'sport.football' },
  { id: 'tennis',   icon: '🎾', labelKey: 'sport.tennis',   shortLabelKey: 'sport.tennis' },
];

export const DEFAULT_SPORT: Sport = 'football';

/** Helper — vrátí sport entity nebo default 'football' pro backward-compat. */
export function resolveSport(value: Sport | undefined | null): Sport {
  return value ?? DEFAULT_SPORT;
}

/** Helper — vrátí icon pro daný sport. */
export function sportIcon(sport: Sport | undefined | null): string {
  const s = resolveSport(sport);
  return SPORTS.find(sp => sp.id === s)?.icon ?? '⚽';
}
