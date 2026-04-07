/**
 * ClubSwitcher — dropdown v hlavičce pro přepínání mezi sdílenými kluby.
 *
 * Pokud uživatel je členem 0 klubů → tlačítko "Vytvořit klub" otevře modal.
 * Pokud 1 klub → kompaktní badge s názvem.
 * Pokud 2+ klubů → dropdown menu.
 *
 * Použití: vlož do hlavičky / sidebaru kde je smysluplné měnit aktivní klub.
 */

import { useState, useRef, useEffect } from 'react';
import { useClubsStore } from '../../store/clubs.store';
import { useI18n } from '../../i18n';
import type { Page } from '../../App';
import { CreateClubModal } from './CreateClubModal';

interface Props {
  /** Volitelná navigace (např. po vytvoření klubu otevřít members page) */
  navigate?: (p: Page) => void;
  /** Kompaktní mód (jen ikona, bez textu) */
  compact?: boolean;
}

export function ClubSwitcher({ navigate, compact = false }: Props) {
  const { t } = useI18n();
  const sharedClubs = useClubsStore(s => s.sharedClubs);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const setActiveClubId = useClubsStore(s => s.setActiveClubId);
  const memberOfClubs = useClubsStore(s => s.memberOfClubs);

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeClub = sharedClubs.find(c => c.id === activeClubId);
  const myRole = activeClubId ? memberOfClubs[activeClubId] : null;

  // 0 clubs — visible only if user is signed in and has nothing
  if (sharedClubs.length === 0) {
    return (
      <>
      <button
        onClick={() => setCreateOpen(true)}
        style={{
          padding: compact ? '6px 10px' : '8px 14px',
          borderRadius: 10,
          background: 'var(--surface)',
          border: '1px dashed var(--divider)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
        title={t('clubs.shared.noActiveClub')}
      >
        🏟 {!compact && t('clubs.shared.createPersonalTitle')}
      </button>
      {createOpen && <CreateClubModal onClose={() => setCreateOpen(false)} />}
      </>
    );
  }

  const handlePick = async (clubId: string) => {
    if (clubId !== activeClubId) {
      await setActiveClubId(clubId);
    }
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: compact ? '6px 10px' : '8px 14px',
          borderRadius: 10,
          background: 'var(--surface)',
          border: '1px solid var(--divider)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--text)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: compact ? 140 : 240,
        }}
        title={activeClub?.name || t('clubs.shared.switchClub')}
      >
        {activeClub?.logoBase64 ? (
          <img
            src={activeClub.logoBase64}
            alt=""
            style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }}
          />
        ) : (
          <span style={{
            width: 20, height: 20, borderRadius: 4,
            background: activeClub?.color || '#2E7D32',
            display: 'inline-block',
          }} />
        )}
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {activeClub?.name || '—'}
        </span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
        {myRole === 'owner' && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
            background: '#2E7D32', color: '#fff', marginLeft: 4,
          }}>
            {t('clubs.shared.ownerBadge')}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          minWidth: 240,
          maxHeight: 360,
          overflow: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--divider)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          zIndex: 1000,
        }}>
          {sharedClubs.map(club => {
            const role = memberOfClubs[club.id];
            const isActive = club.id === activeClubId;
            return (
              <button
                key={club.id}
                onClick={() => handlePick(club.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: isActive ? 'var(--surface-var)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: 'var(--text)',
                  textAlign: 'left',
                }}
              >
                {club.logoBase64 ? (
                  <img
                    src={club.logoBase64}
                    alt=""
                    style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: club.color || '#2E7D32',
                    flexShrink: 0,
                  }} />
                )}
                <span style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {club.name}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                  background: role === 'owner' ? '#2E7D32' : 'var(--surface-var)',
                  color: role === 'owner' ? '#fff' : 'var(--text-muted)',
                }}>
                  {role === 'owner' ? t('clubs.shared.ownerBadge')
                    : role === 'coach' ? t('clubs.shared.coachBadge')
                    : t('clubs.shared.viewerBadge')}
                </span>
                {isActive && <span style={{ color: '#2E7D32', fontWeight: 900 }}>✓</span>}
              </button>
            );
          })}
          <div style={{ height: 1, background: 'var(--divider)', margin: '4px 0' }} />
          <button
            onClick={() => { setOpen(false); navigate?.({ name: 'club-members' }); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 12px', border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
              textAlign: 'left',
            }}
          >
            👥 {t('clubs.members.title')}
          </button>
          <button
            onClick={() => { setOpen(false); setCreateOpen(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 12px', border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
              textAlign: 'left',
            }}
          >
            ➕ {t('clubs.shared.createPersonalTitle')}
          </button>
        </div>
      )}
      {createOpen && <CreateClubModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
