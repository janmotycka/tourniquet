import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { DesktopPage } from '../../components/desktop/DesktopPage';

interface Props { navigate: (p: Page) => void; }

/**
 * Rozcestník mezi ručním vytvořením turnaje a Plánovačem.
 * Zobrazuje se po kliknutí na "+ Nový turnaj" v TournamentListPage.
 *
 * 2 karty:
 *   - Vytvořit ručně  (CreateTournamentPage — beze změn)
 *   - Navrhnout formát (TournamentPlannerPage — nový wizard)
 */
export function TournamentCreateChoicePage({ navigate }: Props) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();

  // Shared card content — same markup for mobile + desktop, different layout container
  const cards = (
    <>
      {/* Navrhnout formát — recommended card (zvýrazněná) */}
      <button
        onClick={() => navigate({ name: 'tournament-planner' })}
        style={recommendedCardStyle}
      >
        <div style={{
          position: 'absolute', top: 12, right: 12,
          fontSize: 10, fontWeight: 800,
          background: '#E65100', color: '#fff',
          padding: '4px 10px', borderRadius: 20,
          textTransform: 'uppercase', letterSpacing: 0.6,
        }}>
          ⭐ {t('tournament.choice.recommended')}
        </div>
        <div style={{ fontSize: 56, marginBottom: 12 }}>✨</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
          {t('tournament.choice.plannerTitle')}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
          {t('tournament.choice.plannerDesc')}
        </p>
        <ul style={bulletListStyle}>
          <li>{t('tournament.choice.plannerBullet1')}</li>
          <li>{t('tournament.choice.plannerBullet2')}</li>
          <li>{t('tournament.choice.plannerBullet3')}</li>
        </ul>
        <div style={ctaButtonStyle('#E65100')}>
          {t('tournament.choice.plannerCta')} →
        </div>
      </button>

      {/* Vytvořit ručně */}
      <button
        onClick={() => navigate({ name: 'tournament-create' })}
        style={standardCardStyle}
      >
        <div style={{ fontSize: 56, marginBottom: 12 }}>✏️</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
          {t('tournament.choice.manualTitle')}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
          {t('tournament.choice.manualDesc')}
        </p>
        <ul style={bulletListStyle}>
          <li>{t('tournament.choice.manualBullet1')}</li>
          <li>{t('tournament.choice.manualBullet2')}</li>
          <li>{t('tournament.choice.manualBullet3')}</li>
        </ul>
        <div style={ctaButtonStyle('var(--primary)')}>
          {t('tournament.choice.manualCta')} →
        </div>
      </button>
    </>
  );

  if (isDesktop) {
    return (
      <DesktopPage
        title={t('tournament.choice.title')}
        subtitle={t('tournament.choice.subtitle')}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 20,
          maxWidth: 900,
        }}>
          {cards}
        </div>
        <button
          onClick={() => navigate({ name: 'tournament-list' })}
          style={backLinkStyle}
        >
          {t('common.back')}
        </button>
      </DesktopPage>
    );
  }

  // Mobile — header + stacked cards
  return (
    <div style={{ padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <button
          onClick={() => navigate({ name: 'tournament-list' })}
          aria-label={t('common.back')}
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, cursor: 'pointer', flexShrink: 0,
          }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
            {t('tournament.choice.title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {t('tournament.choice.subtitle')}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
        {cards}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const baseCardStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
  padding: '28px 24px',
  borderRadius: 18,
  background: 'var(--surface)',
  textAlign: 'left',
  cursor: 'pointer',
  width: '100%',
  minHeight: 280,
  transition: 'transform .15s, box-shadow .15s, border-color .15s',
};

const recommendedCardStyle: React.CSSProperties = {
  ...baseCardStyle,
  border: '2px solid #E65100',
  boxShadow: '0 4px 20px rgba(230, 81, 0, 0.12)',
};

const standardCardStyle: React.CSSProperties = {
  ...baseCardStyle,
  border: '1.5px solid var(--border)',
};

const bulletListStyle: React.CSSProperties = {
  fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7,
  paddingLeft: 18, margin: '0 0 20px',
  flex: 1,
};

function ctaButtonStyle(color: string): React.CSSProperties {
  return {
    marginTop: 'auto',
    padding: '12px 20px',
    borderRadius: 10,
    background: color,
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    alignSelf: 'stretch',
    textAlign: 'center',
  };
}

const backLinkStyle: React.CSSProperties = {
  marginTop: 24,
  background: 'transparent', border: 'none',
  color: 'var(--text-muted)', fontSize: 14, fontWeight: 600,
  cursor: 'pointer', padding: '8px 0',
};
