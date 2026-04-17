/**
 * Tennis Team Competition helpers — ČTenis družstva.
 *
 * Typické formáty:
 *   - 4× dvouhra + 2× čtyřhra = 6 bodů (starší žactvo, dorost)
 *   - 3× dvouhra + 1× čtyřhra = 4 body (mladší žactvo)
 *
 * Tým vyhraje zápas který má většinu bodů. Tie = 3:3 → o vítězi rozhodují sety.
 */

import type { TennisSubMatch } from '../../../types/match.types';
import { generateId } from '../../../utils/id';

/**
 * Normalizuj sub-match po round-tripu z Firebase — RTDB stripuje prázdná pole,
 * takže `homePlayerIds: []` nebo `sets: []` přijde jako `undefined`. Všechny
 * konzumenty musí být defensive; tahle pomocná funkce zajistí invariant.
 */
export function normalizeSubMatch(sub: TennisSubMatch): TennisSubMatch {
  return {
    ...sub,
    homePlayerIds: Array.isArray(sub.homePlayerIds) ? sub.homePlayerIds : [],
    sets: Array.isArray(sub.sets) ? sub.sets : [],
  };
}

/** Normalizuj pole sub-matches. */
export function normalizeSubMatches(subs: TennisSubMatch[] | undefined): TennisSubMatch[] {
  if (!Array.isArray(subs)) return [];
  return subs.map(normalizeSubMatch);
}

export interface TeamMatchFormat {
  id: string;
  label: string;
  singlesCount: number;
  doublesCount: number;
  totalPoints: number;
}

export const TEAM_MATCH_FORMATS: TeamMatchFormat[] = [
  { id: '4s-2d', label: '4 dvouhry + 2 čtyřhry (6 bodů)', singlesCount: 4, doublesCount: 2, totalPoints: 6 },
  { id: '3s-1d', label: '3 dvouhry + 1 čtyřhra (4 body)', singlesCount: 3, doublesCount: 1, totalPoints: 4 },
  { id: '2s-1d', label: '2 dvouhry + 1 čtyřhra (3 body)', singlesCount: 2, doublesCount: 1, totalPoints: 3 },
];

/**
 * Vytvoří prázdné sub-matches podle formátu.
 * Dvouhry první, pak čtyřhry.
 */
export function createDefaultSubMatches(format: TeamMatchFormat): TennisSubMatch[] {
  const subs: TennisSubMatch[] = [];
  let order = 1;
  for (let i = 0; i < format.singlesCount; i++) {
    subs.push({
      id: generateId(),
      type: 'singles',
      order: order++,
      homePlayerIds: [],
      awayPlayerName: '',
      sets: [],
      winner: null,
    });
  }
  for (let i = 0; i < format.doublesCount; i++) {
    subs.push({
      id: generateId(),
      type: 'doubles',
      order: order++,
      homePlayerIds: [],
      awayPlayerName: '',
      sets: [],
      winner: null,
    });
  }
  return subs;
}

/** Spočítá vítěze sub-matche podle odehraných setů. */
export function determineSubMatchWinner(sub: TennisSubMatch): 'home' | 'away' | null {
  // Když je zápas skrečovaný, winner nastavil trenér ručně (soupeř skrečujícího).
  if (sub.retired) return sub.winner;
  const sets = Array.isArray(sub.sets) ? sub.sets : [];
  if (sets.length === 0) return null;
  let homeSets = 0;
  let awaySets = 0;
  for (const set of sets) {
    if (set.home > set.away) homeSets++;
    else if (set.away > set.home) awaySets++;
  }
  // Best-of-3: 2 sety stačí. Best-of-5: 3 sety. Obojí pokrývá podmínka > opponent
  // + aspoň 2 sety vyhrané.
  if (homeSets >= 2 && homeSets > awaySets) return 'home';
  if (awaySets >= 2 && awaySets > homeSets) return 'away';
  // Pro super-tiebreak (2:1 v setech po TB)
  if (sets.length >= 3 && homeSets > awaySets) return 'home';
  if (sets.length >= 3 && awaySets > homeSets) return 'away';
  return null;
}

/** Agreguje celkové týmové skóre z odehraných sub-matches. */
export function aggregateTeamScore(subMatches: TennisSubMatch[] | undefined): { home: number; away: number } {
  let home = 0;
  let away = 0;
  if (!Array.isArray(subMatches)) return { home, away };
  for (const sub of subMatches) {
    if (sub.winner === 'home') home++;
    else if (sub.winner === 'away') away++;
  }
  return { home, away };
}

