#!/usr/bin/env node
/**
 * generate-mobile-icons.mjs
 *
 * Vygeneruje sadu app ikon ze zdrojového SVG pro App Store + Google Play.
 *
 * Source: public/icons/icon.svg
 * Outputs: public/icons/icon-{size}.png + ios/Android assets
 *
 * Spuštění:
 *   node scripts/generate-mobile-icons.mjs
 *
 * Po spuštění zkopíruj iOS/Android výstupy do native projektů (instrukce
 * uvnitř skriptu na výstupu).
 *
 * Pozn.: Capacitor 7 už má vlastní @capacitor/assets CLI pro tohle, ale
 * vyžaduje source 1024×1024 PNG + 2732×2732 splash. Tento skript jen
 * dopočítá ty zdroje z našeho SVG, pak `cap assets` zbytek dotáhne.
 */

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SVG_PATH = join(ROOT, 'public/icons/icon.svg');
const OUT_DIR = join(ROOT, 'public/icons');

if (!existsSync(SVG_PATH)) {
  console.error(`[icons] Source not found: ${SVG_PATH}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const svg = readFileSync(SVG_PATH, 'utf-8');

/** Velikosti, které potřebujeme pro různé use cases. */
const SIZES = [
  // PWA manifest (existující)
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  // Apple App Store požaduje 1024x1024 (bez alpha kanálu = full color)
  { size: 1024, name: 'icon-1024.png' },
  // Apple Touch Icon (iOS Safari, „Add to Home Screen" před Capacitor wrappem)
  { size: 180, name: 'apple-touch-icon.png' },
  // Maskable (Android adaptive — 80% safe zone)
  // Maskable bereme z existujícího icon-512-maskable.png — neregenerujeme
];

console.log('[icons] Generating from', SVG_PATH);
for (const { size, name } of SIZES) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  const pngBuffer = resvg.render().asPng();
  const outPath = join(OUT_DIR, name);
  writeFileSync(outPath, pngBuffer);
  console.log(`[icons]   → ${name} (${size}×${size})`);
}

console.log('');
console.log('[icons] Done. Příští krok pro store icony:');
console.log('  1. iOS: otevři ios/App/App/Assets.xcassets/AppIcon.appiconset v Xcode');
console.log('     a přetáhni icon-1024.png na 1024x1024 slot. Xcode doplní zbytek.');
console.log('  2. Android: zkopíruj icon-1024 do android/app/src/main/res/mipmap-*');
console.log('     (různé velikosti) — nejlépe spustit `npx capacitor-assets generate`.');
console.log('     Alternativně použij Android Studio → Image Asset Studio.');
