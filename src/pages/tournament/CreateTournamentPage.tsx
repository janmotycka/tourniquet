import { useState, useRef } from 'react';
import type { Page } from '../../App';
import { useTournamentStore } from '../../store/tournament.store';
import { useClubsStore } from '../../store/clubs.store';
import { useI18n } from '../../i18n';
import { hashPin, generatePinSalt } from '../../utils/pin-hash';
import { countRealMatches, estimateTournamentDuration, formatMatchTime, parseStartDateTime } from '../../utils/tournament-schedule';
import type { TournamentSettings } from '../../types/tournament.types';
import type { Club } from '../../types/club.types';

interface Props { navigate: (p: Page) => void; }

// ─── Předdefinované barvy týmů ────────────────────────────────────────────────
const TEAM_COLORS = [
  '#E53935', '#1E88E5', '#43A047', '#FB8C00',
  '#8E24AA', '#F4511E', '#00ACC1', '#6D4C41',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function Stepper({ value, min, max, step = 1, onChange, label, unit }: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; label: string; unit: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{value} {unit}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          style={{
            width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
            fontWeight: 700, fontSize: 20, color: value <= min ? 'var(--text-muted)' : 'var(--text)',
          }}
        >−</button>
        <span style={{ fontWeight: 800, fontSize: 18, minWidth: 36, textAlign: 'center', color: 'var(--primary)' }}>{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          style={{
            width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
            fontWeight: 700, fontSize: 20, color: value >= max ? 'var(--text-muted)' : 'var(--text)',
          }}
        >+</button>
      </div>
    </div>
  );
}

// ─── Logo upload helper ────────────────────────────────────────────────────────
async function resizeLogoToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas')); return; }
        // Crop to square center
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Stav wizardu ─────────────────────────────────────────────────────────────
interface TeamDraft {
  name: string;
  color: string;
  players: Array<{ name: string; jerseyNumber: number }>;
  expanded: boolean;
  clubId: string | null;
  logoBase64: string | null;
}

function defaultTeams(t: (key: string, params?: Record<string, string | number>) => string): TeamDraft[] {
  return [
    { name: t('tournament.teamA'), color: TEAM_COLORS[0], players: [], expanded: false, clubId: null, logoBase64: null },
    { name: t('tournament.teamB'), color: TEAM_COLORS[1], players: [], expanded: false, clubId: null, logoBase64: null },
  ];
}

// ─── Club Picker Modal ────────────────────────────────────────────────────────
interface ClubPickerModalProps {
  clubs: Club[];
  onSelect: (club: Club) => void;
  onCreateClub: (name: string, color: string, logoBase64: string | null) => Club;
  onClose: () => void;
}

function ClubPickerModal({ clubs, onSelect, onCreateClub, onClose }: ClubPickerModalProps) {
  const { t } = useI18n();
  const [showNewClub, setShowNewClub] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubColor, setNewClubColor] = useState(TEAM_COLORS[0]);
  const [newClubLogo, setNewClubLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await resizeLogoToBase64(file);
      setNewClubLogo(b64);
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = () => {
    if (!newClubName.trim()) return;
    const club = onCreateClub(newClubName.trim(), newClubColor, newClubLogo);
    onSelect(club);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px',
        width: '100%', maxWidth: 480, maxHeight: '70vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontWeight: 800, fontSize: 17 }}>{t('tournament.create.selectClub')}</h3>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--text-muted)' }}>✕</button>
        </div>

        {clubs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clubs.map(c => (
              <button key={c.id} onClick={() => onSelect(c)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--surface-var)', borderRadius: 12, padding: '10px 14px',
                textAlign: 'left', color: 'var(--text)',
              }}>
                {c.logoBase64 ? (
                  <img src={c.logoBase64} alt={c.name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: c.color, flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('tournament.create.playersInRoster', { count: c.defaultPlayers.length })}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!showNewClub ? (
          <button onClick={() => setShowNewClub(true)} style={{
            background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 14,
            padding: '12px', borderRadius: 12, border: '2px dashed var(--primary)',
          }}>
            {t('tournament.create.addNewClub')}
          </button>
        ) : (
          <div style={{ background: 'var(--surface-var)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ fontWeight: 700, fontSize: 14 }}>{t('tournament.create.newClub')}</h4>
            <input
              placeholder={t('tournament.create.clubName')}
              value={newClubName}
              onChange={e => setNewClubName(e.target.value)}
              style={{
                width: '100%', padding: '10px', borderRadius: 8, border: '1.5px solid var(--border)',
                fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('tournament.create.colorLabel')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEAM_COLORS.map(c => (
                  <button key={c} onClick={() => setNewClubColor(c)} style={{
                    width: 28, height: 28, borderRadius: 8, background: c, flexShrink: 0,
                    border: newClubColor === c ? '3px solid var(--text)' : '3px solid transparent',
                  }} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('tournament.create.clubLogo')}</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {newClubLogo ? (
                  <img src={newClubLogo} alt="logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: newClubColor }} />
                )}
                <button onClick={() => fileRef.current?.click()} style={{
                  background: 'var(--surface)', border: '1.5px solid var(--border)',
                  padding: '8px 12px', borderRadius: 8, fontSize: 13, color: 'var(--text)',
                }}>
                  {uploading ? t('tournament.create.uploading') : t('tournament.create.uploadLogo')}
                </button>
                {newClubLogo && (
                  <button onClick={() => setNewClubLogo(null)} style={{ fontSize: 13, color: 'var(--text-muted)' }}>✕</button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowNewClub(false)} style={{
                flex: 1, padding: '10px', borderRadius: 10, background: 'var(--surface)',
                border: '1.5px solid var(--border)', fontWeight: 600, fontSize: 14, color: 'var(--text)',
              }}>{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={!newClubName.trim()} style={{
                flex: 2, padding: '10px', borderRadius: 10,
                background: newClubName.trim() ? 'var(--primary)' : 'var(--border)',
                color: newClubName.trim() ? '#fff' : 'var(--text-muted)',
                fontWeight: 700, fontSize: 14,
              }}>{t('tournament.create.saveAndUse')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function CreateTournamentPage({ navigate }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);

  // Krok 0 — Základní info
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [startTime, setStartTime] = useState('09:00');
  const [matchDuration, setMatchDuration] = useState(15);
  const [breakDuration, setBreakDuration] = useState(5);
  const [numberOfPitches, setNumberOfPitches] = useState(1);
  const [rules, setRules] = useState('');

  // Krok 1 — Týmy
  const [teams, setTeams] = useState<TeamDraft[]>(() => defaultTeams(t));
  const [newPlayerName, setNewPlayerName] = useState<Record<number, string>>({});
  const [newPlayerNumber, setNewPlayerNumber] = useState<Record<number, string>>({});
  const [clubPickerForTeam, setClubPickerForTeam] = useState<number | null>(null);

  // Logo upload per-team
  const logoFileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [logoUploading, setLogoUploading] = useState<Record<number, boolean>>({});

  // Krok 2 — PIN + pořadí zápasů
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [creating, setCreating] = useState(false);
  const [matchOrder, setMatchOrder] = useState<Array<{ homeTeamIndex: number; awayTeamIndex: number; roundIndex: number }>>([]);

  const createTournament = useTournamentStore(s => s.createTournament);
  const { clubs, createClub } = useClubsStore();

  const settings: TournamentSettings = {
    matchDurationMinutes: matchDuration,
    breakBetweenMatchesMinutes: breakDuration,
    startTime,
    startDate,
    rules: rules.trim() || undefined,
    numberOfPitches: numberOfPitches > 1 ? numberOfPitches : undefined,
  };

  const totalMatches = countRealMatches(teams.length);
  const totalMinutes = estimateTournamentDuration(teams.length, settings);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainMinutes = totalMinutes % 60;

  // ── Navigace wizard ────────────────────────────────────────────────────────
  const canGoNext0 = name.trim().length >= 2;
  const canGoNext1 = teams.length >= 2;

  const goBack = () => {
    if (step === 0) navigate({ name: 'tournament-list' });
    else setStep(s => s - 1);
  };

  // ── Týmy ──────────────────────────────────────────────────────────────────
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

  const handleLogoUpload = async (teamIdx: number, file: File) => {
    setLogoUploading(prev => ({ ...prev, [teamIdx]: true }));
    try {
      const b64 = await resizeLogoToBase64(file);
      updateTeam(teamIdx, { logoBase64: b64 });
    } finally {
      setLogoUploading(prev => ({ ...prev, [teamIdx]: false }));
    }
  };

  const handleSelectClub = (teamIdx: number, club: Club) => {
    updateTeam(teamIdx, {
      name: club.name,
      color: club.color,
      logoBase64: club.logoBase64,
      clubId: club.id,
      players: club.defaultPlayers.map(p => ({ ...p })),
    });
    setClubPickerForTeam(null);
  };

  // ── Vytvoření turnaje ─────────────────────────────────────────────────────
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
      navigate({ name: 'tournament-detail', tournamentId: tournament.id });
    } finally {
      setCreating(false);
    }
  };

  function rotateRight<T>(arr: T[], n: number): T[] {
    const len = arr.length;
    if (len === 0) return arr;
    const shift = n % len;
    return [...arr.slice(len - shift), ...arr.slice(0, len - shift)];
  }

  // ── Generování výchozího pořadí zápasů (circle-method s indexy) ──────────
  function generateDefaultMatchOrder(teamCount: number) {
    const indices = Array.from({ length: teamCount }, (_, i) => i);
    const hasBye = indices.length % 2 !== 0;
    if (hasBye) indices.push(-1); // -1 = BYE
    const n = indices.length;
    const rounds = n - 1;
    const matchesPerRound = n / 2;
    const order: Array<{ homeTeamIndex: number; awayTeamIndex: number; roundIndex: number }> = [];
    for (let round = 0; round < rounds; round++) {
      const rotated = [indices[0], ...rotateRight(indices.slice(1), round)];
      for (let i = 0; i < matchesPerRound; i++) {
        const home = rotated[i];
        const away = rotated[n - 1 - i];
        if (home === -1 || away === -1) continue;
        order.push({ homeTeamIndex: home, awayTeamIndex: away, roundIndex: round });
      }
    }
    return order;
  }

  const goToStep2 = () => {
    setMatchOrder(generateDefaultMatchOrder(teams.length));
    setStep(2);
  };

  const resetMatchOrder = () => {
    setMatchOrder(generateDefaultMatchOrder(teams.length));
  };

  const moveMatchUp = (idx: number) => {
    if (idx <= 0) return;
    setMatchOrder(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveMatchDown = (idx: number) => {
    setMatchOrder(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const computeDisplayTime = (index: number): string => {
    const startDt = parseStartDateTime(settings);
    const slotIndex = Math.floor(index / numberOfPitches);
    const offsetMs = slotIndex * (matchDuration + breakDuration) * 60 * 1000;
    const dt = new Date(startDt.getTime() + offsetMs);
    return formatMatchTime(dt.toISOString());
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Club Picker Modal */}
      {clubPickerForTeam !== null && (
        <ClubPickerModal
          clubs={clubs}
          onSelect={(club) => handleSelectClub(clubPickerForTeam, club)}
          onCreateClub={(n, c, l) => createClub({ name: n, color: c, logoBase64: l })}
          onClose={() => setClubPickerForTeam(null)}
        />
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        <button onClick={goBack} style={{
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

        {/* ─── Krok 0: Základní info ─── */}
        {step === 0 && (
          <>
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
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

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.date')}</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
                      fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.startTime')}</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
                      fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('tournament.create.matchDurations')}</h3>
              <Stepper label={t('tournament.create.matchDuration')} value={matchDuration} min={1} max={120} step={1} onChange={setMatchDuration} unit={t('common.min')} />
              <div style={{ height: 1, background: 'var(--border)' }} />
              <Stepper label={t('tournament.create.break')} value={breakDuration} min={0} max={15} step={1} onChange={setBreakDuration} unit={t('common.min')} />
              <div style={{ height: 1, background: 'var(--border)' }} />
              <Stepper label={t('tournament.create.pitchCount')} value={numberOfPitches} min={1} max={8} step={1} onChange={setNumberOfPitches} unit="" />
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
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
                  rows={4}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
                    fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                    resize: 'vertical', lineHeight: 1.5,
                  }}
                />
              </div>
            </div>
          </>
        )}

        {/* ─── Krok 1: Týmy a soupisky ─── */}
        {step === 1 && (
          <>
            {/* Info box */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 14, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 20 }}>ℹ️</span>
              <div style={{ fontSize: 13, color: 'var(--primary)', lineHeight: 1.4 }}>
                <b>{t('tournament.create.teamsCount', { count: teams.length })}</b> → <b>{t('tournament.create.matchesCount', { count: totalMatches })}</b>, {t('tournament.create.estimatedTime', { time:
                  `${totalHours > 0 ? `${totalHours}h ` : ''}${remainMinutes > 0 ? `${remainMinutes} ${t('common.min')}` : ''}`
                })}
              </div>
            </div>

            {/* Týmy */}
            {teams.map((team, tIdx) => (
              <div key={tIdx} style={{ background: 'var(--surface)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                {/* Záhlaví týmu */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                  {/* Logo nebo barevné kolečko */}
                  {team.logoBase64 ? (
                    <img src={team.logoBase64} alt={team.name} style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: team.color, flexShrink: 0 }} />
                  )}
                  <input
                    value={team.name}
                    onChange={e => updateTeam(tIdx, { name: e.target.value })}
                    maxLength={100}
                    style={{
                      flex: 1, fontWeight: 700, fontSize: 15, background: 'transparent',
                      border: 'none', color: 'var(--text)', outline: 'none',
                    }}
                  />
                  {/* Z klubu */}
                  <button onClick={() => setClubPickerForTeam(tIdx)} style={{
                    padding: '4px 8px', borderRadius: 8, background: 'var(--surface-var)',
                    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  }}>{t('tournament.create.selectClub')}</button>
                  <button onClick={() => updateTeam(tIdx, { expanded: !team.expanded })} style={{
                    width: 30, height: 30, borderRadius: 8, background: 'var(--surface-var)',
                    fontSize: 14, color: 'var(--text-muted)',
                  }}>
                    {team.expanded ? '▲' : '▼'}
                  </button>
                  {teams.length > 2 && (
                    <button onClick={() => removeTeam(tIdx)} style={{
                      width: 30, height: 30, borderRadius: 8, background: '#FFEBEE',
                      fontSize: 14, color: '#C62828',
                    }}>✕</button>
                  )}
                </div>

                {/* Výběr barvy + logo upload */}
                {team.expanded && (
                  <div style={{ padding: '0 16px 8px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('tournament.create.colorLabel')}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {TEAM_COLORS.map(c => (
                        <button key={c} onClick={() => updateTeam(tIdx, { color: c })} style={{
                          width: 28, height: 28, borderRadius: 8, background: c, flexShrink: 0,
                          border: team.color === c ? '3px solid var(--text)' : '3px solid transparent',
                        }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('tournament.create.clubLogo')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        ref={el => { logoFileRefs.current[tIdx] = el; }}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(tIdx, f); }}
                      />
                      <button onClick={() => logoFileRefs.current[tIdx]?.click()} style={{
                        background: 'var(--surface-var)', border: '1.5px solid var(--border)',
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, color: 'var(--text)',
                      }}>
                        {logoUploading[tIdx] ? t('tournament.create.uploading') : t('tournament.create.uploadLogo')}
                      </button>
                      {team.logoBase64 && (
                        <button onClick={() => updateTeam(tIdx, { logoBase64: null })} style={{ fontSize: 12, color: 'var(--text-muted)' }}>✕ {t('common.remove')}</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Soupiska */}
                {team.expanded && (
                  <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
                      {t('tournament.create.roster', { count: team.players.length })}
                    </div>

                    {team.players.map((p, pIdx) => (
                      <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-var)', borderRadius: 8 }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: 8, background: team.color,
                          color: '#fff', fontWeight: 700, fontSize: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>{p.jerseyNumber}</span>
                        <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
                        <button onClick={() => removePlayer(tIdx, pIdx)} style={{
                          fontSize: 14, color: 'var(--text-muted)', padding: '4px',
                        }}>✕</button>
                      </div>
                    ))}

                    {/* Přidat hráče */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <input
                        placeholder={t('tournament.create.jerseyNo')}
                        type="number"
                        min={1} max={99}
                        value={newPlayerNumber[tIdx] ?? ''}
                        onChange={e => setNewPlayerNumber(prev => ({ ...prev, [tIdx]: e.target.value }))}
                        style={{
                          width: 55, padding: '8px', borderRadius: 8, border: '1.5px solid var(--border)',
                          fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
                        }}
                      />
                      <input
                        placeholder={t('tournament.create.playerName')}
                        value={newPlayerName[tIdx] ?? ''}
                        onChange={e => setNewPlayerName(prev => ({ ...prev, [tIdx]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addPlayer(tIdx)}
                        maxLength={100}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 8, border: '1.5px solid var(--border)',
                          fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
                        }}
                      />
                      <button onClick={() => addPlayer(tIdx)} style={{
                        background: 'var(--primary)', color: '#fff', fontWeight: 700,
                        padding: '8px 12px', borderRadius: 8, fontSize: 13,
                      }}>+</button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {teams.length < 16 && (
              <button onClick={addTeam} style={{
                background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 15,
                padding: '14px', borderRadius: 14, border: '2px dashed var(--primary)',
              }}>
                {t('tournament.create.addTeam')}
              </button>
            )}
          </>
        )}

        {/* ─── Krok 2: PIN a náhled ─── */}
        {step === 2 && (
          <>
            {/* PIN */}
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('tournament.create.pinOrg')}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {t('tournament.create.pinDesc')}
              </p>
              <div>
                <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.pinLabel')}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                  placeholder="••••••"
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, fontSize: 20,
                    border: `1.5px solid ${pinError ? '#C62828' : 'var(--border)'}`,
                    background: 'var(--bg)', color: 'var(--text)', letterSpacing: 8, boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.pinConfirm')}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinConfirm}
                  onChange={e => { setPinConfirm(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                  placeholder="••••••"
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, fontSize: 20,
                    border: `1.5px solid ${pinError ? '#C62828' : 'var(--border)'}`,
                    background: 'var(--bg)', color: 'var(--text)', letterSpacing: 8, boxSizing: 'border-box',
                  }}
                />
              </div>
              {pinError && <div style={{ color: '#C62828', fontSize: 13 }}>⚠️ {pinError}</div>}
            </div>

            {/* Pořadí zápasů — interaktivní seznam */}
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('tournament.create.scheduleOrder')}</h3>
                <button onClick={resetMatchOrder} style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                  {t('tournament.create.resetOrder')}
                </button>
              </div>
              <div style={{
                background: 'var(--primary-light)', borderRadius: 10, padding: '10px 14px',
                fontSize: 13, color: 'var(--primary)', lineHeight: 1.5,
              }}>
                <b>{t('tournament.create.teamsCount', { count: teams.length })}</b> · <b>{t('tournament.create.matchesCount', { count: totalMatches })}</b> · {t('tournament.create.estimatedTime', { time:
                  `${totalHours > 0 ? `${totalHours}h ` : ''}${remainMinutes > 0 ? `${remainMinutes} ${t('common.min')}` : ''}`
                })}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                {t('tournament.create.reorderHint')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {matchOrder.map((match, idx) => {
                  const homeTeam = teams[match.homeTeamIndex];
                  const awayTeam = teams[match.awayTeamIndex];
                  const time = computeDisplayTime(idx);
                  const pitch = (idx % numberOfPitches) + 1;
                  const isFirst = idx === 0;
                  const isLast = idx === matchOrder.length - 1;

                  return (
                    <div key={`${match.homeTeamIndex}-${match.awayTeamIndex}-${match.roundIndex}`} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 8px', background: 'var(--surface-var)', borderRadius: 10,
                    }}>
                      {/* Pořadové číslo */}
                      <span style={{ width: 22, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 700, flexShrink: 0 }}>
                        {idx + 1}.
                      </span>
                      {/* Čas + hřiště */}
                      <span style={{ width: 42, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>
                        {time}
                      </span>
                      {numberOfPitches > 1 && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, width: 18 }}>
                          H{pitch}
                        </span>
                      )}
                      {/* Domácí barva */}
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: homeTeam?.color ?? '#ccc', flexShrink: 0 }} />
                      {/* Názvy týmů */}
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {homeTeam?.name ?? '?'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {awayTeam?.name ?? '?'}
                      </span>
                      {/* Hosté barva */}
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: awayTeam?.color ?? '#ccc', flexShrink: 0 }} />
                      {/* Tlačítka ▲ ▼ */}
                      <button
                        onClick={() => moveMatchUp(idx)}
                        disabled={isFirst}
                        style={{
                          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isFirst ? 'transparent' : 'var(--surface)',
                          border: isFirst ? 'none' : '1px solid var(--border)',
                          fontSize: 12, color: isFirst ? 'var(--border)' : 'var(--text)',
                          cursor: isFirst ? 'default' : 'pointer',
                        }}
                      >▲</button>
                      <button
                        onClick={() => moveMatchDown(idx)}
                        disabled={isLast}
                        style={{
                          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isLast ? 'transparent' : 'var(--surface)',
                          border: isLast ? 'none' : '1px solid var(--border)',
                          fontSize: 12, color: isLast ? 'var(--border)' : 'var(--text)',
                          cursor: isLast ? 'default' : 'pointer',
                        }}
                      >▼</button>
                    </div>
                  );
                })}
              </div>
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
