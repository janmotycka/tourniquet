import { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useClubsStore } from '../../store/clubs.store';
import { useI18n } from '../../i18n';
import type { MatchLineupPlayer, SubstitutionSettings } from '../../types/match.types';
import type { Club, AgeCategory } from '../../types/club.types';
import { useToastStore } from '../../store/toast.store';
import { useLayoutMode } from '../../hooks/useLayoutMode';

interface Props { navigate: (p: Page) => void; }

// ─── Stepper helper ────────────────────────────────────────────────────────────
function Stepper({ value, min, max, onChange, label, unit }: {
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
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label} −`}
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 20, color: value <= min ? 'var(--text-muted)' : 'var(--text)' }}>−</button>
        <span style={{ fontWeight: 800, fontSize: 18, minWidth: 36, textAlign: 'center', color: 'var(--primary)' }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label} +`}
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 20, color: value >= max ? 'var(--text-muted)' : 'var(--text)' }}>+</button>
      </div>
    </div>
  );
}

// ─── Default today's date ──────────────────────────────────────────────────────
function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}
function nowTimeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Club logo/color badge ────────────────────────────────────────────────────
function ClubBadge({ club, size = 32 }: { club: Club; size?: number }) {
  return club.logoBase64 ? (
    <img src={club.logoBase64} alt={club.name} style={{ width: size, height: size, borderRadius: size * 0.25, objectFit: 'cover' }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: size * 0.25, background: club.color, flexShrink: 0 }} />
  );
}

// ─── Opponent searchable input ────────────────────────────────────────────────

