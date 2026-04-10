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
}

export function ClubSwitcher({ navigate }: Props) {
  const { t } = useI18n();
  const clubs = useClubsStore(s => s.clubs);
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

  const activeClub = clubs.find(c => c.id === activeClubId);
  const myRole = activeClubId ? memberOfClubs[activeClubId] : null;

  // 0 clubs — nic nerenderujeme. Přepínač bez klubů nedává smysl a tvorba
  // klubu patří do onboarding wizardu nebo na Clubs stránku, ne na home.
  if (clubs.length === 0) {
    return null;
  }

  const handlePick = async (clubId: string) => {
    if (clubId !== activeClubId) {
      await setActiveClubId(clubId);
    }
    setOpen(false);
  };

  const isSingleClub = clubs.length === 1;

  // Single club — just a clean static row, no dropdown
  if (isSingleClub) {
    return null; // Logo is already shown in the header avatar — no need to repeat
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '8px 14px',
          borderRadius: 10,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--text)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
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
            background: activeClub?.color || 'var(--success)',
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
            background: 'var(--success)', color: '#fff', marginLeft: 4,
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
          {clubs.map(club => {
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
                    background: club.color || 'var(--success)',
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
                  background: role === 'owner' ? 'var(--success)' : 'var(--surface-var)',
                  color: role === 'owner' ? '#fff' : 'var(--text-muted)',
                }}>
                  {role === 'owner' ? t('clubs.shared.ownerBadge')
                    : role === 'coach' ? t('clubs.shared.coachBadge')
                    : t('clubs.shared.viewerBadge')}
                </span>
                {isActive && <span style={{ color: 'var(--success)', fontWeight: 900 }}>✓</span>}
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
