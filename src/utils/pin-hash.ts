// SHA-256 hash PINu pomocí Web Crypto API (nativní, bez závislostí)

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const computed = await hashPin(pin);
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
