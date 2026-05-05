import { useState, useMemo } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useClubsStore } from '../../store/clubs.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { TEAM_MATCH_FORMATS, createDefaultSubMatches } from '../../modules/tennis/utils/tennis-team';
import { useI18n } from '../../i18n';
import type { MatchLineupPlayer, SubstitutionSettings, MatchFormat } from '../../types/match.types';
import { MATCH_FORMATS, formatToStarterCount } from '../../types/match.types';
import type { Club, AgeCategory } from '../../types/club.types';
import { useToastStore } from '../../store/toast.store';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { OpponentAutocomplete } from '../../components/clubs/OpponentAutocomplete';
import { PageHeader } from '../../components/ui';
import { radius, spacing as sp } from '../../theme/tokens';
import { useUnsavedFormGuard } from '../../hooks/useUnsavedFormGuard';

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

// ─── Attendance chips ─────────────────────────────────────────────────────────
// Attendance chips removed from create flow — trenér nasype hráče až na místě
// nebo pošle nominaci přes WhatsApp (viz MatchDetailPage).

// ─── Club logo/color badge ────────────────────────────────────────────────────
function ClubBadge({ club, size = 32 }: { club: Club; size?: number }) {
  return club.logoBase64 ? (
    <img src={club.logoBase64} alt={club.name} style={{ width: size, height: size, borderRadius: size * 0.25, objectFit: 'cover' }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: size * 0.25, background: club.color, flexShrink: 0 }} />
  );
}

// ─── CreateMatchPage ────────────────────────────────────────────────────────────

