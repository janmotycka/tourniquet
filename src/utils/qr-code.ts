import QRCode from 'qrcode';

/** Vrátí veřejnou URL pro daný turnaj (hash-based deep link) */
export function getTournamentPublicUrl(tournamentId: string): string {
  const base = window.location.origin + window.location.pathname;
  // Odstraníme trailing slash pokud existuje
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}#tournament=${tournamentId}`;
}

/** Vygeneruje QR kód jako data URL (PNG) */
export async function generateQRCodeDataUrl(tournamentId: string, opts?: { dark?: string }): Promise<string> {
  const url = getTournamentPublicUrl(tournamentId);
  return QRCode.toDataURL(url, {
    width: 256,
    margin: 2,
    color: {
      dark: opts?.dark ?? '#1A237E',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}

/** Vrátí admin invite URL (s ?join=1) pro sdílení s rozhodčími */
export function getAdminInviteUrl(tournamentId: string): string {
  const base = window.location.origin + window.location.pathname;
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}?join=1#tournament=${tournamentId}`;
}

/** Vrátí co-owner invite URL (s ?join=1&role=admin) pro sdílení s spolupořadateli */
export function getCoOwnerInviteUrl(tournamentId: string): string {
  const base = window.location.origin + window.location.pathname;
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}?join=1&role=admin#tournament=${tournamentId}`;
}

/** Parsuje tournament ID z URL hashe (pokud existuje) */
export function parseTournamentHashFromUrl(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#tournament=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Vrátí URL pro roster form (odkaz pro trenéra k vyplnění soupisky) */
export function getRosterFormUrl(tournamentId: string, rosterToken: string): string {
  const base = window.location.origin + window.location.pathname;
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}#roster=${tournamentId}&k=${rosterToken}`;
}

/** Parsuje roster form hash z URL */
export function parseRosterHashFromUrl(): { tournamentId: string; teamToken: string } | null {
  const hash = window.location.hash;
  const match = hash.match(/^#roster=([a-zA-Z0-9_-]+)&k=([a-zA-Z0-9_-]+)/);
  return match ? { tournamentId: match[1], teamToken: match[2] } : null;
}

/** Vrátí URL pro registrační formulář turnaje */
export function getRegistrationUrl(tournamentId: string): string {
  const base = window.location.origin + window.location.pathname;
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}#register=${tournamentId}`;
}

/** Parsuje registration hash z URL */
export function parseRegistrationHashFromUrl(): { tournamentId: string } | null {
  const hash = window.location.hash;
  const match = hash.match(/^#register=([a-zA-Z0-9_-]+)/);
  return match ? { tournamentId: match[1] } : null;
}

/** Vrátí veřejnou URL pro sezónní zápas */
export function getMatchPublicUrl(matchId: string): string {
  const base = window.location.origin + window.location.pathname;
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}#match=${matchId}`;
}

/** Parsuje match ID z URL hashe */
export function parseMatchHashFromUrl(): string | null {
  const hash = window.location.hash;
  const m = hash.match(/^#match=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Parsuje cross-team pairing invite z URL hashe: #pair-match=SCOPE:ID:TOKEN */
export function parseMatchPairingHashFromUrl(): { scopeId: string; matchId: string; joinToken: string } | null {
  const hash = window.location.hash;
  const m = hash.match(/^#pair-match=([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+):([a-zA-Z0-9]+)/);
  if (!m) return null;
  return { scopeId: m[1], matchId: m[2], joinToken: m[3] };
}

/** Vygeneruje QR kód pro sdílení zápasu */
export async function generateMatchQRCodeDataUrl(matchId: string): Promise<string> {
  const url = getMatchPublicUrl(matchId);
  return QRCode.toDataURL(url, {
    width: 256,
    margin: 2,
    color: { dark: '#1A237E', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
}