/** Formátuje výsledek sub-matche ("6:4 4:6 10:8", nebo "6:4 2:1 skreč"). */
export function formatSubMatchScore(sub: TennisSubMatch): string {
  const sets = Array.isArray(sub.sets) ? sub.sets : [];
  const setsStr = sets.map(s => `${s.home}:${s.away}`).join(' ');
  if (sub.retired) {
    return setsStr ? `${setsStr} skreč` : 'skreč';
  }
  if (sets.length === 0) return '—';
  return setsStr;
}

// ─── WhatsApp post-match summary pro tenis ────────────────────────────────

/**
 * Generuje krátký post-match summary pro tenisový týmový zápas.
 *
 * Formát (česky):
 *   🎾 *Tenis Nové Město 4:2 LTC Bedřichov*
 *   📅 15.4. · 🏆 Krajský přebor U14
 *
 *   *Dvouhra:*
 *   ✅ Karel Novák 6:4 6:2
 *   ❌ Jakub Dvořák 3:6 4:6
 *   ...
 *
 *   *Čtyřhra:*
 *   ✅ Karel Novák / Jakub Dvořák 6:2 6:4
 *
 *   ⚠️ Výsledky jsou orientační. Oficiální na ČTenis.
 *   📡 https://torq.cz/#match=xxx
 */
export function generateTennisTeamSummaryText(opts: {
  match: { sport?: string; matchType?: string; subMatches?: TennisSubMatch[];
    date: string; competition: string; ageCategory?: string; isHome: boolean;
    opponent: string; officialResultsNote?: string;
    homeScore: number; awayScore: number; };
  clubDisplayName: string;
  playerNameResolver: (id: string) => string | null;
  publicUrl?: string;
  lang?: 'cs' | 'en' | 'de';
}): string {
  const { match, clubDisplayName, playerNameResolver, publicUrl } = opts;
  const lang = opts.lang ?? 'cs';
  // Normalizace: Firebase stripuje prázdná pole, takže po round-tripu může být
  // homePlayerIds/sets undefined. Zajistíme invariant pro všechny konzumenty.
  const subMatches = normalizeSubMatches(match.subMatches);
  const score = aggregateTeamScore(subMatches);

  const labels = lang === 'cs'
    ? { singles: 'Dvouhra', doubles: 'Čtyřhra', note: 'Výsledky jsou orientační. Oficiální na ČTenis.', unknown: 'Neznámý' }
    : lang === 'de'
    ? { singles: 'Einzel', doubles: 'Doppel', note: 'Ergebnisse sind vorläufig. Offiziell auf ČTenis.', unknown: 'Unbekannt' }
    : { singles: 'Singles', doubles: 'Doubles', note: 'Results are unofficial. Official results on ČTenis.', unknown: 'Unknown' };

  const home = match.isHome ? clubDisplayName : match.opponent;
  const away = match.isHome ? match.opponent : clubDisplayName;
  const [, m, d] = match.date.split('-').map(Number);
  const shortDate = (m && d) ? `${d}.${m}.` : match.date;

  const lines: string[] = [];
  lines.push(`🎾 *${home} ${score.home}:${score.away} ${away}*`);
  const metaBits: string[] = [`📅 ${shortDate}`];
  if (match.competition) metaBits.push(`🏆 ${match.competition}`);
  if (match.ageCategory) metaBits.push(`👶 ${match.ageCategory}`);
  lines.push(metaBits.join(' · '));

  const renderSub = (sub: TennisSubMatch): string => {
    const icon = sub.winner === 'home' ? '✅' : sub.winner === 'away' ? '❌' : '·';
    const homeNames = sub.homePlayerIds
      .map(id => playerNameResolver(id) ?? labels.unknown)
      .join(' / ');
    const awayNames = sub.awayPlayerName2
      ? `${sub.awayPlayerName} / ${sub.awayPlayerName2}`
      : (sub.awayPlayerName || '—');
    const scoreText = formatSubMatchScore(sub);
    return `${icon} ${homeNames} vs ${awayNames} — ${scoreText}`;
  };

  const singles = subMatches.filter(s => s.type === 'singles').sort((a, b) => a.order - b.order);
  const doubles = subMatches.filter(s => s.type === 'doubles').sort((a, b) => a.order - b.order);

  if (singles.length > 0) {
    lines.push('');
    lines.push(`*${labels.singles}:*`);
    for (const s of singles) lines.push(renderSub(s));
  }
  if (doubles.length > 0) {
    lines.push('');
    lines.push(`*${labels.doubles}:*`);
    for (const s of doubles) lines.push(renderSub(s));
  }

  lines.push('');
  lines.push(`⚠️ ${match.officialResultsNote || labels.note}`);

  if (publicUrl) {
    lines.push('');
    lines.push(`📡 ${publicUrl}`);
  }

  return lines.join('\n');
}
