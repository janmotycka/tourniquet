/**
 * Bezpečný generátor ID pomocí crypto.getRandomValues().
 * Nahrazuje Math.random() pro generování unikátních identifikátorů.
 */
export function generateId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
}
