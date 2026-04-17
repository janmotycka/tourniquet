/**
 * EditMatchSheet — bottom sheet pro editaci existujícího zápasu.
 *
 * Umožňuje upravit všechny "metadata" zápasu (soupeř, datum, místo, kategorie, formát…).
 * Sestava (lineup) se edituje v samostatném LineupTab.
 *
 * Pravidla:
 * - planned → všechna pole editovatelná
 * - live/finished → jen textová pole (opponent, venue, competition) — změna časování by rozhodila timer
 */

import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { useMatchesStore } from '../../store/matches.store';
import { useClubsStore } from '../../store/clubs.store';
import { useToastStore } from '../../store/toast.store';
import type { SeasonMatch, MatchFormat } from '../../types/match.types';
import { MATCH_FORMATS } from '../../types/match.types';

interface Props {
  match: SeasonMatch;
  onClose: () => void;
}

export function EditMatchSheet({ match, onClose }: Props) {
  const { t } = useI18n();
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const allMatches = useMatchesStore(s => s.matches);
  const clubs = useClubsStore(s => s.clubs);
  const matchClub = clubs.find(c => c.id === match.clubId);
  const clubCategories = matchClub?.ageCategories ?? [];

  // Historie pro našeptávač — venue + competition z minulých zápasů stejného sportu.
  const matchSport = match.sport ?? 'football';
  const venueHistory = [...new Set(allMatches
    .filter(m => (m.sport ?? 'football') === matchSport && m.venue?.trim())
    .map(m => m.venue!.trim()))].sort((a, b) => a.localeCompare(b));
  const competitionHistory = [...new Set(allMatches
    .filter(m => (m.sport ?? 'football') === matchSport && m.competition?.trim())
    .map(m => m.competition.trim()))].sort((a, b) => a.localeCompare(b));

  // Všechna pole lokální — commit až při Save
  const [opponent, setOpponent] = useState(match.opponent);
  const [venue, setVenue] = useState(match.venue ?? '');
  const [competition, setCompetition] = useState(match.competition);
  const [isHome, setIsHome] = useState(match.isHome);
  const [date, setDate] = useState(match.date);
  const [kickoffTime, setKickoffTime] = useState(match.kickoffTime);
  const [periods, setPeriods] = useState(match.periods);
  const [periodDuration, setPeriodDuration] = useState(match.periodDurationMinutes);
  const [matchFormat, setMatchFormat] = useState<MatchFormat>(match.matchFormat ?? '7+1');
  const [ageCategory, setAgeCategory] = useState<string>(match.ageCategory ?? '');
  const [officialResultsUrl, setOfficialResultsUrl] = useState(match.officialResultsUrl ?? '');
  const isTennis = (match.sport ?? 'football') === 'tennis';

  const structuralLocked = match.status !== 'planned';

  // Zavřít na Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    const patch: Partial<SeasonMatch> = {
      opponent: opponent.trim() || match.opponent,
      venue: venue.trim() || undefined,
      competition: competition.trim(),
      officialResultsUrl: officialResultsUrl.trim() || undefined,
    };
    if (!structuralLocked) {
      patch.isHome = isHome;
      patch.date = date;
      patch.kickoffTime = kickoffTime;
      patch.periods = periods;
      patch.periodDurationMinutes = periodDuration;
      patch.durationMinutes = periods * periodDuration;
      patch.matchFormat = matchFormat;
      patch.ageCategory = ageCategory || undefined;
    }
    updateMatch(match.id, patch);
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
          maxHeight: '90dvh', overflowY: 'auto',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px 12px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>✏️</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{t('match.edit.title')}</div>
              {structuralLocked && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {t('match.edit.structuralLocked')}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'var(--surface-var)', border: 'none', borderRadius: 8,
              width: 32, height: 32, fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Opponent */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {t('match.create.opponent')}
            </label>
            <input
              type="text"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                border: '1.5px solid var(--border)', fontSize: 14,
                background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Venue */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              📍 {t('match.create.venue')}
            </label>
            <input
              type="text"
              value={venue}
              onChange={e => setVenue(e.target.value)}
              placeholder={t('match.create.venuePlaceholder')}
              list="torq-edit-venue-history"
              autoComplete="off"
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                border: '1.5px solid var(--border)', fontSize: 14,
                background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
            {venueHistory.length > 0 && (
              <datalist id="torq-edit-venue-history">
                {venueHistory.map(v => <option key={v} value={v} />)}
              </datalist>
            )}
          </div>

          {/* Competition */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              🏆 {t('match.create.competition')}
            </label>
            <input
              type="text"
              value={competition}
              onChange={e => setCompetition(e.target.value)}
              list="torq-edit-competition-history"
              autoComplete="off"
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                border: '1.5px solid var(--border)', fontSize: 14,
                background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
            {competitionHistory.length > 0 && (
              <datalist id="torq-edit-competition-history">
                {competitionHistory.map(c => <option key={c} value={c} />)}
              </datalist>
            )}
          </div>

          {/* Official results URL — pro tenis (ČTenis odkaz na oficiální zápis). */}
          {isTennis && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                🔗 {t('match.edit.officialResultsUrl')}
              </label>
              <input
                type="url"
                inputMode="url"
                autoComplete="url"
                value={officialResultsUrl}
                onChange={e => setOfficialResultsUrl(e.target.value)}
                placeholder="https://cztenis.cz/…"
                style={{
                  width: '100%', padding: '10px', borderRadius: 10,
                  border: '1.5px solid var(--border)', fontSize: 13,
                  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                  fontFamily: 'ui-monospace, monospace',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                {t('match.edit.officialResultsUrlHint')}
              </div>
            </div>
          )}

          {/* Home/Away — jen pokud planned */}
          {!structuralLocked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('match.create.wherePlay')}
              </span>
              <div style={{ display: 'inline-flex', background: 'var(--surface-var)', borderRadius: 8, overflow: 'hidden' }}>
                {[{ v: true, label: t('match.create.homeBtn') }, { v: false, label: t('match.create.awayBtn') }].map(({ v, label }) => (
                  <button
                    key={String(v)}
                    onClick={() => setIsHome(v)}
                    style={{
                      padding: '6px 14px', fontWeight: 600, fontSize: 13,
                      background: isHome === v ? 'var(--primary)' : 'transparent',
                      color: isHome === v ? '#fff' : 'var(--text-muted)',
                      borderRadius: isHome === v ? 8 : 0,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date + Time — jen pokud planned */}
          {!structuralLocked && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  {t('match.create.date')}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--border)', fontSize: 14,
                    background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  {t('match.create.kickoff')}
                </label>
                <input
                  type="time"
                  value={kickoffTime}
                  onChange={e => setKickoffTime(e.target.value)}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--border)', fontSize: 14,
                    background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}

          {/* Kategorie — jen pokud planned a klub má víc kategorií */}
          {!structuralLocked && clubCategories.length > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {t('match.create.selectCategory')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  onClick={() => setAgeCategory('')}
                  style={{
                    padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                    background: ageCategory === '' ? 'var(--primary)' : 'var(--surface-var)',
                    color: ageCategory === '' ? '#fff' : 'var(--text)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  —
                </button>
                {clubCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setAgeCategory(cat)}
                    style={{
                      padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                      background: ageCategory === cat ? 'var(--primary)' : 'var(--surface-var)',
                      color: ageCategory === cat ? '#fff' : 'var(--text)',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Formát + periods + duration — jen pokud planned */}
          {!structuralLocked && (
            <>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  {t('match.create.format')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {MATCH_FORMATS.map(f => (
                    <button
                      key={f}
                      onClick={() => setMatchFormat(f)}
                      style={{
                        padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                        background: matchFormat === f ? 'var(--primary)' : 'var(--surface-var)',
                        color: matchFormat === f ? '#fff' : 'var(--text)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    {t('match.create.periodCount')}
                  </label>
                  <input
                    type="number"
                    min={1} max={4}
                    value={periods}
                    onChange={e => setPeriods(Math.max(1, Math.min(4, Number(e.target.value) || 1)))}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 10,
                      border: '1.5px solid var(--border)', fontSize: 14,
                      background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    {t('match.create.periodDuration')}
                  </label>
                  <input
                    type="number"
                    min={1} max={60}
                    value={periodDuration}
                    onChange={e => setPeriodDuration(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 10,
                      border: '1.5px solid var(--border)', fontSize: 14,
                      background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{
          position: 'sticky', bottom: 0,
          background: 'var(--surface)', padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px', borderRadius: 12,
              background: 'var(--surface-var)', color: 'var(--text)',
              border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!opponent.trim()}
            style={{
              flex: 2, padding: '12px', borderRadius: 12,
              background: opponent.trim() ? 'var(--primary)' : 'var(--surface-var)',
              color: opponent.trim() ? '#fff' : 'var(--text-muted)',
              border: 'none', fontWeight: 800, fontSize: 14,
              cursor: opponent.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            💾 {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
