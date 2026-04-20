import type { SeasonMatch } from '../../types/match.types';

export type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Vrati celkovy pocet sekund od zahajeni zapasu (s ohledem na pauzy) */
export function computeElapsed(match: SeasonMatch): number {
  if (!match.startedAt) return 0;
  const base = match.pausedElapsed;
  if (match.pausedAt) return base; // zapas je pozastaven
  const sinceStart = Math.floor((Date.now() - new Date(match.startedAt).getTime()) / 1000);
  return base + sinceStart;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Formátuje ISO datum (`YYYY-MM-DD`) podle jazyka.
 * - cs: 15.4.2026 (default)
 * - en: 15 Apr 2026
 * - de: 15.04.2026
 *
 * Pokud je vstup null/undefined/neplatný, vrací „—".
 */
export function formatDate(dateStr: string | null | undefined, lang: 'cs' | 'en' | 'de' = 'cs'): string {
  if (typeof dateStr !== 'string' || !dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  if (lang === 'en') {
    try {
      return new Date(Number(y), Number(m) - 1, Number(d))
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { /* fallback */ }
  }
  if (lang === 'de') return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
  return `${d}.${m}.${y}`;
}

/**
 * Compute playing time in minutes for each player.
 * Uses lineup (starters) + substitutions to determine when each player was on/off field.
 */
export function computePlayingTime(match: SeasonMatch, elapsedMinutes: number): Map<string, number> {
  const result = new Map<string, number>();

  // Track who's on field and when they entered
  const onFieldSince = new Map<string, number>(); // playerId → minute they entered

  // Starters enter at minute 0
  for (const p of match.lineup) {
    if (p.isStarter) {
      onFieldSince.set(p.playerId, 0);
    }
  }

  // Sort subs by minute
  const sortedSubs = [...match.substitutions].sort((a, b) => a.minute - b.minute);

  for (const sub of sortedSubs) {
    // Player going out — calculate their time
    const enteredAt = onFieldSince.get(sub.playerOutId);
    if (enteredAt !== undefined) {
      const prev = result.get(sub.playerOutId) ?? 0;
      result.set(sub.playerOutId, prev + (sub.minute - enteredAt));
      onFieldSince.delete(sub.playerOutId);
    }

    // Player coming in — start tracking
    onFieldSince.set(sub.playerInId, sub.minute);
  }

  // Players still on field — add time until now
  for (const [playerId, enteredAt] of onFieldSince) {
    const prev = result.get(playerId) ?? 0;
    result.set(playerId, prev + (elapsedMinutes - enteredAt));
  }

  return result;
}

/**
 * Aktuální "střih" — minuty uplynulé od posledního přesunu hráče
 * (nastoupení nebo stažení). Pomáhá trenérovi vidět *čerstvou* zátěž:
 * hráč může mít 14' celkem, ale teď je na hřišti nepřetržitě už 12'.
 *
 * - Pro hráče na hřišti → minuty od posledního nastoupení (0 pokud starter a nebylo střídání)
 * - Pro hráče na lavici → minuty od posledního stažení (= total elapsed pro starter-na-lavici)
 */
export function computeCurrentStretch(match: SeasonMatch, elapsedMinutes: number): Map<string, number> {
  const result = new Map<string, number>();
  const lastEventAt = new Map<string, number>(); // playerId → minute last state change

  // Starters start at minute 0 on field
  for (const p of match.lineup) {
    if (p.isStarter) lastEventAt.set(p.playerId, 0);
  }

  const sortedSubs = [...match.substitutions].sort((a, b) => a.minute - b.minute);
  for (const sub of sortedSubs) {
    lastEventAt.set(sub.playerOutId, sub.minute);
    lastEventAt.set(sub.playerInId, sub.minute);
  }

  // Stretch = elapsed - last event minute
  for (const p of match.lineup) {
    const last = lastEventAt.get(p.playerId);
    if (last === undefined) {
      // Bench hráč který nikdy nebyl na hřišti — stretch = celá doba na lavici
      result.set(p.playerId, Math.max(0, elapsedMinutes));
    } else {
      result.set(p.playerId, Math.max(0, elapsedMinutes - last));
    }
  }

  return result;
}
