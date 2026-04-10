import { useState } from 'react';
import type { Tournament } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { markPinVerified } from '../../utils/pin-hash';
import { pinRateLimiter } from '../../utils/rate-limiter';
import { verifyTournamentPin } from '../../services/tournament-functions';
import { logger } from '../../utils/logger';

export function PinGate({ tournament, onVerified, onClose }: { tournament: Tournament; onVerified: () => void; onClose?: () => void }) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (input.length < 4) { setError(t('tournament.detail.pinMinLength')); return; }

    // Rate limiting — max 5 pokusů za 60 sekund
    if (!pinRateLimiter.check()) {
      const retryAfter = pinRateLimiter.getRetryAfterSeconds();
      setError(t('tournament.detail.pinRateLimit', { seconds: retryAfter }));
      return;
    }

    setLoading(true);
    pinRateLimiter.record();
    try {
      await verifyTournamentPin({ tournamentId: tournament.id, pin: input });
      pinRateLimiter.reset();
      markPinVerified(tournament.id);
      setLoading(false);
      onVerified();
    } catch (err: unknown) {
      setLoading(false);
      const code = (err as { code?: string })?.code ?? '';
      logger.error('[CF] verifyTournamentPin failed:', code);
      if (code === 'functions/permission-denied') {
        setError(t('tournament.detail.pinWrong'));
      } else if (code === 'functions/failed-precondition') {
        setError(t('tournament.detail.pinWrong'));
      } else {
        setError(t('tournament.detail.pinWrong'));
      }
      setInput('');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 20, padding: '28px 24px',
        width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
          <h2 style={{ fontWeight: 800, fontSize: 20 }}>{t('tournament.detail.pinPrompt')}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>
            Pro zápis výsledků je vyžadován PIN.
          </p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={input}
          onChange={e => { setInput(e.target.value.replace(/\D/g, '')); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
          placeholder="••••"
          autoFocus
          style={{
            width: '100%', padding: '14px', borderRadius: 12, fontSize: 24,
            border: `2px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            background: 'var(--bg)', color: 'var(--text)', letterSpacing: 10,
            textAlign: 'center', boxSizing: 'border-box',
          }}
        />
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>⚠️ {error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          {onClose && (
            <button onClick={onClose} style={{
              flex: 1, padding: '14px', borderRadius: 12,
              fontWeight: 700, fontSize: 16, cursor: 'pointer',
              background: 'var(--bg)', color: 'var(--text-muted)',
              border: '1.5px solid var(--border)',
            }}>
              Zpět
            </button>
          )}
          <button onClick={handleVerify} disabled={loading || input.length < 4} style={{
            flex: 1, background: loading || input.length < 4 ? 'var(--border)' : 'var(--primary)',
            color: loading || input.length < 4 ? 'var(--text-muted)' : '#fff',
            fontWeight: 700, fontSize: 16, padding: '14px', borderRadius: 12,
          }}>
            {loading ? t('tournament.detail.pinVerifying') : t('tournament.detail.pinConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
