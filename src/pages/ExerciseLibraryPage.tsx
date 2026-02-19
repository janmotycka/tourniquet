import { useState } from 'react';
import type { Page } from '../App';
import { ALL_EXERCISES } from '../data/exercises/index';
import { useExercisesStore } from '../store/exercises.store';
import { CATEGORY_CONFIGS } from '../data/categories.data';
import { SKILL_FOCUS_CONFIGS } from '../data/skill-focus.data';
import type { Exercise, PhaseType, SkillFocus, DifficultyLevel } from '../types/exercise.types';
import type { AgeCategory } from '../types/category.types';

interface Props { navigate: (p: Page) => void; }

const PHASE_LABELS: Record<PhaseType, string> = {
  warmup: 'Rozcvičení',
  main: 'Hlavní část',
  cooldown: 'Závěr',
};
const PHASE_COLORS: Record<PhaseType, { bg: string; text: string }> = {
  warmup: { bg: 'var(--warmup-light)', text: 'var(--warmup-text)' },
  main: { bg: 'var(--main-ph-light)', text: 'var(--main-ph-text)' },
  cooldown: { bg: 'var(--cooldown-light)', text: 'var(--cooldown-text)' },
};

const DIFFICULTIES: Record<DifficultyLevel, string> = {
  beginner: 'Začátečník',
  intermediate: 'Pokročilý',
  advanced: 'Expert',
};

const ALL_SKILLS: SkillFocus[] = [
  'koordinace', 'driblink', 'prihrávky', 'střelba',
  'pozicování', 'obranná-hra', 'malá-hra', 'fyzička', 'hlavičky',
];

const EMPTY_EXERCISE: Omit<Exercise, 'id'> = {
  name: '',
  description: '',
  instructions: [''],
  duration: { min: 5, max: 15, recommended: 10 },
  players: { min: 4, max: 20 },
  equipment: [],
  phaseType: 'main',
  skillFocus: [],
  suitableFor: ['pripravka', 'mladsi-zaci', 'starsi-zaci', 'dorost'],
  difficulty: 'beginner',
  isStation: false,
  isCustom: true,
};

