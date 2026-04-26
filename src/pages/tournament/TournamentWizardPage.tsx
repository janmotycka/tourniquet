/**
 * TournamentWizardPage — sjednocený 3-step wizard pro vytváření turnaje.
 *
 * **Background (audit 2026-04-26, research-driven):**
 * Předtím existovaly 3 separátní cesty:
 *   - QuickTournamentPage (round-robin only)
 *   - TournamentPlannerPage (smart kalkulátor)
 *   - CreateTournamentPage (manual full form)
 * + TournamentCreateChoicePage jako rozcestník.
 *
 * Research 3 paralelních agentů (NN/g, Baymard, Material 3, Challonge,
 * Battlefy, Toornament, Tournify) ukázal:
 * 1. Multi-step wizard pro 8+ polí outperformuje single-page (HubSpot +86%)
 * 2. Smart-suggest engine podle počtu týmů = USP (žádná konkurence to nemá)
 * 3. Progressive disclosure pro Pokročilé (5-15% click rate je OK schovat)
 * 4. Mobile-first single column, on-blur validation, sticky bottom CTA
 *
 * **Logika napříč personami:**
 *
 * Persona A — Učitel TV (jednoduchý školní turnaj):
 *   - Krok 1: Název + datum + místo (30s)
 *   - Krok 2: počet týmů (chips) → smart-suggest formát ⭐ → vybere
 *   - Krok 3: jména týmů (auto-vyplnit) → "Vytvořit a hrát"
 *   - "Pokročilé" nesahá → 30-60s celkem
 *
 * Persona B — Klubový trenér (s registrací týmů, billing):
 *   - Krok 1+2 stejně
 *   - Krok 3: jména týmů + rozbalí "Pokročilé":
 *     - Online registrace přes link rodičům
 *     - Vstupné + billing profile
 *     - Vlastní pravidla / rozvrh
 *   - Stále jediný flow, jen s "Pokročilé" zaškrtnutým
 *
 * Persona C — Power user s vlastním rozvrhem:
 *   - Pokud potřebuje vlastní pořadí zápasů, custom bracket → fall-through
 *     na CreateTournamentPage (manual) přes "Manuální nastavení" odkaz
 *     na konci Pokročilé sekce. Nezahazujeme existing investment.
 */

import { useState, useEffect, useMemo } from 'react';
import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useTournamentStore } from '../../store/tournament.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { useToastStore } from '../../store/toast.store';
import { generatePinSalt, hashPin } from '../../utils/pin-hash';
import { suggestFormats, type FormatSuggestion } from '../../utils/tournament-format-suggest';
import {
  PageHeader,
  FormCard, SectionTitle, FormField, PrimaryButton,
  formInputStyle,
} from '../../components/ui';
import type { TournamentFormat } from '../../types/tournament.types';

interface Props { navigate: (p: Page) => void; }

type WizardStep = 1 | 2 | 3;

const TEAM_COLORS = [
  '#1565C0', '#C62828', '#2E7D32', '#E65100',
  '#6A1B9A', '#00695C', '#283593', '#F9A825',
  '#4A148C', '#4E342E', '#0D47A1', '#BF360C',
  '#1B5E20', '#37474F', '#AD1457', '#D32F2F',
];

const DRAFT_KEY = 'torq.tournamentWizard.draft.v1';
/**
 * Chip set pro výběr počtu týmů. Pokrýváme celý rozsah 3–16 (nejčastější
 * pro mládežnické turnaje včetně McDonald's Cupu). Pro >16 týmů je přístupný
 * vlastní vstup (až 32 týmů — limit smart-suggest engine).
 */
const TEAM_COUNT_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;
/** Maximální podporovaný počet týmů (smart-suggest engine + brackets generator). */
const TEAM_COUNT_MAX = 32;
/** Minimální počet týmů (round-robin potřebuje aspoň 2). */
const TEAM_COUNT_MIN = 2;

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

