import { useState, useMemo, useCallback } from 'react';
import type { Page } from '../../App';
import { useClubsStore } from '../../store/clubs.store';
import { useContactsStore } from '../../store/contacts.store';
import { useTournamentStore } from '../../store/tournament.store';
import { useMatchesStore } from '../../store/matches.store';
import { useConfirmStore } from '../../store/confirm.store';
import type { Club, AgeCategory, ClubPlayer } from '../../types/club.types';
import type { Contact } from '../../types/contact.types';
import { PlayerDetailSheet } from '../../components/PlayerDetailSheet';
import { aggregatePlayerStats } from '../../utils/player-stats';
import type { PlayerStats } from '../../utils/player-stats';
import { useI18n } from '../../i18n';

import { ClubForm } from '../../components/clubs/ClubForm';
import { ContactRow } from '../../components/clubs/ContactRow';
import { ContactDetailSheet } from '../../components/clubs/ContactDetailSheet';
import { MyClubSection } from '../../components/clubs/MyClubSection';
import { OpponentClubRow } from '../../components/clubs/OpponentClubRow';

interface Props { navigate: (p: Page) => void; }

// ─── Main ──────────────────────────────────────────────────────────────────────
export function ClubsPage({ navigate }: Props) {
  const { t } = useI18n();
  const ask = useConfirmStore(s => s.ask);
  const clubs = useClubsStore(s => s.clubs);
  const createClub = useClubsStore(s => s.createClub);
  const updateClub = useClubsStore(s => s.updateClub);
  const deleteClub = useClubsStore(s => s.deleteClub);
  const setAgeCategories = useClubsStore(s => s.setAgeCategories);

  // Data pro statistiky hráčů
  const tournaments = useTournamentStore(s => s.tournaments);
  const seasonMatches = useMatchesStore(s => s.matches);

  // Contacts
  const contacts = useContactsStore(s => s.contacts);
  const firebaseUid = useTournamentStore(s => s.firebaseUid);
  const createOrUpdateContact = useContactsStore(s => s.createOrUpdateContact);
  const deleteContactStore = useContactsStore(s => s.deleteContact);

  const [showCreate, setShowCreate] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [createMode, setCreateMode] = useState<'myclub' | 'opponent' | null>(null);

  // Player detail sheet
  const [selectedPlayer, setSelectedPlayer] = useState<ClubPlayer | null>(null);
  const [, setSelectedPlayerEditMode] = useState(false);

  // Contact detail sheet
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [showContactSheet, setShowContactSheet] = useState(false);
  const [contactSheetClubId, setContactSheetClubId] = useState<string | null>(null);

  // Split: první klub s ageCategories.length > 0 je "Můj Klub", zbytek = soupeři
  const myClub = useMemo(() =>
    clubs.find(c => (c.ageCategories ?? []).length > 0),
    [clubs],
  );
  const opponentClubs = useMemo(() =>
    clubs.filter(c => c.id !== myClub?.id),
    [clubs, myClub],
  );

  // Statistiky hráčů — memoizované pro celý klub
  const getPlayerStats = useCallback((player: ClubPlayer): PlayerStats | null => {
    if (!myClub) return null;
    return aggregatePlayerStats(player, myClub.id, tournaments, seasonMatches);
  }, [myClub, tournaments, seasonMatches]);

  // Player detail handlers
  const handlePlayerTap = useCallback((player: ClubPlayer) => {
    setSelectedPlayer(player);
    setSelectedPlayerEditMode(false);
  }, []);

  const handlePlayerEditFromDetail = useCallback(() => {
    setSelectedPlayerEditMode(true);
    setSelectedPlayer(null);
  }, []);

  // Helpers
  const contactsForClub = (clubId: string) => contacts.filter(c => c.clubId === clubId);
  const orphanContacts = contacts.filter(c => !c.clubId);

  const handleCreate = (data: { name: string; color: string; logoBase64: string | null; ageCategories: AgeCategory[] }) => {
    createClub({ name: data.name, color: data.color, logoBase64: data.logoBase64, ageCategories: data.ageCategories });
    setShowCreate(false);
    setCreateMode(null);
  };

  const handleEdit = (data: { name: string; color: string; logoBase64: string | null; ageCategories: AgeCategory[] }) => {
    if (!editingClub) return;
    updateClub(editingClub.id, { name: data.name, color: data.color, logoBase64: data.logoBase64 });
    // Sync age categories separately (triggers player migration if needed)
    if (data.ageCategories.join(',') !== (editingClub.ageCategories ?? []).join(',')) {
      setAgeCategories(editingClub.id, data.ageCategories);
    }
    setEditingClub(null);
  };

  const handleDelete = async (club: Club) => {
    const ok = await ask({ title: t('common.delete'), message: t('clubs.deleteConfirm', { name: club.name }), destructive: true });
    if (ok) {
      deleteClub(club.id);
    }
  };

  const handleOpenContactDetail = (contact: Contact) => {
    setViewingContact(contact);
    setContactSheetClubId(contact.clubId);
    setShowContactSheet(true);
  };

  const handleAddContact = (clubId: string | null) => {
    setViewingContact(null);
    setContactSheetClubId(clubId);
    setShowContactSheet(true);
  };

  const handleSaveContact = async (data: { name: string; phone: string; email: string; clubId: string | null; clubName: string | null }) => {
    if (!firebaseUid) return;
    await createOrUpdateContact(firebaseUid, {
      name: data.name,
      phone: viewingContact?.phone || data.phone,
      email: data.email || undefined,
      clubId: data.clubId,
      clubName: data.clubName,
    });
    if (viewingContact && data.phone !== viewingContact.phone) {
      await createOrUpdateContact(firebaseUid, {
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        clubId: data.clubId,
        clubName: data.clubName,
      });
      await deleteContactStore(firebaseUid, viewingContact.id);
    }
    setShowContactSheet(false);
    setViewingContact(null);
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!firebaseUid) return;
    await deleteContactStore(firebaseUid, contactId);
    setShowContactSheet(false);
    setViewingContact(null);
  };

  const openCreateMyClub = () => {
    setCreateMode('myclub');
    setShowCreate(true);
  };

  const openCreateOpponent = () => {
    setCreateMode('opponent');
    setShowCreate(true);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        <button onClick={() => navigate({ name: 'home' })} aria-label="Back" style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
          fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontWeight: 800, fontSize: 20 }}>{t('clubs.title')}</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            {t('clubs.moduleDesc')}
          </div>
        </div>
        <button onClick={openCreateOpponent} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
          padding: '8px 16px', borderRadius: 10,
        }}>{t('clubs.new')}</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {clubs.length === 0 && orphanContacts.length === 0 ? (
          // Empty state
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '40px 20px' }}>
            <div style={{ fontSize: 56 }}>🏟</div>
            <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('clubs.empty')}</h2>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 15, lineHeight: 1.5 }}>
              {t('clubs.emptyDescNew')}
            </p>
            <button onClick={openCreateMyClub} style={{
              background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 16,
              padding: '14px 32px', borderRadius: 14,
            }}>
              {t('clubs.createMyClub')}
            </button>
            <button onClick={openCreateOpponent} style={{
              background: 'var(--surface-var)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 14,
              padding: '10px 20px', borderRadius: 10, marginTop: -4,
            }}>
              {t('clubs.addFirst')}
            </button>
          </div>
        ) : (
          <>
            {/* ── Můj Klub ── */}
            {myClub ? (
              <MyClubSection
                club={myClub}
                contacts={contactsForClub(myClub.id)}
                onEditClub={() => setEditingClub(myClub)}
                onDeleteClub={() => handleDelete(myClub)}
                onContactTap={handleOpenContactDetail}
                onAddContact={() => handleAddContact(myClub.id)}
                onPlayerTap={handlePlayerTap}
                getPlayerStats={getPlayerStats}
                t={t}
              />
            ) : (
              <button onClick={openCreateMyClub} style={{
                background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 15,
                padding: '14px', borderRadius: 14, border: '2px dashed var(--primary)',
                textAlign: 'center',
              }}>
                🏟 {t('clubs.createMyClub')}
              </button>
            )}

            {/* ── Soupeři ── */}
            {opponentClubs.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {t('clubs.opponents')} ({opponentClubs.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {opponentClubs.map(club => (
                    <OpponentClubRow
                      key={club.id}
                      club={club}
                      contacts={contactsForClub(club.id)}
                      onEdit={() => setEditingClub(club)}
                      onDelete={() => handleDelete(club)}
                      onContactTap={handleOpenContactDetail}
                      onAddContact={() => handleAddContact(club.id)}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Add opponent */}
            <button onClick={openCreateOpponent} style={{
              background: 'var(--surface-var)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 13,
              padding: '12px', borderRadius: 12, border: '1.5px dashed var(--border)',
              marginTop: 4, textAlign: 'center',
            }}>
              ➕ {t('clubs.addOpponent')}
            </button>

            {/* Orphan contacts */}
            {orphanContacts.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  👤 {t('clubs.orphanContacts')}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
                  {t('clubs.orphanContactsDesc')}
                </p>
                <div style={{
                  background: 'var(--surface)', borderRadius: 14, padding: '10px 14px',
                  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                }}>
                  {orphanContacts.map(contact => (
                    <ContactRow key={contact.id} contact={contact} onTap={() => handleOpenContactDetail(contact)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create club modal */}
      {showCreate && (
        <ClubForm
          initial={{ name: '', color: '#E53935', logoBase64: null, ageCategories: [] }}
          onSave={handleCreate}
          onCancel={() => { setShowCreate(false); setCreateMode(null); }}
          title={createMode === 'myclub' ? t('clubs.createMyClubTitle') : t('clubs.newClub')}
          t={t}
          showCategories={createMode === 'myclub'}
        />
      )}

      {/* Edit club modal */}
      {editingClub && (
        <ClubForm
          initial={{
            name: editingClub.name,
            color: editingClub.color,
            logoBase64: editingClub.logoBase64,
            ageCategories: editingClub.ageCategories ?? [],
          }}
          onSave={handleEdit}
          onCancel={() => setEditingClub(null)}
          title={t('clubs.editClub')}
          t={t}
          showCategories={editingClub.id === myClub?.id || (editingClub.ageCategories ?? []).length > 0}
        />
      )}

      {/* Contact detail sheet */}
      {showContactSheet && (
        <ContactDetailSheet
          contact={viewingContact}
          defaultClubId={contactSheetClubId}
          clubs={clubs}
          onSave={handleSaveContact}
          onDelete={handleDeleteContact}
          onClose={() => { setShowContactSheet(false); setViewingContact(null); }}
          t={t}
        />
      )}

      {/* Player detail sheet */}
      {selectedPlayer && myClub && (
        <PlayerDetailSheet
          player={selectedPlayer}
          club={myClub}
          stats={getPlayerStats(selectedPlayer) ?? {
            tournamentGoals: 0, tournamentMatches: 0, tournamentsPlayed: 0,
            seasonGoals: 0, seasonAssists: 0, seasonYellowCards: 0, seasonRedCards: 0,
            seasonMatches: 0, seasonAvgRating: null, totalGoals: 0, totalMatches: 0,
          }}
          onClose={() => setSelectedPlayer(null)}
          onEdit={handlePlayerEditFromDetail}
        />
      )}
    </div>
  );
}
