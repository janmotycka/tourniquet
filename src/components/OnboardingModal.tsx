import { useState, useEffect } from 'react';
import type { Page } from '../App';
import { useI18n } from '../i18n';

const STORAGE_KEY = 'torq_onboarded';

interface Props {
  navigate: (p: Page) => void;
}

interface ModuleCard {
  emoji: string;
  titleKey: string;
  descKey: string;
  color: string;
  bg: string;
  page: Page;
}

const MODULES: ModuleCard[] = [
  {
    emoji: '⚽',
    titleKey: 'onboarding.trainingTitle',
    descKey: 'onboarding.trainingDesc',
    color: '#1B5E20',
    bg: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
    page: { name: 'training-home' },
  },
  {
    emoji: '🏆',
    titleKey: 'onboarding.tournamentTitle',
    descKey: 'onboarding.tournamentDesc',
    color: '#E65100',
    bg: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)',
    page: { name: 'tournament-list' },
  },
  {
    emoji: '📋',
    titleKey: 'onboarding.matchTitle',
    descKey: 'onboarding.matchDesc',
    color: '#0D47A1',
    bg: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)',
    page: { name: 'match-list' },
  },
];

export function OnboardingModal({ navigate }: Props) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Zobraz jen pokud uživatel ještě neprošel onboardingem
    if (!localStorage.getItem(STORAGE_KEY)) {
      // Krátké zpoždění aby se nejdřív načetla homepage
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSelect = (card: ModuleCard) => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
    navigate(card.page);
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      background: 'rgba(0,0,0,.65)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: 'fadeIn .25s ease',
    }}>
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>

      <div style={{
        background: 'var(--surface)', borderRadius: '28px 28px 0 0',
        width: '100%', maxWidth: 480, padding: '28px 20px 40px',
        animation: 'slideUp .3s ease',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Logo + nadpis */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>⚽</div>
          <h1 style={{ fontWeight: 900, fontSize: 26, letterSpacing: -0.5 }}>
            {t('onboarding.welcome')}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, marginTop: 8, lineHeight: 1.5 }}>
            {t('onboarding.subtitle')}
          </p>
        </div>

        {/* Moduly */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {MODULES.map(card => (
            <button
              key={card.titleKey}
              onClick={() => handleSelect(card)}
              style={{
                background: card.bg, borderRadius: 16, padding: '16px 18px',
                display: 'flex', alignItems: 'center', gap: 16,
                textAlign: 'left', width: '100%',
                boxShadow: '0 2px 8px rgba(0,0,0,.08)',
                transition: 'transform .12s, box-shadow .12s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 16px rgba(0,0,0,.12)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = '';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(0,0,0,.08)';
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14, fontSize: 26,
                background: 'rgba(255,255,255,.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {card.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: card.color }}>
                  {t(card.titleKey)}
                </div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 3, lineHeight: 1.4 }}>
                  {t(card.descKey)}
                </div>
              </div>
              <div style={{ color: card.color, fontSize: 20, opacity: 0.6 }}>›</div>
            </button>
          ))}
        </div>

        {/* Přeskočit */}
        <button
          onClick={handleSkip}
          style={{
            width: '100%', padding: '13px', borderRadius: 14,
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            fontWeight: 600, fontSize: 15,
          }}
        >
          {t('onboarding.skip')}
        </button>
      </div>
    </div>
  );
}
