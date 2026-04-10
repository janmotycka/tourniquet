import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { PageHeader } from '../../components/ui';
import { radius, fontSize, fontWeight, spacing } from '../../theme/tokens';

interface Props { navigate: (p: Page) => void; }

/**
 * Rozcestník mezi ručním vytvořením turnaje a Plánovačem.
 *
 * Design: kompaktní mobile-first — obě varianty musí padnout na jeden screen.
 * Používá `<PageHeader variant="inset">` pro konzistentní back button + title.
 */
export function TournamentCreateChoicePage({ navigate }: Props) {
  const { t } = useI18n();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      padding: `${spacing.lg}px ${spacing.lg}px ${spacing.xl}px`,
      gap: spacing.md,
      minHeight: '100dvh',
      boxSizing: 'border-box',
    }}>
      <PageHeader
        title={t('tournament.choice.title')}
        subtitle={t('tournament.choice.subtitle')}
        onBack={() => navigate({ name: 'tournament-list' })}
        backLabel={t('common.back')}
        variant="inset"
      />

      {/* ── Navrhnout formát — recommended ── */}
      <button
        onClick={() => navigate({ name: 'tournament-planner' })}
        style={{
          position: 'relative',
          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          padding: `${spacing.md + 2}px ${spacing.lg}px`,
          borderRadius: radius.xl,
          background: 'var(--surface)',
          border: '2px solid var(--warning)',
          boxShadow: 'var(--shadow-sm)',
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <span style={{ fontSize: 20 }}>✨</span>
          <h2 style={{
            fontSize: fontSize.lg - 2, // 16 — slightly smaller than PageHeader h1
            fontWeight: fontWeight.extrabold,
            color: 'var(--text)',
            margin: 0,
            flex: 1,
          }}>
            {t('tournament.choice.plannerTitle')}
          </h2>
          <span style={{
            fontSize: 9,
            fontWeight: fontWeight.extrabold,
            background: 'var(--warning)',
            color: '#fff',
            padding: '3px 7px',
            borderRadius: radius.xxl,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            flexShrink: 0,
          }}>
            ⭐ {t('tournament.choice.recommended')}
          </span>
        </div>
        <p style={{
          fontSize: fontSize.sm,
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          margin: 0,
        }}>
          {t('tournament.choice.plannerDesc')}
        </p>
        <ul style={bulletListStyle}>
          <li>{t('tournament.choice.plannerBullet1')}</li>
          <li>{t('tournament.choice.plannerBullet2')}</li>
          <li>{t('tournament.choice.plannerBullet3')}</li>
        </ul>
        <div style={{
          marginTop: spacing.xs,
          padding: `10px ${spacing.md + 2}px`,
          borderRadius: radius.md,
          background: 'var(--warning)',
          color: '#fff',
          fontWeight: fontWeight.bold,
          fontSize: fontSize.base,
          textAlign: 'center',
        }}>
          {t('tournament.choice.plannerCta')} →
        </div>
      </button>

      {/* ── Vytvořit ručně ── */}
      <button
        onClick={() => navigate({ name: 'tournament-create' })}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          padding: `${spacing.md + 2}px ${spacing.lg}px`,
          borderRadius: radius.xl,
          background: 'var(--surface)',
          border: '1.5px solid var(--border)',
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <span style={{ fontSize: 20 }}>✏️</span>
          <h2 style={{
            fontSize: fontSize.lg - 2,
            fontWeight: fontWeight.extrabold,
            color: 'var(--text)',
            margin: 0,
          }}>
            {t('tournament.choice.manualTitle')}
          </h2>
        </div>
        <p style={{
          fontSize: fontSize.sm,
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          margin: 0,
        }}>
          {t('tournament.choice.manualDesc')}
        </p>
        <ul style={bulletListStyle}>
          <li>{t('tournament.choice.manualBullet1')}</li>
          <li>{t('tournament.choice.manualBullet2')}</li>
          <li>{t('tournament.choice.manualBullet3')}</li>
        </ul>
        <div style={{
          marginTop: spacing.xs,
          padding: `10px ${spacing.md + 2}px`,
          borderRadius: radius.md,
          background: 'var(--primary)',
          color: '#fff',
          fontWeight: fontWeight.bold,
          fontSize: fontSize.base,
          textAlign: 'center',
        }}>
          {t('tournament.choice.manualCta')} →
        </div>
      </button>
    </div>
  );
}

const bulletListStyle: React.CSSProperties = {
  margin: '2px 0 0',
  paddingLeft: 18,
  fontSize: fontSize.xs,
  color: 'var(--text-sub)',
  lineHeight: 1.5,
};
