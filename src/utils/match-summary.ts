/**
 * match-summary.ts — generuje **krátký** post-match summary pro WhatsApp/email.
 *
 * Cíl: trenér po zápase klikne "Kopírovat shrnutí" → vloží do WhatsApp skupiny rodičů.
 *
 * Formát (česky):
 *   ⚽ *FC Vrchovina 3:1 TJ Bedřichov*
 *   📅 15.4. · 🏆 Liga U11
 *
 *   *Góly:*
 *   ⚽ Karel Novák (12', 45') · hattrick 🔥
 *   ⚽ Jakub Dvořák (30')
 *
 *   *Karty:*
 *   🟨 Tomáš Malý (55')
 *
 *   *Střídání:* 3
 *
 *   📡 https://torq.cz/#match=xxx
 */

import type { SeasonMatch, MatchCard } from '../types/match.types';

interface SummaryOptions {
  match: SeasonMatch;
  clubDisplayName: string;
  publicUrl?: string;
}

interface ScorerAgg {
  playerId: string;
  name: string;
  minutes: number[];
}

function playerName(match: SeasonMatch, id: string | null | undefined): string | null {
  if (!id) return null;
  return match.lineup.find(p => p.playerId === id)?.name ?? null;
}

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  if (!m || !d) return dateStr;
  return `${d}.${m}.`;
}

function aggregateScorers(match: SeasonMatch): { ours: ScorerAgg[]; theirs: number } {
  const byId = new Map<string, ScorerAgg>();
  let theirs = 0;

  const sorted = [...match.goals].sort((a, b) => a.minute - b.minute);
  for (const g of sorted) {
    if (g.isOpponentGoal) {
      theirs++;
      continue;
    }
    const name = playerName(match, g.scorerId);
    const key = g.scorerId ?? '__unknown';
    const existing = byId.get(key);
    if (existing) {
      existing.minutes.push(g.minute);
    } else {
      byId.set(key, {
        playerId: key,
        name: name ?? 'Neznámý',
        minutes: [g.minute],
      });
    }
  }

  return { ours: [...byId.values()], theirs };
}

function formatCards(match: SeasonMatch): MatchCard[] {
  return [...match.cards].sort((a, b) => a.minute - b.minute);
}

function cardIcon(type: string): string {
  if (type === 'yellow') return '🟨';
  if (type === 'red') return '🟥';
  if (type === 'yellow_red' || type === 'yellowRed') return '🟨🟥';
  return '🟨';
}

/**
 * Formátuje post-match zprávu pro rodiče do WhatsApp — **neutrální tón**.
 * Jen fakta: skóre, týmy, datum, střelci, karty. Trenérova poznámka (match.note)
 * se přidá na konec pokud existuje — tam může dát vlastní slovo pro rodiče.
 */
export function generateMatchSummaryText(
  opts: SummaryOptions,
  lang: 'cs' | 'en' | 'de' = 'cs',
): string {
  const { match, clubDisplayName, publicUrl } = opts;

  const homeTeam = match.isHome ? clubDisplayName : match.opponent;
  const awayTeam = match.isHome ? match.opponent : clubDisplayName;

  const lines: string[] = [];

  // Hlavička — neutrální výsledek (bez hype jazyka)
  lines.push(`⚽ *${homeTeam} ${match.homeScore}:${match.awayScore} ${awayTeam}*`);

  // Meta (datum, čas, soutěž, kategorie, místo)
  const metaBits: string[] = [];
  metaBits.push(`📅 ${formatShortDate(match.date)}${match.kickoffTime ? ' ' + match.kickoffTime : ''}`);
  if (match.competition) metaBits.push(`🏆 ${match.competition}`);
  if (match.ageCategory) metaBits.push(`👶 ${match.ageCategory}`);
  if (match.venue) metaBits.push(`📍 ${match.venue}`);
  lines.push(metaBits.join(' · '));

  // Naši střelci
  const { ours, theirs } = aggregateScorers(match);
  const labelGoals = lang === 'cs' ? '*Střelci:*' : lang === 'de' ? '*Torschützen:*' : '*Scorers:*';
  const labelOpponentGoals = lang === 'cs' ? 'Soupeř' : lang === 'de' ? 'Gegner' : 'Opponent';
  const labelUnknown = lang === 'cs' ? 'Neznámý' : lang === 'de' ? 'Unbekannt' : 'Unknown';

  if (ours.length > 0 || theirs > 0) {
    lines.push('');
    lines.push(labelGoals);
    // Naši
    const sortedOurs = [...ours].sort((a, b) => a.minutes[0] - b.minutes[0]);
    for (const s of sortedOurs) {
      const mins = s.minutes.map(m => `${m}'`).join(', ');
      const name = s.name === 'Neznámý' ? labelUnknown : s.name;
      const bonus = s.minutes.length >= 3
        ? (lang === 'cs' ? ` · ${s.minutes.length}× 🔥` : lang === 'de' ? ` · ${s.minutes.length}× 🔥` : ` · ${s.minutes.length}× 🔥`)
        : '';
      lines.push(`⚽ ${name} (${mins})${bonus}`);
    }
    if (theirs > 0) {
      lines.push(`⚽ ${labelOpponentGoals}: ${theirs}×`);
    }
  }

  // Karty — jen pokud jsou
  const cards = formatCards(match);
  if (cards.length > 0) {
    const labelCards = lang === 'cs' ? '*Karty:*' : lang === 'de' ? '*Karten:*' : '*Cards:*';
    lines.push('');
    lines.push(labelCards);
    for (const c of cards) {
      const name = playerName(match, c.playerId) ?? labelUnknown;
      lines.push(`${cardIcon(c.type)} ${name} (${c.minute}')`);
    }
  }

  // Trenérova poznámka — jeho vlastní slovo pro rodiče (pokud zapsal).
  if (match.note && match.note.trim()) {
    const labelNote = lang === 'cs' ? '*Trenér:*' : lang === 'de' ? '*Trainer:*' : '*Coach:*';
    lines.push('');
    lines.push(labelNote);
    lines.push(match.note.trim());
  }

  // Link na detail
  if (publicUrl) {
    lines.push('');
    lines.push(`📡 ${publicUrl}`);
  }

  return lines.join('\n');
}

