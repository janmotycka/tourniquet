/**
 * RegistrationFormPage — veřejná stránka pro registraci týmu na turnaj.
 *
 * Přístupná bez přihlášení přes odkaz: #register={tournamentId}
 * Tok: načtení turnaje → vyplnění názvu týmu + kontakt trenéra → odeslání.
 * Organizátor poté registraci schválí.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../../App';
import type { Tournament, RegistrationSubmission } from '../../types/tournament.types';
import { subscribeToPublicTournament } from '../../services/tournament.firebase';
import { submitRegistration } from '../../services/registration.firebase';
import { useI18n } from '../../i18n';
import { logger } from '../../utils/logger';
import { getDateLocale } from '../../i18n';

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

const btnPrimary: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  borderRadius: 12,
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
  boxShadow: 'var(--shadow-sm)',
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  tournamentId: string;
  navigate: (p: Page) => void;
}

// ─── Main export ────────────────────────────────────────────────────────────

export function RegistrationFormPage({ tournamentId }: Props) {
  const { t, locale } = useI18n();

  // ── Tournament loading ──────────────────────────────────────────────────
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Form fields ─────────────────────────────────────────────────────────
  const [teamName, setTeamName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [coachEmail, setCoachEmail] = useState('');

  // ── Submit state ────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);

  // ── Load tournament ─────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsubscribe = subscribeToPublicTournament(
      tournamentId,
      (data) => {
        if (!data) {
          setError(t('registration.notFound'));
          setLoading(false);
          return;
        }
        setTournament(data);
        setLoading(false);
      },
      (err) => {
        logger.error('[Registration] Firebase error:', err.message);
        setError(err.message);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [tournamentId, t]);

  // Pre-fill coach contact from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('roster-coach');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.name) setCoachName(parsed.name);
        if (parsed.phone) setCoachPhone(parsed.phone);
        if (parsed.email) setCoachEmail(parsed.email);
      } catch { /* ignore */ }
    }
  }, []);

  // ── Derived state ───────────────────────────────────────────────────────
  const registrationEnabled = tournament?.settings.registrationEnabled ?? false;
  const registrationClosed = tournament?.settings.registrationClosed ?? false;
  const maxTeams = tournament?.settings.maxTeams ?? 0;
  const currentTeams = tournament?.teams?.length ?? 0;
  const isFull = maxTeams > 0 && currentTeams >= maxTeams;

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = useCallback((): string | null => {
    if (!teamName.trim()) return t('registration.errorTeamName');
    if (!coachName.trim()) return t('registration.errorCoachName');
    if (!coachPhone.trim()) return t('registration.errorCoachPhone');
    return null;
  }, [teamName, coachName, coachPhone, t]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const submission: RegistrationSubmission = {
        teamName: teamName.trim(),
        coachName: coachName.trim(),
        coachPhone: coachPhone.trim(),
        coachEmail: coachEmail.trim(),
        submittedAt: new Date().toISOString(),
      };

      await submitRegistration(tournamentId, submission);

      // Save coach info to localStorage for next time
      localStorage.setItem('roster-coach', JSON.stringify({
        name: coachName.trim(),
        phone: coachPhone.trim(),
        email: coachEmail.trim(),
      }));

      setSubmitted(true);
      logger.debug('[Registration] Submitted successfully');
    } catch (err) {
      logger.error('[Registration] Submit failed:', err);
      setSubmitError(t('registration.submitError'));
    } finally {
      setSubmitting(false);
    }
  }, [validate, teamName, coachName, coachPhone, coachEmail, tournamentId, t]);

  // ── Format helpers ──────────────────────────────────────────────────────
  const dateStr = tournament?.settings.startDate
    ? new Date(tournament.settings.startDate + 'T00:00:00').toLocaleDateString(getDateLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const timeStr = tournament?.settings.startTime || '';

  // ─── Render: Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: '100dvh', padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>⏳</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('common.loading')}</h2>
      </div>
    );
  }

  // ─── Render: Error / not found / registration disabled ────────────────
  if (error || !tournament || !registrationEnabled) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: '100dvh', padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('registration.notFound')}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          {error ?? t('registration.closed')}
        </p>
      </div>
    );
  }

  // ─── Render: Registration closed by admin ──────────────────────────
  if (registrationClosed) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: '100dvh', padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{tournament.name}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          {t('registration.closed')}
        </p>
      </div>
    );
  }

  // ─── Render: Success ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100dvh', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 480, padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 64 }}>📨</div>
          <h2 style={{ fontWeight: 800, fontSize: 22, textAlign: 'center', color: 'var(--text)' }}>
            {t('registration.submitSuccess')}
          </h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 15, lineHeight: 1.5 }}>
            {t('registration.submitSuccessDesc', { team: teamName.trim(), tournament: tournament.name })}
          </p>
          <div style={{ ...cardStyle, width: '100%', marginTop: 8 }}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0' }}>
              🏆 <strong>{tournament.name}</strong>
            </p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0' }}>
              👕 {teamName.trim()}
            </p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0' }}>
              👤 {coachName.trim()} · {coachPhone.trim()}
            </p>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
          TORQ ⚽ torq.cz
        </p>
      </div>
    );
  }

  // ─── Render: Full ─────────────────────────────────────────────────────
  if (isFull) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: '100dvh', padding: '40px 20px' }}>
        <div style={{ fontSize: 48 }}>🏟️</div>
        <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{tournament.name}</h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
          {t('registration.full', { current: currentTeams, max: maxTeams })}
        </p>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 13, lineHeight: 1.6, maxWidth: 340 }}>
          {t('registration.fullEncouragement')}
        </p>
        <div style={{ marginTop: 24, padding: '16px 24px', borderRadius: 16, background: 'var(--card-bg)', border: '1px solid var(--border)', textAlign: 'center', maxWidth: 340 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{t('registration.fullPromo')}</div>
          <a
            href="https://torq.cz"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}
          >
            ⚡ torq.cz
          </a>
        </div>
      </div>
    );
  }

  // ─── Render: Form ─────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100dvh', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 480, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', paddingTop: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>⚽</div>
          <h1 style={{ fontWeight: 800, fontSize: 22, margin: '0 0 4px', color: 'var(--text)' }}>
            {tournament.name}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 4px' }}>
            {t('registration.tournamentInfo', { date: dateStr, time: timeStr })}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            📝 {t('registration.title')}
          </p>
        </div>

        {/* Notice — application must be confirmed */}
        <div style={{ background: '#FFF8E1', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#F57F17', lineHeight: 1.5, border: '1px solid #FFECB3' }}>
          ℹ️ {t('registration.notice')}
        </div>

        {/* Teams count badge */}
        <div style={{ background: 'var(--info-light)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--info)', textAlign: 'center' }}>
          🏟️ {maxTeams > 0
            ? t('registration.teamsCount', { current: currentTeams, max: maxTeams })
            : t('registration.teamsCountNoLimit', { current: currentTeams })}
        </div>

        {/* Tournament details — collapsible */}
        <div style={cardStyle}>
          <div
            onClick={() => setInfoOpen(!infoOpen)}
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
          >
            <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>📋 {t('registration.tournamentDetails')}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: infoOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </div>
          {infoOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-muted)' }}>📅 {t('tournament.create.date')}</span>
                <span style={{ fontWeight: 600 }}>{dateStr}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-muted)' }}>⏰ {t('tournament.create.startTime')}</span>
                <span style={{ fontWeight: 600 }}>{timeStr}</span>
              </div>
              {tournament.settings.endTime && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>🏁 {t('registration.endTime')}</span>
                  <span style={{ fontWeight: 600 }}>{tournament.settings.endTime}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-muted)' }}>⏱️ {t('tournament.detail.matchDuration')}</span>
                <span style={{ fontWeight: 600 }}>{tournament.settings.matchDurationMinutes} min</span>
              </div>
              {(tournament.settings.numberOfPitches ?? 1) > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>🏟️ {t('tournament.detail.pitchCountLabel')}</span>
                  <span style={{ fontWeight: 600 }}>{tournament.settings.numberOfPitches}</span>
                </div>
              )}
              {tournament.settings.entryFee && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>💰 {t('registration.entryFee')}</span>
                  <span style={{ fontWeight: 600 }}>{tournament.settings.entryFee} Kč</span>
                </div>
              )}
              {tournament.settings.maxBirthYear && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>🎂 {t('registration.maxBirthYear')}</span>
                  <span style={{ fontWeight: 600 }}>{tournament.settings.maxBirthYear}+</span>
                </div>
              )}
              {(tournament.settings.venueName || tournament.settings.venueAddress) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--text-muted)' }}>📍 {t('venue.title')}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>
                    {tournament.settings.venueName}
                    {tournament.settings.venueName && tournament.settings.venueAddress && <br />}
                    {tournament.settings.venueAddress && (
                      <span style={{ fontWeight: 400, fontSize: 13 }}>{tournament.settings.venueAddress}</span>
                    )}
                  </span>
                </div>
              )}
              {tournament.settings.venueNote && (
                <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  ℹ️ {tournament.settings.venueNote}
                </div>
              )}
              {tournament.settings.rules && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>📝 {t('tournament.settings.rulesTitle')}</div>
                  <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {tournament.settings.rules}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Team name */}
        <div style={cardStyle}>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>👕 {t('registration.teamName')}</h3>
          <input
            type="text"
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder={t('registration.teamNamePlaceholder')}
            style={inputStyle}
            autoComplete="organization"
          />
        </div>

        {/* Coach contact */}
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
                autoComplete="email"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {submitError && (
          <div style={{ background: 'var(--danger-light)', borderRadius: 12, padding: '10px 14px', fontSize: 14, color: 'var(--danger)' }}>
            ⚠️ {submitError}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ ...btnPrimary, opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? t('registration.submitting') : `📝 ${t('registration.submit')}`}
        </button>

        {/* Branding */}
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 16 }}>
          TORQ ⚽ torq.cz
        </p>
      </div>
    </div>
  );
}
