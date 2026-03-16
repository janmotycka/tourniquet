import { useState, useEffect } from 'react';
import type { Page } from '../../App';
import type { Tournament, TiebreakerCriterion, RosterSubmission, RegistrationSubmission } from '../../types/tournament.types';
import { DEFAULT_TIEBREAKER_ORDER } from '../../types/tournament.types';
import type { TournamentTemplate } from '../../types/tournament.types';
import { useI18n, getDateLocale } from '../../i18n';
import { useConfirmStore } from '../../store/confirm.store';
import { useTournamentStore } from '../../store/tournament.store';
import { useContactsStore } from '../../store/contacts.store';
import { useTemplatesStore } from '../../store/templates.store';
import { useToastStore } from '../../store/toast.store';
import { getTournamentPublicUrl, getAdminInviteUrl, generateQRCodeDataUrl, getRosterFormUrl, getRegistrationUrl } from '../../utils/qr-code';
import { subscribeToRosters } from '../../services/roster.firebase';
import { subscribeToRegistrations } from '../../services/registration.firebase';
import { sendWelcomeChatMessage } from '../../services/tournament.firebase';
import { MvpResults } from './MvpResults';
import { exportTournamentPdf } from '../../utils/tournament-pdf';
import { hashPin, generatePinSalt } from '../../utils/pin-hash';
import { exportTournamentStandingsCSV, exportTournamentMatchesCSV, exportTournamentScorersCSV } from '../../utils/export-csv';
import { logger } from '../../utils/logger';
import { copyToClipboard } from '../../utils/training-share';
import { generateId } from '../../utils/id';
import { TeamBadge } from './TeamBadge';
import { AdminRosterSheet } from './AdminRosterSheet';
import { Dropdown, ColorDot } from '../ui/Dropdown';

