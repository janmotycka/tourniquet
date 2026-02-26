import jsPDF from 'jspdf';
import type { Tournament } from '../types/tournament.types';
import { formatMatchTime } from './tournament-schedule';
import { generateQRCodeDataUrl, getTournamentPublicUrl } from './qr-code';
import type { Locale } from '../i18n';

// ─── Types ──────────────────────────────────────────────────────────────────

type TFn = (key: string, params?: Record<string, string | number>) => string;

// ─── Font loader (Roboto s českou diakritikou) ──────────────────────────────

let fontCache: { regular?: string; bold?: string } = {};

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

async function loadFonts(doc: jsPDF): Promise<boolean> {
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

  const dateLocale = locale === 'cs' ? 'cs-CZ' : 'en-US';
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
    endTimeStr = end.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. HEADER — tmavě modrý banner s názvem turnaje
  // ═══════════════════════════════════════════════════════════════════════════

  const headerH = 22;
  doc.setFillColor(26, 35, 126); // #1A237E
  doc.rect(0, 0, pageW, headerH, 'F');

  // Tournament name
  doc.setTextColor(255, 255, 255);
  setFont('bold', 18);
  const nameLines = doc.splitTextToSize(tournament.name, W - 10);
  const nameText = nameLines.length > 1 ? nameLines[0] + '…' : nameLines[0];
  doc.text(nameText, pageW / 2, 10, { align: 'center' });

  // Subtitle: date, start time
  setFont('normal', 9);
  const subtitle = `${dateStr}  ·  ${t('pdf.start')}: ${settings.startTime}${endTimeStr ? `  ·  ${t('pdf.estimatedEnd')}: ${endTimeStr}` : ''}`;
  doc.text(subtitle, pageW / 2, 17, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  y = headerH + 4;

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. QR KÓD (vlevo) + INFO (vpravo) — side by side
  // ═══════════════════════════════════════════════════════════════════════════

  const qrSize = 36;
  const qrX = M;
  const qrY = y;
  const infoX = M + qrSize + 8;

  // QR Code
  try {
    const qrDataUrl = await generateQRCodeDataUrl(tournament.id);
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  } catch {
    setFont('normal', 8);
    doc.setTextColor(150, 150, 150);
    doc.text('QR N/A', qrX + qrSize / 2, qrY + qrSize / 2, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  // "Scan for live results" pod QR
  setFont('bold', 7);
  doc.setTextColor(26, 35, 126);
  doc.text(t('pdf.scanQr'), qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });
  // URL pod QR
  setFont('normal', 5.5);
  doc.setTextColor(120, 120, 120);
  const publicUrl = getTournamentPublicUrl(tournament.id);
  const shortUrl = publicUrl.length > 50 ? publicUrl.slice(0, 47) + '…' : publicUrl;
  doc.text(shortUrl, qrX + qrSize / 2, qrY + qrSize + 8, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Info section (right of QR)
  let infoY = qrY + 1;
  const drawInfo = (label: string, value: string) => {
    setFont('bold', 8);
    doc.setTextColor(100, 100, 100);
    doc.text(label, infoX, infoY);
    setFont('normal', 8);
    doc.setTextColor(0, 0, 0);
    doc.text(value, infoX + 38, infoY);
    infoY += 4.5;
  };

  drawInfo(t('pdf.date'), dateStr);
  drawInfo(t('pdf.startTime'), settings.startTime + (endTimeStr ? ` – ${endTimeStr}` : ''));
  drawInfo(t('pdf.teamCount'), String(tournament.teams.length));
  drawInfo(t('pdf.matchCount'), String(tournament.matches.length));
  drawInfo(t('pdf.matchDuration'), `${settings.matchDurationMinutes} ${t('common.min')}`);
  if (settings.breakBetweenMatchesMinutes > 0) {
    drawInfo(t('pdf.breakDuration'), `${settings.breakBetweenMatchesMinutes} ${t('common.min')}`);
  }
  if ((settings.numberOfPitches ?? 1) > 1) {
    drawInfo(t('pdf.pitchCount'), String(settings.numberOfPitches));
  }
  drawInfo(t('pdf.scoring'), t('pdf.scoringValue'));

  y = Math.max(qrY + qrSize + 11, infoY) + 2;

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. TÝMY — kompaktní seznam na jednom řádku
  // ═══════════════════════════════════════════════════════════════════════════

  // Section divider
  doc.setDrawColor(200, 200, 200);
  doc.line(M, y, M + W, y);
  y += 4;

  setFont('bold', 8);
  doc.setTextColor(26, 35, 126);
  doc.text(t('pdf.teams'), M, y);
  y += 1;

  // Team badges inline
  let tx = M;
  const badgeH = 5;
  const badgePad = 3;
  setFont('normal', 7);

  for (const team of tournament.teams) {
    const textW = doc.getTextWidth(team.name) + 8; // badge width

    // Wrap to next line if needed
    if (tx + textW > M + W) {
      tx = M;
      y += badgeH + 2;
    }

    // Color dot
    doc.setFillColor(...hexToRgb(team.color));
    doc.circle(tx + 2.5, y + badgeH / 2 + 1, 1.5, 'F');

    // Team name
    doc.setTextColor(30, 30, 30);
    doc.text(team.name, tx + 5.5, y + badgeH / 2 + 2);

    tx += textW + badgePad;
  }
  y += badgeH + 5;

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ROZPIS ZÁPASŮ — kompaktní tabulka
  // ═══════════════════════════════════════════════════════════════════════════

  doc.setDrawColor(200, 200, 200);
  doc.line(M, y - 2, M + W, y - 2);

  setFont('bold', 8);
  doc.setTextColor(26, 35, 126);
  doc.text(t('pdf.matchSchedule'), M, y + 2);
  y += 6;

  const hasPitches = (settings.numberOfPitches ?? 1) > 1;
  const getTeamName = (id: string) => tournament.teams.find(t => t.id === id)?.name ?? '?';

  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(M, y - 1, W, 5, 'F');
  setFont('bold', 6.5);
  doc.setTextColor(80, 80, 80);

  const colTime = M + 2;
  const colPitch = M + 17;
  const colHome = hasPitches ? M + 28 : M + 20;
  const colScore = M + W / 2 + 5;
  const colAway = colScore + 15;

  doc.text(t('pdf.colTime'), colTime, y + 3);
  if (hasPitches) doc.text(t('pdf.colPitch'), colPitch, y + 3);
  doc.text(t('pdf.colHome'), colHome, y + 3);
  doc.text(t('pdf.colScore'), colScore, y + 3);
  doc.text(t('pdf.colAway'), colAway, y + 3);
  doc.setTextColor(0, 0, 0);
  y += 6;

  // Matches grouped by round
  const rounds = new Map<number, typeof tournament.matches>();
  for (const m of sortedMatches) {
    const arr = rounds.get(m.roundIndex) ?? [];
    arr.push(m);
    rounds.set(m.roundIndex, arr);
  }

  // Calculate available space for matches
  const spaceForMatches = pageH - y - 50; // reserve 50mm for rules + footer
  const totalMatchLines = tournament.matches.length + rounds.size; // matches + round headers
  const lineH = Math.min(4, Math.max(3, spaceForMatches / totalMatchLines));

  for (const [roundIdx, matches] of rounds) {
    // Round header
    setFont('bold', 6.5);
    doc.setTextColor(26, 35, 126);
    doc.text(`${roundIdx + 1}. ${t('pdf.round')}`, M + 2, y);
    doc.setTextColor(0, 0, 0);
    y += lineH;

    for (const m of matches) {
      setFont('normal', 6.5);
      const time = formatMatchTime(m.scheduledTime);
      doc.text(time, colTime, y);
      if (hasPitches) {
        doc.text(String(m.pitchNumber ?? 1), colPitch + 4, y);
      }

      setFont('bold', 6.5);
      doc.text(getTeamName(m.homeTeamId), colHome, y);

      setFont('normal', 6.5);
      doc.setTextColor(120, 120, 120);
      const scoreStr = m.status === 'finished'
        ? `${m.homeScore} : ${m.awayScore}`
        : '— : —';
      doc.text(scoreStr, colScore, y);
      doc.setTextColor(0, 0, 0);

      setFont('bold', 6.5);
      doc.text(getTeamName(m.awayTeamId), colAway, y);

      y += lineH;
    }
    y += 1; // gap between rounds
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PRAVIDLA / PROPOZICE (pokud jsou nastavena)
  // ═══════════════════════════════════════════════════════════════════════════

  if (settings.rules && settings.rules.trim()) {
    y += 1;
    doc.setDrawColor(200, 200, 200);
    doc.line(M, y, M + W, y);
    y += 4;

    setFont('bold', 8);
    doc.setTextColor(26, 35, 126);
    doc.text(t('pdf.rules'), M, y);
    y += 4;

    setFont('normal', 7);
    doc.setTextColor(40, 40, 40);

    // Truncate rules to fit remaining space
    const remainingSpace = pageH - y - 14; // 14mm for footer
    const maxRulesLines = Math.floor(remainingSpace / 3.2);
    const allLines: string[] = doc.splitTextToSize(settings.rules, W - 4);
    const lines = allLines.slice(0, maxRulesLines);

    for (const line of lines) {
      doc.text(line, M + 2, y);
      y += 3.2;
    }

    if (allLines.length > maxRulesLines) {
      doc.setTextColor(120, 120, 120);
      setFont('normal', 6);
      doc.text(`… (${t('pdf.rulesMoreOnline')})`, M + 2, y);
      y += 3;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. PATIČKA
  // ═══════════════════════════════════════════════════════════════════════════

  doc.setTextColor(160, 160, 160);
  setFont('normal', 6);
  doc.text(
    `${t('pdf.generated')}: ${new Date().toLocaleDateString(dateLocale)}`,
    M,
    pageH - 6,
  );
  doc.text(
    `${t('pdf.scoring')}: ${t('pdf.scoringValue')}`,
    pageW / 2,
    pageH - 6,
    { align: 'center' },
  );
  doc.text('TORQ', pageW - M, pageH - 6, { align: 'right' });

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════════

  const safeName = tournament.name
    .replace(/[^a-zA-Z0-9\u00C0-\u017F ]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  doc.save(`propozice-${safeName || 'turnaj'}.pdf`);
}
