import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../../../utils/logger';

export class PublicViewErrorBoundary extends Component<
  { children: ReactNode; tournamentId: string },
  { hasError: boolean; error: string | null }
> {
  constructor(props: { children: ReactNode; tournamentId: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('[PublicView] Render crash:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 20px' }}>
          <div style={{ fontSize: 48 }}>💥</div>
          <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center', color: '#C62828' }}>Display error</h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
            An unexpected error occurred while displaying the tournament.
          </p>
          <pre style={{ fontSize: 11, color: '#C62828', background: '#FFEBEE', padding: '8px 12px', borderRadius: 8, maxWidth: '100%', overflow: 'auto', textAlign: 'left', wordBreak: 'break-word' }}>
            {this.state.error}
          </pre>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 11 }}>ID: {this.props.tournamentId}</p>
          <button onClick={() => window.location.reload()} style={{
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15,
            padding: '12px 24px', borderRadius: 12, marginTop: 8,
          }}>🔄 Refresh page</button>
        </div>
      );
    }
    return this.props.children;
  }
}
