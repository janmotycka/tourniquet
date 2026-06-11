import { useState, useEffect } from 'react';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import type { Tournament, RegistrationSubmission, BillingProfile, RosterSubmission } from '../../types/tournament.types';
import type { Page } from '../../App';
import { useI18n, getDateLocale } from '../../i18n';
import { getRegistrationUrl, getRosterFormUrl } from '../../utils/qr-code';
import { copyToClipboard } from '../../utils/training-share';
import { subscribeToRegistrations } from '../../services/registration.firebase';
import { subscribeToRosters } from '../../services/roster.firebase';
import { useTournamentStore } from '../../store/tournament.store';
import { useContactsStore } from '../../store/contacts.store';
import { useToastStore } from '../../store/toast.store';
import { useConfirmStore } from '../../store/confirm.store';
import { loadBillingProfile } from '../../services/billing.firebase';
import { generateInvoicePdf, createInvoiceDataFromApproval } from '../../utils/invoice-pdf';
import { TeamBadge } from './TeamBadge';
import { AdminRosterSheet } from './AdminRosterSheet';
import { exportTournamentPdf } from '../../utils/tournament-pdf';
import { GroupDrawModal } from './GroupDrawModal';
import { OfficialLinkButton } from '../ui';
// import { exportRegulationsPdf } from '../../utils/tournament-regulations-pdf'; // TODO: propozice PDF
import { useClubsStore } from '../../store/clubs.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { TEAM_COLORS } from '../../utils/team-colors';
import { OpponentAutocomplete } from '../clubs/OpponentAutocomplete';
import type { Club, AgeCategory } from '../../types/club.types';
import { getTournamentPublicUrl } from '../../utils/qr-code';

interface Props {
  tournament: Tournament;
  navigate: (p: Page) => void;
  isAdmin: boolean;
  justCreated: boolean;
  onDismissCreated: () => void;
}

