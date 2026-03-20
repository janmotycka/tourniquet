import type { jsPDF as JsPDFType } from 'jspdf';
import type { Tournament } from '../types/tournament.types';
import { formatMatchTime } from './tournament-schedule';
import { generateQRCodeDataUrl, getTournamentPublicUrl } from './qr-code';
import type { Locale } from '../i18n';
import { getDateLocale } from '../i18n';

// ─── Types ──────────────────────────────────────────────────────────────────

type TFn = (key: string, params?: Record<string, string | number>) => string;

// ─── Font loader (Roboto s českou diakritikou) ──────────────────────────────

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
      // Fonty jsou v public/fonts/ — servírované Vite dev serverem nebo hostingem
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16) || 100,
    parseInt(clean.substring(2, 4), 16) || 100,
    parseInt(clean.substring(4, 6), 16) || 100,
  ];
}

// ─── Main export ────────────────────────────────────────────────────────────

/**
 * Vygeneruje 1-stránkové PDF (plakát) s propozicemi turnaje.
 * QR kód nahoře, kompaktní layout pro tisk na nástěnku.
 */
export async function exportTournamentPdf(
  tournament: Tournament,
  t: TFn,
  locale: Locale,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297
  const M = 10; // margin
  const W = pageW - 2 * M; // usable width = 190
  let y = 0;

  const { settings } = tournament;
  const hasFonts = await loadFonts(doc);
  const fontFamily = hasFonts ? 'Roboto' : 'helvetica';

  const setFont = (style: 'normal' | 'bold', size: number) => {
    doc.setFont(fontFamily, style);
    doc.setFontSize(size);
  };

  // ── Date formatting ──────────────────────────────────────────────────────

  const dateLocale = getDateLocale(locale);
  const dateStr = new Date(settings.startDate).toLocaleDateString(dateLocale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // End time calculation
  const sortedMatches = [...tournament.matches].sort((a, b) =>
    new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
  );
  let endTimeStr = '';
  if (sortedMatches.length > 0) {
    const last = sortedMatches[sortedMatches.length - 1];
    const end = new Date(new Date(last.scheduledTime).getTime() + last.durationMinutes * 60000);
    endTimeStr = end.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. HEADER — název + datum
  // ═══════════════════════════════════════════════════════════════════════════

  y = 14;
  doc.setTextColor(0, 0, 0);
  setFont('bold', 28);
  const nameLines = doc.splitTextToSize(tournament.name, W - 10);
  const nameText = nameLines.length > 1 ? nameLines[0] + '…' : nameLines[0];
  doc.text(nameText, pageW / 2, y, { align: 'center' });
  y += 9;

  doc.setTextColor(80, 80, 80);
  setFont('normal', 12);
  doc.text(dateStr, pageW / 2, y, { align: 'center' });
  y += 5;

  // Silná linka pod headerem
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.8);
  doc.line(M, y, pageW - M, y);
  y += 6;

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. INFO KARTA — QR (vlevo) + info tabulka (vpravo) + pravidla pod tím
  // ═══════════════════════════════════════════════════════════════════════════

  const cardX = M;
  const cardY = y;
  const qrSize = 40;
  const qrX = cardX + 4;
  const qrY = cardY + 4;

  // QR Code
  try {
    const qrDataUrl = await generateQRCodeDataUrl(tournament.id, { dark: '#000000' });
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  } catch {
    setFont('normal', 8);
    doc.setTextColor(150, 150, 150);
    doc.text('QR N/A', qrX + qrSize / 2, qrY + qrSize / 2, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  // QR popisek pod kódem
  setFont('bold', 10);
  doc.setTextColor(0, 0, 0);
  doc.text(t('pdf.scanQr'), qrX + qrSize / 2, qrY + qrSize + 5, { align: 'center' });
  setFont('normal', 7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(t('pdf.scanQrDesc'), qrX + qrSize / 2, qrY + qrSize + 10, { align: 'center' });

  const qrBlockBottom = qrY + qrSize + 12;

  // Info tabulka (vpravo od QR)
  const infoX = qrX + qrSize + 8;
  const infoW = pageW - M - infoX - 4;
  let infoY = cardY + 7;
  const rowH = 6;
  const labelCol = 38; // šířka sloupce labelu

  const drawInfoRow = (label: string, value: string) => {
    setFont('normal', 10);
    doc.setTextColor(100, 100, 100);
    doc.text(label, infoX, infoY);
    setFont('bold', 10);
    doc.setTextColor(20, 20, 20);
    doc.text(value, infoX + labelCol, infoY);
    infoY += rowH;
  };

  drawInfoRow(t('pdf.startTime'), settings.startTime + (endTimeStr ? ` – ${endTimeStr}` : ''));
  drawInfoRow(t('pdf.teamCount'), String(tournament.teams.length));
  drawInfoRow(t('pdf.matchCount'), String(tournament.matches.length));
  drawInfoRow(t('pdf.matchDuration'), `${settings.matchDurationMinutes} min`);
  if (settings.breakBetweenMatchesMinutes > 0) {
    drawInfoRow(t('pdf.breakDuration'), `${settings.breakBetweenMatchesMinutes} min`);
  }
  if ((settings.numberOfPitches ?? 1) > 1) {
    drawInfoRow(t('pdf.pitchCount'), String(settings.numberOfPitches));
  }
  drawInfoRow(t('pdf.scoring'), t('pdf.scoringValue'));

  // Pravidla — pod info řádky (stále vpravo od QR), kompaktní text
  const hasRules = settings.rules && settings.rules.trim();
  if (hasRules) {
    infoY += 1;
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.3);
    doc.line(infoX, infoY, infoX + infoW, infoY);
    infoY += 3;

    setFont('bold', 8.5);
    doc.setTextColor(80, 80, 80);
    doc.text(t('pdf.rules'), infoX, infoY);
    infoY += 3.5;

    setFont('normal', 8);
    doc.setTextColor(60, 60, 60);
    const rulesLines: string[] = doc.splitTextToSize(settings.rules!, infoW);
    const maxInfoRulesLines = 5;
    const displayLines = rulesLines.slice(0, maxInfoRulesLines);
    for (const line of displayLines) {
      doc.text(line, infoX, infoY);
      infoY += 3.2;
    }
    if (rulesLines.length > maxInfoRulesLines) {
      doc.setTextColor(140, 140, 140);
      setFont('normal', 7);
      doc.text(`… ${t('pdf.rulesMoreOnline')}`, infoX, infoY);
      infoY += 3.2;
    }
  }

  // Rámeček kolem celé info karty
  const cardBottom = Math.max(qrBlockBottom, infoY) + 4;
  const cardH = cardBottom - cardY;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.roundedRect(cardX, cardY, W, cardH, 3, 3, 'S');

  // Vertikální oddělovač mezi QR a info
  const separatorX = qrX + qrSize + 5;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(separatorX, cardY + 4, separatorX, cardBottom - 4);

  doc.setTextColor(0, 0, 0);
  y = cardBottom + 5;

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. TÝMY — kompaktní inline seznam
  // ═══════════════════════════════════════════════════════════════════════════

  setFont('bold', 12);
  doc.setTextColor(0, 0, 0);
  doc.text(t('pdf.teams'), M, y);
  y += 4;

  // Team badges — evenly spaced grid
  setFont('normal', 9.5);
  const teamCount = tournament.teams.length;
  // Max 3 columns so long team names always fit
  const gridCols = teamCount <= 4 ? 2 : 3;
  const cellW = W / gridCols;
  const cellH = 7;
  const dotRadius = 1.5;

  for (let i = 0; i < teamCount; i++) {
    const team = tournament.teams[i];
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    const cx = M + col * cellW;
    const cy = y + row * cellH;

    // Color dot
    doc.setFillColor(...hexToRgb(team.color));
    doc.circle(cx + dotRadius + 1, cy + cellH / 2 + 1, dotRadius, 'F');

    // Team name — truncate if too long for cell
    doc.setTextColor(30, 30, 30);
    const maxNameW = cellW - dotRadius * 2 - 6;
    let displayName = team.name;
    if (doc.getTextWidth(displayName) > maxNameW) {
      while (doc.getTextWidth(displayName + '…') > maxNameW && displayName.length > 3) {
        displayName = displayName.slice(0, -1);
      }
      displayName += '…';
    }
    doc.text(displayName, cx + dotRadius * 2 + 4, cy + cellH / 2 + 2);
  }

  const totalRows = Math.ceil(teamCount / gridCols);
  y += totalRows * cellH + 4;

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ROZPIS ZÁPASŮ — jednosloupec, velké písmo, centrovaná dvojtečka
  // ═══════════════════════════════════════════════════════════════════════════

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(M, y, M + W, y);
  y += 5;

  setFont('bold', 14);
  doc.setTextColor(0, 0, 0);
  doc.text(t('pdf.matchSchedule'), pageW / 2, y, { align: 'center' });
  y += 8;

  const hasPitches = (settings.numberOfPitches ?? 1) > 1;
  const getTeamName = (id: string) => tournament.teams.find(t => t.id === id)?.name ?? '?';

  // Matches grouped by round
  const rounds = new Map<number, typeof tournament.matches>();
  for (const m of sortedMatches) {
    const arr = rounds.get(m.roundIndex) ?? [];
    arr.push(m);
    rounds.set(m.roundIndex, arr);
  }

  // Layout: centered colon with home team right-aligned to left, away team left-aligned to right
  // [pitch?] [time]    Home Team        :        Away Team
  const centerX = pageW / 2; // colon position = center of page
  const scoreZoneW = 20; // space around colon for handwriting (10mm each side)
  const homeEndX = centerX - scoreZoneW / 2; // right edge of home team zone
  const awayStartX = centerX + scoreZoneW / 2; // left edge of away team zone
  const matchFontSize = 10;
  const lineH = 6;
  const footerSpace = 14;

  // Truncate team name to fit available width
  const truncateName = (name: string, maxW: number): string => {
    setFont('bold', matchFontSize);
    if (doc.getTextWidth(name) <= maxW) return name;
    while (doc.getTextWidth(name + '…') > maxW && name.length > 3) {
      name = name.slice(0, -1);
    }
    return name + '…';
  };

  // Max width for team names: from time+pitch to score zone
  const timeBlockW = hasPitches ? 28 : 16; // space for pitch + time
  const maxHomeNameW = homeEndX - M - timeBlockW - 2;
  const maxAwayNameW = (pageW - M) - awayStartX - 2;

  // Helper: draw a match row centered on the page
  const drawMatchRow = (m: typeof tournament.matches[0], rowY: number) => {
    let leftX = M;

    // Pitch number first (if multiple pitches) — so time is closer to match
    if (hasPitches) {
      setFont('bold', 9);
      doc.setTextColor(150, 150, 150);
      doc.text(`H${m.pitchNumber ?? 1}`, leftX, rowY);
      leftX += 10;
    }

    // Time
    setFont('normal', matchFontSize);
    doc.setTextColor(100, 100, 100);
    doc.text(formatMatchTime(m.scheduledTime, locale), leftX, rowY);

    // Home team — right-aligned before score zone
    setFont('bold', matchFontSize);
    doc.setTextColor(30, 30, 30);
    const homeName = truncateName(getTeamName(m.homeTeamId), maxHomeNameW);
    doc.text(homeName, homeEndX, rowY, { align: 'right' });

    // Score / colon — centered
    if (m.status === 'finished') {
      setFont('bold', matchFontSize + 1);
      doc.setTextColor(0, 0, 0);
      doc.text(`${m.homeScore} : ${m.awayScore}`, centerX, rowY, { align: 'center' });
    } else {
      setFont('normal', matchFontSize + 1);
      doc.setTextColor(180, 180, 180);
      doc.text(':', centerX, rowY, { align: 'center' });
    }
    doc.setTextColor(0, 0, 0);

    // Away team — left-aligned after score zone
    setFont('bold', matchFontSize);
    doc.setTextColor(30, 30, 30);
    const awayName = truncateName(getTeamName(m.awayTeamId), maxAwayNameW);
    doc.text(awayName, awayStartX, rowY);
  };

  // Build flat list of renderable items (round headers + match rows)
  type RenderItem = { type: 'round'; label: string } | { type: 'match'; match: typeof tournament.matches[0] };
  const items: RenderItem[] = [];
  const sortedRounds = [...rounds.entries()].sort(([a], [b]) => a - b);
  for (const [roundIdx, matches] of sortedRounds) {
    items.push({ type: 'round', label: `${roundIdx + 1}. ${t('pdf.round')}` });
    for (const m of matches) {
      items.push({ type: 'match', match: m });
    }
  }

  // Render items — single column, with page overflow handling
  for (const item of items) {
    // Check if we need a new page
    if (y > pageH - footerSpace - lineH) {
      doc.addPage();
      y = 15;
    }

    if (item.type === 'round') {
      y += 2; // extra space before round header
      setFont('bold', 10);
      doc.setTextColor(120, 120, 120);
      doc.text(item.label, pageW / 2, y, { align: 'center' });
      // Subtle line under round header
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.line(M + 20, y + 1.5, pageW - M - 20, y + 1.5);
    } else {
      drawMatchRow(item.match, y);
    }
    y += lineH;
  }
  y += 2;

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PATIČKA
  // ═══════════════════════════════════════════════════════════════════════════

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, pageH - 10, pageW - M, pageH - 10);
  doc.setTextColor(160, 160, 160);
  setFont('normal', 7);
  doc.text(
    `${t('pdf.generated')}: ${new Date().toLocaleDateString(dateLocale)}`,
    M,
    pageH - 6,
  );
  doc.text('TORQ · torq.cz', pageW - M, pageH - 6, { align: 'right' });

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════════

  const safeName = tournament.name
    .replace(/[^a-zA-Z0-9\u00C0-\u017F ]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  const filePrefix = t('pdf.filePrefix');
  const fileFallback = t('pdf.fileFallback');
  doc.save(`${filePrefix}-${safeName || fileFallback}.pdf`);
}
