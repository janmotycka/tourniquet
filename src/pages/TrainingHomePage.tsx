import type { Page } from '../App';
import { useTrainingsStore } from '../store/trainings.store';
import { useGeneratorStore } from '../store/generator.store';
import { CATEGORY_CONFIGS } from '../data/categories.data';
import { formatMinutes } from '../utils/time';

interface Props { navigate: (p: Page) => void; }

export function TrainingHomePage({ navigate }: Props) {
  const savedTrainings = useTrainingsStore(s => s.savedTrainings);
  const reset = useGeneratorStore(s => s.reset);

  const handleNew = () => { reset(); navigate({ name: 'generator' }); };

  const cats = new Set(savedTrainings.map(t => t.input.category)).size;
  const totalMins = savedTrainings.reduce((s, t) => s + t.totalDuration, 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate({ name: 'home' })} style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
          fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>←</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
            ⚽
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>Trénink</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>Generátor a plánování tréninků</p>
          </div>
        </div>
      </div>

      {/* Main CTA */}
      <div style={{
        background: 'var(--primary)', borderRadius: 24, padding: '24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12
      }}>
        <div style={{ fontSize: 40 }}>📋</div>
        <h2 style={{ color: '#fff', fontWeight: 800, fontSize: 22, textAlign: 'center' }}>Nový trénink</h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          Vygenerujte tréninkovou jednotku přizpůsobenou vaší kategorii za méně než minutu.
        </p>
        <button onClick={handleNew} style={{
          background: '#fff', color: 'var(--primary)', fontWeight: 700, fontSize: 16,
          padding: '14px 0', borderRadius: 14, width: '100%', marginTop: 4,
          transition: 'opacity .15s'
        }}>
          Začít sestavovat →
        </button>
      </div>

      {/* Stats (only if saved trainings exist) */}
      {savedTrainings.length > 0 && (
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { n: savedTrainings.length, label: 'uložených\ntréninků' },
            { n: cats, label: 'různých\nkategorií' },
            { n: `${Math.round(totalMins / 60)}h`, label: 'celkem\nnaplánováno' },
          ].map((s, i) => (
            <div key={i} style={{
              flex: 1, background: 'var(--surface)', borderRadius: 16, padding: '14px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              boxShadow: '0 1px 4px rgba(0,0,0,.05)'
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
          flex: 1, background: 'var(--surface)', borderRadius: 16, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          boxShadow: '0 1px 4px rgba(0,0,0,.05)', color: 'var(--text)'
        }}>
          <span style={{ fontSize: 22 }}>🔖</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Uložené</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              {savedTrainings.length === 0 ? 'Zatím žádné' : `${savedTrainings.length} tréninků`}
            </div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
        </button>

        <button onClick={() => navigate({ name: 'library' })} style={{
          flex: 1, background: 'var(--surface)', borderRadius: 16, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          boxShadow: '0 1px 4px rgba(0,0,0,.05)', color: 'var(--text)'
        }}>
          <span style={{ fontSize: 22 }}>📚</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Cvičení</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>Knihovna</div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
        </button>
      </div>

      {/* Quick access buttons – row 2 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => navigate({ name: 'manual-builder' })} style={{
          flex: 1, background: 'var(--surface)', borderRadius: 16, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          boxShadow: '0 1px 4px rgba(0,0,0,.05)', color: 'var(--text)'
        }}>
          <span style={{ fontSize: 22 }}>🖊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Sestavit ručně</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>Vlastní výběr</div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
        </button>

        <button onClick={() => navigate({ name: 'calendar' })} style={{
          flex: 1, background: 'var(--surface)', borderRadius: 16, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          boxShadow: '0 1px 4px rgba(0,0,0,.05)', color: 'var(--text)'
        }}>
          <span style={{ fontSize: 22 }}>📅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Kalendář</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>Plánování</div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
        </button>
      </div>

      {/* How it works */}
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Jak to funguje?</h3>
        {[
          { icon: '👥', text: 'Vyberte věkovou kategorii hráčů' },
          { icon: '⏱️', text: 'Nastavte délku tréninku a zaměření' },
          { icon: '⚡', text: 'Aplikace sestaví trénink za vás' },
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
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Poslední tréninky</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedTrainings.slice(0, 3).map(t => {
              const cfg = CATEGORY_CONFIGS[t.input.category];
              return (
                <button key={t.id} onClick={() => navigate({ name: 'training', training: t })}
                  style={{
                    background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
                    boxShadow: '0 1px 4px rgba(0,0,0,.05)', color: 'var(--text)'
                  }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: cfg.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cfg.label} • {formatMinutes(t.totalDuration)}</div>
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
