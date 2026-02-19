import { useState, useRef } from 'react';
import type { Page } from '../../App';
import { useClubsStore } from '../../store/clubs.store';
import type { Club } from '../../types/club.types';

interface Props { navigate: (p: Page) => void; }

const TEAM_COLORS = [
  '#E53935', '#1E88E5', '#43A047', '#FB8C00',
  '#8E24AA', '#F4511E', '#00ACC1', '#6D4C41',
  '#F06292', '#26A69A', '#7E57C2', '#78909C',
];

// ─── Logo resize helper ────────────────────────────────────────────────────────
async function resizeLogoToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas')); return; }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Club form (create / edit) ────────────────────────────────────────────────
function ClubForm({
  initial,
  onSave,
  onCancel,
  title,
}: {
  initial: { name: string; color: string; logoBase64: string | null };
  onSave: (data: { name: string; color: string; logoBase64: string | null }) => void;
  onCancel: () => void;
  title: string;
}) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [logoBase64, setLogoBase64] = useState<string | null>(initial.logoBase64);
  const [logoLoading, setLogoLoading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoLoading(true);
    try {
      const b64 = await resizeLogoToBase64(file);
      setLogoBase64(b64);
    } catch {
      alert('Nepodařilo se načíst obrázek.');
    } finally {
      setLogoLoading(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  };

  const canSave = name.trim().length >= 2;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, padding: '0 0 32px',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontWeight: 800, fontSize: 18 }}>{title}</h2>
            <button onClick={onCancel} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
          </div>

          {/* Logo */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Logo klubu</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Náhled */}
              <div style={{
                width: 64, height: 64, borderRadius: 14, overflow: 'hidden',
                border: '2px solid var(--border)', flexShrink: 0,
                background: logoBase64 ? 'transparent' : color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {logoBase64
                  ? <img src={logoBase64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 22 }}>🏟</span>
                }
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleLogoChange}
                />
                <button
                  onClick={() => logoRef.current?.click()}
                  disabled={logoLoading}
                  style={{
                    background: 'var(--primary)', color: '#fff', fontWeight: 600, fontSize: 13,
                    padding: '8px 14px', borderRadius: 8,
                  }}
                >
                  {logoLoading ? '⏳ Načítám…' : '📷 Nahrát logo'}
                </button>
                {logoBase64 && (
                  <button
                    onClick={() => setLogoBase64(null)}
                    style={{
                      background: '#FFEBEE', color: '#C62828', fontWeight: 600, fontSize: 13,
                      padding: '8px 14px', borderRadius: 8,
                    }}
                  >
                    🗑 Odstranit logo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Název */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Název klubu *</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="FC Příklad"
              maxLength={40}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, fontSize: 15,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Barva */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Barva klubu</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TEAM_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 36, height: 36, borderRadius: 10, background: c,
                    border: color === c ? '3px solid var(--text)' : '3px solid transparent',
                    outline: color === c ? '2px solid #fff' : 'none',
                    outlineOffset: -4,
                  }}
                />
              ))}
              {/* Custom hex */}
              <label style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ opacity: 0, position: 'absolute' }} />
                <span style={{ fontSize: 18 }}>🎨</span>
              </label>
            </div>
          </div>

          {/* Uložit */}
          <button
            onClick={() => canSave && onSave({ name: name.trim(), color, logoBase64 })}
            disabled={!canSave}
            style={{
              background: canSave ? 'var(--primary)' : 'var(--border)',
              color: canSave ? '#fff' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 16, padding: '14px', borderRadius: 14, marginTop: 4,
            }}
          >
            💾 Uložit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Club card ─────────────────────────────────────────────────────────────────
function ClubCard({ club, onEdit, onDelete }: { club: Club; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    }}>
      {/* Logo nebo barva */}
      <div style={{
        width: 48, height: 48, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
        border: '2px solid var(--border)',
        background: club.logoBase64 ? 'transparent' : club.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {club.logoBase64
          ? <img src={club.logoBase64} alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 20 }}>🏟</span>
        }
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {club.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: club.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{club.color}</span>
        </div>
      </div>

      {/* Akce */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={onEdit}
          style={{
            width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)',
            color: 'var(--primary)', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✏️</button>
        <button
          onClick={onDelete}
          style={{
            width: 36, height: 36, borderRadius: 10, background: '#FFEBEE',
            color: '#C62828', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >🗑</button>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export function ClubsPage({ navigate }: Props) {
  const clubs = useClubsStore(s => s.clubs);
  const createClub = useClubsStore(s => s.createClub);
  const updateClub = useClubsStore(s => s.updateClub);
  const deleteClub = useClubsStore(s => s.deleteClub);

  const [showCreate, setShowCreate] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);

  const handleCreate = (data: { name: string; color: string; logoBase64: string | null }) => {
    createClub({ name: data.name, color: data.color, logoBase64: data.logoBase64 });
    setShowCreate(false);
  };

  const handleEdit = (data: { name: string; color: string; logoBase64: string | null }) => {
    if (!editingClub) return;
    updateClub(editingClub.id, { name: data.name, color: data.color, logoBase64: data.logoBase64 });
    setEditingClub(null);
  };

  const handleDelete = (club: Club) => {
    if (confirm(`Smazat klub "${club.name}"? Tato akce je nevratná.`)) {
      deleteClub(club.id);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        <button onClick={() => navigate({ name: 'tournament-list' })} style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
          fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontWeight: 800, fontSize: 20 }}>🏟 Kluby</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            Uložené kluby pro opakované použití
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
          padding: '8px 16px', borderRadius: 10,
        }}>+ Nový</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clubs.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '60px 20px' }}>
            <div style={{ fontSize: 56 }}>🏟</div>
            <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>Žádné kluby</h2>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 15, lineHeight: 1.5 }}>
              Přidejte klub s logem a barvami. Při vytváření turnaje pak stačí klub vybrat.
            </p>
            <button onClick={() => setShowCreate(true)} style={{
              background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 16,
              padding: '14px 32px', borderRadius: 14,
            }}>
              ➕ Přidat klub
            </button>
          </div>
        ) : (
          <>
            {clubs.map(club => (
              <ClubCard
                key={club.id}
                club={club}
                onEdit={() => setEditingClub(club)}
                onDelete={() => handleDelete(club)}
              />
            ))}
            <button onClick={() => setShowCreate(true)} style={{
              background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 15,
              padding: '14px', borderRadius: 14, border: '2px dashed var(--primary)', opacity: 0.8,
              marginTop: 4,
            }}>
              ➕ Přidat klub
            </button>
          </>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <ClubForm
          initial={{ name: '', color: '#E53935', logoBase64: null }}
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          title="➕ Nový klub"
        />
      )}

      {/* Edit modal */}
      {editingClub && (
        <ClubForm
          initial={{ name: editingClub.name, color: editingClub.color, logoBase64: editingClub.logoBase64 }}
          onSave={handleEdit}
          onCancel={() => setEditingClub(null)}
          title="✏️ Upravit klub"
        />
      )}
    </div>
  );
}
