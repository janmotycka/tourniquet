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
}

const ERROR_TEXTS: Record<string, { title: string; message: string; reload: string }> = {
  cs: {
    title: 'Něco se pokazilo',
    message: 'Aplikace narazila na neočekávanou chybu. Zkuste prosím stránku znovu načíst.',
    reload: 'Načíst znovu',
  },
  de: {
    title: 'Etwas ist schiefgelaufen',
    message: 'Die Anwendung hat einen unerwarteten Fehler festgestellt. Bitte laden Sie die Seite neu.',
    reload: 'Seite neu laden',
  },
  en: {
    title: 'Something went wrong',
    message: 'The application encountered an unexpected error. Please try reloading the page.',
    reload: 'Reload page',
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
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
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

  render() {
    if (!this.state.hasError) return this.props.children;

    const texts = ERROR_TEXTS[getErrorLocale()] ?? ERROR_TEXTS.en;

    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          {texts.title}
        </h1>
        <p style={{ fontSize: 14, color: '#666', textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>
          {texts.message}
        </p>
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
      </div>
    );
  }
}
