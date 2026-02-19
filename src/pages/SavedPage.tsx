import { useState } from 'react';
import type { Page } from '../App';
import { useTrainingsStore } from '../store/trainings.store';
import { CATEGORY_CONFIGS } from '../data/categories.data';
import { formatMinutes, formatDate } from '../utils/time';
import type { TrainingUnit } from '../types/training.types';

interface Props { navigate: (p: Page) => void; }

export function SavedPage({ navigate }: Props) {
  const { savedTrainings, deleteTraining } = useTrainingsStore(s => ({
    savedTrainings: s.savedTrainings,
    deleteTraining: s.deleteTraining,
  }));
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const confirmDelete = () => {
    if (deleteId) { deleteTraining(deleteId); setDeleteId(null); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px 12px' }}>
        <button onClick={() => navigate({ name: 'home' })} style={{ background: 'none', fontSize: 22, padding: 4, color: 'var(--text)' }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: 22, flex: 1 }}>Uložené tréninky</h1>
        {savedTrainings.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{savedTrainings.length}</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 40px' }}>
        {savedTrainings.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 20px', textAlign: 'center' }}>
            <span style={{ fontSize: 56 }}>🔖</span>
            <h2 style={{ fontWeight: 700, fontSize: 18 }}>Zatím žádné tréninky</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Vygenerujte a uložte svůj první trénink!</p>
            <button onClick={() => navigate({ name: 'generator' })} style={{
              marginTop: 8, padding: '14px 28px', borderRadius: 14, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15,
            }}>
              Nový trénink
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            {savedTrainings.map((t: TrainingUnit) => {
              const cfg = CATEGORY_CONFIGS[t.input.category];
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                  background: 'var(--surface)', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                }}>
                  <button onClick={() => navigate({ name: 'training', training: t })}
                    style={{ flex: 1, textAlign: 'left', background: 'none', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, background: cfg.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                        <span>{cfg.label}</span>
                        <span>•</span>
                        <span>{formatMinutes(t.totalDuration)}</span>
                        <span>•</span>
                        <span>{formatDate(t.updatedAt)}</span>
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)' }}>›</span>
                  </button>
                  <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', fontSize: 18, color: 'var(--error)', padding: '4px' }}>🗑</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '24px', maxWidth: 340, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 18 }}>Smazat trénink?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>Opravdu chcete smazat tento trénink? Tato akce nelze vrátit.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--surface-var)', fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                Zrušit
              </button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--error)', fontWeight: 700, fontSize: 14, color: '#fff' }}>
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
