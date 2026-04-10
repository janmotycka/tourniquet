import { useI18n } from '../../../i18n';

interface LeaveConfirmModalProps {
  onLeave: () => void;
  onCancel: () => void;
}

export function LeaveConfirmModal({ onLeave, onCancel }: LeaveConfirmModalProps) {
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
        width: '100%', maxWidth: 340,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center',
      }}>
        <div style={{ fontSize: 36 }}>🚪</div>
        <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
          {t('tournament.public.leaveTitle')}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('tournament.public.leaveDesc')}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
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
            onClick={onLeave}
            style={{
              flex: 1, padding: '13px 12px', borderRadius: 12,
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
              background: 'var(--danger)', color: '#fff', border: 'none',
            }}
          >
            {t('tournament.public.leaveConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
