import { useState, useEffect } from 'react';
import type { Page } from '../../App';
import type { Tournament, TiebreakerCriterion, TournamentRegulations } from '../../types/tournament.types';
import { DEFAULT_TIEBREAKER_ORDER } from '../../types/tournament.types';
import type { TournamentTemplate } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { useConfirmStore } from '../../store/confirm.store';
import { useTournamentStore } from '../../store/tournament.store';
import { saveBillingProfile, loadBillingProfile } from '../../services/billing.firebase';
import type { BillingProfile } from '../../types/tournament.types';
import { useTemplatesStore } from '../../store/templates.store';
import { useToastStore } from '../../store/toast.store';
import { getTournamentPublicUrl, getCoOwnerInviteUrl, generateQRCodeDataUrl } from '../../utils/qr-code';
import { sendWelcomeChatMessage } from '../../services/tournament.firebase';
import { MvpResults } from './MvpResults';
import { hashPin, generatePinSalt } from '../../utils/pin-hash';
import { exportTournamentStandingsCSV, exportTournamentMatchesCSV, exportTournamentScorersCSV } from '../../utils/export-csv';
import { logger } from '../../utils/logger';
import { copyToClipboard } from '../../utils/training-share';
import { generateId } from '../../utils/id';
import { Dropdown, ColorDot } from '../ui/Dropdown';