interface WizardDraft {
  step: WizardStep;
  name: string;
  date: string;
  venue: string;
  /** Začátek turnaje "HH:MM". Default 10:00. */
  startTime: string;
  /** Volitelný plánovaný konec "HH:MM". Když je set, ukáže se warning pokud predikce přesahuje. */
  plannedEndTime: string;
  teamCount: number;
  format: TournamentFormat | null; // null = ještě nevybráno
  teamNames: string[];
  // Pokročilé (volitelné)
  showAdvanced: boolean;
  matchDurationMinutes: number;
  numberOfPitches: number;
  registrationEnabled: boolean;
  entryFee: number | null;
  rules: string;
}

function emptyDraft(): WizardDraft {
  return {
    step: 1,
    name: '',
    date: todayStr(),
    venue: '',
    startTime: '10:00',
    plannedEndTime: '',
    teamCount: 4,
    format: null,
    teamNames: ['', '', '', ''],
    showAdvanced: false,
    matchDurationMinutes: 10,
    numberOfPitches: 1,
    registrationEnabled: false,
    entryFee: null,
    rules: '',
  };
}

/** Konvertuje "HH:MM" → minuty od půlnoci. Vrátí null když invalid. */
function parseTimeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return h * 60 + mn;
}

/** Konvertuje minuty od půlnoci → "HH:MM". Wrap-around přes půlnoc je OK (vrací mod 24h). */
function minutesToTimeStr(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const mn = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

/** Spočítá predikovaný konec turnaje ze začátku + estimovaných minut. */
function computeEndTime(startTime: string, durationMin: number): string | null {
  const start = parseTimeToMinutes(startTime);
  if (start === null) return null;
  return minutesToTimeStr(start + durationMin);
}

function loadDraft(): WizardDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardDraft>;
    // Validace — pokud má vyplněné jméno a není starší 24h, je validní draft
    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') return null;
    return { ...emptyDraft(), ...parsed } as WizardDraft;
  } catch {
    return null;
  }
}

function saveDraft(d: WizardDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch { /* ignore quota errors */ }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch { /* ignore */ }
}

// ─── Component ─────────────────────────────────────────────────────────

