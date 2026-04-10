import type { Page } from '../App';
import { useTrainingsStore } from '../store/trainings.store';
import { useGeneratorStore } from '../store/generator.store';
import { CATEGORY_CONFIGS } from '../data/categories.data';
import { formatMinutes } from '../utils/time';
import { useI18n } from '../i18n';
import { PageHeader } from '../components/ui';

interface Props { navigate: (p: Page) => void; }

export function TrainingHomePage({ navigate }: Props) {
  const { t } = useI18n();
  const savedTrainings = useTrainingsStore(s => s.savedTrainings);
  const reset = useGeneratorStore(s => s.reset);

  const handleNew = () => { reset(); navigate({ name: 'generator' }); };

  const cats = new Set(savedTrainings.map(t => t.input.category)).size;
  const totalMins = savedTrainings.reduce((s, t) => s + t.totalDuration, 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>

      {/* Header */}
      <PageHeader
        title={t('trainingHome.title')}
        subtitle={t('trainingHome.subtitle')}
        onBack={() => navigate({ name: 'home' })}
        variant="inset"
      />

      {/* Main CTA */}
      <div style={{
        background: 'var(--primary)', borderRadius: 24, padding: '24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12
      }}>
        <div style={{ fontSize: 40 }}>📋</div>
        <h2 style={{ color: '#fff', fontWeight: 800, fontSize: 22, textAlign: 'center' }}>{t('trainingHome.newTraining')}</h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          {t('trainingHome.newTrainingDesc')}
        </p>
        <button onClick={handleNew} style={{
          background: '#fff', color: 'var(--primary)', fontWeight: 700, fontSize: 16,
          padding: '14px 0', borderRadius: 14, width: '100%', marginTop: 4,
          transition: 'opacity .15s'
        }}>
          {t('trainingHome.startBuilding')}
        </button>
      </div>

      {/* Stats (only if saved trainings exist) */}
      {savedTrainings.length > 0 && (
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { n: savedTrainings.length, label: t('trainingHome.savedTrainings') },
            { n: cats, label: t('trainingHome.differentCategories') },
            { n: `${Math.round(totalMins / 60)}h`, label: t('trainingHome.totalPlanned') },
          ].map((s, i) => (
            <div key={i} style={{
              flex: 1, background: 'var(--surface)', borderRadius: 14, padding: '14px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              boxShadow: 'var(--shadow-sm)'
            }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{s.n}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.4 }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick access buttons – row 1 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => navigate({ name: 'saved' })} style={{
          flex: 1, background: 'var(--surface)', borderRadius: 14, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          boxShadow: 'var(--shadow-sm)', color: 'var(--text)'
        }}>
          <span style={{ fontSize: 22 }}>🔖</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t('trainingHome.saved')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              {savedTrainings.length === 0 ? t('trainingHome.noSaved') : t('trainingHome.countTrainings', { count: String(savedTrainings.length) })}
            </div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
        </button>

        <button onClick={() => navigate({ name: 'library' })} style={{
          flex: 1, background: 'var(--surface)', borderRadius: 14, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          boxShadow: 'var(--shadow-sm)', color: 'var(--text)'
        }}>
          <span style={{ fontSize: 22 }}>📚</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t('trainingHome.exercises')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{t('trainingHome.library')}</div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
        </button>
      </div>

      {/* Quick access buttons – row 2 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => navigate({ name: 'manual-builder' })} style={{
          flex: 1, background: 'var(--surface)', borderRadius: 14, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          boxShadow: 'var(--shadow-sm)', color: 'var(--text)'
        }}>
          <span style={{ fontSize: 22 }}>🖊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t('trainingHome.manualBuild')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{t('trainingHome.manualBuildSub')}</div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
        </button>

        <button onClick={() => navigate({ name: 'calendar' })} style={{
          flex: 1, background: 'var(--surface)', borderRadius: 14, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          boxShadow: 'var(--shadow-sm)', color: 'var(--text)'
        }}>
          <span style={{ fontSize: 22 }}>📅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t('trainingHome.calendar')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{t('trainingHome.planning')}</div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
        </button>
      </div>

      {/* How it works */}
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{t('trainingHome.howItWorks')}</h3>
        {[
          { icon: '👥', text: t('trainingHome.step1') },
          { icon: '⏱️', text: t('trainingHome.step2') },
          { icon: '⚡', text: t('trainingHome.step3') },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 12 : 0 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--primary)', flexShrink: 0
            }}>{i + 1}</div>
            <span style={{ fontSize: 20 }}>{s.icon}</span>
            <span style={{ fontSize: 14, color: 'var(--text-sub)' }}>{s.text}</span>
          </div>
        ))}
      </div>

      {/* Recent trainings */}
      {savedTrainings.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{t('trainingHome.recentTrainings')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedTrainings.slice(0, 3).map(tr => {
              const cfg = CATEGORY_CONFIGS[tr.input.category];
              return (
                <button key={tr.id} onClick={() => navigate({ name: 'training', training: tr })}
                  style={{
                    background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
                    boxShadow: 'var(--shadow-sm)', color: 'var(--text)'
                  }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: cfg.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t(cfg.label)} • {formatMinutes(tr.totalDuration)}</div>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>›</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
