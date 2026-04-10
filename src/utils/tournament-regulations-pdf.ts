import type { jsPDF as JsPDFType } from 'jspdf';
import type { Tournament, TournamentRegulations } from '../types/tournament.types';
import { DEFAULT_TIEBREAKER_ORDER } from '../types/tournament.types';
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
    return false;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Render text with **bold** markers — returns final Y after rendering */
function renderRichText(
  doc: JsPDFType,
  text: string,
  x: number,
  y: number,
  maxW: number,
  fontFamily: string,
  fontSize: number,
): number {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  let curY = y;

  for (const part of parts) {
    const isBold = part.startsWith('**') && part.endsWith('**');
    const clean = isBold ? part.slice(2, -2) : part;
    if (!clean) continue;

    doc.setFont(fontFamily, isBold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(clean, maxW) as string[];
    for (const line of lines) {
      doc.text(line, x, curY);
      curY += fontSize * 0.4;
    }
  }

  return curY;
}

// ─── Format system description ──────────────────────────────────────────────

function describeFormat(tournament: Tournament): string {
  const { settings, teams } = tournament;
  const format = settings.format ?? 'round-robin';
  const teamCount = teams.length;

  if (format === 'round-robin') {
    return `Turnaj se hraje systémem každý s každým (${teamCount} týmů).`;
  }

  if (format === 'groups-knockout' && settings.groups?.length) {
    const groupSizes = settings.groups.map(g => g.teamIds.length);
    const groupDesc = groupSizes.join(' a ');
    const advance = settings.advancePerGroup ?? 2;
    let desc = `Turnaj se hraje ve ${settings.groups.length} skupinách po ${groupDesc} týmech`;
    desc += `, z každé skupiny postupují ${advance} týmy do vyřazovací fáze.`;
    if (settings.thirdPlaceMatch) desc += ' Hraje se zápas o 3. místo.';
    if (settings.playOut) desc += ' Hrají se zápasy o všechna umístění.';
    return desc;
  }

  if (format === 'knockout') {
    return `Turnaj se hraje vyřazovacím systémem (${teamCount} týmů).`;
  }

  return '';
}

// ─── Tiebreaker description ─────────────────────────────────────────────────

function describeTiebreakers(
  order: typeof DEFAULT_TIEBREAKER_ORDER,
  penaltyRounds: number,
): string[] {
  const lines: string[] = [];
  lines.push('O umístění rozhoduje:');
  lines.push('  1. počet bodů (vítězství 3 body, remíza 1 bod, prohra 0 bodů)');
  lines.push('  2. vzájemné utkání mužstev se stejným počtem bodů (mini tabulka), dále rozhoduje:');

  let idx = 3;
  for (const criterion of order) {
    if (criterion === 'h2h') continue; // already included above
    switch (criterion) {
      case 'goalDifference':
        lines.push(`  ${idx}. rozdíl skóre`);
        idx++;
        break;
      case 'goalsFor':
        lines.push(`  ${idx}. větší počet vstřelených branek`);
        idx++;
        break;
      case 'goalsAgainst':
        lines.push(`  ${idx}. menší počet obdržených branek`);
        idx++;
        break;
      case 'penalties':
        lines.push(`  ${idx}. ${penaltyRounds} pokutových kopů a pak po jednom až do rozhodnutí`);
        idx++;
        break;
    }
  }

  return lines;
}

// ─── Main export ────────────────────────────────────────────────────────────

export async function exportRegulationsPdf(
  tournament: Tournament,
  _t: TFn,
  locale: Locale,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();  // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297
  const M = 12; // margin
  const W = pageW - 2 * M; // usable width
  let y = M;

  const { settings } = tournament;
  const reg: TournamentRegulations = settings.regulations ?? {};
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

  // ── Page overflow helper ────────────────────────────────────────────────

  const checkPageOverflow = (needed: number) => {
    if (y + needed > pageH - 15) {
      doc.addPage();
      y = M;
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1: Propozice
  // ══════════════════════════════════════════════════════════════════════════

  // ── Logo (first team with logo) ───────────────────────────────────────

  const teamWithLogo = tournament.teams.find(t => t.logoBase64);
  if (teamWithLogo?.logoBase64) {
    try {
      const logoSize = 16;
      const logoX = (pageW - logoSize) / 2;
      doc.addImage(teamWithLogo.logoBase64, 'PNG', logoX, y, logoSize, logoSize);
      y += logoSize + 3;
    } catch {
      // skip logo on error
    }
  }

  // ── Tournament name ──────────────────────────────────────────────────

  setFont('bold', 22);
  doc.setTextColor(0, 0, 0);
  // Wrap long names
  const titleLines = doc.splitTextToSize(tournament.name, W) as string[];
  for (const line of titleLines) {
    const titleW = doc.getTextWidth(line);
    // Simulate italic with slight skew — jsPDF doesn't have native italic for custom fonts
    doc.text(line, (pageW - titleW) / 2, y);
    y += 8;
  }
  y += 1;

  // ── Date ─────────────────────────────────────────────────────────────

  setFont('normal', 11);
  doc.setTextColor(80, 80, 80);
  const dateW = doc.getTextWidth(dateStr);
  doc.text(dateStr, (pageW - dateW) / 2, y);
  y += 8;

  // ── Info table ──────────────────────────────────────────────────────

  const labelX = M;
  const labelW = 38;
  const valueX = M + labelW + 2;
  const valueW = W - labelW - 2;
  const rowFontSize = 9;
  const lineH = rowFontSize * 0.4; // ~3.6mm per line

  const labelColor: [number, number, number] = [102, 102, 102]; // #666
  const valueColor: [number, number, number] = [30, 30, 30];

  type Row = { label: string; value: string; isMultiLine?: boolean; isTiebreaker?: boolean; tiebreakerLines?: string[] };
  const rows: Row[] = [];

  // Build rows — only include non-empty values

  if (reg.organizer) {
    rows.push({ label: 'Pořadatel', value: reg.organizer });
  }
  if (reg.category) {
    rows.push({ label: 'Kategorie', value: reg.category });
  }

  // Venue
  const venueParts = [settings.venueName, settings.venueAddress].filter(Boolean);
  if (venueParts.length > 0) {
    rows.push({ label: 'Místo konání', value: venueParts.join(', ') });
  }

  if (reg.pitchDimensions) {
    rows.push({ label: 'Plocha', value: reg.pitchDimensions });
  }

  // Entry fee
  if (settings.entryFee) {
    let feeStr = `${settings.entryFee} Kč`;
    if (settings.entryFeeNote) feeStr += ` (${settings.entryFeeNote})`;
    rows.push({ label: 'Startovné', value: feeStr });
  }

  // Format
  const formatDesc = describeFormat(tournament);
  if (formatDesc) {
    rows.push({ label: 'Hrací systém', value: formatDesc, isMultiLine: true });
  }

  // Match duration
  if (settings.matchDurationMinutes) {
    rows.push({ label: 'Hrací doba', value: `1 x ${settings.matchDurationMinutes} minut hrubého času` });
  }

  if (reg.matchFormat) {
    rows.push({ label: 'Počet hráčů', value: reg.matchFormat });
  }
  if (reg.substitutionRules) {
    rows.push({ label: 'Střídání', value: reg.substitutionRules });
  }

  // Game rules (multi-line, supports **bold**)
  const gameRulesText = reg.gameRules || settings.rules;
  if (gameRulesText) {
    rows.push({ label: 'Pravidla', value: gameRulesText, isMultiLine: true });
  }

  // Roster
  if (reg.rosterRequired) {
    if (settings.registrationEnabled) {
      const publicUrl = getTournamentPublicUrl(tournament.id);
      rows.push({ label: 'Soupiska', value: `Vyplňte online na adrese: ${publicUrl}` });
    } else {
      rows.push({ label: 'Soupiska', value: 'Odevzdejte před prvním zápasem organizátorům' });
    }
  }

  if (reg.cardRules) {
    rows.push({ label: 'Tresty', value: reg.cardRules });
  }
  if (reg.protestRules) {
    rows.push({ label: 'Protesty', value: reg.protestRules });
  }
  if (reg.equipment) {
    rows.push({ label: 'Vybavení', value: reg.equipment });
  }
  if (reg.prizes) {
    rows.push({ label: 'Ceny', value: reg.prizes });
  }

  // Tiebreaker
  const tiebreakerOrder = settings.tiebreakerOrder ?? DEFAULT_TIEBREAKER_ORDER;
  const penaltyRounds = reg.penaltyRounds ?? 5;
  const tiebreakerLines = describeTiebreakers(tiebreakerOrder, penaltyRounds);
  rows.push({ label: 'Hodnocení', value: '', isTiebreaker: true, tiebreakerLines });

  if (reg.referees) {
    rows.push({ label: 'Rozhodčí', value: reg.referees });
  }
  if (reg.insurance) {
    rows.push({ label: 'Pojištění', value: reg.insurance });
  }
  if (reg.changingRooms) {
    rows.push({ label: 'Šatny', value: reg.changingRooms });
  }
  if (reg.organizerDisclaimer) {
    rows.push({ label: 'Organizátor', value: reg.organizerDisclaimer, isMultiLine: true });
  }

  // Contact
  const contactParts: string[] = [];
  if (reg.contactName) contactParts.push(reg.contactName);
  if (reg.contactPhone) contactParts.push(`tel. ${reg.contactPhone}`);
  if (reg.contactEmail) contactParts.push(reg.contactEmail);
  if (contactParts.length > 0) {
    rows.push({ label: 'Kontakt', value: contactParts.join(', ') });
  }

  // ── Render rows ─────────────────────────────────────────────────────

  for (const row of rows) {
    if (row.isTiebreaker && row.tiebreakerLines) {
      // Tiebreaker section
      const tbLineH = lineH;
      const needed = row.tiebreakerLines.length * tbLineH + 2;
      checkPageOverflow(needed);

      // Label
      setFont('bold', rowFontSize);
      doc.setTextColor(...labelColor);
      doc.text(row.label, labelX, y);

      // Lines
      setFont('normal', rowFontSize);
      doc.setTextColor(...valueColor);
      for (const line of row.tiebreakerLines) {
        const wrapped = doc.splitTextToSize(line, valueW) as string[];
        for (const wl of wrapped) {
          doc.text(wl, valueX, y);
          y += tbLineH;
        }
      }
      y += 1;
      continue;
    }

    // Calculate wrapped value lines
    setFont('normal', rowFontSize);
    const valueLines = doc.splitTextToSize(row.value, valueW) as string[];
    const rowH = Math.max(1, valueLines.length) * lineH;

    checkPageOverflow(rowH + 2);

    // Label
    setFont('bold', rowFontSize);
    doc.setTextColor(...labelColor);
    doc.text(row.label, labelX, y);

    // Value — check if it has **bold** markers
    if (row.value.includes('**')) {
      const afterY = renderRichText(doc, row.value, valueX, y, valueW, fontFamily, rowFontSize);
      y = afterY + 1;
    } else {
      // Contact row: bold the phone number
      if (row.label === 'Kontakt' && reg.contactPhone) {
        // Render contact with bold phone
        const beforePhone = reg.contactName ? `${reg.contactName}, tel. ` : 'tel. ';
        const afterPhone = reg.contactEmail ? `, ${reg.contactEmail}` : '';

        setFont('normal', rowFontSize);
        doc.setTextColor(...valueColor);
        doc.text(beforePhone, valueX, y);
        const beforeW = doc.getTextWidth(beforePhone);

        setFont('bold', rowFontSize);
        doc.text(reg.contactPhone, valueX + beforeW, y);
        const phoneW = doc.getTextWidth(reg.contactPhone);

        if (afterPhone) {
          setFont('normal', rowFontSize);
          doc.text(afterPhone, valueX + beforeW + phoneW, y);
        }
        y += lineH + 1;
      } else {
        setFont('normal', rowFontSize);
        doc.setTextColor(...valueColor);
        for (const vl of valueLines) {
          doc.text(vl, valueX, y);
          y += lineH;
        }
        y += 1;
      }
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────

  const drawFooter = () => {
    const footerY = pageH - 10;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(M, footerY - 3, pageW - M, footerY - 3);

    setFont('normal', 7);
    doc.setTextColor(140, 140, 140);

    const now = new Date().toLocaleDateString(dateLocale, {
      day: 'numeric', month: 'numeric', year: 'numeric',
    });
    doc.text(`Vygenerováno: ${now}`, M, footerY);

    const brand = 'TORQ \u00B7 torq.cz';
    const brandW = doc.getTextWidth(brand);
    doc.text(brand, pageW - M - brandW, footerY);
  };

  drawFooter();

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2: Soupiska (only if rosterRequired)
  // ══════════════════════════════════════════════════════════════════════════

  if (reg.rosterRequired) {
    doc.addPage();
    y = M;

    if (settings.registrationEnabled) {
      // ── Online roster ──────────────────────────────────────────────

      y += 15;
      setFont('bold', 18);
      doc.setTextColor(0, 0, 0);
      const headerText = 'SOUPISKA';
      const headerW = doc.getTextWidth(headerText);
      doc.text(headerText, (pageW - headerW) / 2, y);
      y += 12;

      setFont('normal', 11);
      doc.setTextColor(60, 60, 60);
      const instrText = 'Soupisku vyplňte online:';
      const instrW = doc.getTextWidth(instrText);
      doc.text(instrText, (pageW - instrW) / 2, y);
      y += 10;

      // QR code
      try {
        const qrDataUrl = await generateQRCodeDataUrl(tournament.id);
        const qrSize = 50;
        doc.addImage(qrDataUrl, 'PNG', (pageW - qrSize) / 2, y, qrSize, qrSize);
        y += qrSize + 6;
      } catch {
        y += 6;
      }

      // URL
      const publicUrl = getTournamentPublicUrl(tournament.id);
      setFont('normal', 8);
      doc.setTextColor(80, 80, 80);
      const urlW = doc.getTextWidth(publicUrl);
      doc.text(publicUrl, (pageW - urlW) / 2, y);

    } else {
      // ── Paper roster (school tournaments) ───────────────────────

      y += 10;
      setFont('bold', 18);
      doc.setTextColor(0, 0, 0);
      const headerText = 'SOUPISKA';
      const headerW = doc.getTextWidth(headerText);
      doc.text(headerText, (pageW - headerW) / 2, y);
      y += 14;

      // Club/School field
      setFont('normal', 10);
      doc.setTextColor(0, 0, 0);
      doc.text('Klub / Škola:', M, y);
      setFont('normal', 10);
      doc.setTextColor(160, 160, 160);
      const dotLine1 = '\u2024'.repeat(60);
      doc.text(dotLine1, M + 30, y);
      y += 8;

      // Jersey color field
      setFont('normal', 10);
      doc.setTextColor(0, 0, 0);
      doc.text('Barva dresů:', M, y);
      doc.setTextColor(160, 160, 160);
      doc.text(dotLine1, M + 30, y);
      y += 10;

      // Table header
      const colX = [M, M + 14, M + 70, M + 130];
      const colHeaders = ['číslo', 'jméno', 'příjmení', 'rok narození'];

      setFont('bold', 9);
      doc.setTextColor(80, 80, 80);
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.4);
      doc.line(M, y + 1, pageW - M, y + 1);
      y += 5;

      for (let c = 0; c < colHeaders.length; c++) {
        doc.text(colHeaders[c], colX[c], y);
      }
      y += 2;
      doc.line(M, y, pageW - M, y);
      y += 5;

      // 14 dotted rows
      setFont('normal', 9);
      doc.setTextColor(180, 180, 180);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);

      for (let r = 0; r < 14; r++) {
        // Row number
        doc.setTextColor(140, 140, 140);
        doc.text(`${r + 1}.`, M + 2, y);

        // Light lines for each column
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.15);
        doc.line(colX[1], y + 1, colX[1] + 52, y + 1);
        doc.line(colX[2], y + 1, colX[2] + 56, y + 1);
        doc.line(colX[3], y + 1, colX[3] + 30, y + 1);

        y += 7;
      }

      y += 5;

      // Coach + phone footer
      setFont('normal', 10);
      doc.setTextColor(0, 0, 0);
      doc.text('Trenér:', M, y);
      doc.setTextColor(160, 160, 160);
      const dots = '\u2024'.repeat(30);
      doc.text(dots, M + 16, y);

      doc.setTextColor(0, 0, 0);
      doc.text('mobil:', M + 100, y);
      doc.setTextColor(160, 160, 160);
      doc.text(dots, M + 114, y);
    }

    drawFooter();
  }

  // ── Save ──────────────────────────────────────────────────────────────

  const fileName = `propozice-${tournament.name.replace(/[^a-zA-Z0-9áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ ]/g, '').replace(/\s+/g, '-').toLowerCase()}.pdf`;
  doc.save(fileName);
}
