// ─── FAČR Match Report ───────────────────────────────────────────────────────
// Generates a plain text and PDF report for a finished match suitable for the
// team manager (vedoucí mužstva) to copy into the IS FAČR (is.fotbal.cz) form.

import type { jsPDF as JsPDFType } from 'jspdf';
import type { SeasonMatch, MatchLineupPlayer } from '../types/match.types';
import type { Locale } from '../i18n';
import { getDateLocale } from '../i18n';

// ─── Types ──────────────────────────────────────────────────────────────────

type TFn = (key: string, params?: Record<string, string | number>) => string;

// ─── Helpers ────────────────────────────────────────────────────────────────

function nameById(match: SeasonMatch, playerId: string | null | undefined): string | null {
  if (!playerId) return null;
  const p = match.lineup.find(l => l.playerId === playerId);
  return p?.name ?? null;
}

function jerseyById(match: SeasonMatch, playerId: string | null | undefined): number | null {
  if (!playerId) return null;
  const p = match.lineup.find(l => l.playerId === playerId);
  return p?.jerseyNumber ?? null;
}

function formatCzechDate(dateStr: string): string {
  // dateStr is "YYYY-MM-DD"
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}.${y}`;
}

function formatCzechDateTime(d: Date): string {
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} v ${hh}:${mm}`;
}

function sortByMinute<T extends { minute: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.minute - b.minute);
}

function pad2(n: number): string {
  return String(n).padStart(2, ' ');
}

// ─── Plain-text report ──────────────────────────────────────────────────────

/** Generate plain text report ready for clipboard / WhatsApp / FAČR copy-paste */
export function generateFacrTextReport(match: SeasonMatch, ourClubName: string): string {
  const lines: string[] = [];

  const home = match.isHome ? ourClubName : match.opponent;
  const away = match.isHome ? match.opponent : ourClubName;

  lines.push('HLÁŠENÍ K ZÁPASU — TORQ');
  lines.push('========================');
  lines.push(`Datum: ${formatCzechDate(match.date)}, ${match.kickoffTime}`);
  lines.push(`Soutěž: ${match.competition}`);
  lines.push(`Domácí: ${home}`);
  lines.push(`Hosté: ${away}`);
  lines.push(`Konečné skóre: ${match.homeScore} : ${match.awayScore}`);
  lines.push('');

  // ── Lineup ─────────────────────────────────────────────────────────────
  const starters = match.lineup
    .filter(p => p.isStarter)
    .sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const bench = match.lineup
    .filter(p => !p.isStarter)
    .sort((a, b) => (a.substituteOrder || 0) - (b.substituteOrder || 0) || a.jerseyNumber - b.jerseyNumber);

  lines.push(`SOUPISKA — ${ourClubName}:`);
  lines.push(`Základní sestava (${starters.length}):`);
  if (starters.length === 0) {
    lines.push('  (žádní)');
  } else {
    for (const p of starters) {
      lines.push(`  ${pad2(p.jerseyNumber)} ${p.name}`);
    }
  }
  lines.push('');
  lines.push(`Náhradníci (${bench.length}):`);
  if (bench.length === 0) {
    lines.push('  (žádní)');
  } else {
    for (const p of bench) {
      lines.push(`  ${pad2(p.jerseyNumber)} ${p.name}`);
    }
  }
  lines.push('');

  // ── Goals ──────────────────────────────────────────────────────────────
  lines.push(`GÓLY (${match.homeScore} : ${match.awayScore}):`);
  if (match.goals.length === 0) {
    lines.push('  (žádné)');
  } else {
    const sortedGoals = sortByMinute(match.goals);
    for (const g of sortedGoals) {
      const min = `${String(g.minute).padStart(2, ' ')}'`;
      if (g.isOpponentGoal) {
        lines.push(`  ${min}  ⚽ soupeř`);
        continue;
      }
      if (g.isOwnGoal) {
        lines.push(`  ${min}  ⚽ vlastní gól soupeře`);
        continue;
      }
      const scorer = nameById(match, g.scorerId) ?? 'neznámý střelec';
      const assist = nameById(match, g.assistId);
      const assistPart = assist ? ` (asist. ${assist})` : '';
      lines.push(`  ${min}  ⚽ ${scorer}${assistPart}`);
    }
  }
  lines.push('');

  // ── Yellow cards ───────────────────────────────────────────────────────
  const yellows = sortByMinute(match.cards.filter(c => c.type === 'yellow'));
  lines.push('ŽLUTÉ KARTY:');
  if (yellows.length === 0) {
    lines.push('  (žádné)');
  } else {
    for (const c of yellows) {
      const min = `${String(c.minute).padStart(2, ' ')}'`;
      const name = nameById(match, c.playerId) ?? 'neznámý hráč';
      lines.push(`  ${min}  🟨 ${name}`);
    }
  }
  lines.push('');

  // ── Red cards (incl. yellow-red) ───────────────────────────────────────
  const reds = sortByMinute(match.cards.filter(c => c.type === 'red' || c.type === 'yellow-red'));
  lines.push('ČERVENÉ KARTY:');
  if (reds.length === 0) {
    lines.push('  (žádné)');
  } else {
    for (const c of reds) {
      const min = `${String(c.minute).padStart(2, ' ')}'`;
      const name = nameById(match, c.playerId) ?? 'neznámý hráč';
      const icon = c.type === 'yellow-red' ? '🟨🟥' : '🟥';
      lines.push(`  ${min}  ${icon} ${name}`);
    }
  }
  lines.push('');

  // ── Substitutions ──────────────────────────────────────────────────────
  lines.push('STŘÍDÁNÍ:');
  if (match.substitutions.length === 0) {
    lines.push('  (žádné)');
  } else {
    const subs = sortByMinute(match.substitutions);
    for (const s of subs) {
      const min = `${String(s.minute).padStart(2, ' ')}'`;
      const inName = nameById(match, s.playerInId) ?? 'neznámý hráč';
      const outName = nameById(match, s.playerOutId) ?? 'neznámý hráč';
      lines.push(`  ${min}  ↑ ${inName} ↓ ${outName}`);
    }
  }
  lines.push('');

  lines.push(`Vygenerováno: ${formatCzechDateTime(new Date())} přes torq.cz`);

  return lines.join('\n');
}