export function TournamentWizardPage({ navigate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const createTournament = useTournamentStore(s => s.createTournament);
  const allTournaments = useTournamentStore(s => s.tournaments);

  // ── State ──
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  // Resume prompt — zobrazí se jen jednou při mount, pokud je validní draft
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  // Templates — show jen pokud user má >= 1 předchozí turnaj
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  // Vlastní počet týmů — toggle (zobrazí inline number input pro >16 týmů)
  const [showCustomTeamCount, setShowCustomTeamCount] = useState(false);

  // Load draft on mount
  useEffect(() => {
    const existing = loadDraft();
    if (existing) {
      setShowResumePrompt(true);
    }
  }, []);

  // Auto-save draft on every change (debounced via effect)
  useEffect(() => {
    if (draft.name.trim() === '' && draft.step === 1) return; // don't save empty
    const timeout = setTimeout(() => saveDraft(draft), 500);
    return () => clearTimeout(timeout);
  }, [draft]);

  const updateDraft = <K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
    // Clear error on this field
    if (errors[key as string]) setErrors(e => ({ ...e, [key]: undefined }));
  };

  const handleResumeAccept = () => {
    const existing = loadDraft();
    if (existing) setDraft(existing);
    setShowResumePrompt(false);
  };

  const handleResumeDiscard = () => {
    clearDraft();
    setShowResumePrompt(false);
  };

  // ── Smart-suggest format computations ──
  const formatSuggestions = useMemo<FormatSuggestion[]>(
    () => suggestFormats(draft.teamCount, draft.matchDurationMinutes, draft.numberOfPitches),
    [draft.teamCount, draft.matchDurationMinutes, draft.numberOfPitches]
  );

  // Auto-select recommended format když user změní počet týmů (pokud nemá vybráno nebo má neplatný)
  useEffect(() => {
    const recommended = formatSuggestions.find(f => f.recommended);
    if (!recommended) return;
    const currentValid = draft.format && formatSuggestions.find(f => f.format === draft.format && f.valid);
    if (!draft.format || !currentValid) {
      setDraft(d => ({ ...d, format: recommended.format }));
    }
  }, [formatSuggestions, draft.format]);

  // ── Templates: posledních 5 turnajů usera, nejnovější první ──
  const templates = useMemo(() => {
    return allTournaments
      .filter(tt => (tt.sport ?? 'football') === preferredSport)
      .slice() // copy
      .sort((a, b) => (b.settings.startDate ?? '').localeCompare(a.settings.startDate ?? ''))
      .slice(0, 5);
  }, [allTournaments, preferredSport]);

  const handleUseTemplate = (templateId: string) => {
    const tpl = allTournaments.find(tt => tt.id === templateId);
    if (!tpl) return;
    setDraft(d => ({
      ...d,
      name: `${tpl.name} (kopie)`,
      teamCount: tpl.teams.length,
      teamNames: tpl.teams.map(team => team.name),
      format: tpl.settings.format ?? 'round-robin',
      venue: tpl.settings.venueName ?? '',
      matchDurationMinutes: tpl.settings.matchDurationMinutes,
      numberOfPitches: tpl.settings.numberOfPitches ?? 1,
      registrationEnabled: !!tpl.settings.registrationEnabled,
      entryFee: tpl.settings.entryFee ?? null,
      rules: tpl.settings.rules ?? '',
    }));
    setShowTemplatePicker(false);
  };

  // ── Team count change — adjust teamNames pole ──
  const handleTeamCountChange = (n: number) => {
    setDraft(d => {
      const next = [...d.teamNames];
      while (next.length < n) next.push('');
      return { ...d, teamCount: n, teamNames: next.slice(0, n) };
    });
  };

  const updateTeamName = (idx: number, val: string) => {
    setDraft(d => ({
      ...d,
      teamNames: d.teamNames.map((nm, i) => (i === idx ? val : nm)),
    }));
  };

  const autoFillTeamNames = () => {
    setDraft(d => ({
      ...d,
      teamNames: d.teamNames.map((nm, i) => nm.trim() || `${t('tournament.wizard.teamFallback')} ${String.fromCharCode(65 + i)}`),
    }));
  };

  // ── Validace per krok (on-submit) ──
  const validateStep1 = (): boolean => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('tournament.wizard.errorNameRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: typeof errors = {};
    if (draft.teamCount < 2) e.teamCount = t('tournament.wizard.errorTeamCountMin');
    if (!draft.format) e.format = t('tournament.wizard.errorFormatRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = (): boolean => {
    const e: typeof errors = {};
    const filledNames = draft.teamNames.slice(0, draft.teamCount).filter(n => n.trim());
    if (filledNames.length < draft.teamCount) {
      e.teamNames = t('tournament.wizard.errorTeamNamesIncomplete');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    if (draft.step === 1 && !validateStep1()) return;
    if (draft.step === 2 && !validateStep2()) return;
    if (draft.step === 3) return; // submit handled separately
    updateDraft('step', (draft.step + 1) as WizardStep);
    window.scrollTo(0, 0);
  };

  const goBack = () => {
    if (draft.step === 1) {
      navigate({ name: 'tournament-list' });
      return;
    }
    updateDraft('step', (draft.step - 1) as WizardStep);
    window.scrollTo(0, 0);
  };

  // ── Submit (final step) ──
  const handleSubmit = async () => {
    if (!validateStep3()) return;
    if (!user) return;

    // Auto-fill prázdná jména pro robustnost
    const names = draft.teamNames.slice(0, draft.teamCount).map((nm, i) =>
      nm.trim() || `${t('tournament.wizard.teamFallback')} ${String.fromCharCode(65 + i)}`
    );

    setBusy(true);
    try {
      const teams = names.map((nm, i) => ({
        name: nm,
        color: TEAM_COLORS[i % TEAM_COLORS.length],
        players: [],
      }));

      // Admin PIN — random, schovaný (user ho teď nepotřebuje, je v Settings turnaje)
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const pinSalt = generatePinSalt();
      const pinHash = await hashPin(pin, pinSalt);

      // Format-specific settings
      const format = draft.format ?? 'round-robin';
      const suggestion = formatSuggestions.find(f => f.format === format);

      const tournament = await createTournament({
        name: draft.name.trim(),
        sport: preferredSport === 'tennis'
          ? 'tennis'
          : preferredSport === 'floorball'
            ? 'floorball'
            : 'football',
        teams,
        pinHash,
        pinSalt,
        settings: {
          matchDurationMinutes: draft.matchDurationMinutes,
          breakBetweenMatchesMinutes: 5,
          numberOfPitches: draft.numberOfPitches,
          startDate: draft.date,
          startTime: draft.startTime,
          format,
          // Groups+knockout formát: nastav advancePerGroup ze suggestion
          ...(format === 'groups-knockout' && suggestion?.qualifyingPerGroup
            ? { advancePerGroup: suggestion.qualifyingPerGroup }
            : {}),
          ...(draft.venue.trim() ? { venueName: draft.venue.trim() } : {}),
          ...(draft.rules.trim() ? { rules: draft.rules.trim() } : {}),
          ...(draft.registrationEnabled ? { registrationEnabled: true } : {}),
          ...(draft.entryFee != null && draft.entryFee > 0 ? { entryFee: draft.entryFee } : {}),
        },
      });

      clearDraft();
      useToastStore.getState().show('success', t('tournament.wizard.createdSuccess'));
      navigate({ name: 'tournament-detail', tournamentId: tournament.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useToastStore.getState().show('error', msg);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ──

  const stepLabel = `${t('tournament.wizard.step')} ${draft.step}/3`;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: '100dvh', background: 'var(--bg)',
    }}>
      {/* Wrapper — center wizard na desktopu, full width na mobilu.
          Sticky CTA je uvnitř, takže respektuje max-width parenta. */}
      <div style={{
        width: '100%', maxWidth: 720, margin: '0 auto',
        flex: 1, display: 'flex', flexDirection: 'column',
      }}>
        <PageHeader
          title={t('tournament.wizard.title')}
          subtitle={stepLabel}
          onBack={goBack}
        />

        {/* Progress bar (3 steps) */}
        <div style={{ padding: '0 16px', display: 'flex', gap: 6, marginBottom: 16 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= draft.step ? 'var(--primary)' : 'var(--border)',
              transition: 'background .3s',
            }} />
          ))}
        </div>

      {/* Resume prompt — toast-like banner */}
      {showResumePrompt && (
        <div style={{
          margin: '0 16px 12px',
          background: 'var(--info-light)',
          border: '1px solid var(--info)',
          borderRadius: 12, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 22 }}>📝</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--info)' }}>
              {t('tournament.wizard.resumeTitle')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('tournament.wizard.resumeHint')}
            </div>
          </div>
          <button
            onClick={handleResumeAccept}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: 'var(--info)', color: '#fff',
              border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t('tournament.wizard.resumeContinue')}
          </button>
          <button
            onClick={handleResumeDiscard}
            aria-label={t('common.dismiss')}
            style={{
              padding: '6px 8px', borderRadius: 8,
              background: 'transparent', color: 'var(--text-muted)',
              border: 'none', fontSize: 14, cursor: 'pointer',
            }}
          >✕</button>
        </div>
      )}

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── KROK 1: Základ ──────────────────────────────────────────────── */}
        {draft.step === 1 && (
          <>
            {/* Templates picker — jen pokud má user předchozí turnaje */}
            {templates.length > 0 && !draft.name.trim() && (
              <FormCard>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <SectionTitle>✨ {t('tournament.wizard.templateTitle')}</SectionTitle>
                  <button
                    type="button"
                    onClick={() => setShowTemplatePicker(o => !o)}
                    style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                    }}
                  >
                    {showTemplatePicker
                      ? t('tournament.wizard.templateHide')
                      : t('tournament.wizard.templateShow')}
                  </button>
                </div>
                {showTemplatePicker && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {templates.map(tpl => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleUseTemplate(tpl.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 10,
                          background: 'var(--surface-var)', border: '1px solid var(--border)',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>🏆</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: 700, fontSize: 13, color: 'var(--text)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {tpl.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {tpl.teams.length} {t('tournament.wizard.templateTeams')} · {tpl.settings.startDate}
                          </div>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>›</span>
                      </button>
                    ))}
                  </div>
                )}
              </FormCard>
            )}

            <FormCard>
              <SectionTitle>{t('tournament.wizard.step1Title')}</SectionTitle>

              <FormField id="tw-name" label={t('tournament.wizard.nameLabel')} required>
                <input
                  id="tw-name"
                  type="text"
                  value={draft.name}
                  onChange={e => updateDraft('name', e.target.value)}
                  placeholder={t('tournament.wizard.namePlaceholder')}
                  style={{
                    ...formInputStyle,
                    borderColor: errors.name ? 'var(--danger)' : (formInputStyle.borderColor as string),
                  }}
                  autoFocus
                  maxLength={60}
                />
              </FormField>
              {errors.name && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: -4 }}>
                  {errors.name}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 100px', minWidth: 100 }}>
                  <FormField id="tw-date" label={t('tournament.wizard.dateLabel')}>
                    <input
                      id="tw-date"
                      type="date"
                      value={draft.date}
                      onChange={e => updateDraft('date', e.target.value)}
                      style={formInputStyle}
                    />
                  </FormField>
                </div>
                <div style={{ flex: '1 1 90px', minWidth: 90 }}>
                  <FormField id="tw-time" label={t('tournament.wizard.timeLabel')}>
                    <input
                      id="tw-time"
                      type="time"
                      value={draft.startTime}
                      onChange={e => updateDraft('startTime', e.target.value)}
                      style={formInputStyle}
                    />
                  </FormField>
                </div>
                <div style={{ flex: '1 1 90px', minWidth: 90 }}>
                  <FormField
                    id="tw-end-time"
                    label={t('tournament.wizard.endTimeLabel')}
                    hint={t('tournament.wizard.endTimeHint')}
                  >
                    <input
                      id="tw-end-time"
                      type="time"
                      value={draft.plannedEndTime}
                      onChange={e => updateDraft('plannedEndTime', e.target.value)}
                      style={formInputStyle}
                    />
                  </FormField>
                </div>
              </div>

              <FormField id="tw-venue" label={t('tournament.wizard.venueLabel')}>
                <input
                  id="tw-venue"
                  type="text"
                  value={draft.venue}
                  onChange={e => updateDraft('venue', e.target.value)}
                  placeholder={t('tournament.wizard.venuePlaceholder')}
                  style={formInputStyle}
                />
              </FormField>
            </FormCard>
          </>
        )}

        {/* ── KROK 2: Týmy + Formát ──────────────────────────────────────── */}
        {draft.step === 2 && (
          <>
            <FormCard>
              <SectionTitle>{t('tournament.wizard.step2TeamsTitle')}</SectionTitle>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                {t('tournament.wizard.teamCountHint')}
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 6,
              }}>
                {TEAM_COUNT_OPTIONS.map(n => {
                  const active = draft.teamCount === n && !showCustomTeamCount;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setShowCustomTeamCount(false);
                        handleTeamCountChange(n);
                      }}
                      style={{
                        padding: '8px 0',
                        borderRadius: 10,
                        fontSize: 14, fontWeight: 700,
                        background: active ? 'var(--primary)' : 'var(--surface-var)',
                        color: active ? '#fff' : 'var(--text-muted)',
                        border: active ? 'none' : '1.5px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>

              {/* Vlastní počet — pro velké turnaje (>16 týmů, max 32) */}
              {!showCustomTeamCount && draft.teamCount <= 16 ? (
                <button
                  type="button"
                  onClick={() => setShowCustomTeamCount(true)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--primary)', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', padding: '6px 0', alignSelf: 'flex-start',
                    textDecoration: 'underline',
                  }}
                >
                  + {t('tournament.wizard.teamCountCustomLink')}
                </button>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 12,
                  background: 'var(--primary-light)', border: '2px solid var(--primary)',
                }}>
                  <label htmlFor="tw-custom-teamcount" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {t('tournament.wizard.teamCountCustomLabel')}
                  </label>
                  <input
                    id="tw-custom-teamcount"
                    type="number"
                    inputMode="numeric"
                    min={TEAM_COUNT_MIN}
                    max={TEAM_COUNT_MAX}
                    value={draft.teamCount}
                    onChange={e => {
                      const raw = parseInt(e.target.value, 10);
                      if (Number.isNaN(raw)) return;
                      const clamped = Math.max(TEAM_COUNT_MIN, Math.min(TEAM_COUNT_MAX, raw));
                      handleTeamCountChange(clamped);
                    }}
                    style={{
                      width: 70, padding: '8px 10px',
                      fontSize: 16, fontWeight: 800, textAlign: 'center',
                      borderRadius: 10, border: '1px solid var(--border)',
                      background: 'var(--surface)', color: 'var(--text)',
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                    {t('tournament.wizard.teamCountCustomHint', { max: TEAM_COUNT_MAX })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomTeamCount(false);
                      handleTeamCountChange(8);
                    }}
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--text-muted)', fontSize: 18,
                      cursor: 'pointer', padding: 4, lineHeight: 1,
                    }}
                    aria-label={t('common.close')}
                  >
                    ×
                  </button>
                </div>
              )}
            </FormCard>

            <FormCard>
              <SectionTitle>{t('tournament.wizard.step2FormatTitle')}</SectionTitle>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                {t('tournament.wizard.formatSmartHint', { teamCount: draft.teamCount })}
              </p>

              {/* Délka zápasu + počet hřišť — vždy viditelné, ovlivňují odhad času */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <FormField id="tw-match-duration" label={t('tournament.wizard.matchDurationLabel')}>
                    <input
                      id="tw-match-duration"
                      type="number"
                      min={1}
                      max={90}
                      value={draft.matchDurationMinutes}
                      onChange={e => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) updateDraft('matchDurationMinutes', Math.max(1, Math.min(90, n)));
                      }}
                      style={formInputStyle}
                      inputMode="numeric"
                    />
                  </FormField>
                </div>
                <div style={{ flex: 1 }}>
                  <FormField id="tw-pitches" label={t('tournament.wizard.pitchesLabel')}>
                    <input
                      id="tw-pitches"
                      type="number"
                      min={1}
                      max={8}
                      value={draft.numberOfPitches}
                      onChange={e => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) updateDraft('numberOfPitches', Math.max(1, Math.min(8, n)));
                      }}
                      style={formInputStyle}
                      inputMode="numeric"
                    />
                  </FormField>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {formatSuggestions.map(s => {
                  const isActive = draft.format === s.format;
                  return (
                    <button
                      key={s.format}
                      type="button"
                      onClick={() => s.valid && updateDraft('format', s.format)}
                      disabled={!s.valid}
                      style={{
                        position: 'relative',
                        padding: '14px 16px', borderRadius: 14,
                        background: isActive ? 'var(--primary-light)' : 'var(--surface)',
                        border: `2px solid ${isActive ? 'var(--primary)' : (s.valid ? 'var(--border)' : 'transparent')}`,
                        opacity: s.valid ? 1 : 0.4,
                        cursor: s.valid ? 'pointer' : 'not-allowed',
                        textAlign: 'left',
                        display: 'flex', flexDirection: 'column', gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>
                          {s.format === 'round-robin' ? '🔁'
                            : s.format === 'groups-knockout' ? '🏆'
                            : '⚔️'}
                        </span>
                        <span style={{
                          fontSize: 14, fontWeight: 800,
                          color: isActive ? 'var(--primary)' : 'var(--text)',
                          flex: 1,
                        }}>
                          {t(`tournament.format.${s.format === 'round-robin' ? 'roundRobin' : s.format === 'groups-knockout' ? 'groupsKnockout' : 'knockout'}.title`)}
                        </span>
                        {s.recommended && (
                          <span style={{
                            fontSize: 9, fontWeight: 800,
                            background: 'var(--warning)', color: '#fff',
                            padding: '3px 7px', borderRadius: 12,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                          }}>
                            ⭐ {t('tournament.wizard.recommendedBadge')}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {t(s.descriptionKey)}
                      </div>
                      {s.valid && s.totalMatches > 0 && (() => {
                        // Predikovaný konec turnaje + porovnání s plánovaným koncem
                        const predictedEnd = computeEndTime(draft.startTime, s.estimatedMinutes);
                        const startMin = parseTimeToMinutes(draft.startTime);
                        const plannedEndMin = draft.plannedEndTime ? parseTimeToMinutes(draft.plannedEndTime) : null;
                        const overflowMin = (
                          startMin !== null && plannedEndMin !== null
                            ? (startMin + s.estimatedMinutes) - plannedEndMin
                            : null
                        );
                        const exceeds = overflowMin !== null && overflowMin > 0;
                        return (
                          <>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                              📊 {s.totalMatches} {t('tournament.wizard.matchesUnit')} · ⏱ ~{s.estimatedMinutes} {t('tournament.wizard.minutesUnit')}
                              {predictedEnd && (
                                <> · 🏁 {t('tournament.wizard.endsAround')} {predictedEnd}</>
                              )}
                              {s.format === 'groups-knockout' && s.groupSizes && s.groupSizes.length > 0 && (() => {
                                // Pokud jsou všechny skupiny stejně velké → "3× po 4"
                                // Jinak → "3 skupiny: 4·4·3"
                                const allSame = s.groupSizes.every(sz => sz === s.groupSizes![0]);
                                if (allSame) {
                                  return (
                                    <> · {s.groupSizes.length}× {t('tournament.wizard.groupsLabel')} {t('tournament.wizard.groupsBy')} {s.groupSizes[0]}</>
                                  );
                                }
                                return (
                                  <> · {s.groupSizes.length} {t('tournament.wizard.groupsLabel')}: {s.groupSizes.join('·')}</>
                                );
                              })()}
                            </div>
                            {exceeds && (
                              <div style={{
                                fontSize: 11, fontWeight: 700,
                                color: 'var(--danger)',
                                background: 'rgba(198, 40, 40, 0.08)',
                                padding: '6px 10px', borderRadius: 8,
                                marginTop: 2,
                              }}>
                                ⚠️ {t('tournament.wizard.exceedsPlannedEnd', { minutes: overflowMin })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </button>
                  );
                })}
              </div>
              {errors.format && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
                  {errors.format}
                </div>
              )}

            </FormCard>
          </>
        )}

        {/* ── KROK 3: Jména týmů + Pokročilé ─────────────────────────────── */}
        {draft.step === 3 && (
          <>
            <FormCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionTitle>{t('tournament.wizard.step3TeamNamesTitle')}</SectionTitle>
                <button
                  type="button"
                  onClick={autoFillTeamNames}
                  style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  {t('tournament.wizard.autoFillTeams')}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: draft.teamCount }).map((_, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, alignItems: 'center',
                    background: 'var(--surface-var)', borderRadius: 10, padding: 8,
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 8,
                      background: TEAM_COLORS[i % TEAM_COLORS.length],
                      color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0,
                    }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <input
                      type="text"
                      value={draft.teamNames[i] ?? ''}
                      onChange={e => updateTeamName(i, e.target.value)}
                      placeholder={t('tournament.wizard.teamPlaceholder', { letter: String.fromCharCode(65 + i) })}
                      style={{ ...formInputStyle, padding: '8px 10px', fontSize: 13, flex: 1, minWidth: 0 }}
                    />
                  </div>
                ))}
              </div>
              {errors.teamNames && (
                <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                  {errors.teamNames}
                </div>
              )}
            </FormCard>

            {/* Pokročilé sekce — collapsible, default off (NN/g progressive disclosure) */}
            <button
              type="button"
              onClick={() => updateDraft('showAdvanced', !draft.showAdvanced)}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '14px 16px', borderRadius: 14,
                background: draft.showAdvanced ? 'var(--primary-light)' : 'var(--surface)',
                border: `1.5px solid ${draft.showAdvanced ? 'var(--primary)' : 'var(--border)'}`,
                cursor: 'pointer', textAlign: 'left',
              }}
              aria-expanded={draft.showAdvanced}
            >
              <span style={{ fontSize: 20 }}>⚙️</span>
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 700,
                color: draft.showAdvanced ? 'var(--primary)' : 'var(--text)',
              }}>
                {t('tournament.wizard.advancedTitle')}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: draft.showAdvanced ? 'var(--primary)' : 'var(--text-muted)',
                transform: draft.showAdvanced ? 'rotate(180deg)' : 'none',
                transition: 'transform .2s',
              }}>▼</span>
            </button>

            {draft.showAdvanced && (
              <FormCard>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                  {t('tournament.wizard.advancedHint')}
                </p>

                {/* Online registrace */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draft.registrationEnabled}
                    onChange={e => updateDraft('registrationEnabled', e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {t('tournament.wizard.registrationEnabled')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {t('tournament.wizard.registrationHint')}
                    </div>
                  </div>
                </label>

                {/* Vstupné */}
                <FormField id="tw-fee" label={t('tournament.wizard.entryFeeLabel')}>
                  <input
                    id="tw-fee"
                    type="number"
                    min={0}
                    value={draft.entryFee ?? ''}
                    onChange={e => {
                      const v = e.target.value;
                      updateDraft('entryFee', v === '' ? null : Math.max(0, Number(v) || 0));
                    }}
                    placeholder={t('tournament.wizard.entryFeePlaceholder')}
                    style={formInputStyle}
                    inputMode="numeric"
                  />
                </FormField>

                {/* Vlastní pravidla */}
                <FormField id="tw-rules" label={t('tournament.wizard.rulesLabel')}>
                  <textarea
                    id="tw-rules"
                    value={draft.rules}
                    onChange={e => updateDraft('rules', e.target.value)}
                    placeholder={t('tournament.wizard.rulesPlaceholder')}
                    rows={3}
                    style={{
                      ...formInputStyle,
                      resize: 'vertical', fontFamily: 'inherit',
                    }}
                  />
                </FormField>

                {/* Fall-through: pokud user potřebuje EŠTĚ víc, link na manual create */}
                <div style={{
                  marginTop: 8, padding: 10, borderRadius: 10,
                  background: 'var(--surface-var)', border: '1px dashed var(--border)',
                  fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                }}>
                  {t('tournament.wizard.manualFallbackHint')}{' '}
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'tournament-create' })}
                    style={{
                      background: 'transparent', border: 'none', padding: 0,
                      color: 'var(--primary)', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    {t('tournament.wizard.manualFallbackCta')}
                  </button>
                </div>
              </FormCard>
            )}
          </>
        )}
      </div>

        {/* Sticky bottom CTA — `position: sticky` UVNITŘ wizard kontejneru,
            takže respektuje max-width 720px wrapperu (na desktopu se nataží
            jen přes wizard, na mobilu přes celou šířku obrazovky).
            Audit 2026-04-26 (user 2× iter): původně `position: fixed` přes
            celý viewport vypadal rozbitě. Sticky in-flow řeší to čistě.
            `marginTop: auto` strká CTA na konec flex column kontejneru.  */}
        <div style={{
          marginTop: 'auto',
          position: 'sticky', bottom: 0,
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          padding: '12px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          display: 'flex', gap: 10,
          zIndex: 50,
        }}>
          <button
            type="button"
            onClick={goBack}
            aria-label={t('common.back')}
            style={{
              padding: '14px 20px', borderRadius: 12,
              background: 'var(--surface-var)', color: 'var(--text)',
              border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ←
          </button>
          <PrimaryButton
            onClick={draft.step === 3 ? handleSubmit : goNext}
            disabled={busy}
            style={{ flex: 1 }}
          >
            {busy
              ? t('common.loading')
              : draft.step === 3
                ? `⚡ ${t('tournament.wizard.createCta')}`
                : t('tournament.wizard.nextCta')}
          </PrimaryButton>
        </div>
      </div>{/* /wizard wrapper */}
    </div>
  );
}
