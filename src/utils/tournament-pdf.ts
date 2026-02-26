import jsPDF from 'jspdf';
import type { Tournament } from '../types/tournament.types';
import { formatMatchTime } from './tournament-schedule';
import { generateQRCodeDataUrl, getTournamentPublicUrl } from './qr-code';

/**
 * Vygeneruje PDF s propozicemi turnaje a stáhne ho.
 * Obsahuje: hlavičku, info o turnaji, týmy + hráče, rozpis zápasů, pravidla, QR kód.
 */
export async function exportTournamentPdf(tournament: Tournament): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 15;
  const marginR = 15;
  const contentW = pageW - marginL - marginR;
  let y = 15;

  const { settings } = tournament;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function checkPageBreak(needed: number) {
    if (y + needed > pageH - 20) {
      doc.addPage();
      y = 15;
    }
  }

  function drawSectionTitle(title: string) {
    checkPageBreak(14);
    y += 4;
    doc.setFillColor(26, 35, 126); // var(--primary) #1A237E
    doc.roundedRect(marginL, y, contentW, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, marginL + 4, y + 5.5);
    doc.setTextColor(0, 0, 0);
    y += 12;
  }

  function drawKeyValue(label: string, value: string) {
    checkPageBreak(6);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text(label, marginL + 2, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(value, marginL + 50, y);
    y += 5;
  }

  // ── 1. Hlavička ──────────────────────────────────────────────────────────────

  // Pozadí hlavičky
  doc.setFillColor(26, 35, 126);
  doc.rect(0, 0, pageW, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(tournament.name, pageW / 2, 14, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date(settings.startDate).toLocaleDateString('cs-CZ', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  doc.text(`${dateStr}  |  ${tournament.teams.length} tymu  |  ${tournament.matches.length} zapasu`, pageW / 2, 22, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  y = 38;

  // ── 2. Informace o turnaji ────────────────────────────────────────────────────

  drawSectionTitle('Informace o turnaji');

  drawKeyValue('Datum:', dateStr);
  drawKeyValue('Zacatek:', settings.startTime);

  // Konec turnaje — čas posledního zápasu + délka
  const sortedMatches = [...tournament.matches].sort((a, b) =>
    new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
  );
  if (sortedMatches.length > 0) {
    const last = sortedMatches[sortedMatches.length - 1];
    const endTime = new Date(new Date(last.scheduledTime).getTime() + last.durationMinutes * 60000);
    drawKeyValue('Predpokladany konec:', endTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }));
  }

  drawKeyValue('Pocet tymu:', String(tournament.teams.length));
  drawKeyValue('Pocet zapasu:', String(tournament.matches.length));
  drawKeyValue('Delka zapasu:', `${settings.matchDurationMinutes} min`);
  drawKeyValue('Prestavka:', settings.breakBetweenMatchesMinutes === 0 ? 'Bez prestavky' : `${settings.breakBetweenMatchesMinutes} min`);
  if ((settings.numberOfPitches ?? 1) > 1) {
    drawKeyValue('Pocet hrist:', String(settings.numberOfPitches));
  }
  drawKeyValue('Body:', 'Vyhra 3b | Remiza 1b | Prohra 0b');

  y += 2;

  // ── 3. Zúčastněné týmy ─────────────────────────────────────────────────────

  drawSectionTitle('Zucastnene tymy');

  for (const team of tournament.teams) {
    checkPageBreak(12 + team.players.length * 4);

    // Tým header s barvou
    doc.setFillColor(...hexToRgb(team.color));
    doc.roundedRect(marginL, y, 4, 4, 1, 1, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(team.name, marginL + 7, y + 3.2);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`(${team.players.length} hracu)`, marginL + 7 + doc.getTextWidth(team.name) + 3, y + 3.2);
    doc.setTextColor(0, 0, 0);
    y += 7;

    if (team.players.length > 0) {
      // Hráči ve sloupcích (2 sloupce)
      const colW = contentW / 2;
      const players = [...team.players].sort((a, b) => a.jerseyNumber - b.jerseyNumber);
      for (let i = 0; i < players.length; i += 2) {
        checkPageBreak(5);
        for (let col = 0; col < 2 && i + col < players.length; col++) {
          const p = players[i + col];
          const x = marginL + 4 + col * colW;
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(`#${p.jerseyNumber}`, x, y);
          doc.setFont('helvetica', 'normal');
          doc.text(p.name, x + 10, y);
        }
        y += 4;
      }
    }
    y += 3;
  }

  // ── 4. Rozpis zápasů ─────────────────────────────────────────────────────────

  drawSectionTitle('Rozpis zapasu');

  const getTeamName = (id: string) => tournament.teams.find(t => t.id === id)?.name ?? '?';

  // Tabulka: header
  const colCas = marginL;
  const colHriste = marginL + 20;
  const colDomaci = marginL + 35;
  const colSkore = marginL + (contentW / 2) + 5;
  const colHoste = colSkore + 18;
  const hasPitches = (settings.numberOfPitches ?? 1) > 1;

  checkPageBreak(8);
  doc.setFillColor(240, 240, 240);
  doc.rect(marginL, y - 1, contentW, 6, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  doc.text('Cas', colCas + 2, y + 3);
  if (hasPitches) doc.text('Hriste', colHriste, y + 3);
  doc.text('Domaci', colDomaci, y + 3);
  doc.text('Skore', colSkore, y + 3);
  doc.text('Hoste', colHoste, y + 3);
  doc.setTextColor(0, 0, 0);
  y += 7;

  // Skupina zápasů po kolech
  const rounds = new Map<number, typeof tournament.matches>();
  for (const m of sortedMatches) {
    const arr = rounds.get(m.roundIndex) ?? [];
    arr.push(m);
    rounds.set(m.roundIndex, arr);
  }

  for (const [roundIdx, matches] of rounds) {
    checkPageBreak(6 + matches.length * 5);

    // Kolo header
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 35, 126);
    doc.text(`${roundIdx + 1}. kolo`, marginL + 2, y);
    doc.setTextColor(0, 0, 0);
    y += 4;

    for (const m of matches) {
      checkPageBreak(5);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');

      const time = formatMatchTime(m.scheduledTime);
      doc.text(time, colCas + 2, y);
      if (hasPitches) doc.text(String(m.pitchNumber ?? 1), colHriste + 4, y);

      const homeName = getTeamName(m.homeTeamId);
      const awayName = getTeamName(m.awayTeamId);

      doc.setFont('helvetica', 'bold');
      doc.text(homeName, colDomaci, y);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      const scoreStr = m.status === 'finished'
        ? `${m.homeScore} : ${m.awayScore}`
        : '— : —';
      doc.text(scoreStr, colSkore, y);
      doc.setTextColor(0, 0, 0);

      doc.setFont('helvetica', 'bold');
      doc.text(awayName, colHoste, y);

      y += 5;
    }
    y += 2;
  }

  // ── 5. Pravidla / propozice ───────────────────────────────────────────────────

  if (settings.rules && settings.rules.trim() !== '') {
    drawSectionTitle('Pravidla a propozice');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const lines = doc.splitTextToSize(settings.rules, contentW - 4);
    for (const line of lines) {
      checkPageBreak(5);
      doc.text(line, marginL + 2, y);
      y += 4;
    }
    y += 2;
  }

  // ── 6. Kritéria řazení ──────────────────────────────────────────────────────

  drawSectionTitle('Kriteria pro urceni poradi');
  const criteria = [
    '1. Pocet bodu (vyhra 3b, remiza 1b, prohra 0b)',
    '2. Vzajemny zapas',
    '3. Rozdil skore',
    '4. Pocet vstelenych golu',
    '5. Abecedni poradi nazvu tymu',
  ];
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  for (const c of criteria) {
    checkPageBreak(5);
    doc.text(c, marginL + 4, y);
    y += 4;
  }
  y += 2;

  // ── 7. Tabulka výsledků (prázdná pro vyplnění rukou) ─────────────────────────

  drawSectionTitle('Tabulka vysledku');

  const tblColW = contentW / 7;
  const tblHeaders = ['#', 'Tym', 'Z', 'V', 'P', 'Skore', 'Body'];
  checkPageBreak(10 + tournament.teams.length * 6);

  // Header row
  doc.setFillColor(240, 240, 240);
  doc.rect(marginL, y - 1, contentW, 6, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  tblHeaders.forEach((h, i) => {
    const x = marginL + i * tblColW + (i === 0 ? 2 : i === 1 ? 2 : tblColW / 2 - 2);
    doc.text(h, x, y + 3);
  });
  doc.setTextColor(0, 0, 0);
  y += 7;

  // Empty rows for each team
  doc.setFontSize(8);
  for (let i = 0; i < tournament.teams.length; i++) {
    checkPageBreak(6);
    doc.setFont('helvetica', 'normal');
    doc.text(`${i + 1}.`, marginL + 2, y);
    doc.setFont('helvetica', 'bold');
    doc.text(tournament.teams[i].name, marginL + tblColW + 2, y);
    // Prázdné buňky — čáry
    for (let c = 2; c < 7; c++) {
      const cx = marginL + c * tblColW;
      doc.setDrawColor(200, 200, 200);
      doc.line(cx + 4, y + 1, cx + tblColW - 4, y + 1);
    }
    y += 6;
  }
  y += 2;

  // ── 8. QR kód ────────────────────────────────────────────────────────────────

  drawSectionTitle('QR kod pro sledovani vysledku');

  const qrSize = 40;
  checkPageBreak(qrSize + 15);

  try {
    const qrDataUrl = await generateQRCodeDataUrl(tournament.id);
    const qrX = (pageW - qrSize) / 2;
    doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize);
    y += qrSize + 4;
  } catch {
    doc.setFontSize(9);
    doc.text('QR kod se nepodarilo vygenerovat.', pageW / 2, y + 10, { align: 'center' });
    y += 15;
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Naskenujte QR kod pro sledovani vysledku v realnem case.', pageW / 2, y, { align: 'center' });
  y += 4;
  doc.setFontSize(7);
  const publicUrl = getTournamentPublicUrl(tournament.id);
  doc.text(publicUrl, pageW / 2, y, { align: 'center' });

  // ── 9. Patička ────────────────────────────────────────────────────────────────

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(`Strana ${p} / ${totalPages}`, pageW / 2, pageH - 8, { align: 'center' });
    doc.text(`Vygenerovano: ${new Date().toLocaleDateString('cs-CZ')}`, pageW - marginR, pageH - 8, { align: 'right' });
  }

  // ── Stáhnout ─────────────────────────────────────────────────────────────────

  const safeName = tournament.name.replace(/[^a-zA-Z0-9\u00C0-\u017F ]/g, '').replace(/\s+/g, '-').toLowerCase();
  doc.save(`propozice-${safeName}.pdf`);
}

// ── Hex to RGB helper ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 100;
  const g = parseInt(clean.substring(2, 4), 16) || 100;
  const b = parseInt(clean.substring(4, 6), 16) || 100;
  return [r, g, b];
}
