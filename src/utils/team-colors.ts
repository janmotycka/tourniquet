import type { CSSProperties } from 'react';

/** Paleta dostupných barev týmů */
export const TEAM_COLORS = [
  '#E53935', '#1E88E5', '#43A047', '#FB8C00',
  '#8E24AA', '#F4511E', '#00ACC1', '#6D4C41',
  '#FDD835', '#222222', '#FFFFFF',
];

/** Je barva příliš světlá? (bílá, žlutá apod.) */
export function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // Relativní jas (perceived brightness)
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

/** Vrátí styl pro barevný čtverec/kolečko s inset okrajem pro světlé barvy */
export function colorSwatch(c: string, size = 28): CSSProperties {
  return {
    width: size, height: size,
    borderRadius: size > 20 ? 8 : Math.floor(size / 3),
    background: c, flexShrink: 0,
    boxShadow: isLightColor(c) ? 'inset 0 0 0 1.5px rgba(0,0,0,0.18)' : undefined,
  };
}

/** Vrátí kontrastní barvu textu (bílá nebo tmavá) pro danou background barvu */
export function textOnColor(hex: string): string {
  return isLightColor(hex) ? '#222' : '#fff';
}
