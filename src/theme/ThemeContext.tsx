import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ThemePreference = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemePreference;
  resolved: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const STORAGE_KEY = 'trenink-theme';

// ─── System detection ───────────────────────────────────────────────────────

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'auto' ? getSystemTheme() : pref;
}

function loadPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  return 'auto';
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
}

// ─── Context ────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(loadPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(loadPreference()));

  const setTheme = useCallback((newTheme: ThemePreference) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    const r = resolveTheme(newTheme);
    setResolved(r);
    applyTheme(r);
  }, []);

  // Apply on mount
  useEffect(() => { applyTheme(resolved); }, [resolved]);

  // Listen for system preference changes (when "auto" is selected)
  useEffect(() => {
    if (theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const r = getSystemTheme();
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
