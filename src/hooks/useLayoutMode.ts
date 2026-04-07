import { useEffect, useState, useCallback } from 'react';

// ─── Layout mode hook ───────────────────────────────────────────────────────
// 'auto'    – follow viewport width (≥1024px = desktop)
// 'mobile'  – force mobile layout regardless of viewport
// 'desktop' – force desktop layout regardless of viewport
//
// User preference is persisted in localStorage. Defaults to 'auto'.

export type LayoutModePreference = 'auto' | 'mobile' | 'desktop';
export type LayoutMode = 'mobile' | 'desktop';

const STORAGE_KEY = 'torq_layout_mode';
const DESKTOP_BREAKPOINT = 1024;

function readPreference(): LayoutModePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'mobile' || v === 'desktop' || v === 'auto') return v;
  } catch { /* ignore */ }
  return 'auto';
}

function detectViewportMode(): LayoutMode {
  if (typeof window === 'undefined') return 'mobile';
  return window.innerWidth >= DESKTOP_BREAKPOINT ? 'desktop' : 'mobile';
}

function resolveMode(pref: LayoutModePreference): LayoutMode {
  if (pref === 'mobile' || pref === 'desktop') return pref;
  return detectViewportMode();
}

// Module-level singleton state so all consumers stay in sync.
const listeners = new Set<() => void>();
let currentPreference: LayoutModePreference = readPreference();
let currentMode: LayoutMode = resolveMode(currentPreference);

function notifyAll() {
  listeners.forEach(l => l());
}

function setPreference(pref: LayoutModePreference) {
  currentPreference = pref;
  try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }
  const next = resolveMode(pref);
  if (next !== currentMode) currentMode = next;
  notifyAll();
}

// Listen to viewport resizes — only matters when preference is 'auto'.
if (typeof window !== 'undefined') {
  const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
  const onChange = () => {
    if (currentPreference !== 'auto') return;
    const next = detectViewportMode();
    if (next !== currentMode) {
      currentMode = next;
      notifyAll();
    }
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else mq.addListener(onChange);
}

export function useLayoutMode() {
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const setMode = useCallback((pref: LayoutModePreference) => {
    setPreference(pref);
  }, []);

  return {
    mode: currentMode,
    preference: currentPreference,
    setPreference: setMode,
    isDesktop: currentMode === 'desktop',
    isMobile: currentMode === 'mobile',
  };
}
