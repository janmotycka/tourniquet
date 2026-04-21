/**
 * QuickTournamentPage — ultra-jednoduchý turnaj pro Simple mode.
 *
 * Flow: název + datum + počet týmů + jména týmů → klik → vygeneruje se
 * round-robin rozpis a naviguje rovnou na tournament detail. Žádné nastavení
 * hřišť, délky zápasů, skupin.
 *
 * Defaults: 1 hřiště, 10 min zápas, 5 min pauza, round-robin.
 * User může detail upravit později v tournament settings.
 */

import { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useTournamentStore } from '../../store/tournament.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { useToastStore } from '../../store/toast.store';
import { PageHeader } from '../../components/ui';
import { generatePinSalt, hashPin } from '../../utils/pin-hash';

interface Props { navigate: (p: Page) => void; }

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// Konzistentní styly s CreateMatchEventPage / CreateMatchPage (karty)
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

const TEAM_COLORS = [
  '#1565C0', '#C62828', '#2E7D32', '#E65100',
  '#6A1B9A', '#00695C', '#283593', '#F9A825',
  '#4A148C', '#4E342E', '#0D47A1', '#BF360C',
  '#1B5E20', '#37474F', '#AD1457', '#D32F2F',
];

export function QuickTournamentPage({ navigate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const createTournament = useTournamentStore(s => s.createTournament);

  const [name, setName] = useState('');
  const [date, setDate] = useState(todayStr());
  const [venue, setVenue] = useState('');
  const [teamCount, setTeamCount] = useState(4);
  const [teamNames, setTeamNames] = useState<string[]>(['', '', '', '']);
  const [busy, setBusy] = useState(false);

  const canCreate = name.trim().length > 0 && teamCount >= 2 && teamNames.slice(0, teamCount).every(n => n.trim().length > 0);

  const teamCountOptions = useMemo(() => [2, 3, 4, 5, 6, 8, 10, 12, 16], []);

  const handleTeamCountChange = (n: number) => {
    setTeamCount(n);
    setTeamNames(prev => {
      const next = [...prev];
      while (next.length < n) next.push('');
      return next.slice(0, n);
    });
  };

  const updateTeamName = (idx: number, val: string) => {
    setTeamNames(prev => prev.map((n, i) => i === idx ? val : n));
  };

  const autoFillDefaults = () => {
    setTeamNames(prev => prev.map((n, i) => n.trim() || `Tým ${String.fromCharCode(65 + i)}`));
  };

  const handleCreate = async () => {
    if (!canCreate || !user || busy) return;
    setBusy(true);
    try {
      const teams = teamNames.slice(0, teamCount).map((nm, i) => ({
        name: nm.trim() || `Tým ${String.fromCharCode(65 + i)}`,
        color: TEAM_COLORS[i % TEAM_COLORS.length],
        players: [],
      }));

      // Admin PIN pro případné pozdější sdílení s co-admins. User ho teď
      // nepotřebuje znát — v Simple módu je share link read-only.
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const pinSalt = generatePinSalt();
      const pinHash = await hashPin(pin, pinSalt);

      const tournament = await createTournament({
        name: name.trim(),
        sport: preferredSport === 'tennis' ? 'tennis' : 'football',
        teams,
        pinHash,
        pinSalt,
        settings: {
          matchDurationMinutes: 10,
          breakBetweenMatchesMinutes: 5,
          numberOfPitches: 1,
          startDate: date,
          startTime: '10:00',
          ...(venue.trim() ? { rules: venue.trim() } : {}),
        },
      });
      useToastStore.getState().show('success', t('tournament.quick.created'));
      navigate({ name: 'tournament-detail', tournamentId: tournament.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useToastStore.getState().show('error', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>
      <PageHeader
        title={t('tournament.quick.title')}
        onBack={() => navigate({ name: 'home' })}
      />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Intro */}
        <div style={{
          background: 'var(--primary-light)', borderRadius: 12, padding: '12px 14px',
          fontSize: 13, color: 'var(--primary)', lineHeight: 1.45,
        }}>
          💡 {t('tournament.quick.intro')}
        </div>

        {/* Základní info */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>{t('tournament.quick.sectionBasic')}</h3>

          <div>
            <label htmlFor="qt-name" style={labelStyle}>
              {t('tournament.quick.nameLabel')} <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="qt-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('tournament.quick.namePlaceholder')}
              style={inputStyle}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="qt-date" style={labelStyle}>
                {t('tournament.quick.dateLabel')}
              </label>
              <input
                id="qt-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="qt-venue" style={labelStyle}>
                {t('tournament.quick.venueLabel')}
              </label>
              <input
                id="qt-venue"
                type="text"
                value={venue}
                onChange={e => setVenue(e.target.value)}
                placeholder={t('tournament.quick.venuePlaceholder')}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Počet týmů */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>{t('tournament.quick.teamCountLabel')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
            {t('tournament.quick.teamCountHint')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {teamCountOptions.map(n => {
              const active = teamCount === n;
              return (
                <button
                  key={n}
                  onClick={() => handleTeamCountChange(n)}
                  style={{
                    padding: '10px 4px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    background: active ? 'var(--primary)' : 'var(--surface-var)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    border: active ? 'none' : '1.5px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* Jména týmů */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={sectionTitleStyle}>{t('tournament.quick.teamsLabel')}</h3>
            <button
              type="button"
              onClick={autoFillDefaults}
              style={{
                fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}
            >
              {t('tournament.quick.autoFill')}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: teamCount }).map((_, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, alignItems: 'center',
                background: 'var(--surface-var)', borderRadius: 10, padding: 8,
                border: '1px solid var(--border)',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 8,
                  background: TEAM_COLORS[i % TEAM_COLORS.length],
                  color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0,
                }}>
                  {String.fromCharCode(65 + i)}
                </span>
                <input
                  type="text"
                  value={teamNames[i] ?? ''}
                  onChange={e => updateTeamName(i, e.target.value)}
                  placeholder={t('tournament.quick.teamPlaceholder', { letter: String.fromCharCode(65 + i) })}
                  style={{ ...inputStyle, padding: '8px 10px', fontSize: 13, flex: 1, minWidth: 0 }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Info o rozpisu */}
        <div style={{
          background: 'var(--surface-var)', borderRadius: 12, padding: '10px 14px',
          fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
        }}>
          ℹ️ {t('tournament.quick.scheduleInfo', { n: teamCount * (teamCount - 1) / 2 })}
        </div>

        {/* Submit */}
        <button
          onClick={handleCreate}
          disabled={!canCreate || busy}
          style={{
            padding: '14px', borderRadius: 12,
            background: canCreate && !busy ? 'var(--primary)' : 'var(--border)',
            color: canCreate && !busy ? '#fff' : 'var(--text-muted)',
            border: 'none',
            fontSize: 15, fontWeight: 800,
            cursor: canCreate && !busy ? 'pointer' : 'not-allowed',
            marginTop: 4,
            boxShadow: canCreate && !busy ? 'var(--shadow-sm)' : 'none',
          }}
        >
          {busy ? t('common.loading') : t('tournament.quick.createCta')}
        </button>
      </div>
    </div>
  );
}
