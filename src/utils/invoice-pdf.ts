/**
 * Generátor české faktury (PDF) s QR Platba.
 * Používá jsPDF s Roboto fonty (česká diakritika).
 */

import type { jsPDF as JsPDFType } from 'jspdf';
import QRCode from 'qrcode';
import type { BillingProfile, InvoiceData } from '../types/tournament.types';

type TFn = (key: string, params?: Record<string, string | number>) => string;

// ─── Font loader (sdílený pattern s tournament-pdf.ts) ───────────────────────

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

// ─── QR Platba (český standard SPD) ─────────────────────────────────────────

function buildSpdString(profile: BillingProfile, invoice: InvoiceData): string {
  const parts = ['SPD*1.0'];

  // Účet — preferujeme IBAN, fallback na český formát
  if (profile.iban) {
    parts.push(`ACC:${profile.iban.replace(/\s/g, '')}`);
  } else if (profile.bankAccount) {
    // Převod českého formátu na IBAN není triviální, použijeme AM bez ACC
    // (bankovní appky pak zobrazí částku a VS bez přednastaveného účtu)
  }

  parts.push(`AM:${invoice.amount.toFixed(2)}`);
  parts.push(`CC:${invoice.currency}`);

  if (invoice.variableSymbol) {
    parts.push(`X-VS:${invoice.variableSymbol}`);
  }

  parts.push(`MSG:${invoice.description.substring(0, 60)}`);

  return parts.join('*');
}

