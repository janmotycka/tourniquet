import { useState } from 'react';
import type { Page } from '../../App';
import { useAuth } from '../../context/AuthContext';
import { useTournamentStore } from '../../store/tournament.store';
import { useClubsStore } from '../../store/clubs.store';
import { useTemplatesStore } from '../../store/templates.store';
import { useI18n } from '../../i18n';
import type { TournamentTemplate } from '../../types/tournament.types';
import { hashPin, generatePinSalt, markPinVerified } from '../../utils/pin-hash';
import { countRealMatches, estimateTournamentDuration } from '../../utils/tournament-schedule';
import type { TournamentSettings, TournamentFormat, GroupDefinition } from '../../types/tournament.types';
import type { Club, AgeCategory } from '../../types/club.types';
import { TEAM_COLORS } from '../../utils/team-colors';

import {
  ClubPickerModal,
  TemplatePickerModal,
  BasicInfoStep,
  TeamsStep,
  PinAndScheduleStep,
  today,
  defaultTeams,
  generateDefaultMatchOrder,
} from '../../components/tournament/create';
import type { TeamDraft, MatchOrderEntry } from '../../components/tournament/create';

interface Props { navigate: (p: Page) => void; }

// ─── Main ─────────────────────────────────────────────────────────────────────
export function CreateTournamentPage({ navigate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const templates = useTemplatesStore(s => s.templates);
  const deleteTemplate = useTemplatesStore(s => s.deleteTemplate);
  const [step, setStep] = useState(0);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Krok 0 — Zakladni info
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [startTime, setStartTime] = useState('09:00');
  const [matchDuration, setMatchDuration] = useState(15);
  const [breakDuration, setBreakDuration] = useState(5);
  const [numberOfPitches, setNumberOfPitches] = useState(1);
  const [rules, setRules] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('round-robin');
  const [groupCount, setGroupCount] = useState(2);
  const [advancePerGroup, setAdvancePerGroup] = useState(1);
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(false);

  // Krok 1 — Tymy
  const [teams, setTeams] = useState<TeamDraft[]>(() => defaultTeams(t));
  const [newPlayerName, setNewPlayerName] = useState<Record<number, string>>({});
  const [newPlayerNumber, setNewPlayerNumber] = useState<Record<number, string>>({});
  const [clubPickerForTeam, setClubPickerForTeam] = useState<number | null>(null);

  // Logo upload per-team
  const [logoUploading, setLogoUploading] = useState<Record<number, boolean>>({});

  // Krok 2 — PIN + poradi zapasu
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [creating, setCreating] = useState(false);
  const [matchOrder, setMatchOrder] = useState<MatchOrderEntry[]>([]);

  const createTournament = useTournamentStore(s => s.createTournament);
  const { clubs, createClub } = useClubsStore();

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
    // Distribuce tymu do skupin (hadovite)
    teams.forEach((_, i) => {
      const gIdx = i % gc;
      groups[gIdx].teamIds.push(`team-placeholder-${i}`); // placeholder — vyplni se pri vytvareni
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
  };

  const totalMatches = countRealMatches(teams.length);
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
    // Prefill teams
    const newTeams: TeamDraft[] = tpl.teamSnapshots.map((snap) => ({
      name: snap.name,
      color: snap.color,
      players: [],
      expanded: false,
      clubId: snap.clubId ?? null,
      logoBase64: snap.logoBase64 ?? null,
    }));
    if (newTeams.length >= 2) setTeams(newTeams);
    setShowTemplatePicker(false);
  };

  // ── Navigace wizard ────────────────────────────────────────────────────────
  const canGoNext0 = name.trim().length >= 2;
  const canGoNext1 = teams.length >= 2;

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
    // Vyber hrace: pokud je kategorie, filtruj roster; jinak fallback na defaultPlayers
    let players: Array<{ name: string; jerseyNumber: number }>;
    if (category && (club.players ?? []).length > 0) {
      players = (club.players ?? [])
        .filter(p => p.ageCategory === category && p.active)
        .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber }));
    } else if (!category && (club.players ?? []).length > 0 && (club.ageCategories ?? []).length === 1) {
      // Jedna kategorie -> automaticky vezmi jeji hrace
      const cat = (club.ageCategories ?? [])[0];
      players = (club.players ?? [])
        .filter(p => p.ageCategory === cat && p.active)
        .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber }));
    } else {
      // Fallback na defaultPlayers
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
      // Auto-verify PIN — owner just set it, no need to re-enter
      markPinVerified(tournament.id);
      navigate({ name: 'tournament-detail', tournamentId: tournament.id });
    } finally {
      setCreating(false);
    }
  };

  const goToStep2 = () => {
    setMatchOrder(generateDefaultMatchOrder(teams.length));
    setStep(2);
  };

  const resetMatchOrder = () => {
    setMatchOrder(generateDefaultMatchOrder(teams.length));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Club Picker Modal */}
      {clubPickerForTeam !== null && (
        <ClubPickerModal
          clubs={clubs}
          onSelect={(club, category) => handleSelectClub(clubPickerForTeam, club, category)}
          onCreateClub={(n, c, l) => createClub({ name: n, color: c, logoBase64: l })}
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
        <button onClick={goBack} aria-label="Back" style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
          fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: 18, flex: 1 }}>
          {step === 0 ? t('tournament.create.title') : step === 1 ? t('tournament.create.teamsStep') : t('tournament.create.pinStep')}
        </h1>
        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
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

        {/* ─── Krok 0: Zakladni info ─── */}
        {step === 0 && (
          <BasicInfoStep
            name={name} setName={setName}
            startDate={startDate} setStartDate={setStartDate}
            startTime={startTime} setStartTime={setStartTime}
            matchDuration={matchDuration} setMatchDuration={setMatchDuration}
            breakDuration={breakDuration} setBreakDuration={setBreakDuration}
            numberOfPitches={numberOfPitches} setNumberOfPitches={setNumberOfPitches}
            rules={rules} setRules={setRules}
            format={format} setFormat={setFormat}
            groupCount={groupCount} setGroupCount={setGroupCount}
            advancePerGroup={advancePerGroup} setAdvancePerGroup={setAdvancePerGroup}
            thirdPlaceMatch={thirdPlaceMatch} setThirdPlaceMatch={setThirdPlaceMatch}
            templates={templates}
            onOpenTemplatePicker={() => setShowTemplatePicker(true)}
          />
        )}

        {/* ─── Krok 1: Tymy a soupisky ─── */}
        {step === 1 && (
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

        {/* ─── Krok 2: PIN a nahled ─── */}
        {step === 2 && (
          <PinAndScheduleStep
            pin={pin} setPin={setPin}
            pinConfirm={pinConfirm} setPinConfirm={setPinConfirm}
            pinError={pinError} setPinError={setPinError}
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
          />
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
            disabled={!canGoNext0}
            style={{
              flex: 1, background: canGoNext0 ? 'var(--primary)' : 'var(--border)',
              color: canGoNext0 ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 16,
              padding: '14px', borderRadius: 14,
            }}
          >
            {t('tournament.create.continue')}
          </button>
        )}
        {step === 1 && (
          <button
            onClick={goToStep2}
            disabled={!canGoNext1}
            style={{
              flex: 1, background: canGoNext1 ? 'var(--primary)' : 'var(--border)',
              color: canGoNext1 ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 16,
              padding: '14px', borderRadius: 14,
            }}
          >
            {t('tournament.create.continueInfo', { teams: teams.length, matches: totalMatches })}
          </button>
        )}
        {step === 2 && (
          <button
            onClick={handleCreate}
            disabled={creating || pin.length !== 6}
            style={{
              flex: 1,
              background: creating || pin.length !== 6 ? 'var(--border)' : 'var(--primary)',
              color: creating || pin.length !== 6 ? 'var(--text-muted)' : '#fff',
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