// ─── Font loader (shared with tournament-pdf) ────────────────────────────────

const fontCache: { regular?: string; bold?: string } = {};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

async function loadFonts(doc: JsPDFType): Promise<boolean> {
  try {
    if (!fontCache.regular || !fontCache.bold) {
      const base = import.meta.env.BASE_URL ?? '/';
      const [regular, bold] = await Promise.all([
        fetch(`${base}fonts/Roboto-Regular.ttf`).then(r => {
          if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
          return r.arrayBuffer();
        }),
        fetch(`${base}fonts/Roboto-Bold.ttf`).then(r => {
          if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);
      fontCache.regular = arrayBufferToBase64(regular);
      fontCache.bold = arrayBufferToBase64(bold);
    }

    doc.addFileToVFS('Roboto-Regular.ttf', fontCache.regular);
    doc.addFileToVFS('Roboto-Bold.ttf', fontCache.bold);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    return true;
  } catch {
    return false; // fallback to Helvetica (bez diakritiky)
  }
}

// ─── PDF report ──────────────────────────────────────────────────────────────

/** Generate PDF report ready for download (A4 portrait, single page) */
export async function exportFacrReportPdf(
  match: SeasonMatch,
  ourClubName: string,
  _t: TFn,
  locale: Locale,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297
  const M = 12; // margin
  const W = pageW - 2 * M;
  let y = 0;

  const hasFonts = await loadFonts(doc);
  const fontFamily = hasFonts ? 'Roboto' : 'helvetica';

  const setFont = (style: 'normal' | 'bold', size: number) => {
    doc.setFont(fontFamily, style);
    doc.setFontSize(size);
  };

  const home = match.isHome ? ourClubName : match.opponent;
  const away = match.isHome ? match.opponent : ourClubName;

  // ═══════════════════════════════════════════════════════════════════════
  // 1. HEADER — colored stripe + title
  // ═══════════════════════════════════════════════════════════════════════
  // Top color stripe
  doc.setFillColor(26, 35, 126); // primary-ish
  doc.rect(0, 0, pageW, 8, 'F');

  y = 18;
  setFont('bold', 18);
  doc.setTextColor(0, 0, 0);
  doc.text('Hlášení k zápasu', pageW / 2, y, { align: 'center' });
  y += 6;

  setFont('normal', 9);
  doc.setTextColor(120, 120, 120);
  doc.text('FAČR — pro vedoucího mužstva', pageW / 2, y, { align: 'center' });
  y += 5;

  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.6);
  doc.line(M, y, pageW - M, y);
  y += 6;

  // ═══════════════════════════════════════════════════════════════════════
  // 2. MATCH INFO — date, competition, score
  // ═══════════════════════════════════════════════════════════════════════
  setFont('bold', 11);
  doc.setTextColor(20, 20, 20);
  doc.text(`${home}  vs  ${away}`, pageW / 2, y, { align: 'center' });
  y += 6;

  setFont('bold', 22);
  doc.setTextColor(26, 35, 126);
  doc.text(`${match.homeScore} : ${match.awayScore}`, pageW / 2, y, { align: 'center' });
  y += 8;

  setFont('normal', 10);
  doc.setTextColor(80, 80, 80);
  const dateLine = `${formatCzechDate(match.date)} · ${match.kickoffTime} · ${match.competition}`;
  doc.text(dateLine, pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(M, y, pageW - M, y);
  y += 6;

  // ═══════════════════════════════════════════════════════════════════════
  // 3. LINEUP — 2-column table (starters | bench)
  // ═══════════════════════════════════════════════════════════════════════
  const starters = match.lineup
    .filter(p => p.isStarter)
    .sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const bench = match.lineup
    .filter(p => !p.isStarter)
    .sort((a, b) => (a.substituteOrder || 0) - (b.substituteOrder || 0) || a.jerseyNumber - b.jerseyNumber);

  setFont('bold', 11);
  doc.setTextColor(20, 20, 20);
  doc.text(`Soupiska — ${ourClubName}`, M, y);
  y += 5;

  const colW = W / 2;
  const colLeftX = M;
  const colRightX = M + colW;

  // Column headers
  setFont('bold', 9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Základní sestava (${starters.length})`, colLeftX, y);
  doc.text(`Náhradníci (${bench.length})`, colRightX, y);
  y += 4;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(colLeftX, y, colLeftX + W, y);
  y += 3;

  const rowH = 4.5;
  const lineupStartY = y;
  const drawLineupCol = (players: MatchLineupPlayer[], xBase: number) => {
    setFont('normal', 9);
    doc.setTextColor(30, 30, 30);
    let py = lineupStartY;
    for (const p of players) {
      // Alternating background
      const idx = players.indexOf(p);
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(xBase, py - 3, colW - 2, rowH, 'F');
      }
      setFont('bold', 9);
      doc.setTextColor(26, 35, 126);
      doc.text(String(p.jerseyNumber), xBase + 2, py);
      setFont('normal', 9);
      doc.setTextColor(30, 30, 30);
      // Truncate if too long
      let name = p.name;
      const maxNameW = colW - 14;
      while (doc.getTextWidth(name) > maxNameW && name.length > 3) {
        name = name.slice(0, -1);
      }
      if (name !== p.name) name += '…';
      doc.text(name, xBase + 10, py);
      py += rowH;
    }
    return py;
  };

  const leftEndY = drawLineupCol(starters, colLeftX);
  const rightEndY = drawLineupCol(bench, colRightX);
  y = Math.max(leftEndY, rightEndY) + 4;

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(M, y, pageW - M, y);
  y += 6;

  // ═══════════════════════════════════════════════════════════════════════
  // 4. EVENTS TIMELINE — goals, cards, substitutions
  // ═══════════════════════════════════════════════════════════════════════
  type Event =
    | { kind: 'goal'; minute: number; text: string }
    | { kind: 'yellow'; minute: number; text: string }
    | { kind: 'red'; minute: number; text: string }
    | { kind: 'sub'; minute: number; text: string };

  const events: Event[] = [];

  for (const g of match.goals) {
    let text: string;
    if (g.isOpponentGoal) {
      text = 'Gól soupeře';
    } else if (g.isOwnGoal) {
      text = 'Vlastní gól soupeře';
    } else {
      const scorer = nameById(match, g.scorerId) ?? 'neznámý střelec';
      const assist = nameById(match, g.assistId);
      text = assist ? `${scorer} (asist. ${assist})` : scorer;
    }
    events.push({ kind: 'goal', minute: g.minute, text });
  }
  for (const c of match.cards) {
    const name = nameById(match, c.playerId) ?? 'neznámý hráč';
    if (c.type === 'yellow') {
      events.push({ kind: 'yellow', minute: c.minute, text: name });
    } else {
      const prefix = c.type === 'yellow-red' ? 'ŽČ — ' : '';
      events.push({ kind: 'red', minute: c.minute, text: `${prefix}${name}` });
    }
  }
  for (const s of match.substitutions) {
    const inName = nameById(match, s.playerInId) ?? 'neznámý hráč';
    const outName = nameById(match, s.playerOutId) ?? 'neznámý hráč';
    const inJersey = jerseyById(match, s.playerInId);
    const outJersey = jerseyById(match, s.playerOutId);
    const inLabel = inJersey != null ? `#${inJersey} ${inName}` : inName;
    const outLabel = outJersey != null ? `#${outJersey} ${outName}` : outName;
    events.push({ kind: 'sub', minute: s.minute, text: `${inLabel}  za  ${outLabel}` });
  }

  events.sort((a, b) => a.minute - b.minute);

  setFont('bold', 11);
  doc.setTextColor(20, 20, 20);
  doc.text('Průběh zápasu', M, y);
  y += 5;

  if (events.length === 0) {
    setFont('normal', 9);
    doc.setTextColor(140, 140, 140);
    doc.text('(žádné zaznamenané události)', M, y);
    y += 5;
  } else {
    const eventRowH = 5;
    for (const ev of events) {
      // Page overflow guard (footer space)
      if (y > pageH - 18) {
        doc.addPage();
        y = 15;
      }
      // Minute column
      setFont('bold', 9);
      doc.setTextColor(120, 120, 120);
      doc.text(`${ev.minute}'`, M + 6, y, { align: 'right' });

      // Icon column
      setFont('normal', 10);
      let icon = '';
      let iconColor: [number, number, number] = [60, 60, 60];
      if (ev.kind === 'goal') {
        icon = '⚽';
        iconColor = [20, 80, 30];
      } else if (ev.kind === 'yellow') {
        icon = '🟨';
        iconColor = [200, 160, 0];
      } else if (ev.kind === 'red') {
        icon = '🟥';
        iconColor = [180, 30, 30];
      } else {
        icon = '🔄';
        iconColor = [40, 80, 160];
      }
      doc.setTextColor(...iconColor);
      doc.text(icon, M + 10, y);

      // Text column
      setFont('normal', 9.5);
      doc.setTextColor(30, 30, 30);
      let text = ev.text;
      const maxTextW = W - 22;
      while (doc.getTextWidth(text) > maxTextW && text.length > 3) {
        text = text.slice(0, -1);
      }
      if (text !== ev.text) text += '…';
      doc.text(text, M + 18, y);

      y += eventRowH;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. FOOTER
  // ═══════════════════════════════════════════════════════════════════════
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, pageH - 10, pageW - M, pageH - 10);
  doc.setTextColor(160, 160, 160);
  setFont('normal', 7);
  doc.text(
    `Vygenerováno: ${formatCzechDateTime(new Date())} · TORQ · torq.cz`,
    pageW / 2,
    pageH - 6,
    { align: 'center' },
  );

  // Touch locale to avoid unused-var lint
  void getDateLocale(locale);

  // ═══════════════════════════════════════════════════════════════════════
  // DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════
  const safeName = (ourClubName + '-' + match.opponent + '-' + match.date)
    .replace(/[^a-zA-Z0-9\u00C0-\u017F-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  doc.save(`hlaseni-facr-${safeName || 'zapas'}.pdf`);
}
