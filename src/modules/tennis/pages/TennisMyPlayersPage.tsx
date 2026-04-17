/**
 * TennisMyPlayersPage — správa hráčů pro individuálního trenéra / rodiče.
 *
 * Flat list lidí, které uživatel sleduje (dítě, svěřenec, on sám). Žádný
 * klub-scope, žádný roster per kategorie. Primárně:
 *  - Přidat hráče (jméno, rok narození, kategorie, klub za který hraje, vztah)
 *  - Upravit / smazat
 *  - Kliknout → detail (zápasy, statistiky, progress) — MVP: jen list
 */

import { useState, useMemo } from 'react';
import type { Page } from '../../../App';
import { useI18n } from '../../../i18n';
import { useMyPlayersStore } from '../store/myPlayers.store';
import { useConfirmStore } from '../../../store/confirm.store';
import { useToastStore } from '../../../store/toast.store';
import { PageHeader } from '../../../components/ui';
import { AGE_CATEGORIES_BY_SPORT, type AgeCategory } from '../../../types/club.types';
import type { MyPlayer } from '../types/my-player.types';

interface Props { navigate: (p: Page) => void; }

const TENNIS_CATEGORIES = AGE_CATEGORIES_BY_SPORT.tennis;

const RELATION_ICONS: Record<NonNullable<MyPlayer['relation']>, string> = {
  child: '👶',
  student: '🎓',
  self: '👤',
  other: '🤝',
};

export function TennisMyPlayersPage({ navigate }: Props) {
  const { t } = useI18n();
  const players = useMyPlayersStore(s => s.players);
  const createPlayer = useMyPlayersStore(s => s.createPlayer);
  const updatePlayer = useMyPlayersStore(s => s.updatePlayer);
  const deletePlayer = useMyPlayersStore(s => s.deletePlayer);
  const ask = useConfirmStore(s => s.ask);
  const showToast = useToastStore(s => s.show);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MyPlayer | null>(null);

  const sorted = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  const handleAdd = async (data: PlayerFormData) => {
    await createPlayer(data);
    setAdding(false);
    showToast('success', t('tennisIndividual.players.added'));
  };
  const handleEdit = async (data: PlayerFormData) => {
    if (!editing) return;
    await updatePlayer(editing.id, data);
    setEditing(null);
    showToast('success', t('tennisIndividual.players.updated'));
  };
  const handleDelete = async (p: MyPlayer) => {
    const ok = await ask({
      title: t('common.delete'),
      message: t('tennisIndividual.players.deleteConfirm', { name: p.name }),
      destructive: true,
    });
    if (ok) await deletePlayer(p.id);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 100 }}>
      <PageHeader
        title={`👤 ${t('tennisIndividual.players.title')}`}
        subtitle={t('tennisIndividual.players.subtitle')}
        onBack={() => navigate({ name: 'home' })}
      />

      {/* Add / Edit form */}
      {adding && (
        <PlayerForm
          onSave={handleAdd}
          onCancel={() => setAdding(false)}
          t={t}
        />
      )}
      {editing && (
        <PlayerForm
          initial={editing}
          onSave={handleEdit}
          onCancel={() => setEditing(null)}
          t={t}
        />
      )}

      {/* Players list */}
      <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        {sorted.length === 0 && !adding ? (
          <EmptyState onCreate={() => setAdding(true)} t={t} />
        ) : sorted.map(p => (
          <PlayerCard
            key={p.id}
            player={p}
            onOpen={() => navigate({ name: 'tennis-player', playerId: p.id })}
            onEdit={() => setEditing(p)}
            onDelete={() => { void handleDelete(p); }}
            t={t}
          />
        ))}
      </div>

      {/* FAB */}
      {!adding && !editing && (
        <button
          onClick={() => setAdding(true)}
          aria-label={t('tennisIndividual.players.addCta')}
          style={{
            position: 'fixed',
            bottom: 'max(20px, env(safe-area-inset-bottom))',
            right: 20, zIndex: 50,
            padding: '14px 20px', borderRadius: 28,
            background: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 100%)',
            color: '#fff', fontWeight: 800, fontSize: 14,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(74,20,140,.35)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>+</span>
          <span>{t('tennisIndividual.players.addCta')}</span>
        </button>
      )}
    </div>
  );
}

// ─── Player card ────────────────────────────────────────────────────────────
function PlayerCard({ player, onOpen, onEdit, onDelete, t }: {
  player: MyPlayer;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const icon = player.relation ? RELATION_ICONS[player.relation] : '🎾';
  return (
    <div
      onClick={onOpen}
      style={{
        background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
        display: 'flex', gap: 12, alignItems: 'center',
        boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 24,
        background: 'linear-gradient(135deg, #6A1B9A 0%, #9C27B0 100%)',
        color: '#fff', fontSize: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
          {player.name}
        </div>
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
          display: 'flex', gap: 10, flexWrap: 'wrap',
        }}>
          {player.category && <span>{player.category}</span>}
          {player.birthYear && <span>{t('tennis.club.born')} {player.birthYear}</span>}
          {player.currentClub && <span>🏟 {player.currentClub}</span>}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        aria-label={t('common.edit')}
        style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'transparent', color: 'var(--text-muted)',
          border: 'none', cursor: 'pointer',
        }}
      >✏️</button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label={t('common.delete')}
        style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'transparent', color: 'var(--danger)',
          border: 'none', cursor: 'pointer',
        }}
      >🗑</button>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────
