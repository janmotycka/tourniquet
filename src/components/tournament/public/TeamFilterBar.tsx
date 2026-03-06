import { useState } from 'react';
import type { Tournament } from '../../../types/tournament.types';
import { useI18n } from '../../../i18n';
import { PublicTeamBadge } from './PublicTeamBadge';

export function TeamFilterBar({ tournament, selectedTeamId, onSelect }: {
  tournament: Tournament;
  selectedTeamId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selectedTeam = selectedTeamId ? tournament.teams.find(tm => tm.id === selectedTeamId) : null;

  const handleSelect = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div style={{ padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'relative', zIndex: 10 }}>
      {/* Trigger tlačítko */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
          border: selectedTeam
            ? `2.5px solid ${selectedTeam.color ?? 'var(--primary)'}`
            : '2px dashed var(--primary)',
          background: selectedTeam
            ? `${selectedTeam.color ?? 'var(--primary)'}18`
            : 'var(--primary-light)',
        }}
      >
        {/* Ikona / badge týmu */}
        {selectedTeam ? (
          <PublicTeamBadge team={selectedTeam} size={16} />
        ) : (
          <span style={{ fontSize: 15, lineHeight: 1 }}>⚽</span>
        )}
        <span style={{
          flex: 1, fontWeight: 700, fontSize: 14,
          color: selectedTeam ? 'var(--text)' : 'var(--primary)',
        }}>
          {selectedTeam ? selectedTeam.name : t('tournament.public.selectTeam')}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: selectedTeam ? (selectedTeam.color ?? 'var(--primary)') : 'var(--primary)',
          transition: 'transform .2s', display: 'inline-block',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▾</span>
      </button>

      {/* Custom dropdown panel */}
      {open && (
        <>
          {/* Backdrop pro zavření */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          />
          <div style={{
            position: 'absolute', top: 'calc(100% - 4px)', left: 16, right: 16,
            background: 'var(--surface)', borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,.18)', border: '1px solid var(--border)',
            zIndex: 11, overflow: 'hidden',
          }}>
            {/* "Všechny týmy" položka */}
            <button
              onClick={() => handleSelect(null)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                background: selectedTeamId === null ? 'var(--primary-light)' : 'transparent',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>⚽</span>
              <span style={{
                flex: 1, fontWeight: selectedTeamId === null ? 700 : 600, fontSize: 14,
                color: selectedTeamId === null ? 'var(--primary)' : 'var(--text)',
              }}>{t('tournament.public.filterAll')}</span>
              {selectedTeamId === null && <span style={{ fontSize: 13, color: 'var(--primary)' }}>✓</span>}
            </button>

            {/* Jednotlivé týmy */}
            {tournament.teams.map((team, idx) => {
              const isActive = selectedTeamId === team.id;
              return (
                <button
                  key={team.id}
                  onClick={() => handleSelect(team.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                    background: isActive ? `${team.color ?? 'var(--primary)'}18` : 'transparent',
                    borderBottom: idx < tournament.teams.length - 1 ? '1px solid var(--border)' : 'none',
                    borderLeft: isActive ? `3px solid ${team.color ?? 'var(--primary)'}` : '3px solid transparent',
                  }}
                >
                  <PublicTeamBadge team={team} size={18} />
                  <span style={{
                    flex: 1, fontWeight: isActive ? 700 : 600, fontSize: 14,
                    color: 'var(--text)',
                  }}>{team.name}</span>
                  {isActive && <span style={{ fontSize: 13, color: team.color ?? 'var(--primary)' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
