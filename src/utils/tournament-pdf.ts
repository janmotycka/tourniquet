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

  y = 13;
  doc.setTextColor(0, 0, 0);
  setFont('bold', 24);
  const nameLines = doc.splitTextToSize(tournament.name, W - 10);
  const nameText = nameLines.length > 1 ? nameLines[0] + '…' : nameLines[0];
  doc.text(nameText, pageW / 2, y, { align: 'center' });
  y += 7;

  doc.setTextColor(80, 80, 80);
  setFont('normal', 10);
  doc.text(dateStr, pageW / 2, y, { align: 'center' });
  y += 4;

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
  setFont('bold', 9);
  doc.setTextColor(0, 0, 0);
  doc.text(t('pdf.scanQr'), qrX + qrSize / 2, qrY + qrSize + 5, { align: 'center' });
  setFont('normal', 6.5);
  doc.setTextColor(100, 100, 100);
  doc.text(t('pdf.scanQrDesc'), qrX + qrSize / 2, qrY + qrSize + 9.5, { align: 'center' });

  const qrBlockBottom = qrY + qrSize + 12;

  // Info tabulka (vpravo od QR)
  const infoX = qrX + qrSize + 8;
  const infoW = pageW - M - infoX - 4;
  let infoY = cardY + 7;
  const rowH = 5.2;
  const labelCol = 34; // šířka sloupce labelu

  const drawInfoRow = (label: string, value: string) => {
    setFont('normal', 8);
    doc.setTextColor(100, 100, 100);
    doc.text(label, infoX, infoY);
    setFont('bold', 8);
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

    setFont('bold', 7);
    doc.setTextColor(80, 80, 80);
    doc.text(t('pdf.rules'), infoX, infoY);
    infoY += 3;

    setFont('normal', 6.5);
    doc.setTextColor(60, 60, 60);
    const rulesLines: string[] = doc.splitTextToSize(settings.rules!, infoW);
    const maxInfoRulesLines = 6;
    const displayLines = rulesLines.slice(0, maxInfoRulesLines);
    for (const line of displayLines) {
      doc.text(line, infoX, infoY);
      infoY += 2.8;
    }
    if (rulesLines.length > maxInfoRulesLines) {
      doc.setTextColor(140, 140, 140);
      setFont('normal', 5.5);
      doc.text(`… ${t('pdf.rulesMoreOnline')}`, infoX, infoY);
      infoY += 2.8;
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

  setFont('bold', 9);
  doc.setTextColor(0, 0, 0);
  doc.text(t('pdf.teams'), M, y);
  y += 2;

  // Team badges — evenly spaced grid
  setFont('normal', 7);
  const teamCount = tournament.teams.length;
  // Determine number of columns (3-5 based on team count)
  const gridCols = teamCount <= 4 ? 2 : teamCount <= 9 ? 3 : teamCount <= 16 ? 4 : 5;
  const cellW = W / gridCols;
  const cellH = 6;
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
  // 4. ROZPIS ZÁPASŮ — kompaktní tabulka (dvousloupcově pro > 20 zápasů)
  // ═══════════════════════════════════════════════════════════════════════════

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(M, y, M + W, y);
  y += 4;

  setFont('bold', 9);
  doc.setTextColor(0, 0, 0);
  doc.text(t('pdf.matchSchedule'), M, y);
  y += 5;

  const hasPitches = (settings.numberOfPitches ?? 1) > 1;
  const getTeam = (id: string) => tournament.teams.find(t => t.id === id);
  const getTeamName = (id: string) => getTeam(id)?.name ?? '?';
  const getTeamColor = (id: string) => getTeam(id)?.color ?? '#999';

  // Matches grouped by round
  const rounds = new Map<number, typeof tournament.matches>();
  for (const m of sortedMatches) {
    const arr = rounds.get(m.roundIndex) ?? [];
    arr.push(m);
    rounds.set(m.roundIndex, arr);
  }

  // Use two columns if many matches (> 20)
  const useTwoCols = tournament.matches.length > 20;
  const colW = useTwoCols ? (W - 4) / 2 : W; // each column width
  const colGap = 4; // gap between columns

  // Measure longest team name for dynamic column positions
  setFont('bold', 6);
  let maxTeamW = 0;
  for (const team of tournament.teams) {
    maxTeamW = Math.max(maxTeamW, doc.getTextWidth(team.name));
  }
  // Cap based on available column width
  const maxNameCap = useTwoCols ? 28 : 60;
  maxTeamW = Math.min(maxTeamW, maxNameCap);

  const fontSize = useTwoCols ? 5.5 : 6.5;
  const dotR = useTwoCols ? 2.5 : 3;

  // Helper: draw a match row at given position within a column
  const drawMatchRow = (m: typeof tournament.matches[0], baseX: number, rowY: number) => {
    const localColTime = baseX;
    const localColPitch = baseX + (useTwoCols ? 11 : 14);
    const localColHome = hasPitches ? localColPitch + (useTwoCols ? 6 : 10) : localColTime + (useTwoCols ? 11 : 14);
    const localColScoreX = localColHome + maxTeamW + dotR + 3;
    const localColAway = localColScoreX + 4 + dotR;

    setFont('normal', fontSize);
    doc.text(formatMatchTime(m.scheduledTime, locale), localColTime, rowY);
    if (hasPitches) {
      doc.text(String(m.pitchNumber ?? 1), localColPitch + 2, rowY);
    }

    // Home team + color dot
    setFont('bold', fontSize);
    const homeName = getTeamName(m.homeTeamId);
    const homeDisplay = doc.getTextWidth(homeName) > maxTeamW
      ? homeName.slice(0, Math.floor(maxNameCap / 2)) + '…' : homeName;
    doc.text(homeDisplay, localColHome, rowY);
    doc.setFillColor(...hexToRgb(getTeamColor(m.homeTeamId)));
    doc.circle(localColScoreX - dotR - 1, rowY - 0.8, 0.8, 'F');

    // Score — finished: čísla, jinak jen jemná dvojtečka
    setFont('normal', fontSize);
    if (m.status === 'finished') {
      setFont('bold', fontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(`${m.homeScore} : ${m.awayScore}`, localColScoreX, rowY, { align: 'center' });
    } else {
      doc.setTextColor(190, 190, 190);
      doc.text(':', localColScoreX, rowY, { align: 'center' });
    }
    doc.setTextColor(0, 0, 0);

    // Away team + color dot
    doc.setFillColor(...hexToRgb(getTeamColor(m.awayTeamId)));
    doc.circle(localColAway - dotR + 0.3, rowY - 0.8, 0.8, 'F');
    setFont('bold', fontSize);
    const awayName = getTeamName(m.awayTeamId);
    const awayDisplay = doc.getTextWidth(awayName) > maxTeamW
      ? awayName.slice(0, Math.floor(maxNameCap / 2)) + '…' : awayName;
    doc.text(awayDisplay, localColAway, rowY);
  };

  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(M, y - 1, W, 5, 'F');
  setFont('bold', fontSize);
  doc.setTextColor(80, 80, 80);
  const drawTableHeader = (baseX: number) => {
    doc.text(t('pdf.colTime'), baseX, y + 3);
    if (hasPitches) doc.text(t('pdf.colPitch'), baseX + (useTwoCols ? 11 : 14), y + 3);
    const hColHome = hasPitches ? baseX + (useTwoCols ? 17 : 24) : baseX + (useTwoCols ? 11 : 14);
    doc.text(t('pdf.colHome'), hColHome, y + 3);
    doc.text(t('pdf.colAway'), hColHome + maxTeamW + dotR + 10, y + 3);
  };
  drawTableHeader(M + 2);
  if (useTwoCols) drawTableHeader(M + colW + colGap + 2);
  doc.setTextColor(0, 0, 0);
  y += 6;

  // Build flat list of renderable items (round headers + match rows)
  type RenderItem = { type: 'round'; label: string } | { type: 'match'; match: typeof tournament.matches[0] };
  const items: RenderItem[] = [];
  for (const [roundIdx, matches] of rounds) {
    items.push({ type: 'round', label: `${roundIdx + 1}. ${t('pdf.round')}` });
    for (const m of matches) {
      items.push({ type: 'match', match: m });
    }
  }

  // Calculate available space for matches
  const spaceForMatches = pageH - y - 50;
  const totalLines = items.length;
  const linesPerCol = useTwoCols ? Math.ceil(totalLines / 2) : totalLines;
  const lineH = Math.min(4, Math.max(2.8, spaceForMatches / linesPerCol));

  if (useTwoCols) {
    // Split items into two columns
    const col1Items = items.slice(0, linesPerCol);
    const col2Items = items.slice(linesPerCol);
    const startY = y;

    // Draw column 1
    let cy = startY;
    for (const item of col1Items) {
      if (item.type === 'round') {
        setFont('bold', fontSize);
        doc.setTextColor(0, 0, 0);
        doc.text(item.label, M + 2, cy);
      } else {
        drawMatchRow(item.match, M + 2, cy);
      }
      cy += lineH;
    }

    // Draw column 2
    cy = startY;
    for (const item of col2Items) {
      if (item.type === 'round') {
        setFont('bold', fontSize);
        doc.setTextColor(0, 0, 0);
        doc.text(item.label, M + colW + colGap + 2, cy);
      } else {
        drawMatchRow(item.match, M + colW + colGap + 2, cy);
      }
      cy += lineH;
    }

    // Vertical separator between columns
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(M + colW + colGap / 2, startY - 2, M + colW + colGap / 2, startY + linesPerCol * lineH);

    y = startY + linesPerCol * lineH + 2;
  } else {
    // Single column
    for (const item of items) {
      if (item.type === 'round') {
        setFont('bold', fontSize);
        doc.setTextColor(0, 0, 0);
        doc.text(item.label, M + 2, y);
      } else {
        drawMatchRow(item.match, M + 2, y);
      }
      y += lineH;
    }
    y += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PATIČKA
  // ═══════════════════════════════════════════════════════════════════════════

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, pageH - 10, pageW - M, pageH - 10);
  doc.setTextColor(160, 160, 160);
  setFont('normal', 6);
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
