import { useState } from 'react';
import type { Club } from '../../types/club.types';
import type { Contact } from '../../types/contact.types';
import { useConfirmStore } from '../../store/confirm.store';

interface ContactDetailSheetProps {
  contact: Contact | null; // null = create mode
  defaultClubId: string | null;
  clubs: Club[];
  onSave: (data: { name: string; phone: string; email: string; clubId: string | null; clubName: string | null }) => void;
  onDelete: (contactId: string) => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ─── Contact detail / edit bottom-sheet ──────────────────────────────────────
export function ContactDetailSheet({
  contact,
  defaultClubId,
  clubs,
  onSave,
  onDelete,
  onClose,
  t,
}: ContactDetailSheetProps) {
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [clubId, setClubId] = useState<string | null>(contact?.clubId ?? defaultClubId);

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
              placeholder={t('clubs.contactNamePlaceholder')}
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
              placeholder={t('clubs.contactPhonePlaceholder')}
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
              placeholder={t('clubs.contactEmailPlaceholder')}
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
              onClick={async () => {
                const ok = await useConfirmStore.getState().ask({ title: t('common.delete'), message: t('clubs.deleteContactConfirm', { name: contact.name }), destructive: true });
                if (ok) {
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
