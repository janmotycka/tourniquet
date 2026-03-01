import { useState, useRef } from 'react';
import type { Page } from '../../App';
import { useClubsStore } from '../../store/clubs.store';
import { useContactsStore } from '../../store/contacts.store';
import { useTournamentStore } from '../../store/tournament.store';
import type { Club } from '../../types/club.types';
import type { Contact } from '../../types/contact.types';
import { useI18n } from '../../i18n';
import { TEAM_COLORS, colorSwatch } from '../../utils/team-colors';

interface Props { navigate: (p: Page) => void; }

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
  t,
}: {
  initial: { name: string; color: string; logoBase64: string | null };
  onSave: (data: { name: string; color: string; logoBase64: string | null }) => void;
  onCancel: () => void;
  title: string;
  t: (key: string, params?: Record<string, string | number>) => string;
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
      alert(t('clubs.imageError'));
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
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('clubs.logoLabel')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                  {logoLoading ? t('clubs.uploading') : t('clubs.uploadLogo')}
                </button>
                {logoBase64 && (
                  <button
                    onClick={() => setLogoBase64(null)}
                    style={{
                      background: '#FFEBEE', color: '#C62828', fontWeight: 600, fontSize: 13,
                      padding: '8px 14px', borderRadius: 8,
                    }}
                  >
                    {t('clubs.removeLogo')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Název */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('clubs.nameRequired')}</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('clubs.namePlaceholder')}
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
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('clubs.colorLabel')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TEAM_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    ...colorSwatch(c, 36), borderRadius: 10,
                    border: color === c ? '3px solid var(--text)' : '3px solid transparent',
                    outline: color === c ? '2px solid #fff' : 'none',
                    outlineOffset: -4,
                  }}
                />
              ))}
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
            {t('clubs.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Contact row (reused in ClubCard and orphan section) ─────────────────────
function ContactRow({ contact, onTap }: { contact: Contact; onTap: () => void }) {
  return (
    <div
      onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        👤 {contact.name}
      </span>
      {contact.phone && (
        <a
          href={`tel:${contact.phone}`}
          onClick={e => e.stopPropagation()}
          style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', flexShrink: 0 }}
        >
          📞 {contact.phone}
        </a>
      )}
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          onClick={e => e.stopPropagation()}
          style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', flexShrink: 0 }}
        >
          ✉
        </a>
      )}
    </div>
  );
}

