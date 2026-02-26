import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { cs, type TranslationKey } from './locales/cs';
import { en } from './locales/en';

// ─── Types ──────────────────────────────────────────────────────────────────

export type Locale = 'cs' | 'en';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey | string, params?: Record<string, string | number>) => string;
}

// ─── Translations map ────────────────────────────────────────────────────────

const translations: Record<Locale, Record<string, string>> = { cs, en };

// ─── Detect browser locale ──────────────────────────────────────────────────

function detectLocale(): Locale {
  const stored = localStorage.getItem('trenink-locale');
  if (stored === 'cs' || stored === 'en') return stored;

  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('cs') || browserLang.startsWith('sk')) return 'cs';
  return 'en';
}

// ─── Context ─────────────────────────────────────────────────────────────────

const I18nContext = createContext<I18nContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('trenink-locale', newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  // Set initial lang attribute
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey | string, params?: Record<string, string | number>): string => {
      let text = translations[locale]?.[key] ?? translations.cs[key] ?? key;
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
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

// ─── Currency helper ─────────────────────────────────────────────────────────

export type Currency = 'czk' | 'eur' | 'usd';

export function getCurrencyForLocale(locale: Locale): Currency {
  return locale === 'cs' ? 'czk' : 'eur';
}

export function formatPrice(locale: Locale): string {
  if (locale === 'cs') return '99 Kč/měsíc';
  return '€3.99/month';
}