function EmptyState({ onCreate, t }: {
  onCreate: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center', gap: 16, minHeight: 300,
    }}>
      <div style={{ fontSize: 56 }}>👤</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{t('tennisIndividual.players.emptyTitle')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, maxWidth: 320, lineHeight: 1.5 }}>
          {t('tennisIndividual.players.emptyDesc')}
        </div>
      </div>
      <button
        onClick={onCreate}
        style={{
          padding: '12px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14,
          background: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 100%)',
          color: '#fff', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(74,20,140,.25)',
        }}
      >
        + {t('tennisIndividual.players.addFirstCta')}
      </button>
    </div>
  );
}

// ─── Player form (inline, adding + editing) ────────────────────────────────
interface PlayerFormData {
  name: string;
  birthYear?: number | null;
  category?: AgeCategory;
  currentClub?: string;
  cztenisId?: string;
  notes?: string;
  relation?: MyPlayer['relation'];
}

function PlayerForm({
  initial, onSave, onCancel, t,
}: {
  initial?: MyPlayer;
  onSave: (data: PlayerFormData) => void | Promise<void>;
  onCancel: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [birthYear, setBirthYear] = useState(initial?.birthYear ? String(initial.birthYear) : '');
  const [category, setCategory] = useState<AgeCategory | undefined>(initial?.category);
  const [currentClub, setCurrentClub] = useState(initial?.currentClub ?? '');
  const [cztenisId, setCztenisId] = useState(initial?.cztenisId ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [relation, setRelation] = useState<MyPlayer['relation']>(initial?.relation ?? 'child');

  const canSave = name.trim().length > 0;

  return (
    <div style={{
      margin: '12px 16px', background: 'var(--surface)', borderRadius: 14,
      padding: '16px', border: '2px solid #6A1B9A',
      display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: '#6A1B9A' }}>
        {initial ? t('tennisIndividual.players.editTitle') : t('tennisIndividual.players.newTitle')}
      </div>

      {/* Relation picker */}
      <div>
        <Label>{t('tennisIndividual.players.relation')}</Label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['child', 'student', 'self', 'other'] as const).map(r => {
            const active = relation === r;
            return (
              <button
                key={r}
                onClick={() => setRelation(r)}
                style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: active ? '#6A1B9A' : 'var(--surface-var)',
                  color: active ? '#fff' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span>{RELATION_ICONS[r]}</span>
                <span>{t(`tennisIndividual.relation.${r}`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Name */}
      <div>
        <Label>{t('tennis.club.playerNamePlaceholder')}</Label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('tennis.club.playerNamePlaceholder')}
          autoFocus
          style={inputStyle}
        />
      </div>

      {/* Birth year + category */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Label>{t('tennis.club.birthYear')}</Label>
          <input
            type="number" min={1950} max={new Date().getFullYear()}
            value={birthYear}
            onChange={e => setBirthYear(e.target.value)}
            placeholder={t('tennis.club.birthYearPlaceholder')}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Label>{t('tennisIndividual.players.category')}</Label>
          <select
            value={category ?? ''}
            onChange={e => setCategory((e.target.value || undefined) as AgeCategory | undefined)}
            style={inputStyle}
          >
            <option value="">—</option>
            {TENNIS_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Current club */}
      <div>
        <Label>{t('tennisIndividual.players.currentClub')}</Label>
        <input
          type="text"
          value={currentClub}
          onChange={e => setCurrentClub(e.target.value)}
          placeholder={t('tennisIndividual.players.currentClubPlaceholder')}
          style={inputStyle}
        />
      </div>

      {/* ČTenis ID */}
      <div>
        <Label>{t('tennisIndividual.players.cztenisId')}</Label>
        <input
          type="text"
          value={cztenisId}
          onChange={e => setCztenisId(e.target.value)}
          placeholder={t('tennisIndividual.players.cztenisIdPlaceholder')}
          style={inputStyle}
        />
      </div>

      {/* Notes */}
      <div>
        <Label>{t('tennisIndividual.players.notes')}</Label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={t('tennisIndividual.players.notesPlaceholder')}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            border: 'none', cursor: 'pointer',
          }}
        >{t('common.cancel')}</button>
        <button
          disabled={!canSave}
          onClick={() => {
            const y = birthYear ? parseInt(birthYear, 10) : undefined;
            void onSave({
              name,
              birthYear: y && !isNaN(y) ? y : null,
              category,
              currentClub: currentClub.trim() || undefined,
              cztenisId: cztenisId.trim() || undefined,
              notes: notes.trim() || undefined,
              relation,
            });
          }}
          style={{
            flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: canSave
              ? 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 100%)'
              : 'var(--surface-var)',
            color: canSave ? '#fff' : 'var(--text-muted)',
            border: 'none', cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? t('common.save') : t('tennisIndividual.players.saveBtn')}
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontSize: 14,
  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
};
