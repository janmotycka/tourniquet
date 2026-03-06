import { useState, useMemo } from 'react';
import type { Club, AgeCategory, ClubPlayer } from '../../types/club.types';
import type { Contact } from '../../types/contact.types';
import type { PlayerStats } from '../../utils/player-stats';
import { useClubsStore } from '../../store/clubs.store';
import { PlayerRosterEditor } from '../PlayerRosterEditor';
import { colorSwatch } from '../../utils/team-colors';
import { ContactRow } from './ContactRow';

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
  const updatePlayer = useClubsStore(s => s.updatePlayer);
  const removePlayer = useClubsStore(s => s.removePlayer);
  const [activeTab, setActiveTab] = useState<AgeCategory | null>(
    club.ageCategories.length > 0 ? club.ageCategories[0] : null,
  );

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

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 18, padding: '16px',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)',
      border: '2px solid var(--primary)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
          border: '2px solid var(--border)',
          background: club.logoBase64 ? 'transparent' : club.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {club.logoBase64
            ? <img src={club.logoBase64} alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 22 }}>🏟</span>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {club.name}
            </span>
            <span style={{
              background: 'var(--primary)', color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 6, flexShrink: 0,
            }}>
              {t('clubs.myClubBadge')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <div style={colorSwatch(club.color, 10)} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {totalPlayers} {t('clubs.playersLabel')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onEditClub}
            style={{
              width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)',
              color: 'var(--primary)', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✏️</button>
          <button
            onClick={onDeleteClub}
            style={{
              width: 36, height: 36, borderRadius: 10, background: '#FFEBEE',
              color: '#C62828', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >🗑</button>
        </div>
      </div>

      {/* Category tabs — scrollovatelné horizontálně, ale bez nutnosti scrollovat */}
      {club.ageCategories.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 14,
          paddingBottom: 8, borderBottom: '1px solid var(--border)',
        }}>
          {club.ageCategories.map(cat => {
            const isActive = activeTab === cat;
            const count = (playersByCategory[cat] ?? []).filter(p => p.active).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: isActive ? 'var(--primary)' : 'var(--surface-var)',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Player roster for active tab */}
      {activeTab && club.ageCategories.includes(activeTab) && (
        <div style={{ marginTop: 8 }}>
          <PlayerRosterEditor
            players={playersByCategory[activeTab] ?? []}
            ageCategory={activeTab}
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
          marginTop: 12, padding: '14px', borderRadius: 10,
          background: 'var(--primary-light)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
            {t('clubs.noCategoriesHint')}
          </div>
          <button
            onClick={onEditClub}
            style={{
              marginTop: 8, padding: '8px 16px', borderRadius: 8,
              background: 'var(--primary)', color: '#fff', fontWeight: 600, fontSize: 13,
            }}
          >
            {t('clubs.setupCategories')}
          </button>
        </div>
      )}

      {/* Contacts section */}
      {contacts.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
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
          marginTop: contacts.length > 0 ? 4 : 12,
          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: 'var(--primary-light)', color: 'var(--primary)',
          border: 'none', cursor: 'pointer',
        }}
      >
        + 👤
      </button>
    </div>
  );
}