function OpponentInput({ value, onChange, clubs, t }: {
  value: string;
  onChange: (v: string) => void;
  clubs: Club[];
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [focused, setFocused] = useState(false);

  const query = value.toLowerCase();
  const filtered = clubs.filter(c => c.name.toLowerCase().includes(query));
  const showDropdown = focused && filtered.length > 0 && value !== filtered[0]?.name;
  const selectedClub = clubs.find(c => c.name === value);

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
        {t('match.create.opponent')}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 10,
        border: focused ? '2px solid var(--primary)' : '1.5px solid var(--border)',
        background: 'var(--bg)', boxSizing: 'border-box',
        transition: 'border .15s',
      }}>
        {selectedClub && <ClubBadge club={selectedClub} size={22} />}
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={t('match.create.opponentPlaceholder')}
          style={{
            flex: 1, border: 'none', outline: 'none', fontSize: 15,
            background: 'transparent', color: 'var(--text)', padding: 0,
          }}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            aria-label="Clear"
            style={{ fontSize: 16, color: 'var(--text-muted)', background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer' }}
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20,
          marginTop: 4, borderRadius: 12, background: 'var(--surface)',
          boxShadow: '0 4px 16px rgba(0,0,0,.15)', border: '1px solid var(--border)',
          maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.map(club => (
            <button
              key={club.id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(club.name); setFocused(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px', border: 'none',
                background: 'transparent', cursor: 'pointer', textAlign: 'left',
                fontSize: 14, fontWeight: 600, color: 'var(--text)',
              }}
            >
              <ClubBadge club={club} size={24} />
              {club.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CreateMatchPage ────────────────────────────────────────────────────────────

export function CreateMatchPage({ navigate }: Props) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();
  const clubs = useClubsStore(s => s.clubs);
  const createMatch = useMatchesStore(s => s.createMatch);
  const allMatches = useMatchesStore(s => s.matches);

  // Detekce domovského klubu (myClub = první s ageCategories > 0)
  const myClub = useMemo(
    () => clubs.find(c => (c.ageCategories ?? []).length > 0),
    [clubs],
  );
  const opponentClubs = useMemo(
    () => clubs.filter(c => c.id !== myClub?.id),
    [clubs, myClub],
  );

  const [step, setStep] = useState(0);

  // Step 0: basic info
  const [opponent, setOpponent] = useState('');
  const [isHome, setIsHome] = useState(true);
  const [date, setDate] = useState(todayStr());
  const [kickoffTime, setKickoffTime] = useState(nowTimeStr());
  const [competition, setCompetition] = useState('');
  const [periods, setPeriods] = useState(2);
  const [periodDuration, setPeriodDuration] = useState(20);
  const durationMinutes = periods * periodDuration;
  // Auto-select myClub, fallback to first club
  const [selectedClubId, setSelectedClubId] = useState<string>(myClub?.id ?? clubs[0]?.id ?? '');
  const [selectedCategory, setSelectedCategory] = useState<AgeCategory | null>(null);
  // Step 1: lineup
  const [lineup, setLineup] = useState<MatchLineupPlayer[]>([]);
  const [subInterval, setSubInterval] = useState(15);
  const [subCount, setSubCount] = useState(2);

  // When club is selected, populate default lineup
  const selectedClub = clubs.find(c => c.id === selectedClubId);

  // Kategorie zvoleného klubu (pro filtrování hráčů)
  const clubCategories = useMemo(() => {
    if (!selectedClub) return [];
    return selectedClub.ageCategories ?? [];
  }, [selectedClub]);

  const initLineupFromClub = (club: Club, category?: AgeCategory | null) => {
    // Preferuj nový roster (players) nad starým (defaultPlayers)
    let rosterPlayers: Array<{ name: string; jerseyNumber: number }>;
    const activePlayers = (club.players ?? []).filter(p => p.active);

    if (activePlayers.length > 0 && category) {
      // Filtruj hráče podle kategorie
      rosterPlayers = activePlayers
        .filter(p => p.ageCategory === category)
        .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber }));
    } else if (activePlayers.length > 0) {
      rosterPlayers = activePlayers.map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber }));
    } else {
      rosterPlayers = [...(club.defaultPlayers ?? [])];
    }
    const sorted = rosterPlayers.sort((a, b) => a.jerseyNumber - b.jerseyNumber);
    const maxStarters = 11;
    const newLineup: MatchLineupPlayer[] = sorted.map((p, idx) => ({
      playerId: `${club.id}-${p.jerseyNumber}`,
      jerseyNumber: p.jerseyNumber,
      name: p.name,
      isStarter: idx < maxStarters,
      substituteOrder: idx >= maxStarters ? idx - maxStarters + 1 : 0,
    }));
    setLineup(newLineup);
  };

  const handleClubChange = (clubId: string) => {
    setSelectedClubId(clubId);
    setSelectedCategory(null);
    const club = clubs.find(c => c.id === clubId);
    if (club) initLineupFromClub(club);
  };

  const handleCategoryChange = (cat: AgeCategory) => {
    setSelectedCategory(cat);
    if (selectedClub) initLineupFromClub(selectedClub, cat);
  };

  const toggleStarter = (playerId: string) => {
    setLineup(prev => {
      const starters = prev.filter(p => p.isStarter);
      const player = prev.find(p => p.playerId === playerId);
      if (!player) return prev;

      if (player.isStarter) {
        // Move to bench
        const benchers = prev.filter(p => !p.isStarter).length;
        return prev.map(p => p.playerId === playerId
          ? { ...p, isStarter: false, substituteOrder: benchers + 1 }
          : p
        );
      } else {
        // Move to starters (if < 11)
        if (starters.length >= 11) return prev;
        return prev.map(p => p.playerId === playerId
          ? { ...p, isStarter: true, substituteOrder: 0 }
          : p
        );
      }
    });
  };

  const moveSubOrder = (playerId: string, dir: -1 | 1) => {
    setLineup(prev => {
      const benchers = prev.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);
      const idx = benchers.findIndex(p => p.playerId === playerId);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= benchers.length) return prev;
      // Swap orders
      const [a, b] = [benchers[idx], benchers[newIdx]];
      return prev.map(p => {
        if (p.playerId === a.playerId) return { ...p, substituteOrder: b.substituteOrder };
        if (p.playerId === b.playerId) return { ...p, substituteOrder: a.substituteOrder };
        return p;
      });
    });
  };

  const step0Valid = opponent.trim().length > 0 && date && kickoffTime;
  const step1Valid = true; // sestava je volitelná — trenér ji doplní později

  const handleCreate = () => {
    if (!step1Valid) return;
    const subSettings: SubstitutionSettings | undefined = lineup.some(p => !p.isStarter)
      ? { intervalMinutes: subInterval, playersAtOnce: subCount }
      : undefined;

    createMatch({
      clubId: selectedClubId,
      clubName: selectedClub?.name,
      opponent: opponent.trim(),
      isHome,
      date,
      kickoffTime,
      competition: competition.trim(),
      durationMinutes,
      periods,
      periodDurationMinutes: periodDuration,
      lineup,
      substitutionSettings: subSettings,
    });
    useToastStore.getState().show('success', t('toast.matchCreated'));
    navigate({ name: 'match-list' });
  };

  const starters = lineup.filter(p => p.isStarter).sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const benchers = lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);

  // ─── Step 0: Basic info ────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.basicInfo')}</h3>

        {/* ── Soupeř: searchable input with dropdown ── */}
        <OpponentInput
          value={opponent}
          onChange={setOpponent}
          clubs={opponentClubs}
          t={t}
        />

        {/* Home/Away — subtle toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('match.create.wherePlay')}
          </span>
          <div style={{
            display: 'inline-flex', background: 'var(--surface-var)', borderRadius: 8, overflow: 'hidden',
          }}>
            {[{ v: true, label: t('match.create.homeBtn') }, { v: false, label: t('match.create.awayBtn') }].map(({ v, label }) => (
              <button
                key={String(v)}
                onClick={() => setIsHome(v)}
                style={{
                  padding: '6px 14px', fontWeight: 600, fontSize: 13,
                  background: isHome === v ? 'var(--primary)' : 'transparent',
                  color: isHome === v ? '#fff' : 'var(--text-muted)',
                  borderRadius: isHome === v ? 8 : 0,
                  transition: 'all .15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('match.create.date')}</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                border: '1.5px solid var(--border)', fontSize: 14,
                background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('match.create.kickoff')}</label>
            <input
              type="time"
              value={kickoffTime}
              onChange={e => setKickoffTime(e.target.value)}
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                border: '1.5px solid var(--border)', fontSize: 14,
                background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('match.create.competition')}
          </label>
          <input
            type="text"
            value={competition}
            onChange={e => setCompetition(e.target.value)}
            placeholder={t('match.create.competitionPlaceholder')}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1.5px solid var(--border)', fontSize: 14,
              background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Match settings — halves & duration */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.settings')}</h3>

        {/* Halves: 1 or 2 */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            {t('match.create.periodCount')}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2].map(n => (
              <button
                key={n}
                onClick={() => setPeriods(n)}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 800, fontSize: 15,
                  background: periods === n ? 'var(--primary)' : 'var(--surface-var)',
                  color: periods === n ? '#fff' : 'var(--text)',
                  border: periods === n ? '2px solid var(--primary)' : '2px solid var(--border)',
                  transition: 'all .15s',
                }}
              >
                {n === 1 ? t('match.create.periodLabel1Short') : t('match.create.periodLabel2Short')}
              </button>
            ))}
          </div>
        </div>

        {/* Period duration — slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('match.create.periodDuration')}
            </label>
            <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--primary)' }}>
              {periodDuration}'
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={45}
            step={1}
            value={periodDuration}
            onChange={e => setPeriodDuration(Number(e.target.value))}
            style={{
              width: '100%', height: 6, borderRadius: 3,
              accentColor: 'var(--primary)',
              cursor: 'pointer',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            <span>5'</span>
            <span>45'</span>
          </div>
        </div>

        {/* Total duration summary */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px 14px', borderRadius: 10, background: 'var(--primary-light)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
            {periods === 1 ? `${periodDuration}` : `${periods}×${periodDuration}'`} = {durationMinutes} {t('common.min')}
          </span>
        </div>
      </div>

      {/* ── Náš klub — auto-selected, kompaktní zobrazení ── */}
      {selectedClub ? (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: '16px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.ourClub')}</h3>

          {/* Vybraný klub — row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
            borderRadius: 12, border: '2px solid var(--primary)', background: 'var(--primary-light)',
          }}>
            <ClubBadge club={selectedClub} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{selectedClub.name}</div>
              {selectedClub === myClub && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--primary)',
                }}>
                  {t('clubs.myClubBadge')}
                </span>
              )}
            </div>
            <span style={{ color: 'var(--primary)', fontSize: 20, flexShrink: 0 }}>✓</span>
          </div>

          {/* Pokud má víc klubů, možnost přepnout */}
          {clubs.length > 1 && (
            <details style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                {t('match.create.changeClub')}
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {clubs.filter(c => c.id !== selectedClubId).map(club => (
                  <button
                    key={club.id}
                    onClick={() => handleClubChange(club.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                      borderRadius: 10, border: '1.5px solid var(--border)',
                      background: 'var(--bg)', textAlign: 'left', cursor: 'pointer',
                    }}
                  >
                    <ClubBadge club={club} size={28} />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{club.name}</span>
                  </button>
                ))}
              </div>
            </details>
          )}

          {/* ── Výběr kategorie hráčů ── */}
          {clubCategories.length > 1 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                {t('match.create.selectCategory')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {clubCategories.map(cat => {
                  const isActive = selectedCategory === cat;
                  const playerCount = (selectedClub.players ?? []).filter(p => p.ageCategory === cat && p.active).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => handleCategoryChange(cat)}
                      style={{
                        padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                        background: isActive ? 'var(--primary)' : 'var(--surface-var)',
                        color: isActive ? '#fff' : 'var(--text)',
                        border: isActive ? '2px solid var(--primary)' : '2px solid var(--border)',
                        cursor: 'pointer', transition: 'all .15s',
                      }}
                    >
                      {cat} ({playerCount})
                    </button>
                  );
                })}
              </div>
              {!selectedCategory && (
                <p style={{ fontSize: 11, color: '#E65100', margin: '6px 0 0', fontWeight: 600 }}>
                  {t('match.create.categoryHint')}
                </p>
              )}
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            {t('match.create.clubRosterInfo')}
          </p>
        </div>
      ) : clubs.length === 0 ? (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: '16px',
          fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6,
        }}>
          {t('match.create.noClubInfo')}
        </div>
      ) : (
        /* Fallback: žádný myClub, ale jsou kluby → zobrazit seznam */
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.ourClub')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clubs.map(club => (
              <button
                key={club.id}
                onClick={() => handleClubChange(club.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 10, border: `2px solid ${selectedClubId === club.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedClubId === club.id ? 'var(--primary-light)' : 'var(--bg)',
                  textAlign: 'left',
                }}
              >
                <ClubBadge club={club} size={32} />
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{club.name}</span>
                {selectedClubId === club.id && <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontSize: 18 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Step 1: Lineup ───────────────────────────────────────────────────────

  // Previous matches for "copy lineup" (same club, sorted by date desc)
  const previousMatches = useMemo(() =>
    allMatches
      .filter(m => m.clubId === selectedClubId && m.lineup.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
    [allMatches, selectedClubId],
  );

  const copyLineupFromMatch = (sourceMatchId: string) => {
    const source = allMatches.find(m => m.id === sourceMatchId);
    if (!source) return;
    setLineup(source.lineup.map(p => ({ ...p })));
  };

  const renderStep1 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px' }}>
      {/* Copy lineup from previous match */}
      {previousMatches.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.copyLineup')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {previousMatches.map(m => (
              <button
                key={m.id}
                onClick={() => copyLineupFromMatch(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--bg)',
                  textAlign: 'left', cursor: 'pointer', width: '100%',
                }}
              >
                <span style={{ fontSize: 14 }}>📋</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    vs {m.opponent}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {m.date.split('-').reverse().join('.')} · {m.lineup.filter(p => p.isStarter).length} + {m.lineup.filter(p => !p.isStarter).length}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{t('match.create.useLineup')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Substitution assistant settings */}
      {benchers.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.subAssistant')}</h3>
          <Stepper label={t('match.create.subEvery')} value={subInterval} min={5} max={45} onChange={setSubInterval} unit={t('common.min')} />
          <div style={{ height: 1, background: 'var(--border)' }} />
          <Stepper label={t('match.create.playersAtOnce')} value={subCount} min={1} max={4} onChange={setSubCount} unit={subCount === 1 ? t('match.create.playerSingular') : t('match.create.playerPlural')} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            {t('match.create.subInfo', { interval: subInterval, count: subCount })}
          </p>
        </div>
      )}

      {/* Starters */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.startingLineup')}</h3>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
            background: starters.length === 11 ? '#E8F5E9' : '#FFF3E0',
            color: starters.length === 11 ? '#2E7D32' : '#E65100',
          }}>
            {starters.length}/11
          </span>
        </div>
        {starters.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            {t('match.create.startingEmpty')}
          </p>
        ) : (
          starters.map(p => (
            <div key={p.playerId} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8, background: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                {p.jerseyNumber}
              </div>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{p.name}</span>
              <button
                onClick={() => toggleStarter(p.playerId)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                  background: '#FFEBEE', color: '#C62828',
                }}
              >
                {t('match.create.toBench')}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Bench / substitutes */}
      {(benchers.length > 0 || lineup.length === 0) && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.benchTitle')}</h3>
          {benchers.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              {t('match.create.benchEmpty')}
            </p>
          ) : (
            benchers.map((p, idx) => (
              <div key={p.playerId} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderBottom: idx < benchers.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, background: 'var(--surface-var)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0,
                }}>
                  {idx + 1}
                </div>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, background: 'var(--surface-var)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: 'var(--text)', flexShrink: 0,
                }}>
                  {p.jerseyNumber}
                </div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => moveSubOrder(p.playerId, -1)}
                    disabled={idx === 0}
                    style={{
                      width: 28, height: 28, borderRadius: 7, background: 'var(--surface-var)',
                      fontSize: 14, color: idx === 0 ? 'var(--text-muted)' : 'var(--text)', fontWeight: 700,
                    }}
                  >▲</button>
                  <button
                    onClick={() => moveSubOrder(p.playerId, 1)}
                    disabled={idx === benchers.length - 1}
                    style={{
                      width: 28, height: 28, borderRadius: 7, background: 'var(--surface-var)',
                      fontSize: 14, color: idx === benchers.length - 1 ? 'var(--text-muted)' : 'var(--text)', fontWeight: 700,
                    }}
                  >▼</button>
                  <button
                    onClick={() => toggleStarter(p.playerId)}
                    disabled={starters.length >= 11}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                      background: starters.length >= 11 ? 'var(--surface-var)' : 'var(--primary-light)',
                      color: starters.length >= 11 ? 'var(--text-muted)' : 'var(--primary)',
                    }}
                  >
                    {t('match.create.toStart')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Manual player add (if no club or want to add more) */}
      <ManualPlayerAdd
        t={t}
        onAdd={(name, jersey) => {
          setLineup(prev => [...prev, {
            playerId: `manual-${Date.now()}-${jersey}`,
            jerseyNumber: jersey,
            name,
            isStarter: prev.filter(p => p.isStarter).length < 11,
            substituteOrder: prev.filter(p => !p.isStarter).length + 1,
          }]);
        }}
      />
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', width: '100%', maxWidth: isDesktop ? 800 : undefined, margin: isDesktop ? '0 auto' : undefined, boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 12px', background: 'var(--surface)',
        boxShadow: '0 1px 0 var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <button
            onClick={() => step === 0 ? navigate({ name: 'match-list' }) : setStep(0)}
            style={{ background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 14 }}
          >
            ← {step === 0 ? t('match.create.cancel') : t('match.create.back')}
          </button>
          <h1 style={{ fontWeight: 800, fontSize: 18, flex: 1 }}>
            {step === 0 ? t('match.create.newMatch') : t('match.create.lineupTitle')}
          </h1>
        </div>
        {/* Step indicators */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[t('match.create.stepBasicInfo'), t('match.create.stepLineup')].map((_label, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 4,
              background: i <= step ? 'var(--primary)' : 'var(--border)',
            }} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>
        {step === 0 ? renderStep0() : renderStep1()}
      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '12px 16px', background: 'var(--surface)',
        boxShadow: '0 -1px 0 var(--border)',
        maxWidth: 480, margin: '0 auto',
      }}>
        {step === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => { setStep(1); if (selectedClub && lineup.length === 0) initLineupFromClub(selectedClub, selectedCategory); }}
              disabled={!step0Valid}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 16,
                background: step0Valid ? 'var(--primary)' : 'var(--border)', color: step0Valid ? '#fff' : 'var(--text-muted)',
              }}
            >
              {t('match.create.continueLineup')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!step0Valid}
              style={{
                width: '100%', padding: '10px', borderRadius: 12, fontWeight: 600, fontSize: 13,
                background: 'transparent', color: step0Valid ? 'var(--text-muted)' : 'var(--border)',
                border: 'none', cursor: step0Valid ? 'pointer' : 'default',
              }}
            >
              {t('match.create.skipLineup')}
            </button>
          </div>
        ) : (
          <button
            onClick={handleCreate}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 16,
              background: 'var(--primary)', color: '#fff',
            }}
          >
            {t('match.create.createMatch')}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Manual player add ────────────────────────────────────────────────────────

function ManualPlayerAdd({ onAdd, t }: { onAdd: (name: string, jersey: number) => void; t: (key: string, params?: Record<string, string | number>) => string }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');

  const handleAdd = () => {
    const j = parseInt(jersey);
    if (!name.trim() || isNaN(j) || j < 1 || j > 99) return;
    onAdd(name.trim(), j);
    setName('');
    setJersey('');
  };

  return (
    <div style={{
      borderRadius: 14, padding: '14px 16px',
      border: expanded ? '2px solid var(--primary)' : '2px dashed var(--border)',
      background: expanded ? 'var(--surface)' : 'transparent',
      transition: 'all .15s',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontWeight: 700, fontSize: 14, width: '100%',
          color: expanded ? 'var(--primary)' : 'var(--text-muted)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        <span style={{ fontSize: 16 }}>👤</span>
        {t('match.create.addPlayerManual')}
        <span style={{ fontSize: 14, fontWeight: 800 }}>{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('match.create.playerNamePlaceholder')}
            aria-label={t('match.create.playerNamePlaceholder')}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)',
              fontSize: 14, background: 'var(--bg)', color: 'var(--text)',
            }}
          />
          <input
            type="number"
            value={jersey}
            onChange={e => setJersey(e.target.value)}
            placeholder="#"
            aria-label="Jersey number"
            min={1} max={99}
            style={{
              width: 52, padding: '10px 8px', borderRadius: 10, border: '1.5px solid var(--border)',
              fontSize: 14, background: 'var(--bg)', color: 'var(--text)', textAlign: 'center',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!name.trim() || !jersey}
            style={{
              padding: '10px 16px', borderRadius: 12, fontWeight: 800, fontSize: 16,
              background: 'var(--primary)', color: '#fff', opacity: (!name.trim() || !jersey) ? 0.4 : 1,
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
