import { useState } from 'react';
import type { Page } from '../../App';
import { useAuth } from '../../context/AuthContext';
import { useTournamentStore } from '../../store/tournament.store';
import { useClubsStore } from '../../store/clubs.store';
import { useTemplatesStore } from '../../store/templates.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { useI18n } from '../../i18n';
import type { TournamentTemplate } from '../../types/tournament.types';
import { hashPin, generatePinSalt, markPinVerified } from '../../utils/pin-hash';
import { countRealMatches, countTotalMatchesForSettings, estimateTournamentDuration } from '../../utils/tournament-schedule';
import type { TournamentSettings, TournamentFormat, GroupDefinition, TiebreakerCriterion } from '../../types/tournament.types';
import { DEFAULT_TIEBREAKER_ORDER } from '../../types/tournament.types';
import type { Club, AgeCategory } from '../../types/club.types';
import { TEAM_COLORS } from '../../utils/team-colors';
import { useToastStore } from '../../store/toast.store';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { IconButton } from '../../components/ui';

import {
  ClubPickerModal,
  TemplatePickerModal,
  TeamsStep,
  PinAndScheduleStep,
  today,
  defaultTeams,
  generateDefaultMatchOrder,
  Stepper,
} from '../../components/tournament/create';
import type { TeamDraft, MatchOrderEntry } from '../../components/tournament/create';

interface Props { navigate: (p: Page) => void; }

// ─── Type selection ──────────────────────────────────────────────────────────
type TournamentType = 'round-robin' | 'groups-knockout' | 'knockout' | 'friendly';
type TeamSource = 'manual' | 'registration';

