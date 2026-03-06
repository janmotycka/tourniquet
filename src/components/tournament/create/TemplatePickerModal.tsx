import { useI18n } from '../../../i18n';
import type { TournamentTemplate } from '../../../types/tournament.types';

interface TemplatePickerModalProps {
  templates: TournamentTemplate[];
  onSelect: (tpl: TournamentTemplate) => void;
  onClose: () => void;
}

export function TemplatePickerModal({ templates, onSelect, onClose }: TemplatePickerModalProps) {
  const { t } = useI18n();

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: '24px 24px 0 0', width: '100%',
        maxWidth: 480, maxHeight: '70dvh', overflow: 'auto',
        padding: '20px 16px 32px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <h3 style={{ fontWeight: 800, fontSize: 17, textAlign: 'center', marginBottom: 16 }}>
          📋 {t('template.selectTemplate')}
        </h3>
        {templates.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('template.noTemplates')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.map(tpl => (
              <button key={tpl.id} onClick={() => onSelect(tpl)} style={{
                background: 'var(--surface-var)', borderRadius: 12, padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 4,
                textAlign: 'left', width: '100%',
              }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{tpl.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {tpl.teamCount} {t('template.teams')} · {tpl.settings.format ?? 'round-robin'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
