/**
 * RosterFormPage — stránka pro trenéra k vyplnění soupisky týmu.
 *
 * Přístupná bez přihlášení přes odkaz: #roster={tournamentId}&k={rosterToken}
 * Tok: načtení turnaje → identifikace týmu dle tokenu → vyplnění kontaktu + hráčů → odeslání.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Page } from '../../App';
import type { Tournament, Team, RosterSubmission, CustomerBilling } from '../../types/tournament.types';
import { subscribeToPublicTournament } from '../../services/tournament.firebase';
import { submitRoster, loadRoster } from '../../services/roster.firebase';
import { useI18n, getDateLocale } from '../../i18n';
import { generateId } from '../../utils/id';
import { logger } from '../../utils/logger';
import { colorSwatch } from '../../utils/team-colors';
import { generateInvoicePdf, createInvoiceDataFromApproval } from '../../utils/invoice-pdf';

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
  fontSize: 16,
  background: 'var(--bg)',
  color: 'var(--text)',
  boxSizing: 'border-box',
  outline: 'none',
};

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '10px 10px',
  fontSize: 16,
  textAlign: 'center' as const,
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
  boxShadow: '0 1px 4px rgba(0,0,0,.05)',
};

// ─── Main export ────────────────────────────────────────────────────────────

export function RosterFormPage(props: Props) {
  return <RosterFormPageInner {...props} />;
}

// ─── Inner component ────────────────────────────────────────────────────────

function RosterFormPageInner({ tournamentId, teamToken }: Props) {
  const { t, locale } = useI18n();

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

  // ── Info / rules toggle + PDF ───────────────────────────────────────────
  const [showInfo, setShowInfo] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  // ── Invoice ────────────────────────────────────────────────────────────
  const [invoiceGenerating, setInvoiceGenerating] = useState(false);
  const [qrPaymentUrl, setQrPaymentUrl] = useState<string | null>(null);

  // ── Coach collapsible ───────────────────────────────────────────────────
  const [showCoach, setShowCoach] = useState(false);

  // ── Customer billing (odběratel) ────────────────────────────────────────
  const [showCustomerBilling, setShowCustomerBilling] = useState(false);
  const [custCompanyName, setCustCompanyName] = useState('');
  const [custIco, setCustIco] = useState('');
  const [custDic, setCustDic] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custCity, setCustCity] = useState('');
  const [custZip, setCustZip] = useState('');

  // ── Section refs (for checklist scroll-to) ────────────────────────────────
  const sectionCoachRef = useRef<HTMLDivElement>(null);
  const sectionPlayersRef = useRef<HTMLDivElement>(null);
  const sectionPaymentRef = useRef<HTMLDivElement>(null);

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
        const matched = (data.teams ?? []).find(tm => tm.rosterToken === teamToken);
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
        // Pre-fill customer billing
        if (roster.customerBilling) {
          const cb = roster.customerBilling;
          setCustCompanyName(cb.companyName || '');
          setCustIco(cb.ico || '');
          setCustDic(cb.dic || '');
          setCustAddress(cb.address || '');
          setCustCity(cb.city || '');
          setCustZip(cb.zip || '');
          setShowCustomerBilling(true);
        }
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

    // Check birth year against tournament maxBirthYear (blocking)
    const maxBirthYear = tournament?.settings.maxBirthYear;
    if (maxBirthYear) {
      for (const p of validPlayers) {
        if (p.birthYear.trim()) {
          const birth = parseInt(p.birthYear);
          if (!isNaN(birth) && birth < maxBirthYear) {
            return t('roster.errorBirthYearTooOld', { name: p.name, year: p.birthYear, limit: String(maxBirthYear) });
          }
        }
      }
    }

    return null;
  }, [coachName, coachPhone, players, t, tournament]);

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
      // Customer billing (pokud vyplněno)
      const customerBilling: CustomerBilling | undefined =
        custCompanyName.trim() && custIco.trim()
          ? {
              companyName: custCompanyName.trim(),
              ico: custIco.trim(),
              dic: custDic.trim() || undefined,
              address: custAddress.trim(),
              city: custCity.trim(),
              zip: custZip.trim(),
            }
          : undefined;

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
        ...(customerBilling ? { customerBilling } : {}),
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
    } catch (err: unknown) {
      logger.error('[RosterForm] Submit failed:', err);
      const e = err as { message?: string; code?: string } | undefined;
      const detail = e?.message || e?.code || String(err);
      setSubmitError(`${t('roster.submitError')} (${detail})`);
    } finally {
      setSubmitting(false);
    }
  }, [team, validate, players, coachName, coachPhone, coachEmail, custCompanyName, custIco, custDic, custAddress, custCity, custZip, tournamentId, t]);

  // ── Is read-only? Tournament active/finished → no edits ───────────────────
  const isReadOnly = tournament ? tournament.status !== 'draft' : false;

  // ── Invoice helpers ─────────────────────────────────────────────────────
  const billingProfile = tournament?.settings.billingProfile;
  const entryFee = tournament?.settings.entryFee;
  const hasInvoice = !!(billingProfile?.companyName && billingProfile?.bankAccount && entryFee && entryFee > 0);

  const getInvoiceData = useCallback(() => {
    if (!tournament || !team || !hasInvoice) return null;
    const data = createInvoiceDataFromApproval(
      tournament.name,
      tournament.settings.startDate,
      team.name,
      coachName.trim() || team.name,
      coachEmail.trim(),
      coachPhone.trim(),
      entryFee!,
      // simple counter from team index
      (tournament.teams?.findIndex(tm => tm.id === team.id) ?? 0) + 1,
    );
    // Přidáme fakturační údaje odběratele, pokud je trenér vyplnil
    if (custCompanyName.trim() && custIco.trim()) {
      data.customerCompanyName = custCompanyName.trim();
      data.customerIco = custIco.trim();
      data.customerDic = custDic.trim() || undefined;
      data.customerAddress = custAddress.trim() || undefined;
      data.customerCity = custCity.trim() || undefined;
      data.customerZip = custZip.trim() || undefined;
    }
    return data;
  }, [tournament, team, hasInvoice, entryFee, coachName, coachEmail, coachPhone, custCompanyName, custIco, custDic, custAddress, custCity, custZip]);

  // Generate QR payment code when invoice data is available
  useEffect(() => {
    if (!hasInvoice || !billingProfile) return;
    const invoiceData = getInvoiceData();
    if (!invoiceData) return;

    import('qrcode').then(QRCode => {
      const parts = ['SPD*1.0'];
      if (billingProfile.iban) {
        parts.push(`ACC:${billingProfile.iban.replace(/\s/g, '')}`);
      }
      parts.push(`AM:${invoiceData.amount.toFixed(2)}`);
      parts.push(`CC:${invoiceData.currency}`);
      if (invoiceData.variableSymbol) {
        parts.push(`X-VS:${invoiceData.variableSymbol}`);
      }
      parts.push(`MSG:${invoiceData.description.substring(0, 60)}`);
      const spd = parts.join('*');

      QRCode.toDataURL(spd, { width: 200, margin: 1, errorCorrectionLevel: 'M' })
        .then(url => setQrPaymentUrl(url))
        .catch(() => {/* ignore */});
    }).catch(() => {/* ignore */});
  }, [hasInvoice, billingProfile, getInvoiceData]);

  const handleDownloadInvoice = useCallback(async () => {
    if (!billingProfile || !hasInvoice) return;
    const invoiceData = getInvoiceData();
    if (!invoiceData) return;
    setInvoiceGenerating(true);
    try {
      await generateInvoicePdf(billingProfile, invoiceData, t, { download: true });
    } catch (err) {
      logger.error('[RosterForm] Invoice generation failed:', err);
    } finally {
      setInvoiceGenerating(false);
    }
  }, [billingProfile, hasInvoice, getInvoiceData, t]);

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

          {/* Invoice / payment section */}
          {hasInvoice && billingProfile && (
            <div style={{ ...cardStyle, width: '100%', marginTop: 8 }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>💳 {t('billing.paymentTitle')}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                {t('billing.paymentDesc')}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('billing.bankAccountLabel')}</span>
                  <span style={{ fontWeight: 700 }}>{billingProfile.bankAccount}</span>
                </div>
                {getInvoiceData()?.variableSymbol && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('billing.vsLabel')}</span>
                    <span style={{ fontWeight: 700 }}>{getInvoiceData()!.variableSymbol}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('billing.amountLabel')}</span>
                  <span style={{ fontWeight: 700 }}>{entryFee} Kč</span>
                </div>
              </div>

              {/* QR Payment code */}
              {qrPaymentUrl && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <img src={qrPaymentUrl} alt="QR Platba" style={{ width: 140, height: 140, borderRadius: 8 }} />
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {t('invoice.qrPaymentDesc')}
                  </p>
                </div>
              )}

              {/* Download invoice PDF */}
              <button
                onClick={handleDownloadInvoice}
                disabled={invoiceGenerating}
                style={{
                  width: '100%', marginTop: 12, padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  opacity: invoiceGenerating ? 0.7 : 1,
                }}
              >
                {invoiceGenerating ? '⏳ …' : `📄 ${t('billing.downloadInvoice')}`}
              </button>
            </div>
          )}

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

  // ─── Checklist computations ──────────────────────────────────────────────

  const coachDone = !!(coachName.trim() && coachPhone.trim());
  const validPlayerCount = players.filter(p => p.name.trim()).length;
  const rosterDone = validPlayerCount > 0;

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ─── Render: Form ─────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100dvh', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 480, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <Header tournament={tournament} team={team} />

        {/* Checklist / progress */}
        <div style={{
          ...cardStyle,
          padding: '14px 16px',
          background: 'var(--surface)',
          border: '1.5px solid var(--border)',
        }}>
          <h4 style={{ fontWeight: 700, fontSize: 14, margin: '0 0 10px', color: 'var(--text)' }}>
            📝 {t('roster.checklist.title')}
          </h4>

          {existingRoster && (
            <div style={{ background: '#E8F5E9', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#2E7D32', marginBottom: 10 }}>
              ✅ {t('roster.alreadySubmitted')}
            </div>
          )}

          {isReadOnly && (
            <div style={{ background: '#FFF3E0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#E65100', marginBottom: 10 }}>
              ⚠️ {t('roster.readOnly')}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Coach row */}
            <button
              onClick={() => { setShowCoach(true); scrollTo(sectionCoachRef); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 10, border: 'none', background: coachDone ? '#E8F5E920' : '#FFF3E020',
                cursor: 'pointer', width: '100%', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{coachDone ? '✅' : '⬜'}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                  {t('roster.checklist.coach')}
                </span>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {coachDone ? t('roster.checklist.coachDone') : t('roster.checklist.coachTodo')}
                </p>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
            </button>

            {/* Roster row */}
            <button
              onClick={() => scrollTo(sectionPlayersRef)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 10, border: 'none', background: rosterDone ? '#E8F5E920' : '#FFF3E020',
                cursor: 'pointer', width: '100%', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{rosterDone ? '✅' : '⬜'}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                  {t('roster.checklist.roster')}
                </span>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {rosterDone
                    ? t('roster.checklist.rosterDone', { count: validPlayerCount })
                    : t('roster.checklist.rosterTodo')}
                </p>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
            </button>

            {/* Payment row — only if tournament has invoice */}
            {hasInvoice && (
              <button
                onClick={() => scrollTo(sectionPaymentRef)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 10, border: 'none', background: 'transparent',
                  cursor: 'pointer', width: '100%', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>💳</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                    {t('roster.checklist.payment')}
                  </span>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {t('roster.checklist.paymentInfo')}
                  </p>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
              </button>
            )}
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0', textAlign: 'center' }}>
            ℹ️ {t('roster.checklist.editableHint')}
          </p>
        </div>

        {/* Tournament info card — collapsed by default */}
        <TournamentInfoCard
          tournament={tournament}
          showInfo={showInfo}
          setShowInfo={setShowInfo}
          showRules={showRules}
          setShowRules={setShowRules}
          pdfExporting={pdfExporting}
          setPdfExporting={setPdfExporting}
          t={t}
          locale={locale}
        />

        {/* Invoice / payment — right after tournament info, independent of roster */}
        {hasInvoice && billingProfile && (
          <div ref={sectionPaymentRef} style={cardStyle}>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>💳 {t('billing.paymentTitle')}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              {t('billing.paymentDesc')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('billing.bankAccountLabel')}</span>
                <span style={{ fontWeight: 700 }}>{billingProfile.bankAccount}</span>
              </div>
              {getInvoiceData()?.variableSymbol && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('billing.vsLabel')}</span>
                  <span style={{ fontWeight: 700 }}>{getInvoiceData()!.variableSymbol}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('billing.amountLabel')}</span>
                <span style={{ fontWeight: 700 }}>{entryFee} Kč</span>
              </div>
            </div>

            {/* Inline QR payment code */}
            {(() => {
              // Generate QR synchronously from state or trigger generation
              return qrPaymentUrl ? (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <img src={qrPaymentUrl} alt="QR Platba" style={{ width: 140, height: 140, borderRadius: 8 }} />
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {t('invoice.qrPaymentDesc')}
                  </p>
                </div>
              ) : null;
            })()}

            {/* Fakturační údaje odběratele — collapsible */}
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <button
                onClick={() => setShowCustomerBilling(!showCustomerBilling)}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 0, fontWeight: 600, fontSize: 14, color: 'var(--text)',
                }}
              >
                <span>🧾 {t('billing.customerTitle')}{custCompanyName ? ` — ${custCompanyName}` : ''}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{showCustomerBilling ? '▲' : '▼'}</span>
              </button>

              {!showCustomerBilling && !custCompanyName && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
                  {t('billing.customerHint')}
                </p>
              )}

              {showCustomerBilling && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                    {t('billing.customerDesc')}
                  </p>
                  {[
                    { key: 'companyName', label: t('billing.customerCompanyName'), value: custCompanyName, setter: setCustCompanyName, required: true },
                    { key: 'ico', label: t('billing.ico'), value: custIco, setter: setCustIco, required: true },
                    { key: 'dic', label: t('billing.dic'), value: custDic, setter: setCustDic },
                    { key: 'address', label: t('billing.address'), value: custAddress, setter: setCustAddress },
                    { key: 'city', label: t('billing.city'), value: custCity, setter: setCustCity },
                    { key: 'zip', label: t('billing.zip'), value: custZip, setter: setCustZip },
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                        {field.label}{field.required ? ' *' : ''}
                      </label>
                      <input
                        type="text"
                        value={field.value}
                        onChange={e => field.setter(e.target.value)}
                        style={{
                          ...inputStyle, padding: '10px 12px', fontSize: 15,
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleDownloadInvoice}
              disabled={invoiceGenerating}
              style={{
                width: '100%', marginTop: 12, padding: '10px 14px', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                opacity: invoiceGenerating ? 0.7 : 1,
              }}
            >
              {invoiceGenerating ? '⏳ …' : `📄 ${t('billing.downloadInvoice')}`}
            </button>
          </div>
        )}

        {/* Coach section — collapsible */}
        <div ref={sectionCoachRef} style={cardStyle}>
          <button
            onClick={() => setShowCoach(!showCoach)}
            style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 0, fontWeight: 700, fontSize: 16, color: 'var(--text)',
            }}
          >
            <span>👤 {t('roster.coach')}{coachName ? ` — ${coachName}` : ''}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{showCoach ? '▲' : '▼'}</span>
          </button>

          {showCoach && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
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
          )}
        </div>

        {/* Players section */}
        <div ref={sectionPlayersRef} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>
              ⚽ {t('roster.players')} ({players.filter(p => p.name.trim()).length}{tournament.settings.maxPlayersPerRoster ? `/${tournament.settings.maxPlayersPerRoster}` : ''})
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

          {/* Info banners inside players section */}
          {tournament.settings.maxBirthYear && (
            <div style={{ background: '#FFF3E0', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#E65100', lineHeight: 1.5, marginBottom: 8 }}>
              🎂 {t('roster.birthYearRequirement', { year: String(tournament.settings.maxBirthYear) })}
            </div>
          )}
          <div style={{ background: '#E3F2FD', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#1565C0', lineHeight: 1.5, marginBottom: 10 }}>
            ℹ️ {t('roster.jerseyInfo')}
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
                style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: player.jerseyNumber.trim() ? (team.color || '#666') : `${team.color || '#666'}22`,
                  color: player.jerseyNumber.trim() ? '#fff' : (team.color || '#666'),
                  fontWeight: 800, fontSize: 16, textAlign: 'center',
                  border: 'none', outline: 'none',
                  padding: 0, boxSizing: 'border-box',
                  MozAppearance: 'textfield' as never,
                }}
                disabled={isReadOnly}
                min={1}
                max={99}
              />
              <input
                type="text"
                value={player.name}
                onChange={e => updatePlayer(player.id, 'name', e.target.value)}
                placeholder={`${t('tournament.create.playerName')}…`}
                style={{ ...inputStyle, padding: '10px 10px', fontSize: 16 }}
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

        {/* Player count warning (non-blocking) */}
        {(() => {
          const maxPlayers = tournament.settings.maxPlayersPerRoster;
          const validCount = players.filter(p => p.name.trim()).length;
          if (maxPlayers && maxPlayers > 0 && validCount > maxPlayers) {
            return (
              <div style={{ background: '#FFF3E0', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#E65100' }}>
                ⚠️ {t('roster.warnTooManyPlayers', { count: validCount, max: maxPlayers })}
              </div>
            );
          }
          return null;
        })()}

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

// ─── Tournament info card ─────────────────────────────────────────────────────

const infoRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '6px 0', fontSize: 14,
};
const infoLabelStyle: React.CSSProperties = { color: 'var(--text-muted)', fontWeight: 500 };
const infoValueStyle: React.CSSProperties = { fontWeight: 600, color: 'var(--text)', textAlign: 'right' };

function TournamentInfoCard({ tournament, showInfo, setShowInfo, showRules, setShowRules, pdfExporting, setPdfExporting, t, locale }: {
  tournament: Tournament;
  showInfo: boolean;
  setShowInfo: (v: boolean) => void;
  showRules: boolean;
  setShowRules: (v: boolean) => void;
  pdfExporting: boolean;
  setPdfExporting: (v: boolean) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
}) {
  const s = tournament.settings;

  // Date formatting
  const dateStr = s.startDate
    ? new Date(s.startDate + 'T00:00:00').toLocaleDateString(getDateLocale(locale as 'cs' | 'en' | 'de'), {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—';

  // Format label
  const formatLabel = s.format === 'groups-knockout'
    ? t('knockout.groupsKnockout')
    : s.format === 'knockout'
      ? t('knockout.pureKnockout')
      : t('knockout.roundRobin');

  // PDF download handler
  const handlePdfDownload = async () => {
    setPdfExporting(true);
    try {
      const { exportTournamentPdf } = await import('../../utils/tournament-pdf');
      await exportTournamentPdf(tournament, t, locale as 'cs' | 'en' | 'de');
    } catch (err) {
      logger.error('[RosterForm] PDF export failed:', err);
    } finally {
      setPdfExporting(false);
    }
  };

  const hasRules = !!s.rules?.trim();

  return (
    <div style={cardStyle}>
      {/* Collapsible header */}
      <button
        onClick={() => setShowInfo(!showInfo)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 0, fontWeight: 700, fontSize: 16, color: 'var(--text)',
        }}
      >
        <span>📋 {t('roster.tournamentInfoTitle')}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{showInfo ? '▲' : '▼'}</span>
      </button>

      {showInfo && (
        <div style={{ marginTop: 12 }}>
          {/* Structured info rows */}
          <div style={{ borderTop: '1px solid var(--border)', borderBottom: hasRules ? '1px solid var(--border)' : 'none' }}>
            {s.startDate && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>📅 {t('roster.infoDate')}</span>
                <span style={infoValueStyle}>{dateStr}</span>
              </div>
            )}
            {s.startTime && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>🕐 {t('roster.infoTime')}</span>
                <span style={infoValueStyle}>{s.startTime}</span>
              </div>
            )}
            <div style={infoRowStyle}>
              <span style={infoLabelStyle}>⏱️ {t('roster.infoMatchDuration')}</span>
              <span style={infoValueStyle}>{t('roster.minutes', { min: s.matchDurationMinutes })}</span>
            </div>
            {s.breakBetweenMatchesMinutes > 0 && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>⏸️ {t('roster.infoBreak')}</span>
                <span style={infoValueStyle}>{t('roster.minutes', { min: s.breakBetweenMatchesMinutes })}</span>
              </div>
            )}
            {(s.numberOfPitches ?? 1) > 1 && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>🏟️ {t('roster.infoPitches')}</span>
                <span style={infoValueStyle}>{s.numberOfPitches}</span>
              </div>
            )}
            <div style={infoRowStyle}>
              <span style={infoLabelStyle}>🏆 {t('roster.infoFormat')}</span>
              <span style={infoValueStyle}>{formatLabel}</span>
            </div>
            <div style={infoRowStyle}>
              <span style={infoLabelStyle}>👕 {t('roster.infoTeams')}</span>
              <span style={infoValueStyle}>{(tournament.teams ?? []).length}</span>
            </div>
            <div style={infoRowStyle}>
              <span style={infoLabelStyle}>⚽ {t('roster.infoScoring')}</span>
              <span style={infoValueStyle}>{t('pdf.scoringValue')}</span>
            </div>
          </div>

          {/* Collapsible rules text */}
          {hasRules && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setShowRules(!showRules)}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 0', fontWeight: 600, fontSize: 14, color: 'var(--text)',
                }}
              >
                <span>📝 {t('roster.rulesDetail')}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{showRules ? '▲' : '▼'}</span>
              </button>
              {showRules && (
                <pre style={{
                  fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7,
                  color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  margin: '4px 0 0', padding: '8px 0 0',
                  borderTop: '1px solid var(--border)',
                }}>
                  {s.rules}
                </pre>
              )}
            </div>
          )}

          {/* PDF download button */}
          <button
            onClick={handlePdfDownload}
            disabled={pdfExporting}
            style={{
              width: '100%', marginTop: 12, padding: '10px 14px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              opacity: pdfExporting ? 0.7 : 1,
            }}
          >
            {pdfExporting ? `⏳ ${t('roster.generatingPdf')}` : `📄 ${t('roster.downloadPdf')}`}
          </button>
        </div>
      )}
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
