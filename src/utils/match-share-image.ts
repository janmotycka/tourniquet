/**
 * Generátor „share card" obrázku pro zápas.
 *
 * Použití: z `ShareMatchSheet` nebo po `finishMatch` — vygeneruje PNG blob,
 * který se připojí k textové zprávě přes Web Share API (`navigator.share`).
 *
 * Design: minimalistická tmavě modrá karta se skóre, týmy, top střelci.
 * Žádný html2canvas, čistý Canvas 2D API (rychlé, předvídatelné, lightweight).
 *
 * Velikost: 1200×630 — standard OG/social ratio (rezerva pro budoucí WhatsApp
 * link preview, kde by stejné image sloužilo jako og:image).
 */

import type { SeasonMatch } from '../types/match.types';

const WIDTH = 1200;
const HEIGHT = 630;

interface GenerateOptions {
  match: SeasonMatch;
  clubDisplayName: string;
  /** ISO lang pro date formátování. Default cs. */
  lang?: 'cs' | 'en' | 'de';
  /** Klubová barva pro akcenty (hex). Default TORQ primary. */
  clubColor?: string;
}

// Pro budoucí použití (v2 — vykreslení log týmů)
// async function loadImage(src: string): Promise<HTMLImageElement | null> { ... }

function formatDate(isoDate: string, lang: 'cs' | 'en' | 'de' = 'cs'): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  const locale = lang === 'cs' ? 'cs-CZ' : lang === 'de' ? 'de-DE' : 'en-GB';
  try {
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(locale, {
      day: 'numeric', month: 'long',
    });
  } catch {
    return `${d}.${m}.${y}`;
  }
}

/** Zkrátí jméno týmu tak, aby se vešlo do rámce. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  // Postupně odebírej znaky, dokud se nevejde + přidej ellipsis
  let trimmed = text;
  while (trimmed.length > 3 && ctx.measureText(trimmed + '…').width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed + '…';
}

/** Vykreslí jméno týmu do rámečku (štít pokud máme logo, jinak písmeno) */
function drawTeamBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  logo: HTMLImageElement | null,
  fallbackLetter: string,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 3;
  // Štít ve tvaru zaobleného čtverce
  const r = size / 2;
  ctx.beginPath();
  const radius = 24;
  ctx.moveTo(cx - r + radius, cy - r);
  ctx.lineTo(cx + r - radius, cy - r);
  ctx.quadraticCurveTo(cx + r, cy - r, cx + r, cy - r + radius);
  ctx.lineTo(cx + r, cy + r - radius);
  ctx.quadraticCurveTo(cx + r, cy + r, cx + r - radius, cy + r);
  ctx.lineTo(cx - r + radius, cy + r);
  ctx.quadraticCurveTo(cx - r, cy + r, cx - r, cy + r - radius);
  ctx.lineTo(cx - r, cy - r + radius);
  ctx.quadraticCurveTo(cx - r, cy - r, cx - r + radius, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (logo) {
    // Vložíme logo do středu, zachováme aspect ratio, padding 10 %
    const pad = size * 0.1;
    const maxDim = size - pad * 2;
    const ratio = Math.min(maxDim / logo.width, maxDim / logo.height);
    const w = logo.width * ratio;
    const h = logo.height * ratio;
    ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
  } else {
    // Fallback: velké písmeno
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${size * 0.55}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallbackLetter.toUpperCase(), cx, cy);
  }
  ctx.restore();
}

