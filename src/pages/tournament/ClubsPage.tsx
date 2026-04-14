import { useState, useMemo, useCallback } from 'react';
import type { Page } from '../../App';
import { useClubsStore } from '../../store/clubs.store';
import { useContactsStore } from '../../store/contacts.store';
import { useTournamentStore } from '../../store/tournament.store';
import { useMatchesStore } from '../../store/matches.store';
import { useTrainingsStore } from '../../store/trainings.store';
import { useConfirmStore } from '../../store/confirm.store';
import type { AgeCategory, ClubPlayer } from '../../types/club.types';
import type { Contact } from '../../types/contact.types';
import { PlayerDetailSheet } from '../../components/PlayerDetailSheet';
import { aggregatePlayerStats } from '../../utils/player-stats';
import type { PlayerStats } from '../../utils/player-stats';
import { useI18n } from '../../i18n';

import { ClubForm } from '../../components/clubs/ClubForm';
import { ContactRow } from '../../components/clubs/ContactRow';
import { ContactDetailSheet } from '../../components/clubs/ContactDetailSheet';
import { MyClubSection } from '../../components/clubs/MyClubSection';
import { SeasonAdvanceModal } from '../../components/clubs/SeasonAdvanceModal';
import { PageHeader, Button, Card } from '../../components/ui';
import { spacing, radius, fontSize, fontWeight } from '../../theme/tokens';

interface Props { navigate: (p: Page) => void; }

/**
 * ClubsPage (zjednodušená verze — sustaining mode 2026-04).
 *
 * Jeden aktivní vlastní klub + plochý seznam kontaktů na trenéry jiných
 * klubů. Žádné "soupeřské kluby" jako entity — soupeři se reference-ují
 * jen v turnajích/zápasech (volný text nebo výběr z /clubsCatalog).
 *
 * Kontakty nesou `clubName` jako volný text (ne reference na existující
 * klubový workspace), takže se kontakty dají přidávat pro kterýkoli klub,
 * který trenér potká během sezóny.
 */
