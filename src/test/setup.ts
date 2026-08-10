import '@testing-library/jest-dom/vitest';

// jsdom neimplementuje matchMedia, ale ThemeProvider ho volá kvůli detekci
// systémového light/dark. Bez tohoto shimu spadne každý test, který rendruje
// strom s ThemeProviderem. Výchozí stav = světlý (matches: false).
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
