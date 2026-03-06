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

    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: '#666', textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>
          The application encountered an unexpected error. Please try reloading the page.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            background: '#E65100', color: '#fff', fontWeight: 600,
            fontSize: 15, padding: '12px 32px', borderRadius: 12,
            border: 'none', cursor: 'pointer',
          }}
        >
          Reload page
        </button>
      </div>
    );
  }
}