// ─── Contact detail / edit bottom-sheet ──────────────────────────────────────
function ContactDetailSheet({
  contact,
  clubs,
  onSave,
  onDelete,
  onClose,
  t,
}: {
  contact: Contact | null; // null = create mode
  clubs: Club[];
  onSave: (data: { name: string; phone: string; email: string; clubId: string | null; clubName: string | null }) => void;
  onDelete: (contactId: string) => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [clubId, setClubId] = useState<string | null>(contact?.clubId ?? null);

  const canSave = name.trim().length > 0 && phone.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const club = clubs.find(c => c.id === clubId);
    onSave({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      clubId: clubId,
      clubName: club?.name ?? null,
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, padding: '0 0 32px',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontWeight: 800, fontSize: 18 }}>{t('clubs.contactDetail')}</h2>
            <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
          </div>

          {/* Jméno */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('clubs.contactName')}</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jan Novák"
              style={{
                width: '100%', padding: '12px', borderRadius: 10, fontSize: 15,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Telefon */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('clubs.contactPhone')}</div>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+420 601 234 567"
              style={{
                width: '100%', padding: '12px', borderRadius: 10, fontSize: 15,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Email */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('clubs.contactEmail')}</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jan@email.cz"
              style={{
                width: '100%', padding: '12px', borderRadius: 10, fontSize: 15,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Klub */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('clubs.assignToClub')}</div>
            <select
              value={clubId ?? ''}
              onChange={e => setClubId(e.target.value || null)}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, fontSize: 15,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            >
              <option value="">{t('clubs.noClub')}</option>
              {clubs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Akce */}
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              background: canSave ? 'var(--primary)' : 'var(--border)',
              color: canSave ? '#fff' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 16, padding: '14px', borderRadius: 14,
            }}
          >
            {t('clubs.save')}
          </button>

          {contact && (
            <button
              onClick={() => {
                if (confirm(t('clubs.deleteContactConfirm', { name: contact.name }))) {
                  onDelete(contact.id);
                }
              }}
              style={{
                background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 14,
                padding: '12px', borderRadius: 12, border: '1.5px solid #FFCDD2',
              }}
            >
              🗑 {t('clubs.deleteContact')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Club card (with contacts) ──────────────────────────────────────────────
function ClubCard({
  club,
  contacts,
  onEdit,
  onDelete,
  onContactTap,
  onAddContact,
}: {
  club: Club;
  contacts: Contact[];
  onEdit: () => void;
  onDelete: () => void;
  onContactTap: (contact: Contact) => void;
  onAddContact: () => void;
}) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16, padding: '14px 16px',
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <div style={colorSwatch(club.color, 10)} />
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

      {/* Contacts section */}
      {(contacts.length > 0) && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 8 }}>
          {contacts.map(contact => (
            <ContactRow key={contact.id} contact={contact} onTap={() => onContactTap(contact)} />
          ))}
        </div>
      )}

      {/* Add contact button */}
      <button
        onClick={onAddContact}
        style={{
          marginTop: contacts.length > 0 ? 4 : 10,
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

// ─── Main ──────────────────────────────────────────────────────────────────────
export function ClubsPage({ navigate }: Props) {
  const { t } = useI18n();
  const clubs = useClubsStore(s => s.clubs);
  const createClub = useClubsStore(s => s.createClub);
  const updateClub = useClubsStore(s => s.updateClub);
  const deleteClub = useClubsStore(s => s.deleteClub);

  // Contacts
  const contacts = useContactsStore(s => s.contacts);
  const firebaseUid = useTournamentStore(s => s.firebaseUid);
  const createOrUpdateContact = useContactsStore(s => s.createOrUpdateContact);
  const deleteContactStore = useContactsStore(s => s.deleteContact);

  const [showCreate, setShowCreate] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);

  // Contact detail sheet
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [showContactSheet, setShowContactSheet] = useState(false);
  const [contactSheetClubId, setContactSheetClubId] = useState<string | null>(null);

  // Helpers
  const contactsForClub = (clubId: string) => contacts.filter(c => c.clubId === clubId);
  const orphanContacts = contacts.filter(c => !c.clubId);

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
    if (confirm(t('clubs.deleteConfirm', { name: club.name }))) {
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
      phone: viewingContact?.phone || data.phone, // match key = original phone
      email: data.email || undefined,
      clubId: data.clubId,
      clubName: data.clubName,
    });
    // If phone changed on existing contact, update with new phone too
    if (viewingContact && data.phone !== viewingContact.phone) {
      await createOrUpdateContact(firebaseUid, {
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        clubId: data.clubId,
        clubName: data.clubName,
      });
      // Delete the old phone entry
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
          <h1 style={{ fontWeight: 800, fontSize: 20 }}>{t('clubs.title')}</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            {t('clubs.subtitle')}
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
          padding: '8px 16px', borderRadius: 10,
        }}>{t('clubs.new')}</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clubs.length === 0 && orphanContacts.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '60px 20px' }}>
            <div style={{ fontSize: 56 }}>🏟</div>
            <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('clubs.empty')}</h2>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 15, lineHeight: 1.5 }}>
              {t('clubs.emptyDesc')}
            </p>
            <button onClick={() => setShowCreate(true)} style={{
              background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 16,
              padding: '14px 32px', borderRadius: 14,
            }}>
              {t('clubs.addFirst')}
            </button>
          </div>
        ) : (
          <>
            {clubs.map(club => (
              <ClubCard
                key={club.id}
                club={club}
                contacts={contactsForClub(club.id)}
                onEdit={() => setEditingClub(club)}
                onDelete={() => handleDelete(club)}
                onContactTap={handleOpenContactDetail}
                onAddContact={() => handleAddContact(club.id)}
              />
            ))}

            {clubs.length > 0 && (
              <button onClick={() => setShowCreate(true)} style={{
                background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 15,
                padding: '14px', borderRadius: 14, border: '2px dashed var(--primary)', opacity: 0.8,
                marginTop: 4,
              }}>
                {t('clubs.addFirst')}
              </button>
            )}

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
          initial={{ name: '', color: '#E53935', logoBase64: null }}
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          title={t('clubs.newClub')}
          t={t}
        />
      )}

      {/* Edit club modal */}
      {editingClub && (
        <ClubForm
          initial={{ name: editingClub.name, color: editingClub.color, logoBase64: editingClub.logoBase64 }}
          onSave={handleEdit}
          onCancel={() => setEditingClub(null)}
          title={t('clubs.editClub')}
          t={t}
        />
      )}

      {/* Contact detail sheet */}
      {showContactSheet && (
        <ContactDetailSheet
          contact={viewingContact}
          clubs={clubs}
          onSave={handleSaveContact}
          onDelete={handleDeleteContact}
          onClose={() => { setShowContactSheet(false); setViewingContact(null); }}
          t={t}
        />
      )}
    </div>
  );
}
