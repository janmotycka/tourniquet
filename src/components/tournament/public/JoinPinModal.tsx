import { useI18n } from '../../../i18n';

interface JoinPinModalProps {
  joinPin: string;
  setJoinPin: (pin: string) => void;
  joinError: string;
  setJoinError: (error: string) => void;
  joining: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export function JoinPinModal({ joinPin, setJoinPin, joinError, setJoinError, joining, onSubmit, onClose }: JoinPinModalProps) {
  const { t } = useI18n();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 20, padding: '28px 24px',
        width: '100%', maxWidth: 360,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
          <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
            {t('tournament.public.joinTitle')}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            {t('tournament.public.joinDesc')}
          </p>
        </div>

        {/* PIN input */}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          value={joinPin}
          onChange={e => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
            setJoinPin(val);
            setJoinError('');
          }}
          onKeyDown={e => { if (e.key === 'Enter' && joinPin.length === 6) onSubmit(); }}
          placeholder="000000"
          style={{
            width: '100%', textAlign: 'center',
            fontSize: 28, fontWeight: 800, letterSpacing: 12,
            padding: '14px 12px', borderRadius: 14,
            border: joinError ? '2px solid var(--danger)' : '2px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)',
            outline: 'none', caretColor: 'var(--primary)',
            transition: 'border-color .2s',
            boxSizing: 'border-box',
          }}
          onFocus={e => { if (!joinError) e.target.style.borderColor = 'var(--primary)'; }}
          onBlur={e => { if (!joinError) e.target.style.borderColor = 'var(--border)'; }}
        />

        {/* Error message */}
        {joinError && (
          <p style={{
            fontSize: 13, color: 'var(--danger)', fontWeight: 600,
            textAlign: 'center', margin: 0,
            background: 'var(--danger-light)', padding: '8px 12px', borderRadius: 10,
          }}>
            {joinError}
          </p>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '13px 12px', borderRadius: 12,
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
              background: 'var(--bg)', color: 'var(--text-muted)',
              border: '1.5px solid var(--border)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onSubmit}
            disabled={joining || joinPin.length !== 6}
            style={{
              flex: 1, padding: '13px 12px', borderRadius: 12,
              fontWeight: 700, fontSize: 15, cursor: joining ? 'wait' : 'pointer',
              background: joinPin.length === 6 ? 'var(--primary)' : 'var(--border)',
              color: joinPin.length === 6 ? '#fff' : 'var(--text-muted)',
              border: 'none',
              opacity: joining ? 0.7 : 1,
              transition: 'background .2s, opacity .2s',
            }}
          >
            {joining ? t('tournament.public.joining') : t('tournament.public.joinConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
