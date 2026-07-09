import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { cs, type TranslationKey } from './locales/cs';

// ─── Types ──────────────────────────────────────────────────────────────────
// Audit 2026-07-09 (osekání na jádro): EN + DE lokalizace smazány — produkt je
// ČR-only a každá feature se psala 3×. Typ `Locale` a helpery (getDateLocale,
// getCurrencyForLocale) zůstávají, aby konzumenti nemuseli měnit signatury a
// budoucí expanze byla jen otázkou přidání locale souboru (git historii viz
// commit před 2026-07-09).

export type Locale = 'cs';

interface I18nContextValue {
  locale: Locale;
  t: (key: TranslationKey | string, params?: Record<string, string | number>) => string;
}

// ─── Translations map ────────────────────────────────────────────────────────

const translations: Record<Locale, Record<string, string>> = { cs };

// ─── Context ─────────────────────────────────────────────────────────────────

const I18nContext = createContext<I18nContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale: Locale = 'cs';

  // Set lang attribute
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey | string, params?: Record<string, string | number>): string => {
      let text = translations[locale]?.[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

// ─── Date locale helper ─────────────────────────────────────────────────────

const DATE_LOCALE_MAP: Record<Locale, string> = { cs: 'cs-CZ' };

// eslint-disable-next-line react-refresh/only-export-components
export function getDateLocale(locale: Locale): string {
  return DATE_LOCALE_MAP[locale] ?? 'cs-CZ';
}

// ─── Currency helper ─────────────────────────────────────────────────────────

export type Currency = 'czk' | 'eur' | 'usd';

// eslint-disable-next-line react-refresh/only-export-components
export function getCurrencyForLocale(locale: Locale): Currency {
  void locale;
  return 'czk';
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatPrice(locale: Locale): string {
  void locale;
  return '99 Kč/měsíc';
}
