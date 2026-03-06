import type { Contact } from '../../types/contact.types';

interface ContactRowProps {
  contact: Contact;
  onTap: () => void;
}

// ─── Contact row (reused in ClubCard and orphan section) ─────────────────────
export function ContactRow({ contact, onTap }: ContactRowProps) {
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