// ─── Nominace pro rodiče (pre-match) ──────────────────────────────────────

interface NominationOptions {
  match: SeasonMatch;
  clubDisplayName: string;
  publicUrl?: string;
}

/**
 * Vygeneruje pozvánku / nominaci pro rodiče. Posílá se před zápasem přes
 * WhatsApp nebo e-mail. Formát (česky):
 *
 *   📣 *NOMINACE — zápas*
 *   ⚽ *FC Vrchovina vs TJ Bedřichov*
 *   📅 15.4. v 10:00 · 📍 Stadion U hřbitova
 *   🏆 Liga U11
 *
 *   *Nominovaní hráči:*
 *   • #5 Karel Novák
 *   • #7 Jakub Dvořák
 *   ...
 *
 *   Prosím potvrďte účast v odpovědi. Sraz 30 min před výkopem.
 *
 *   📡 https://torq.cz/#match=xxx
 */
export function generateNominationText(
  opts: NominationOptions,
  lang: 'cs' | 'en' | 'de' = 'cs',
): string {
  const { match, clubDisplayName, publicUrl } = opts;
  const homeTeam = match.isHome ? clubDisplayName : match.opponent;
  const awayTeam = match.isHome ? match.opponent : clubDisplayName;

  const labels = lang === 'cs'
    ? {
        header: '📣 *NOMINACE — zápas*',
        roster: '*Nominovaní hráči:*',
        cta: 'Pokud se někdo nemůže zúčastnit, ozvěte se prosím co nejdříve.',
        whereHome: 'Doma',
        whereAway: 'Venku',
      }
    : lang === 'de'
    ? {
        header: '📣 *NOMINIERUNG — Spiel*',
        roster: '*Nominierte Spieler:*',
        cta: 'Falls jemand nicht kommen kann, bitte so früh wie möglich melden.',
        whereHome: 'Heim',
        whereAway: 'Auswärts',
      }
    : {
        header: '📣 *NOMINATION — match*',
        roster: '*Nominated players:*',
        cta: 'If someone cannot attend, please let me know as soon as possible.',
        whereHome: 'Home',
        whereAway: 'Away',
      };

  const lines: string[] = [];
  lines.push(labels.header);
  lines.push(`⚽ *${homeTeam} vs ${awayTeam}*`);

  // Meta line
  const metaBits: string[] = [];
  metaBits.push(`📅 ${formatShortDate(match.date)} v ${match.kickoffTime}`);
  if (match.venue) metaBits.push(`📍 ${match.venue}`);
  else metaBits.push(match.isHome ? `🏠 ${labels.whereHome}` : `✈️ ${labels.whereAway}`);
  lines.push(metaBits.join(' · '));

  if (match.competition || match.ageCategory) {
    const tagBits: string[] = [];
    if (match.competition) tagBits.push(`🏆 ${match.competition}`);
    if (match.ageCategory) tagBits.push(`👶 ${match.ageCategory}`);
    lines.push(tagBits.join(' · '));
  }

  // Všichni hráči dohromady, seřazení abecedně. V nominaci nerozlišujeme
  // „základ" vs „lavička" — to se určí až před zápasem.
  const allPlayers = [...match.lineup].sort((a, b) => a.name.localeCompare(b.name, lang));

  if (allPlayers.length > 0) {
    lines.push('');
    lines.push(labels.roster);
    for (const p of allPlayers) {
      lines.push(`• ${p.name}`);
    }
  }

  // CTA
  lines.push('');
  lines.push(labels.cta);

  if (publicUrl) {
    lines.push('');
    lines.push(`📡 ${publicUrl}`);
  }

  return lines.join('\n');
}