function ExerciseModal({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px',
        maxHeight: '80vh', overflowY: 'auto', maxWidth: 480, width: '100%', margin: '0 auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{exercise.name}</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                background: PHASE_COLORS[exercise.phaseType].bg,
                color: PHASE_COLORS[exercise.phaseType].text,
              }}>{PHASE_LABELS[exercise.phaseType]}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 6px' }}>
                {exercise.duration.recommended} min · {DIFFICULTIES[exercise.difficulty]}
              </span>
              {exercise.isCustom && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#FFF3CD', color: '#856404' }}>Vlastní</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ fontSize: 22, padding: '4px 8px', color: 'var(--text-muted)', background: 'none' }}>✕</button>
        </div>

        <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6, fontSize: 14 }}>{exercise.description}</p>

        {exercise.coachTip && (
          <div style={{ background: 'var(--primary-light)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13, marginBottom: 4 }}>💡 Tip trenéra</div>
            <div style={{ color: 'var(--primary)', fontSize: 13, lineHeight: 1.5 }}>{exercise.coachTip}</div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Postup</div>
          {exercise.instructions.map((inst, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>{inst}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {exercise.skillFocus.map(sf => (
            <span key={sf} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600 }}>
              {SKILL_FOCUS_CONFIGS[sf]?.label ?? sf}
            </span>
          ))}
          {exercise.equipment.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 6px' }}>🎒 {exercise.equipment.join(', ')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

interface EditForm extends Omit<Exercise, 'id' | 'skillFocus' | 'suitableFor' | 'instructions'> {
  skillFocus: SkillFocus[];
  suitableFor: AgeCategory[];
  instructions: string[];
  equipmentStr: string;
}

function EditExerciseModal({
  exercise,
  onSave,
  onCancel,
}: {
  exercise?: Exercise;
  onSave: (ex: Exercise) => void;
  onCancel: () => void;
}) {
  const isNew = !exercise;
  const [form, setForm] = useState<EditForm>(() => ({
    ...(exercise ?? EMPTY_EXERCISE),
    equipmentStr: (exercise?.equipment ?? []).join(', '),
  }));
  const [instrText, setInstrText] = useState((exercise?.instructions ?? ['']).join('\n'));

  const handleSave = () => {
    if (!form.name.trim()) return;
    const saved: Exercise = {
      id: exercise?.id ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: form.name.trim(),
      description: form.description.trim(),
      instructions: instrText.split('\n').map(s => s.trim()).filter(Boolean),
      duration: form.duration,
      players: form.players,
      equipment: form.equipmentStr.split(',').map(s => s.trim()).filter(Boolean),
      phaseType: form.phaseType,
      skillFocus: form.skillFocus,
      suitableFor: form.suitableFor,
      difficulty: form.difficulty,
      isStation: form.isStation,
      coachTip: form.coachTip?.trim() || undefined,
      isCustom: true,
    };
    onSave(saved);
  };

  const toggleSkill = (s: SkillFocus) => setForm(f => ({
    ...f,
    skillFocus: f.skillFocus.includes(s)
      ? f.skillFocus.filter(x => x !== s)
      : [...f.skillFocus, s],
  }));

  const toggleCategory = (c: AgeCategory) => setForm(f => ({
    ...f,
    suitableFor: f.suitableFor.includes(c)
      ? f.suitableFor.filter(x => x !== c)
      : [...f.suitableFor, c],
  }));

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 14, color: 'var(--text)', boxSizing: 'border-box' };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px',
        maxHeight: '92vh', overflowY: 'auto', maxWidth: 480, width: '100%', margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 800, fontSize: 20 }}>{isNew ? '+ Nové cvičení' : 'Upravit cvičení'}</h2>
          <button onClick={onCancel} style={{ fontSize: 22, padding: '4px 8px', color: 'var(--text-muted)', background: 'none' }}>✕</button>
        </div>

        {/* Name */}
        <div><div style={labelStyle}>Název *</div>
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Název cvičení..." />
        </div>

        {/* Description */}
        <div><div style={labelStyle}>Popis</div>
          <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Stručný popis cvičení..." />
        </div>

        {/* Instructions */}
        <div><div style={labelStyle}>Postup (každý krok na nový řádek)</div>
          <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} value={instrText} onChange={e => setInstrText(e.target.value)} placeholder="1. krok&#10;2. krok&#10;3. krok..." />
        </div>

        {/* Phase */}
        <div><div style={labelStyle}>Fáze tréninku</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['warmup', 'main', 'cooldown'] as PhaseType[]).map(p => (
              <button key={p} onClick={() => setForm(f => ({ ...f, phaseType: p }))}
                style={{
                  flex: 1, padding: '10px 4px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${form.phaseType === p ? PHASE_COLORS[p].text : 'var(--border)'}`,
                  background: form.phaseType === p ? PHASE_COLORS[p].bg : 'var(--surface)',
                  color: form.phaseType === p ? PHASE_COLORS[p].text : 'var(--text-muted)',
                }}>{PHASE_LABELS[p]}</button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><div style={labelStyle}>Doporučená délka (min)</div>
            <input type="number" style={inputStyle} value={form.duration.recommended} min={1} max={60}
              onChange={e => setForm(f => ({ ...f, duration: { ...f.duration, recommended: Number(e.target.value) } }))} />
          </div>
          <div style={{ flex: 1 }}><div style={labelStyle}>Min hráčů</div>
            <input type="number" style={inputStyle} value={form.players.min} min={1}
              onChange={e => setForm(f => ({ ...f, players: { ...f.players, min: Number(e.target.value) } }))} />
          </div>
        </div>

        {/* Skill focus */}
        <div><div style={labelStyle}>Zaměření</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_SKILLS.map(s => (
              <button key={s} onClick={() => toggleSkill(s)}
                style={{
                  padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${form.skillFocus.includes(s) ? 'var(--primary)' : 'var(--border)'}`,
                  background: form.skillFocus.includes(s) ? 'var(--primary)' : 'var(--surface)',
                  color: form.skillFocus.includes(s) ? '#fff' : 'var(--text)',
                }}>{SKILL_FOCUS_CONFIGS[s]?.label ?? s}</button>
            ))}
          </div>
        </div>

        {/* Suitable for */}
        <div><div style={labelStyle}>Kategorie hráčů</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(Object.keys(CATEGORY_CONFIGS) as AgeCategory[]).map(c => (
              <button key={c} onClick={() => toggleCategory(c)}
                style={{
                  padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${form.suitableFor.includes(c) ? CATEGORY_CONFIGS[c].color : 'var(--border)'}`,
                  background: form.suitableFor.includes(c) ? CATEGORY_CONFIGS[c].lightColor : 'var(--surface)',
                  color: form.suitableFor.includes(c) ? CATEGORY_CONFIGS[c].color : 'var(--text)',
                }}>{CATEGORY_CONFIGS[c].label}</button>
            ))}
          </div>
        </div>

        {/* Equipment */}
        <div><div style={labelStyle}>Pomůcky (oddělte čárkou)</div>
          <input style={inputStyle} value={form.equipmentStr}
            onChange={e => setForm(f => ({ ...f, equipmentStr: e.target.value }))}
            placeholder="míče, kuželky, branky..." />
        </div>

        {/* Coach tip */}
        <div><div style={labelStyle}>Tip pro trenéra (volitelné)</div>
          <input style={inputStyle} value={form.coachTip ?? ''}
            onChange={e => setForm(f => ({ ...f, coachTip: e.target.value }))}
            placeholder="Poznámka, na co si dát pozor..." />
        </div>

        {/* Is station */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="checkbox" id="isStation" checked={form.isStation}
            onChange={e => setForm(f => ({ ...f, isStation: e.target.checked }))}
            style={{ width: 18, height: 18 }} />
          <label htmlFor="isStation" style={{ fontSize: 14 }}>Vhodné jako stanoviště</label>
        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={!form.name.trim()}
          style={{
            padding: '15px', borderRadius: 16, fontWeight: 700, fontSize: 16,
            background: form.name.trim() ? 'var(--primary)' : 'var(--border)',
            color: form.name.trim() ? '#fff' : 'var(--text-disabled)',
          }}>
          {isNew ? '+ Přidat cvičení' : '✓ Uložit změny'}
        </button>
      </div>
    </div>
  );
}

export function ExerciseLibraryPage({ navigate }: Props) {
  const { customExercises, favoriteIds, addExercise, updateExercise, deleteExercise, toggleFavorite } = useExercisesStore();
  const [search, setSearch] = useState('');
  const [filterPhase, setFilterPhase] = useState<PhaseType | null>(null);
  const [filterCategory, setFilterCategory] = useState<AgeCategory | null>(null);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | 'new' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const allExercises = [...ALL_EXERCISES, ...customExercises];

  // Sort: favorites first, then alphabetically
  const sorted = [...allExercises].sort((a, b) => {
    const aFav = favoriteIds.includes(a.id) ? 0 : 1;
    const bFav = favoriteIds.includes(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return a.name.localeCompare(b.name, 'cs');
  });

  const filtered = sorted.filter(ex => {
    if (filterFavorites && !favoriteIds.includes(ex.id)) return false;
    if (filterPhase && ex.phaseType !== filterPhase) return false;
    if (filterCategory && !ex.suitableFor.includes(filterCategory)) return false;
    if (search) {
      const q = search.toLowerCase();
      return ex.name.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q) ||
        ex.skillFocus.some(sf => SKILL_FOCUS_CONFIGS[sf]?.label?.toLowerCase().includes(q));
    }
    return true;
  });

  const handleSave = (ex: Exercise) => {
    if (editingExercise === 'new') {
      addExercise(ex);
    } else if (editingExercise) {
      updateExercise(ex.id, ex);
    }
    setEditingExercise(null);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate({ name: 'home' })}
          style={{ background: 'none', fontSize: 22, padding: 4, color: 'var(--text)' }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>Knihovna cvičení</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{filtered.length} cvičení</span>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 20px 0' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Hledat cvičení..."
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 14,
            border: '1.5px solid var(--border)', background: 'var(--surface)',
            fontSize: 14, color: 'var(--text)', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Favorites + Phase filter */}
      <div style={{ padding: '10px 20px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {/* Favorites toggle */}
        <button onClick={() => setFilterFavorites(f => !f)}
          style={{
            padding: '6px 14px', borderRadius: 14, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
            border: `2px solid ${filterFavorites ? '#F4A100' : 'var(--border)'}`,
            background: filterFavorites ? '#FFF8E1' : 'var(--surface)',
            color: filterFavorites ? '#856404' : 'var(--text)',
            flexShrink: 0,
          }}>
          ⭐ Oblíbené {favoriteIds.length > 0 && `(${favoriteIds.length})`}
        </button>

        {([null, 'warmup', 'main', 'cooldown'] as (PhaseType | null)[]).map(p => (
          <button key={p ?? 'all'} onClick={() => setFilterPhase(p)}
            style={{
              padding: '6px 14px', borderRadius: 14, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              border: `2px solid ${filterPhase === p ? 'var(--primary)' : 'var(--border)'}`,
              background: filterPhase === p ? 'var(--primary)' : 'var(--surface)',
              color: filterPhase === p ? '#fff' : 'var(--text)',
              flexShrink: 0,
            }}>
            {p === null ? 'Vše' : PHASE_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div style={{ padding: '8px 20px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {([null, 'pripravka', 'mladsi-zaci', 'starsi-zaci', 'dorost'] as (AgeCategory | null)[]).map(c => (
          <button key={c ?? 'all'} onClick={() => setFilterCategory(c)}
            style={{
              padding: '6px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              border: `2px solid ${filterCategory === c ? (c ? CATEGORY_CONFIGS[c].color : 'var(--primary)') : 'var(--border)'}`,
              background: filterCategory === c ? (c ? CATEGORY_CONFIGS[c].lightColor : 'var(--primary-light)') : 'var(--surface)',
              color: filterCategory === c ? (c ? CATEGORY_CONFIGS[c].color : 'var(--primary)') : 'var(--text)',
              flexShrink: 0,
            }}>
            {c === null ? 'Všechny věk.' : CATEGORY_CONFIGS[c].label}
          </button>
        ))}
      </div>

      {/* Exercise list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15 }}>Žádná cvičení nenalezena</div>
          </div>
        ) : filtered.map(ex => {
          const isFav = favoriteIds.includes(ex.id);
          return (
            <div key={ex.id} style={{
              background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              border: `1.5px solid ${isFav ? '#F4A10040' : ex.isCustom ? '#E8D5B7' : 'transparent'}`,
            }}>
              {/* Favorite star button */}
              <button
                onClick={() => toggleFavorite(ex.id)}
                style={{
                  width: 32, height: 32, borderRadius: 8, background: isFav ? '#FFF8E1' : 'var(--surface-var)',
                  fontSize: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${isFav ? '#F4A100' : 'var(--border)'}`,
                }}
                title={isFav ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
              >
                {isFav ? '⭐' : '☆'}
              </button>

              <button style={{ flex: 1, textAlign: 'left', background: 'none' }}
                onClick={() => setSelectedExercise(ex)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1, lineHeight: 1.3 }}>{ex.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, flexShrink: 0,
                    background: PHASE_COLORS[ex.phaseType].bg, color: PHASE_COLORS[ex.phaseType].text,
                  }}>{PHASE_LABELS[ex.phaseType]}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏱ {ex.duration.recommended} min</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {ex.skillFocus.slice(0, 2).map(sf => SKILL_FOCUS_CONFIGS[sf]?.label ?? sf).join(', ')}</span>
                  {ex.isCustom && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: '#FFF3CD', color: '#856404' }}>Vlastní</span>}
                </div>
              </button>

              {ex.isCustom && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setEditingExercise(ex)}
                    style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', fontSize: 14 }}>✏️</button>
                  <button onClick={() => setDeleteConfirm(ex.id)}
                    style={{ width: 32, height: 32, borderRadius: 8, background: '#FFEAEA', fontSize: 14 }}>🗑️</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add button */}
      <div style={{ padding: '12px 20px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
        <button onClick={() => setEditingExercise('new')}
          style={{
            width: '100%', padding: '14px', borderRadius: 16, fontWeight: 700, fontSize: 15,
            background: 'var(--primary)', color: '#fff',
          }}>+ Přidat vlastní cvičení</button>
      </div>

      {/* Exercise detail modal */}
      {selectedExercise && (
        <ExerciseModal exercise={selectedExercise} onClose={() => setSelectedExercise(null)} />
      )}

      {/* Edit/Add modal */}
      {editingExercise && (
        <EditExerciseModal
          exercise={editingExercise === 'new' ? undefined : editingExercise}
          onSave={handleSave}
          onCancel={() => setEditingExercise(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px',
        }}>
          <div style={{ background: 'var(--bg)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320 }}>
            <h3 style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Smazat cvičení?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
              Tato akce je nevratná. Cvičení bude odstraněno z knihovny.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface)', fontWeight: 600 }}>
                Zrušit
              </button>
              <button onClick={() => { deleteExercise(deleteConfirm); setDeleteConfirm(null); }}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: '#dc3545', color: '#fff', fontWeight: 700 }}>
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
