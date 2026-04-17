/**
 * TennisEditMatchSheet — tenisově-specifická editace zápasu.
 *
 * Žádné fotbalové pole (poločasy, formát X+1, délka poločasu, kategorie format).
 * Jen: soupeř, datum/čas, kde, soutěž, věková kategorie, ČTenis URL.
 */

import { useState, useEffect } from 'react';
import type { SeasonMatch } from '../../../types/match.types';
import type { AgeCategory } from '../../../types/club.types';
import { AGE_CATEGORIES_BY_SPORT } from '../../../types/club.types';
import { useMatchesStore } from '../../../store/matches.store';
import { useClubsStore } from '../../../store/clubs.store';
import { useToastStore } from '../../../store/toast.store';
import { useI18n } from '../../../i18n';

interface Props {
  match: SeasonMatch;
  onClose: () => void;
}

export function TennisEditMatchSheet({ match, onClose }: Props) {
  const { t } = useI18n();
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const clubs = useClubsStore(s => s.clubs);
  const matchClub = clubs.find(c => c.id === match.clubId);
  // Kategorie nabízej podle klubu; pokud klub nic nemá, ukaž všechny tenisové.
  const clubCategories = matchClub?.ageCategories ?? [];
  const categoriesForPicker: AgeCategory[] = clubCategories.length > 0
    ? clubCategories
    : AGE_CATEGORIES_BY_SPORT.tennis;

  const [opponent, setOpponent] = useState(match.opponent);
  const [venue, setVenue] = useState(match.venue ?? '');
  const [competition, setCompetition] = useState(match.competition);
  const [isHome, setIsHome] = useState(match.isHome);
  const [date, setDate] = useState(match.date);
  const [kickoffTime, setKickoffTime] = useState(match.kickoffTime);
  const [ageCategory, setAgeCategory] = useState<string>(match.ageCategory ?? '');
  const [officialResultsUrl, setOfficialResultsUrl] = useState(match.officialResultsUrl ?? '');

  // Esc → close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    updateMatch(match.id, {
      opponent: opponent.trim() || match.opponent,
      venue: venue.trim() || undefined,
      competition: competition.trim(),
      isHome,
      date,
      kickoffTime,
      ageCategory: ageCategory || undefined,
      officialResultsUrl: officialResultsUrl.trim() || undefined,
    });
    useToastStore.getState().show('success', t('match.edit.saved'));
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480,
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          maxHeight: '92dvh', overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px 12px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🎾</span>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{t('tennis.edit.title')}</div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >✕</button>
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Soupeř */}
          <div>
            <Label>{t('tennis.edit.opponent')}</Label>
            <input
              type="text"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Kde */}
          <div>
            <Label>{t('tennis.edit.where')}</Label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {[
                { v: true, label: `🏠 ${t('tennis.create.home')}` },
                { v: false, label: `✈️ ${t('tennis.create.away')}` },
              ].map(({ v, label }) => (
                <button
                  key={String(v)}
                  onClick={() => setIsHome(v)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: isHome === v ? 'var(--primary)' : 'var(--surface-var)',
                    color: isHome === v ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={venue}
              onChange={e => setVenue(e.target.value)}
              placeholder={t('tennis.create.venuePlaceholder')}
              style={inputStyle}
            />
          </div>

          {/* Datum + čas */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Label>{t('tennis.create.date')}</Label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <Label>{t('tennis.create.time')}</Label>
              <input type="time" value={kickoffTime} onChange={e => setKickoffTime(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Soutěž */}
          <div>
            <Label>{t('tennis.create.competitionTitle')}</Label>
            <input
              type="text"
              value={competition}
              onChange={e => setCompetition(e.target.value)}
              placeholder={t('tennis.create.competitionPlaceholder')}
              style={inputStyle}
            />
          </div>

          {/* Kategorie */}
          {categoriesForPicker.length > 0 && (
            <div>
              <Label>{t('tennis.create.category')}</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categoriesForPicker.map(cat => {
                  const active = ageCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setAgeCategory(active ? '' : cat)}
                      style={{
                        padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: active ? 'var(--primary)' : 'var(--surface-var)',
                        color: active ? '#fff' : 'var(--text-muted)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ČTenis URL */}
          <div>
            <Label>🔗 {t('tennis.edit.officialUrl')}</Label>
            <input
              type="url"
              inputMode="url"
              autoComplete="url"
              value={officialResultsUrl}
              onChange={e => setOfficialResultsUrl(e.target.value)}
              placeholder="https://cztenis.cz/..."
              style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            style={{
              padding: '14px', borderRadius: 12, fontWeight: 800, fontSize: 14,
              background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
              color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(21,101,192,.25)',
            }}
          >
            💾 {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontSize: 14,
  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
};
