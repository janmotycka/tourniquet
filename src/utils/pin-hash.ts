// SHA-256 hash PINu pomocí Web Crypto API (nativní, bez závislostí)

/** Vygeneruje kryptograficky bezpečný random salt (hex string) */
export function generatePinSalt(): string {
  const bytes = new Uint8Array(16); // 128-bit salt
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Vygeneruje N-místný numerický PIN kryptograficky bezpečně.
 *
 * Dříve se PIN generoval přes Math.floor(100000 + Math.random()*900000) —
 * Math.random() NENÍ kryptograficky bezpečný (predikovatelný), takže šel
 * PIN teoreticky uhodnout ze stavu generátoru. Salt už crypto používal,
 * PIN ne. Rejection sampling zajišťuje uniformní rozdělení (prostý modulo
 * by mírně zvýhodnil nižší hodnoty).
 */
export function generateNumericPin(digits = 6): string {
  const min = 10 ** (digits - 1);
  const range = 9 * min; // počet hodnot v [min, 10^digits − 1]
  const maxUnbiased = Math.floor(0xffffffff / range) * range;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= maxUnbiased);
  return String(min + (x % range));
}

/**
 * SHA-256 hash PINu se solí.
 * @param salt — pokud prázdný/undefined, hashuje bez soli (zpětná kompatibilita)
 */
export async function hashPin(pin: string, salt?: string): Promise<string> {
  const encoder = new TextEncoder();
  const payload = salt ? `${salt}:${pin}` : pin;
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// PIN ověření probíhá server-side přes Cloud Function `verifyTournamentPin`
// (viz src/services/tournament-functions.ts). Klient PIN nikdy nehashuje
// ani nečte pin-auth uzel — to dělá pouze admin SDK na serveru.

// Session storage klíč pro ověřený PIN organizátora
const SESSION_KEY = (tournamentId: string) => `pin-verified-${tournamentId}`;

export function markPinVerified(tournamentId: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY(tournamentId), '1');
  } catch {
    // Private browsing or storage full — silently ignore
  }
}

export function isPinVerified(tournamentId: string): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY(tournamentId)) === '1';
  } catch {
    return false;
  }
}

export function clearPinVerified(tournamentId: string): void {
  try {
    sessionStorage.removeItem(SESSION_KEY(tournamentId));
  } catch {
    // Silently ignore
  }
}