// Inline stepper helper for SettingsTab
function SettingsStepper({ value, min, max, onChange, label, unit }: {
  value: number; min: number; max: number;
  onChange: (v: number) => void; label: string; unit: string;
}) {
  return (
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
}

export function SettingsTab({ tournament, navigate, isOwner, isAdmin = isOwner, leaveTournament }: { tournament: Tournament; navigate: (p: Page) => void; isOwner: boolean; isAdmin?: boolean; leaveTournament: (tournamentId: string) => Promise<void> }) {
  const { t } = useI18n();
  const ask = useConfirmStore(s => s.ask);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Regulations (propozice)
  const [regsOpen, setRegsOpen] = useState(false);
  const [regs, setRegs] = useState<Partial<TournamentRegulations>>(() => {
    const saved = tournament.settings.regulations ?? {};
    // Migrate legacy rules field into gameRules if not already set
    if (!saved.gameRules && tournament.settings.rules) {
      return { ...saved, gameRules: tournament.settings.rules };
    }
    return { ...saved };
  });
  const [regsSaved, setRegsSaved] = useState(false);

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

  // PIN change
  const [pinChangeOpen, setPinChangeOpen] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinChanged, setPinChanged] = useState(false);

  // Collapsible sections
  const [qrOpen, setQrOpen] = useState(false);
  const [coOwnerOpen, setCoOwnerOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [tiebreakerOpen, setTiebreakerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [awardsOpen, setAwardsOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billing, setBilling] = useState<Partial<BillingProfile>>({});
  const [billingSaved, setBillingSaved] = useState(false);
  const [billingLoaded, setBillingLoaded] = useState(false);

  const firebaseUid = useTournamentStore(s => s.firebaseUid);

  const deleteTournament = useTournamentStore(s => s.deleteTournament);
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const regenerateSchedule = useTournamentStore(s => s.regenerateSchedule);
  const saveTemplate = useTemplatesStore(s => s.saveTemplate);
  const showToast = useToastStore(s => s.show);

  // Load billing profile
  useEffect(() => {
    if (!firebaseUid || billingLoaded) return;
    loadBillingProfile(firebaseUid).then(p => {
      if (p) setBilling(p);
      setBillingLoaded(true);
    }).catch(() => setBillingLoaded(true));
  }, [firebaseUid, billingLoaded]);

  useEffect(() => {
    generateQRCodeDataUrl(tournament.id).then(setQrUrl).catch(() => { /* ignore */ });
  }, [tournament.id]);

  const publicUrl = getTournamentPublicUrl(tournament.id);

  const handleCopy = async () => {
    await copyToClipboard(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  const [coOwnerCopied, setCoOwnerCopied] = useState(false);
  const handleCopyCoOwnerLink = async () => {
    const coOwnerUrl = getCoOwnerInviteUrl(tournament.id);
    await copyToClipboard(coOwnerUrl);
    setCoOwnerCopied(true);
    setTimeout(() => setCoOwnerCopied(false), 2000);
  };

  const handleDelete = async () => {
    const ok = await ask({ title: t('confirm.deleteTournament'), message: t('confirm.deleteTournamentMsg', { name: tournament.name }), destructive: true });
    if (ok) {
      deleteTournament(tournament.id);
      showToast('success', t('toast.tournamentDeleted'));
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



  const handleSaveRegulations = () => {
    // Clean up empty string fields
    const cleaned: Partial<TournamentRegulations> = {};
    for (const [k, v] of Object.entries(regs)) {
      if (typeof v === 'string' && v.trim() === '') continue;
      (cleaned as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() : v;
    }
    updateTournament(tournament.id, {
      settings: { ...tournament.settings, regulations: Object.keys(cleaned).length > 0 ? cleaned as TournamentRegulations : undefined },
    });
    setRegsSaved(true);
    setTimeout(() => setRegsSaved(false), 2000);
  };

  const updateReg = <K extends keyof TournamentRegulations>(key: K, value: TournamentRegulations[K]) => {
    setRegs(prev => ({ ...prev, [key]: value }));
    setRegsSaved(false);
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

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* QR kód — collapsible */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div
          onClick={() => setQrOpen(!qrOpen)}
          style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>📱 {t('tournament.settings.qrTitle')}</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: qrOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
        {qrOpen && (
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {qrUrl
              ? <img src={qrUrl} alt={t('tournament.settings.qrAlt')} style={{ width: 200, height: 200, borderRadius: 12 }} />
              : <div style={{ width: 200, height: 200, borderRadius: 12, background: 'var(--surface-var)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)' }}>{t('tournament.detail.loadingQr')}</div>
            }
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
              {t('tournament.settings.qrDesc')}
            </p>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <button onClick={handleCopy} style={{
                flex: 1, background: copied ? 'var(--success)' : 'var(--primary)', color: '#fff', fontWeight: 700,
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
        )}
      </div>

      {/* Co-owner invite link — jen pro ownery, collapsible */}
      {isOwner && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div
            onClick={() => setCoOwnerOpen(!coOwnerOpen)}
            style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
          >
            <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>👑 {t('tournament.settings.coOwnerLinkTitle')}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: coOwnerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </div>
          {coOwnerOpen && (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
                {t('tournament.settings.coOwnerLinkDesc')}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handleCopyCoOwnerLink} style={{
                  flex: 1, background: coOwnerCopied ? 'var(--success)' : '#6A1B9A', color: '#fff', fontWeight: 700,
                  fontSize: 13, padding: '10px 14px', borderRadius: 10, transition: 'background .2s',
                  minWidth: 0,
                }}>
                  {coOwnerCopied ? `✅ ${t('common.copied')}` : `🔗 ${t('tournament.settings.copyCoOwnerLink')}`}
                </button>
                <a
                  href={(() => {
                    const url = getCoOwnerInviteUrl(tournament.id);
                    const msg = t('tournament.settings.coOwnerWhatsapp', { tournament: tournament.name, url });
                    return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: 'var(--success-light)', color: 'var(--success)',
                    border: 'none', cursor: 'pointer', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  💬 WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ NASTAVENÍ TURNAJE ═══════════════ */}
      {/* Awards — ocenění turnaje, collapsible */}
      {isAdmin && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setAwardsOpen(!awardsOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>🏅 {t('tournament.awards.title')}</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: awardsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
        {awardsOpen && <AwardsEditor tournament={tournament} />}
      </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>
        ⚙️ {t('settings.sectionTournament')}
      </div>

      {/* Feature toggles — iOS-style switches */}
      {isAdmin && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {/* Awards visibility */}
        <ToggleRow
          icon="🏅"
          label={t('tournament.awards.visibilityTitle')}
          desc={t('tournament.awards.visibilityDesc')}
          checked={tournament.settings.awardsVisible ?? false}
          onChange={val => updateTournament(tournament.id, { settings: { ...tournament.settings, awardsVisible: val } })}
        />
        <div style={{ height: 1, background: 'var(--border)', marginLeft: 52 }} />

        {/* Scorer visibility */}
        <ToggleRow
          icon="⚽"
          label={t('tournament.scorers.visibilityTitle')}
          desc={t('tournament.scorers.visibilityDesc')}
          checked={tournament.settings.scorersVisible ?? false}
          onChange={val => updateTournament(tournament.id, { settings: { ...tournament.settings, scorersVisible: val } })}
        />
        <div style={{ height: 1, background: 'var(--border)', marginLeft: 52 }} />

        {/* MVP voting */}
        <ToggleRow
          icon="⭐"
          label={t('tournament.mvp.enableTitle')}
          desc={t('tournament.mvp.enableDesc')}
          checked={tournament.settings.mvpVotingEnabled ?? false}
          onChange={val => updateTournament(tournament.id, { settings: { ...tournament.settings, mvpVotingEnabled: val } })}
        />
        {(tournament.settings.mvpVotingEnabled ?? false) && (
          <div style={{ padding: '0 16px 12px' }}>
            <MvpResults tournamentId={tournament.id} teams={tournament.teams} />
          </div>
        )}
        <div style={{ height: 1, background: 'var(--border)', marginLeft: 52 }} />

        {/* Chat */}
        <ToggleRow
          icon="💬"
          label={t('tournament.chat.enableTitle')}
          desc={t('tournament.chat.enableDesc')}
          checked={tournament.settings.chatEnabled ?? false}
          onChange={val => {
            updateTournament(tournament.id, { settings: { ...tournament.settings, chatEnabled: val } });
            if (val) {
              sendWelcomeChatMessage(
                tournament.id,
                tournament.name,
                t('tournament.chat.welcome', { tournament: tournament.name }),
              ).catch(() => {});
            }
          }}
        />
        <div style={{ height: 1, background: 'var(--border)', marginLeft: 52 }} />

        {/* Live reactions */}
        <ToggleRow
          icon="🔥"
          label={t('tournament.reactions.enableTitle')}
          desc={t('tournament.reactions.enableDesc')}
          checked={tournament.settings.reactionsEnabled ?? false}
          onChange={val => updateTournament(tournament.id, { settings: { ...tournament.settings, reactionsEnabled: val } })}
        />
      </div>
      )}

      {/* Export moved below — collapsible */}

      {/* Registration, billing, rosters — managed in DashboardTab */}

      {/* Official Results URL — pro tenis (ČTenis odkaz na oficiální stránku turnaje). */}
      {(tournament.sport ?? 'football') === 'tennis' && isAdmin && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>
            🔗 {t('tournament.settings.officialResultsUrlTitle')}
          </h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {t('tournament.settings.officialResultsUrlDesc')}
          </div>
          <input
            type="url"
            inputMode="url"
            autoComplete="url"
            value={tournament.settings.officialResultsUrl ?? ''}
            onChange={e => updateTournament(tournament.id, {
              settings: { ...tournament.settings, officialResultsUrl: e.target.value.trim() || undefined },
            })}
            placeholder="https://cztenis.cz/…"
            style={{
              width: '100%', padding: '10px', borderRadius: 10,
              border: '1.5px solid var(--border)', fontSize: 13,
              background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              fontFamily: 'ui-monospace, monospace',
            }}
          />
        </div>
      )}

      {/* Propozice — collapsible regulations form */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setRegsOpen(!regsOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>📋 {t('tournament.settings.regulationsTitle')}</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: regsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>

        {regsOpen && <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Text inputs */}
          {([
            { key: 'organizer' as const, label: t('tournament.regulations.organizer') },
            { key: 'category' as const, label: t('tournament.regulations.category') },
            { key: 'pitchDimensions' as const, label: t('tournament.regulations.pitchDimensions'), placeholder: t('tournament.regulations.pitchDimensionsPlaceholder') },
            { key: 'matchFormat' as const, label: t('tournament.regulations.matchFormat'), placeholder: t('tournament.regulations.matchFormatPlaceholder') },
            { key: 'substitutionRules' as const, label: t('tournament.regulations.substitutionRules'), placeholder: t('tournament.regulations.substitutionRulesPlaceholder') },
          ]).map(field => (
            <div key={field.key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {field.label}
              </label>
              <input
                type="text"
                value={(regs[field.key] as string) || ''}
                onChange={e => updateReg(field.key, e.target.value)}
                placeholder={field.placeholder}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                  border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          {/* Textarea: gameRules */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {t('tournament.regulations.gameRules')}
            </label>
            <textarea
              value={regs.gameRules || ''}
              onChange={e => updateReg('gameRules', e.target.value)}
              placeholder={t('tournament.regulations.gameRulesPlaceholder')}
              rows={3}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5,
              }}
            />
          </div>

          {/* Textarea: cardRules */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {t('tournament.regulations.cardRules')}
            </label>
            <textarea
              value={regs.cardRules || ''}
              onChange={e => updateReg('cardRules', e.target.value)}
              placeholder={t('tournament.regulations.cardRulesPlaceholder')}
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5,
              }}
            />
          </div>

          {/* Textarea: protestRules */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {t('tournament.regulations.protestRules')}
            </label>
            <textarea
              value={regs.protestRules || ''}
              onChange={e => updateReg('protestRules', e.target.value)}
              placeholder={t('tournament.regulations.protestRulesPlaceholder')}
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5,
              }}
            />
          </div>

          {/* More text inputs */}
          {([
            { key: 'equipment' as const, label: t('tournament.regulations.equipment') },
            { key: 'prizes' as const, label: t('tournament.regulations.prizes') },
            { key: 'referees' as const, label: t('tournament.regulations.referees') },
          ]).map(field => (
            <div key={field.key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {field.label}
              </label>
              <input
                type="text"
                value={(regs[field.key] as string) || ''}
                onChange={e => updateReg(field.key, e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                  border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          {/* Textarea: insurance (with default) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {t('tournament.regulations.insurance')}
            </label>
            <textarea
              value={regs.insurance ?? t('tournament.regulations.insuranceDefault')}
              onChange={e => updateReg('insurance', e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5,
              }}
            />
          </div>

          {/* changingRooms */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {t('tournament.regulations.changingRooms')}
            </label>
            <input
              type="text"
              value={regs.changingRooms || ''}
              onChange={e => updateReg('changingRooms', e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Textarea: organizerDisclaimer (with default) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {t('tournament.regulations.organizerDisclaimer')}
            </label>
            <textarea
              value={regs.organizerDisclaimer ?? t('tournament.regulations.organizerDisclaimerDefault')}
              onChange={e => updateReg('organizerDisclaimer', e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5,
              }}
            />
          </div>

          {/* Contact fields */}
          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
          {([
            { key: 'contactName' as const, label: t('tournament.regulations.contactName') },
            { key: 'contactPhone' as const, label: t('tournament.regulations.contactPhone'), type: 'tel' },
            { key: 'contactEmail' as const, label: t('tournament.regulations.contactEmail'), type: 'email' },
          ] as const).map(field => (
            <div key={field.key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {field.label}
              </label>
              <input
                type={'type' in field ? field.type : 'text'}
                value={(regs[field.key] as string) || ''}
                onChange={e => updateReg(field.key, e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                  border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          {/* Roster required toggle */}
          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
          <div
            onClick={() => updateReg('rosterRequired', !regs.rosterRequired)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', cursor: 'pointer' }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t('tournament.regulations.rosterRequired')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('tournament.regulations.rosterRequiredDesc')}</div>
            </div>
            <div style={{
              width: 51, height: 31, borderRadius: 16, padding: 2,
              background: regs.rosterRequired ? '#4CD964' : '#E5E5EA',
              transition: 'background .25s', flexShrink: 0,
            }}>
              <div style={{
                width: 27, height: 27, borderRadius: 14, background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,.15)',
                transition: 'transform .25s',
                transform: regs.rosterRequired ? 'translateX(20px)' : 'translateX(0)',
              }} />
            </div>
          </div>

          {/* Penalty rounds stepper */}
          <SettingsStepper
            label={t('tournament.regulations.penaltyRounds')}
            value={regs.penaltyRounds ?? 5}
            min={3}
            max={10}
            onChange={v => updateReg('penaltyRounds', v)}
            unit={t('tournament.regulations.penaltyRoundsUnit')}
          />
        </div>

        <button onClick={handleSaveRegulations} style={{
          background: regsSaved ? 'var(--success)' : 'var(--primary)', color: '#fff',
          fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12,
          transition: 'background .2s', width: '100%',
        }}>
          {regsSaved ? '✅ ' + t('tournament.settings.regulationsSaved') : '💾 ' + t('tournament.settings.saveRegulations')}
        </button>
        </>}
      </div>

      {/* Kritéria pro umístění v tabulce — collapsible */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setTiebreakerOpen(!tiebreakerOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>🏅 {t('tournament.tiebreaker.title')}</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: tiebreakerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>

        {tiebreakerOpen && <>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.5 }}>
          {isAdmin ? t('tournament.tiebreaker.desc') : t('tournament.tiebreaker.descReadonly')}
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
                draggable={isAdmin}
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
                  cursor: isAdmin ? 'grab' : 'default',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 11, background: 'var(--primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0,
                }}>{idx + 2}</div>
                {isAdmin && <span style={{ cursor: 'grab', fontSize: 14, color: 'var(--text-muted)', flexShrink: 0, userSelect: 'none' }}>⠿</span>}
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
        {isAdmin && (
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
              background: tbSaved ? 'var(--success)' : 'var(--primary)', color: '#fff',
              fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12,
              transition: 'background .2s',
            }}
          >
            {tbSaved ? `✅ ${t('tournament.tiebreaker.saved')}` : `💾 ${t('tournament.tiebreaker.title')}`}
          </button>
        )}
        </>}
      </div>

      {/* Přegenerování harmonogramu — collapsible */}
      {isAdmin && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            background: regenSaved ? 'var(--success)' : 'var(--primary)', color: '#fff',
            fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12,
            transition: 'background .2s', opacity: (!regenDate || !regenTime) ? 0.5 : 1,
          }}
        >
          {regenSaved ? '✅ ' + t('tournament.detail.scheduleRegenerated') : '🔄 ' + t('tournament.detail.regenerateSchedule')}
        </button>
        </>}
      </div>
      )}

      {/* Roster preview & admin roster fill — moved to DashboardTab */}

      {/* CSV export — collapsible */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setExportOpen(!exportOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>📤 {t('settings.sectionExport')}</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: exportOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
        {exportOpen && (
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
        )}
      </div>

      {/* Billing profile — fakturační údaje */}
      {isAdmin && tournament.settings.registrationEnabled && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={() => setBillingOpen(!billingOpen)}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 15, flex: 1, margin: 0 }}>🧾 {t('billing.title')}</h3>
          {billing.companyName && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓</span>}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: billingOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
        {billingOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
              {t('billing.desc')}
            </p>
            {[
              { key: 'companyName', label: t('billing.companyName'), required: true },
              { key: 'ico', label: t('billing.ico'), required: true },
              { key: 'dic', label: t('billing.dic') },
              { key: 'address', label: t('billing.address'), required: true },
              { key: 'city', label: t('billing.city'), required: true },
              { key: 'zip', label: t('billing.zip'), required: true },
              { key: 'bankAccount', label: t('billing.bankAccount'), required: true },
              { key: 'iban', label: t('billing.iban') },
              { key: 'email', label: t('billing.email') },
              { key: 'phone', label: t('billing.phone') },
            ].map(field => (
              <div key={field.key}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  {field.label}{field.required ? ' *' : ''}
                </label>
                <input
                  type="text"
                  value={(billing as Record<string, string>)[field.key] || ''}
                  onChange={e => setBilling(prev => ({ ...prev, [field.key]: e.target.value }))}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                    border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
            <button
              onClick={async () => {
                if (!firebaseUid || !billing.companyName || !billing.ico || !billing.bankAccount) {
                  showToast('error', t('common.error'));
                  return;
                }
                try {
                  const bp = billing as BillingProfile;
                  await saveBillingProfile(firebaseUid, bp);
                  await updateTournament(tournament.id, {
                    settings: { ...tournament.settings, billingProfile: bp },
                  });
                  setBillingSaved(true);
                  setTimeout(() => setBillingSaved(false), 2000);
                } catch {
                  showToast('error', t('common.error'));
                }
              }}
              disabled={!billing.companyName || !billing.ico || !billing.bankAccount}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                background: billingSaved ? 'var(--success)' : (!billing.companyName || !billing.ico || !billing.bankAccount) ? 'var(--border)' : 'var(--primary)',
                color: billingSaved ? '#fff' : (!billing.companyName || !billing.ico || !billing.bankAccount) ? 'var(--text-muted)' : '#fff',
                border: 'none', cursor: (!billing.companyName || !billing.ico || !billing.bankAccount) ? 'default' : 'pointer',
                transition: 'background .2s',
              }}
            >
              {billingSaved ? `✅ ${t('billing.saved')}` : `💾 ${t('billing.save')}`}
            </button>
          </div>
        )}
      </div>
      )}

      {/* Změna PINu */}
      {isAdmin && (
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
      {isAdmin && (
        <button onClick={handleSaveAsTemplate} style={{
          background: 'var(--success-light)', color: 'var(--success)', fontWeight: 700, fontSize: 14,
          padding: '14px', borderRadius: 14, border: '1.5px solid #C8E6C9',
        }}>
          📋 {t('template.saveAsTemplate')}
        </button>
      )}

      {/* Nebezpečná zóna */}
      {isOwner ? (
        <button onClick={handleDelete} style={{
          background: 'var(--danger-light)', color: 'var(--danger)', fontWeight: 700, fontSize: 14,
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
          background: 'var(--warning-light)', color: 'var(--warning)', fontWeight: 700, fontSize: 14,
          padding: '14px', borderRadius: 14, border: '1.5px solid #FFE0B2',
        }}>
          🚪 {t('tournament.settings.leaveTournament')}
        </button>
      )}
    </div>
  );
}

// ─── iOS-style Toggle Row ───────────────────────────────────────────────────
function ToggleRow({ icon, label, desc, checked, onChange }: {
  icon: string; label: string; desc: string;
  checked: boolean; onChange: (val: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0, width: 24, textAlign: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.3 }}>{desc}</div>
      </div>
      <div style={{
        width: 51, height: 31, borderRadius: 16, padding: 2,
        background: checked ? '#4CD964' : '#E5E5EA',
        transition: 'background .25s', flexShrink: 0,
        position: 'relative', cursor: 'pointer',
      }}>
        <div style={{
          width: 27, height: 27, borderRadius: 14,
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,.15)',
          transition: 'transform .25s',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
        }} />
      </div>
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
// eslint-disable-next-line react-refresh/only-export-components
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

  // Auto: top scorers computed from goals
  const topScorers = (() => {
    const scorerMap = new Map<string, { name: string; teamId: string; goals: number }>();
    for (const match of tournament.matches) {
      for (const goal of match.goals) {
        if (goal.isOwnGoal || !goal.playerId) continue;
        const key = `${goal.teamId}-${goal.playerId}`;
        const tm = tournament.teams.find(t2 => t2.id === goal.teamId);
        const player = tm?.players?.find(p => p.id === goal.playerId);
        const existing = scorerMap.get(key);
        if (existing) existing.goals++;
        else scorerMap.set(key, { name: player?.name ?? '?', teamId: goal.teamId, goals: 1 });
      }
    }
    const sorted = Array.from(scorerMap.values()).sort((a, b) => b.goals - a.goals);
    if (sorted.length === 0) return [];
    const maxGoals = sorted[0].goals;
    return sorted.filter(s => s.goals === maxGoals).map(s => {
      const tm = tournament.teams.find(t2 => t2.id === s.teamId);
      return { ...s, teamName: tm?.name ?? '?' };
    });
  })();

  // Auto-select: pokud je jen jeden top scorer, automaticky ho označ
  useEffect(() => {
    if (topScorers.length === 1) {
      const s = topScorers[0];
      const existing = awards.find(a => a.title === 'tournament.awards.bestScorer');
      if (!existing || existing.playerName !== s.name || existing.teamId !== s.teamId) {
        saveAward('tournament.awards.bestScorer', s.name, s.teamId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topScorers.length, topScorers[0]?.name, topScorers[0]?.teamId]);

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

      {/* Auto: Nejlepší střelec — computed from goals, selectable */}
      <div style={{
        padding: '10px 12px', borderRadius: 14, background: 'var(--surface-var)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: topScorers.length > 0 ? 8 : 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚽</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{t('tournament.awards.bestScorer')}</div>
            {topScorers.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 1 }}>
                {t('tournament.awards.autoSuggestion')}
              </div>
            )}
          </div>
        </div>
        {topScorers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topScorers.map(s => {
              const scorerAward = awards.find(a => a.title === 'tournament.awards.bestScorer');
              const isSelected = scorerAward?.playerName === s.name && scorerAward?.teamId === s.teamId;
              return (
                <button
                  key={`${s.teamId}-${s.name}`}
                  onClick={() => {
                    if (isSelected) {
                      clearAward('tournament.awards.bestScorer');
                    } else {
                      saveAward('tournament.awards.bestScorer', s.name, s.teamId);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 10,
                    background: isSelected ? 'var(--success-light)' : 'var(--surface)',
                    border: isSelected ? '2px solid #4CAF50' : '1.5px solid var(--border)',
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                    transition: 'all .15s',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{isSelected ? '✅' : '⚽'}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.teamName}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                    background: isSelected ? '#4CAF50' : 'var(--surface-var)',
                    color: isSelected ? '#fff' : 'var(--text-muted)',
                  }}>
                    {s.goals} {s.goals === 1 ? t('tournament.awards.goalSingular') : t('tournament.awards.goalPlural')}
                  </span>
                </button>
              );
            })}
            {topScorers.length > 1 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2, fontStyle: 'italic' }}>
                {t('tournament.awards.selectScorer')}
              </div>
            )}
          </div>
        )}
      </div>
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
            background: 'var(--danger-light)', color: 'var(--danger)',
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
