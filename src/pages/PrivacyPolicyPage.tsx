import type { Page } from '../App';
import { useI18n } from '../i18n';

interface Props { navigate: (p: Page) => void; }

export function PrivacyPolicyPage({ navigate }: Props) {
  const { t } = useI18n();

  const sectionStyle = {
    marginBottom: 24,
  };

  const headingStyle = {
    fontWeight: 700 as const,
    fontSize: 16,
    marginBottom: 8,
    color: 'var(--text)',
  };

  const textStyle = {
    fontSize: 14,
    lineHeight: 1.7,
    color: 'var(--text-muted)',
    margin: 0,
    whiteSpace: 'pre-line' as const,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <button onClick={() => navigate({ name: 'settings' })} aria-label="Back" style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
          fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>{t('privacy.title')}</h1>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', maxWidth: 700 }}>

        <p style={{ ...textStyle, marginBottom: 20, fontStyle: 'italic' }}>
          {t('privacy.lastUpdated')}
        </p>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>{t('privacy.s1Title')}</h2>
          <p style={textStyle}>{t('privacy.s1Text')}</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>{t('privacy.s2Title')}</h2>
          <p style={textStyle}>{t('privacy.s2Text')}</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>{t('privacy.s3Title')}</h2>
          <p style={textStyle}>{t('privacy.s3Text')}</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>{t('privacy.s4Title')}</h2>
          <p style={textStyle}>{t('privacy.s4Text')}</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>{t('privacy.s5Title')}</h2>
          <p style={textStyle}>{t('privacy.s5Text')}</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>{t('privacy.s6Title')}</h2>
          <p style={textStyle}>{t('privacy.s6Text')}</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>{t('privacy.s7Title')}</h2>
          <p style={textStyle}>{t('privacy.s7Text')}</p>
        </div>

        <div style={{ ...sectionStyle, marginBottom: 40 }}>
          <h2 style={headingStyle}>{t('privacy.s8Title')}</h2>
          <p style={textStyle}>{t('privacy.s8Text')}</p>
        </div>

      </div>
    </div>
  );
}
