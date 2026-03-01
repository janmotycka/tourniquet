/**
 * RosterFormPage — stránka pro trenéra k vyplnění soupisky týmu.
 *
 * Přístupná bez přihlášení přes odkaz: #roster={tournamentId}&k={rosterToken}
 * Tok: načtení turnaje → identifikace týmu dle tokenu → vyplnění kontaktu + hráčů → odeslání.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../../App';
import type { Tournament, Team, RosterSubmission } from '../../types/tournament.types';
import { subscribeToPublicTournament } from '../../services/tournament.firebase';
import { submitRoster, loadRoster } from '../../services/roster.firebase';
import { useI18n } from '../../i18n';
import { generateId } from '../../utils/id';
import { logger } from '../../utils/logger';
import { colorSwatch } from '../../utils/team-colors';

// ─── Constants ──────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_MIN = 1950;
const BIRTH_MAX = CURRENT_YEAR - 3;

interface Props {
  tournamentId: string;
  teamToken: string;
  navigate: (p: Page) => void;
}

interface PlayerRow {
  id: string;
  name: string;
  jerseyNumber: string;
  birthYear: string;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid var(--border)',
  fontSize: 15,
  background: 'var(--bg)',
  color: 'var(--text)',
  boxSizing: 'border-box',
  outline: 'none',
};

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '10px 10px',
  fontSize: 14,
  textAlign: 'center' as const,
};

const btnPrimary: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  borderRadius: 14,
  border: 'none',
  background: 'var(--primary)',
  color: '#fff',
  fontWeight: 800,
  fontSize: 16,
  cursor: 'pointer',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 16,
  padding: '20px',
  boxShadow: '0 1px 4px rgba(0,0,0,.05)',
};

// ─── Main export ────────────────────────────────────────────────────────────

export function RosterFormPage(props: Props) {
  return <RosterFormPageInner {...props} />;
}

// ─── Inner component ────────────────────────────────────────────────────────

function RosterFormPageInner({ tournamentId, teamToken }: Props) {
  const { t } = useI18n();

  // ── Tournament + team loading ─────────────────────────────────────────────
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Matched team
  const [team, setTeam] = useState<Team | null>(null);

  // ── Existing roster (pre-fill) ────────────────────────────────────────────
  const [existingRoster, setExistingRoster] = useState<RosterSubmission | null>(null);

  // ── Coach fields ──────────────────────────────────────────────────────────
  const [coachName, setCoachName] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [coachEmail, setCoachEmail] = useState('');

  // ── Players ───────────────────────────────────────────────────────────────
  const [players, setPlayers] = useState<PlayerRow[]>([]);

  // ── Submit state ──────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Load tournament via real-time subscription ────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToPublicTournament(
      tournamentId,
      (data) => {
        if (!data) {
          setError(t('roster.notFound'));
          setLoading(false);
          return;
        }
        setTournament(data);

        // Match team by rosterToken
        const matched = data.teams.find(tm => tm.rosterToken === teamToken);
        if (!matched) {
          setError(t('roster.invalidToken'));
          setLoading(false);
          return;
        }
        setTeam(matched);
        setLoading(false);
      },
      (err) => {
        logger.error('[RosterForm] Firebase error:', err.message);
        setError(err.message);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [tournamentId, teamToken, t]);

  // ── Load existing roster submission ───────────────────────────────────────
  useEffect(() => {
    if (!team) return;
    loadRoster(tournamentId, team.id).then(roster => {
      if (roster) {
        setExistingRoster(roster);
        // Pre-fill form
        setCoachName(roster.coach.name);
        setCoachPhone(roster.coach.phone);
        setCoachEmail(roster.coach.email ?? '');
        setPlayers(
          roster.players.map(p => ({
            id: generateId(),
            name: p.name,
            jerseyNumber: String(p.jerseyNumber),
            birthYear: p.birthYear ? String(p.birthYear) : '',
          })),
        );
      } else {
        // Pre-fill from localStorage (returning coach)
        const saved = localStorage.getItem('roster-coach');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.name) setCoachName(parsed.name);
            if (parsed.phone) setCoachPhone(parsed.phone);
            if (parsed.email) setCoachEmail(parsed.email);
          } catch { /* ignore */ }
        }
        // Start with empty players
        setPlayers([createEmptyPlayer()]);
      }
    }).catch(err => {
      logger.warn('[RosterForm] Failed to load existing roster:', err);
      setPlayers([createEmptyPlayer()]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, tournamentId]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function createEmptyPlayer(): PlayerRow {
    return { id: generateId(), name: '', jerseyNumber: '', birthYear: '' };
  }

  const addPlayer = useCallback(() => {
    setPlayers(prev => [...prev, createEmptyPlayer()]);
  }, []);

  const removePlayer = useCallback((id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
  }, []);

  const updatePlayer = useCallback((id: string, field: keyof PlayerRow, value: string) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = useCallback((): string | null => {
    if (!coachName.trim()) return t('roster.errorCoachName');
    if (!coachPhone.trim()) return t('roster.errorCoachPhone');

    const validPlayers = players.filter(p => p.name.trim());
    if (validPlayers.length === 0) return t('roster.errorNoPlayers');

    for (const p of validPlayers) {
      const jersey = parseInt(p.jerseyNumber);
      if (p.jerseyNumber.trim() && (isNaN(jersey) || jersey < 1 || jersey > 99)) {
        return t('roster.errorJersey', { name: p.name });
      }
      if (p.birthYear.trim()) {
        const birth = parseInt(p.birthYear);
        if (isNaN(birth) || birth < BIRTH_MIN || birth > BIRTH_MAX) {
          return t('roster.errorBirthYear', { name: p.name, min: BIRTH_MIN, max: BIRTH_MAX });
        }
      }
    }

    // Check duplicate jersey numbers
    const jerseys = validPlayers
      .filter(p => p.jerseyNumber.trim())
      .map(p => parseInt(p.jerseyNumber));
    const uniqueJerseys = new Set(jerseys);
    if (uniqueJerseys.size !== jerseys.length) {
      return t('roster.errorDuplicateJersey');
    }

    return null;
  }, [coachName, coachPhone, players, t]);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!team) return;

    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const validPlayers = players.filter(p => p.name.trim());
      const submission: RosterSubmission = {
        coach: {
          name: coachName.trim(),
          phone: coachPhone.trim(),
          email: coachEmail.trim(),
        },
        players: validPlayers.map(p => ({
          name: p.name.trim(),
          jerseyNumber: p.jerseyNumber.trim() ? parseInt(p.jerseyNumber) : 0,
          birthYear: p.birthYear.trim() ? parseInt(p.birthYear) : null,
        })),
        submittedAt: new Date().toISOString(),
        teamId: team.id,
        teamName: team.name,
      };

      await submitRoster(tournamentId, team.id, submission);

      // Save coach info to localStorage for next time
      localStorage.setItem('roster-coach', JSON.stringify({
        name: coachName.trim(),
        phone: coachPhone.trim(),
        email: coachEmail.trim(),
      }));

      setSubmitted(true);
      setExistingRoster(submission);
      logger.debug('[RosterForm] Roster submitted successfully');
    } catch (err) {
      logger.error('[RosterForm] Submit failed:', err);
      setSubmitError(t('roster.submitError'));
    } finally {
      setSubmitting(false);
    }
  }, [team, validate, players, coachName, coachPhone, coachEmail, tournamentId, t]);

  // ── Is read-only? Tournament active/finished → no edits ───────────────────
  const isReadOnly = tournament ? tournament.status !== 'draft' : false;

  // ─── Render: Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: '100dvh', padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>⏳</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('roster.loading')}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('common.loading')}</p>
      </div>
    );
  }

  // ─── Render: Error ────────────────────────────────────────────────────────

  if (error || !tournament || !team) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: '100dvh', padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('roster.notFound')}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          {error ?? t('roster.notFoundDesc')}
        </p>
      </div>
    );
  }

  // ─── Render: Success ──────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100dvh', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 480, padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 64 }}>✅</div>
          <h2 style={{ fontWeight: 800, fontSize: 22, textAlign: 'center', color: 'var(--text)' }}>
            {t('roster.submitSuccess')}
          </h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 15, lineHeight: 1.5 }}>
            {t('roster.submitSuccessDesc', { team: team.name, tournament: tournament.name })}
          </p>

          <div style={{ ...cardStyle, width: '100%', marginTop: 8 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>📋 {t('roster.summary')}</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0' }}>
              {t('roster.coach')}: <strong>{coachName}</strong>
            </p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0' }}>
              {t('roster.playersCount', { count: players.filter(p => p.name.trim()).length })}
            </p>
          </div>

          <button
            onClick={() => { setSubmitted(false); }}
            style={{ ...btnPrimary, background: 'var(--bg)', color: 'var(--text)', border: '1.5px solid var(--border)', marginTop: 8 }}
          >
            ✏️ {t('roster.editAgain')}
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Read-only (tournament started) ───────────────────────────────

  if (isReadOnly && existingRoster) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100dvh', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 480, padding: '20px' }}>
          <Header tournament={tournament} team={team} />

          <div style={{ background: '#FFF3E0', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#E65100' }}>
            ⚠️ {t('roster.readOnly')}
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{t('roster.coach')}</h3>
            <p style={{ fontSize: 14, margin: '4px 0' }}>{existingRoster.coach.name}</p>
            <p style={{ fontSize: 14, margin: '4px 0', color: 'var(--text-muted)' }}>📞 {existingRoster.coach.phone}</p>
            {existingRoster.coach.email && (
              <p style={{ fontSize: 14, margin: '4px 0', color: 'var(--text-muted)' }}>📧 {existingRoster.coach.email}</p>
            )}
          </div>

          <div style={{ ...cardStyle, marginTop: 12 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              {t('roster.players')} ({existingRoster.players.length})
            </h3>
            {existingRoster.players.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: i < existingRoster.players.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', width: 28, textAlign: 'center' }}>
                  {p.jerseyNumber || '–'}
                </span>
                <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
                {p.birthYear && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.birthYear}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Form ─────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100dvh', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 480, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <Header tournament={tournament} team={team} />

        {existingRoster && (
          <div style={{ background: '#E8F5E9', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#2E7D32' }}>
            ✅ {t('roster.alreadySubmitted')}
          </div>
        )}

        {isReadOnly && (
          <div style={{ background: '#FFF3E0', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#E65100' }}>
            ⚠️ {t('roster.readOnly')}
          </div>
        )}

        {/* Coach section */}
        <div style={cardStyle}>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>👤 {t('roster.coach')}</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                {t('roster.coachName')} *
              </label>
              <input
                type="text"
                value={coachName}
                onChange={e => setCoachName(e.target.value)}
                placeholder={t('roster.coachNamePlaceholder')}
                style={inputStyle}
                disabled={isReadOnly}
                autoComplete="name"
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                {t('roster.coachPhone')} *
              </label>
              <input
                type="tel"
                value={coachPhone}
                onChange={e => setCoachPhone(e.target.value)}
                placeholder={t('roster.coachPhonePlaceholder')}
                style={inputStyle}
                disabled={isReadOnly}
                autoComplete="tel"
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                {t('roster.coachEmail')}
              </label>
              <input
                type="email"
                value={coachEmail}
                onChange={e => setCoachEmail(e.target.value)}
                placeholder={t('roster.coachEmailPlaceholder')}
                style={inputStyle}
                disabled={isReadOnly}
                autoComplete="email"
              />
            </div>
          </div>
        </div>

        {/* Players section */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>
              ⚽ {t('roster.players')} ({players.filter(p => p.name.trim()).length})
            </h3>
            {!isReadOnly && (
              <button
                onClick={addPlayer}
                style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 13, padding: '6px 12px', borderRadius: 10, border: 'none', cursor: 'pointer' }}
              >
                + {t('roster.addPlayer')}
              </button>
            )}
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 64px 28px', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>
              {t('tournament.create.jerseyNo')}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('tournament.create.playerName')}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>
              {t('tournament.create.birthYear')}
            </span>
            <span />
          </div>

          {players.map((player) => (
            <div key={player.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 64px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input
                type="number"
                inputMode="numeric"
                value={player.jerseyNumber}
                onChange={e => updatePlayer(player.id, 'jerseyNumber', e.target.value)}
                placeholder="#"
                style={{ ...smallInputStyle, width: '100%' }}
                disabled={isReadOnly}
                min={1}
                max={99}
              />
              <input
                type="text"
                value={player.name}
                onChange={e => updatePlayer(player.id, 'name', e.target.value)}
                placeholder={`${t('tournament.create.playerName')}…`}
                style={{ ...inputStyle, padding: '10px 10px', fontSize: 14 }}
                disabled={isReadOnly}
              />
              <input
                type="number"
                inputMode="numeric"
                value={player.birthYear}
                onChange={e => updatePlayer(player.id, 'birthYear', e.target.value)}
                placeholder={String(CURRENT_YEAR - 10)}
                style={{ ...smallInputStyle, width: '100%' }}
                disabled={isReadOnly}
              />
              {!isReadOnly && players.length > 1 && (
                <button
                  onClick={() => removePlayer(player.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#999', padding: 0, lineHeight: 1 }}
                  title={t('common.remove')}
                >
                  ✕
                </button>
              )}
              {(isReadOnly || players.length <= 1) && <span />}
            </div>
          ))}

          {!isReadOnly && (
            <button
              onClick={addPlayer}
              style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1.5px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', marginTop: 4 }}
            >
              + {t('roster.addPlayer')}
            </button>
          )}
        </div>

        {/* Error */}
        {submitError && (
          <div style={{ background: '#FFEBEE', borderRadius: 12, padding: '10px 14px', fontSize: 14, color: '#C62828' }}>
            ⚠️ {submitError}
          </div>
        )}

        {/* Submit button */}
        {!isReadOnly && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ ...btnPrimary, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? t('roster.submitting') : (existingRoster ? t('roster.updateSubmit') : t('roster.submit'))}
          </button>
        )}

        {/* TORQ branding */}
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 16 }}>
          TORQ ⚽ torq.cz
        </p>
      </div>
    </div>
  );
}

// ─── Header sub-component ───────────────────────────────────────────────────

function Header({ tournament, team }: { tournament: Tournament; team: Team }) {
  const { t } = useI18n();
  return (
    <div style={{ textAlign: 'center', paddingTop: 12 }}>
      {/* Team badge */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        {team.logoBase64 ? (
          <img src={team.logoBase64} alt={team.name} style={{ width: 48, height: 48, borderRadius: 14, objectFit: 'cover' }} />
        ) : (
          <div style={{ ...colorSwatch(team.color ?? '#ccc', 48), borderRadius: 14 }} />
        )}
      </div>
      <h1 style={{ fontWeight: 800, fontSize: 22, margin: '0 0 4px', color: 'var(--text)' }}>
        {team.name}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 4px' }}>
        {tournament.name}
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        📋 {t('roster.title')}
      </p>
    </div>
  );
}
