/**
 * Season helpers for Czech football calendar.
 *
 * A season runs Aug -> Jun across two calendar years (e.g. "2025/2026").
 * It is split into two halves:
 *   - autumn ("Podzim"): months Aug-Dec
 *   - spring ("Jaro"):   months Jan-Jul
 *
 * The season id uses the start year, e.g. "2025-2026".
 * Half labels are rendered via i18n keys (`season.autumn`, `season.spring`)
 * — pass a `t` function from `useI18n()` for properly localized labels.
 */

type TFn = (key: string, params?: Record<string, string | number>) => string;

// Fallback translator for environments without i18n (CSV exports, server-side, tests).
const defaultT: TFn = (key, params) => {
  const fallbacks: Record<string, string> = {
    'season.autumn': 'Podzim {year}',
    'season.spring': 'Jaro {year}',
    'season.label':  'Sezóna {start}/{end}',
  };
  let text = fallbacks[key] ?? key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
};

export interface Season {
  id: string;        // e.g. "2025-2026"
  label: string;     // e.g. "Sezóna 2025/2026"
  half: 'autumn' | 'spring' | 'full';
  halfLabel: string; // e.g. "Podzim 2025", "Jaro 2026"
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function parseISO(date: string): { y: number; m: number; d: number } | null {
  const parts = date.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return { y, m, d };
}

/**
 * Compute season start year for a given month/year.
 * Aug-Dec: start year = current year. Jan-Jul: start year = previous year.
 */
function seasonStartYear(year: number, month: number): number {
  return month >= 8 ? year : year - 1;
}

function isAutumn(month: number): boolean {
  return month >= 8 && month <= 12;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Determine which season + half a date belongs to.
 * Falls back to today for invalid dates.
 */
export function getSeasonForDate(date: string, t: TFn = defaultT): { seasonId: string; seasonLabel: string; halfLabel: string } {
  const parsed = parseISO(date);
  const now = new Date();
  const y = parsed?.y ?? now.getFullYear();
  const m = parsed?.m ?? (now.getMonth() + 1);

  const startYear = seasonStartYear(y, m);
  const endYear = startYear + 1;
  const seasonId = `${startYear}-${endYear}`;
  const seasonLabel = t('season.label', { start: startYear, end: endYear });

  const halfLabel = isAutumn(m)
    ? t('season.autumn', { year: startYear })
    : t('season.spring', { year: endYear });

  return { seasonId, seasonLabel, halfLabel };
}

/**
 * Get the current season based on today's date.
 */
export function getCurrentSeason(t: TFn = defaultT): { seasonId: string; seasonLabel: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = seasonStartYear(y, m);
  const endYear = startYear + 1;
  return {
    seasonId: `${startYear}-${endYear}`,
    seasonLabel: t('season.label', { start: startYear, end: endYear }),
  };
}

/**
 * Get current season half (key includes half marker, e.g. "2025-2026:autumn").
 * Useful for default-selecting the current half in a filter.
 */
export function getCurrentSeasonHalf(t: TFn = defaultT): { key: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = seasonStartYear(y, m);
  const endYear = startYear + 1;
  if (isAutumn(m)) {
    return { key: `${startYear}-${endYear}:autumn`, label: t('season.autumn', { year: startYear }) };
  }
  return { key: `${startYear}-${endYear}:spring`, label: t('season.spring', { year: endYear }) };
}

/**
 * Get the season-half key for a date (matches the format used by
 * groupMatchesBySeasonHalf keys). Returns empty string for invalid dates.
 */
export function getSeasonHalfKeyForDate(date: string): string {
  const parsed = parseISO(date);
  if (!parsed) return '';
  const startYear = seasonStartYear(parsed.y, parsed.m);
  const endYear = startYear + 1;
  return isAutumn(parsed.m) ? `${startYear}-${endYear}:autumn` : `${startYear}-${endYear}:spring`;
}

/**
 * Get the season id (e.g. "2025-2026") for a date. Returns empty string for invalid dates.
 */
export function getSeasonIdForDate(date: string): string {
  const parsed = parseISO(date);
  if (!parsed) return '';
  const startYear = seasonStartYear(parsed.y, parsed.m);
  return `${startYear}-${startYear + 1}`;
}

/**
 * Group matches by season half (e.g. "Podzim 2025", "Jaro 2026").
 * Returns groups sorted by recency (newest half first).
 * Within each group, original order is preserved (caller decides sorting).
 */
export function groupMatchesBySeasonHalf<T extends { date: string }>(
  matches: T[],
  t: TFn = defaultT
): Array<{ key: string; label: string; matches: T[] }> {
  const groups = new Map<string, { key: string; label: string; sortRank: number; matches: T[] }>();

  for (const m of matches) {
    const parsed = parseISO(m.date);
    if (!parsed) continue;
    const { y, m: month } = parsed;
    const startYear = seasonStartYear(y, month);
    const endYear = startYear + 1;
    const isAut = isAutumn(month);
    const key = isAut ? `${startYear}-${endYear}:autumn` : `${startYear}-${endYear}:spring`;
    const label = isAut
      ? t('season.autumn', { year: startYear })
      : t('season.spring', { year: endYear });
    // sortRank: bigger = more recent. Spring of season X-Y comes after autumn.
    const sortRank = startYear * 10 + (isAut ? 0 : 1);

    const existing = groups.get(key);
    if (existing) {
      existing.matches.push(m);
    } else {
      groups.set(key, { key, label, sortRank, matches: [m] });
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.sortRank - a.sortRank)
    .map(({ key, label, matches }) => ({ key, label, matches }));
}
