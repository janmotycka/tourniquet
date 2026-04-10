import { useState } from 'react';
import type { Club } from '../../types/club.types';
import type { Contact } from '../../types/contact.types';
import { ContactRow } from './ContactRow';

interface OpponentClubRowProps {
  club: Club;
  contacts: Contact[];
  onEdit: () => void;
  onDelete: () => void;
  onContactTap: (contact: Contact) => void;
  onAddContact: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ─── Opponent Club row (compact, expandable) ────────────────────────────────
export function OpponentClubRow({
  club,
  contacts,
  onEdit,
  onDelete,
  onContactTap,
  onAddContact,
  t,
}: OpponentClubRowProps) {
  const [expanded, setExpanded] = useState(false);

  // Hlavní kontakt (první)
  const mainContact = contacts[0] ?? null;

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14,
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* Hlavní řádek — kliknutím expanduje */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          cursor: 'pointer',
        }}
      >
        {/* Logo/barva — menší */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
          border: '1.5px solid var(--border)',
          background: club.logoBase64 ? 'transparent' : club.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {club.logoBase64
            ? <img src={club.logoBase64} alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 15 }}>🏟</span>
          }
        </div>

        {/* Název + kontakt inline */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 14, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {club.name}
          </div>
          {mainContact ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              👤 {mainContact.name}{mainContact.phone ? ` · ${mainContact.phone}` : ''}
              {contacts.length > 1 && (
                <span style={{ color: 'var(--primary)', fontWeight: 600 }}> +{contacts.length - 1}</span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, fontStyle: 'italic' }}>
              {t('clubs.noContact')}
            </div>
          )}
        </div>

        {/* Telefon shortcut + šipka */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {mainContact?.phone && (
            <a
              href={`tel:${mainContact.phone}`}
              onClick={e => e.stopPropagation()}
              style={{
                width: 32, height: 32, borderRadius: 8, background: 'var(--success-light)',
                color: 'var(--success)', fontSize: 15,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none',
              }}
            >📞</a>
          )}
          <span style={{
            fontSize: 12, color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform .2s',
          }}>▼</span>
        </div>
      </div>

      {/* Expandovaný detail */}
      {expanded && (
        <div style={{
          padding: '0 12px 10px',
          borderTop: '1px solid var(--border)',
        }}>
          {/* Kontakty */}
          {contacts.length > 0 && (
            <div style={{ paddingTop: 8 }}>
              {contacts.map(contact => (
                <ContactRow key={contact.id} contact={contact} onTap={() => onContactTap(contact)} />
              ))}
            </div>
          )}

          {/* Akce */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              onClick={onAddContact}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'var(--primary-light)', color: 'var(--primary)',
                border: 'none', cursor: 'pointer',
              }}
            >
              + {t('clubs.addContactShort')}
            </button>
            <button
              onClick={onEdit}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'var(--surface-var)', color: 'var(--text-muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              ✏️ {t('clubs.editShort')}
            </button>
            <button
              onClick={onDelete}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'var(--danger-light)', color: 'var(--danger)',
                border: 'none', cursor: 'pointer',
              }}
            >
              🗑 {t('common.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
