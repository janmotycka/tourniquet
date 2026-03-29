import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Sentry } from '../sentry';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetail: boolean;
}

const ERROR_TEXTS: Record<string, {
  title: string; message: string; reload: string;
  clearCache: string; clearCacheDesc: string; errorDetail: string;
}> = {
  cs: {
    title: 'Něco se pokazilo',
    message: 'Aplikace narazila na neočekávanou chybu. Zkuste prosím stránku znovu načíst.',
    reload: 'Načíst znovu',
    clearCache: 'Vymazat cache a načíst',
    clearCacheDesc: 'Pokud reload nepomůže, zkuste vymazat lokální data:',
    errorDetail: 'Detail chyby',
  },
  de: {
    title: 'Etwas ist schiefgelaufen',
    message: 'Die Anwendung hat einen unerwarteten Fehler festgestellt. Bitte laden Sie die Seite neu.',
    reload: 'Seite neu laden',
    clearCache: 'Cache leeren & neu laden',
    clearCacheDesc: 'Wenn Neuladen nicht hilft, lokale Daten löschen:',
    errorDetail: 'Fehlerdetail',
  },
  en: {
    title: 'Something went wrong',
    message: 'The application encountered an unexpected error. Please try reloading the page.',
    reload: 'Reload page',
    clearCache: 'Clear cache & reload',
    clearCacheDesc: 'If reload doesn\'t help, try clearing local data:',
    errorDetail: 'Error detail',
  },
};

function getErrorLocale(): string {
  try {
    const stored = localStorage.getItem('trenink-locale');
    if (stored && stored in ERROR_TEXTS) return stored;
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('cs') || lang.startsWith('sk')) return 'cs';
    if (lang.startsWith('de')) return 'de';
  } catch { /* localStorage may be unavailable */ }
  return 'en';
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, showDetail: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('[ErrorBoundary]', error, info.componentStack);
    // Odeslat do Sentry s component stack
    Sentry.captureException(error, {
      contexts: {
        react: { componentStack: info.componentStack ?? '' },
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCache = () => {
    try {
      // Vymazat localStorage (Zustand persist data)
      const keysToKeep = ['trenink-locale', 'trenink-theme'];
      const savedValues: Record<string, string> = {};
      keysToKeep.forEach(k => {
        const v = localStorage.getItem(k);
        if (v) savedValues[k] = v;
      });
      localStorage.clear();
      Object.entries(savedValues).forEach(([k, v]) => localStorage.setItem(k, v));
    } catch { /* ignore */ }

    try {
      // Vymazat service worker cache
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
      }
      // Odregistrovat service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs =>
          regs.forEach(reg => reg.unregister())
        );
      }
    } catch { /* ignore */ }

    // Reload po krátké prodlevě (aby se cache stihnul smazat)
    setTimeout(() => window.location.reload(), 300);
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const texts = ERROR_TEXTS[getErrorLocale()] ?? ERROR_TEXTS.en;
    const { error, showDetail } = this.state;

    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#121212', color: '#E8E8F0',
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          {texts.title}
        </h1>
        <p style={{ fontSize: 14, color: '#888', textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>
          {texts.message}
        </p>

        {/* Primary: Reload */}
        <button
          onClick={this.handleReload}
          style={{
            background: '#1B5E20', color: '#fff', fontWeight: 600,
            fontSize: 15, padding: '12px 32px', borderRadius: 12,
            border: 'none', cursor: 'pointer',
          }}
        >
          {texts.reload}
        </button>

        {/* Secondary: Clear cache */}
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            {texts.clearCacheDesc}
          </p>
          <button
            onClick={this.handleClearCache}
            style={{
              background: 'transparent', color: '#EF5350', fontWeight: 600,
              fontSize: 13, padding: '8px 20px', borderRadius: 10,
              border: '1.5px solid #EF5350', cursor: 'pointer',
            }}
          >
            {texts.clearCache}
          </button>
        </div>

        {/* Error detail toggle */}
        {error && (
          <div style={{ marginTop: 16, textAlign: 'center', maxWidth: 400, width: '100%' }}>
            <button
              onClick={() => this.setState({ showDetail: !showDetail })}
              style={{
                background: 'transparent', color: '#555', fontSize: 12,
                border: 'none', cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              {showDetail ? '▼' : '▶'} {texts.errorDetail}
            </button>
            {showDetail && (
              <pre style={{
                marginTop: 8, padding: 12, borderRadius: 8,
                background: '#1E1E2E', color: '#EF5350',
                fontSize: 11, textAlign: 'left', overflow: 'auto',
                maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {error.message}
                {'\n\n'}
                {error.stack?.split('\n').slice(1, 6).join('\n')}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }
}
