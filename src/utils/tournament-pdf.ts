import type { jsPDF as JsPDFType } from 'jspdf';
import type { Tournament } from '../types/tournament.types';
import { formatMatchTime } from './tournament-schedule';
import { generateQRCodeDataUrl } from './qr-code';
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

function truncateText(doc: JsPDFType, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 3 && doc.getTextWidth(t + '…') > maxW) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

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
  // 3. TÝMY — kompaktní inline seznam (jen pokud nejsou skupiny — ty mají rozlosování)
  // ═══════════════════════════════════════════════════════════════════════════

  const hasGroups = (settings.groups ?? []).length > 0;

  if (!hasGroups) {
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
  }

  const footerSpace = 14;
  const hasPitches = (settings.numberOfPitches ?? 1) > 1;
  const getSideName = (m: typeof tournament.matches[0], side: 'home' | 'away'): string => {
    const id = side === 'home' ? m.homeTeamId : m.awayTeamId;
    const placeholder = side === 'home' ? m.homeTeamPlaceholder : m.awayTeamPlaceholder;
    if (id) {
      const team = tournament.teams.find(tm => tm.id === id);
      if (team) return team.name;
    }
    return placeholder ?? '?';
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 3a. ROZLOSOVÁNÍ — tabulky skupin s týmy (jen u turnajů se skupinami)
  // ═══════════════════════════════════════════════════════════════════════════
  const groups = settings.groups ?? [];
  if (groups.length > 0) {
    setFont('bold', 12);
    doc.setTextColor(0, 0, 0);
    doc.text(t('pdf.groupDraw') || 'ROZLOSOVÁNÍ', pageW / 2, y, { align: 'center' });
    y += 3;
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.4);
    doc.line(M + 30, y, pageW - M - 30, y);
    y += 5;

    // Render skupiny vedle sebe — 4 skupiny = 2×2 (symetricky), jinak max 3 na řádek
    const colsPerRow = groups.length === 4 ? 2 : Math.min(groups.length, 3);
    const groupColW = (W - (colsPerRow - 1) * 4) / colsPerRow;

    for (let gi = 0; gi < groups.length; gi += colsPerRow) {
      const rowGroups = groups.slice(gi, gi + colsPerRow);
      const maxTeamsInRow = Math.max(...rowGroups.map(g => g.teamIds.length));
      const blockH = 6 + maxTeamsInRow * 5.5 + 4;

      if (y + blockH > pageH - footerSpace) { doc.addPage(); y = 15; }

      rowGroups.forEach((g, ci) => {
        const x = M + ci * (groupColW + 4);

        // Název skupiny
        setFont('bold', 9);
        doc.setTextColor(26, 35, 126);
        doc.text(g.name, x + groupColW / 2, y + 4, { align: 'center' });

        // Tým řádky
        setFont('normal', 8);
        doc.setTextColor(60, 60, 60);
        g.teamIds.forEach((teamId, ti) => {
          const team = tournament.teams.find(tm => tm.id === teamId);
          const teamName = team?.name ?? `Tým ${ti + 1}`;
          const rowY = y + 8 + ti * 5.5;

          // Alternující pozadí
          if (ti % 2 === 0) {
            doc.setFillColor(245, 247, 250);
            doc.rect(x, rowY - 3, groupColW, 5.5, 'F');
          }

          // Pořadí + název
          doc.text(`${ti + 1}.`, x + 2, rowY);
          setFont('bold', 8);
          doc.text(truncateText(doc, teamName, groupColW - 12), x + 8, rowY);
          setFont('normal', 8);
        });

        // Border kolem skupiny
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.roundedRect(x, y, groupColW, blockH - 2, 1.5, 1.5, 'S');
      });

      y += blockH + 2;
    }

    y += 4;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ROZPIS ZÁPASŮ — nadpis až těsně nad prvním zápasem
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(M, y, M + W, y);
  y += 5;

  setFont('bold', 14);
  doc.setTextColor(0, 0, 0);
  doc.text(t('pdf.matchSchedule'), pageW / 2, y, { align: 'center' });
  y += 8;

  // Split matches: group phase (rendered by round) vs knockout (rendered as bracket)
  const groupMatches = sortedMatches.filter(m => !m.stage || m.stage === 'group');
  const knockoutMatches = sortedMatches.filter(m => m.stage && m.stage !== 'group');

  // Group-phase matches grouped by round
  const rounds = new Map<number, typeof tournament.matches>();
  for (const m of groupMatches) {
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
    const homeName = truncateName(getSideName(m, 'home'), maxHomeNameW);
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
    const awayName = truncateName(getSideName(m, 'away'), maxAwayNameW);
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

  // ═════════════════════════════════════════════════════════════════════════
  // 4b. PLAYOFF BRACKET (pavouk) — visual knockout diagram
  // ═════════════════════════════════════════════════════════════════════════
  if (knockoutMatches.length > 0) {
    // Group by stage — column order: QF → SF → F (third-place drawn separately)
    const byStage: Record<string, typeof knockoutMatches> = {
      quarterfinal: [], semifinal: [], final: [], 'third-place': [], placement: [],
    };
    for (const m of knockoutMatches) {
      const s = m.stage ?? 'final';
      if (byStage[s]) byStage[s].push(m);
    }
    for (const s of Object.keys(byStage)) {
      byStage[s].sort((a, b) => (a.bracketPosition ?? a.matchIndex) - (b.bracketPosition ?? b.matchIndex));
    }
    const columns: { label: string; matches: typeof knockoutMatches }[] = [];
    if (byStage.quarterfinal.length) columns.push({ label: t('pdf.stage.quarterfinal'), matches: byStage.quarterfinal });
    if (byStage.semifinal.length)    columns.push({ label: t('pdf.stage.semifinal'),    matches: byStage.semifinal });
    if (byStage.final.length)        columns.push({ label: t('pdf.stage.final'),        matches: byStage.final });
    const thirdPlace = byStage['third-place'][0] ?? null;

    const bracketSpace = columns.length * 18 + (thirdPlace ? 24 : 0) + 16; // rough estimate
    if (y + bracketSpace > pageH - footerSpace) {
      doc.addPage();
      y = 15;
    }

    // Section header
    y += 4;
    setFont('bold', 12);
    doc.setTextColor(0, 0, 0);
    doc.text(t('pdf.playoffBracket'), pageW / 2, y, { align: 'center' });
    y += 4;
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.4);
    doc.line(M + 30, y, pageW - M - 30, y);
    y += 5;

    // Layout: columns distributed across available width
    const cols = columns.length;
    if (cols > 0) {
      const boxW = Math.min(56, (W - 4) / cols - 4);
      const boxH = 14; // home + separator + away
      const colW = (W - 4) / cols;
      const bracketStartY = y;

      // Max matches in any column = first column (typically quarterfinal or semifinal)
      const maxMatches = Math.max(...columns.map(c => c.matches.length));
      const totalBracketH = maxMatches * (boxH + 8);

      // Draw column headers
      setFont('bold', 9);
      doc.setTextColor(80, 80, 80);
      columns.forEach((col, i) => {
        const cx = M + 2 + colW * i + colW / 2;
        doc.text(col.label.toUpperCase(), cx, bracketStartY, { align: 'center' });
      });

      const boxesStartY = bracketStartY + 4;

      // Remember center Y for each drawn box to connect lines
      const prevCenters: number[] = [];

      columns.forEach((col, colIdx) => {
        const n = col.matches.length;
        // Center matches vertically within totalBracketH
        const spacing = totalBracketH / n;
        const curCenters: number[] = [];

        col.matches.forEach((m, rowIdx) => {
          const centerY = boxesStartY + spacing * (rowIdx + 0.5);
          const boxX = M + 2 + colW * colIdx + (colW - boxW) / 2;
          const boxY = centerY - boxH / 2;

          // Box
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.3);
          doc.setFillColor(252, 252, 252);
          doc.roundedRect(boxX, boxY, boxW, boxH, 1.5, 1.5, 'FD');

          // Home team
          setFont('bold', 8);
          const homeName = getSideName(m, 'home');
          const awayName = getSideName(m, 'away');
          doc.setTextColor(m.homeTeamId ? 20 : 130, m.homeTeamId ? 20 : 130, m.homeTeamId ? 20 : 130);
          const homeTrunc = truncateText(doc, homeName, boxW - 10);
          doc.text(homeTrunc, boxX + 2, boxY + 5);
          // Score
          if (m.status === 'finished') {
            doc.setTextColor(0, 0, 0);
            doc.text(String(m.homeScore), boxX + boxW - 2, boxY + 5, { align: 'right' });
          }
          // Separator
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.2);
          doc.line(boxX + 2, boxY + boxH / 2, boxX + boxW - 2, boxY + boxH / 2);
          // Away team
          doc.setTextColor(m.awayTeamId ? 20 : 130, m.awayTeamId ? 20 : 130, m.awayTeamId ? 20 : 130);
          const awayTrunc = truncateText(doc, awayName, boxW - 10);
          doc.text(awayTrunc, boxX + 2, boxY + boxH - 2.5);
          if (m.status === 'finished') {
            doc.setTextColor(0, 0, 0);
            doc.text(String(m.awayScore), boxX + boxW - 2, boxY + boxH - 2.5, { align: 'right' });
          }

          curCenters.push(centerY);
        });

        // Connector lines from previous column to this column (pair by pair)
        if (colIdx > 0 && prevCenters.length >= 2 * n) {
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.3);
          const prevRightX = M + 2 + colW * (colIdx - 1) + (colW + boxW) / 2;
          const curLeftX  = M + 2 + colW * colIdx + (colW - boxW) / 2;
          const midX = (prevRightX + curLeftX) / 2;
          for (let i = 0; i < n; i++) {
            const topY = prevCenters[i * 2];
            const botY = prevCenters[i * 2 + 1];
            const centerY = curCenters[i];
            // Horizontal out from upper prev
            doc.line(prevRightX, topY, midX, topY);
            doc.line(prevRightX, botY, midX, botY);
            // Vertical connector
            doc.line(midX, topY, midX, botY);
            // Horizontal into current box
            doc.line(midX, centerY, curLeftX, centerY);
          }
        }

        prevCenters.length = 0;
        prevCenters.push(...curCenters);
      });

      y = boxesStartY + totalBracketH + 2;

      // Third-place match — small separate box below
      if (thirdPlace) {
        y += 4;
        setFont('bold', 9);
        doc.setTextColor(80, 80, 80);
        doc.text(t('pdf.stage.thirdPlace').toUpperCase(), pageW / 2, y, { align: 'center' });
        y += 3;
        const tpBoxW = 60;
        const tpBoxH = 14;
        const tpX = (pageW - tpBoxW) / 2;
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.setFillColor(252, 252, 252);
        doc.roundedRect(tpX, y, tpBoxW, tpBoxH, 1.5, 1.5, 'FD');
        setFont('bold', 8);
        doc.setTextColor(thirdPlace.homeTeamId ? 20 : 130, thirdPlace.homeTeamId ? 20 : 130, thirdPlace.homeTeamId ? 20 : 130);
        doc.text(truncateText(doc, getSideName(thirdPlace, 'home'), tpBoxW - 14), tpX + 2, y + 5);
        if (thirdPlace.status === 'finished') {
          doc.setTextColor(0, 0, 0);
          doc.text(String(thirdPlace.homeScore), tpX + tpBoxW - 2, y + 5, { align: 'right' });
        }
        doc.setDrawColor(220, 220, 220);
        doc.line(tpX + 2, y + tpBoxH / 2, tpX + tpBoxW - 2, y + tpBoxH / 2);
        doc.setTextColor(thirdPlace.awayTeamId ? 20 : 130, thirdPlace.awayTeamId ? 20 : 130, thirdPlace.awayTeamId ? 20 : 130);
        doc.text(truncateText(doc, getSideName(thirdPlace, 'away'), tpBoxW - 14), tpX + 2, y + tpBoxH - 2.5);
        if (thirdPlace.status === 'finished') {
          doc.setTextColor(0, 0, 0);
          doc.text(String(thirdPlace.awayScore), tpX + tpBoxW - 2, y + tpBoxH - 2.5, { align: 'right' });
        }
        y += tpBoxH + 2;
      }

      // Placement matches (play-out: O 5., 7., 9. místo...)
      const placementMatches = byStage.placement ?? [];
      if (placementMatches.length > 0) {
        y += 4;
        setFont('bold', 9);
        doc.setTextColor(80, 80, 80);
        doc.text('ZÁPASY O UMÍSTĚNÍ', pageW / 2, y, { align: 'center' });
        y += 4;

        for (const pm of placementMatches) {
          if (y + 16 > pageH - footerSpace) { doc.addPage(); y = 15; }
          const label = pm.placementLabel ?? 'O umístění';
          setFont('bold', 8);
          doc.setTextColor(120, 120, 120);
          doc.text(label.toUpperCase(), pageW / 2, y + 3, { align: 'center' });
          y += 5;
          const pmBoxW = 60;
          const pmBoxH = 14;
          const pmX = (pageW - pmBoxW) / 2;
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.3);
          doc.setFillColor(252, 252, 252);
          doc.roundedRect(pmX, y, pmBoxW, pmBoxH, 1.5, 1.5, 'FD');
          setFont('bold', 8);
          doc.setTextColor(pm.homeTeamId ? 20 : 130, pm.homeTeamId ? 20 : 130, pm.homeTeamId ? 20 : 130);
          doc.text(truncateText(doc, getSideName(pm, 'home'), pmBoxW - 14), pmX + 2, y + 5);
          if (pm.status === 'finished') {
            doc.setTextColor(0, 0, 0);
            doc.text(String(pm.homeScore), pmX + pmBoxW - 2, y + 5, { align: 'right' });
          }
          doc.setDrawColor(220, 220, 220);
          doc.line(pmX + 2, y + pmBoxH / 2, pmX + pmBoxW - 2, y + pmBoxH / 2);
          doc.setTextColor(pm.awayTeamId ? 20 : 130, pm.awayTeamId ? 20 : 130, pm.awayTeamId ? 20 : 130);
          doc.text(truncateText(doc, getSideName(pm, 'away'), pmBoxW - 14), pmX + 2, y + pmBoxH - 2.5);
          if (pm.status === 'finished') {
            doc.setTextColor(0, 0, 0);
            doc.text(String(pm.awayScore), pmX + pmBoxW - 2, y + pmBoxH - 2.5, { align: 'right' });
          }
          y += pmBoxH + 3;
        }
      }
    }
  }

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