export async function generateMatchShareImage(opts: GenerateOptions): Promise<Blob> {
  const { match, clubDisplayName, lang = 'cs', clubColor = '#1A237E' } = opts;

  // Pro opozici nemáme logo — fallback je písmeno. (v2: lookup z match-catalog
  // nebo z pairing awayClubId.)
  const clubLogo = match.clubId ? null : null; // TODO: načíst z clubs store pokud třeba
  void clubLogo;

  // Jaké je naše a jejich skóre?
  const ourScore = match.isHome ? match.homeScore : match.awayScore;
  const theirScore = match.isHome ? match.awayScore : match.homeScore;

  // Canvas init
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background — jemný gradient z klubové barvy do tmavě modré
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, shade(clubColor, -10));
  bg.addColorStop(1, '#0A0E27');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Decorativní svislý pruh (vlevo) v klubové barvě
  ctx.fillStyle = clubColor;
  ctx.fillRect(0, 0, 10, HEIGHT);

  // ── Header: datum + soutěž + kategorie ──
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '500 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const metaParts: string[] = [];
  metaParts.push(formatDate(match.date, lang));
  if (match.competition) metaParts.push(match.competition);
  if (match.ageCategory) metaParts.push(match.ageCategory);
  ctx.fillText(metaParts.join('  ·  '), WIDTH / 2, 40);

  // ── Názvy týmů (horní řádka) ──
  const homeTeam = match.isHome ? clubDisplayName : match.opponent;
  const awayTeam = match.isHome ? match.opponent : clubDisplayName;
  ctx.fillStyle = '#fff';
  ctx.font = '700 32px system-ui, -apple-system, sans-serif';
  const homeText = fitText(ctx, homeTeam, 400, '700 32px system-ui, -apple-system, sans-serif');
  const awayText = fitText(ctx, awayTeam, 400, '700 32px system-ui, -apple-system, sans-serif');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(homeText, 250, 200);
  ctx.fillText(awayText, 950, 200);

  // ── Štíty týmů ──
  // V v1 bez log — jen fallback písmeno. Barvy: náš klub = clubColor,
  // soupeř = šedá (neznámá identita).
  const homeColor = match.isHome ? clubColor : '#5A5A5A';
  const awayColor = match.isHome ? '#5A5A5A' : clubColor;
  const homeLetter = homeTeam.charAt(0) || '?';
  const awayLetter = awayTeam.charAt(0) || '?';
  drawTeamBadge(ctx, 250, 310, 120, null, homeLetter, homeColor);
  drawTeamBadge(ctx, 950, 310, 120, null, awayLetter, awayColor);

  // ── Centrální skóre ──
  ctx.fillStyle = '#fff';
  ctx.font = '900 160px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const scoreText = `${ourScore} : ${theirScore}`;
  if (!match.isHome) {
    ctx.fillText(`${theirScore} : ${ourScore}`, WIDTH / 2, 310);
  } else {
    ctx.fillText(scoreText, WIDTH / 2, 310);
  }

  // ── Top střelci (max 3 řádky) ──
  const scorers = extractScorers(match);
  if (scorers.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '500 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const startY = 460;
    const rowHeight = 32;
    scorers.slice(0, 3).forEach((s, i) => {
      ctx.fillText(`⚽  ${s}`, WIDTH / 2, startY + i * rowHeight);
    });
  } else if (match.status === 'finished') {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '400 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(lang === 'cs' ? 'Konec zápasu' : lang === 'de' ? 'Spielende' : 'Full time', WIDTH / 2, 460);
  }

  // ── Footer: TORQ branding ──
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '700 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('⚽ torq.cz', WIDTH / 2, HEIGHT - 30);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png', 0.95);
  });
}

/** Extrahuje jména střelců s minutami: "Novák (12', 45')" */
function extractScorers(match: SeasonMatch): string[] {
  const byName = new Map<string, number[]>();
  let opponentCount = 0;
  const sorted = [...match.goals].sort((a, b) => a.minute - b.minute);
  for (const g of sorted) {
    if (g.isOpponentGoal) {
      opponentCount++;
      continue;
    }
    const scorer = g.scorerId ? match.lineup.find(p => p.playerId === g.scorerId) : null;
    const name = scorer?.name ?? (g.isOwnGoal ? 'vlastní gól' : '⚽');
    const existing = byName.get(name);
    if (existing) existing.push(g.minute);
    else byName.set(name, [g.minute]);
  }
  const result: string[] = [];
  for (const [name, minutes] of byName) {
    const mins = minutes.map(m => `${m}'`).join(', ');
    result.push(`${name} (${mins})`);
  }
  if (opponentCount > 0) {
    result.push(`${match.opponent}: ${opponentCount}×`);
  }
  return result;
}

/** Světlejší/tmavší varianta hex barvy o N procent. */
function shade(hex: string, percent: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const factor = 1 + percent / 100;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

/**
 * Sdílí obrázek + textovou zprávu přes Web Share API.
 * Na mobilu Android/iOS otevře WhatsApp/Messages s přílohou.
 * Na desktopu / kde není Web Share API → fallback: stáhne soubor.
 *
 * @returns true pokud share proběhl, false pokud user cancellil
 */
export async function shareMatchImage(
  blob: Blob,
  textMessage: string,
  fileName = 'zapas.png',
): Promise<boolean> {
  const file = new File([blob], fileName, { type: 'image/png' });

  // Preferovaná cesta — Web Share API s files
  const navAny = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { text?: string; files?: File[] }) => Promise<void>;
  };
  if (navAny.canShare && navAny.share && navAny.canShare({ files: [file] })) {
    try {
      await navAny.share({ text: textMessage, files: [file] });
      return true;
    } catch (err) {
      const e = err as { name?: string };
      if (e.name === 'AbortError') return false;
      // Fall through na download
    }
  }

  // Fallback: download + zkopíruj text
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  try {
    await navigator.clipboard.writeText(textMessage);
  } catch { /* clipboard unavailable */ }

  return true;
}
