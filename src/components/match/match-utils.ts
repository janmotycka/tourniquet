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

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}
