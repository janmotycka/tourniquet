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
 * Formátuje post-match zprávu pro rodiče do WhatsApp.
 *
 * Styl je v duchu pozvánky (`generateNominationText`) — bohatý formát s
 * bullet listy, tučným nadpisem a sekcemi. Jazykově zůstává **neutrální**
 * (žádné „DRTIVÁ VÝHRA"), ale není strohý.
 *
 * Trenérova poznámka (match.note) se přidá pokud existuje — tam může dát
 * vlastní slovo pro rodiče (děkuji klukům apod.).
 */
export function generateMatchSummaryText(
  opts: SummaryOptions,
  lang: 'cs' | 'en' | 'de' = 'cs',
): string {
  const { match, clubDisplayName, publicUrl } = opts;

  const labels = lang === 'cs'
    ? {
        headerLive: '🔴 *PRŮBĚH ZÁPASU*',
        headerPlanned: '📅 *NADCHÁZEJÍCÍ ZÁPAS*',
        headerFinished: '📊 *KONEC ZÁPASU*',
        result: 'Výsledek',
        ourScorers: '*Naši střelci:*',
        opponentGoal: '*Gól soupeře:*',
        cards: '*Karty:*',
        coachNote: '*Od trenéra:*',
        linkIntro: 'Detail zápasu:',
        unknown: 'Neznámý',
        opponentLabel: 'Soupeř',
        vs: 'vs',
      }
    : lang === 'de'
    ? {
        headerLive: '🔴 *SPIELVERLAUF*',
        headerPlanned: '📅 *KOMMENDES SPIEL*',
        headerFinished: '📊 *SPIELENDE*',
        result: 'Ergebnis',
        ourScorers: '*Unsere Torschützen:*',
        opponentGoal: '*Tor des Gegners:*',
        cards: '*Karten:*',
        coachNote: '*Vom Trainer:*',
        linkIntro: 'Details zum Spiel:',
        unknown: 'Unbekannt',
        opponentLabel: 'Gegner',
        vs: 'vs',
      }
    : {
        headerLive: '🔴 *MATCH IN PROGRESS*',
        headerPlanned: '📅 *UPCOMING MATCH*',
        headerFinished: '📊 *FULL TIME*',
        result: 'Result',
        ourScorers: '*Our scorers:*',
        opponentGoal: '*Opponent goal:*',
        cards: '*Cards:*',
        coachNote: '*Coach note:*',
        linkIntro: 'Match details:',
        unknown: 'Unknown',
        opponentLabel: 'Opponent',
        vs: 'vs',
      };

  const homeTeam = match.isHome ? clubDisplayName : match.opponent;
  const awayTeam = match.isHome ? match.opponent : clubDisplayName;

  const lines: string[] = [];

  // Header podle statusu zápasu
  const header = match.status === 'finished'
    ? labels.headerFinished
    : match.status === 'live'
      ? labels.headerLive
      : labels.headerPlanned;
  lines.push(header);

  // Skóre / matchup
  if (match.status === 'planned') {
    lines.push(`⚽ *${homeTeam} ${labels.vs} ${awayTeam}*`);
  } else {
    lines.push(`⚽ *${homeTeam} ${match.homeScore}:${match.awayScore} ${awayTeam}*`);
  }

  // Meta (datum, čas, soutěž, kategorie, místo)
  const metaBits: string[] = [];
  metaBits.push(`📅 ${formatShortDate(match.date)}${match.kickoffTime ? ' ' + match.kickoffTime : ''}`);
  if (match.competition) metaBits.push(`🏆 ${match.competition}`);
  if (match.ageCategory) metaBits.push(`👶 ${match.ageCategory}`);
  lines.push(metaBits.join(' · '));
  if (match.venue) lines.push(`📍 ${match.venue}`);

  // Naši střelci
  const { ours, theirs } = aggregateScorers(match);

  if (ours.length > 0) {
    lines.push('');
    lines.push(labels.ourScorers);
    const sortedOurs = [...ours].sort((a, b) => a.minutes[0] - b.minutes[0]);
    for (const s of sortedOurs) {
      const mins = s.minutes.map(m => `${m}'`).join(', ');
      const name = s.name === 'Neznámý' ? labels.unknown : s.name;
      const bonus = s.minutes.length >= 3 ? ` · ${s.minutes.length}× 🔥` : '';
      lines.push(`• ${name} (${mins})${bonus}`);
    }
  }
  if (theirs > 0) {
    lines.push('');
    lines.push(`${labels.opponentGoal} ${theirs}×`);
  }

  // Karty — jen pokud jsou
  const cards = formatCards(match);
  if (cards.length > 0) {
    lines.push('');
    lines.push(labels.cards);
    for (const c of cards) {
      const name = playerName(match, c.playerId) ?? labels.unknown;
      lines.push(`${cardIcon(c.type)} ${name} (${c.minute}')`);
    }
  }

  // Trenérova poznámka
  if (match.note && match.note.trim()) {
    lines.push('');
    lines.push(labels.coachNote);
    lines.push(match.note.trim());
  }

  // Link na detail — **vždy přiložit pokud je k dispozici**, to je primární
  // hodnota pro rodiče: kliknou a vidí real-time statistiky i po zápase.
  if (publicUrl) {
    lines.push('');
    lines.push(`📱 ${labels.linkIntro}`);
    lines.push(publicUrl);
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
