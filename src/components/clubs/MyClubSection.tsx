import { useState, useMemo, lazy, Suspense } from 'react';
import type { Club, AgeCategory, ClubPlayer } from '../../types/club.types';
import type { Contact } from '../../types/contact.types';
import type { PlayerStats } from '../../utils/player-stats';
import { useClubsStore } from '../../store/clubs.store';
import { useToastStore } from '../../store/toast.store';
import { PlayerRosterEditor } from '../PlayerRosterEditor';
import { colorSwatch } from '../../utils/team-colors';
import { ContactRow } from './ContactRow';
import { spacing, radius, fontSize, fontWeight } from '../../theme/tokens';

// Lazy: xlsx (~250 kB) se načte až v okamžiku, kdy uživatel klikne na Import
const ImportPlayersModal = lazy(() =>
  import('./ImportPlayersModal').then(m => ({ default: m.ImportPlayersModal })),
);

interface MyClubSectionProps {
  club: Club;
  contacts: Contact[];
  onEditClub: () => void;
  onDeleteClub: () => void;
  onContactTap: (contact: Contact) => void;
  onAddContact: () => void;
  onPlayerTap: (player: ClubPlayer) => void;
  getPlayerStats: (player: ClubPlayer) => PlayerStats | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ─── My Club section (main club with roster tabs) ────────────────────────────
export function MyClubSection({
  club,
  contacts,
  onEditClub,
  onDeleteClub,
  onContactTap,
  onAddContact,
  onPlayerTap,
  getPlayerStats,
  t,
}: MyClubSectionProps) {
  const addPlayer = useClubsStore(s => s.addPlayer);
  const addPlayersBulk = useClubsStore(s => s.addPlayersBulk);
  const updatePlayer = useClubsStore(s => s.updatePlayer);
  const removePlayer = useClubsStore(s => s.removePlayer);
  const [activeTab, setActiveTab] = useState<AgeCategory | null>(null); // null = dashboard view
  const [importOpen, setImportOpen] = useState(false);

  const playersByCategory = useMemo(() => {
    const map = {} as Record<AgeCategory, typeof club.players>;
    for (const cat of club.ageCategories) {
      map[cat] = (club.players ?? []).filter(p => p.ageCategory === cat);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- club.players & club.ageCategories are the relevant parts of club
  }, [club.players, club.ageCategories]);

  // Celkový počet aktivních hráčů
  const totalPlayers = (club.players ?? []).filter(p => p.active).length;

  /** Action icon button style */
  const actionBtn = (bg: string, fg: string): React.CSSProperties => ({
    width: 36, height: 36, borderRadius: radius.md,
    background: bg, color: fg, fontSize: fontSize.lg - 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', cursor: 'pointer', flexShrink: 0,
  });

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: radius.xl + 4,
      padding: spacing.lg,
      boxShadow: 'var(--shadow-sm)',
      border: `2px solid ${club.color}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
        <div style={{
          width: 52, height: 52, borderRadius: radius.xl, overflow: 'hidden', flexShrink: 0,
          border: '2px solid var(--border)',
          background: club.logoBase64 ? 'transparent' : club.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {club.logoBase64
            ? <img src={club.logoBase64} alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: fontSize.xl }}>&#127967;</span>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs + 2 }}>
            <span style={{
              fontWeight: fontWeight.extrabold, fontSize: fontSize.md + 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {club.name}
            </span>
            <span style={{
              background: club.color, color: '#fff',
              fontSize: fontSize.xs - 1, fontWeight: fontWeight.bold,
              padding: '2px 8px', borderRadius: radius.sm - 2, flexShrink: 0,
              letterSpacing: 0.3,
            }}>
              {t('clubs.myClubBadge')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginTop: 3 }}>
            <div style={colorSwatch(club.color, 10)} />
            <span style={{ fontSize: fontSize.sm, color: 'var(--text-muted)' }}>
              {totalPlayers} {t('clubs.playersLabel')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: spacing.xs + 2, flexShrink: 0 }}>
          <button
            onClick={() => setImportOpen(true)}
            title={t('clubs.import.title')}
            style={actionBtn('var(--primary-light)', 'var(--primary)')}
          >&#128229;</button>
          <button
            onClick={onEditClub}
            style={actionBtn('var(--primary-light)', 'var(--primary)')}
          >&#9998;&#65039;</button>
          <button
            onClick={onDeleteClub}
            style={actionBtn('var(--danger-light)', 'var(--danger)')}
          >&#128465;</button>
        </div>
      </div>

      {/* Category tabs */}
      {/* Dashboard view (no category selected) */}
      {!activeTab && club.ageCategories.length > 0 && (
        <div style={{ marginTop: spacing.lg, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {/* Category cards */}
          <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Soupisky
          </div>
          {club.ageCategories.map(cat => {
            const count = (playersByCategory[cat] ?? []).filter(p => p.active).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: `${spacing.md}px ${spacing.lg}px`,
                  borderRadius: radius.lg, background: 'var(--bg)',
                  border: '1.5px solid var(--border)', cursor: 'pointer',
                  textAlign: 'left', transition: 'all .15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                  <span style={{
                    fontWeight: fontWeight.extrabold, fontSize: fontSize.lg,
                    color: club.color, minWidth: 40,
                  }}>{cat}</span>
                  <span style={{ fontSize: fontSize.base, color: 'var(--text)' }}>
                    {count} {count === 1 ? 'hráč' : count >= 2 && count <= 4 ? 'hráči' : 'hráčů'}
                  </span>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: fontSize.lg }}>→</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Category roster view (when a category is selected) */}
      {activeTab && club.ageCategories.includes(activeTab) && (
        <div style={{ marginTop: spacing.md }}>
          {/* Back + category tabs */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: spacing.sm,
            marginBottom: spacing.sm, paddingBottom: spacing.sm,
            borderBottom: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setActiveTab(null)}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`, borderRadius: radius.sm,
                background: 'var(--surface-var)', color: 'var(--text-muted)',
                fontSize: fontSize.sm, fontWeight: fontWeight.bold,
                border: 'none', cursor: 'pointer',
              }}
            >← Zpět</button>
            {club.ageCategories.map(cat => {
              const isActive = activeTab === cat;
              const count = (playersByCategory[cat] ?? []).filter(p => p.active).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  style={{
                    padding: `${spacing.xs + 2}px ${spacing.md}px`,
                    borderRadius: radius.sm, fontSize: fontSize.sm,
                    fontWeight: fontWeight.medium,
                    background: isActive ? club.color : 'var(--surface-var)',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
          <PlayerRosterEditor
            players={playersByCategory[activeTab] ?? []}
            ageCategory={activeTab}
            clubColor={club.color}
            onAdd={(p) => addPlayer(club.id, p)}
            onRemove={(pid) => removePlayer(club.id, pid)}
            onUpdate={(pid, patch) => updatePlayer(club.id, pid, patch)}
            onPlayerTap={onPlayerTap}
            getPlayerStats={getPlayerStats}
          />
        </div>
      )}

      {/* No categories hint */}
      {club.ageCategories.length === 0 && (
        <div style={{
          marginTop: spacing.md, padding: spacing.lg,
          borderRadius: radius.lg, background: 'var(--primary-light)',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: fontSize.sm + 1, color: 'var(--primary)',
            fontWeight: fontWeight.medium,
          }}>
            {t('clubs.noCategoriesHint')}
          </div>
          <button
            onClick={onEditClub}
            style={{
              marginTop: spacing.sm, padding: `${spacing.sm}px ${spacing.lg}px`,
              borderRadius: radius.sm, border: 'none', cursor: 'pointer',
              background: 'var(--primary)', color: '#fff',
              fontWeight: fontWeight.medium, fontSize: fontSize.sm + 1,
            }}
          >
            {t('clubs.setupCategories')}
          </button>
        </div>
      )}

      {/* Contacts section */}
      {contacts.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--border)',
          marginTop: spacing.md, paddingTop: spacing.sm,
        }}>
          <div style={{
            fontSize: fontSize.sm, fontWeight: fontWeight.medium,
            color: 'var(--text-muted)', marginBottom: spacing.xs,
          }}>
            {t('clubs.contacts')}
          </div>
          {contacts.map(contact => (
            <ContactRow key={contact.id} contact={contact} onTap={() => onContactTap(contact)} />
          ))}
        </div>
      )}

      <button
        onClick={onAddContact}
        style={{
          marginTop: contacts.length > 0 ? spacing.xs : spacing.md,
          padding: `${spacing.xs}px 10px`, borderRadius: radius.sm,
          fontSize: fontSize.sm, fontWeight: fontWeight.medium,
          background: 'var(--primary-light)', color: 'var(--primary)',
          border: 'none', cursor: 'pointer',
        }}
      >
        + &#128100;
      </button>

      {/* Import modal */}
      {importOpen && (
        <Suspense fallback={null}>
          <ImportPlayersModal
            club={club}
            onClose={() => setImportOpen(false)}
            onImport={async (players) => {
              await addPlayersBulk(club.id, players);
              useToastStore.getState().show('success', `Naimportováno ${players.length} hráčů`);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
