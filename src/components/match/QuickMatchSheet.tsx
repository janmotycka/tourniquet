/**
 * QuickMatchSheet — inline bottom sheet pro vytvoření rychlého zápasu.
 *
 * V Simple módu je tohle hlavní input point pro zápasy. Obsahuje:
 * - Input soupeře
 * - Výběr party (squad) nebo manuální zadání jmen
 * - Checkbox „Uložit jako partu" (pokud roster není ze squadu)
 *
 * Návrh pro scénář McDonald's Cup:
 * - 1. zápas: učitel zapíše 12 jmen, zaškrtne „Uložit jako partu",
 *   dá jméno „3.A" → uloží
 * - 2.–8. zápas: vybere partu „3.A" → roster rovnou nahraný → start
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { useSimpleSquadsStore } from '../../store/simpleSquads.store';
import type { SimpleSquad } from '../../types/simpleSquad.types';

interface Props {
  onClose: () => void;
  onCreate: (opponent: string, roster: string[], squadId?: string) => void;
}

export function QuickMatchSheet({ onClose, onCreate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const allSquads = useSimpleSquadsStore(s => s.squads);
  const createSquad = useSimpleSquadsStore(s => s.createSquad);
  const markUsed = useSimpleSquadsStore(s => s.markUsed);

  const [opponent, setOpponent] = useState('');
  const [rosterText, setRosterText] = useState('');
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [saveAsSquad, setSaveAsSquad] = useState(false);
  const [squadName, setSquadName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const squads = useMemo(() => {
    return allSquads
      .filter(s => s.sport === preferredSport)
      .sort((a, b) => {
        // Nejčastěji-používané nahoře, pak podle lastUsed desc
        const aUse = a.usageCount ?? 0;
        const bUse = b.usageCount ?? 0;
        if (aUse !== bUse) return bUse - aUse;
        return (b.lastUsedAt ?? b.updatedAt ?? '').localeCompare(a.lastUsedAt ?? a.updatedAt ?? '');
      });
  }, [allSquads, preferredSport]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Když vyberu squad → naplní rosterText a nabídne jeho jméno jako default.
  const handlePickSquad = (squad: SimpleSquad) => {
    setSelectedSquadId(squad.id);
    setRosterText(squad.players.join('\n'));
    setSaveAsSquad(false); // už je uložená
  };

  const handleClearSquad = () => {
    setSelectedSquadId(null);
    setRosterText('');
    setSaveAsSquad(false);
  };

  const parsedRoster = () => rosterText
    .split(/\r?\n/)
    .map(n => n.trim())
    .filter(n => n.length > 0);

  const handleStart = () => {
    const roster = parsedRoster();

    // Pokud user chce uložit jako novou partu a má roster + jméno
    let finalSquadId = selectedSquadId ?? undefined;
    if (saveAsSquad && !selectedSquadId && roster.length > 0 && squadName.trim() && user?.uid) {
      const newSquad = createSquad({
        name: squadName.trim(),
        sport: preferredSport,
        players: roster,
      }, user.uid);
      finalSquadId = newSquad.id;
    }

    // Pokud user použil existující squad, markni ho jako použitý (pro řazení)
    if (selectedSquadId) {
      markUsed(selectedSquadId);
    }

    onCreate(opponent, roster, finalSquadId);
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px', borderRadius: 12,
    border: '1.5px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 15, outline: 'none',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'fadeIn .2s ease',
      }}
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, padding: '0 0 24px',
          maxHeight: '92dvh', overflowY: 'auto',
          animation: 'slideUp .25s ease',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 18px 14px',
        }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
            ⚡ {t('match.list.quickMatch')}
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            background: 'var(--primary-light)', borderRadius: 10,
            padding: '10px 12px', fontSize: 12, color: 'var(--primary)',
            lineHeight: 1.45,
          }}>
            💡 {t('match.list.quickMatchHint')}
          </div>

          {/* Soupeř */}
          <div>
            <label htmlFor="quick-opponent" style={labelStyle}>
              {t('match.quickSheet.opponentLabel')}
            </label>
            <input
              id="quick-opponent"
              ref={inputRef}
              type="text"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              placeholder={t('match.quickSheet.opponentPlaceholder')}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {t('match.quickSheet.opponentHint')}
            </div>
          </div>

          {/* Squad picker — pokud jsou */}
          {squads.length > 0 && !selectedSquadId && (
            <div>
              <label style={labelStyle}>
                👥 {t('match.quickSheet.pickSquad')}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {squads.map(squad => (
                  <button
                    key={squad.id}
                    type="button"
                    onClick={() => handlePickSquad(squad)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--surface-var)', border: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>👥</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                        {squad.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {t('match.quickSheet.squadSize', { n: squad.players.length })}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 16, fontWeight: 700 }}>›</span>
                  </button>
                ))}
              </div>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center',
              }}>
                {t('match.quickSheet.orEnterManually')}
              </div>
            </div>
          )}

          {/* Zvolená parta — show name + option to clear */}
          {selectedSquadId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--primary-light)', border: '1.5px solid var(--primary)',
            }}>
              <span style={{ fontSize: 20 }}>✓</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                  {squads.find(s => s.id === selectedSquadId)?.name ?? ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('match.quickSheet.squadActive', { n: parsedRoster().length })}
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearSquad}
                style={{
                  padding: '6px 10px', borderRadius: 8,
                  background: 'var(--surface)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {t('match.quickSheet.changeSquad')}
              </button>
            </div>
          )}

          {/* Roster — textarea (always visible, může být prázdná) */}
          <div>
            <label htmlFor="quick-roster" style={labelStyle}>
              {selectedSquadId ? t('match.quickSheet.rosterEditLabel') : t('match.quickSheet.rosterToggle')}
            </label>
            <textarea
              id="quick-roster"
              value={rosterText}
              onChange={e => setRosterText(e.target.value)}
              placeholder={t('match.quickSheet.rosterPlaceholder')}
              rows={selectedSquadId ? 4 : 5}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', borderRadius: 10,
                border: '1.5px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)',
                fontSize: 14, outline: 'none', resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              {t('match.quickSheet.rosterHint')}
            </div>
          </div>

          {/* Uložit jako partu — jen pokud nemám vybranou a mám roster */}
          {!selectedSquadId && parsedRoster().length > 0 && (
            <div style={{
              background: 'var(--surface-var)', borderRadius: 10, padding: 10,
              border: '1px solid var(--border)',
            }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={saveAsSquad}
                  onChange={e => setSaveAsSquad(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  💾 {t('match.quickSheet.saveAsSquad')}
                </span>
              </label>
              {saveAsSquad && (
                <input
                  type="text"
                  value={squadName}
                  onChange={e => setSquadName(e.target.value)}
                  placeholder={t('match.quickSheet.squadNamePlaceholder')}
                  style={{
                    ...inputStyle,
                    marginTop: 8, padding: '8px 10px', fontSize: 13,
                  }}
                />
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                {t('match.quickSheet.saveAsSquadHint')}
              </div>
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={saveAsSquad && !squadName.trim() && parsedRoster().length > 0}
            style={{
              padding: '14px', borderRadius: 12,
              background: 'var(--primary)', color: '#fff', border: 'none',
              fontWeight: 800, fontSize: 15, cursor: 'pointer',
              marginTop: 4, boxShadow: 'var(--shadow-sm)',
              opacity: (saveAsSquad && !squadName.trim() && parsedRoster().length > 0) ? 0.5 : 1,
            }}
          >
            ⚡ {t('match.quickSheet.startCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