export function CreateMatchPage({ navigate }: Props) {
  const { t } = useI18n();
  const { isDesktop } = useLayoutMode();
  const allClubs = useClubsStore(s => s.clubs);
  const createMatch = useMatchesStore(s => s.createMatch);
  const allMatchesRaw = useMatchesStore(s => s.matches);
  // Sport mode — default z user preferences (onboarding zvolený sport)
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const isTennis = preferredSport === 'tennis';

  // Filtruj kluby a historii podle aktuálního sportu (oddělené moduly).
  const clubs = useMemo(
    () => allClubs.filter(c => (c.sport ?? 'football') === preferredSport),
    [allClubs, preferredSport],
  );
  const allMatches = useMemo(
    () => allMatchesRaw.filter(m => (m.sport ?? 'football') === preferredSport),
    [allMatchesRaw, preferredSport],
  );

  // Detekce domovského klubu (myClub = první s ageCategories > 0)
  const myClub = useMemo(
    () => clubs.find(c => (c.ageCategories ?? []).length > 0),
    [clubs],
  );

  // Smart defaults: pre-fill from the most recent match
  const lastMatch = useMemo(() => {
    // Defensive: filter out nullish entries, fallback na '' pro missing createdAt
    const valid = allMatches.filter(m => m != null);
    if (valid.length === 0) return null;
    return [...valid].sort((a, b) => {
      const ac = a?.createdAt ?? '';
      const bc = b?.createdAt ?? '';
      return bc.localeCompare(ac);
    })[0];
  }, [allMatches]);

  // Historie zadaných hodnot — nabídneme ve <datalist> jako našeptávač.
  // Uživatel tipicky hraje opakovaně na stejných místech / stejné soutěže.
  const venueSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMatches) {
      if (m.venue && m.venue.trim()) set.add(m.venue.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allMatches]);
  const competitionSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMatches) {
      if (m.competition && m.competition.trim()) set.add(m.competition.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allMatches]);

  const [step, setStep] = useState(0);

  // Tennis: typ zápasu (singles vs družstvo)
  const [tennisMatchType, setTennisMatchType] = useState<'single' | 'team'>('single');
  const [teamFormatId, setTeamFormatId] = useState<string>('4s-2d');

  // Step 0: basic info
  const [opponent, setOpponent] = useState('');
  const [opponentCatalogId, setOpponentCatalogId] = useState<string | undefined>();
  const [isHome, setIsHome] = useState(true);
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState(todayStr());
  const [kickoffTime, setKickoffTime] = useState(nowTimeStr());

  // Audit 2026-04-29 (P1.6): browser-level guard proti ztrátě rozdělaného
  // formuláře. Pokud user vyplnil alespoň soupeře, varujeme při close tab /
  // refresh / browser back.
  useUnsavedFormGuard(opponent.trim().length > 0);
  const [competition, setCompetition] = useState(lastMatch?.competition ?? '');
  const [periods, setPeriods] = useState(lastMatch?.periods ?? 2);
  const [periodDuration, setPeriodDuration] = useState(lastMatch?.periodDurationMinutes ?? 20);
  const [matchFormat, setMatchFormat] = useState<MatchFormat>(lastMatch?.matchFormat ?? '7+1');
  const durationMinutes = periods * periodDuration;
  const starterCount = formatToStarterCount(matchFormat);
  // Auto-select myClub, fallback to first club
  const [selectedClubId, setSelectedClubId] = useState<string>(myClub?.id ?? clubs[0]?.id ?? '');
  const [selectedCategory, setSelectedCategory] = useState<AgeCategory | null>(null);
  const [selectedSquad, setSelectedSquad] = useState<string | null>(null);
  // Extra kategorie — hráči z mladších (nebo jiných) kategorií, které chce trenér zahrnout
  const [extraCategories, setExtraCategories] = useState<AgeCategory[]>([]);
  const [trackAssists, setTrackAssists] = useState(lastMatch?.trackAssists ?? true);
  // Step 1: lineup
  const [lineup, setLineup] = useState<MatchLineupPlayer[]>([]);
  const [useSubAssistant, setUseSubAssistant] = useState(true);
  const [subInterval, setSubInterval] = useState(5);
  const [subCount, setSubCount] = useState(2);

  // When club is selected, populate default lineup
  const selectedClub = clubs.find(c => c.id === selectedClubId);

  // Kategorie zvoleného klubu (pro filtrování hráčů)
  const clubCategories = useMemo(() => {
    if (!selectedClub) return [];
    return selectedClub.ageCategories ?? [];
  }, [selectedClub]);

  const initLineupFromClub = (
    club: Club,
    category?: AgeCategory | null,
    squad?: string | null,
    extras?: AgeCategory[],
  ) => {
    const activePlayers = (club.players ?? []).filter(p => p.active);

    let rosterPlayers: Array<{ id: string; name: string; jerseyNumber: number; guestCategory?: string }>;
    if (activePlayers.length > 0 && category) {
      let filtered = activePlayers.filter(p => p.ageCategory === category);
      if (squad) filtered = filtered.filter(p => p.squad === squad);
      rosterPlayers = filtered.map(p => ({ id: p.id, name: p.name, jerseyNumber: p.jerseyNumber }));
      // Přidat hráče z extra kategorií (označené jako hosté ze své domovské kategorie)
      if (extras && extras.length > 0) {
        const extraSet = new Set(extras);
        const extraPlayers = activePlayers
          .filter(p => p.ageCategory && extraSet.has(p.ageCategory as AgeCategory))
          .map(p => ({ id: p.id, name: p.name, jerseyNumber: p.jerseyNumber, guestCategory: p.ageCategory }));
        rosterPlayers = [...rosterPlayers, ...extraPlayers];
      }
    } else if (activePlayers.length > 0) {
      rosterPlayers = activePlayers.map(p => ({ id: p.id, name: p.name, jerseyNumber: p.jerseyNumber }));
    } else {
      // Legacy fallback — `defaultPlayers` už nepoužíváme. Pokud klub nemá žádné
      // hráče, necháme lineup prázdný; user musí nejdřív přidat hráče do klubu.
      // (Dřívější fallback generoval synthetic ID "default-N" co nikdy nematchl
      //  ClubPlayer → rozbíjel statistiky/ratings.)
      rosterPlayers = [];
    }
    const sorted = rosterPlayers.sort((a, b) => a.jerseyNumber - b.jerseyNumber);
    const maxStarters = starterCount;
    const newLineup: MatchLineupPlayer[] = sorted.map((p, idx) => ({
      playerId: p.id,
      jerseyNumber: p.jerseyNumber,
      name: p.name,
      isStarter: idx < maxStarters,
      substituteOrder: idx >= maxStarters ? idx - maxStarters + 1 : 0,
      ...(p.guestCategory ? { guestCategory: p.guestCategory } : {}),
    }));
    setLineup(newLineup);
  };

  const handleClubChange = (clubId: string) => {
    setSelectedClubId(clubId);
    setSelectedCategory(null);
    setSelectedSquad(null);
    setExtraCategories([]);
    const club = clubs.find(c => c.id === clubId);
    if (club) initLineupFromClub(club);
  };

  const handleCategoryChange = (cat: AgeCategory) => {
    setSelectedCategory(cat);
    setSelectedSquad(null);
    // reset extras — mohou obsahovat novou primární kategorii
    const newExtras = extraCategories.filter(c => c !== cat);
    setExtraCategories(newExtras);
    if (selectedClub) initLineupFromClub(selectedClub, cat, null, newExtras);

    // Smart defaults podle kategorie — najdi poslední zápas v této kategorii
    // a nastav format/délku periody podle něj (U9 má obvykle 5+1, Muži 11+1 atd.)
    const lastInCategory = [...allMatches]
      .filter(m => m != null && m.ageCategory === cat)
      .sort((a, b) => {
        const ac = a?.createdAt ?? '';
        const bc = b?.createdAt ?? '';
        return bc.localeCompare(ac);
      })[0];
    if (lastInCategory) {
      if (lastInCategory.matchFormat) setMatchFormat(lastInCategory.matchFormat);
      if (lastInCategory.periods) setPeriods(lastInCategory.periods);
      if (lastInCategory.periodDurationMinutes) setPeriodDuration(lastInCategory.periodDurationMinutes);
      if (lastInCategory.competition) setCompetition(lastInCategory.competition);
    }
  };

  const handleSquadChange = (squad: string | null) => {
    setSelectedSquad(squad);
    if (selectedClub) initLineupFromClub(selectedClub, selectedCategory, squad, extraCategories);
  };

  const toggleExtraCategory = (cat: AgeCategory) => {
    const next = extraCategories.includes(cat)
      ? extraCategories.filter(c => c !== cat)
      : [...extraCategories, cat];
    setExtraCategories(next);
    if (selectedClub) initLineupFromClub(selectedClub, selectedCategory, selectedSquad, next);
  };

  // Dostupné squads v rámci vybrané kategorie
  const availableSquads = useMemo(() => {
    if (!selectedClub || !selectedCategory) return [];
    const squads = new Set<string>();
    (selectedClub.players ?? [])
      .filter(p => p.active && p.ageCategory === selectedCategory && p.squad)
      .forEach(p => { if (p.squad) squads.add(p.squad); });
    return Array.from(squads).sort();
  }, [selectedClub, selectedCategory]);

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
        if (starters.length >= starterCount) return prev;
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
    const subSettings: SubstitutionSettings | undefined = useSubAssistant && lineup.some(p => !p.isStarter)
      ? { intervalMinutes: subInterval, playersAtOnce: subCount }
      : undefined;

    // Pokud je tennis team, vytvoř default sub-matches dle formátu
    const teamFormat = isTennis && tennisMatchType === 'team'
      ? TEAM_MATCH_FORMATS.find(f => f.id === teamFormatId) ?? TEAM_MATCH_FORMATS[0]
      : null;
    const subMatches = teamFormat ? createDefaultSubMatches(teamFormat) : undefined;

    createMatch({
      sport: preferredSport,
      matchType: isTennis ? tennisMatchType : 'single',
      subMatches,
      officialResultsNote: isTennis && tennisMatchType === 'team'
        ? 'Výsledky jsou orientační. Oficiální výsledky zveřejněny na ČTenis.'
        : undefined,
      clubId: selectedClubId,
      clubName: selectedClub?.name,
      opponent: opponent.trim(),
      opponentCatalogId,
      isHome,
      venue: venue.trim() || undefined,
      date,
      kickoffTime,
      competition: competition.trim(),
      durationMinutes,
      periods,
      periodDurationMinutes: periodDuration,
      matchFormat,
      ageCategory: selectedCategory ?? undefined,
      squad: selectedSquad ?? undefined,
      lineup,
      substitutionSettings: subSettings,
      trackAssists,
    });
    useToastStore.getState().show('success', t('toast.matchCreated'));
    navigate({ name: 'match-list' });
  };

  const starters = lineup.filter(p => p.isStarter).sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const benchers = lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);

  // ─── Step 0: Basic info ────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px' }}>
      {/* Tennis: typ zápasu — singles vs. družstvo */}
      {isTennis && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.tennisTypeTitle')}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['single', 'team'] as const).map(type => {
              const isActive = tennisMatchType === type;
              return (
                <button
                  key={type}
                  onClick={() => setTennisMatchType(type)}
                  style={{
                    flex: 1, padding: '14px 10px', borderRadius: 12, fontWeight: 700, fontSize: 13,
                    background: isActive ? 'var(--primary)' : 'var(--surface-var)',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    border: isActive ? 'none' : '1.5px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{type === 'single' ? '🎾' : '👥'}</span>
                  <span>{t(type === 'single' ? 'match.create.tennisSingle' : 'match.create.tennisTeam')}</span>
                </button>
              );
            })}
          </div>
          {tennisMatchType === 'team' && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                {t('match.create.teamFormat')}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TEAM_MATCH_FORMATS.map(fmt => {
                  const isActive = teamFormatId === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => setTeamFormatId(fmt.id)}
                      style={{
                        padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                        background: isActive ? 'var(--primary-light)' : 'var(--surface-var)',
                        color: isActive ? 'var(--primary)' : 'var(--text)',
                        border: `1.5px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {fmt.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.4 }}>
                {t('match.create.teamFormatHint')}
              </p>
            </div>
          )}
        </div>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.basicInfo')}</h3>

        {/* ── Soupeř: autocomplete z katalogu klubů ── */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('match.create.opponent')}
          </label>
          <OpponentAutocomplete
            value={opponent}
            onChange={(v) => { setOpponent(v); setOpponentCatalogId(undefined); }}
            onSelect={(club) => { setOpponent(club.name); setOpponentCatalogId(club.id); }}
            placeholder={t('match.create.opponentPlaceholder')}
            label={t('match.create.opponent')}
            sport={preferredSport}
          />
        </div>

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

        {/* Venue */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            📍 {t('match.create.venue')}
          </label>
          <input
            type="text"
            value={venue}
            onChange={e => setVenue(e.target.value)}
            placeholder={t('match.create.venuePlaceholder')}
            list="torq-venue-history"
            autoComplete="off"
            style={{
              width: '100%', padding: '10px', borderRadius: 10,
              border: '1.5px solid var(--border)', fontSize: 14,
              background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            }}
          />
          {venueSuggestions.length > 0 && (
            <datalist id="torq-venue-history">
              {venueSuggestions.map(v => <option key={v} value={v} />)}
            </datalist>
          )}
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
            list="torq-competition-history"
            autoComplete="off"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1.5px solid var(--border)', fontSize: 14,
              background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            }}
          />
          {competitionSuggestions.length > 0 && (
            <datalist id="torq-competition-history">
              {competitionSuggestions.map(c => <option key={c} value={c} />)}
            </datalist>
          )}
        </div>
      </div>

      {/* Match settings — format, halves & duration. Tenis skrývá football-specific fields. */}
      {!isTennis && (
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.settings')}</h3>

        {/* Formát hry (X+1) */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            {t('match.create.format') || 'Formát hry'}
            <span style={{ fontWeight: 500, marginLeft: 6 }}>
              ({starterCount} {t('match.create.startersLabel') || 'v základu'})
            </span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MATCH_FORMATS.map(fmt => (
              <button
                key={fmt}
                onClick={() => setMatchFormat(fmt)}
                style={{
                  padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                  background: matchFormat === fmt ? 'var(--primary)' : 'var(--surface-var)',
                  color: matchFormat === fmt ? '#fff' : 'var(--text-muted)',
                  border: `1.5px solid ${matchFormat === fmt ? 'var(--primary)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>

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

        {/* Period duration — stepper */}
        <Stepper
          value={periodDuration}
          onChange={setPeriodDuration}
          min={5}
          max={45}
          label={t('match.create.periodDuration')}
          unit="min"
        />

        {/* Total duration summary */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px 14px', borderRadius: 10, background: 'var(--primary-light)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
            {periods === 1 ? `${periodDuration}` : `${periods}×${periodDuration}'`} = {durationMinutes} {t('common.min')}
          </span>
        </div>

        {/* Match options toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('match.create.trackAssists')}
            </label>
            <button
              onClick={() => setTrackAssists(v => !v)}
              style={{
                width: 44, height: 24, borderRadius: 12, padding: 2,
                background: trackAssists ? 'var(--primary)' : 'var(--border)',
                cursor: 'pointer', border: 'none',
                display: 'flex', alignItems: 'center',
                justifyContent: trackAssists ? 'flex-end' : 'flex-start',
                transition: 'background .2s',
              }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('match.create.subAssistantLabel')}
            </label>
            <button
              onClick={() => setUseSubAssistant(v => !v)}
              style={{
                width: 44, height: 24, borderRadius: 12, padding: 2,
                background: useSubAssistant ? 'var(--primary)' : 'var(--border)',
                cursor: 'pointer', border: 'none',
                display: 'flex', alignItems: 'center',
                justifyContent: useSubAssistant ? 'flex-end' : 'flex-start',
                transition: 'background .2s',
              }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            </button>
          </div>
        </div>
      </div>
      )}

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
                <p style={{ fontSize: 11, color: 'var(--warning)', margin: '6px 0 0', fontWeight: 600 }}>
                  {t('match.create.categoryHint')}
                </p>
              )}
            </div>
          )}

          {/* ── Extra kategorie — hráči z jiných věkových kategorií (hosté) ── */}
          {selectedCategory && clubCategories.filter(c => c !== selectedCategory).length > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                {t('match.create.extraCategoriesLabel')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {clubCategories.filter(c => c !== selectedCategory).map(cat => {
                  const isActive = extraCategories.includes(cat);
                  const playerCount = (selectedClub.players ?? []).filter(p => p.ageCategory === cat && p.active).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleExtraCategory(cat)}
                      style={{
                        padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                        background: isActive ? 'var(--primary-light, rgba(26,35,126,.12))' : 'transparent',
                        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                        border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                        cursor: 'pointer', transition: 'all .15s',
                      }}
                    >
                      {isActive ? '✓ ' : '+ '}{cat} ({playerCount})
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                {t('match.create.extraCategoriesHint')}
              </p>
            </div>
          )}

          {/* ── Squad filter (A/B) — jen pokud kategorie obsahuje squad hráče ── */}
          {selectedCategory && availableSquads.length > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                {t('match.create.selectSquad') || 'Tým'}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[null, ...availableSquads].map(sq => {
                  const isActive = selectedSquad === sq;
                  const label = sq === null ? (t('match.create.squadAll') || 'Všichni') : sq;
                  const count = sq === null
                    ? (selectedClub.players ?? []).filter(p => p.active && p.ageCategory === selectedCategory).length
                    : (selectedClub.players ?? []).filter(p => p.active && p.ageCategory === selectedCategory && p.squad === sq).length;
                  return (
                    <button
                      key={sq ?? '__all'}
                      onClick={() => handleSquadChange(sq)}
                      style={{
                        padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                        background: isActive ? 'var(--primary)' : 'var(--surface-var)',
                        color: isActive ? '#fff' : 'var(--text)',
                        border: isActive ? '2px solid var(--primary)' : '2px solid var(--border)',
                        cursor: 'pointer', transition: 'all .15s',
                      }}
                    >
                      {label} ({count})
                    </button>
                  );
                })}
              </div>
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
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
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

      {/* Substitution assistant settings — only if enabled in step 0 */}
      {useSubAssistant && benchers.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('match.create.subAssistant')}</h3>
          <Stepper label={t('match.create.subEvery')} value={subInterval} min={1} max={45} onChange={setSubInterval} unit={t('common.min')} />
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
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>
            {t('match.create.startingLineup')}
            {/* Audit 2026-04-29 (P1.7): 0/8 vypadalo jako "musíš to dokončit",
                ale sestava je VOLITELNÁ. Označíme jako "volitelné" když prázdné. */}
            {starters.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 }}>
                ({t('match.create.lineupOptional')})
              </span>
            )}
          </h3>
          {/* Badge se ukazuje jen když má smysl — tj. user už začal plnit
              sestavu (>0). Pro prázdnou sestavu badge "0/8" matoucí. */}
          {starters.length > 0 && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
              background: starters.length === starterCount ? 'var(--success-light)' : 'var(--warning-light)',
              color: starters.length === starterCount ? 'var(--success)' : 'var(--warning)',
            }}>
              {starters.length}/{starterCount}
            </span>
          )}
        </div>
        {starters.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            {t('match.create.startingEmpty')}
          </p>
        ) : (
          starters.map(p => {
            const att = p.attendance ?? 'tentative';
            const isAbsent = att === 'absent';
            return (
              <div key={p.playerId} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
                opacity: isAbsent ? 0.5 : 1,
              }}>
                <input
                  type="number"
                  value={p.jerseyNumber || ''}
                  onChange={e => {
                    const num = parseInt(e.target.value) || 0;
                    setLineup(prev => prev.map(x => x.playerId === p.playerId ? { ...x, jerseyNumber: num } : x));
                  }}
                  style={{
                    width: 34, height: 34, borderRadius: 8, background: 'var(--primary)',
                    color: '#fff', fontSize: 13, fontWeight: 800, textAlign: 'center',
                    border: 'none', flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 100 }}>{p.name}</span>
                {/* Attendance chips schované — trenér na místě nasype kdo je. Nominace se
                    bude řešit samostatnou funkcí "Sdílet nominaci" (rodiče potvrdí dopředu). */}
                <button
                  onClick={() => toggleStarter(p.playerId)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 8,
                    background: 'var(--surface-var)', color: 'var(--text-muted)',
                  }}
                >
                  {t('match.create.toBench')}
                </button>
                <button
                  onClick={() => { const id = p.playerId; setLineup(prev => prev.filter(x => x.playerId !== id)); }}
                  style={{
                    width: 28, height: 28, borderRadius: 8, background: 'var(--danger-light)',
                    color: 'var(--danger)', fontSize: 12, fontWeight: 700,
                  }}
                >✕</button>
              </div>
            );
          })
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
            benchers.map((p, idx) => {
              const att = p.attendance ?? 'tentative';
              const isAbsent = att === 'absent';
              return (
              <div key={p.playerId} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderBottom: idx < benchers.length - 1 ? '1px solid var(--border)' : 'none',
                flexWrap: 'wrap',
                opacity: isAbsent ? 0.5 : 1,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, background: 'var(--surface-var)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0,
                }}>
                  {idx + 1}
                </div>
                <input
                  type="number"
                  value={p.jerseyNumber || ''}
                  onChange={e => {
                    const num = parseInt(e.target.value) || 0;
                    setLineup(prev => prev.map(x => x.playerId === p.playerId ? { ...x, jerseyNumber: num } : x));
                  }}
                  style={{
                    width: 34, height: 34, borderRadius: 8, background: 'var(--surface-var)',
                    color: 'var(--text)', fontSize: 13, fontWeight: 800, textAlign: 'center',
                    border: '1px solid var(--border)', flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 100 }}>{p.name}</span>
                {/* Attendance chips schované — trenér na místě nasype kdo je. Nominace se
                    bude řešit samostatnou funkcí "Sdílet nominaci" (rodiče potvrdí dopředu). */}
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
                    onClick={() => { const id = p.playerId; setLineup(prev => prev.filter(x => x.playerId !== id)); }}
                    style={{
                      width: 28, height: 28, borderRadius: 8, background: 'var(--danger-light)',
                      color: 'var(--danger)', fontSize: 12, fontWeight: 700,
                    }}
                  >✕</button>
                  <button
                    onClick={() => toggleStarter(p.playerId)}
                    disabled={starters.length >= starterCount}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                      background: starters.length >= starterCount ? 'var(--surface-var)' : 'var(--primary-light)',
                      color: starters.length >= starterCount ? 'var(--text-muted)' : 'var(--primary)',
                    }}
                  >
                    {t('match.create.toStart')}
                  </button>
                </div>
              </div>
              );
            })
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
      {/* Header with step indicator */}
      <div style={{
        background: 'var(--surface)',
        boxShadow: '0 1px 0 var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <PageHeader
          title={step === 0 ? t('match.create.newMatch') : t('match.create.lineupTitle')}
          backLabel={step === 0 ? t('match.create.cancel') : t('match.create.back')}
          onBack={() => step === 0 ? navigate({ name: 'match-list' }) : setStep(0)}
        />
        {/* Step indicators */}
        <div style={{ display: 'flex', gap: 6, padding: `0 ${sp.lg + 4}px ${sp.md}px` }}>
          {[t('match.create.stepBasicInfo'), t('match.create.stepLineup')].map((_label, i) => (
            <div key={i} style={{
              flex: 1,
              height: 4,
              borderRadius: radius.sm / 2,
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
