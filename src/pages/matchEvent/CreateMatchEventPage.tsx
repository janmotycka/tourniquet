/**
 * CreateMatchEventPage — vytvoření „Dne zápasů".
 *
 * Design sjednocený se stylem CreateMatchPage: sekce v „kartách"
 * (background: var(--surface), borderRadius: 14, padding: 16), section title
 * jako `<h3>`, selection tiles stejný vzhled jako tam (active=primary, inactive=surface-var).
 */

import { useState } from 'react';
import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useMatchEventsStore } from '../../store/matchEvents.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { useToastStore } from '../../store/toast.store';
import { PageHeader } from '../../components/ui';
import type { Sport } from '../../types/sport.types';

interface Props { navigate: (p: Page) => void; }

interface MatchRow { teamA: string; teamB: string; note?: string }

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

const SPORTS: Array<{ value: Sport | 'other'; label: string; icon: string }> = [
  { value: 'football', label: 'Fotbal', icon: '⚽' },
  { value: 'tennis', label: 'Tenis', icon: '🎾' },
  { value: 'other', label: 'Jiný', icon: '🏆' },
];

// Společné form styly (sjednocené s CreateMatchPage)
const cardStyle: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 14, padding: 16,
  display: 'flex', flexDirection: 'column', gap: 12,
};
const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 700, fontSize: 15, color: 'var(--text)', margin: 0,
};
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)',
  fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: 6,
};

export function CreateMatchEventPage({ navigate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const createEvent = useMatchEventsStore(s => s.createEvent);

  const [name, setName] = useState('');
  const [date, setDate] = useState(todayStr());
  const [sport, setSport] = useState<Sport | 'other'>(preferredSport === 'tennis' ? 'tennis' : 'football');
  const [venue, setVenue] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([
    { teamA: '', teamB: '' },
  ]);

  const addRow = () => setMatches(prev => [...prev, { teamA: '', teamB: '' }]);
  const removeRow = (i: number) => setMatches(prev => prev.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<MatchRow>) =>
    setMatches(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m));

  const canCreate = name.trim().length > 0 && date.length > 0;

  const handleCreate = () => {
    if (!canCreate || !user) return;
    const validMatches = matches
      .filter(m => m.teamA.trim() || m.teamB.trim())
      .map(m => ({
        teamA: m.teamA.trim() || 'Tým A',
        teamB: m.teamB.trim() || 'Tým B',
        ...(m.note ? { note: m.note } : {}),
      }));
    const event = createEvent({
      name: name.trim(),
      date,
      sport,
      venue: venue.trim() || undefined,
      matches: validMatches,
    }, user.uid);
    useToastStore.getState().show('success', t('matchEvent.created'));
    navigate({ name: 'match-event-detail', eventId: event.id });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>
      <PageHeader
        title={t('matchEvent.createTitle')}
        onBack={() => navigate({ name: 'match-list' })}
      />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Intro — laděn stylem jako ostatní info hlášky */}
        <div style={{
          background: 'var(--primary-light)', borderRadius: 12, padding: '12px 14px',
          fontSize: 13, color: 'var(--primary)', lineHeight: 1.45,
        }}>
          💡 {t('matchEvent.createIntro')}
        </div>

        {/* Základní info — karta */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>{t('matchEvent.sectionBasic')}</h3>

          <div>
            <label htmlFor="me-name" style={labelStyle}>
              {t('matchEvent.nameLabel')} <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="me-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('matchEvent.namePlaceholder')}
              style={inputStyle}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="me-date" style={labelStyle}>
                {t('matchEvent.dateLabel')}
              </label>
              <input
                id="me-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="me-venue" style={labelStyle}>
                {t('matchEvent.venueLabel')}
              </label>
              <input
                id="me-venue"
                type="text"
                value={venue}
                onChange={e => setVenue(e.target.value)}
                placeholder={t('matchEvent.venuePlaceholder')}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Sport — karta s tiles (stejný pattern jako CreateMatchPage tennis type) */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>{t('matchEvent.sportLabel')}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {SPORTS.map(s => {
              const isActive = sport === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSport(s.value)}
                  style={{
                    flex: 1, padding: '14px 10px', borderRadius: 12, fontWeight: 700, fontSize: 13,
                    background: isActive ? 'var(--primary)' : 'var(--surface-var)',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    border: isActive ? 'none' : '1.5px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Zápasy — karta */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={sectionTitleStyle}>{t('matchEvent.matchesLabel')}</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('matchEvent.matchesHint')}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matches.map((m, i) => (
              <div key={i} style={{
                display: 'flex', gap: 6, alignItems: 'center',
                background: 'var(--surface-var)', borderRadius: 10, padding: 8,
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 18 }}>
                  {i + 1}.
                </span>
                <input
                  type="text"
                  value={m.teamA}
                  onChange={e => updateRow(i, { teamA: e.target.value })}
                  placeholder={t('matchEvent.teamA')}
                  style={{ ...inputStyle, minWidth: 0, flex: 1, padding: '8px 10px', fontSize: 13 }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>vs</span>
                <input
                  type="text"
                  value={m.teamB}
                  onChange={e => updateRow(i, { teamB: e.target.value })}
                  placeholder={t('matchEvent.teamB')}
                  style={{ ...inputStyle, minWidth: 0, flex: 1, padding: '8px 10px', fontSize: 13 }}
                />
                {matches.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label={t('common.delete')}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: 'var(--surface)', color: 'var(--text-muted)',
                      fontSize: 14, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            style={{
              width: '100%', padding: '10px',
              borderRadius: 10, border: '1.5px dashed var(--border)',
              background: 'transparent', color: 'var(--text-muted)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + {t('matchEvent.addMatch')}
          </button>
        </div>

        {/* Submit */}
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          style={{
            padding: '14px', borderRadius: 12,
            background: canCreate ? 'var(--primary)' : 'var(--border)',
            color: canCreate ? '#fff' : 'var(--text-muted)',
            border: 'none',
            fontSize: 15, fontWeight: 800,
            cursor: canCreate ? 'pointer' : 'not-allowed',
            marginTop: 4,
            boxShadow: canCreate ? 'var(--shadow-sm)' : 'none',
          }}
        >
          {t('matchEvent.createCta')}
        </button>
      </div>
    </div>
  );
}
