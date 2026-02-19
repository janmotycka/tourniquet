import QRCode from 'qrcode';

/** Vrátí veřejnou URL pro daný turnaj (hash-based deep link) */
export function getTournamentPublicUrl(tournamentId: string): string {
  const base = window.location.origin + window.location.pathname;
  // Odstraníme trailing slash pokud existuje
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}#tournament=${tournamentId}`;
}

/** Vygeneruje QR kód jako data URL (PNG) */
export async function generateQRCodeDataUrl(tournamentId: string): Promise<string> {
  const url = getTournamentPublicUrl(tournamentId);
  return QRCode.toDataURL(url, {
    width: 256,
    margin: 2,
    color: {
      dark: '#1A237E',  // var(--primary)
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}

/** Parsuje tournament ID z URL hashe (pokud existuje) */
export function parseTournamentHashFromUrl(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#tournament=([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}