export function SettingsTab({ tournament, navigate, isOwner, leaveTournament }: { tournament: Tournament; navigate: (p: Page) => void; isOwner: boolean; leaveTournament: (tournamentId: string) => Promise<void> }) {
  const { t, locale } = useI18n();
  const ask = useConfirmStore(s => s.ask);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [adminCopied, setAdminCopied] = useState(false);
  const [rulesEdit, setRulesEdit] = useState(tournament.settings.rules ?? '');
  const [rulesSaved, setRulesSaved] = useState(false);

  // Přegenerování harmonogramu
  const [regenDate, setRegenDate] = useState(tournament.settings.startDate);
  const [regenTime, setRegenTime] = useState(tournament.settings.startTime);
  const [regenDuration, setRegenDuration] = useState(tournament.settings.matchDurationMinutes);
  const [regenBreak, setRegenBreak] = useState(tournament.settings.breakBetweenMatchesMinutes);
  const [regenPitches, setRegenPitches] = useState(tournament.settings.numberOfPitches ?? 1);
  const [regenSaved, setRegenSaved] = useState(false);

  // Tiebreaker criteria drag & drop
  const [tbOrder, setTbOrder] = useState<TiebreakerCriterion[]>(
    tournament.settings.tiebreakerOrder ?? DEFAULT_TIEBREAKER_ORDER,
  );
  const [tbDragIdx, setTbDragIdx] = useState<number | null>(null);
  const [tbDragOverIdx, setTbDragOverIdx] = useState<number | null>(null);
  const [tbSaved, setTbSaved] = useState(false);

  // Team removal
  const [teamRemoved, setTeamRemoved] = useState(false);

  // PIN change
  const [pinChangeOpen, setPinChangeOpen] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinChanged, setPinChanged] = useState(false);

  // Collapsible sections
  const [teamMgmtOpen, setTeamMgmtOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [rostersOpen, setRostersOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [tiebreakerOpen, setTiebreakerOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  // awardsOpen removed — awards are always visible

  // Roster settings
  const [maxBirthYearEdit, setMaxBirthYearEdit] = useState(tournament.settings.maxBirthYear ? String(tournament.settings.maxBirthYear) : '');
  const [maxPlayersEdit, setMaxPlayersEdit] = useState(tournament.settings.maxPlayersPerRoster ? String(tournament.settings.maxPlayersPerRoster) : '');
  const [rosterSettingsSaved, setRosterSettingsSaved] = useState(false);

  // Roster management
  const [rosterMap, setRosterMap] = useState<Record<string, RosterSubmission>>({});
  const [rosterLinkCopied, setRosterLinkCopied] = useState<string | null>(null);
  const [rosterPreview, setRosterPreview] = useState<RosterSubmission | null>(null);
  const [rosterAccepted, setRosterAccepted] = useState<string | null>(null);
  const [adminRosterTeamId, setAdminRosterTeamId] = useState<string | null>(null);
  const generateRosterTokens = useTournamentStore(s => s.generateRosterTokens);
  const acceptRoster = useTournamentStore(s => s.acceptRoster);
  const firebaseUid = useTournamentStore(s => s.firebaseUid);
  const createOrUpdateContact = useContactsStore(s => s.createOrUpdateContact);

  // Subscribe to roster submissions in real-time
  useEffect(() => {
    const hasTokens = tournament.teams.some(tm => tm.rosterToken);
    if (!hasTokens) return;
    const unsubscribe = subscribeToRosters(tournament.id, (rosters) => {
      setRosterMap(rosters);
    });
    return unsubscribe;
  }, [tournament.id, tournament.teams]);

  // Registration management
  const [registrationMap, setRegistrationMap] = useState<Record<string, RegistrationSubmission>>({});
  const [regLinkCopied, setRegLinkCopied] = useState(false);
  const [regApproved, setRegApproved] = useState<string | null>(null);
  const approveRegistration = useTournamentStore(s => s.approveRegistration);
  const rejectRegistration = useTournamentStore(s => s.rejectRegistration);

  // Subscribe to registration submissions in real-time
  useEffect(() => {
    if (!tournament.settings.registrationEnabled) return;
    const unsubscribe = subscribeToRegistrations(tournament.id, (regs) => {
      setRegistrationMap(regs);
    });
    return unsubscribe;
  }, [tournament.id, tournament.settings.registrationEnabled]);

  const deleteTournament = useTournamentStore(s => s.deleteTournament);
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const regenerateSchedule = useTournamentStore(s => s.regenerateSchedule);
  const removeTeam = useTournamentStore(s => s.removeTeam);
  const saveTemplate = useTemplatesStore(s => s.saveTemplate);
  const showToast = useToastStore(s => s.show);

  useEffect(() => {
    generateQRCodeDataUrl(tournament.id).then(setQrUrl).catch(() => {});
  }, [tournament.id]);

  const publicUrl = getTournamentPublicUrl(tournament.id);

  const handleCopy = async () => {
    await copyToClipboard(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAdminLink = async () => {
    const adminUrl = getAdminInviteUrl(tournament.id);
    await copyToClipboard(adminUrl);
    setAdminCopied(true);
    setTimeout(() => setAdminCopied(false), 2000);
  };

  const handleDelete = async () => {
    const ok = await ask({ title: t('confirm.deleteTournament'), message: t('confirm.deleteTournamentMsg', { name: tournament.name }), destructive: true });
    if (ok) {
      deleteTournament(tournament.id);
      navigate({ name: 'tournament-list' });
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!firebaseUid) return;
    try {
      const template: TournamentTemplate = {
        id: generateId(),
        name: tournament.name,
        createdAt: new Date().toISOString(),
        settings: { ...tournament.settings },
        teamSnapshots: (tournament.teams ?? []).map(tm => ({
          name: tm.name,
          color: tm.color,
          clubId: tm.clubId ?? null,
          logoBase64: tm.logoBase64 ?? null,
          playerCount: (tm.players ?? []).length,
        })),
        teamCount: (tournament.teams ?? []).length,
        sourceTournamentName: tournament.name,
      };
      await saveTemplate(firebaseUid, template);
      showToast('success', t('template.saved'));
    } catch (err) {
      logger.error('[Template] Save failed:', err);
      showToast('error', t('tournament.detail.templateSaveError'));
    }
  };

  const handlePublicView = () => {
    navigate({ name: 'tournament-public', tournamentId: tournament.id });
  };

  // PDF export
  const [pdfExporting, setPdfExporting] = useState(false);
  const handlePdfExport = async () => {
    setPdfExporting(true);
    try {
      await exportTournamentPdf(tournament, t, locale);
    } catch (err) {
      logger.error('[PDF] Export failed:', err);
      useToastStore.getState().show(t('pdf.exportFailed'), 'error');
    } finally {
      setPdfExporting(false);
    }
  };

  const handleSaveRules = () => {
    updateTournament(tournament.id, { settings: { ...tournament.settings, rules: rulesEdit.trim() || undefined } });
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 2000);
  };

  const handleRegenerate = async () => {
    const scheduledCount = tournament.matches.filter(m => m.status === 'scheduled').length;
    const finishedCount = tournament.matches.filter(m => m.status === 'finished' || m.status === 'live').length;
    const msg = finishedCount > 0
      ? t('confirm.regenerateWithFinished', { scheduled: scheduledCount, finished: finishedCount })
      : t('confirm.regenerateAll', { scheduled: scheduledCount });
    const ok = await ask({ title: t('confirm.regenerateTitle'), message: msg });
    if (!ok) return;
    const newSettings = {
      ...tournament.settings,
      startDate: regenDate,
      startTime: regenTime,
      matchDurationMinutes: regenDuration,
      breakBetweenMatchesMinutes: regenBreak,
      numberOfPitches: regenPitches > 1 ? regenPitches : undefined,
    };
    await regenerateSchedule(tournament.id, newSettings);
    setRegenSaved(true);
    setTimeout(() => setRegenSaved(false), 2500);
  };

  // Inline stepper helper for SettingsTab
  const SettingsStepper = ({ value, min, max, onChange, label, unit }: {
    value: number; min: number; max: number;
    onChange: (v: number) => void; label: string; unit: string;
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{value} {unit}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease"
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 20, color: value <= min ? 'var(--text-muted)' : 'var(--text)' }}>−</button>
        <span style={{ fontWeight: 800, fontSize: 18, minWidth: 36, textAlign: 'center', color: 'var(--primary)' }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase"
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 20, color: value >= max ? 'var(--text-muted)' : 'var(--text)' }}>+</button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* QR kód */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, alignSelf: 'flex-start' }}>📱 {t('tournament.settings.qrTitle')}</h3>
        {qrUrl
          ? <img src={qrUrl} alt={t('tournament.settings.qrAlt')} style={{ width: 200, height: 200, borderRadius: 12 }} />
          : <div style={{ width: 200, height: 200, borderRadius: 12, background: 'var(--surface-var)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)' }}>{t('tournament.detail.loadingQr')}</div>
        }
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
          {t('tournament.settings.qrDesc')}
        </p>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button onClick={handleCopy} style={{
            flex: 1, background: copied ? '#2E7D32' : 'var(--primary)', color: '#fff', fontWeight: 700,
            fontSize: 14, padding: '10px 12px', borderRadius: 12, transition: 'background .2s',
          }}>
            {copied ? `✅ ${t('common.copied')}` : `🔗 ${t('common.copyLink')}`}
          </button>
          <button onClick={handlePublicView} style={{
            flex: 1, background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
            fontSize: 14, padding: '10px 12px', borderRadius: 10,
          }}>
            👁 {t('tournament.settings.viewAsGuest')}
          </button>
        </div>
      </div>

      {/* Admin invite link — jen pro ownery */}
      {isOwner && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>🔑 {t('tournament.settings.refereeLinkTitle')}</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
            {t('tournament.settings.refereeLinkDesc')}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0, fontStyle: 'italic' }}>
            💡 {t('tournament.settings.refereeLinkHint')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleCopyAdminLink} style={{
              flex: 1, background: adminCopied ? '#2E7D32' : '#E65100', color: '#fff', fontWeight: 700,
              fontSize: 13, padding: '10px 14px', borderRadius: 10, transition: 'background .2s',
              minWidth: 0,
            }}>
              {adminCopied ? `✅ ${t('common.copied')}` : `🔗 ${t('tournament.settings.copyRefereeLink')}`}
            </button>
            <a
              href={(() => {
                const url = getAdminInviteUrl(tournament.id);
                const msg = t('tournament.settings.refereeWhatsapp', { tournament: tournament.name, url });
                return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
              })()}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: '#E8F5E9', color: '#2E7D32',
                border: 'none', cursor: 'pointer', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              💬 WhatsApp
            </a>
            <a
              href={(() => {
                const url = getAdminInviteUrl(tournament.id);
                const subject = t('tournament.settings.refereeEmailSubject', { tournament: tournament.name });
                const body = t('tournament.settings.refereeEmailBody', { tournament: tournament.name, url });
                return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
              })()}
              style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: 'var(--primary-light)', color: 'var(--primary)',
                border: 'none', cursor: 'pointer', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              📧 E-mail
            </a>
          </div>
        </div>
      )}

      {/* ═══════════════ NASTAVENÍ TURNAJE ═══════════════ */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>
        ⚙️ {t('settings.sectionTournament')}
      </div>

      {/* Viditelnost střelců + Chat — toggley */}
      {isOwner && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Scorer visibility */}
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>⚽ {t('tournament.scorers.visibilityTitle')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.scorers.visibilityDesc')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[true, false].map(val => (
              <button
                key={String(val)}
                onClick={async () => {
                  await updateTournament(tournament.id, {
                    settings: { ...tournament.settings, scorersVisible: val },
                  });
                }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                  background: (tournament.settings.scorersVisible ?? true) === val ? 'var(--primary)' : 'var(--surface-var)',
                  color: (tournament.settings.scorersVisible ?? true) === val ? '#fff' : 'var(--text)',
                  transition: 'background .15s',
                }}
              >
                {val ? `👁 ${t('tournament.scorers.visible')}` : `🔒 ${t('tournament.scorers.hidden')}`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Chat toggle */}
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>💬 {t('tournament.chat.enableTitle')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.chat.enableDesc')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[true, false].map(val => (
              <button
                key={String(val)}
                onClick={async () => {
                  await updateTournament(tournament.id, {
                    settings: { ...tournament.settings, chatEnabled: val },
                  });
                  // Při zapnutí chatu odešle uvítací zprávu (pokud je chat prázdný)
                  if (val) {
                    sendWelcomeChatMessage(
                      tournament.id,
                      tournament.name,
                      t('tournament.chat.welcome', { tournament: tournament.name }),
                    ).catch(() => {});
                  }
                }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                  background: (tournament.settings.chatEnabled ?? false) === val ? 'var(--primary)' : 'var(--surface-var)',
                  color: (tournament.settings.chatEnabled ?? false) === val ? '#fff' : 'var(--text)',
                  transition: 'background .15s',
                }}
              >
                {val ? `✅ ${t('tournament.chat.enabled')}` : `❌ ${t('tournament.chat.disabled')}`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* MVP voting toggle */}
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>⭐ {t('tournament.mvp.enableTitle')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.mvp.enableDesc')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[true, false].map(val => (
              <button
                key={String(val)}
                onClick={async () => {
                  await updateTournament(tournament.id, {
                    settings: { ...tournament.settings, mvpVotingEnabled: val },
                  });
                }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                  background: (tournament.settings.mvpVotingEnabled ?? false) === val ? 'var(--primary)' : 'var(--surface-var)',
                  color: (tournament.settings.mvpVotingEnabled ?? false) === val ? '#fff' : 'var(--text)',
                  transition: 'background .15s',
                }}
              >
                {val ? `✅ ${t('tournament.mvp.enabled')}` : `❌ ${t('tournament.mvp.disabled')}`}
              </button>
            ))}
          </div>

          {/* MVP results — inline under toggle */}
          <MvpResults tournamentId={tournament.id} teams={tournament.teams} />
        </div>
      </div>
      )}

      {/* Awards — ocenění turnaje */}
      {isOwner && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>🏅 {t('tournament.awards.title')}</h3>
        <AwardsEditor tournament={tournament} />
      </div>
      )}

      {/* PDF + CSV export */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>📤 {t('settings.sectionExport')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
          {t('pdf.downloadDesc')}
        </p>
        <button onClick={handlePdfExport} disabled={pdfExporting} style={{
          background: pdfExporting ? 'var(--border)' : 'var(--primary)', color: pdfExporting ? 'var(--text-muted)' : '#fff',
          fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12,
          cursor: pdfExporting ? 'wait' : 'pointer', transition: 'background .2s',
        }}>
          {pdfExporting ? `⏳ ${t('pdf.generating')}` : `📄 ${t('pdf.downloadPdf')}`}
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => exportTournamentStandingsCSV(tournament, t)} style={{
            background: 'var(--surface-var)', fontWeight: 600, fontSize: 13, padding: '8px 14px',
            borderRadius: 8, color: 'var(--text)',
          }}>
            📊 {t('csv.exportStandings')}
          </button>
          <button onClick={() => exportTournamentMatchesCSV(tournament, t)} style={{
            background: 'var(--surface-var)', fontWeight: 600, fontSize: 13, padding: '8px 14px',
            borderRadius: 8, color: 'var(--text)',
          }}>
            📋 {t('csv.exportMatches')}
          </button>
          <button onClick={() => exportTournamentScorersCSV(tournament, t)} style={{
            background: 'var(--surface-var)', fontWeight: 600, fontSize: 13, padding: '8px 14px',
            borderRadius: 8, color: 'var(--text)',
          }}>
            ⚽ {t('csv.exportScorers')}
          </button>
        </div>
      </div>

      {/* ═══════════════ ORGANIZACE TURNAJE ═══════════════ */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>
        🏆 {t('settings.sectionOrganization')}
      </div>

      {/* Registration — team sign-up management (collapsible) */}
      {isOwner && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setRegistrationOpen(!registrationOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>📝 {t('registration.adminTitle')}</h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
            {tournament.settings.registrationEnabled ? `✅ ${t('registration.enabled')}` : `❌ ${t('registration.disabled')}`}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: registrationOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>

        {registrationOpen && <>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
          {t('registration.adminDesc')}
        </p>

        {/* Enable/disable toggle */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[true, false].map(val => (
            <button
              key={String(val)}
              onClick={() => updateTournament(tournament.id, { settings: { ...tournament.settings, registrationEnabled: val } })}
              style={{
                flex: 1, padding: '8px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: tournament.settings.registrationEnabled === val ? 'var(--primary)' : 'var(--surface-var)',
                color: tournament.settings.registrationEnabled === val ? '#fff' : 'var(--text-muted)',
                border: 'none',
              }}
            >
              {val ? `✅ ${t('registration.enabled')}` : `❌ ${t('registration.disabled')}`}
            </button>
          ))}
        </div>

        {tournament.settings.registrationEnabled && (
          <>
            {/* Copy registration link + WhatsApp */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  try {
                    await copyToClipboard(getRegistrationUrl(tournament.id));
                    setRegLinkCopied(true);
                    setTimeout(() => setRegLinkCopied(false), 2000);
                  } catch { /* clipboard not available */ }
                }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: regLinkCopied ? '#E8F5E9' : 'var(--primary-light)',
                  color: regLinkCopied ? '#2E7D32' : 'var(--primary)',
                  border: 'none',
                }}
              >
                {regLinkCopied ? `✅ ${t('registration.linkCopied')}` : `🔗 ${t('registration.copyLink')}`}
              </button>
              <a
                href={(() => {
                  const url = getRegistrationUrl(tournament.id);
                  const d = tournament.settings.startDate;
                  const dateStr = d ? new Date(d + 'T00:00:00').toLocaleDateString(getDateLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
                  const timeStr = tournament.settings.startTime || '';
                  const msg = t('registration.whatsappMessage', { tournament: tournament.name, url, date: dateStr, time: timeStr });
                  return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                })()}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: '#E8F5E9', color: '#2E7D32',
                  border: 'none', cursor: 'pointer', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                💬 WhatsApp
              </a>
            </div>

            {/* Pending registrations */}
            {(() => {
              const pending = Object.entries(registrationMap);
              if (pending.length === 0) {
                return (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
                    {t('registration.noPending')}
                  </p>
                );
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pending.map(([regId, reg]) => (
                    <div key={regId} style={{
                      padding: '10px 12px', background: 'var(--surface-var)', borderRadius: 12,
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>👕 {reg.teamName}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('registration.pending')}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        👤 {reg.coachName} · 📞 {reg.coachPhone}{reg.coachEmail ? ` · ${reg.coachEmail}` : ''}
                      </p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={async () => {
                            try {
                              await approveRegistration(tournament.id, regId, reg);
                              if (firebaseUid && reg.coachPhone) {
                                createOrUpdateContact(firebaseUid, {
                                  name: reg.coachName,
                                  phone: reg.coachPhone,
                                  email: reg.coachEmail || undefined,
                                  clubId: null,
                                  clubName: reg.teamName,
                                }).catch(() => {});
                              }
                              setRegApproved(regId);
                              setTimeout(() => setRegApproved(null), 2500);
                            } catch {
                              showToast(t('common.error'), 'error');
                            }
                          }}
                          style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            background: regApproved === regId ? '#E8F5E9' : '#E8F5E9',
                            color: '#2E7D32', border: '1px solid #C8E6C9', cursor: 'pointer',
                          }}
                        >
                          ✅ {regApproved === regId ? t('registration.approved') : t('registration.approve')}
                        </button>
                        <button
                          onClick={() => rejectRegistration(tournament.id, regId).catch(() => showToast(t('common.error'), 'error'))}
                          style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            background: 'var(--surface)', color: '#C62828',
                            border: '1px solid var(--border)', cursor: 'pointer',
                          }}
                        >
                          ✕ {t('registration.reject')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}
        </>}
      </div>
      )}

      {/* Soupisky — roster management (collapsible) */}
      {isOwner && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setRostersOpen(!rostersOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>{t('roster.adminTitle')}</h3>
          {(() => {
            const submitted = Object.keys(rosterMap).length;
            const total = tournament.teams.length;
            const hasTokens = tournament.teams.some(tm => tm.rosterToken);
            return hasTokens ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                {submitted}/{total}
              </span>
            ) : null;
          })()}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: rostersOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>

        {rostersOpen && <>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
          {t('roster.adminDesc')}
        </p>

        {/* Generate links button — if teams don't have tokens yet */}
        {!tournament.teams.some(tm => tm.rosterToken) && (
          <button
            onClick={() => generateRosterTokens(tournament.id)}
            style={{
              background: 'var(--primary)', color: '#fff', fontWeight: 700,
              fontSize: 14, padding: '12px 20px', borderRadius: 12,
            }}
          >
            🔗 {t('roster.generateLinks')}
          </button>
        )}

        {/* Per-team roster status */}
        {tournament.teams.some(tm => tm.rosterToken) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tournament.teams.map(team => {
              const submission = rosterMap[team.id];
              const isAccepted = !!team.rosterSubmittedAt;
              const isSubmitted = !!submission;

              const status = isAccepted
                ? t('roster.statusAccepted')
                : isSubmitted
                  ? t('roster.statusSubmitted')
                  : t('roster.statusWaiting');

              return (
                <div key={team.id} style={{
                  padding: '10px 12px', background: 'var(--surface-var)', borderRadius: 12,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TeamBadge team={team} size={14} />
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {team.name}
                    </span>
                    <span style={{ fontSize: 12, flexShrink: 0 }}>{status}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {/* Admin fill */}
                    <button
                      onClick={() => setAdminRosterTeamId(team.id)}
                      style={{
                        padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: 'var(--primary-light)', color: 'var(--primary)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      ✏️ {t('roster.fillRoster')}
                    </button>

                    {/* Copy link */}
                    {team.rosterToken && (
                      <button
                        onClick={async () => {
                          const url = getRosterFormUrl(tournament.id, team.rosterToken!);
                          await copyToClipboard(url);
                          setRosterLinkCopied(team.id);
                          setTimeout(() => setRosterLinkCopied(null), 2000);
                        }}
                        style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: rosterLinkCopied === team.id ? '#E8F5E9' : 'var(--primary-light)',
                          color: rosterLinkCopied === team.id ? '#2E7D32' : 'var(--primary)',
                          border: 'none', cursor: 'pointer',
                        }}
                      >
                        {rosterLinkCopied === team.id ? '✅' : '🔗'} {rosterLinkCopied === team.id ? t('roster.linkCopied') : t('roster.copyLink')}
                      </button>
                    )}

                    {/* WhatsApp share */}
                    {team.rosterToken && (
                      <a
                        href={(() => {
                          const url = getRosterFormUrl(tournament.id, team.rosterToken!);
                          const d = tournament.settings.startDate;
                          const dateStr = d ? new Date(d + 'T00:00:00').toLocaleDateString(getDateLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
                          const timeStr = tournament.settings.startTime || '';
                          const msg = t('roster.whatsappMessage', { tournament: tournament.name, team: team.name, url, date: dateStr, time: timeStr });
                          return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                        })()}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: '#E8F5E9', color: '#2E7D32',
                          border: 'none', cursor: 'pointer', textDecoration: 'none',
                          display: 'inline-flex', alignItems: 'center', gap: 2,
                        }}
                      >
                        💬 WhatsApp
                      </a>
                    )}

                    {/* Preview button */}
                    {isSubmitted && (
                      <button
                        onClick={() => setRosterPreview(submission)}
                        style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: 'var(--surface)', color: 'var(--text-muted)',
                          border: '1px solid var(--border)', cursor: 'pointer',
                        }}
                      >
                        👁 {t('roster.preview')}
                      </button>
                    )}

                    {/* Accept button */}
                    {isSubmitted && !isAccepted && (
                      <button
                        onClick={async () => {
                          await acceptRoster(tournament.id, team.id, submission);
                          // Save coach contact to contacts database
                          if (firebaseUid && submission.coach.phone) {
                            createOrUpdateContact(firebaseUid, {
                              name: submission.coach.name,
                              phone: submission.coach.phone,
                              email: submission.coach.email || undefined,
                              clubId: team.clubId ?? null,
                              clubName: team.name,
                            }).catch(() => {}); // non-critical
                          }
                          setRosterAccepted(team.id);
                          setTimeout(() => setRosterAccepted(null), 2500);
                        }}
                        style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          background: rosterAccepted === team.id ? '#E8F5E9' : '#E8F5E9',
                          color: '#2E7D32', border: '1px solid #C8E6C9', cursor: 'pointer',
                        }}
                      >
                        ✅ {rosterAccepted === team.id ? t('roster.acceptSuccess') : t('roster.accept')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>}
      </div>
      )}

      {/* Propozice — collapsible */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setRulesOpen(!rulesOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>📋 {t('tournament.settings.rulesTitle')}</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: rulesOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>

        {rulesOpen && <>
        <textarea
          value={rulesEdit}
          onChange={e => { setRulesEdit(e.target.value); setRulesSaved(false); }}
          placeholder={t('tournament.settings.rulesPlaceholder')}
          rows={5}
          style={{
            width: '100%', padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)',
            fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            resize: 'vertical', lineHeight: 1.5,
          }}
        />
        <button onClick={handleSaveRules} style={{
          background: rulesSaved ? '#2E7D32' : 'var(--primary)', color: '#fff',
          fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 12,
          alignSelf: 'flex-start', transition: 'background .2s',
        }}>
          {rulesSaved ? '✅ ' + t('tournament.detail.rulesSaved') : t('tournament.detail.saveRules')}
        </button>
        </>}
      </div>

      {/* Kritéria pro umístění v tabulce — collapsible */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setTiebreakerOpen(!tiebreakerOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>🏅 {t('tournament.tiebreaker.title')}</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: tiebreakerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>

        {tiebreakerOpen && <>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.5 }}>
          {isOwner ? t('tournament.tiebreaker.desc') : t('tournament.tiebreaker.descReadonly')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Fixní #1 — Body */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', background: 'var(--surface-var)', borderRadius: 10, opacity: 0.6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 11, background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0,
            }}>1</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('tournament.tiebreaker.points')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>— {t('tournament.tiebreaker.pointsDesc')}</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>🔒</span>
          </div>

          {/* Draggable criteria */}
          {tbOrder.map((criterion, idx) => {
            const isDragging = tbDragIdx === idx;
            const isDragOver = tbDragOverIdx === idx && tbDragIdx !== idx;
            return (
              <div
                key={criterion}
                draggable={isOwner}
                onDragStart={() => { setTbDragIdx(idx); }}
                onDragOver={(e) => { e.preventDefault(); setTbDragOverIdx(idx); }}
                onDrop={() => {
                  if (tbDragIdx === null || tbDragIdx === idx) { setTbDragIdx(null); setTbDragOverIdx(null); return; }
                  setTbOrder(prev => {
                    const next = [...prev];
                    const [moved] = next.splice(tbDragIdx, 1);
                    next.splice(idx, 0, moved);
                    return next;
                  });
                  setTbDragIdx(null);
                  setTbDragOverIdx(null);
                  setTbSaved(false);
                }}
                onDragEnd={() => { setTbDragIdx(null); setTbDragOverIdx(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 8px', background: 'var(--surface-var)', borderRadius: 10,
                  opacity: isDragging ? 0.4 : 1,
                  borderTop: isDragOver ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                  transition: 'opacity .15s, border-color .15s',
                  cursor: isOwner ? 'grab' : 'default',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 11, background: 'var(--primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0,
                }}>{idx + 2}</div>
                {isOwner && <span style={{ cursor: 'grab', fontSize: 14, color: 'var(--text-muted)', flexShrink: 0, userSelect: 'none' }}>⠿</span>}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t(`tournament.tiebreaker.${criterion}`)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>— {t(`tournament.tiebreaker.${criterion}Desc`)}</span>
                </div>
              </div>
            );
          })}

          {/* Fixní poslední — Abeceda */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', background: 'var(--surface-var)', borderRadius: 10, opacity: 0.6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 11, background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0,
            }}>{tbOrder.length + 2}</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('tournament.tiebreaker.alphabet')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>— {t('tournament.tiebreaker.alphabetDesc')}</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>🔒</span>
          </div>
        </div>

        {/* Tlačítko Uložit (jen owner) */}
        {isOwner && (
          <button
            onClick={async () => {
              await updateTournament(tournament.id, {
                settings: { ...tournament.settings, tiebreakerOrder: tbOrder },
              });
              setTbSaved(true);
              setTimeout(() => setTbSaved(false), 2000);
            }}
            style={{
              marginTop: 4, width: '100%',
              background: tbSaved ? '#2E7D32' : 'var(--primary)', color: '#fff',
              fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12,
              transition: 'background .2s',
            }}
          >
            {tbSaved ? `✅ ${t('tournament.tiebreaker.saved')}` : `💾 ${t('tournament.tiebreaker.title')}`}
          </button>
        )}
        </>}
      </div>

      {/* ── Správa týmů — collapsible, default closed ── */}
      {isOwner && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setTeamMgmtOpen(!teamMgmtOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>👥 {t('settings.teamManagement')}</h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
            {tournament.teams.length} {t('settings.teamsCount')}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: teamMgmtOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
        {!teamMgmtOpen && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
            {t('settings.teamManagementHint')}
          </p>
        )}
        {teamMgmtOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tournament.teams.map(team => (
              <div key={team.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', background: 'var(--surface-var)', borderRadius: 10,
              }}>
                <TeamBadge team={team} size={14} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {team.name}
                </span>
                <button
                  onClick={async () => {
                    const ok = await ask({
                      title: t('settings.removeTeamTitle'),
                      message: t('settings.removeTeamMsg', { team: team.name }),
                    });
                    if (ok) {
                      await removeTeam(tournament.id, team.id);
                      setTeamRemoved(true);
                      setTimeout(() => setTeamRemoved(false), 2000);
                    }
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: '#FFEBEE', color: '#C62828',
                    border: '1px solid #FFCDD2', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  ✕ {t('common.remove')}
                </button>
              </div>
            ))}
            {teamRemoved && (
              <p style={{ fontSize: 12, color: '#2E7D32', fontWeight: 600, margin: 0 }}>
                ✅ {t('settings.teamRemoved')}
              </p>
            )}
          </div>
        )}
      </div>
      )}

      {/* Přegenerování harmonogramu — collapsible */}
      {isOwner && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setRegenOpen(!regenOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>🔄 {t('tournament.detail.regenerateSchedule')}</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: regenOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>

        {regenOpen && <>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
          {t('tournament.detail.regenerateDesc')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{t('tournament.detail.dateLabel')}</label>
              <input
                type="date"
                value={regenDate}
                onChange={e => setRegenDate(e.target.value)}
                style={{
                  padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)',
                  fontSize: 14, background: 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{t('tournament.settings.startTimeLabel')}</label>
              <input
                type="time"
                value={regenTime}
                onChange={e => setRegenTime(e.target.value)}
                style={{
                  padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)',
                  fontSize: 14, background: 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <SettingsStepper label={t('tournament.detail.matchDuration')} value={regenDuration} min={1} max={120} onChange={setRegenDuration} unit="min" />
          <div style={{ height: 1, background: 'var(--border)' }} />
          <SettingsStepper label={t('tournament.detail.breakDuration')} value={regenBreak} min={0} max={15} onChange={setRegenBreak} unit="min" />
          <div style={{ height: 1, background: 'var(--border)' }} />
          <SettingsStepper label={t('tournament.detail.pitchCountLabel')} value={regenPitches} min={1} max={8} onChange={setRegenPitches} unit={t('tournament.detail.pitchUnit')} />
        </div>
        <button
          onClick={handleRegenerate}
          disabled={!regenDate || !regenTime}
          style={{
            background: regenSaved ? '#2E7D32' : 'var(--primary)', color: '#fff',
            fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12,
            transition: 'background .2s', opacity: (!regenDate || !regenTime) ? 0.5 : 1,
          }}
        >
          {regenSaved ? '✅ ' + t('tournament.detail.scheduleRegenerated') : '🔄 ' + t('tournament.detail.regenerateSchedule')}
        </button>
        </>}
      </div>
      )}

      {/* Roster preview modal */}
      {rosterPreview && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setRosterPreview(null)}
        >
          <div
            style={{ background: 'var(--surface)', borderRadius: 20, padding: '24px', width: '100%', maxWidth: 400, maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>{t('roster.previewTitle')}</h3>
              <button onClick={() => setRosterPreview(null)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('roster.coach')}</div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: '2px 0' }}>{rosterPreview.coach.name}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0' }}>📞 {rosterPreview.coach.phone}</p>
              {rosterPreview.coach.email && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0' }}>📧 {rosterPreview.coach.email}</p>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              {t('roster.players')} ({rosterPreview.players.length})
            </div>
            {rosterPreview.players.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: i < rosterPreview.players.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', width: 28, textAlign: 'center' }}>
                  {p.jerseyNumber || '–'}
                </span>
                <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
                {p.birthYear && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.birthYear}</span>
                )}
              </div>
            ))}

            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
              {t('roster.statusSubmitted')} · {new Date(rosterPreview.submittedAt).toLocaleString(getDateLocale(locale))}
            </p>
          </div>
        </div>
      )}

      {/* Admin roster fill sheet */}
      {adminRosterTeamId && (() => {
        const rosterTeam = tournament.teams.find(tm => tm.id === adminRosterTeamId);
        if (!rosterTeam) return null;
        return (
          <AdminRosterSheet
            tournament={tournament}
            team={rosterTeam}
            rosterMap={rosterMap}
            onClose={() => setAdminRosterTeamId(null)}
          />
        );
      })()}

      {/* Změna PINu */}
      {isOwner && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14,
          border: '1.5px solid var(--border)', overflow: 'hidden',
        }}>
          <div
            onClick={() => setPinChangeOpen(!pinChangeOpen)}
            style={{
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8,
            }}
          >
            <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>🔐 {t('tournament.settings.changePin')}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: pinChangeOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </div>
          {pinChangeOpen && (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                {t('tournament.settings.changePinDesc')}
              </p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={e => { setNewPin(e.target.value.replace(/\D/g, '')); setPinChanged(false); }}
                placeholder="••••"
                style={{
                  width: '100%', padding: '12px', borderRadius: 12, fontSize: 20,
                  border: '2px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', letterSpacing: 8, textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              />
              <button
                disabled={newPin.length < 4}
                onClick={async () => {
                  const salt = generatePinSalt();
                  const hash = await hashPin(newPin, salt);
                  await updateTournament(tournament.id, { pinHash: hash, pinSalt: salt });
                  setPinChanged(true);
                  setNewPin('');
                  setTimeout(() => setPinChanged(false), 3000);
                }}
                style={{
                  background: newPin.length < 4 ? 'var(--border)' : 'var(--primary)',
                  color: newPin.length < 4 ? 'var(--text-muted)' : '#fff',
                  fontWeight: 700, fontSize: 14, padding: '12px', borderRadius: 12,
                }}
              >
                {pinChanged ? '✅ ' + t('tournament.settings.pinChanged') : t('tournament.settings.changePinBtn')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* MVP výsledky — removed, now shown inline under toggle */}

      {/* Uložit jako šablonu */}
      {isOwner && (
        <button onClick={handleSaveAsTemplate} style={{
          background: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: 14,
          padding: '14px', borderRadius: 14, border: '1.5px solid #C8E6C9',
        }}>
          📋 {t('template.saveAsTemplate')}
        </button>
      )}

      {/* Nebezpečná zóna */}
      {isOwner ? (
        <button onClick={handleDelete} style={{
          background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 14,
          padding: '14px', borderRadius: 14, border: '1.5px solid #FFCDD2',
        }}>
          🗑 {t('tournament.settings.deleteTournament')}
        </button>
      ) : (
        <button onClick={async () => {
          const ok = await ask({ title: t('confirm.leaveTournament'), message: t('confirm.leaveTournamentMsg') });
          if (ok) {
            await leaveTournament(tournament.id);
            navigate({ name: 'tournament-list' });
          }
        }} style={{
          background: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 14,
          padding: '14px', borderRadius: 14, border: '1.5px solid #FFE0B2',
        }}>
          🚪 {t('tournament.settings.leaveTournament')}
        </button>
      )}
    </div>
  );
}

// ─── Awards Editor ──────────────────────────────────────────────────────────
/** i18n klíče pro výchozí ocenění — ukládáme klíč, zobrazujeme překlad */
const AWARD_TITLE_KEYS = [
  'tournament.awards.bestPlayer',
  'tournament.awards.bestGoalkeeper',
] as const;

/** Všechny klíče pro překlad (včetně bestScorer pro zpětnou kompatibilitu) */
const ALL_AWARD_KEYS = [...AWARD_TITLE_KEYS, 'tournament.awards.bestScorer', 'tournament.awards.fanFavorite'] as const;

/** Pokud title je i18n klíč, vrátí překlad; jinak vrátí title as-is */
export function translateAwardTitle(title: string, t: (key: string) => string): string {
  if ((ALL_AWARD_KEYS as readonly string[]).includes(title)) return t(title);
  return title;
}

function AwardsEditor({ tournament }: { tournament: Tournament }) {
  const { t } = useI18n();
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const awards = tournament.settings.awards ?? [];

  const saveAward = async (titleKey: string, playerName: string, teamId?: string) => {
    const existing = awards.findIndex(a => a.title === titleKey);
    let updated: typeof awards;
    if (existing >= 0) {
      updated = awards.map((a, i) => i === existing ? { ...a, playerName, teamId } : a);
    } else {
      updated = [...awards, { title: titleKey, playerName, teamId }];
    }
    await updateTournament(tournament.id, {
      settings: { ...tournament.settings, awards: updated },
    });
  };

  const clearAward = async (titleKey: string) => {
    const updated = awards.filter(a => a.title !== titleKey);
    await updateTournament(tournament.id, {
      settings: { ...tournament.settings, awards: updated },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {AWARD_TITLE_KEYS.map(key => {
        const award = awards.find(a => a.title === key);
        return (
          <AwardRow
            key={key}
            titleKey={key}
            label={t(key)}
            tournament={tournament}
            currentPlayerName={award?.playerName}
            currentTeamId={award?.teamId}
            onSave={(playerName, teamId) => saveAward(key, playerName, teamId)}
            onClear={() => clearAward(key)}
          />
        );
      })}
    </div>
  );
}

/** Jeden řádek ocenění — kompaktní výběr hráče */
function AwardRow({ titleKey, label, tournament, currentPlayerName, currentTeamId, onSave, onClear }: {
  titleKey: string;
  label: string;
  tournament: Tournament;
  currentPlayerName?: string;
  currentTeamId?: string;
  onSave: (playerName: string, teamId?: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [teamId, setTeamId] = useState(currentTeamId ?? '');
  const [playerId, setPlayerId] = useState('');
  const [playerName, setPlayerName] = useState(currentPlayerName ?? '');

  const team = teamId ? tournament.teams.find(tm => tm.id === teamId) : null;
  const players = team?.players ?? [];
  const currentTeam = currentTeamId ? tournament.teams.find(tm => tm.id === currentTeamId) : null;

  const icons: Record<string, string> = {
    'tournament.awards.bestPlayer': '⭐',
    'tournament.awards.bestGoalkeeper': '🧤',
  };

  const handleTeamSelect = (tid: string) => {
    setTeamId(tid);
    setPlayerId('');
    setPlayerName('');
  };

  const handlePlayerSelect = (pid: string, pName: string) => {
    setPlayerId(pid);
    setPlayerName(pName);
  };

  const handleSave = async () => {
    if (!playerName.trim()) return;
    await onSave(playerName.trim(), teamId || undefined);
    setEditing(false);
  };

  if (currentPlayerName && !editing) {
    // Uložené ocenění — zobrazení
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 14, background: 'var(--surface-var)',
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{icons[titleKey] ?? '🏆'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 1 }}>
            {currentPlayerName}{currentTeam ? ` · ${currentTeam.name}` : ''}
          </div>
        </div>
        <button
          onClick={() => { setEditing(true); setTeamId(currentTeamId ?? ''); setPlayerName(currentPlayerName ?? ''); }}
          style={{
            padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: 'var(--surface)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0,
          }}
        >✏️</button>
        <button
          onClick={onClear}
          style={{
            padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: '#FFEBEE', color: '#C62828',
            border: '1px solid #FFCDD2', cursor: 'pointer', flexShrink: 0,
          }}
        >✕</button>
      </div>
    );
  }

  // Needitované nebo editing — výběr hráče
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 14, background: 'var(--surface-var)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{icons[titleKey] ?? '🏆'}</span>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{label}</span>
        {editing && (
          <button
            onClick={() => setEditing(false)}
            style={{
              padding: '2px 8px', borderRadius: 8, fontSize: 11,
              background: 'var(--surface)', color: 'var(--text-muted)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
          >{t('common.cancel')}</button>
        )}
      </div>

      {/* Team select — custom dropdown */}
      <Dropdown
        trigger={
          <div style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {team ? (
              <ColorDot color={team.color ?? 'var(--primary)'} />
            ) : (
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>👕</span>
            )}
            <span style={{
              flex: 1, fontSize: 14, fontWeight: 600, textAlign: 'left',
              color: team ? 'var(--text)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {team ? team.name : t('tournament.awards.selectTeam')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>▾</span>
          </div>
        }
        triggerStyle={{
          width: '100%', padding: '10px 12px', borderRadius: 12,
          background: 'var(--bg)', border: '1.5px solid var(--border)',
        }}
        items={tournament.teams.map(tm => ({
          id: tm.id,
          label: tm.name,
          icon: <ColorDot color={tm.color ?? 'var(--primary)'} />,
          active: teamId === tm.id,
          accentColor: teamId === tm.id ? (tm.color ?? 'var(--primary)') : undefined,
          right: teamId === tm.id ? <span style={{ color: tm.color ?? 'var(--primary)' }}>✓</span> : undefined,
          onClick: () => handleTeamSelect(tm.id),
        }))}
        align="left"
        width="100%"
      />

      {/* Player select — custom dropdown */}
      {team && players.length > 0 && (
        <Dropdown
          trigger={
            <div style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>👤</span>
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 600, textAlign: 'left',
                color: playerId ? 'var(--text)' : 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {playerId ? playerName : t('tournament.awards.selectPlayer')}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>▾</span>
            </div>
          }
          triggerStyle={{
            width: '100%', padding: '10px 12px', borderRadius: 12,
            background: 'var(--bg)', border: '1.5px solid var(--border)',
          }}
          items={[...players].sort((a, b) => a.jerseyNumber - b.jerseyNumber).map(p => ({
            id: p.id,
            label: `#${p.jerseyNumber} ${p.name}`,
            active: playerId === p.id,
            right: playerId === p.id ? <span style={{ color: 'var(--primary)' }}>✓</span> : undefined,
            onClick: () => handlePlayerSelect(p.id, p.name),
          }))}
          align="left"
          width="100%"
        />
      )}

      {/* Save button */}
      {playerName.trim() && (
        <button
          onClick={handleSave}
          style={{
            padding: '8px', borderRadius: 12, fontSize: 13, fontWeight: 700,
            background: 'var(--primary)', color: '#fff',
            border: 'none', cursor: 'pointer',
          }}
        >{t('tournament.awards.confirm')}</button>
      )}
    </div>
  );
}
