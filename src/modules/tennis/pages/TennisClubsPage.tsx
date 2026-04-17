/**
 * TennisClubsPage — tenisově-specifická správa klubu.
 *
 * Design záměrně zjednodušený proti fotbalové ClubsPage:
 *  - Jen tenisové věkové kategorie (Minitenis – Dospělí (tenis))
 *  - Hráči bez povinného čísla dresu (tenis používá jméno)
 *  - Žádné fotbalové pozice (brankář/útočník)
 *  - Jednoduchý inline add / edit player flow
 *  - Karta klubu nahoře, roster dole
 */

import { useState, useMemo } from 'react';
import type { Page } from '../../../App';
import { useClubsStore } from '../../../store/clubs.store';
import { useConfirmStore } from '../../../store/confirm.store';
import { useToastStore } from '../../../store/toast.store';
import { useI18n } from '../../../i18n';
import { PageHeader } from '../../../components/ui';
import { ClubForm } from '../../../components/clubs/ClubForm';
import { CreateClubModal } from '../../../components/clubs/CreateClubModal';
import { AGE_CATEGORIES_BY_SPORT, type AgeCategory, type ClubPlayer } from '../../../types/club.types';
import { generateId } from '../../../utils/id';

interface Props { navigate: (p: Page) => void; }

const TENNIS_CATEGORIES = AGE_CATEGORIES_BY_SPORT.tennis;

