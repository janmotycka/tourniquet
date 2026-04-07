import { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useToastStore } from '../../store/toast.store';
import { useTournamentStore } from '../../store/tournament.store';
import { DesktopPage, desktopPrimaryButtonStyle, desktopSecondaryButtonStyle } from '../../components/desktop/DesktopPage';
import { TEAM_COLORS } from '../../utils/team-colors';
import { hashPin, generatePinSalt, markPinVerified } from '../../utils/pin-hash';
import { planTournament, addMinutesToHHMM, type PlannerInput, type PlannerVariant, type MatchOrderEntry } from '../../utils/tournamentPlanner';
import type { TournamentSettings, GroupDefinition } from '../../types/tournament.types';

interface Props { navigate: (p: Page) => void; }

type WizardStep = 1 | 2 | 3;

/**
 * TournamentPlannerPage — 3-step wizard for auto-generating a tournament
 * from (teamCount, totalMinutes, maxFields) → variants → selection → tournament.
 */
export function TournamentPlannerPage({ navigate }: Props) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();
  const createTournament = useTournamentStore(s => s.createTournament);
  const showToast = useToastStore(s => s.show);

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 — parameters
  const todayIso = new Date().toISOString().split('T')[0];
  const [name, setName] = useState('');
  const [teamCount, setTeamCount] = useState(8);
  const [maxFields, setMaxFields] = useState(2);
  const [startDate, setStartDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [ceremonyMin, setCeremonyMin] = useState(15);
  const [breakMin, setBreakMin] = useState(2);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [minMatchLength, setMinMatchLength] = useState(6);
  const [maxMatchLength, setMaxMatchLength] = useState(20);

  // Computed: minutes between start and end, minus ceremony reserve
  const totalMinutes = useMemo(() => {
    const span = diffHHMM(startTime, endTime);
    return Math.max(0, span - ceremonyMin);
  }, [startTime, endTime, ceremonyMin]);

  // Step 2 — generated variants
  const variants = useMemo<PlannerVariant[]>(() => {
    if (step < 2) return [];
    const input: PlannerInput = {
      teamCount,
      totalMinutes,
      maxFields,
      minMatchLength,
      maxMatchLength,
      breakBetweenMatches: breakMin,
    };
    return planTournament(input);
  }, [step, teamCount, totalMinutes, maxFields, minMatchLength, maxMatchLength, breakMin]);

  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(null);
  const selectedVariant = variants.find(v => v.key === selectedVariantKey) ?? null;

  // Step 3 — team names + PIN
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Step navigation ───────────────────────────────────────────────────────
  const goToStep2 = () => {
    if (name.trim().length < 2) {
      showToast('error', t('tournament.planner.errNameShort') || 'Zadejte název turnaje (min. 2 znaky)');
      return;
    }
    if (teamCount < 2) {
      showToast('error', t('tournament.planner.errTeamCount') || 'Minimálně 2 týmy');
      return;
    }
    if (totalMinutes < 30) {
      showToast('error', t('tournament.planner.errTimeRange') || 'Konec musí být po začátku (min. 30 min na zápasy)');
      return;
    }
    setStep(2);
  };

  const goToStep3 = () => {
    if (!selectedVariant) {
      showToast('error', t('tournament.planner.errSelectVariant') || 'Vyberte variantu');
      return;
    }
    // Initialize team names placeholder
    if (teamNames.length !== teamCount) {
      setTeamNames(Array.from({ length: teamCount }, (_, i) => `Tým ${i + 1}`));
    }
    setStep(3);
  };

  const goBack = () => {
    if (step === 1) {
      navigate({ name: 'tournament-create-choice' });
    } else {
      setStep((step - 1) as WizardStep);
    }
  };

  // ── Create tournament ────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!selectedVariant) return;
    if (pin.length !== 6) {
      setPinError(t('tournament.create.pinError6') || 'PIN musí mít 6 číslic');
      return;
    }
    if (pin !== pinConfirm) {
      setPinError(t('tournament.create.pinErrorMatch') || 'PINy se neshodují');
      return;
    }
    setPinError('');
    setCreating(true);
    try {
      const pinSalt = generatePinSalt();
      const pinHash = await hashPin(pin, pinSalt);

      // Build teams array
      const teams = teamNames.map((teamName, idx) => ({
        name: teamName.trim() || `Tým ${idx + 1}`,
        color: TEAM_COLORS[idx % TEAM_COLORS.length],
        players: [],
        clubId: null,
        logoBase64: null,
      }));

      // Build settings
      const settings: TournamentSettings = {
        matchDurationMinutes: selectedVariant.matchLengthMin,
        breakBetweenMatchesMinutes: selectedVariant.breakMin,
        startDate,
        startTime,
        numberOfPitches: selectedVariant.fields,
        format: selectedVariant.format,
      };

      // Groups for groups-knockout format
      if (selectedVariant.format === 'groups-knockout' && selectedVariant.groups) {
        const groupDefs: GroupDefinition[] = selectedVariant.groups.map((g, gi) => ({
          id: `group-${gi}`,
          name: g.name,
          // Placeholder format is resolved by the store into real team IDs
          teamIds: g.teamIndices.map(idx => `team-placeholder-${idx}`),
        }));
        settings.groups = groupDefs;
        settings.advancePerGroup = selectedVariant.advancePerGroup ?? 2;
        settings.thirdPlaceMatch = true;
      }

      // For round-robin, pass matchOrder so the schedule matches what we previewed
      const matchOrder: MatchOrderEntry[] | undefined =
        selectedVariant.format === 'round-robin' && selectedVariant.matchOrder.length > 0
          ? selectedVariant.matchOrder
          : undefined;

      const tournament = await createTournament({
        name: name.trim(),
        settings,
        teams,
        pinHash,
        pinSalt,
        matchOrder,
      });

      markPinVerified(tournament.id);
      try { sessionStorage.setItem(`torq_just_created_${tournament.id}`, '1'); } catch { /* */ }
      showToast('success', t('toast.tournamentCreated') || 'Turnaj vytvořen');
      navigate({ name: 'tournament-detail', tournamentId: tournament.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', msg);
    } finally {
      setCreating(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const title = t('tournament.planner.title') || 'Naplánovat turnaj';
  const subtitle = stepSubtitle(step, t);

  const content = (
    <>
      <StepIndicator step={step} />
      <div style={{ marginTop: 24 }}>
        {step === 1 && (
          <Step1Form
            name={name} setName={setName}
            teamCount={teamCount} setTeamCount={setTeamCount}
            maxFields={maxFields} setMaxFields={setMaxFields}
            startDate={startDate} setStartDate={setStartDate}
            startTime={startTime} setStartTime={setStartTime}
            endTime={endTime} setEndTime={setEndTime}
            ceremonyMin={ceremonyMin} setCeremonyMin={setCeremonyMin}
            totalMinutes={totalMinutes}
            breakMin={breakMin} setBreakMin={setBreakMin}
            advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen}
            minMatchLength={minMatchLength} setMinMatchLength={setMinMatchLength}
            maxMatchLength={maxMatchLength} setMaxMatchLength={setMaxMatchLength}
            onNext={goToStep2}
            onBack={goBack}
            t={t}
          />
        )}
        {step === 2 && (
          <Step2Variants
            variants={variants}
            selectedKey={selectedVariantKey}
            onSelect={setSelectedVariantKey}
            onNext={goToStep3}
            onBack={goBack}
            t={t}
          />
        )}
        {step === 3 && selectedVariant && (
          <Step3Confirm
            variant={selectedVariant}
            teamNames={teamNames} setTeamNames={setTeamNames}
            pin={pin} setPin={setPin}
            pinConfirm={pinConfirm} setPinConfirm={setPinConfirm}
            pinError={pinError}
            startDate={startDate} startTime={startTime}
            creating={creating}
            onCreate={handleCreate}
            onBack={goBack}
            t={t}
          />
        )}
      </div>
    </>
  );

  if (isDesktop) {
    return (
      <DesktopPage title={title} subtitle={subtitle}>
        <div style={{ maxWidth: 960 }}>{content}</div>
      </DesktopPage>
    );
  }

  return (
    <div style={{ padding: '20px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={goBack}
          aria-label={t('common.back')}
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            fontSize: 18, cursor: 'pointer',
          }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</p>
        </div>
      </div>
      {content}
    </div>
  );
}

// ─── Subtitle per step ──────────────────────────────────────────────────────

function stepSubtitle(step: WizardStep, t: (k: string) => string): string {
  switch (step) {
    case 1: return t('tournament.planner.step1Sub') || 'Krok 1 / 3 · Zadejte základní parametry';
    case 2: return t('tournament.planner.step2Sub') || 'Krok 2 / 3 · Vyberte variantu';
    case 3: return t('tournament.planner.step3Sub') || 'Krok 3 / 3 · Doladit a vytvořit';
  }
}

// ─── Step indicator ─────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {[1, 2, 3].map(n => {
        const active = n === step;
        const done = n < step;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: n < 3 ? 1 : 'unset' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 14,
              background: active || done ? '#E65100' : 'var(--surface-var)',
              color: active || done ? '#fff' : 'var(--text-muted)',
              border: active ? '2px solid #FFAB91' : 'none',
              flexShrink: 0,
            }}>
              {done ? '✓' : n}
            </div>
            {n < 3 && (
              <div style={{
                flex: 1, height: 2,
                background: done ? '#E65100' : 'var(--border)',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Input form ────────────────────────────────────────────────────

function Step1Form(props: {
  name: string; setName: (v: string) => void;
  teamCount: number; setTeamCount: (v: number) => void;
  maxFields: number; setMaxFields: (v: number) => void;
  startDate: string; setStartDate: (v: string) => void;
  startTime: string; setStartTime: (v: string) => void;
  endTime: string; setEndTime: (v: string) => void;
  ceremonyMin: number; setCeremonyMin: (v: number) => void;
  totalMinutes: number;
  breakMin: number; setBreakMin: (v: number) => void;
  advancedOpen: boolean; setAdvancedOpen: (v: boolean) => void;
  minMatchLength: number; setMinMatchLength: (v: number) => void;
  maxMatchLength: number; setMaxMatchLength: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
  t: (k: string) => string;
}) {
  const { t, totalMinutes } = props;
  const hoursLabel = totalMinutes >= 60
    ? `${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min`
    : `${totalMinutes} min`;
  const timeRangeInvalid = totalMinutes < 30;
  return (
    <div style={cardContainerStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label={t('tournament.planner.nameLabel') || 'Název turnaje'}>
          <input
            type="text"
            value={props.name}
            onChange={e => props.setName(e.target.value)}
            placeholder={t('tournament.planner.namePlaceholder') || 'např. Školní turnaj 2026'}
            style={inputStyle}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <Field label={t('tournament.planner.teamCountLabel') || 'Počet týmů'}>
            <Stepper value={props.teamCount} onChange={props.setTeamCount} min={2} max={32} />
          </Field>
          <Field label={t('tournament.planner.fieldsLabel') || 'Max. hřišť'}>
            <Stepper value={props.maxFields} onChange={props.setMaxFields} min={1} max={6} />
          </Field>
          <Field label={t('tournament.planner.startDateLabel') || 'Datum'}>
            <input
              type="date"
              value={props.startDate}
              onChange={e => props.setStartDate(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <Field label={t('tournament.planner.startTimeLabel') || 'Začátek'}>
            <input
              type="time"
              value={props.startTime}
              onChange={e => props.setStartTime(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={t('tournament.planner.endTimeLabel') || 'Konec'}>
            <input
              type="time"
              value={props.endTime}
              onChange={e => props.setEndTime(e.target.value)}
              style={{
                ...inputStyle,
                borderColor: timeRangeInvalid ? '#C62828' : 'var(--border)',
              }}
            />
          </Field>
          <Field label={t('tournament.planner.ceremonyLabel') || 'Vyhlášení (min)'}>
            <Stepper value={props.ceremonyMin} onChange={props.setCeremonyMin} min={0} max={60} step={5} />
          </Field>
        </div>

        <div style={{
          fontSize: 12,
          color: timeRangeInvalid ? '#C62828' : 'var(--text-muted)',
          fontWeight: 600,
          padding: '8px 12px',
          background: timeRangeInvalid ? 'rgba(198, 40, 40, 0.08)' : 'var(--surface-var)',
          borderRadius: 8,
        }}>
          {timeRangeInvalid
            ? (t('tournament.planner.timeRangeInvalid') || '⚠️ Konec musí být po začátku (min. 30 min na zápasy po odečtení vyhlášení)')
            : `⏱ ${t('tournament.planner.matchTimeAvailable') || 'Čas pro zápasy'}: ${hoursLabel} (po odečtení ${props.ceremonyMin} min na vyhlášení)`}
        </div>

        <button
          onClick={() => props.setAdvancedOpen(!props.advancedOpen)}
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left', padding: 0,
          }}
        >
          {props.advancedOpen ? '▼' : '▶'} {t('tournament.planner.advanced') || 'Pokročilé'}
        </button>

        {props.advancedOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <Field label={t('tournament.planner.breakLabel') || 'Pauza mezi zápasy (min)'}>
              <Stepper value={props.breakMin} onChange={props.setBreakMin} min={0} max={15} />
            </Field>
            <Field label={t('tournament.planner.minMatchLabel') || 'Min. délka zápasu (min)'}>
              <Stepper value={props.minMatchLength} onChange={props.setMinMatchLength} min={4} max={60} />
            </Field>
            <Field label={t('tournament.planner.maxMatchLabel') || 'Max. délka zápasu (min)'}>
              <Stepper value={props.maxMatchLength} onChange={props.setMaxMatchLength} min={4} max={90} />
            </Field>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button onClick={props.onBack} style={desktopSecondaryButtonStyle}>
          {t('common.back')}
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={props.onNext} style={{ ...desktopPrimaryButtonStyle, background: '#E65100' }}>
          {t('tournament.planner.generateCta') || 'Navrhnout varianty'} →
        </button>
      </div>
    </div>
  );
}

// ─── Step 2 — Variants ──────────────────────────────────────────────────────

function Step2Variants({
  variants, selectedKey, onSelect, onNext, onBack, t,
}: {
  variants: PlannerVariant[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onNext: () => void;
  onBack: () => void;
  t: (k: string) => string;
}) {
  if (variants.length === 0) {
    return (
      <div style={cardContainerStyle}>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {t('tournament.planner.noVariants') || 'Žádná varianta se nevejde do zadaného času'}
          </div>
          <div style={{ fontSize: 13 }}>
            {t('tournament.planner.noVariantsHint') || 'Zkuste zvýšit čas nebo počet hřišť.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onBack} style={desktopSecondaryButtonStyle}>{t('common.back')}</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {variants.map(v => (
          <VariantCard
            key={v.key}
            variant={v}
            selected={selectedKey === v.key}
            onSelect={() => onSelect(v.key)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button onClick={onBack} style={desktopSecondaryButtonStyle}>
          {t('common.back')}
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onNext}
          disabled={!selectedKey}
          style={{
            ...desktopPrimaryButtonStyle,
            background: '#E65100',
            opacity: selectedKey ? 1 : 0.5,
            cursor: selectedKey ? 'pointer' : 'not-allowed',
          }}
        >
          {t('tournament.planner.continue') || 'Pokračovat'} →
        </button>
      </div>
    </>
  );
}

function VariantCard({ variant, selected, onSelect }: {
  variant: PlannerVariant;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        background: 'var(--surface)',
        border: selected ? '2px solid #E65100' : '1.5px solid var(--border)',
        borderRadius: 16,
        padding: '20px 22px',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: selected ? '0 4px 20px rgba(230,81,0,0.15)' : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'border-color .15s, box-shadow .15s',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontSize: 10, fontWeight: 800,
          background: selected ? '#E65100' : 'var(--surface-var)',
          color: selected ? '#fff' : 'var(--text-muted)',
          padding: '4px 10px', borderRadius: 6,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {variant.label}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
          {variant.description}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 12,
      }}>
        <StatBlock label="Minut / tým" value={`${variant.minutesPerTeam}`} accent />
        <StatBlock label="Zápasů / tým" value={`${variant.matchesPerTeam}`} />
        <StatBlock label="Délka zápasu" value={`${variant.matchLengthMin} min`} />
        <StatBlock label="Konec ve" value={formatEndTime(variant.totalDurationMin)} />
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.5, marginTop: 4 }}>
        💡 {variant.rationale}
      </div>
    </button>
  );
}

function StatBlock({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'rgba(230, 81, 0, 0.08)' : 'var(--surface-var)',
      borderRadius: 10,
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent ? '#E65100' : 'var(--text)', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function formatEndTime(durationMin: number): string {
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h}h ${m}m`;
}

// ─── Step 3 — Confirm (team names + PIN) ────────────────────────────────────

function Step3Confirm({
  variant, teamNames, setTeamNames, pin, setPin, pinConfirm, setPinConfirm,
  pinError, startDate, startTime, creating, onCreate, onBack, t,
}: {
  variant: PlannerVariant;
  teamNames: string[]; setTeamNames: (v: string[]) => void;
  pin: string; setPin: (v: string) => void;
  pinConfirm: string; setPinConfirm: (v: string) => void;
  pinError: string;
  startDate: string; startTime: string;
  creating: boolean;
  onCreate: () => void;
  onBack: () => void;
  t: (k: string) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary */}
      <div style={cardContainerStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#E65100', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          {t('tournament.planner.summary') || 'Shrnutí'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <StatBlock label="Formát" value={variant.description} />
          <StatBlock label="Minut / tým" value={`${variant.minutesPerTeam}`} accent />
          <StatBlock label="Zápasů" value={`${variant.totalMatches}`} />
          <StatBlock label="Začátek" value={`${startTime}`} />
        </div>
      </div>

      {/* Team names */}
      <div style={cardContainerStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#E65100', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
          {t('tournament.planner.teamsTitle') || 'Názvy týmů'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('tournament.planner.teamsHint') || 'Názvy můžete upravit teď nebo později v detailu turnaje.'}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 10,
        }}>
          {teamNames.map((n, i) => (
            <input
              key={i}
              type="text"
              value={n}
              onChange={e => {
                const next = [...teamNames];
                next[i] = e.target.value;
                setTeamNames(next);
              }}
              style={{
                ...inputStyle,
                borderLeft: `4px solid ${TEAM_COLORS[i % TEAM_COLORS.length]}`,
              }}
              placeholder={`Tým ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* PIN */}
      <div style={cardContainerStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#E65100', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
          {t('tournament.planner.pinTitle') || 'PIN pro rozhodčí'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('tournament.planner.pinHint') || '6 číslic — potřeba pro sdílení turnaje s pomocníky.'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="PIN (6 číslic)"
            style={{ ...inputStyle, maxWidth: 200 }}
          />
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={pinConfirm}
            onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
            placeholder="Potvrzení"
            style={{ ...inputStyle, maxWidth: 200 }}
          />
        </div>
        {pinError && <div style={{ color: '#C62828', fontSize: 12, marginTop: 8, fontWeight: 600 }}>{pinError}</div>}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack} disabled={creating} style={desktopSecondaryButtonStyle}>
          {t('common.back')}
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onCreate}
          disabled={creating}
          style={{
            ...desktopPrimaryButtonStyle,
            background: '#E65100',
            opacity: creating ? 0.5 : 1,
          }}
        >
          {creating ? (t('common.loading') || 'Vytvářím...') : `✨ ${t('tournament.planner.createCta') || 'Vytvořit turnaj'}`}
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        Datum: {startDate} · Začátek: {startTime}
      </div>
    </div>
  );
}

// ─── Shared primitives ──────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Stepper({
  value, onChange, min, max, step = 1, format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--surface-var)', borderRadius: 10, padding: 4,
    }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        style={stepperBtn}
        aria-label="Decrease"
      >−</button>
      <div style={{
        flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 16,
      }}>
        {format ? format(value) : value}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        style={stepperBtn}
        aria-label="Increase"
      >+</button>
    </div>
  );
}

const stepperBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 8,
  background: 'var(--surface)', border: '1px solid var(--border)',
  fontSize: 18, fontWeight: 800, cursor: 'pointer',
  color: 'var(--text)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1.5px solid var(--border)',
  fontSize: 14,
  fontWeight: 600,
  background: 'var(--surface)',
  color: 'var(--text)',
  outline: 'none',
};

const cardContainerStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1.5px solid var(--border)',
  borderRadius: 16,
  padding: '22px 24px',
};

// Silence unused import warning — kept for reference, may wire into step 2 preview
void addMinutesToHHMM;

// Compute minutes between two HH:MM strings (end - start, never negative).
function diffHHMM(start: string, end: string): number {
  const parse = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  };
  return Math.max(0, parse(end) - parse(start));
}