// ─── Main ─────────────────────────────────────────────────────────────────────
export function CreateTournamentPage({ navigate }: Props) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();
  const { user } = useAuth();
  const templates = useTemplatesStore(s => s.templates);
  const deleteTemplate = useTemplatesStore(s => s.deleteTemplate);
  const [step, setStep] = useState(0);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Sport — default z user preferences (zvolený v onboardingu), lze změnit zde.
  // Audit 2026-04-25: tato stránka je jen pro Advanced (fotbal/tenis). Pokud
  // se sem dostane florbalový user (přes URL routing), default na fotbal.
  const userPreferredSport = useUserPrefsStore(s => s.preferredSport);
  const [sport, setSport] = useState<'football' | 'tennis'>(
    userPreferredSport === 'tennis' ? 'tennis' : 'football'
  );

  // Step 0 — Typ turnaje
  const [tournamentType, setTournamentType] = useState<TournamentType | null>(null);

  // Step 1 — Zdroj tymu
  const [teamSource, setTeamSource] = useState<TeamSource | null>(null);

  // Step 2 — Zakladni info + tymy
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('14:30');
  const [maxTeams, setMaxTeams] = useState(8);
  const createTournament = useTournamentStore(s => s.createTournament);
  const { clubs, createClub } = useClubsStore();

  const homeClub = clubs.length > 0 ? clubs[0] : null;
  const [teams, setTeams] = useState<TeamDraft[]>(() => defaultTeams(t, homeClub));
  const [newPlayerName, setNewPlayerName] = useState<Record<number, string>>({});
  const [newPlayerNumber, setNewPlayerNumber] = useState<Record<number, string>>({});
  const [clubPickerForTeam, setClubPickerForTeam] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState<Record<number, boolean>>({});

  // Step 3 — Nastaveni zapasu + PIN
  const [matchDuration, setMatchDuration] = useState(15);
  const [breakDuration, setBreakDuration] = useState(2);
  const [numberOfPitches, setNumberOfPitches] = useState(1);
  const [rules, setRules] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('round-robin');
  const [groupCount, setGroupCount] = useState(2);
  const [advancePerGroup, setAdvancePerGroup] = useState(1);
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(false);
  const [playOut, setPlayOut] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [creating, setCreating] = useState(false);
  const [matchOrder, setMatchOrder] = useState<MatchOrderEntry[]>([]);
  const [tiebreakerOrder, setTiebreakerOrder] = useState<TiebreakerCriterion[]>([...DEFAULT_TIEBREAKER_ORDER]);
  const [tbDragIdx, setTbDragIdx] = useState<number | null>(null);
  const [tbDragOverIdx, setTbDragOverIdx] = useState<number | null>(null);
  const [entryFee, setEntryFee] = useState('');
  const [entryFeeNote, setEntryFeeNote] = useState('');
  const [maxBirthYear, setMaxBirthYear] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueNote, setVenueNote] = useState('');
  const [sendInvoice, setSendInvoice] = useState(false);
  const [billingForm, setBillingForm] = useState<Record<string, string>>({});

  const isFriendly = tournamentType === 'friendly';
  const isRegistration = teamSource === 'registration';

  // Smart defaults based on type
  const applyTypeDefaults = (type: TournamentType) => {
    setTournamentType(type);
    if (type === 'friendly') {
      setMatchDuration(10);
      setBreakDuration(2);
      setFormat('round-robin');
    } else {
      setMatchDuration(15);
      setBreakDuration(2);
      if (type === 'groups-knockout') setFormat('groups-knockout');
      else if (type === 'knockout') setFormat('knockout');
      else setFormat('round-robin');
    }
  };

  // Automaticky generuj skupiny z tymu
  const autoGroups: GroupDefinition[] = (() => {
    if (format !== 'groups-knockout' || teams.length < 4) return [];
    const gc = Math.min(groupCount, Math.floor(teams.length / 2));
    const groups: GroupDefinition[] = [];
    for (let g = 0; g < gc; g++) {
      groups.push({
        id: `group-${String.fromCharCode(65 + g)}`,
        name: `Skupina ${String.fromCharCode(65 + g)}`,
        teamIds: [],
      });
    }
    teams.forEach((_, i) => {
      const gIdx = i % gc;
      groups[gIdx].teamIds.push(`team-placeholder-${i}`);
    });
    return groups;
  })();

  const settings: TournamentSettings = {
    matchDurationMinutes: matchDuration,
    breakBetweenMatchesMinutes: breakDuration,
    startTime,
    startDate,
    rules: rules.trim() || undefined,
    numberOfPitches: numberOfPitches > 1 ? numberOfPitches : undefined,
    format: format !== 'round-robin' ? format : undefined,
    groups: format === 'groups-knockout' ? autoGroups : undefined,
    advancePerGroup: format === 'groups-knockout' ? advancePerGroup : undefined,
    thirdPlaceMatch: (format !== 'round-robin' && thirdPlaceMatch) ? true : undefined,
    playOut: (format !== 'round-robin' && playOut) ? true : undefined,
    friendlyMode: isFriendly || undefined,
    registrationEnabled: isRegistration || undefined,
    maxTeams: isRegistration ? maxTeams : undefined,
    endTime: isRegistration ? endTime : undefined,
    tiebreakerOrder: !isFriendly ? tiebreakerOrder : undefined,
    entryFee: isRegistration && parseInt(entryFee) > 0 ? parseInt(entryFee) : undefined,
    entryFeeNote: isRegistration && entryFeeNote.trim() ? entryFeeNote.trim() : undefined,
    maxBirthYear: maxBirthYear.trim() && parseInt(maxBirthYear) > 1950 ? parseInt(maxBirthYear) : undefined,
    venueName: venueName.trim() || undefined,
    venueAddress: venueAddress.trim() || undefined,
    venueNote: venueNote.trim() || undefined,
    billingProfile: sendInvoice && billingForm.companyName && billingForm.bankAccount ? {
      companyName: billingForm.companyName,
      ico: billingForm.ico || '',
      address: billingForm.address || '',
      city: billingForm.city || '',
      zip: billingForm.zip || '',
      bankAccount: billingForm.bankAccount,
      dic: billingForm.dic || undefined,
      iban: billingForm.iban || undefined,
      email: billingForm.email || undefined,
      phone: billingForm.phone || undefined,
    } : undefined,
  };

  const totalMatches = format === 'round-robin'
    ? countRealMatches(teams.length)
    : countTotalMatchesForSettings(settings, teams.length);
  const totalMinutes = estimateTournamentDuration(teams.length, settings);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainMinutes = totalMinutes % 60;

  // ── Aplikovat sablonu ─────────────────────────────────────────────────────
  const applyTemplate = (tpl: TournamentTemplate) => {
    setName(tpl.sourceTournamentName + ' (kopie)');
    setMatchDuration(tpl.settings.matchDurationMinutes);
    setBreakDuration(tpl.settings.breakBetweenMatchesMinutes);
    setStartTime(tpl.settings.startTime);
    setNumberOfPitches(tpl.settings.numberOfPitches ?? 1);
    setRules(tpl.settings.rules ?? '');
    setFormat(tpl.settings.format ?? 'round-robin');
    if (tpl.settings.groups) setGroupCount(tpl.settings.groups.length);
    if (tpl.settings.advancePerGroup) setAdvancePerGroup(tpl.settings.advancePerGroup);
    setThirdPlaceMatch(!!tpl.settings.thirdPlaceMatch);
    if (tpl.settings.friendlyMode) {
      setTournamentType('friendly');
      setFormat('round-robin');
    } else {
      const fmt = tpl.settings.format ?? 'round-robin';
      setFormat(fmt);
      setTournamentType(fmt as TournamentType);
    }
    // Registration / entry fee settings from template
    if (tpl.settings.registrationEnabled) {
      setTeamSource('registration');
      if (tpl.settings.maxTeams) setMaxTeams(tpl.settings.maxTeams);
      if (tpl.settings.endTime) setEndTime(tpl.settings.endTime);
      if (tpl.settings.entryFee) setEntryFee(String(tpl.settings.entryFee));
      if (tpl.settings.entryFeeNote) setEntryFeeNote(tpl.settings.entryFeeNote);
    }
    if (tpl.settings.maxBirthYear) setMaxBirthYear(String(tpl.settings.maxBirthYear));
    if (tpl.settings.venueName) setVenueName(tpl.settings.venueName);
    if (tpl.settings.venueAddress) setVenueAddress(tpl.settings.venueAddress);
    if (tpl.settings.venueNote) setVenueNote(tpl.settings.venueNote);
    // Šablona aplikuje pouze nastavení — týmy si trenér přidá sám
    // (ručně, přes registraci, nebo z klubů)
    setShowTemplatePicker(false);
    setStep(1); // Jump to team source step (manual/registration/clubs)
  };

  // ── Navigace wizard ────────────────────────────────────────────────────────
  const stepTitles = [
    t('tournament.create.stepType'),
    t('tournament.create.stepSource'),
    step === 2 && isRegistration ? t('tournament.create.stepInfoReg') : t('tournament.create.stepInfoTeams'),
    t('tournament.create.stepSettings'),
  ];

  const goBack = () => {
    if (step === 0) navigate({ name: 'tournament-list' });
    else setStep(s => s - 1);
  };

  // ── Tymy ──────────────────────────────────────────────────────────────────
  const addTeam = () => {
    if (teams.length >= 16) return;
    const colorIdx = teams.length % TEAM_COLORS.length;
    setTeams(prev => [...prev, {
      name: `Tým ${String.fromCharCode(65 + prev.length)}`,
      color: TEAM_COLORS[colorIdx],
      players: [],
      expanded: true,
      clubId: null,
      logoBase64: null,
    }]);
  };

  const removeTeam = (idx: number) => {
    setTeams(prev => prev.filter((_, i) => i !== idx));
  };

  const updateTeam = (idx: number, updates: Partial<TeamDraft>) => {
    setTeams(prev => prev.map((tm, i) => i === idx ? { ...tm, ...updates } : tm));
  };

  const addPlayer = (teamIdx: number) => {
    const nm = (newPlayerName[teamIdx] ?? '').trim();
    const nr = parseInt(newPlayerNumber[teamIdx] ?? '');
    if (!nm || isNaN(nr) || nr < 1 || nr > 99) return;
    updateTeam(teamIdx, {
      players: [...teams[teamIdx].players, { name: nm, jerseyNumber: nr }],
    });
    setNewPlayerName(prev => ({ ...prev, [teamIdx]: '' }));
    setNewPlayerNumber(prev => ({ ...prev, [teamIdx]: '' }));
  };

  const removePlayer = (teamIdx: number, playerIdx: number) => {
    updateTeam(teamIdx, {
      players: teams[teamIdx].players.filter((_, i) => i !== playerIdx),
    });
  };

  const handleSelectClub = (teamIdx: number, club: Club, category?: AgeCategory) => {
    // Propaguj clubPlayerId pro spolehlivé matchování statistik napříč moduly.
    let players: Array<{ name: string; jerseyNumber: number; clubPlayerId?: string }>;
    const allClubPlayers = club.players ?? [];

    if (category && allClubPlayers.length > 0) {
      // Konkrétní kategorie
      players = allClubPlayers
        .filter(p => p.ageCategory === category && p.active)
        .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, clubPlayerId: p.id }));
    } else if (!category && allClubPlayers.length > 0) {
      // "Všechny kategorie" (undefined) nebo klub s jedinou kategorií —
      // vezmi všechny aktivní hráče napříč kategoriemi.
      players = allClubPlayers
        .filter(p => p.active)
        .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, clubPlayerId: p.id }));
    } else {
      players = (club.defaultPlayers ?? []).map(p => ({ ...p }));
    }

    updateTeam(teamIdx, {
      name: club.name,
      color: club.color,
      logoBase64: club.logoBase64,
      clubId: club.id,
      players,
    });
    setClubPickerForTeam(null);
  };

  // ── Prechod na step 3 ──────────────────────────────────────────────────────
  const goToStep3 = () => {
    if (teams.length >= 2) {
      setMatchOrder(generateDefaultMatchOrder(teams.length));
    } else {
      setMatchOrder([]);
    }
    setStep(3);
  };

  const resetMatchOrder = () => {
    setMatchOrder(generateDefaultMatchOrder(teams.length));
  };

  // ── Vytvoreni turnaje ─────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (pin.length !== 6) { setPinError(t('tournament.create.pinError6')); return; }
    if (pin !== pinConfirm) { setPinError(t('tournament.create.pinErrorMatch')); return; }
    setPinError('');
    setCreating(true);
    try {
      const pinSalt = generatePinSalt();
      const pinHash = await hashPin(pin, pinSalt);
      const tournament = await createTournament({
        name: name.trim(),
        sport,
        settings,
        teams: teams.map(tm => ({
          name: tm.name,
          color: tm.color,
          players: tm.players,
          clubId: tm.clubId,
          logoBase64: tm.logoBase64,
        })),
        pinHash,
        pinSalt,
        matchOrder,
      });
      markPinVerified(tournament.id);
      // Save billing profile to user account if provided
      if (settings.billingProfile) {
        const uid = useTournamentStore.getState().firebaseUid;
        if (uid) {
          import('../../services/billing.firebase').then(({ saveBillingProfile }) => {
            saveBillingProfile(uid, settings.billingProfile!).catch(() => {});
          });
        }
      }
      // Mark as just created so dashboard shows welcome banner
      try { sessionStorage.setItem(`torq_just_created_${tournament.id}`, '1'); } catch { /* */ }
      useToastStore.getState().show('success', t('toast.tournamentCreated'));
      navigate({ name: 'tournament-detail', tournamentId: tournament.id });
    } finally {
      setCreating(false);
    }
  };

  // ── Can proceed? ──────────────────────────────────────────────────────────
  const canNext0 = tournamentType !== null;
  const canNext1 = teamSource !== null;
  const canNext2 = name.trim().length >= 2 && (isRegistration || teams.length >= 2);
  const canNext3 = pin.length === 6 && pin === pinConfirm;

  // ── Selection card style helper ───────────────────────────────────────────
  const cardStyle = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '24px 16px',
    borderRadius: 16,
    background: selected ? 'var(--primary)' : 'var(--surface)',
    color: selected ? '#fff' : 'var(--text)',
    border: selected ? '2px solid var(--primary)' : '2px solid var(--border)',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all .2s',
    boxShadow: selected ? '0 4px 16px rgba(0,0,0,.15)' : '0 1px 4px rgba(0,0,0,.05)',
    transform: selected ? 'scale(1.02)' : 'scale(1)',
  });

  // ── Toggle helper ─────────────────────────────────────────────────────────
  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: value ? 'var(--primary)' : 'var(--border)',
        position: 'relative', transition: 'background .2s', border: 'none', cursor: 'pointer',
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: 10, background: '#fff',
        position: 'absolute', top: 3,
        left: value ? 21 : 3, transition: 'left .2s',
      }} />
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%', maxWidth: isDesktop ? 800 : undefined, margin: isDesktop ? '0 auto' : undefined, boxSizing: 'border-box' }}>
      {/* Club Picker Modal */}
      {clubPickerForTeam !== null && (
        <ClubPickerModal
          clubs={clubs}
          onSelect={(club, category) => handleSelectClub(clubPickerForTeam, club, category)}
          onCreateClub={async (n, c, l) => await createClub({ name: n, color: c, logoBase64: l })}
          onClose={() => setClubPickerForTeam(null)}
        />
      )}

      {/* Template Picker Modal */}
      {showTemplatePicker && (
        <TemplatePickerModal
          templates={templates}
          onSelect={applyTemplate}
          onDelete={user ? (id) => deleteTemplate(user.uid, id) : undefined}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        <IconButton variant="secondary" aria-label={t('common.back')} onClick={goBack}>
          ←
        </IconButton>
        <h1 style={{ fontWeight: 800, fontSize: 18, flex: 1 }}>
          {stepTitles[step]}
        </h1>
        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: i === step ? 20 : 8, height: 8, borderRadius: 4,
              background: i <= step ? 'var(--primary)' : 'var(--border)',
              transition: 'all .2s',
            }} />
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ─── Step 0: Typ turnaje ─── */}
        {step === 0 && (
          <>
            {/* Sport picker — multi-sport aplikace */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {(['football', 'tennis'] as const).map(sp => {
                const isActive = sport === sp;
                return (
                  <button
                    key={sp}
                    onClick={() => setSport(sp)}
                    style={{
                      padding: '10px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                      background: isActive ? 'var(--primary)' : 'var(--surface)',
                      color: isActive ? '#fff' : 'var(--text-muted)',
                      border: isActive ? 'none' : '1.5px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    {sp === 'football' ? '⚽' : '🎾'} {t(`sport.${sp}`)}
                  </button>
                );
              })}
            </div>

            {/* Sablona */}
            {templates.length > 0 && (
              <button onClick={() => setShowTemplatePicker(true)} style={{
                background: 'var(--surface)', borderRadius: 14, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: 'var(--shadow-sm)', width: '100%',
                border: '1.5px dashed var(--primary)', color: 'var(--primary)', fontWeight: 700, fontSize: 14,
              }}>
                <span style={{ fontSize: 18 }}>📋</span>
                {t('template.fromTemplate')} ({templates.length})
              </button>
            )}

            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', margin: '8px 0 0' }}>
              {t('tournament.create.typeQuestion')}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              {([
                ['round-robin', '🔄', 'typeRoundRobin'],
                ['groups-knockout', '🏆', 'typeGroupsKnockout'],
                ['knockout', '⚡', 'typeKnockout'],
                ['friendly', '⚽', 'typeFriendly'],
              ] as [TournamentType, string, string][]).map(([type, icon, key]) => (
                <button
                  key={type}
                  onClick={() => { applyTypeDefaults(type); setStep(1); }}
                  style={cardStyle(tournamentType === type)}
                >
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{t(`tournament.create.${key}`)}</div>
                  <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>{t(`tournament.create.${key}Desc`)}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ─── Step 1: Zdroj tymu ─── */}
        {step === 1 && (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', margin: '8px 0 0' }}>
              {t('tournament.create.sourceQuestion')}
            </p>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                onClick={() => { setTeamSource('registration'); setStep(2); }}
                style={cardStyle(teamSource === 'registration')}
              >
                <div style={{ fontSize: 40, marginBottom: 8 }}>📝</div>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{t('tournament.create.sourceRegistration')}</div>
                <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>{t('tournament.create.sourceRegistrationDesc')}</div>
              </button>
              <button
                onClick={() => { setTeamSource('manual'); setStep(2); }}
                style={cardStyle(teamSource === 'manual')}
              >
                <div style={{ fontSize: 40, marginBottom: 8 }}>👥</div>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{t('tournament.create.sourceManual')}</div>
                <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>{t('tournament.create.sourceManualDesc')}</div>
              </button>
            </div>
          </>
        )}

        {/* ─── Step 2: Info + Tymy / Registrace ─── */}
        {step === 2 && (
          <>
            {/* Nazev + datum */}
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-sm)' }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.name')}</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('tournament.create.namePlaceholder')}
                  maxLength={200}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
                    fontSize: 15, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Datum + Začátek + Konec (registrace) */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1.2 }}>
                  <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'block' }}>{t('tournament.create.date')}</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 8px', borderRadius: 10, border: '1.5px solid var(--border)',
                      fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 0.8 }}>
                  <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'block' }}>{t('tournament.create.startTime')}</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 8px', borderRadius: 10, border: '1.5px solid var(--border)',
                      fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    }}
                  />
                </div>
                {isRegistration && (
                  <div style={{ flex: 0.8 }}>
                    <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'block' }}>{t('tournament.create.endTime')}</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 8px', borderRadius: 10, border: '1.5px solid var(--border)',
                        fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
              </div>
              {startDate && (() => {
                const d = new Date(startDate + 'T00:00:00');
                const dayNames = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
                const day = dayNames[d.getDay()];
                const diff = Math.ceil((d.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
                const relative = diff === 0 ? 'dnes' : diff === 1 ? 'zítra' : diff > 1 ? `za ${diff} dní` : '';
                return (
                  <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, marginTop: -8 }}>
                    📅 {day} {d.getDate()}.{d.getMonth()+1}.{d.getFullYear()}{relative ? ` · ${relative}` : ''}
                  </div>
                );
              })()}
            </div>

            {/* Místo konání */}
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>📍 {t('venue.title')}</h3>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block' }}>{t('venue.name')}</label>
                <input
                  value={venueName}
                  onChange={e => setVenueName(e.target.value)}
                  placeholder={t('venue.namePlaceholder')}
                  maxLength={200}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)',
                    fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block' }}>{t('venue.address')}</label>
                <input
                  value={venueAddress}
                  onChange={e => setVenueAddress(e.target.value)}
                  placeholder={t('venue.addressPlaceholder')}
                  maxLength={300}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)',
                    fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block' }}>
                  {t('venue.note')}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>{t('tournament.create.rulesOptional')}</span>
                </label>
                <textarea
                  value={venueNote}
                  onChange={e => setVenueNote(e.target.value)}
                  placeholder={t('venue.notePlaceholder')}
                  maxLength={1000}
                  rows={2}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)',
                    fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    resize: 'vertical', lineHeight: 1.5,
                  }}
                />
              </div>
            </div>

            {/* Tymy (manual) nebo smart nastaveni (registrace) */}
            {isRegistration ? (
              <>
                {/* Nastaveni turnaje */}
                <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-sm)' }}>
                  <Stepper label={t('tournament.create.pitchCount')} value={numberOfPitches} min={1} max={8} step={1} onChange={setNumberOfPitches} unit="" />
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <Stepper label={t('tournament.create.maxTeams')} value={maxTeams} min={3} max={16} step={1} onChange={setMaxTeams} unit="" />
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <Stepper label={t('tournament.create.matchDuration')} value={matchDuration} min={1} max={120} step={1} onChange={setMatchDuration} unit={t('common.min')} />
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <Stepper label={t('tournament.create.break')} value={breakDuration} min={0} max={15} step={1} onChange={setBreakDuration} unit={t('common.min')} />

                  {/* Smart kalkulace */}
                  {(() => {
                    const [sh, sm] = startTime.split(':').map(Number);
                    const [eh, em] = endTime.split(':').map(Number);
                    const availMinutes = (eh * 60 + em) - (sh * 60 + sm);
                    if (availMinutes <= 0) return null;

                    const CEREMONY_MINUTES = 15;
                    // Pro groups-knockout: vytvořit virtuální groups z maxTeams (teams ještě nemusí existovat)
                    const calcSettings = { ...settings };
                    if (format === 'groups-knockout' && (!calcSettings.groups || calcSettings.groups.length === 0)) {
                      const gc = Math.min(groupCount, Math.floor(maxTeams / 2));
                      const base = Math.floor(maxTeams / gc);
                      const rem = maxTeams % gc;
                      calcSettings.groups = Array.from({ length: gc }, (_, i) => ({
                        id: `calc-${i}`,
                        name: `G${i}`,
                        teamIds: Array.from({ length: base + (i < rem ? 1 : 0) }, (_, j) => `t${i}-${j}`),
                      }));
                      calcSettings.advancePerGroup = advancePerGroup;
                      calcSettings.thirdPlaceMatch = thirdPlaceMatch;
                      calcSettings.playOut = playOut;
                    }
                    const nMatches = format === 'round-robin'
                      ? countRealMatches(maxTeams)
                      : countTotalMatchesForSettings(calcSettings, maxTeams);
                    const slots = Math.ceil(nMatches / numberOfPitches);
                    const recommendedDur = Math.floor((availMinutes - CEREMONY_MINUTES - (slots - 1) * breakDuration) / slots);
                    const actualDuration = estimateTournamentDuration(maxTeams, { ...settings, matchDurationMinutes: matchDuration });
                    const totalWithCeremony = actualDuration + CEREMONY_MINUTES;
                    const fits = totalWithCeremony <= availMinutes;

                    const availH = Math.floor(availMinutes / 60);
                    const availM = availMinutes % 60;
                    const totH = Math.floor(totalWithCeremony / 60);
                    const totM = totalWithCeremony % 60;

                    return (
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 0,
                        borderRadius: 12, overflow: 'hidden',
                        border: `1.5px solid ${fits ? 'rgba(76,175,80,0.3)' : 'rgba(211,47,47,0.3)'}`,
                      }}>
                        {/* Status header */}
                        <div style={{
                          padding: '10px 14px',
                          background: fits ? 'rgba(76,175,80,0.12)' : 'rgba(211,47,47,0.12)',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span style={{ fontSize: 18 }}>{fits ? '✅' : '⚠️'}</span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: fits ? 'var(--success)' : '#D32F2F' }}>
                            {fits ? t('tournament.create.fitsInTime') : t('tournament.create.doesNotFit')}
                          </span>
                        </div>
                        {/* Details */}
                        <div style={{
                          padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6,
                          background: fits ? 'rgba(76,175,80,0.04)' : 'rgba(211,47,47,0.04)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
                            <span>{t('tournament.create.totalMatches')}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{nMatches}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
                            <span>{t('tournament.create.availableTime')}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{availH > 0 ? `${availH}h ` : ''}{availM > 0 ? `${availM} min` : ''}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
                            <span>{t('tournament.create.estimatedDuration')}</span>
                            <span style={{ fontWeight: 600, color: fits ? 'var(--success)' : '#D32F2F' }}>{totH > 0 ? `${totH}h ` : ''}{totM > 0 ? `${totM} min` : ''}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                            {t('tournament.create.ceremonyIncluded')}
                          </div>
                        </div>
                        {/* Recommended button */}
                        {recommendedDur >= 5 && recommendedDur !== matchDuration && (
                          <button
                            onClick={() => setMatchDuration(recommendedDur)}
                            style={{
                              padding: '10px 14px', fontSize: 13, fontWeight: 700,
                              background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                          >
                            💡 {t('tournament.create.recommendedDuration')}: {recommendedDur} min →
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Detaily formatu */}
                {format === 'groups-knockout' && (
                  <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('knockout.groupsKnockout')}</h3>
                    <Stepper label={t('knockout.groupCount')} value={groupCount} min={2} max={4} step={1} onChange={setGroupCount} unit="" />
                    <Stepper label={t('knockout.advancePerGroup')} value={advancePerGroup} min={1} max={2} step={1} onChange={setAdvancePerGroup} unit="" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{t('knockout.thirdPlace')}</label>
                      <Toggle value={thirdPlaceMatch} onChange={setThirdPlaceMatch} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontWeight: 600, fontSize: 14 }}>{t('knockout.playOut') || 'Zápasy o umístění'}</label>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('knockout.playOutDesc') || 'Každý tým odchází s konkrétním umístěním'}</div>
                      </div>
                      <Toggle value={playOut} onChange={setPlayOut} />
                    </div>
                  </div>
                )}
                {format === 'knockout' && (
                  <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('knockout.pureKnockout')}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{t('knockout.thirdPlace')}</label>
                      <Toggle value={thirdPlaceMatch} onChange={setThirdPlaceMatch} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <TeamsStep
                teams={teams}
                totalMatches={totalMatches}
                totalHours={totalHours}
                remainMinutes={remainMinutes}
                newPlayerName={newPlayerName}
                setNewPlayerName={setNewPlayerName}
                newPlayerNumber={newPlayerNumber}
                setNewPlayerNumber={setNewPlayerNumber}
                onAddTeam={addTeam}
                onRemoveTeam={removeTeam}
                onUpdateTeam={updateTeam}
                onAddPlayer={addPlayer}
                onRemovePlayer={removePlayer}
                onOpenClubPicker={setClubPickerForTeam}
                logoUploading={logoUploading}
                setLogoUploading={setLogoUploading}
              />
            )}
          </>
        )}

        {/* ─── Step 3: Nastaveni zapasu + pravidla + PIN ─── */}
        {step === 3 && (
          <>
            {/* Nejstarší ročník (pro všechny typy) */}
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>🎂 {t('settings.maxBirthYear')}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                {t('settings.maxBirthYearDesc')}
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1950"
                  max={new Date().getFullYear()}
                  value={maxBirthYear}
                  onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setMaxBirthYear(v); }}
                  placeholder={t('settings.maxBirthYearPlaceholder')}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
                    fontSize: 15, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    maxWidth: 140,
                  }}
                />
                {maxBirthYear.length === 4 && (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    = U{new Date().getFullYear() - parseInt(maxBirthYear)}
                  </span>
                )}
              </div>
            </div>

            {/* Startovné (jen pro registraci) */}
            {isRegistration && (
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ fontWeight: 700, fontSize: 15 }}>💰 {t('registration.entryFee')}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  {t('tournament.create.entryFeeDesc')}
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={entryFee}
                    onChange={e => setEntryFee(e.target.value)}
                    placeholder={t('registration.entryFeePlaceholder')}
                    style={{
                      flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
                      fontSize: 15, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                      maxWidth: 140,
                    }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>Kč</span>
                </div>
                <div>
                  <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block', color: 'var(--text-muted)' }}>
                    {t('tournament.create.entryFeeNote')}
                  </label>
                  <input
                    value={entryFeeNote}
                    onChange={e => setEntryFeeNote(e.target.value)}
                    placeholder={t('tournament.create.entryFeeNotePlaceholder')}
                    maxLength={200}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)',
                      fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Nastaveni zapasu — jen pro manualni flow (registracni je uz v step 2) */}
            {!isRegistration && (
              <>
                <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-sm)' }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('tournament.create.matchDurations')}</h3>
                  <Stepper label={t('tournament.create.pitchCount')} value={numberOfPitches} min={1} max={8} step={1} onChange={setNumberOfPitches} unit="" />
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <Stepper label={t('tournament.create.matchDuration')} value={matchDuration} min={1} max={120} step={1} onChange={setMatchDuration} unit={t('common.min')} />
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <Stepper label={t('tournament.create.break')} value={breakDuration} min={0} max={15} step={1} onChange={setBreakDuration} unit={t('common.min')} />
                </div>

                {format === 'groups-knockout' && (
                  <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('knockout.groupsKnockout')}</h3>
                    <Stepper label={t('knockout.groupCount')} value={groupCount} min={2} max={4} step={1} onChange={setGroupCount} unit="" />
                    <Stepper label={t('knockout.advancePerGroup')} value={advancePerGroup} min={1} max={2} step={1} onChange={setAdvancePerGroup} unit="" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{t('knockout.thirdPlace')}</label>
                      <Toggle value={thirdPlaceMatch} onChange={setThirdPlaceMatch} />
                    </div>
                  </div>
                )}

                {format === 'knockout' && (
                  <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('knockout.pureKnockout')}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{t('knockout.thirdPlace')}</label>
                      <Toggle value={thirdPlaceMatch} onChange={setThirdPlaceMatch} />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Poradi zapasu (jen pro manual tymy) */}
            {!isRegistration && teams.length >= 2 && (
              <PinAndScheduleStep
                pin="" setPin={() => {}} pinConfirm="" setPinConfirm={() => {}} pinError="" setPinError={() => {}}
                matchOrder={matchOrder} setMatchOrder={setMatchOrder}
                teams={teams}
                totalMatches={totalMatches}
                totalHours={totalHours}
                remainMinutes={remainMinutes}
                matchDuration={matchDuration}
                breakDuration={breakDuration}
                numberOfPitches={numberOfPitches}
                settings={settings}
                onResetMatchOrder={resetMatchOrder}
                hidePinSection
              />
            )}

            {/* Kritéria pro umístění v tabulce (ne pro friendly) */}
            {!isFriendly && (
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>🏅 {t('tournament.tiebreaker.title')}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.5 }}>
                  {t('tournament.tiebreaker.desc')}
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
                  {tiebreakerOrder.map((criterion, idx) => {
                    const isDragging = tbDragIdx === idx;
                    const isDragOver = tbDragOverIdx === idx && tbDragIdx !== idx;
                    return (
                      <div
                        key={criterion}
                        draggable
                        onDragStart={() => { setTbDragIdx(idx); }}
                        onDragOver={(e) => { e.preventDefault(); setTbDragOverIdx(idx); }}
                        onDrop={() => {
                          if (tbDragIdx === null || tbDragIdx === idx) { setTbDragIdx(null); setTbDragOverIdx(null); return; }
                          setTiebreakerOrder(prev => {
                            const next = [...prev];
                            const [moved] = next.splice(tbDragIdx, 1);
                            next.splice(idx, 0, moved);
                            return next;
                          });
                          setTbDragIdx(null);
                          setTbDragOverIdx(null);
                        }}
                        onDragEnd={() => { setTbDragIdx(null); setTbDragOverIdx(null); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 8px', background: 'var(--surface-var)', borderRadius: 10,
                          opacity: isDragging ? 0.4 : 1,
                          borderTop: isDragOver ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                          transition: 'opacity .15s, border-color .15s',
                          cursor: 'grab',
                        }}
                      >
                        <div style={{
                          width: 22, height: 22, borderRadius: 11, background: 'var(--primary-light)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0,
                        }}>{idx + 2}</div>
                        <span style={{ cursor: 'grab', fontSize: 14, color: 'var(--text-muted)', flexShrink: 0, userSelect: 'none' }}>⠿</span>
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
                    }}>{tiebreakerOrder.length + 2}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('tournament.tiebreaker.alphabet')}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>— {t('tournament.tiebreaker.alphabetDesc')}</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>🔒</span>
                  </div>
                </div>
              </div>
            )}

            {/* Pravidla a propozice */}
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, display: 'block' }}>
                  {t('tournament.create.rules')}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>{t('tournament.create.rulesOptional')}</span>
                </label>
                <textarea
                  value={rules}
                  onChange={e => setRules(e.target.value)}
                  placeholder={t('tournament.create.rulesPlaceholder')}
                  maxLength={5000}
                  rows={3}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
                    fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    resize: 'vertical', lineHeight: 1.5,
                  }}
                />
              </div>
            </div>

            {/* Invoice / billing — shown when entry fee is set */}
            {isRegistration && parseInt(entryFee) > 0 && (
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🧾</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{t('billing.invoiceToggle')}</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{t('billing.invoiceToggleDesc')}</p>
                  </div>
                  <div
                    onClick={() => setSendInvoice(!sendInvoice)}
                    style={{
                      width: 44, height: 26, borderRadius: 13, padding: 2, cursor: 'pointer',
                      background: sendInvoice ? '#4CAF50' : 'var(--border)', transition: 'background .2s',
                      display: 'flex', alignItems: 'center', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 11, background: '#fff',
                      transition: 'transform .2s', transform: sendInvoice ? 'translateX(18px)' : 'translateX(0)',
                      boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                    }} />
                  </div>
                </div>
                {sendInvoice && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
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
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                          {field.label}{field.required ? ' *' : ''}
                        </label>
                        <input
                          type="text"
                          value={billingForm[field.key] || ''}
                          onChange={e => setBillingForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                            border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PIN */}
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('tournament.create.pinOrg')}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                {t('tournament.create.pinDesc')}
              </p>
              <input
                type="tel"
                inputMode="numeric"
                value={pin}
                onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setPin(v); setPinError(''); }}
                placeholder={t('tournament.create.pinLabel')}
                style={{
                  width: '100%', padding: '14px', borderRadius: 10, border: '1.5px solid var(--border)',
                  fontSize: 20, fontWeight: 700, letterSpacing: 8, textAlign: 'center',
                  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                }}
              />
              <input
                type="tel"
                inputMode="numeric"
                value={pinConfirm}
                onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setPinConfirm(v); setPinError(''); }}
                placeholder={t('tournament.create.pinConfirm')}
                style={{
                  width: '100%', padding: '14px', borderRadius: 10, border: '1.5px solid var(--border)',
                  fontSize: 20, fontWeight: 700, letterSpacing: 8, textAlign: 'center',
                  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                }}
              />
              {pinError && <p style={{ color: '#D32F2F', fontSize: 13, fontWeight: 600, margin: 0 }}>{pinError}</p>}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', gap: 10, flexShrink: 0,
      }}>
        {step === 0 && (
          <button
            onClick={() => setStep(1)}
            disabled={!canNext0}
            style={{
              flex: 1, background: canNext0 ? 'var(--primary)' : 'var(--border)',
              color: canNext0 ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 16,
              padding: '14px', borderRadius: 14,
            }}
          >
            {t('tournament.create.continue')}
          </button>
        )}
        {step === 1 && (
          <button
            onClick={() => setStep(2)}
            disabled={!canNext1}
            style={{
              flex: 1, background: canNext1 ? 'var(--primary)' : 'var(--border)',
              color: canNext1 ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 16,
              padding: '14px', borderRadius: 14,
            }}
          >
            {t('tournament.create.continue')}
          </button>
        )}
        {step === 2 && (
          <button
            onClick={goToStep3}
            disabled={!canNext2}
            style={{
              flex: 1, background: canNext2 ? 'var(--primary)' : 'var(--border)',
              color: canNext2 ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 16,
              padding: '14px', borderRadius: 14,
            }}
          >
            {isRegistration
              ? t('tournament.create.continue')
              : t('tournament.create.continueInfo', { teams: teams.length, matches: totalMatches })
            }
          </button>
        )}
        {step === 3 && (
          <button
            onClick={handleCreate}
            disabled={creating || !canNext3}
            style={{
              flex: 1,
              background: creating || !canNext3 ? 'var(--border)' : 'var(--primary)',
              color: creating || !canNext3 ? 'var(--text-muted)' : '#fff',
              fontWeight: 700, fontSize: 16, padding: '14px', borderRadius: 14,
            }}
          >
            {creating ? t('tournament.create.creating') : t('tournament.create.submit')}
          </button>
        )}
      </div>
    </div>
  );
}
