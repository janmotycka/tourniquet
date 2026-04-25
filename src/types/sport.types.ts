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

export type Sport = 'football' | 'tennis' | 'floorball';

export interface SportMeta {
  id: Sport;
  icon: string;
  labelKey: string;  // i18n klíč pro název
  shortLabelKey: string;
}

// Audit 2026-04-25 (public launch focus): Tenis a florbal se připravovaly
// jako vedlejší produkty, ale pro veřejné spuštění to rozptyluje pozornost.
// Fokus = amatérský fotbal + školní/firemní turnaje (největší český trh,
// kde pořádáme vlastní turnaje a máme reálné kontakty).
//
// Tenis a florbal zůstávají v kódu kvůli existing users (graceful degradation):
// - Pokud user už má preferredSport='tennis'|'floorball' z minulosti, dál
//   funguje. Ale nově se k němu nedostane (sport picker, settings switch).
// - SPORTS pole obsahuje vše pro internal použití (i18n, sport-isolation).
// - ENABLED_SPORTS určuje, co je viditelné v UI (picker, switch, marketing).
//
// Až ověříme fotbal s reálnými trenéry, postupně otevřeme tennis/floorball
// — stačí přidat do ENABLED_SPORTS a UI se sám zaktualizuje.
export const SPORTS: SportMeta[] = [
  { id: 'football',  icon: '⚽', labelKey: 'sport.football',  shortLabelKey: 'sport.football' },
  { id: 'tennis',    icon: '🎾', labelKey: 'sport.tennis',    shortLabelKey: 'sport.tennis' },
  { id: 'floorball', icon: '🏑', labelKey: 'sport.floorball', shortLabelKey: 'sport.floorball' },
];

/** Sport viditelné v UI pro nové uživatele (sport picker, settings switch). */
export const ENABLED_SPORTS: readonly Sport[] = ['football'];

/** Helper — true pokud sport je dostupný v UI pro nové uživatele. */
export function isEnabledSport(sport: Sport | null | undefined): boolean {
  if (!sport) return false;
  return (ENABLED_SPORTS as readonly string[]).includes(sport);
}

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
