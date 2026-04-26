import { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { useToastStore } from '../../store/toast.store';
import { useTournamentStore } from '../../store/tournament.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { TEAM_COLORS } from '../../utils/team-colors';
import { hashPin, generatePinSalt, markPinVerified } from '../../utils/pin-hash';
import { planTournament, addMinutesToHHMM, type PlannerInput, type PlannerVariant, type MatchOrderEntry } from '../../utils/tournamentPlanner';
import type { TournamentSettings, GroupDefinition } from '../../types/tournament.types';
import { Field as UiField, Input as UiInput, Stepper as UiStepper, Button, PageHeader, InfoBox } from '../../components/ui';
import { radius, fontSize, fontWeight, spacing } from '../../theme/tokens';

interface Props { navigate: (p: Page) => void; }

type WizardStep = 1 | 2 | 3;

/**
 * TournamentPlannerPage — 3-step wizard for auto-generating a tournament
 * from (teamCount, totalMinutes, maxFields) → variants → selection → tournament.
 */
export function TournamentPlannerPage({ navigate }: Props) {
  const { t } = useI18n();
  const createTournament = useTournamentStore(s => s.createTournament);
  const showToast = useToastStore(s => s.show);
  const preferredSport = useUserPrefsStore(s => s.preferredSport);

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 — parameters
  const todayIso = new Date().toISOString().split('T')[0];
  const [name, setName] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [teamCount, setTeamCount] = useState(8);
  const [maxFields, setMaxFields] = useState(2);
  const [startDate, setStartDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [ceremonyMin, setCeremonyMin] = useState(10);
  const [breakMin, setBreakMin] = useState(2);
  const [minMatchLength, setMinMatchLength] = useState(10);
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
      navigate({ name: 'tournament-wizard' });
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
        venueName: venueName.trim() || undefined,
        venueAddress: venueAddress.trim() || undefined,
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
        // Play-out je zakódovaný v description varianty
        if (selectedVariant.playOut === true) {
          settings.playOut = true;
        }
      }

      // For round-robin, pass matchOrder so the schedule matches what we previewed
      const matchOrder: MatchOrderEntry[] | undefined =
        selectedVariant.format === 'round-robin' && selectedVariant.matchOrder.length > 0
          ? selectedVariant.matchOrder
          : undefined;

      const tournament = await createTournament({
        name: name.trim(),
        sport: preferredSport,
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
      <div style={{ marginTop: 14 }}>
        {step === 1 && (
          <Step1Form
            name={name} setName={setName}
            venueName={venueName} setVenueName={setVenueName}
            venueAddress={venueAddress} setVenueAddress={setVenueAddress}
            startDate={startDate} setStartDate={setStartDate}
            startTime={startTime} setStartTime={setStartTime}
            endTime={endTime} setEndTime={setEndTime}
            teamCount={teamCount} setTeamCount={setTeamCount}
            maxFields={maxFields} setMaxFields={setMaxFields}
            minMatchLength={minMatchLength} setMinMatchLength={setMinMatchLength}
            maxMatchLength={maxMatchLength} setMaxMatchLength={setMaxMatchLength}
            ceremonyMin={ceremonyMin} setCeremonyMin={setCeremonyMin}
            breakMin={breakMin} setBreakMin={setBreakMin}
            totalMinutes={totalMinutes}
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
            startTime={startTime}
            ceremonyMin={ceremonyMin}
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

  return (
    <div style={{ padding: `${spacing.md + 2}px ${spacing.lg}px ${spacing.xl + 8}px` }}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        onBack={goBack}
        backLabel={t('common.back')}
        variant="inset"
      />
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {[1, 2, 3].map(n => {
        const active = n === step;
        const done = n < step;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: n < 3 ? 1 : 'unset' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 12,
              background: active || done ? 'var(--warning)' : 'var(--surface-var)',
              color: active || done ? '#fff' : 'var(--text-muted)',
              border: active ? '2px solid #FFAB91' : 'none',
              flexShrink: 0,
            }}>
              {done ? '✓' : n}
            </div>
            {n < 3 && (
              <div style={{
                flex: 1, height: 2,
                background: done ? 'var(--warning)' : 'var(--border)',
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
  venueName: string; setVenueName: (v: string) => void;
  venueAddress: string; setVenueAddress: (v: string) => void;
  breakMin: number; setBreakMin: (v: number) => void;
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
  const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm + 2 };

  return (
    <div style={cardContainerStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>

        {/* 1. Název turnaje */}
        <UiField label={t('tournament.planner.nameLabel') || 'Název turnaje'}>
          <UiInput
            type="text"
            value={props.name}
            onChange={v => props.setName(v)}
            placeholder={t('tournament.planner.namePlaceholder') || 'např. Školní turnaj 2026'}
          />
        </UiField>

        {/* 2. Místo konání */}
        <UiField label={t('tournament.planner.venueLabel') || 'Místo konání'}>
          <UiInput
            type="text"
            value={props.venueName}
            onChange={v => props.setVenueName(v)}
            placeholder={t('tournament.planner.venuePlaceholder') || 'např. Sportovní hala NMNM'}
          />
        </UiField>
        {props.venueName.trim() && (
          <UiField label={t('tournament.planner.venueAddressLabel') || 'Adresa'}>
            <UiInput
              type="text"
              value={props.venueAddress}
              onChange={v => props.setVenueAddress(v)}
              placeholder={t('tournament.planner.venueAddressPlaceholder') || 'např. Sportovní 1583, Nové Město'}
            />
          </UiField>
        )}

        {/* 3. Datum */}
        <UiField label={t('tournament.planner.startDateLabel') || 'Datum'}>
          <UiInput
            type="date"
            value={props.startDate}
            onChange={v => props.setStartDate(v)}
          />
        </UiField>

        {/* 4. Začátek + Konec (2 cols) */}
        <div style={twoCol}>
          <UiField label={t('tournament.planner.startTimeLabel') || 'Začátek'}>
            <UiInput
              type="time"
              value={props.startTime}
              onChange={v => props.setStartTime(v)}
            />
          </UiField>
          <UiField label={t('tournament.planner.endTimeLabel') || 'Konec'}>
            <UiInput
              type="time"
              value={props.endTime}
              onChange={v => props.setEndTime(v)}
              invalid={timeRangeInvalid}
            />
          </UiField>
        </div>

        {/* 5. Počet týmů + Max hřišť (2 cols) */}
        <div style={twoCol}>
          <UiField label={t('tournament.planner.teamCountLabel') || 'Počet týmů'}>
            <UiStepper value={props.teamCount} onChange={props.setTeamCount} min={2} max={32} />
          </UiField>
          <UiField label={t('tournament.planner.fieldsLabel') || 'Max. hřišť'}>
            <UiStepper value={props.maxFields} onChange={props.setMaxFields} min={1} max={8} />
          </UiField>
        </div>

        {/* 6. Min + Max délka zápasu (2 cols) */}
        <div style={twoCol}>
          <UiField label={t('tournament.planner.minMatchLabel') || 'Min. délka zápasu'}>
            <UiStepper value={props.minMatchLength} onChange={props.setMinMatchLength} min={4} max={60} />
          </UiField>
          <UiField label={t('tournament.planner.maxMatchLabel') || 'Max. délka zápasu'}>
            <UiStepper value={props.maxMatchLength} onChange={props.setMaxMatchLength} min={4} max={90} />
          </UiField>
        </div>

        {/* 7. Vyhlášení + Pauza (2 cols) */}
        <div style={twoCol}>
          <UiField label={t('tournament.planner.ceremonyLabel') || 'Vyhlášení (min)'}>
            <UiStepper value={props.ceremonyMin} onChange={props.setCeremonyMin} min={0} max={60} step={5} />
          </UiField>
          <UiField label={t('tournament.planner.breakLabel') || 'Pauza (min)'}>
            <UiStepper value={props.breakMin} onChange={props.setBreakMin} min={0} max={15} />
          </UiField>
        </div>

        {/* Info box — konec vyhlášení + čas na zápasy */}
        <InfoBox variant={timeRangeInvalid ? 'danger' : 'info'}>
          {timeRangeInvalid
            ? '⚠️ Konec musí být po začátku (min. 30 min na zápasy po odečtení vyhlášení)'
            : (
              <>
                🏁 Vyhlášení skončí ve{' '}
                <strong style={{ color: 'var(--text)' }}>
                  {addMinutesToHHMM(props.startTime, props.totalMinutes + props.ceremonyMin)}
                </strong>
                {' '}· na zápasy zbývá <strong style={{ color: 'var(--text)' }}>{hoursLabel}</strong>
              </>
            )}
        </InfoBox>

      </div>

      <div style={{ display: 'flex', gap: spacing.sm + 2, marginTop: spacing.lg }}>
        <Button variant="secondary" onClick={props.onBack}>
          {t('common.back')}
        </Button>
        <div style={{ flex: 1 }} />
        <Button variant="warning" onClick={props.onNext}>
          {t('tournament.planner.generateCta') || 'Navrhnout varianty'} →
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2 — Variants ──────────────────────────────────────────────────────

function Step2Variants({
  variants, selectedKey, onSelect, onNext, onBack, startTime, ceremonyMin, t,
}: {
  variants: PlannerVariant[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onNext: () => void;
  onBack: () => void;
  startTime: string;
  ceremonyMin: number;
  t: (k: string) => string;
}) {
  // Hooks musí být volané vždy ve stejném pořadí — nesmí být po early returnu.
  const [filters, setFilters] = useState<Record<string, boolean>>({});

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
        <div style={{ display: 'flex', gap: spacing.sm + 2, marginTop: spacing.lg + 4 }}>
          <Button variant="secondary" onClick={onBack}>{t('common.back')}</Button>
        </div>
      </div>
    );
  }

  const toggleFilter = (key: string) => {
    setFilters(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      return next;
    });
  };

  // Extrahuj unikátní hodnoty z variant pro filtrové chipy
  const allFormats = [...new Set(variants.map(v => {
    if (v.format === 'round-robin') return 'Každý s každým';
    const gc = v.groups?.length ?? 2;
    return `${gc} skupiny`;
  }))];
  const allMatchLens = [...new Set(variants.map(v => v.matchLengthMin))].sort((a, b) => a - b);
  const hasPlayOut = variants.some(v => v.playOut);

  // Filtruj varianty podle vybraných chipů
  const activeFilters = Object.keys(filters);
  const filtered = activeFilters.length === 0 ? variants : variants.filter(v => {
    for (const f of activeFilters) {
      if (f.endsWith(' skupiny')) {
        const gc = parseInt(f);
        if ((v.groups?.length ?? 0) !== gc) return false;
      } else if (f === 'Každý s každým') {
        if (v.format !== 'round-robin') return false;
      } else if (f.endsWith(' min')) {
        if (v.matchLengthMin !== parseInt(f)) return false;
      } else if (f === 'Umístění') {
        if (!v.playOut) return false;
      }
    }
    return true;
  });

  return (
    <>
      {/* Filter chips */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: spacing.xs + 2,
        marginBottom: spacing.md,
      }}>
        {allFormats.map(f => (
          <FilterChip key={f} label={f} active={!!filters[f]} onClick={() => toggleFilter(f)} />
        ))}
        {allMatchLens.map(len => (
          <FilterChip key={`${len}m`} label={`${len} min`} active={!!filters[`${len} min`]} onClick={() => toggleFilter(`${len} min`)} />
        ))}
        {hasPlayOut && (
          <FilterChip label="Umístění" active={!!filters['Umístění']} onClick={() => toggleFilter('Umístění')} emoji="🏅" />
        )}
        {activeFilters.length > 0 && (
          <button
            onClick={() => setFilters({})}
            style={{
              fontSize: fontSize.xs, color: 'var(--text-muted)', background: 'none',
              border: 'none', cursor: 'pointer', padding: '4px 6px', fontWeight: fontWeight.medium,
            }}
          >
            ✕ Zrušit
          </button>
        )}
      </div>

      {/* Variant karty */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md + 2 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: spacing.xl, color: 'var(--text-muted)', fontSize: fontSize.sm }}>
            Žádná varianta neodpovídá zvoleným filtrům
          </div>
        ) : filtered.map((v, idx) => (
          <VariantCard
            key={v.key}
            variant={v}
            selected={selectedKey === v.key}
            onSelect={() => onSelect(v.key)}
            startTime={startTime}
            ceremonyMin={ceremonyMin}
            defaultExpanded={idx === 0 && activeFilters.length === 0}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: spacing.sm + 2, marginTop: spacing.xl }}>
        <Button variant="secondary" onClick={onBack}>
          {t('common.back')}
        </Button>
        <div style={{ flex: 1 }} />
        <Button variant="warning" disabled={!selectedKey} onClick={onNext}>
          {t('tournament.planner.continue') || 'Pokračovat'} →
        </Button>
      </div>
    </>
  );
}

function FilterChip({ label, active, onClick, emoji }: { label: string; active: boolean; onClick: () => void; emoji?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? 'var(--primary)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text-muted)',
        border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
        borderRadius: radius.lg,
        padding: `${spacing.xs}px ${spacing.sm + 2}px`,
        fontSize: fontSize.xs,
        fontWeight: active ? fontWeight.bold : fontWeight.medium,
        cursor: 'pointer',
        transition: 'all .15s',
        whiteSpace: 'nowrap',
      }}
    >
      {emoji && `${emoji} `}{label}
    </button>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span style={{
      background: accent ? 'var(--success-light)' : 'var(--surface)',
      color: accent ? 'var(--success)' : 'var(--text)',
      border: accent ? '1px solid var(--success)' : '1px solid var(--border)',
      borderRadius: radius.sm,
      padding: `3px ${spacing.sm}px`,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      whiteSpace: 'nowrap',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {children}
    </span>
  );
}

function VariantCard({ variant, selected, onSelect, startTime, ceremonyMin, defaultExpanded }: {
  variant: PlannerVariant;
  selected: boolean;
  onSelect: () => void;
  startTime: string;
  ceremonyMin: number;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const matchLen = variant.matchLengthMin;
  const endTime = addMinutesToHHMM(startTime, variant.totalDurationMin + ceremonyMin);
  const isRecommended = variant.label === 'Doporučeno';

  // ── Czech plural: 1 zápas, 2-4 zápasy, 5+ zápasů ──────────────────
  const zapasy = (n: number) => n === 1 ? 'zápas' : (n >= 2 && n <= 4) ? 'zápasy' : 'zápasů';

  // ── Compute key numbers per format ──────────────────────────────────
  const isGroupsKnockout = variant.format === 'groups-knockout' && variant.groups && variant.groups.length > 0;
  const isRoundRobin = variant.format === 'round-robin';

  let heroNumber: string;
  let heroLabel: string;
  let heroSub: string | null = null;

  if (isRoundRobin) {
    const perTeam = Math.round(variant.matchesPerTeam);
    heroNumber = `${perTeam * matchLen} min`;
    heroLabel = `${perTeam} ${zapasy(perTeam)} × ${matchLen} min — každý tým stejně`;
  } else if (isGroupsKnockout) {
    const sizes = variant.groups!.map(g => g.teamIndices.length);
    const minGroupSize = Math.min(...sizes);
    const minGroupMatches = minGroupSize - 1;
    const adv = variant.advancePerGroup ?? 1;
    const groupCount = variant.groups?.length ?? 2;

    // Play-out: každý tým hraje +1 zápas o umístění (jen 2 skupiny)
    const hasPlayOut = variant.playOut === true;
    const playOutExtra = hasPlayOut && groupCount === 2 ? 1 : 0;

    // Garantovaný minimum = skupina + play-out (pokud zapnutý)
    const guaranteedMatches = minGroupMatches + playOutExtra;
    const guaranteedMin = guaranteedMatches * matchLen;

    const advTotal = groupCount === 3 && adv === 1 ? 4 : adv * groupCount;
    const playoffExtra = advTotal > 4 ? 3 : 2;
    const advancingMatches = minGroupMatches + playOutExtra + playoffExtra;
    const advancingMin = advancingMatches * matchLen;

    heroNumber = `${guaranteedMin} min`;
    if (playOutExtra > 0) {
      heroLabel = `${minGroupMatches} ${zapasy(minGroupMatches)} ve skupině + 1 o umístění × ${matchLen} min`;
    } else {
      heroLabel = `${minGroupMatches} ${zapasy(minGroupMatches)} × ${matchLen} min — každý tým ve skupině`;
    }
    heroSub = `${advTotal} postupující: ${advancingMatches} ${zapasy(advancingMatches)} · ${advancingMin} min`;
  } else {
    const maxMatches = Math.max(1, Math.ceil(variant.matchesPerTeam));
    heroNumber = `${matchLen} min`;
    heroLabel = `Zápas ${matchLen} min · vítěz odehraje až ${maxMatches}`;
  }

  // ── Rationale rozšířené o doporučení ──────────────────────────────────
  let rationale = variant.rationale;
  if (isRecommended) {
    rationale += ' Tato varianta maximalizuje hrací čas pro všechny týmy.';
  }



  return (
    <button
      onClick={() => {
        if (!expanded && !selected) {
          setExpanded(true);
        } else {
          onSelect();
        }
      }}
      style={{
        background: 'var(--surface)',
        border: selected ? '2px solid var(--warning)' : '1.5px solid var(--border)',
        borderRadius: radius.xl,
        padding: 0,
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: selected ? '0 4px 20px rgba(230,81,0,0.15)' : 'var(--shadow-sm)',
        transition: 'all .15s',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* ── Hero section — hlavní číslo s barvou ── */}
      <div style={{
        background: isRecommended ? 'var(--warning-light)' : 'var(--surface-var)',
        padding: `${spacing.md}px ${spacing.lg}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: spacing.md,
      }}>
        {/* Levá: badge + velké číslo */}
        <div style={{ flexShrink: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: fontWeight.extrabold,
            background: isRecommended ? 'var(--warning)' : 'var(--text-muted)',
            color: '#fff',
            padding: '2px 7px', borderRadius: 4,
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {variant.label}
          </span>
          <div style={{
            lineHeight: 1.1, marginTop: spacing.xs,
            color: isRecommended ? 'var(--warning)' : 'var(--text)',
          }}>
            <span style={{ fontSize: 34, fontWeight: 900 }}>
              {heroNumber.replace(' min', '')}
            </span>
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, marginLeft: 3 }}>
              min
            </span>
          </div>
          <div style={{ fontSize: fontSize.xs, color: 'var(--text-muted)', marginTop: 2 }}>
            každý tým minimálně
          </div>
        </div>

        {/* Pravá: chipy — pořadí: zápas, min. zápasů, hřiště, formát, play-out */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs + 2, justifyContent: 'flex-end' }}>
          <Chip><strong>{matchLen}</strong> min/zápas</Chip>
          <Chip>min. <strong>{Math.round(variant.guaranteedMinutesPerTeam / matchLen)}</strong> {zapasy(Math.round(variant.guaranteedMinutesPerTeam / matchLen))}</Chip>
          <Chip>{variant.fields}× hřiště</Chip>
          {variant.format === 'round-robin' && <Chip>Každý s každým</Chip>}
          {variant.groups && variant.groups.length > 0 && <Chip>{variant.groups.length} skupiny</Chip>}
          {variant.format === 'groups-knockout' && <Chip>Play-off</Chip>}
          {variant.format === 'groups-knockout' && (() => {
            const adv = variant.advancePerGroup ?? 1;
            const gc = variant.groups?.length ?? 2;
            const total = gc === 3 && adv === 1 ? 4 : adv * gc;
            return <Chip>🏆 {total} postupují</Chip>;
          })()}
          {variant.playOut && <Chip accent>🏅 Umístění</Chip>}
        </div>
      </div>

      {/* ── Detaily (sbalitelné) ── */}
      {(expanded || selected) && (
        <div style={{ padding: `${spacing.md}px ${spacing.lg}px` }}>
          <div style={{
            fontSize: fontSize.sm, color: 'var(--text-sub)',
            lineHeight: 1.8,
          }}>
            <div>⚽ {heroLabel}</div>
            {heroSub && <div>🏆 {heroSub}</div>}
            <div>📊 {variant.totalMatches} {zapasy(variant.totalMatches)} celkem · konec ~{endTime}</div>
          </div>

          <div style={{
            fontSize: fontSize.xs, color: 'var(--text-muted)',
            lineHeight: 1.5, marginTop: spacing.sm,
          }}>
            {rationale.includes('Pozor:') ? (
              <>
                💡 {rationale.split('Pozor:')[0]}
                <span style={{ color: 'var(--warning)', fontWeight: fontWeight.bold }}>
                  ⚠️ Pozor:{rationale.split('Pozor:')[1]}
                </span>
              </>
            ) : (
              <>💡 {rationale}</>
            )}
          </div>
        </div>
      )}

      {/* Rozbalit/sbalit indikátor pro nerozbalené */}
      {!expanded && !selected && (
        <div style={{
          padding: `${spacing.xs + 2}px ${spacing.lg}px`,
          fontSize: fontSize.xs, color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          Zobrazit detail ▾
        </div>
      )}
    </button>
  );
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
        <div style={{
          fontSize: fontSize.sm, fontWeight: fontWeight.bold,
          color: 'var(--warning)', textTransform: 'uppercase',
          letterSpacing: 0.6, marginBottom: spacing.sm,
        }}>
          {t('tournament.planner.summary') || 'Shrnutí'}
        </div>
        <div style={{
          fontSize: fontSize.base, lineHeight: 1.7,
          color: 'var(--text)', fontWeight: fontWeight.medium,
        }}>
          <div>📋 {variant.description}</div>
          <div>⏱ Délka zápasu: <strong>{variant.matchLengthMin} min</strong></div>
          <div>📊 Celkem: <strong>{variant.totalMatches} {variant.totalMatches >= 5 ? 'zápasů' : variant.totalMatches >= 2 ? 'zápasy' : 'zápas'}</strong></div>
          <div>🏁 Začátek: <strong>{startTime}</strong> · ~{Math.round(variant.minutesPerTeam)} min hry / tým</div>
        </div>
      </div>

      {/* Team names */}
      <div style={cardContainerStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
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
            <UiInput
              key={i}
              type="text"
              value={n}
              onChange={v => {
                const next = [...teamNames];
                next[i] = v;
                setTeamNames(next);
              }}
              placeholder={`Tým ${i + 1}`}
              style={{ borderLeft: `4px solid ${TEAM_COLORS[i % TEAM_COLORS.length]}` }}
            />
          ))}
        </div>
      </div>

      {/* PIN */}
      <div style={cardContainerStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
          {t('tournament.planner.pinTitle') || 'PIN pro rozhodčí'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('tournament.planner.pinHint') || '6 číslic — potřeba pro sdílení turnaje s pomocníky.'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <UiInput
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={v => setPin(v.replace(/\D/g, ''))}
            placeholder="PIN (6 číslic)"
            style={{ maxWidth: 200 }}
          />
          <UiInput
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={pinConfirm}
            onChange={v => setPinConfirm(v.replace(/\D/g, ''))}
            placeholder="Potvrzení"
            style={{ maxWidth: 200 }}
          />
        </div>
        {pinError && <div style={{ color: 'var(--danger)', fontSize: fontSize.sm, marginTop: 8, fontWeight: fontWeight.medium }}>{pinError}</div>}
      </div>

      <div style={{ display: 'flex', gap: spacing.sm + 2 }}>
        <Button variant="secondary" disabled={creating} onClick={onBack}>
          {t('common.back')}
        </Button>
        <div style={{ flex: 1 }} />
        <Button variant="warning" disabled={creating} onClick={onCreate}>
          {creating ? (t('common.loading') || 'Vytvářím...') : `✨ ${t('tournament.planner.createCta') || 'Vytvořit turnaj'}`}
        </Button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        Datum: {startDate} · Začátek: {startTime}
      </div>
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────────────

const cardContainerStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1.5px solid var(--border)',
  borderRadius: radius.xl,
  padding: spacing.md + 2,
  overflow: 'hidden',
};

// Compute minutes between two HH:MM strings (end - start, never negative).
function diffHHMM(start: string, end: string): number {
  const parse = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  };
  return Math.max(0, parse(end) - parse(start));
}