export function DashboardTab({ tournament, isAdmin, justCreated, onDismissCreated }: Props) {
  const { t, locale } = useI18n();
  const { isDesktop } = useLayoutMode();
  const [copied, setCopied] = useState(false);
  // Audit 2026-04-24 strategic (user explicit): Simple mode amatérský trenér
  // potřebuje hlavně: vytisknout rozpis/pavouka + sdílet odkaz rodičům.
  // Přidáváme prominent „Quick actions" card nahoře v Simple módu.
  const isSimpleMode = useUserPrefsStore(s => s.appMode === 'simple');
  const [simpleLinkCopied, setSimpleLinkCopied] = useState(false);
  const [registrations, setRegistrations] = useState<Record<string, RegistrationSubmission>>({});
  const approveRegistration = useTournamentStore(s => s.approveRegistration);
  const rejectRegistration = useTournamentStore(s => s.rejectRegistration);
  const firebaseUid = useTournamentStore(s => s.firebaseUid);
  const createOrUpdateContact = useContactsStore(s => s.createOrUpdateContact);
  const showToast = useToastStore(s => s.show);

  // Post-approval action panel
  const [approvedTeam, setApprovedTeam] = useState<{
    teamName: string; coachName: string; coachEmail: string;
    coachPhone: string; rosterToken: string;
  } | null>(null);
  const [invoiceCounter, setInvoiceCounter] = useState(1);

  // Billing profile for invoices
  const [billingProfile, setBillingProfile] = useState<BillingProfile | null>(null);
  useEffect(() => {
    if (!firebaseUid) return;
    loadBillingProfile(firebaseUid).then(p => {
      if (p) setBillingProfile(p);
    }).catch(() => {});
  }, [firebaseUid]);

  // Roster management
  const [rosterMap, setRosterMap] = useState<Record<string, RosterSubmission>>({});
  const [rosterLinkCopied, setRosterLinkCopied] = useState<string | null>(null);
  const [rosterPreview, setRosterPreview] = useState<RosterSubmission | null>(null);
  const [rosterAccepted, setRosterAccepted] = useState<string | null>(null);
  const [adminRosterTeamId, setAdminRosterTeamId] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [showGroupDraw, setShowGroupDraw] = useState(false);
  const [regShareOpen, setRegShareOpen] = useState(!(tournament.settings.registrationClosed ?? false));
  const [rejectedOpen, setRejectedOpen] = useState(false);
  // Audit 2026-05-22: Týmy a Soupisky sekce sbalitelná (jako Přihlášky/Platby).
  // Default true (zachovat existing UX), user může sbalit pro kompaktní přehled.
  const [teamsExpanded, setTeamsExpanded] = useState(true);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [rejectedRegs, setRejectedRegs] = useState<Array<{ teamName: string; coachName: string; coachPhone: string }>>([]);
  const [rejectTarget, setRejectTarget] = useState<{ regId: string; reg: RegistrationSubmission } | null>(null);
  const [editTeamsMode, setEditTeamsMode] = useState(false);
  const acceptRoster = useTournamentStore(s => s.acceptRoster);
  const addManualTeam = useTournamentStore(s => s.addManualTeam);
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const removeTeam = useTournamentStore(s => s.removeTeam);
  const updateTeamName = useTournamentStore(s => s.updateTeamName);
  const toggleTeamPaid = useTournamentStore(s => s.toggleTeamPaid);
  const ask = useConfirmStore(s => s.ask);

  // Manual team adding (from club or custom)
  const clubs = useClubsStore(s => s.clubs);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [addTeamName, setAddTeamName] = useState('');
  const [addTeamCategory, setAddTeamCategory] = useState<{ club: Club; category?: AgeCategory } | null>(null);

  /** Wrapper pro addManualTeam — potvrdí a přegeneruje rozpis */
  const confirmAndAddTeam = async (team: Parameters<typeof addManualTeam>[1]) => {
    const ok = await ask({
      title: `➕ ${team.name}`,
      message: t('dashboard.addTeamConfirm'),
    });
    if (!ok) return false;
    try {
      await addManualTeam(tournament.id, team);
      setShowAddTeam(false);
      setAddTeamName('');
      setAddTeamCategory(null);
      showToast('success', `✅ ${team.name}`);
      return true;
    } catch {
      showToast('error', t('common.error'));
      return false;
    }
  };

  const isRegistration = tournament.settings.registrationEnabled ?? false;
  const regUrl = getRegistrationUrl(tournament.id);
  const maxTeams = tournament.settings.maxTeams ?? 16;
  const hasMatches = tournament.matches.length > 0;
  const hasEnoughTeams = tournament.teams.length >= 2;

  // Subscribe to registrations
  useEffect(() => {
    if (!isRegistration || !isAdmin) return;
    const unsub = subscribeToRegistrations(tournament.id, setRegistrations);
    return unsub;
  }, [tournament.id, isRegistration, isAdmin]);

  // Subscribe to roster submissions in real-time
  useEffect(() => {
    const hasTokens = tournament.teams.some(tm => tm.rosterToken);
    if (!hasTokens || !isAdmin) return;
    const unsubscribe = subscribeToRosters(tournament.id, (rosters) => {
      setRosterMap(rosters);
    });
    return unsubscribe;
  }, [tournament.id, tournament.teams, isAdmin]);

  // Roster stats
  const teamsWithRoster = tournament.teams.filter(tm =>
    tm.players && tm.players.length > 0
  ).length;

  const handleCopy = async () => {
    await copyToClipboard(regUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const d = new Date(tournament.settings.startDate + 'T00:00:00');
    const dateStr = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
    const msg = t('registration.whatsappMessage', {
      tournament: tournament.name,
      url: regUrl,
      date: dateStr,
      time: tournament.settings.startTime,
    });
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleEmail = () => {
    const d = new Date(tournament.settings.startDate + 'T00:00:00');
    const dateStr = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
    const subject = t('dashboard.emailSubject', { tournament: tournament.name });
    const body = t('dashboard.emailBody', {
      tournament: tournament.name,
      date: dateStr,
      time: tournament.settings.startTime,
      url: regUrl,
    });
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  };

  const pendingRegs = Object.entries(registrations);

  const handleApprove = async (regId: string, reg: RegistrationSubmission) => {
    try {
      await approveRegistration(tournament.id, regId, reg);
      // Save coach contact
      if (firebaseUid && reg.coachPhone) {
        createOrUpdateContact(firebaseUid, {
          name: reg.coachName,
          phone: reg.coachPhone,
          email: reg.coachEmail || undefined,
          clubId: null,
          clubName: reg.teamName,
        }).catch(() => {});
      }
      // Find the newly created team's rosterToken
      const updatedTournament = useTournamentStore.getState().getTournamentById(tournament.id);
      const newTeam = updatedTournament?.teams.find(tm => tm.name === reg.teamName);
      setApprovedTeam({
        teamName: reg.teamName,
        coachName: reg.coachName,
        coachEmail: reg.coachEmail || '',
        coachPhone: reg.coachPhone,
        rosterToken: newTeam?.rosterToken || '',
      });
      setInvoiceCounter(prev => prev + 1);
    } catch {
      showToast('error', t('common.error'));
    }
  };

  const handleReject = async (regId: string) => {
    try {
      // Save rejected reg info before deleting
      const reg = registrations[regId];
      if (reg) {
        setRejectedRegs(prev => [...prev, { teamName: reg.teamName, coachName: reg.coachName, coachPhone: reg.coachPhone }]);
      }
      await rejectRegistration(tournament.id, regId);
    } catch {
      showToast('error', t('common.error'));
    }
  };

  const handleRejectWithConfirm = (regId: string, reg: RegistrationSubmission) => {
    setRejectTarget({ regId, reg });
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    await handleReject(rejectTarget.regId);
    setRejectTarget(null);
  };

  const rejectWhatsApp = () => {
    if (!rejectTarget) return;
    const { reg } = rejectTarget;
    const msg = t('dashboard.rejectMessage', {
      coach: reg.coachName,
      team: reg.teamName,
      tournament: tournament.name,
      url: `https://torq.cz`,
    });
    window.open(`https://api.whatsapp.com/send?phone=${encodeURIComponent(reg.coachPhone)}&text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Checklist items
  const hasExplicitMax = tournament.settings.maxTeams != null && tournament.settings.maxTeams > 0;
  const regLabel = hasExplicitMax
    ? t('dashboard.checkRegistrationsMax', { current: tournament.teams.length, max: maxTeams })
    : t('dashboard.checkRegistrations', { current: tournament.teams.length });
  const checkItems = [
    ...(isRegistration ? [
      { done: tournament.teams.length > 0, label: regLabel, highlight: pendingRegs.length > 0 },
      { done: teamsWithRoster === tournament.teams.length && tournament.teams.length > 0, label: t('dashboard.checkRosters', { done: teamsWithRoster, total: tournament.teams.length }) },
    ] : []),
  ];

  return (
    <div style={{
      padding: isDesktop ? '24px 16px 40px' : '16px',
      display: 'flex', flexDirection: 'column', gap: 14,
      maxWidth: isDesktop ? 820 : undefined,
      margin: isDesktop ? '0 auto' : undefined,
      width: '100%',
    }}>

      {/* Simple Quick Actions — STRATEG.A: „amatérský trenér chce vytisknout
          pavouka a zadávat výsledky online". Zobrazí se jen v Simple módu
          jako prominent karta nahoře — dvě hlavní akce: vytisknout rozpis/
          pavouka a sdílet odkaz rodičům. */}
      {isSimpleMode && (
        <div style={{
          background: 'var(--warning-gradient)',
          borderRadius: 16, padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 10,
          color: '#fff',
          boxShadow: '0 4px 12px rgba(230,81,0,0.2)',
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            ⚡ {t('tournament.simpleQuick.title')}
          </div>
          <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.45, marginBottom: 2 }}>
            {t('tournament.simpleQuick.desc')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                setPdfExporting(true);
                try {
                  await exportTournamentPdf(tournament, t, locale);
                } catch {
                  showToast('error', t('pdf.exportFailed'));
                } finally {
                  setPdfExporting(false);
                }
              }}
              disabled={pdfExporting}
              style={{
                flex: '1 1 140px',
                padding: '12px 14px', borderRadius: 10,
                background: '#fff', color: '#E65100',
                fontSize: 13, fontWeight: 800, cursor: pdfExporting ? 'wait' : 'pointer',
                border: 'none', opacity: pdfExporting ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              📄 {pdfExporting
                ? t('pdf.generating')
                : (tournament.settings.format ?? 'round-robin') === 'round-robin'
                  ? t('tournament.simpleQuick.printBtnGroups')
                  : t('tournament.simpleQuick.printBtn')}
            </button>
            <button
              onClick={async () => {
                const url = getTournamentPublicUrl(tournament.id);
                await copyToClipboard(url);
                setSimpleLinkCopied(true);
                setTimeout(() => setSimpleLinkCopied(false), 2000);
                showToast('success', t('matchShare.copied'));
              }}
              style={{
                flex: '1 1 140px',
                padding: '12px 14px', borderRadius: 10,
                background: simpleLinkCopied ? '#fff' : 'rgba(255,255,255,0.18)',
                color: simpleLinkCopied ? '#E65100' : '#fff',
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
                border: `1.5px solid ${simpleLinkCopied ? '#fff' : 'rgba(255,255,255,0.35)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {simpleLinkCopied ? '✓' : '🔗'} {t('tournament.simpleQuick.shareBtn')}
            </button>
          </div>

          {/* Viral CTA — Audit 2026-04-25 (user explicit): „pořádáme turnaje,
              tady je největší šance rozšířit aplikaci mezi další trenéry".
              Po vytvoření turnaje nabídneme uživateli, aby pozval další
              organizátory — s předpřipraveným doporučujícím textem do schránky. */}
          <button
            onClick={async () => {
              const promoText = t('tournament.simpleQuick.inviteText', {
                tournamentName: tournament.name,
                publicUrl: getTournamentPublicUrl(tournament.id),
              });
              await copyToClipboard(promoText);
              showToast('success', t('tournament.simpleQuick.inviteCopied'));
            }}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 0',
              background: 'transparent', color: 'rgba(255,255,255,0.85)',
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              textDecoration: 'underline',
              textDecorationColor: 'rgba(255,255,255,0.5)',
              textUnderlineOffset: 3,
            }}
          >
            📨 {t('tournament.simpleQuick.inviteCta')}
          </button>
        </div>
      )}

      {/* Welcome banner — only after creation */}
      {justCreated && (
        <div style={{
          background: 'rgba(76,175,80,0.08)', borderRadius: 12, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          border: '1.5px solid rgba(76,175,80,0.2)',
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>🎉</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{tournament.name}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 6 }}>— {t('tournament.created.success')}</span>
          </div>
          <button
            onClick={onDismissCreated}
            style={{
              fontSize: 14, color: 'var(--text-muted)', background: 'none',
              border: 'none', cursor: 'pointer', flexShrink: 0, padding: '4px',
            }}
          >✕</button>
        </div>
      )}

      {/* Preparation checklist — compact (only if has items) */}
      {checkItems.length > 0 && <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: '10px 14px',
        boxShadow: 'var(--shadow-sm)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px',
        alignItems: 'center',
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', marginRight: 4 }}>📋</span>
        {checkItems.map((item, i) => (
          <span key={i} style={{
            fontSize: 13,
            fontWeight: item.highlight ? 700 : 500,
            color: item.highlight ? 'var(--warning)' : item.done ? 'var(--success)' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}>
            {item.done ? '✓' : '○'} {item.label}
            {item.highlight ? ` (${pendingRegs.length})` : ''}
          </span>
        ))}
      </div>}

      {/* Summary + PDF */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '12px 16px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: isDesktop ? 'row' : 'column',
        alignItems: isDesktop ? 'center' : undefined,
        gap: isDesktop ? 16 : 10,
      }}>
        <div style={{
          flex: isDesktop ? 1 : undefined,
          display: 'flex', flexWrap: 'wrap', gap: '2px 14px',
          fontSize: 13, color: 'var(--text-muted)',
          justifyContent: isDesktop ? 'flex-start' : 'center',
        }}>
          <span>📅 <b style={{ color: 'var(--text)' }}>{(() => { const d = new Date(tournament.settings.startDate + 'T00:00:00'); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; })()}</b></span>
          <span>⏰ <b style={{ color: 'var(--text)' }}>{tournament.settings.startTime}</b></span>
          <span>👥 <b style={{ color: 'var(--text)' }}>{tournament.teams.length}{hasExplicitMax ? `/${maxTeams}` : ''}</b></span>
          {tournament.settings.entryFee && (
            <span>💰 <b style={{ color: 'var(--text)' }}>{tournament.settings.entryFee} Kč</b></span>
          )}
          {tournament.settings.venueName && (
            <span>📍 <b style={{ color: 'var(--text)' }}>{tournament.settings.venueName}</b></span>
          )}
        </div>
        {/* PDF propozice — centrované */}
        <button
          onClick={async () => {
            setPdfExporting(true);
            try {
              await exportTournamentPdf(tournament, t, locale);
            } catch {
              showToast('error', t('pdf.exportFailed'));
            } finally {
              setPdfExporting(false);
            }
          }}
          disabled={pdfExporting}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: pdfExporting ? 'var(--border)' : 'var(--primary)',
            color: pdfExporting ? 'var(--text-muted)' : '#fff',
            border: 'none', cursor: pdfExporting ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {pdfExporting ? `⏳ ${t('pdf.generating')}` : `📄 ${t('pdf.downloadPdf')}`}
        </button>

        {/* Official link (pokud vyplněn — ČTenis apod.) */}
        {tournament.settings.officialResultsUrl && (
          <OfficialLinkButton url={tournament.settings.officialResultsUrl} />
        )}

        {/* Rozlosovat skupiny — admin, jen v draft stavu */}
        {isAdmin && tournament.status === 'draft' && tournament.teams.length >= 2 && (
          <button
            onClick={() => setShowGroupDraw(true)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 10, fontSize: 14, fontWeight: 700,
              background: 'var(--surface-var)', color: 'var(--text)',
              border: '1.5px solid var(--primary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginTop: 8,
            }}
          >
            {t('tournament.draw.openBtn')}
          </button>
        )}
        {showGroupDraw && (
          <GroupDrawModal tournament={tournament} onClose={() => setShowGroupDraw(false)} />
        )}
      </div>

      {/* Registration sharing — collapsible */}
      {isRegistration && isAdmin && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14,
          boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          <div
            onClick={() => setRegShareOpen(!regShareOpen)}
            style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 15 }}>📝</span>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{t('tournament.created.shareRegistration')}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
              background: (tournament.settings.registrationClosed ?? false) ? 'var(--danger-light)' : 'var(--success-light)',
              color: (tournament.settings.registrationClosed ?? false) ? 'var(--danger)' : 'var(--success)',
            }}>
              {(tournament.settings.registrationClosed ?? false) ? `🔒 ${t('dashboard.registrationClosedBadge')}` : `🟢 ${t('dashboard.registrationOpenBadge')}`}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: regShareOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </div>
          {regShareOpen && (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                {t('tournament.created.shareRegistrationDesc')}
              </p>

              {/* URL */}
              <div style={{
                background: 'var(--bg)', borderRadius: 10, padding: '10px 14px',
                fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all',
                width: '100%', boxSizing: 'border-box',
                border: '1px solid var(--border)',
              }}>
                {regUrl}
              </div>

              {/* Actions — 3 compact buttons */}
              <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                <button
                  onClick={handleCopy}
                  style={{
                    flex: 1, padding: '7px 6px', borderRadius: 8, fontWeight: 600, fontSize: 12,
                    background: copied ? 'var(--success)' : 'var(--surface-var)',
                    color: copied ? '#fff' : 'var(--text)',
                    border: '1px solid var(--border)', transition: 'all .2s',
                  }}
                >
                  {copied ? '✅' : '📋'} {copied ? t('tournament.created.copied') : t('tournament.created.copyLink')}
                </button>
                <button
                  onClick={handleWhatsApp}
                  style={{
                    flex: 1, padding: '7px 6px', borderRadius: 8, fontWeight: 600, fontSize: 12,
                    background: '#25D366', color: '#fff', border: 'none',
                  }}
                >
                  💬 WhatsApp
                </button>
                <button
                  onClick={handleEmail}
                  style={{
                    flex: 1, padding: '7px 6px', borderRadius: 8, fontWeight: 600, fontSize: 12,
                    background: 'var(--surface-var)', color: 'var(--text)',
                    border: '1px solid var(--border)',
                  }}
                >
                  📧 Email
                </button>
              </div>

              {/* Close/open registration toggle */}
              <button
                onClick={() => {
                  const closed = !(tournament.settings.registrationClosed ?? false);
                  updateTournament(tournament.id, { settings: { ...tournament.settings, registrationClosed: closed } });
                }}
                style={{
                  padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: (tournament.settings.registrationClosed ?? false) ? 'var(--success-light)' : 'var(--warning-light)',
                  color: (tournament.settings.registrationClosed ?? false) ? 'var(--success)' : 'var(--warning)',
                  border: (tournament.settings.registrationClosed ?? false) ? '1.5px solid #C8E6C9' : '1.5px solid #FFE0B2',
                  cursor: 'pointer', width: '100%',
                }}
              >
                {(tournament.settings.registrationClosed ?? false)
                  ? `🔓 ${t('dashboard.openRegistration')}`
                  : `🔒 ${t('dashboard.closeRegistration')}`}
              </button>
              {(tournament.settings.registrationClosed ?? false) && (
                <div style={{ fontSize: 12, color: 'var(--warning)', textAlign: 'center', fontWeight: 600 }}>
                  🔒 {t('dashboard.registrationClosedBadge')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Unified team management — pending + approved + rosters */}
      {(tournament.teams.length > 0 || (isRegistration && isAdmin && pendingRegs.length > 0)) && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: '16px',
          boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Header — klikatelný pro sbalení/rozbalení sekce (audit 2026-05-22) */}
          <div
            onClick={() => setTeamsExpanded(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0, flex: 1 }}>
              👥 {t('dashboard.teams')} ({tournament.teams.length}{hasExplicitMax ? `/${maxTeams}` : ''})
              {pendingRegs.length > 0 && (
                <span style={{ color: 'var(--warning)', fontWeight: 700, marginLeft: 6 }}>
                  +{pendingRegs.length} ⏳
                </span>
              )}
            </h3>
            {isAdmin && tournament.teams.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setEditTeamsMode(!editTeamsMode); }}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: editTeamsMode ? 'var(--danger-light)' : 'var(--surface-var)',
                  color: editTeamsMode ? 'var(--danger)' : 'var(--text-muted)',
                  border: editTeamsMode ? '1px solid var(--card-red-light)' : '1px solid var(--border)',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {editTeamsMode ? `✕ ${t('dashboard.editTeamsDone')}` : `✏️ ${t('dashboard.editTeams')}`}
              </button>
            )}
            <span style={{
              fontSize: 12, color: 'var(--text-muted)',
              transition: 'transform .2s',
              transform: teamsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}>▼</span>
          </div>
          {teamsExpanded && (<>

          {/* Pending registrations — orange highlight at top */}
          {isRegistration && isAdmin && pendingRegs.map(([regId, reg]) => (
            <div key={regId} style={{
              padding: '10px 12px', background: 'var(--warning-light)', borderRadius: 12,
              border: '1.5px solid #FFE0B2', display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14, background: '#FF9800',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>?</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {reg.teamName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {reg.coachName} · {reg.coachPhone}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 600, flexShrink: 0 }}>
                  {t('registration.pending')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => handleApprove(regId, reg)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    background: 'var(--success-light)', color: 'var(--success)', border: '1px solid #C8E6C9',
                    cursor: 'pointer',
                  }}
                >
                  ✅ {t('registration.approve')}
                </button>
                <button
                  onClick={() => handleRejectWithConfirm(regId, reg)}
                  style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    background: 'var(--danger-light)', color: 'var(--danger)', border: '1px solid var(--danger)',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {/* Post-approval action panel — inline within team list */}
          {approvedTeam && (
            <div style={{
              padding: '10px 12px', background: 'var(--success-light)', borderRadius: 12,
              border: '1.5px solid #C8E6C9', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🎉</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)', flex: 1 }}>
                  {approvedTeam.teamName} — {t('registration.approved')}
                </span>
                <button
                  onClick={() => setApprovedTeam(null)}
                  style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                >✕</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <a
                  href={(() => {
                    const rosterUrl = approvedTeam.rosterToken
                      ? getRosterFormUrl(tournament.id, approvedTeam.rosterToken)
                      : '';
                    const d = tournament.settings.startDate;
                    const dateStr = d ? new Date(d + 'T00:00:00').toLocaleDateString(getDateLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
                    const timeStr = tournament.settings.startTime || '';
                    const fee = tournament.settings.entryFee;
                    const msgKey = fee && billingProfile
                      ? 'registration.approvalWhatsappMessage'
                      : 'registration.approvalWhatsappNoFee';
                    const msg = t(msgKey, {
                      tournament: tournament.name,
                      team: approvedTeam.teamName,
                      date: dateStr,
                      time: timeStr,
                      coach: approvedTeam.coachName,
                      rosterUrl,
                      fee: fee ? String(fee) : '',
                      account: billingProfile?.bankAccount || '',
                      vs: String(new Date().getFullYear()) + String(invoiceCounter).padStart(3, '0'),
                    });
                    return `https://api.whatsapp.com/send?phone=${encodeURIComponent(approvedTeam.coachPhone)}&text=${encodeURIComponent(msg)}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: '#25D366', color: '#fff', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  💬 WhatsApp
                </a>
                {approvedTeam.coachEmail && (
                  <a
                    href={(() => {
                      const rosterUrl = approvedTeam.rosterToken
                        ? getRosterFormUrl(tournament.id, approvedTeam.rosterToken)
                        : '';
                      const d = tournament.settings.startDate;
                      const dateStr = d ? new Date(d + 'T00:00:00').toLocaleDateString(getDateLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
                      const timeStr = tournament.settings.startTime || '';
                      const fee = tournament.settings.entryFee;
                      const feeInfo = fee && billingProfile
                        ? t('dashboard.approvalEmailFeeInfo', {
                            fee: String(fee),
                            account: billingProfile.bankAccount || '',
                            vs: String(new Date().getFullYear()) + String(invoiceCounter).padStart(3, '0'),
                          })
                        : '';
                      const subject = t('dashboard.approvalEmailSubject', { tournament: tournament.name });
                      const body = t('dashboard.approvalEmailBody', {
                        coach: approvedTeam.coachName,
                        team: approvedTeam.teamName,
                        tournament: tournament.name,
                        date: dateStr,
                        time: timeStr,
                        rosterUrl,
                        feeInfo,
                      });
                      return `mailto:${approvedTeam.coachEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    })()}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: 'var(--surface-var)', color: 'var(--text)', textDecoration: 'none',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      border: '1px solid var(--border)',
                    }}
                  >
                    📧 Email
                  </a>
                )}
                {billingProfile && tournament.settings.entryFee && (
                  <button
                    onClick={async () => {
                      const invoiceData = createInvoiceDataFromApproval(
                        tournament.name,
                        tournament.settings.startDate,
                        approvedTeam.teamName,
                        approvedTeam.coachName,
                        approvedTeam.coachEmail,
                        approvedTeam.coachPhone,
                        tournament.settings.entryFee!,
                        invoiceCounter,
                      );
                      await generateInvoicePdf(billingProfile, invoiceData, t);
                    }}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: 'var(--info-light)', color: 'var(--info)', border: '1px solid #BBDEFB', cursor: 'pointer',
                    }}
                  >
                    🧾 {t('invoice.download')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Approved teams with roster status */}
          <div style={{
            display: isDesktop && tournament.teams.length > 1 ? 'grid' : 'flex',
            gridTemplateColumns: isDesktop && tournament.teams.length > 1 ? 'repeat(auto-fill, minmax(340px, 1fr))' : undefined,
            flexDirection: 'column',
            gap: 10,
          }}>
          {tournament.teams.map(team => {
            const submission = rosterMap[team.id];
            const isAccepted = !!team.rosterSubmittedAt;
            const isSubmitted = !!submission;
            const hasRosterToken = !!team.rosterToken;
            const playerCount = team.players?.length || 0;

            // Status dot color & action button config
            const dotColor = isAccepted ? '#4CAF50' : isSubmitted ? '#1976D2' : hasRosterToken ? '#FFA726' : '#BDBDBD';
            const actionBg = isSubmitted && !isAccepted ? 'var(--info-light)' : isAccepted ? 'var(--success-light)' : hasRosterToken ? 'var(--warning-light)' : 'var(--surface-var)';
            const actionColor = isSubmitted && !isAccepted ? 'var(--info)' : isAccepted ? 'var(--success)' : hasRosterToken ? 'var(--warning)' : 'var(--text-muted)';
            const actionLabel = isAccepted
              ? `✅ ${playerCount} ${t('dashboard.players')}`
              : isSubmitted
                ? `📋 ${t('roster.teamActionReview')}`
                : hasRosterToken
                  ? `⏳ ${t('roster.teamActionWaiting')}`
                  : `${playerCount} ${t('dashboard.players')}`;

            // Expandable per-team actions
            const isExpanded = expandedTeamId === team.id;

            return (
              <div key={team.id} style={{
                padding: '10px 12px', background: 'var(--bg)', borderRadius: 12,
                display: 'flex', flexDirection: 'column', gap: isExpanded ? 8 : 0,
              }}>
                <div
                  onClick={() => isAdmin ? setExpandedTeamId(isExpanded ? null : team.id) : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isAdmin ? 'pointer' : 'default' }}
                >
                  {/* Status dot */}
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: dotColor,
                    boxShadow: `0 0 0 2px ${dotColor}33`,
                  }} />
                  <TeamBadge team={team} size={14} />
                  {editTeamsMode ? (
                    <input
                      type="text"
                      defaultValue={team.name}
                      onBlur={async (e) => {
                        const newName = e.target.value.trim();
                        if (newName && newName !== team.name) {
                          await updateTeamName(tournament.id, team.id, newName);
                        }
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        flex: 1, fontWeight: 600, fontSize: 14, minWidth: 0,
                        padding: '4px 8px', borderRadius: 8,
                        border: '1.5px solid var(--primary)',
                        background: 'var(--surface)', color: 'var(--text)',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {team.name}
                    </span>
                  )}
                  {editTeamsMode ? (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const hasPlayed = tournament.matches.some(
                          m => m.status === 'finished' || m.status === 'live',
                        );
                        const msg = hasPlayed
                          ? t('dashboard.removeTeamMsgPlayed', { team: team.name })
                          : t('dashboard.removeTeamMsgBefore', { team: team.name });
                        const ok = await ask({
                          title: t('dashboard.removeTeamTitle'),
                          message: msg,
                          destructive: true,
                        });
                        if (ok) {
                          await removeTeam(tournament.id, team.id);
                          showToast('success', t('dashboard.teamRemoved'));
                        }
                      }}
                      style={{
                        padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: 'var(--danger-light)', color: 'var(--danger)',
                        border: '1px solid #FFCDD2', cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      ✕ {t('common.remove')}
                    </button>
                  ) : (
                    <>
                      <span style={{
                        fontSize: 11, fontWeight: 600, flexShrink: 0,
                        padding: '3px 10px', borderRadius: 20,
                        background: actionBg, color: actionColor,
                      }}>
                        {actionLabel}
                      </span>
                      {isAdmin && (
                        <span style={{
                          fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}>▼</span>
                      )}
                    </>
                  )}
                </div>

                {/* Expanded actions */}
                {isExpanded && isAdmin && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
                    {/* Admin fill roster */}
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

                    {/* Copy roster link */}
                    {hasRosterToken && (
                      <button
                        onClick={async () => {
                          const url = getRosterFormUrl(tournament.id, team.rosterToken!);
                          await navigator.clipboard.writeText(url);
                          setRosterLinkCopied(team.id);
                          setTimeout(() => setRosterLinkCopied(null), 2000);
                        }}
                        style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: rosterLinkCopied === team.id ? 'var(--success-light)' : 'var(--primary-light)',
                          color: rosterLinkCopied === team.id ? 'var(--success)' : 'var(--primary)',
                          border: 'none', cursor: 'pointer',
                        }}
                      >
                        {rosterLinkCopied === team.id ? '✅' : '🔗'} {rosterLinkCopied === team.id ? t('roster.linkCopied') : t('roster.copyLink')}
                      </button>
                    )}

                    {/* WhatsApp roster link */}
                    {hasRosterToken && (
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
                          background: 'var(--success-light)', color: 'var(--success)',
                          border: 'none', textDecoration: 'none',
                          display: 'inline-flex', alignItems: 'center', gap: 2,
                        }}
                      >
                        💬 WhatsApp
                      </a>
                    )}

                    {/* Preview roster */}
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

                    {/* Accept roster */}
                    {isSubmitted && !isAccepted && (
                      <button
                        onClick={async () => {
                          await acceptRoster(tournament.id, team.id, submission);
                          if (firebaseUid && submission.coach.phone) {
                            createOrUpdateContact(firebaseUid, {
                              name: submission.coach.name,
                              phone: submission.coach.phone,
                              email: submission.coach.email || undefined,
                              clubId: team.clubId ?? null,
                              clubName: team.name,
                            }).catch(() => {});
                          }
                          setRosterAccepted(team.id);
                          setTimeout(() => setRosterAccepted(null), 2500);
                        }}
                        style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          background: 'var(--success-light)', color: 'var(--success)',
                          border: '1px solid #C8E6C9', cursor: 'pointer',
                        }}
                      >
                        ✅ {rosterAccepted === team.id ? t('roster.acceptSuccess') : t('roster.accept')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>

          {/* Add team manually — only before first played match */}
          {isAdmin && !tournament.matches.some(m => m.status === 'finished' || m.status === 'live') && (
            <div>
              <button
                onClick={() => setShowAddTeam(true)}
                style={{
                  padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: 'var(--surface-var)', color: 'var(--primary)',
                  border: '1.5px dashed var(--border)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%',
                }}
              >
                ➕ {t('dashboard.addTeam')}
              </button>
              <div style={{ fontSize: 11, color: 'var(--warning)', textAlign: 'center', marginTop: 4, lineHeight: 1.3, fontWeight: 600 }}>
                ⚠️ {t('dashboard.addTeamHint')}
              </div>
            </div>
          )}

          {/* Rejected registrations — collapsible */}
          {isRegistration && isAdmin && rejectedRegs.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <div
                onClick={() => setRejectedOpen(!rejectedOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                  ✕ {t('dashboard.rejectedRegistrations')} ({rejectedRegs.length})
                </span>
                <span style={{
                  fontSize: 10, color: 'var(--text-muted)', transition: 'transform .2s',
                  transform: rejectedOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>▼</span>
              </div>
              {rejectedOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {rejectedRegs.map((rej, i) => (
                    <div key={i} style={{
                      padding: '6px 10px', background: 'var(--danger-light)', borderRadius: 8,
                      fontSize: 13, color: '#B71C1C', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ opacity: 0.5 }}>✕</span>
                      <span style={{ fontWeight: 600 }}>{rej.teamName}</span>
                      <span style={{ fontSize: 11, color: 'var(--danger)', opacity: 0.7 }}>
                        {rej.coachName}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </>)}
        </div>
      )}

      {/* Show add team button even when no teams yet */}
      {isAdmin && tournament.teams.length === 0 && !(isRegistration && pendingRegs.length > 0) && (
        <button
          onClick={() => setShowAddTeam(true)}
          style={{
            padding: '14px', borderRadius: 14, fontSize: 14, fontWeight: 700,
            background: 'var(--surface)', color: 'var(--primary)',
            border: '1.5px dashed var(--border)', cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          ➕ {t('dashboard.addTeam')}
        </button>
      )}

      {/* Add team modal */}
      {showAddTeam && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => { setShowAddTeam(false); setAddTeamName(''); setAddTeamCategory(null); }}
        >
          <div
            style={{ background: 'var(--surface)', borderRadius: 20, padding: '24px', width: '100%', maxWidth: 400, maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>➕ {t('dashboard.addTeam')}</h3>
              <button onClick={() => { setShowAddTeam(false); setAddTeamName(''); setAddTeamCategory(null); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* Quick add from club */}
            {clubs.length > 0 && !addTeamCategory && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('dashboard.addFromClub')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {clubs.map(club => {
                    const cats = club.ageCategories ?? [];
                    const playerCount = (club.players ?? []).filter(p => p.active).length || (club.defaultPlayers ?? []).length;
                    return (
                      <button
                        key={club.id}
                        onClick={async () => {
                          if (cats.length > 1 && (club.players ?? []).length > 0) {
                            setAddTeamCategory({ club });
                          } else if (cats.length === 1) {
                            setAddTeamCategory({ club, category: cats[0] });
                          } else {
                            // No categories, add directly
                            const usedColors = tournament.teams.map(tm => tm.color);
                            const color = TEAM_COLORS.find(c => !usedColors.includes(c)) ?? club.color;
                            const players = (club.defaultPlayers ?? []).map((p, i) => ({
                              id: `p${Date.now()}_${i}`,
                              name: p.name,
                              jerseyNumber: p.jerseyNumber ?? (i + 1),
                              birthYear: null,
                            }));
                            try {
                              await confirmAndAddTeam({
                                name: club.name,
                                color,
                                players,
                                clubId: club.id,
                                logoBase64: club.logoBase64 ?? null,
                              });
                              setAddTeamName('');
                              setAddTeamCategory(null);
                              showToast('success', `✅ ${club.name}`);
                            } catch {
                              showToast('error', t('common.error'));
                            }
                          }
                        }}
                        style={{
                          padding: '10px 12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                          background: 'var(--bg)', color: 'var(--text)',
                          border: '1px solid var(--border)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                        }}
                      >
                        {club.logoBase64 ? (
                          <img src={club.logoBase64} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: club.color, flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <div>{club.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{playerCount} {t('dashboard.players')}</div>
                        </div>
                        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>›</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category selection step */}
            {addTeamCategory && !addTeamCategory.category && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('dashboard.selectCategory')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(addTeamCategory.club.ageCategories ?? []).map(cat => {
                    const catPlayers = (addTeamCategory.club.players ?? []).filter(p => p.active && p.ageCategory === cat);
                    return (
                      <button
                        key={cat}
                        onClick={() => setAddTeamCategory({ ...addTeamCategory, category: cat })}
                        style={{
                          padding: '10px 12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                          background: 'var(--bg)', color: 'var(--text)',
                          border: '1px solid var(--border)', cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                      >
                        <span>🏷️ {cat}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{catPlayers.length} {t('dashboard.players')}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setAddTeamCategory(null)}
                    style={{ padding: '6px', fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {t('common.back')}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm club + category → add with custom name */}
            {addTeamCategory?.category && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('dashboard.teamName')}</div>
                <input
                  type="text"
                  value={addTeamName || `${addTeamCategory.club.name} ${addTeamCategory.category}`}
                  onChange={e => setAddTeamName(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14,
                    border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                    boxSizing: 'border-box', marginBottom: 8,
                  }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {(addTeamCategory.club.players ?? []).filter(p => p.active && p.ageCategory === addTeamCategory.category).length} {t('dashboard.players')} ({addTeamCategory.category})
                </div>
                <button
                  onClick={async () => {
                    const club = addTeamCategory.club;
                    const cat = addTeamCategory.category!;
                    const usedColors = tournament.teams.map(tm => tm.color);
                    const color = TEAM_COLORS.find(c => !usedColors.includes(c)) ?? club.color;
                    const catPlayers = (club.players ?? []).filter(p => p.active && p.ageCategory === cat);
                    const players = catPlayers.map((p, i) => ({
                      id: `p${Date.now()}_${i}`,
                      name: p.name,
                      jerseyNumber: p.jerseyNumber ?? (i + 1),
                      birthYear: p.birthYear ?? null,
                    }));
                    const name = addTeamName || `${club.name} ${cat}`;
                    await confirmAndAddTeam({
                      name,
                      color,
                      players,
                      clubId: club.id,
                      logoBase64: club.logoBase64 ?? null,
                    });
                  }}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                    background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  ➕ {t('dashboard.addTeam')}
                </button>
                <button
                  onClick={() => setAddTeamCategory(null)}
                  style={{ padding: '6px', fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6 }}
                >
                  {t('common.back')}
                </button>
              </div>
            )}

            {/* Custom team (no club) */}
            {!addTeamCategory && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {clubs.length > 0 ? t('dashboard.addCustomTeam') : t('dashboard.teamName')}
                </div>
                <OpponentAutocomplete
                  value={addTeamName}
                  onChange={setAddTeamName}
                  placeholder={t('dashboard.teamNamePlaceholder')}
                  style={{ marginBottom: 10 }}
                  sport={(tournament.sport ?? 'football') as 'football' | 'tennis'}
                />
                <button
                  onClick={async () => {
                    if (!addTeamName.trim()) return;
                    const usedColors = tournament.teams.map(tm => tm.color);
                    const color = TEAM_COLORS.find(c => !usedColors.includes(c)) ?? '#9E9E9E';
                    await confirmAndAddTeam({
                      name: addTeamName.trim(),
                      color,
                      players: [],
                    });
                  }}
                  disabled={!addTeamName.trim()}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                    background: addTeamName.trim() ? 'var(--primary)' : 'var(--border)',
                    color: addTeamName.trim() ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: addTeamName.trim() ? 'pointer' : 'default',
                  }}
                >
                  ➕ {t('dashboard.addTeam')}
                </button>
              </div>
            )}
          </div>
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
              <button onClick={() => setRosterPreview(null)} aria-label={t('common.close')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
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
              {t('roster.statusSubmitted')} · {new Date(rosterPreview.submittedAt).toLocaleString()}
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

      {/* Payments tracking */}
      {isAdmin && tournament.settings.entryFee && tournament.teams.length > 0 && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14,
          boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          <div
            onClick={() => setPaymentsOpen(!paymentsOpen)}
            style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 15 }}>💰</span>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{t('payments.title')}</span>
            {(() => {
              const paidCount = tournament.teams.filter(tm => tm.paidAt).length;
              const totalCount = tournament.teams.length;
              const allPaid = paidCount === totalCount;
              return (
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: allPaid ? 'var(--success-light)' : 'var(--warning-light)',
                  color: allPaid ? 'var(--success)' : 'var(--warning)',
                }}>
                  {paidCount}/{totalCount}
                </span>
              );
            })()}
            <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: paymentsOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
          </div>

          {paymentsOpen && (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tournament.teams.map(team => {
                const isPaid = !!team.paidAt;
                return (
                  <div
                    key={team.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: isPaid ? 'var(--success-light)' : 'var(--bg)',
                      border: `1px solid ${isPaid ? '#C8E6C9' : 'var(--border)'}`,
                    }}
                  >
                    <TeamBadge team={team} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {team.name}
                      </div>
                      {isPaid && team.paidAt && (
                        <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 1 }}>
                          {t('payments.paidAt', { date: new Date(team.paidAt).toLocaleDateString(locale === 'cs' ? 'cs-CZ' : locale === 'de' ? 'de-DE' : 'en-GB') })}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {tournament.settings.entryFee} Kč
                    </span>
                    <button
                      onClick={() => toggleTeamPaid(tournament.id, team.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: isPaid ? 'var(--danger-light)' : 'var(--success-light)',
                        color: isPaid ? '#D32F2F' : 'var(--success)',
                        border: `1px solid ${isPaid ? '#FFCDD2' : '#C8E6C9'}`,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {isPaid ? '✕' : '✓'}
                    </button>
                  </div>
                );
              })}

              {/* Summary */}
              {(() => {
                const paidCount = tournament.teams.filter(tm => tm.paidAt).length;
                const totalCount = tournament.teams.length;
                const fee = tournament.settings.entryFee!;
                const collected = paidCount * fee;
                const remaining = (totalCount - paidCount) * fee;
                return (
                  <div style={{
                    marginTop: 4, padding: '10px 12px', borderRadius: 10,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', fontSize: 13,
                  }}>
                    <span>
                      <span style={{ color: 'var(--text-muted)' }}>{t('payments.totalCollected')}: </span>
                      <b style={{ color: 'var(--success)' }}>{collected.toLocaleString()} Kč</b>
                    </span>
                    {remaining > 0 ? (
                      <span>
                        <span style={{ color: 'var(--text-muted)' }}>{t('payments.totalRemaining')}: </span>
                        <b style={{ color: 'var(--warning)' }}>{remaining.toLocaleString()} Kč</b>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--success)', fontWeight: 700 }}>{t('payments.allPaid')}</span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      {isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hasEnoughTeams && !hasMatches && (
            <button
              onClick={() => {
                const generateInitialSchedule = useTournamentStore.getState().generateInitialSchedule;
                generateInitialSchedule(tournament.id);
              }}
              style={{
                padding: '14px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              ⚡ {t('tournament.detail.generateSchedule')}
            </button>
          )}
        </div>
      )}
      {/* Reject confirmation dialog */}
      {rejectTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setRejectTarget(null)}
        >
          <div
            style={{ background: 'var(--surface)', borderRadius: 20, padding: '24px', width: '100%', maxWidth: 380 }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontWeight: 800, fontSize: 16, margin: '0 0 12px' }}>
              ⚠️ {t('dashboard.rejectConfirm', { team: rejectTarget.reg.teamName })}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={async () => {
                  rejectWhatsApp();
                  await confirmReject();
                }}
                style={{
                  padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: '#25D366', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                💬 {t('dashboard.rejectWhatsapp')}
              </button>
              <button
                onClick={confirmReject}
                style={{
                  padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: 'var(--danger-light)', color: 'var(--danger)', border: '1px solid var(--danger)', cursor: 'pointer',
                }}
              >
                ✕ {t('registration.reject')}
              </button>
              <button
                onClick={() => setRejectTarget(null)}
                style={{
                  padding: '10px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                  background: 'var(--bg)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
