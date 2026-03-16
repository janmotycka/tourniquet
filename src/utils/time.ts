import type { Locale } from '../i18n';
import { getDateLocale } from '../i18n';

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatDate(isoString: string, locale: Locale): string {
  return new Date(isoString).toLocaleDateString(getDateLocale(locale), {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