export function ClubsPage({ navigate }: Props) {
  const { t } = useI18n();
  const ask = useConfirmStore(s => s.ask);
  const clubs = useClubsStore(s => s.clubs);
  const createClub = useClubsStore(s => s.createClub);
  const updateClub = useClubsStore(s => s.updateClub);
  const deleteClub = useClubsStore(s => s.deleteClub);
  const setAgeCategories = useClubsStore(s => s.setAgeCategories);
  const movePlayerToCategory = useClubsStore(s => s.movePlayerToCategory);

  // Data pro statistiky hráčů
  const tournaments = useTournamentStore(s => s.tournaments);
  const seasonMatches = useMatchesStore(s => s.matches);
  const trainings = useTrainingsStore(s => s.savedTrainings);

  // Contacts
  const contacts = useContactsStore(s => s.contacts);
  const firebaseUid = useTournamentStore(s => s.firebaseUid);
  const createOrUpdateContact = useContactsStore(s => s.createOrUpdateContact);
  const deleteContactStore = useContactsStore(s => s.deleteContact);

  const [showCreate, setShowCreate] = useState(false);
  const [editingClub, setEditingClub] = useState(false);

  // Player detail sheet
  const [selectedPlayer, setSelectedPlayer] = useState<ClubPlayer | null>(null);
  const [, setSelectedPlayerEditMode] = useState(false);

  // Contact detail sheet
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [showContactSheet, setShowContactSheet] = useState(false);

  // Season advance modal
  const [showSeasonAdvance, setShowSeasonAdvance] = useState(false);

  // Můj klub = aktivní workspace (podle ClubSwitcher).
  // Fallback na první klub, pokud activeClubId není nastaven.
  const activeClubId = useClubsStore(s => s.activeClubId);
  const myClub = useMemo(
    () => clubs.find(c => c.id === activeClubId) ?? clubs[0],
    [clubs, activeClubId],
  );

  // Počet aktivních hráčů — tlačítko nové sezóny se ukazuje jen když má klub koho posunout.
  const hasActivePlayers = useMemo(
    () => (myClub?.players ?? []).some(p => p.active),
    [myClub],
  );

  // Statistiky hráčů — memoizované pro celý klub
  const getPlayerStats = useCallback((player: ClubPlayer): PlayerStats | null => {
    if (!myClub) return null;
    return aggregatePlayerStats(player, myClub.id, tournaments, seasonMatches, trainings);
  }, [myClub, tournaments, seasonMatches, trainings]);

  // Player detail handlers
  const handlePlayerTap = useCallback((player: ClubPlayer) => {
    setSelectedPlayer(player);
    setSelectedPlayerEditMode(false);
  }, []);

  const handlePlayerEditFromDetail = useCallback(() => {
    setSelectedPlayerEditMode(true);
    setSelectedPlayer(null);
  }, []);

  // Všechny kontakty — bez rozlišení klubu (flat list). Kontakt má
  // `clubName` jako metadata, ale už nelinkujeme na entity.
  const allContacts = contacts;

  const handleCreate = async (data: { name: string; color: string; logoBase64: string | null; ageCategories: AgeCategory[] }) => {
    try {
      await createClub({ name: data.name, color: data.color, logoBase64: data.logoBase64, ageCategories: data.ageCategories });
    } catch {
      // chyby zpracovává clubs.store přes toasty
    }
    setShowCreate(false);
  };

  const handleEdit = async (data: { name: string; color: string; logoBase64: string | null; ageCategories: AgeCategory[] }) => {
    if (!myClub) return;
    await updateClub(myClub.id, { name: data.name, color: data.color, logoBase64: data.logoBase64 });
    if (data.ageCategories.join(',') !== (myClub.ageCategories ?? []).join(',')) {
      await setAgeCategories(myClub.id, data.ageCategories);
    }
    setEditingClub(false);
  };

  const handleDeleteMyClub = async () => {
    if (!myClub) return;
    const ok = await ask({
      title: t('common.delete'),
      message: t('clubs.deleteConfirm', { name: myClub.name }),
      destructive: true,
    });
    if (ok) {
      await deleteClub(myClub.id);
    }
  };

  const handleOpenContactDetail = (contact: Contact) => {
    setViewingContact(contact);
    setShowContactSheet(true);
  };

  const handleAddContact = () => {
    setViewingContact(null);
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

  // ── Page mode — create nebo edit klubu (místo list content) ─────────────
  if (showCreate) {
    return (
      <ClubForm
        mode="page"
        initial={{ name: '', color: '#E53935', logoBase64: null, ageCategories: [] }}
        onSave={handleCreate}
        onCancel={() => setShowCreate(false)}
        title={t('clubs.createMyClubTitle')}
        t={t}
        showCategories
      />
    );
  }

  if (editingClub && myClub) {
    return (
      <ClubForm
        mode="page"
        initial={{
          name: myClub.name,
          color: myClub.color,
          logoBase64: myClub.logoBase64,
          ageCategories: myClub.ageCategories ?? [],
        }}
        onSave={handleEdit}
        onCancel={() => setEditingClub(false)}
        title={t('clubs.editClub')}
        t={t}
        showCategories
      />
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        title={t('clubs.title')}
        subtitle={t('clubs.moduleDesc')}
        onBack={() => navigate({ name: 'home' })}
        backLabel={t('common.back')}
      />

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: `${spacing.lg}px ${spacing.lg}px ${spacing.xl}px`,
        display: 'flex', flexDirection: 'column', gap: spacing.lg,
      }}>
        {/* ── Můj klub ── */}
        {myClub ? (
          <>
            <MyClubSection
              club={myClub}
              contacts={[]} /* kontakty se nyní zobrazují v samostatné sekci níže */
              onEditClub={() => setEditingClub(true)}
              onDeleteClub={handleDeleteMyClub}
              onContactTap={handleOpenContactDetail}
              onAddContact={handleAddContact}
              onPlayerTap={handlePlayerTap}
              getPlayerStats={getPlayerStats}
              t={t}
            />

            {/* Nová sezóna — bulk posun kategorií */}
            {hasActivePlayers && (
              <Card
                onClick={() => setShowSeasonAdvance(true)}
                padding="md"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: spacing.md }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: radius.md,
                  background: 'var(--primary-light)', color: 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0,
                }}>🎉</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: fontWeight.bold, fontSize: fontSize.base, color: 'var(--text)' }}>
                    {t('clubs.seasonAdvance.button')}
                  </div>
                  <div style={{ fontSize: fontSize.sm, color: 'var(--text-muted)' }}>
                    {t('clubs.seasonAdvance.title')}
                  </div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</span>
              </Card>
            )}

            {/* Pozvat trenéra / členové klubu */}
            <Card
              onClick={() => navigate({ name: 'club-members' })}
              padding="md"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: spacing.md }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: radius.md,
                background: 'var(--primary-light)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>👥</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: fontWeight.bold, fontSize: fontSize.base, color: 'var(--text)' }}>
                  {t('clubs.membersAndInvites')}
                </div>
                <div style={{ fontSize: fontSize.sm, color: 'var(--text-muted)' }}>
                  {t('clubs.membersAndInvitesDesc')}
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</span>
            </Card>
          </>
        ) : (
          <Card
            variant="dashed"
            padding="lg"
            onClick={() => setShowCreate(true)}
            style={{
              background: 'var(--primary-light)',
              borderColor: 'var(--primary)',
              cursor: 'pointer',
              textAlign: 'center',
              padding: spacing.xl,
            }}
          >
            <div style={{
              fontSize: spacing.xxl, lineHeight: 1, marginBottom: spacing.sm,
            }}>
              &#127967;
            </div>
            <div style={{
              fontWeight: fontWeight.bold,
              fontSize: fontSize.md,
              color: 'var(--primary)',
            }}>
              {t('clubs.createMyClub')}
            </div>
            <div style={{
              fontSize: fontSize.sm,
              color: 'var(--text-muted)',
              marginTop: spacing.xs,
              lineHeight: 1.4,
            }}>
              {t('clubs.createMyClubHint')}
            </div>
          </Card>
        )}

        {/* ── Kontakty trenérů ── */}
        <section>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: spacing.sm,
          }}>
            <h2 style={{
              fontSize: fontSize.base,
              fontWeight: fontWeight.bold,
              color: 'var(--text-muted)',
              margin: 0,
            }}>
              👤 {t('clubs.contactsTitle')}
              {allContacts.length > 0 && (
                <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>
                  ({allContacts.length})
                </span>
              )}
            </h2>
            <Button variant="primary" size="sm" onClick={handleAddContact}>
              {t('clubs.addContact')}
            </Button>
          </div>

          {allContacts.length === 0 ? (
            <Card
              variant="dashed"
              padding="lg"
              style={{
                textAlign: 'center',
                fontSize: fontSize.sm,
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              {t('clubs.contactsEmpty')}
            </Card>
          ) : (
            <Card variant="default" padding="none" style={{ padding: `6px ${spacing.md + 2}px` }}>
              {allContacts.map(contact => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  onTap={() => handleOpenContactDetail(contact)}
                />
              ))}
            </Card>
          )}
        </section>
      </div>

      {/* Contact detail sheet */}
      {showContactSheet && (
        <ContactDetailSheet
          contact={viewingContact}
          defaultClubId={null}
          clubs={clubs}
          onSave={handleSaveContact}
          onDelete={handleDeleteContact}
          onClose={() => { setShowContactSheet(false); setViewingContact(null); }}
          t={t}
        />
      )}

      {/* Season advance modal */}
      {showSeasonAdvance && myClub && (
        <SeasonAdvanceModal
          club={myClub}
          onClose={() => setShowSeasonAdvance(false)}
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
            seasonMatches: 0, seasonAvgRating: null,
            seasonAvgEffort: null, seasonAvgTechnique: null, seasonAvgTeamwork: null, seasonAvgBehavior: null,
            trainingsTotal: 0, trainingsPresent: 0, trainingsAbsent: 0, trainingsExcused: 0,
            attendanceRate: null,
            totalGoals: 0, totalMatches: 0,
          }}
          onClose={() => setSelectedPlayer(null)}
          onEdit={handlePlayerEditFromDetail}
          onMoveCategory={async (newCat) => {
            await movePlayerToCategory(myClub.id, selectedPlayer.id, newCat);
            const updated = useClubsStore.getState().clubs
              .find(c => c.id === myClub.id)?.players
              .find(p => p.id === selectedPlayer.id);
            if (updated) setSelectedPlayer(updated);
          }}
        />
      )}
    </div>
  );
}