async function generateQRPaymentDataUrl(profile: BillingProfile, invoice: InvoiceData): Promise<string> {
  const spd = buildSpdString(profile, invoice);
  return QRCode.toDataURL(spd, {
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
}

// ─── Formátování ─────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function formatAmount(amount: number, currency: string): string {
  return amount.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + currency;
}

// ─── Hlavní export ───────────────────────────────────────────────────────────

/**
 * Vygeneruje českou fakturu jako PDF a vrátí ji jako Blob.
 * Volitelně přímo stáhne soubor.
 */
export async function generateInvoicePdf(
  profile: BillingProfile,
  invoice: InvoiceData,
  t: TFn,
  options?: { download?: boolean },
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const M = 15; // margin
  const W = pageW - 2 * M; // 180
  let y = 0;

  const hasFonts = await loadFonts(doc);
  const fontFamily = hasFonts ? 'Roboto' : 'helvetica';

  const setFont = (style: 'normal' | 'bold', size: number) => {
    doc.setFont(fontFamily, style);
    doc.setFontSize(size);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER — "FAKTURA" + číslo
  // ═══════════════════════════════════════════════════════════════════════════

  y = 20;
  setFont('bold', 22);
  doc.setTextColor(30, 30, 30);
  doc.text(t('invoice.title'), M, y);

  setFont('bold', 14);
  doc.setTextColor(100, 100, 100);
  doc.text(`${t('invoice.number')}: ${invoice.invoiceNumber}`, pageW - M, y, { align: 'right' });
  y += 10;

  // Linka pod headerem
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(M, y, pageW - M, y);
  y += 10;

  // ═══════════════════════════════════════════════════════════════════════════
  // DODAVATEL (vlevo) + ODBĚRATEL (vpravo)
  // ═══════════════════════════════════════════════════════════════════════════

  const colW = (W - 10) / 2; // 85mm each
  const leftX = M;
  const rightX = M + colW + 10;
  const startY = y;

  // Dodavatel
  setFont('bold', 9);
  doc.setTextColor(100, 100, 100);
  doc.text(t('invoice.supplier').toUpperCase(), leftX, y);
  y += 6;

  setFont('bold', 11);
  doc.setTextColor(30, 30, 30);
  doc.text(profile.companyName, leftX, y);
  y += 5;

  setFont('normal', 9);
  doc.setTextColor(60, 60, 60);
  doc.text(profile.address, leftX, y);
  y += 4;
  doc.text(`${profile.zip} ${profile.city}`, leftX, y);
  y += 6;

  setFont('normal', 9);
  doc.text(`${t('invoice.ico')}: ${profile.ico}`, leftX, y);
  y += 4;
  if (profile.dic) {
    doc.text(`${t('invoice.dic')}: ${profile.dic}`, leftX, y);
    y += 4;
  }
  if (profile.email) {
    doc.text(`${t('invoice.email')}: ${profile.email}`, leftX, y);
    y += 4;
  }
  if (profile.phone) {
    doc.text(`${t('invoice.phone')}: ${profile.phone}`, leftX, y);
    y += 4;
  }

  const supplierEndY = y;

  // Odběratel
  y = startY;
  setFont('bold', 9);
  doc.setTextColor(100, 100, 100);
  doc.text(t('invoice.customer').toUpperCase(), rightX, y);
  y += 6;

  setFont('bold', 11);
  doc.setTextColor(30, 30, 30);
  // Pokud má strukturované fakturační údaje, zobrazíme je
  if (invoice.customerCompanyName) {
    doc.text(invoice.customerCompanyName, rightX, y);
    y += 5;

    setFont('normal', 9);
    doc.setTextColor(60, 60, 60);
    if (invoice.customerAddress) {
      doc.text(invoice.customerAddress, rightX, y);
      y += 4;
    }
    if (invoice.customerCity || invoice.customerZip) {
      doc.text(`${invoice.customerZip ?? ''} ${invoice.customerCity ?? ''}`.trim(), rightX, y);
      y += 4;
    }
    y += 2;
    if (invoice.customerIco) {
      doc.text(`${t('invoice.ico')}: ${invoice.customerIco}`, rightX, y);
      y += 4;
    }
    if (invoice.customerDic) {
      doc.text(`${t('invoice.dic')}: ${invoice.customerDic}`, rightX, y);
      y += 4;
    }
    // Kontakt pod fakturačními údaji
    if (invoice.customerEmail) {
      doc.text(`${t('invoice.email')}: ${invoice.customerEmail}`, rightX, y);
      y += 4;
    }
    if (invoice.customerPhone) {
      doc.text(`${t('invoice.phone')}: ${invoice.customerPhone}`, rightX, y);
      y += 4;
    }
  } else {
    doc.text(invoice.customerName, rightX, y);
    y += 5;

    setFont('normal', 9);
    doc.setTextColor(60, 60, 60);
    if (invoice.customerEmail) {
      doc.text(invoice.customerEmail, rightX, y);
      y += 4;
    }
    if (invoice.customerPhone) {
      doc.text(invoice.customerPhone, rightX, y);
      y += 4;
    }
  }

  y = Math.max(supplierEndY, y) + 8;

  // Linka
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(M, y, pageW - M, y);
  y += 8;

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATEBNÍ ÚDAJE
  // ═══════════════════════════════════════════════════════════════════════════

  const infoRowH = 5.5;
  const labelW = 42;

  const drawRow = (label: string, value: string, bold = false) => {
    setFont('normal', 9);
    doc.setTextColor(100, 100, 100);
    doc.text(label, M, y);
    setFont(bold ? 'bold' : 'normal', 9);
    doc.setTextColor(30, 30, 30);
    doc.text(value, M + labelW, y);
    y += infoRowH;
  };

  drawRow(t('invoice.issueDate'), formatDate(invoice.issueDate));
  drawRow(t('invoice.dueDate'), formatDate(invoice.dueDate), true);
  drawRow(t('invoice.variableSymbol'), invoice.variableSymbol, true);
  drawRow(t('invoice.bankAccount'), profile.bankAccount);
  if (profile.iban) {
    drawRow('IBAN', profile.iban);
  }
  if (profile.bic) {
    drawRow('BIC/SWIFT', profile.bic);
  }
  if (profile.bankName) {
    drawRow(t('invoice.bankName'), profile.bankName);
  }

  y += 5;

  // ═══════════════════════════════════════════════════════════════════════════
  // TABULKA POLOŽEK
  // ═══════════════════════════════════════════════════════════════════════════

  // Header řádek
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W, 8, 'F');
  setFont('bold', 9);
  doc.setTextColor(60, 60, 60);
  doc.text(t('invoice.itemDescription'), M + 3, y + 5.5);
  doc.text(t('invoice.itemAmount'), pageW - M - 3, y + 5.5, { align: 'right' });
  y += 10;

  // Položka
  setFont('normal', 10);
  doc.setTextColor(30, 30, 30);
  doc.text(invoice.description, M + 3, y + 5);
  setFont('bold', 10);
  doc.text(formatAmount(invoice.amount, invoice.currency), pageW - M - 3, y + 5, { align: 'right' });
  y += 8;

  // Linka pod položkou
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(M, y, pageW - M, y);
  y += 6;

  // Celkem
  setFont('bold', 12);
  doc.setTextColor(30, 30, 30);
  doc.text(t('invoice.total'), M + 3, y + 1);
  doc.text(formatAmount(invoice.amount, invoice.currency), pageW - M - 3, y + 1, { align: 'right' });
  y += 10;

  // Linka pod celkem
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.8);
  doc.line(M, y, pageW - M, y);
  y += 15;

  // ═══════════════════════════════════════════════════════════════════════════
  // QR PLATBA
  // ═══════════════════════════════════════════════════════════════════════════

  if (profile.iban || profile.bankAccount) {
    const qrSize = 35;
    const qrX = pageW - M - qrSize;
    const qrY = y;

    try {
      const qrDataUrl = await generateQRPaymentDataUrl(profile, invoice);
      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

      setFont('bold', 8);
      doc.setTextColor(80, 80, 80);
      doc.text(t('invoice.qrPayment'), qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });

      setFont('normal', 6.5);
      doc.setTextColor(130, 130, 130);
      doc.text(t('invoice.qrPaymentDesc'), qrX + qrSize / 2, qrY + qrSize + 8, { align: 'center' });
    } catch {
      // QR se nevygeneroval — nic
    }

    // Poznámka ke startovnému (vlevo od QR)
    if (invoice.description) {
      setFont('normal', 8);
      doc.setTextColor(100, 100, 100);
      const noteLines: string[] = doc.splitTextToSize(
        `${t('invoice.note')}: ${t('invoice.defaultNote')}`,
        W - qrSize - 15,
      );
      let noteY = qrY;
      for (const line of noteLines) {
        doc.text(line, M, noteY);
        noteY += 4;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATIČKA
  // ═══════════════════════════════════════════════════════════════════════════

  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, pageH - 12, pageW - M, pageH - 12);

  setFont('normal', 6.5);
  doc.setTextColor(160, 160, 160);
  doc.text(
    `${t('invoice.generated')}: ${new Date().toLocaleDateString('cs-CZ')} · TORQ · torq.cz`,
    M,
    pageH - 7,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTPUT
  // ═══════════════════════════════════════════════════════════════════════════

  const blob = doc.output('blob');

  if (options?.download !== false) {
    const safeName = invoice.customerName
      .replace(/[^a-zA-Z0-9\u00C0-\u017F ]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    doc.save(`faktura-${invoice.invoiceNumber}-${safeName}.pdf`);
  }

  return blob;
}

// ─── Helper: vygeneruj invoice data z registrace + turnaje ───────────────────

/** Vytvoří InvoiceData z schválené registrace. */
export function createInvoiceDataFromApproval(
  tournamentName: string,
  tournamentDate: string,
  teamName: string,
  coachName: string,
  coachEmail: string,
  coachPhone: string,
  entryFee: number,
  invoiceCounter: number,
): InvoiceData {
  const year = new Date().getFullYear();
  const num = String(invoiceCounter).padStart(3, '0');
  const invoiceNumber = `${year}${num}`;
  const today = new Date().toISOString().split('T')[0];
  const due = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Pokud turnaj má dřívější datum, splatnost = datum turnaje - 3 dny
  let dueDate = due;
  if (tournamentDate) {
    const tournamentMs = new Date(tournamentDate + 'T00:00:00').getTime();
    const threeDaysBefore = new Date(tournamentMs - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (threeDaysBefore > today && threeDaysBefore < due) {
      dueDate = threeDaysBefore;
    }
  }

  return {
    invoiceNumber,
    variableSymbol: invoiceNumber,
    issueDate: today,
    dueDate,
    amount: entryFee,
    currency: 'CZK',
    description: `Startovné — ${tournamentName}`,
    customerName: `${coachName} (${teamName})`,
    customerEmail: coachEmail || undefined,
    customerPhone: coachPhone || undefined,
  };
}
