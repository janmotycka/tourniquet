/**
 * CreateMatchEventPage — vytvoření „Dne zápasů".
 *
 * Minimalistický wizard:
 *   1. Název (povinný)
 *   2. Datum (default = dnes)
 *   3. Sport (default = user preferred nebo football)
 *   4. Volitelně: místo, první zápasy (2 týmy)
 *
 * Po vytvoření → navigace na detail, kde učitel přidává další zápasy
 * a kliká na skóre během turnaje.
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
  { value: 'other', label: 'Jiný sport', icon: '🏆' },
];

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
    // Odfiltruj prázdné řádky (both teamy prázdné = nechceme)
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

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px', borderRadius: 12,
    border: '1.5px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 15, outline: 'none',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title={t('matchEvent.createTitle')}
        onBack={() => navigate({ name: 'home' })}
      />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Intro */}
        <div style={{
          background: 'var(--primary-light)', borderRadius: 12, padding: '12px 14px',
          fontSize: 13, color: 'var(--primary)', lineHeight: 1.45,
        }}>
          💡 {t('matchEvent.createIntro')}
        </div>

        {/* Název */}
        <div>
          <label htmlFor="me-name" style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text)' }}>
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

        {/* Datum + Sport (row) */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="me-date" style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text)' }}>
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
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text)' }}>
              {t('matchEvent.sportLabel')}
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {SPORTS.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSport(s.value)}
                  style={{
                    flex: 1, padding: '10px 4px', borderRadius: 10,
                    border: sport === s.value ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                    background: sport === s.value ? 'var(--primary-light)' : 'var(--surface)',
                    color: sport === s.value ? 'var(--primary)' : 'var(--text)',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}
                  title={s.label}
                >
                  {s.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Venue */}
        <div>
          <label htmlFor="me-venue" style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text)' }}>
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

        {/* Zápasy */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
              {t('matchEvent.matchesLabel')}
            </label>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('matchEvent.matchesHint')}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matches.map((m, i) => (
              <div key={i} style={{
                display: 'flex', gap: 6, alignItems: 'center',
                background: 'var(--surface)', borderRadius: 10, padding: 8,
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
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none', minWidth: 0 }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>vs</span>
                <input
                  type="text"
                  value={m.teamB}
                  onChange={e => updateRow(i, { teamB: e.target.value })}
                  placeholder={t('matchEvent.teamB')}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none', minWidth: 0 }}
                />
                {matches.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label={t('common.delete')}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: 'var(--surface-var)', color: 'var(--text-muted)',
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
              marginTop: 8, width: '100%', padding: '10px',
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
          }}
        >
          {t('matchEvent.createCta')}
        </button>
      </div>
    </div>
  );
}
