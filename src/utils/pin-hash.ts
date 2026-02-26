// SHA-256 hash PINu pomocí Web Crypto API (nativní, bez závislostí)

/** Vygeneruje kryptograficky bezpečný random salt (hex string) */
export function generatePinSalt(): string {
  const bytes = new Uint8Array(16); // 128-bit salt
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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

/**
 * Ověří PIN proti uloženému hashi.
 * @param salt — pokud prázdný/undefined, ověřuje bez soli (zpětná kompatibilita starých turnajů)
 */
export async function verifyPin(pin: string, hash: string, salt?: string): Promise<boolean> {
  const computed = await hashPin(pin, salt);
  return computed === hash;
}

// Session storage klíč pro ověřený PIN organizátora
const SESSION_KEY = (tournamentId: string) => `pin-verified-${tournamentId}`;

export function markPinVerified(tournamentId: string): void {
  sessionStorage.setItem(SESSION_KEY(tournamentId), '1');
}

export function isPinVerified(tournamentId: string): boolean {
  return sessionStorage.getItem(SESSION_KEY(tournamentId)) === '1';
}

export function clearPinVerified(tournamentId: string): void {
  sessionStorage.removeItem(SESSION_KEY(tournamentId));
}
