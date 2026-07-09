/**
 * Sport — sdílený discriminator napříč entitami.
 *
 * Audit 2026-07-09 (osekání na jádro): tenisový a florbalový modul SMAZÁNY
 * (~7 300 řádků) — byly za vypnutým flagem, nový uživatel se k nim nedostal
 * a každá match/tournament cesta platila trvalou „what if tennis" daň.
 * Git historie vše uchová; případná budoucí expanze = nový modul + rozšíření
 * tohoto union typu.
 *
 * `sport` field na entitách (SeasonMatch, Tournament, Club) ZŮSTÁVÁ kvůli
 * forward-compat a existujícím datům — backward-compat: entity bez sport
 * fieldu = 'football' (resolveSport).
 */

export type Sport = 'football';

export interface SportMeta {
  id: Sport;
  icon: string;
  labelKey: string;  // i18n klíč pro název
  shortLabelKey: string;
}

export const SPORTS: SportMeta[] = [
  { id: 'football', icon: '⚽', labelKey: 'sport.football', shortLabelKey: 'sport.football' },
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