export function TennisClubsPage({ navigate }: Props) {
  const { t } = useI18n();
  const allClubs = useClubsStore(s => s.clubs);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const updateClub = useClubsStore(s => s.updateClub);
  const setAgeCategories = useClubsStore(s => s.setAgeCategories);
  const deleteClub = useClubsStore(s => s.deleteClub);
  const ask = useConfirmStore(s => s.ask);
  const showToast = useToastStore(s => s.show);

  const tennisClubs = useMemo(
    () => allClubs.filter(c => (c.sport ?? 'football') === 'tennis'),
    [allClubs],
  );
  const myClub = tennisClubs.find(c => c.id === activeClubId) ?? tennisClubs[0];

  const [editingClub, setEditingClub] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<ClubPlayer | null>(null);

  // ─── No tennis club yet → prompt to create ────────────────────────────────
  if (tennisClubs.length === 0 && !showCreate) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <PageHeader title={t('tennis.club.title')} onBack={() => navigate({ name: 'home' })} />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 40, textAlign: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 56 }}>🎾</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{t('tennis.club.noneTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.5 }}>
            {t('tennis.club.noneDesc')}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '12px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14,
              background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
              color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(21,101,192,.25)',
            }}
          >
            + {t('tennis.club.createCta')}
          </button>
        </div>
      </div>
    );
  }

  if (showCreate) {
    return <CreateClubModal onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />;
  }

  if (!myClub) return null;

  // ─── Editing club meta (ClubForm as page) ─────────────────────────────────
  if (editingClub) {
    return (
      <ClubForm
        mode="page"
        initial={{
          name: myClub.name,
          color: myClub.color,
          logoBase64: myClub.logoBase64,
          ageCategories: myClub.ageCategories ?? [],
          sport: 'tennis',
        }}
        onSave={async (data) => {
          await updateClub(myClub.id, { name: data.name, color: data.color, logoBase64: data.logoBase64 });
          if (data.ageCategories.join(',') !== (myClub.ageCategories ?? []).join(',')) {
            await setAgeCategories(myClub.id, data.ageCategories);
          }
          setEditingClub(false);
        }}
        onCancel={() => setEditingClub(false)}
        title={t('tennis.club.editClub')}
        t={t}
        showCategories
      />
    );
  }

  // ─── Player CRUD handlers ─────────────────────────────────────────────────
  const handleAddPlayer = async (data: { name: string; ageCategory: AgeCategory; birthYear?: number | null }) => {
    const player: ClubPlayer = {
      id: generateId(),
      name: data.name.trim(),
      jerseyNumber: 0,  // tennis nepoužívá čísla
      birthYear: data.birthYear ?? null,
      ageCategory: data.ageCategory,
      active: true,
    };
    const updatedPlayers = [...myClub.players, player];
    await updateClub(myClub.id, { players: updatedPlayers });
    setAddingPlayer(false);
    showToast('success', t('tennis.club.playerAdded'));
  };

  const handleEditPlayer = async (data: { name: string; ageCategory: AgeCategory; birthYear?: number | null }) => {
    if (!editingPlayer) return;
    const updatedPlayers = myClub.players.map(p =>
      p.id === editingPlayer.id
        ? { ...p, name: data.name.trim(), ageCategory: data.ageCategory, birthYear: data.birthYear ?? null }
        : p,
    );
    await updateClub(myClub.id, { players: updatedPlayers });
    setEditingPlayer(null);
    showToast('success', t('tennis.club.playerUpdated'));
  };

  const handleDeletePlayer = async (p: ClubPlayer) => {
    const ok = await ask({
      title: t('common.delete'),
      message: t('tennis.club.deletePlayerConfirm', { name: p.name }),
      destructive: true,
    });
    if (ok) {
      const updatedPlayers = myClub.players.filter(x => x.id !== p.id);
      await updateClub(myClub.id, { players: updatedPlayers });
    }
  };

  const handleDeleteClub = async () => {
    const ok = await ask({
      title: t('common.delete'),
      message: t('clubs.deleteConfirm', { name: myClub.name }),
      destructive: true,
    });
    if (ok) await deleteClub(myClub.id);
  };

  // Group players by category (jen pro tenisové kategorie)
  const activeCategories = myClub.ageCategories && myClub.ageCategories.length > 0
    ? myClub.ageCategories
    : TENNIS_CATEGORIES;
  const playersByCategory = useMemo(() => {
    const map = new Map<AgeCategory, ClubPlayer[]>();
    for (const cat of activeCategories) map.set(cat, []);
    for (const p of myClub.players) {
      if (!p.active) continue;
      if (!map.has(p.ageCategory)) map.set(p.ageCategory, []);
      map.get(p.ageCategory)!.push(p);
    }
    // Abecední řazení v rámci kategorie
    for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [myClub.players, activeCategories]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 40 }}>
      <PageHeader
        title={t('tennis.club.title')}
        onBack={() => navigate({ name: 'home' })}
      />

      {/* Club card */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{
          background: 'var(--surface)', borderRadius: 16, padding: '16px',
          display: 'flex', gap: 14, alignItems: 'center',
          boxShadow: 'var(--shadow-sm)',
        }}>
          {myClub.logoBase64 ? (
            <img src={myClub.logoBase64} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: 12, background: myClub.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 24,
            }}>🎾</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>{myClub.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              🎾 {myClub.players.filter(p => p.active).length} {t('tennis.club.playersCount')} · {(myClub.ageCategories ?? []).length} {t('tennis.club.categoriesCount')}
            </div>
          </div>
          <button
            onClick={() => setEditingClub(true)}
            style={{
              padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              background: 'var(--surface-var)', color: 'var(--primary)',
              border: 'none', cursor: 'pointer',
            }}
          >
            ✏️
          </button>
        </div>
      </div>

      {/* Add player inline form */}
      {addingPlayer && (
        <PlayerForm
          activeCategories={activeCategories}
          onSave={handleAddPlayer}
          onCancel={() => setAddingPlayer(false)}
          t={t}
        />
      )}
      {editingPlayer && (
        <PlayerForm
          activeCategories={activeCategories}
          initial={editingPlayer}
          onSave={handleEditPlayer}
          onCancel={() => setEditingPlayer(null)}
          t={t}
        />
      )}

      {/* Roster by category */}
      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {activeCategories.map(cat => {
          const players = playersByCategory.get(cat) ?? [];
          return (
            <section key={cat}>
              <h3 style={{
                fontSize: 12, fontWeight: 800, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px',
              }}>
                {cat} · {players.length}
              </h3>
              <div style={{
                background: 'var(--surface)', borderRadius: 12,
                overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
              }}>
                {players.length === 0 ? (
                  <div style={{
                    padding: '14px 16px', fontSize: 12, color: 'var(--text-muted)',
                    fontStyle: 'italic',
                  }}>
                    {t('tennis.club.noPlayersInCategory')}
                  </div>
                ) : players.map((p, idx) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px',
                      borderBottom: idx < players.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: 'var(--primary-light)', color: 'var(--primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 14, flexShrink: 0,
                    }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600, fontSize: 14, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {p.name}
                      </div>
                      {p.birthYear && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {t('tennis.club.born')} {p.birthYear}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingPlayer(p)}
                      aria-label={t('tennis.club.editPlayer')}
                      style={{
                        width: 30, height: 30, borderRadius: 8,
                        background: 'transparent', color: 'var(--text-muted)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => { void handleDeletePlayer(p); }}
                      aria-label={t('common.delete')}
                      style={{
                        width: 30, height: 30, borderRadius: 8,
                        background: 'transparent', color: 'var(--danger)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* FAB add player */}
      {!addingPlayer && !editingPlayer && (
        <button
          onClick={() => setAddingPlayer(true)}
          aria-label={t('tennis.club.addPlayer')}
          style={{
            position: 'fixed',
            bottom: 'max(20px, env(safe-area-inset-bottom))',
            right: 20, zIndex: 50,
            padding: '14px 20px', borderRadius: 28,
            background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
            color: '#fff', fontWeight: 800, fontSize: 14,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(21,101,192,.35)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>+</span>
          <span>{t('tennis.club.addPlayer')}</span>
        </button>
      )}

      {/* Delete club section */}
      <div style={{ padding: '0 16px 16px' }}>
        <button
          onClick={() => { void handleDeleteClub(); }}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: 'transparent', color: 'var(--danger)',
            border: '1px solid var(--danger)', cursor: 'pointer',
          }}
        >
          🗑 {t('tennis.club.deleteClub')}
        </button>
      </div>
    </div>
  );
}

// ─── Player form (inline) ──────────────────────────────────────────────────
function PlayerForm({
  activeCategories, initial, onSave, onCancel, t,
}: {
  activeCategories: AgeCategory[];
  initial?: ClubPlayer;
  onSave: (data: { name: string; ageCategory: AgeCategory; birthYear?: number | null }) => void | Promise<void>;
  onCancel: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [ageCategory, setAgeCategory] = useState<AgeCategory>(
    initial?.ageCategory ?? activeCategories[0] ?? 'Dospělí (tenis)',
  );
  const [birthYear, setBirthYear] = useState<string>(initial?.birthYear ? String(initial.birthYear) : '');
  const canSave = name.trim().length > 0;

  return (
    <div style={{
      margin: '4px 16px 12px',
      background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
      border: '2px solid var(--primary)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--primary)' }}>
        {initial ? t('tennis.club.editPlayerTitle') : t('tennis.club.addPlayerTitle')}
      </div>

      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t('tennis.club.playerNamePlaceholder')}
        autoFocus
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 10,
          border: '1.5px solid var(--border)', fontSize: 14,
          background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
            {t('tennis.club.ageCategory')}
          </div>
          <select
            value={ageCategory}
            onChange={e => setAgeCategory(e.target.value as AgeCategory)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1.5px solid var(--border)', fontSize: 13,
              background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            }}
          >
            {activeCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
            {t('tennis.club.birthYear')}
          </div>
          <input
            type="number"
            min={1950} max={new Date().getFullYear()}
            value={birthYear}
            onChange={e => setBirthYear(e.target.value)}
            placeholder={t('tennis.club.birthYearPlaceholder')}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1.5px solid var(--border)', fontSize: 13,
              background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            border: 'none', cursor: 'pointer',
          }}
        >
          {t('common.cancel')}
        </button>
        <button
          disabled={!canSave}
          onClick={() => {
            const y = birthYear ? parseInt(birthYear, 10) : undefined;
            void onSave({ name, ageCategory, birthYear: y && !isNaN(y) ? y : null });
          }}
          style={{
            flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: canSave
              ? 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)'
              : 'var(--surface-var)',
            color: canSave ? '#fff' : 'var(--text-muted)',
            border: 'none', cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? t('common.save') : t('tennis.club.addPlayer')}
        </button>
      </div>
    </div>
  );
}
