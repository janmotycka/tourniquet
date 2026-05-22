/**
 * QuickMatchSheet — formulář pro vytvoření rychlého zápasu.
 *
 * V Simple módu je tohle hlavní input point pro zápasy. Obsahuje:
 * - Input soupeře s autocomplete z historie
 * - Player editor (row-based: # | jméno | rok | ×) — konzistentní s
 *   AdminRosterSheet z turnaje (audit 2026-04-29)
 * - Tlačítko „Importovat z klubu" pokud je aktivní klub s hráči
 * - Squad picker (uložené party z minulých zápasů — Simple mode)
 * - Settings preview (poločasy, délka, formát)
 *
 * Audit 2026-04-29 (refaktor): místo textarea / chips picker použit
 * row-based pattern jako v AdminRosterSheet — uživatel vidí stejné UI
 * napříč aplikací (turnaj + zápas). Jméno povinné, dres a rok volitelné.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { useSimpleSquadsStore } from '../../store/simpleSquads.store';
import { useUnsavedFormGuard } from '../../hooks/useUnsavedFormGuard';
import { useMatchesStore } from '../../store/matches.store';
import { useClubsStore } from '../../store/clubs.store';
import { useToastStore } from '../../store/toast.store';
import type { SimpleSquad } from '../../types/simpleSquad.types';
import type { ClubPlayer } from '../../types/club.types';
import {
  SettingRow,
  ChipPair,
  CompactNumberInput,
  SettingsList,
  PageHeader,
} from '../ui';
import { generateId } from '../../utils/id';

/**
 * Audit 2026-04-24 (Honza): „McDonald's Cup má 10 min, ale app nabízí Poločas
 * po 30 min." Přidán preset picker — user si vybere délku (10/15/20/30 min)
 * a formu (1 nebo 2 periody). Default je 15 min bez poločasu.
 */
export interface QuickMatchPreset {
  /** Celková doba v minutách (součet period). */
  durationMinutes: number;
  /** Počet period (1 = bez poločasu, 2 = s poločasem). */
  periods: number;
  /** Fotbalový formát (3+1 mini, 4+1 florbal, 5+1, 7+1, 8+1, 11+1 velké hřiště). */
  matchFormat: '3+1' | '4+1' | '5+1' | '7+1' | '8+1' | '11+1';
  /** Lidský popisek pro diagnostiku. */
  label: string;
  /** Volitelně místo konání (audit 2026-04-29). Default: nezadáno. */
  venue?: string;
  /** Domácí / venkovní zápas (audit 2026-04-29). Default: true (doma). */
  isHome?: boolean;
  /** Datum zápasu ISO YYYY-MM-DD (audit 2026-04-29 pt3). Default: dnes. */
  date?: string;
  /** Čas zahájení HH:MM (audit 2026-04-29 pt3). Default: teď. */
  kickoffTime?: string;
  /** Soutěž — volný text (audit 2026-04-29 pt3). Default: prázdné. */
  competition?: string;
  /** Věková kategorie — z klubu (audit 2026-04-29 pt3). Default: nezadáno. */
  ageCategory?: string;
  /** Název našeho týmu (audit 2026-05-06). Default: jméno aktivního klubu. */
  myTeamName?: string;
  /**
   * Sub assistant settings (audit 2026-05-22). Když nastavený, useQuickMatchCreate
   * rozdělí prvních N hráčů (= match format starters count) jako základ a zbytek
   * na lavičku. LiveTab pak ukazuje sub alert každých `intervalMinutes`.
   */
  subAssistant?: {
    intervalMinutes: number;
    playersAtOnce: number;
  };
  /** Track assists pro góly (audit 2026-05-22 Stage 2). Default false. */
  trackAssists?: boolean;
  /** Captain playerId — pokud nastaveno, jeden hráč v lineup má isCaptain (audit 2026-05-22 Stage 2). */
  captainPlayerId?: string;
}

/**
 * Záznam hráče v Quick match soupisce. Jméno povinné, zbytek volitelný.
 * Audit 2026-04-29: rozšíření z `string[]` na strukturovaný typ — uživatel
 * teď může zadat dres + ročník (předtím se ztratilo).
 */
export interface QuickMatchRosterEntry {
  name: string;
  jerseyNumber?: number;
  birthYear?: number;
  /** Volitelně reference na ClubPlayer.id pokud byl hráč importován z klubu. */
  clubPlayerId?: string;
  /** Kapitán týmu (audit 2026-05-22 Stage 2b). Max 1 v rosteru. */
  isCaptain?: boolean;
}

/**
 * Initial player pro prefill (např. flow „další zápas se stejnou sestavou").
 * Audit 2026-04-29 pt2: po dokončení zápasu trenér klikne „Stejná sestava" →
 * QuickMatchPage předá `initialPlayers` z minulého lineup.
 */
export interface QuickMatchInitialPlayer {
  name: string;
  jerseyNumber?: number;
  birthYear?: number;
  clubPlayerId?: string;
}

interface PlayerRow {
  id: string;
  name: string;
  jerseyNumber: string;
  birthYear: string;
  clubPlayerId?: string;
}

interface Props {
  onClose: () => void;
  onCreate: (
    opponent: string,
    roster: QuickMatchRosterEntry[],
    squadId?: string,
    preset?: QuickMatchPreset,
  ) => void;
  /**
   * 'sheet' (default) — bottom-sheet modal pattern (legacy).
   * 'page' — full page layout konzistentní s tournament wizardem.
   */
  mode?: 'sheet' | 'page';
  /**
   * Pro 'page' mode: navigate funkce pro link na "Plný zápas se sestavou".
   * Když undefined, link se neukáže.
   */
  onSwitchToFullMatch?: () => void;
  /**
   * Volitelný initial roster (např. „další zápas se stejnou sestavou" CTA).
   * Pokud uvedeno, soupiska se předvyplní a sekce se rozbalí. Audit 2026-04-29.
   */
  initialPlayers?: QuickMatchInitialPlayer[];
}

export function QuickMatchSheet({
  onClose,
  onCreate,
  mode = 'sheet',
  onSwitchToFullMatch,
  initialPlayers,
}: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  // Audit 2026-05-17 (UX agent #1): Simple mode user (laik) má vidět jen
  // minimum — soupeř + náš tým + settings + soupiska. Detaily (datum, místo,
  // soutěž) schované za „Více možností" pokud explicitně neotevřel.
  const appMode = useUserPrefsStore(s => s.appMode);
  const isSimpleMode = appMode === 'simple';
  const allSquads = useSimpleSquadsStore(s => s.squads);
  const createSquad = useSimpleSquadsStore(s => s.createSquad);
  const updateSquad = useSimpleSquadsStore(s => s.updateSquad);
  const markUsed = useSimpleSquadsStore(s => s.markUsed);
  const showToast = useToastStore(s => s.show);
  const allMatches = useMatchesStore(s => s.matches);
  const clubs = useClubsStore(s => s.clubs);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const activeClub = useMemo(
    () => clubs.find(c => c.id === activeClubId) ?? null,
    [clubs, activeClubId],
  );
  const clubPlayers = useMemo(
    () => (activeClub?.players ?? []).filter(p => p.active),
    [activeClub],
  );
  const hasClubPlayers = clubPlayers.length > 0;

  // ─── State ─────────────────────────────────────────────────────────────────
  // Audit 2026-05-06: explicit input pro „Náš tým" — předtím se odvozoval
  // z aktivního klubu silently. Teď default = club name (pre-filled, editable).
  // Uživatel může napsat třeba „Vrchovina B" pro B-tým, nebo cokoli vlastního
  // pro Simple mode bez klubu.
  const [myTeamName, setMyTeamName] = useState<string>(() => activeClub?.name ?? '');
  const [opponent, setOpponent] = useState('');
  const [opponentFocused, setOpponentFocused] = useState(false);
  // Player editor — row-based (jako AdminRosterSheet v turnaji).
  // Init z `initialPlayers` (prefill z minulého zápasu) pokud je předán.
  const [players, setPlayers] = useState<PlayerRow[]>(() =>
    (initialPlayers ?? []).map(p => ({
      id: generateId(),
      name: p.name,
      jerseyNumber: p.jerseyNumber ? String(p.jerseyNumber) : '',
      birthYear: p.birthYear ? String(p.birthYear) : '',
      clubPlayerId: p.clubPlayerId,
    })),
  );
  // New player input row (3 inputs + tlačítko + Přidat)
  const [addName, setAddName] = useState('');
  const [addJersey, setAddJersey] = useState('');
  const [addBirthYear, setAddBirthYear] = useState('');
  // Squad (saved party) management
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  // Squad name input — pro „Uložit jako partu" flow.
  // Audit 2026-04-29 pt2: nahrazen checkbox + auto-save explicitním tlačítkem.
  // User vidí jasné potvrzení (toast) když se parta uloží.
  const [squadName, setSquadName] = useState('');
  // Match settings
  const [periodCount, setPeriodCount] = useState<1 | 2>(1);
  const [periodMinutes, setPeriodMinutes] = useState(15);
  const [matchFormat, setMatchFormat] = useState<QuickMatchPreset['matchFormat']>('5+1');
  // Modal: import z klubu
  const [clubImportOpen, setClubImportOpen] = useState(false);
  // Audit 2026-05-17: v Simple módu jsou „Více možností" (datum/místo/soutěž)
  // schované za jedním klikem. Advanced má vždy vše viditelné.
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  // Audit 2026-04-29: soupiska defaultně sbalená (rychlý zápas = soupeř +
  // settings stačí). Auto-expand pokud auto-pre-pick squady přidá hráče
  // nebo pokud byla předána initialPlayers (prefill z minulého zápasu).
  const [rosterExpanded, setRosterExpanded] = useState(
    (initialPlayers?.length ?? 0) > 0,
  );
  // Audit 2026-04-29: místo konání jako collapsed accordion (doma/venku +
  // text). Default sbalený — většina rychlých zápasů hraje doma, místo
  // user obvykle nepotřebuje zadávat. Po expanze edituje přímo.
  const [venueExpanded, setVenueExpanded] = useState(false);
  const [isHome, setIsHome] = useState(true);
  const [venue, setVenue] = useState('');
  // Audit 2026-04-29 pt3: progressive disclosure — datum/čas a soutěž/kategorie
  // jako další collapsibles. Default = dnes/teď a prázdné, user může otevřít
  // a upravit. Funguje stejně jako Quick → bez explicitního zadávání = OK,
  // s explicitním zadáním = uloží se do match objektu.
  const [dateTimeExpanded, setDateTimeExpanded] = useState(false);
  const [matchDate, setMatchDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [matchTime, setMatchTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [compCatExpanded, setCompCatExpanded] = useState(false);
  const [competition, setCompetition] = useState('');
  const [ageCategory, setAgeCategory] = useState<string>('');
  // Audit 2026-05-22: Pokročilá nastavení — sub assistant + track assists + captain.
  // Defaultně sbalené, vše opt-in. Quick match má být jednoduchý, advanced
  // featury jen pro power users.
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [useSubAssistant, setUseSubAssistant] = useState(false);
  const [subInterval, setSubInterval] = useState(5);
  const [subCount, setSubCount] = useState(1);
  const [trackAssists, setTrackAssists] = useState(false);
  const [captainPlayerId, setCaptainPlayerId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Opponent autocomplete (zachováno) ────────────────────────────────────
  const opponentHistory = useMemo(() => {
    if (!user?.uid) return [];
    type Entry = { name: string; count: number; lastDate: string };
    const map = new Map<string, Entry>();
    for (const m of allMatches) {
      const sport = m.sport ?? 'football';
      if (sport !== preferredSport) continue;
      const name = m.opponent?.trim();
      if (!name) continue;
      const isPlaceholder = name === t('match.list.quickMatchDefaultOpponent');
      if (isPlaceholder) continue;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if ((m.date ?? '') > existing.lastDate) existing.lastDate = m.date ?? '';
      } else {
        map.set(key, { name, count: 1, lastDate: m.date ?? '' });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return b.lastDate.localeCompare(a.lastDate);
    });
  }, [allMatches, preferredSport, t, user?.uid]);

  /** Historie soutěží z user vlastních zápasů — pro autocomplete soutěže.
   *  Vrací unikátní hodnoty seřazené podle frekvence + recency. */
  const competitionHistory = useMemo(() => {
    if (!user?.uid) return [];
    type Entry = { name: string; count: number; lastDate: string };
    const map = new Map<string, Entry>();
    for (const m of allMatches) {
      const sport = m.sport ?? 'football';
      if (sport !== preferredSport) continue;
      const name = m.competition?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if ((m.date ?? '') > existing.lastDate) existing.lastDate = m.date ?? '';
      } else {
        map.set(key, { name, count: 1, lastDate: m.date ?? '' });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        return b.lastDate.localeCompare(a.lastDate);
      })
      .slice(0, 5);
  }, [allMatches, preferredSport, user?.uid]);

  const opponentSuggestions = useMemo(() => {
    const q = opponent.trim().toLowerCase();
    if (!opponentFocused) return [];
    if (opponentHistory.length === 0) return [];
    if (q.length === 0) return opponentHistory.slice(0, 5);
    const exactMatch = opponentHistory.find(o => o.name.toLowerCase() === q);
    if (exactMatch && opponentHistory.length === 1) return [];
    return opponentHistory
      .filter(o => o.name.toLowerCase().includes(q))
      .filter(o => o.name.toLowerCase() !== q)
      .slice(0, 6);
  }, [opponent, opponentFocused, opponentHistory]);

  const squads = useMemo(() => {
    return allSquads
      .filter(s => s.sport === preferredSport)
      .sort((a, b) => {
        const aUse = a.usageCount ?? 0;
        const bUse = b.usageCount ?? 0;
        if (aUse !== bUse) return bUse - aUse;
        return (b.lastUsedAt ?? b.updatedAt ?? '').localeCompare(a.lastUsedAt ?? a.updatedAt ?? '');
      });
  }, [allSquads, preferredSport]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Audit 2026-05-17 (UX agent #1 finding): auto-pre-pick squady byl
  // „stealth behavior" — silently vyplnil hráče z minulého zápasu, user
  // si toho mohl všimnout až po smazání. Teď ukážeme opt-in banner:
  // user musí explicitně kliknout „Použít znovu" pro načtení party.
  const [dismissedTopSquad, setDismissedTopSquad] = useState(false);
  const topSquadCandidate = useMemo(() => {
    if (selectedSquadId) return null;
    if (players.length > 0) return null;
    if (dismissedTopSquad) return null;
    const top = squads[0];
    if (!top || (top.usageCount ?? 0) < 1) return null;
    return top;
  }, [squads, selectedSquadId, players.length, dismissedTopSquad]);

  // ─── Player editor handlers ───────────────────────────────────────────────
  const usedJerseys = useMemo(
    () => new Set(players.filter(p => p.jerseyNumber.trim()).map(p => p.jerseyNumber.trim())),
    [players],
  );
  const jerseyDuplicate = addJersey.trim() && usedJerseys.has(addJersey.trim());
  const canAddPlayer = addName.trim().length > 0 && !jerseyDuplicate;

  const addPlayer = () => {
    if (!canAddPlayer) return;
    setPlayers(prev => [...prev, {
      id: generateId(),
      name: addName.trim(),
      jerseyNumber: addJersey.trim(),
      birthYear: addBirthYear.trim(),
    }]);
    setAddName('');
    setAddJersey('');
    setAddBirthYear('');
  };

  const removePlayer = (id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
  };

  const handlePickSquad = (squad: SimpleSquad) => {
    setSelectedSquadId(squad.id);
    setPlayers(squad.players.map(name => ({
      id: generateId(),
      name,
      jerseyNumber: '',
      birthYear: '',
    })));
    setRosterExpanded(true);
  };

  const handleClearSquad = () => {
    setSelectedSquadId(null);
    setPlayers([]);
  };

  // Audit 2026-04-29 pt2: explicit save squad — uloží partu rovnou
  // (nepočká na Spustit zápas) a ukáže toast. User má jasnou zpětnou vazbu.
  const handleSaveSquad = () => {
    const trimmedName = squadName.trim();
    if (!trimmedName || validPlayers.length === 0 || !user?.uid) return;
    const newSquad = createSquad({
      name: trimmedName,
      sport: preferredSport,
      players: validPlayers.map(p => p.name.trim()),
    }, user.uid);
    setSelectedSquadId(newSquad.id);
    setSquadName('');
    showToast('success', t('match.quickSheet.squadSaved', { name: trimmedName }));
  };

  // Aktualizace existující party (změna jmen v listu).
  const handleUpdateSquad = () => {
    if (!selectedSquadId || validPlayers.length === 0) return;
    updateSquad(selectedSquadId, {
      players: validPlayers.map(p => p.name.trim()),
    });
    const squad = squads.find(s => s.id === selectedSquadId);
    showToast('success', t('match.quickSheet.squadUpdated', { name: squad?.name ?? '' }));
  };

  const handleImportFromClub = (picked: ClubPlayer[]) => {
    if (picked.length === 0) return;
    setRosterExpanded(true);
    setPlayers(prev => {
      const existingNames = new Set(
        prev.filter(p => p.name.trim()).map(p => p.name.trim().toLowerCase()),
      );
      const usedNums = new Set(
        prev.filter(p => p.jerseyNumber.trim()).map(p => p.jerseyNumber.trim()),
      );
      const toAdd: PlayerRow[] = [];
      for (const cp of picked) {
        if (existingNames.has(cp.name.trim().toLowerCase())) continue;
        let jersey = cp.jerseyNumber > 0 ? String(cp.jerseyNumber) : '';
        // Pokud je dres už použitý (kolize), necháme prázdné — user doplní ručně
        if (jersey && usedNums.has(jersey)) jersey = '';
        if (jersey) usedNums.add(jersey);
        toAdd.push({
          id: generateId(),
          name: cp.name,
          jerseyNumber: jersey,
          birthYear: cp.birthYear ? String(cp.birthYear) : '',
          clubPlayerId: cp.id,
        });
      }
      return [...prev, ...toAdd];
    });
  };

  // ─── Submit ────────────────────────────────────────────────────────────────
  const validPlayers = useMemo(
    () => players.filter(p => p.name.trim()),
    [players],
  );

  const handleStart = () => {
    if (!opponent.trim() && validPlayers.length === 0) {
      // Quick safety — user nezadal opponent ani hráče. Necháme proběhnout
      // (default opponent placeholder), ale alespoň loglet pro diagnostiku.
    }

    const roster: QuickMatchRosterEntry[] = validPlayers.map(p => {
      const jersey = parseInt(p.jerseyNumber, 10);
      const year = parseInt(p.birthYear, 10);
      return {
        name: p.name.trim(),
        jerseyNumber: Number.isFinite(jersey) && jersey > 0 ? jersey : undefined,
        birthYear: Number.isFinite(year) && year > 1900 ? year : undefined,
        clubPlayerId: p.clubPlayerId,
        isCaptain: captainPlayerId === p.id,
      };
    });

    // Pokud user předtím klikl „Uložit partu", selectedSquadId je nastavený.
    // markUsed posílá squad nahoru v listu (sortováno podle usageCount).
    const finalSquadId = selectedSquadId ?? undefined;
    if (selectedSquadId) {
      markUsed(selectedSquadId);
    }

    const totalMinutes = periodCount * periodMinutes;
    const preset: QuickMatchPreset = {
      durationMinutes: totalMinutes,
      periods: periodCount,
      matchFormat,
      label: periodCount === 1 ? `${periodMinutes} min` : `${periodCount}×${periodMinutes}`,
      venue: venue.trim() || undefined,
      isHome,
      // Audit 2026-04-29 pt3: progressive disclosure — pokud user nezadal,
      // hodnoty se použijí jako default (dnes/teď). Pokud zadal, ulož je.
      date: matchDate,
      kickoffTime: matchTime,
      competition: competition.trim() || undefined,
      ageCategory: ageCategory.trim() || undefined,
      // Audit 2026-05-06: explicit team name (může být jiné než club.name)
      myTeamName: myTeamName.trim() || undefined,
      // Audit 2026-05-22: sub assistant — useQuickMatchCreate auto-rozdělí
      // starters/bench podle formátu, pokud je nastaveno.
      subAssistant: useSubAssistant
        ? { intervalMinutes: subInterval, playersAtOnce: subCount }
        : undefined,
      trackAssists,
      captainPlayerId: captainPlayerId ?? undefined,
    };
    onCreate(opponent, roster, finalSquadId, preset);
  };

  // Submit validace (audit 2026-05-22 Phase 1e):
  // - Opponent je povinný (min 2 znaky) — bez něj se vytváří DB junk
  // - Soupiska volitelná (lineup může být prázdný, edituje se později)
  const submitDisabled = opponent.trim().length < 2;

  // Unsaved guard (audit 2026-05-22 Phase 1d): zabrání ztrátě dat při refresh
  // pokud user vyplnil opponent nebo přidal hráče.
  useUnsavedFormGuard(opponent.trim().length > 0 || players.length > 0);

  // ─── Styles ────────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px', borderRadius: 12,
    border: '1.5px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 15, outline: 'none',
  };
  const compactInp: React.CSSProperties = {
    padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  const isPageMode = mode === 'page';

  // ─── Form content (oba módy ho vykreslují uvnitř svých wrapperů) ─────────
  const formContent = (
    <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Náš tým + Soupeř (audit 2026-05-06: explicit team name input) ──
          Vizuální „X vs Y" pattern. Náš tým defaultně předvyplněn z aktivního
          klubu, ale lze přepsat (např. „Vrchovina B" nebo Simple mode bez klubu). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label htmlFor="quick-myteam" style={labelStyle}>
            👥 {t('match.quickSheet.myTeamLabel')}
          </label>
          <input
            id="quick-myteam"
            type="text"
            value={myTeamName}
            onChange={e => setMyTeamName(e.target.value)}
            placeholder={t('match.quickSheet.myTeamPlaceholder')}
            style={inputStyle}
            autoComplete="off"
          />
        </div>
        <div style={{
          textAlign: 'center', fontSize: 11, fontWeight: 700,
          color: 'var(--text-muted)', letterSpacing: 1,
          margin: '-4px 0',
        }}>
          VS
        </div>
      <div style={{ position: 'relative' }}>
        <label htmlFor="quick-opponent" style={labelStyle}>
          ⚔️ {t('match.quickSheet.opponentLabel')} <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          id="quick-opponent"
          ref={inputRef}
          type="text"
          value={opponent}
          onChange={e => setOpponent(e.target.value)}
          onFocus={() => setOpponentFocused(true)}
          onBlur={() => setTimeout(() => setOpponentFocused(false), 200)}
          placeholder={t('match.quickSheet.opponentPlaceholder')}
          style={inputStyle}
          autoComplete="off"
          required
          aria-required="true"
        />
        {opponentSuggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            borderRadius: 12, marginTop: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            maxHeight: 200, overflowY: 'auto',
          }}>
            {opponentSuggestions.map(s => (
              <button
                key={s.name}
                type="button"
                onMouseDown={e => {
                  e.preventDefault();
                  setOpponent(s.name);
                  setOpponentFocused(false);
                }}
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}
              >
                <span style={{
                  fontSize: 14, fontWeight: 600, color: 'var(--text)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {s.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {s.count}× {t('match.quickSheet.opponentMatchesAgo')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* ── Detaily zápasu (audit 2026-04-29 pt3: přesunuto nahoru — defaultní
          hodnoty, vždy viditelné, primární config). */}
      <div style={{
        background: 'var(--surface-var)',
        borderRadius: 12, padding: '4px 14px',
        border: '1px solid var(--border)',
      }}>
        <SettingsList>
          <SettingRow icon="⏱" label={t('match.quickSheet.periodsLabel')}>
            <ChipPair
              value={periodCount}
              options={[
                { v: 1, label: '1' },
                { v: 2, label: '2' },
              ]}
              onChange={v => setPeriodCount(v as 1 | 2)}
            />
          </SettingRow>
          <SettingRow
            icon="🕐"
            label={periodCount === 1
              ? t('match.quickSheet.durationOneLabel')
              : t('match.quickSheet.durationEachLabel')}
          >
            <CompactNumberInput
              value={periodMinutes}
              min={1}
              max={60}
              unit="min"
              onChange={setPeriodMinutes}
            />
          </SettingRow>
          <SettingRow icon="⚽" label={t('match.quickSheet.matchFormatLabel')} isLast>
            <ChipPair
              value={matchFormat}
              options={[
                { v: '3+1', label: '3+1' },
                { v: '4+1', label: '4+1' },
                { v: '5+1', label: '5+1' },
                { v: '7+1', label: '7+1' },
                { v: '8+1', label: '8+1' },
                { v: '11+1', label: '11+1' },
              ]}
              onChange={v => setMatchFormat(v as QuickMatchPreset['matchFormat'])}
            />
          </SettingRow>
        </SettingsList>
      </div>

      {/* Hint o volitelnosti — audit 2026-04-29 pt4: přesunuto nad collapsibles
          aby trenér věděl PŘEDTÍM než uvidí seznam možností. */}
      <div style={{
        fontSize: 11, color: 'var(--text-muted)',
        textAlign: 'center', lineHeight: 1.5,
        padding: '2px 8px',
      }}>
        ℹ️ {t('match.quickSheet.optionalHint')}
      </div>

      {/* Audit 2026-05-17 (UX agent #1): v Simple módu schovat Datum/Místo/Soutěž
          za jedním tlačítkem „Více možností" — laik je nepotřebuje a přeplácaný
          formulář ho odrazuje. Advanced mode = vše viditelné jako dosud. */}
      {isSimpleMode && !showAdvancedDetails && (
        <button
          type="button"
          onClick={() => setShowAdvancedDetails(true)}
          style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'transparent', border: '1.5px dashed var(--border)',
            color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textAlign: 'center',
          }}
        >
          ▼ {t('match.quickSheet.moreOptions')}
        </button>
      )}
      {/* ── Player editor (row-based, jako v AdminRosterSheet) ─────────────
          Audit 2026-04-29 pt4: přesunut na konec — nejnáročnější část (přidávat
          hráče), trenér ji řeší naposledy. Defaultně sbalená. Auto-expand
          pokud user vybral squad nebo importoval z klubu. */}
      <div>
        <button
          type="button"
          onClick={() => setRosterExpanded(v => !v)}
          aria-expanded={rosterExpanded}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 10,
            background: rosterExpanded ? 'var(--primary-light)' : 'var(--surface-var)',
            border: `1.5px solid ${rosterExpanded ? 'var(--primary)' : 'var(--border)'}`,
            cursor: 'pointer', textAlign: 'left',
            transition: 'background .15s, border-color .15s',
          }}
        >
          <span style={{ fontSize: 18 }}>👥</span>
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 700,
            color: rosterExpanded ? 'var(--primary)' : 'var(--text)',
          }}>
            {t('match.quickSheet.rosterLabel')}
            {validPlayers.length > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 11,
                color: 'var(--text-muted)', fontWeight: 600,
              }}>
                ({validPlayers.length})
              </span>
            )}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: rosterExpanded ? 'var(--primary)' : 'var(--text-muted)',
            transform: rosterExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform .2s',
          }}>
            ▼
          </span>
        </button>
      {rosterExpanded && (<>
        {hasClubPlayers && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setClubImportOpen(true)}
              style={{
                padding: '6px 12px', borderRadius: 8,
                background: 'var(--surface-var)', color: 'var(--primary)',
                border: '1px solid var(--primary)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              📥 {t('match.quickSheet.importFromClub')}
            </button>
          </div>
        )}
        <div style={{ marginTop: hasClubPlayers ? 8 : 10 }}>

        {/* Existing players list */}
        {players.length > 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            marginBottom: 6,
          }}>
            {players.map(p => (
              <div
                key={p.id}
                style={{
                  display: 'flex', gap: 4, alignItems: 'center',
                  padding: '4px 6px', borderRadius: 8,
                  background: 'var(--surface-var)',
                }}
              >
                <span style={{
                  width: 36, fontSize: 12, fontWeight: 800,
                  textAlign: 'center', color: 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {p.jerseyNumber ? `#${p.jerseyNumber}` : '—'}
                </span>
                <span style={{
                  flex: 1, fontSize: 14, fontWeight: 600,
                  color: 'var(--text)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.name}
                </span>
                {p.birthYear && (
                  <span style={{
                    fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {p.birthYear}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePlayer(p.id)}
                  aria-label={t('common.delete')}
                  style={{
                    width: 26, height: 26, borderRadius: 6,
                    background: 'transparent', color: 'var(--text-muted)',
                    border: 'none', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add player input row — stejný pattern jako AdminRosterSheet */}
        <div style={{
          borderRadius: 10, overflow: 'hidden',
          border: jerseyDuplicate
            ? '2px solid var(--danger)'
            : canAddPlayer ? '2px solid var(--primary)' : '1px solid var(--border)',
          transition: 'border .2s',
        }}>
          <div style={{
            padding: '5px 10px',
            background: jerseyDuplicate
              ? 'var(--danger)'
              : canAddPlayer ? 'var(--primary)' : 'var(--surface-var)',
            color: (jerseyDuplicate || canAddPlayer) ? '#fff' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ fontSize: 12 }}>👤</span>
            <span style={{ fontWeight: 700, fontSize: 12 }}>
              {t('match.quickSheet.addPlayer')}
            </span>
          </div>
          <div style={{ padding: '6px 8px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="number"
                inputMode="numeric"
                value={addJersey}
                onChange={e => setAddJersey(e.target.value.replace(/\D/g, '').slice(0, 2))}
                onKeyDown={e => e.key === 'Enter' && addPlayer()}
                placeholder="#"
                min={1}
                max={99}
                style={{
                  ...compactInp,
                  width: 44, textAlign: 'center', padding: '6px 2px', flexShrink: 0,
                  borderColor: jerseyDuplicate ? 'var(--danger)' : 'var(--border)',
                }}
              />
              <input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPlayer()}
                placeholder={t('match.quickSheet.playerNamePlaceholder')}
                style={{ ...compactInp, flex: 1, minWidth: 0 }}
              />
              <input
                type="number"
                inputMode="numeric"
                value={addBirthYear}
                onChange={e => setAddBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => e.key === 'Enter' && addPlayer()}
                placeholder={t('match.quickSheet.birthYearPlaceholder')}
                style={{
                  ...compactInp,
                  width: 54, textAlign: 'center', padding: '6px 2px', flexShrink: 0,
                }}
              />
            </div>
            {jerseyDuplicate && (
              <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>
                ⚠️ {t('match.quickSheet.duplicateJersey')}
              </div>
            )}
            <button
              type="button"
              onClick={addPlayer}
              disabled={!canAddPlayer}
              style={{
                width: '100%', padding: '7px', borderRadius: 7,
                background: canAddPlayer ? 'var(--primary)' : 'var(--surface-var)',
                color: canAddPlayer ? '#fff' : 'var(--text-muted)',
                border: 'none', fontSize: 12, fontWeight: 700,
                cursor: canAddPlayer ? 'pointer' : 'default',
                touchAction: 'manipulation',
              }}
            >
              {canAddPlayer ? `+ ${t('match.quickSheet.addPlayer')}` : t('match.quickSheet.addPlayerHint')}
            </button>
          </div>
        </div>

        <div style={{
          fontSize: 11, color: 'var(--text-muted)',
          marginTop: 6, lineHeight: 1.4,
        }}>
          {t('match.quickSheet.rosterHintMinimal')}
        </div>
        </div>
      </>)}
      </div>

      {/* ── Save / Update party — explicit tlačítka místo checkboxu */}
      {!selectedSquadId && validPlayers.length > 0 && (
        <div style={{
          background: 'var(--surface-var)', borderRadius: 10, padding: 10,
          border: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8,
          }}>
            💾 {t('match.quickSheet.saveAsSquad')}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={squadName}
              onChange={e => setSquadName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && squadName.trim()) {
                  e.preventDefault();
                  handleSaveSquad();
                }
              }}
              placeholder={t('match.quickSheet.squadNamePlaceholder')}
              style={{ ...inputStyle, flex: 1, padding: '8px 10px', fontSize: 13 }}
            />
            <button
              type="button"
              onClick={handleSaveSquad}
              disabled={!squadName.trim()}
              style={{
                padding: '8px 14px', borderRadius: 10,
                background: squadName.trim() ? 'var(--primary)' : 'var(--border)',
                color: squadName.trim() ? '#fff' : 'var(--text-muted)',
                border: 'none', fontSize: 13, fontWeight: 700,
                cursor: squadName.trim() ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
              }}
            >
              {t('match.quickSheet.saveSquadCta')}
            </button>
          </div>
        </div>
      )}
      {selectedSquadId && validPlayers.length > 0 && (
        <button
          type="button"
          onClick={handleUpdateSquad}
          style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--surface-var)', color: 'var(--text)',
            border: '1px solid var(--border)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          💾 {t('match.quickSheet.updateSquadCta')}
        </button>
      )}

      {(!isSimpleMode || showAdvancedDetails) && (<>
      {/* ── Datum a čas (collapsed accordion) ─────────────────────────────────
          Audit 2026-04-29 pt4: první v pořadí collapsibles — má vždy default
          preview (Dnes 19:33), user vidí že je nastaveno bez expanze. */}
      <div>
        <button
          type="button"
          onClick={() => setDateTimeExpanded(v => !v)}
          aria-expanded={dateTimeExpanded}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 10,
            background: dateTimeExpanded ? 'var(--primary-light)' : 'var(--surface-var)',
            border: `1.5px solid ${dateTimeExpanded ? 'var(--primary)' : 'var(--border)'}`,
            cursor: 'pointer', textAlign: 'left',
            transition: 'background .15s, border-color .15s',
          }}
        >
          <span style={{ fontSize: 18 }}>📅</span>
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 700,
            color: dateTimeExpanded ? 'var(--primary)' : 'var(--text)',
          }}>
            {t('match.quickSheet.dateTimeLabel')}
            <span style={{
              marginLeft: 6, fontSize: 11,
              color: 'var(--text-muted)', fontWeight: 600,
            }}>
              ({matchDate === new Date().toISOString().split('T')[0]
                ? t('match.quickSheet.today')
                : matchDate}
              {' '}{matchTime})
            </span>
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: dateTimeExpanded ? 'var(--primary)' : 'var(--text-muted)',
            transform: dateTimeExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform .2s',
          }}>
            ▼
          </span>
        </button>
        {dateTimeExpanded && (
          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            <input
              type="date"
              value={matchDate}
              onChange={e => setMatchDate(e.target.value)}
              style={{ ...inputStyle, flex: 1, padding: '10px 12px', fontSize: 14 }}
            />
            <input
              type="time"
              value={matchTime}
              onChange={e => setMatchTime(e.target.value)}
              style={{ ...inputStyle, width: 110, padding: '10px 12px', fontSize: 14 }}
            />
          </div>
        )}
      </div>

      {/* ── Místo konání (collapsed accordion) ───────────────────────────────
          Audit 2026-04-29: pro power users co potřebují zaznamenat místo
          (Strahov, U hřbitova...) nebo rozlišit doma/venku. Default sbalené
          — většina rychlých zápasů hraje doma a místo není podstatné. */}
      <div>
        <button
          type="button"
          onClick={() => setVenueExpanded(v => !v)}
          aria-expanded={venueExpanded}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 10,
            background: venueExpanded ? 'var(--primary-light)' : 'var(--surface-var)',
            border: `1.5px solid ${venueExpanded ? 'var(--primary)' : 'var(--border)'}`,
            cursor: 'pointer', textAlign: 'left',
            transition: 'background .15s, border-color .15s',
          }}
        >
          <span style={{ fontSize: 18 }}>📍</span>
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 700,
            color: venueExpanded ? 'var(--primary)' : 'var(--text)',
          }}>
            {t('match.quickSheet.venueLabel')}
            {(venue.trim() || !isHome) && (
              <span style={{
                marginLeft: 6, fontSize: 11,
                color: 'var(--text-muted)', fontWeight: 600,
              }}>
                ({!isHome ? t('match.quickSheet.away') : ''}{!isHome && venue.trim() ? ' · ' : ''}{venue.trim()})
              </span>
            )}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: venueExpanded ? 'var(--primary)' : 'var(--text-muted)',
            transform: venueExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform .2s',
          }}>
            ▼
          </span>
        </button>
        {venueExpanded && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Doma / Venku */}
            <div style={{
              background: 'var(--surface-var)', borderRadius: 12,
              padding: '8px 14px', border: '1px solid var(--border)',
            }}>
              <SettingsList>
                <SettingRow icon="🏠" label={t('match.quickSheet.homeAwayLabel')} isLast>
                  <ChipPair
                    value={isHome ? 'home' : 'away'}
                    options={[
                      { v: 'home', label: t('match.quickSheet.home') },
                      { v: 'away', label: t('match.quickSheet.away') },
                    ]}
                    onChange={v => setIsHome(v === 'home')}
                  />
                </SettingRow>
              </SettingsList>
            </div>
            {/* Venue text input */}
            <input
              type="text"
              value={venue}
              onChange={e => setVenue(e.target.value)}
              placeholder={t('match.quickSheet.venuePlaceholder')}
              style={inputStyle}
            />
          </div>
        )}
      </div>

      {/* ── Soutěž a kategorie (collapsed accordion) ──────────────────────────
          Audit 2026-04-29 pt3: pro klubový zápas user často chce zaznamenat
          do jaké soutěže to patří (KP, OP, MD, atd.) a kterou kategorii
          tým reprezentoval (U10/U12/...). Default sbalené — pro plácek /
          přátelák to není potřeba. */}
      <div>
        <button
          type="button"
          onClick={() => setCompCatExpanded(v => !v)}
          aria-expanded={compCatExpanded}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 10,
            background: compCatExpanded ? 'var(--primary-light)' : 'var(--surface-var)',
            border: `1.5px solid ${compCatExpanded ? 'var(--primary)' : 'var(--border)'}`,
            cursor: 'pointer', textAlign: 'left',
            transition: 'background .15s, border-color .15s',
          }}
        >
          <span style={{ fontSize: 18 }}>🏆</span>
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 700,
            color: compCatExpanded ? 'var(--primary)' : 'var(--text)',
          }}>
            {t('match.quickSheet.competitionCategoryLabel')}
            {(competition.trim() || ageCategory.trim()) && (
              <span style={{
                marginLeft: 6, fontSize: 11,
                color: 'var(--text-muted)', fontWeight: 600,
              }}>
                ({[ageCategory.trim(), competition.trim()].filter(Boolean).join(' · ')})
              </span>
            )}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: compCatExpanded ? 'var(--primary)' : 'var(--text-muted)',
            transform: compCatExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform .2s',
          }}>
            ▼
          </span>
        </button>
        {compCatExpanded && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Kategorie — chips z aktivního klubu, pokud má kategorie */}
            {(activeClub?.ageCategories ?? []).length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                  marginBottom: 6,
                }}>
                  {t('match.quickSheet.categoryLabel')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setAgeCategory('')}
                    style={{
                      padding: '6px 11px', borderRadius: 8,
                      background: ageCategory === '' ? 'var(--primary)' : 'var(--surface-var)',
                      color: ageCategory === '' ? '#fff' : 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {t('match.quickSheet.categoryNone')}
                  </button>
                  {(activeClub?.ageCategories ?? []).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setAgeCategory(cat)}
                      style={{
                        padding: '6px 11px', borderRadius: 8,
                        background: ageCategory === cat ? 'var(--primary)' : 'var(--surface-var)',
                        color: ageCategory === cat ? '#fff' : 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Soutěž — text input + suggestions z minulých zápasů */}
            <div>
              <div style={{
                fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                marginBottom: 6,
              }}>
                {t('match.quickSheet.competitionLabel')}
              </div>
              <input
                type="text"
                value={competition}
                onChange={e => setCompetition(e.target.value)}
                placeholder={t('match.quickSheet.competitionPlaceholder')}
                style={{ ...inputStyle, padding: '10px 12px', fontSize: 14 }}
              />
              {competitionHistory.length > 0 && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6,
                }}>
                  {competitionHistory
                    .filter(c => c.name !== competition)
                    .map(c => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setCompetition(c.name)}
                        style={{
                          padding: '4px 10px', borderRadius: 8,
                          background: 'var(--surface-var)', color: 'var(--text-muted)',
                          border: '1px dashed var(--border)',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Asistent střídání (audit 2026-05-22) ──────────────────────────────
          Pro turnajové dny / McDonald's Cup scénář — trenér chce auto-alert
          každých N minut na střídání. Aplikace pak rozdělí prvních N hráčů
          (= match format) jako základ, zbytek na lavičku. */}
      <div>
        <button
          type="button"
          onClick={() => setAdvancedExpanded(v => !v)}
          aria-expanded={advancedExpanded}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 10,
            background: advancedExpanded ? 'var(--primary-light)' : 'var(--surface-var)',
            border: `1.5px solid ${advancedExpanded ? 'var(--primary)' : 'var(--border)'}`,
            cursor: 'pointer', textAlign: 'left',
            transition: 'background .15s, border-color .15s',
          }}
        >
          <span style={{ fontSize: 18 }}>⚙️</span>
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 700,
            color: advancedExpanded ? 'var(--primary)' : 'var(--text)',
          }}>
            {t('match.quickSheet.advancedLabel')}
            {(useSubAssistant || trackAssists || captainPlayerId) && (
              <span style={{
                marginLeft: 6, fontSize: 11,
                color: 'var(--text-muted)', fontWeight: 600,
              }}>
                ({[
                  useSubAssistant && `🔄 ${subInterval}m × ${subCount}`,
                  trackAssists && `🎯 ${t('match.quickSheet.trackAssistsSummary')}`,
                  captainPlayerId && `© ${players.find(p => p.id === captainPlayerId)?.name ?? ''}`,
                ].filter(Boolean).join(' · ')})
              </span>
            )}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: advancedExpanded ? 'var(--primary)' : 'var(--text-muted)',
            transform: advancedExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform .2s',
          }}>
            ▼
          </span>
        </button>
        {advancedExpanded && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* ── Track assists toggle (audit 2026-05-22 Stage 2c) */}
            <label style={{
              display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer',
              padding: '10px 12px', borderRadius: 10,
              background: trackAssists ? 'var(--success-light)' : 'var(--surface-var)',
              border: `1.5px solid ${trackAssists ? 'var(--success)' : 'var(--border)'}`,
            }}>
              <input
                type="checkbox"
                checked={trackAssists}
                onChange={e => setTrackAssists(e.target.checked)}
                style={{ width: 20, height: 20, cursor: 'pointer' }}
              />
              <span style={{ flex: 1 }}>
                <span style={{
                  display: 'block', fontSize: 14, fontWeight: 700,
                  color: trackAssists ? 'var(--success)' : 'var(--text)',
                }}>
                  🎯 {t('match.quickSheet.trackAssistsLabel')}
                </span>
                <span style={{
                  display: 'block', fontSize: 11, color: 'var(--text-muted)',
                  marginTop: 2, lineHeight: 1.4,
                }}>
                  {t('match.quickSheet.trackAssistsDesc')}
                </span>
              </span>
            </label>

            {/* ── Captain selector (audit 2026-05-22 Stage 2b) */}
            {validPlayers.length > 0 && (
              <div style={{
                background: 'var(--surface-var)', borderRadius: 10, padding: 10,
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  © {t('match.quickSheet.captainLabel')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setCaptainPlayerId(null)}
                    style={{
                      padding: '6px 12px', borderRadius: 999,
                      background: captainPlayerId === null ? 'var(--primary)' : 'var(--surface)',
                      color: captainPlayerId === null ? '#fff' : 'var(--text-muted)',
                      border: `1.5px solid ${captainPlayerId === null ? 'var(--primary)' : 'var(--border)'}`,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {t('match.quickSheet.captainNone')}
                  </button>
                  {players.filter(p => p.name.trim()).map(p => {
                    const selected = captainPlayerId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setCaptainPlayerId(p.id)}
                        style={{
                          padding: '6px 12px', borderRadius: 999,
                          background: selected ? 'var(--primary)' : 'var(--surface)',
                          color: selected ? '#fff' : 'var(--text)',
                          border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {p.jerseyNumber && <span style={{ opacity: 0.7, marginRight: 4 }}>#{p.jerseyNumber}</span>}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Sub assistant toggle (audit 2026-05-22) */}
            <label style={{
              display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer',
              padding: '10px 12px', borderRadius: 10,
              background: useSubAssistant ? 'var(--success-light)' : 'var(--surface-var)',
              border: `1.5px solid ${useSubAssistant ? 'var(--success)' : 'var(--border)'}`,
            }}>
              <input
                type="checkbox"
                checked={useSubAssistant}
                onChange={e => setUseSubAssistant(e.target.checked)}
                style={{ width: 20, height: 20, cursor: 'pointer' }}
              />
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: useSubAssistant ? 'var(--success)' : 'var(--text)',
              }}>
                🔄 {useSubAssistant
                  ? t('match.quickSheet.subAssistantEnabled')
                  : t('match.quickSheet.subAssistantEnable')}
              </span>
            </label>
            {useSubAssistant && (
              <>
                {/* Steppers */}
                <div style={{
                  background: 'var(--surface-var)', borderRadius: 10, padding: 10,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {t('match.quickSheet.subInterval')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setSubInterval(Math.max(1, subInterval - 1))}
                        style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface)', border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                      >−</button>
                      <span style={{ fontWeight: 800, fontSize: 16, minWidth: 50, textAlign: 'center', color: 'var(--primary)' }}>
                        {subInterval} {t('common.min')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSubInterval(Math.min(45, subInterval + 1))}
                        style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface)', border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                      >+</button>
                    </div>
                  </div>
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {t('match.quickSheet.subCount')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setSubCount(Math.max(1, subCount - 1))}
                        style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface)', border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                      >−</button>
                      <span style={{ fontWeight: 800, fontSize: 16, minWidth: 30, textAlign: 'center', color: 'var(--primary)' }}>
                        {subCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSubCount(Math.min(4, subCount + 1))}
                        style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface)', border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                      >+</button>
                    </div>
                  </div>
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                  padding: '0 4px',
                }}>
                  {t('match.quickSheet.subAssistantHint', { interval: subInterval, count: subCount })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </>)}

      {/* ── Opt-in banner pro nejužívanější partu (audit 2026-05-17, UX agent).
          Místo silent auto-fill se ptáme explicitně. */}
      {topSquadCandidate && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 10,
          background: 'var(--primary-light)', border: '1.5px dashed var(--primary)',
        }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>
              {t('match.quickSheet.lastSquadPrompt', { name: topSquadCandidate.name })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('match.quickSheet.squadSize', { n: topSquadCandidate.players.length })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handlePickSquad(topSquadCandidate)}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: 'var(--primary)', color: '#fff',
              border: 'none',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t('match.quickSheet.lastSquadUse')}
          </button>
          <button
            type="button"
            onClick={() => setDismissedTopSquad(true)}
            aria-label={t('common.close')}
            style={{
              width: 26, height: 26, borderRadius: 13,
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Squad picker (audit 2026-04-29 pt4: přesunut k Soupiska — vizuálně
          patří dohromady jako „výběr účastníků"). */}
      {squads.length > 0 && !selectedSquadId && (
        <div>
          <label style={labelStyle}>👥 {t('match.quickSheet.pickSquad')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {squads.map(squad => (
              <button
                key={squad.id}
                type="button"
                onClick={() => handlePickSquad(squad)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'var(--surface-var)', border: '1px solid var(--border)',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20 }}>👥</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{squad.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t('match.quickSheet.squadSize', { n: squad.players.length })}
                  </div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 16, fontWeight: 700 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSquadId && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 10,
          background: 'var(--primary-light)', border: '1.5px solid var(--primary)',
        }}>
          <span style={{ fontSize: 20 }}>✓</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
              {squads.find(s => s.id === selectedSquadId)?.name ?? ''}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('match.quickSheet.squadActive', { n: validPlayers.length })}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearSquad}
            style={{
              padding: '6px 10px', borderRadius: 8,
              background: 'var(--surface)', color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t('match.quickSheet.changeSquad')}
          </button>
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={submitDisabled}
        style={{
          padding: '14px', borderRadius: 12,
          background: submitDisabled ? 'var(--border)' : 'var(--primary)',
          color: submitDisabled ? 'var(--text-muted)' : '#fff',
          border: 'none',
          fontWeight: 800, fontSize: 15,
          cursor: submitDisabled ? 'not-allowed' : 'pointer',
          marginTop: 4,
          boxShadow: submitDisabled ? 'none' : 'var(--shadow-sm)',
          opacity: submitDisabled ? 0.6 : 1,
          transition: 'background .15s, opacity .15s',
        }}
        title={submitDisabled ? t('match.quickSheet.opponentRequired') : undefined}
      >
        ⚡ {t('match.quickSheet.startCta')}
      </button>
      {submitDisabled && (opponent.length > 0 || players.length > 0) && (
        <div style={{
          fontSize: 11, color: 'var(--text-muted)',
          textAlign: 'center', lineHeight: 1.4,
        }}>
          {t('match.quickSheet.opponentRequired')}
        </div>
      )}

      {onSwitchToFullMatch && (
        <button
          type="button"
          onClick={onSwitchToFullMatch}
          style={{
            marginTop: 8, padding: '10px 14px', borderRadius: 10,
            background: 'transparent', border: '1.5px dashed var(--border)',
            color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textAlign: 'center',
          }}
        >
          {t('match.quickSheet.switchToFullMatch')}
        </button>
      )}
    </div>
  );

  // ─── Page mode wrapper ─────────────────────────────────────────────────────
  if (isPageMode) {
    return (
      <>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          minHeight: '100dvh', background: 'var(--bg)',
        }}>
          <div style={{
            width: '100%', maxWidth: 720, margin: '0 auto',
            flex: 1, display: 'flex', flexDirection: 'column',
          }}>
            <PageHeader
              title={`⚡ ${t('match.list.quickMatch')}`}
              onBack={onClose}
            />
            <div style={{ paddingTop: 8, paddingBottom: 24 }}>
              {formContent}
            </div>
          </div>
        </div>
        {clubImportOpen && activeClub && (
          <ClubImportModal
            club={activeClub}
            existingNames={validPlayers.map(p => p.name.trim().toLowerCase())}
            onClose={() => setClubImportOpen(false)}
            onConfirm={(picked) => {
              handleImportFromClub(picked);
              setClubImportOpen(false);
            }}
          />
        )}
      </>
    );
  }

  // ─── Sheet mode (legacy bottom-sheet) ──────────────────────────────────────
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          animation: 'fadeIn .2s ease',
        }}
        role="dialog"
        aria-modal="true"
      >
        <style>{`
          @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
          @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        `}</style>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--surface)', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: 480, padding: '0 0 24px',
            maxHeight: '92dvh', overflowY: 'auto',
            animation: 'slideUp .25s ease',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 18px 14px',
          }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
              ⚡ {t('match.list.quickMatch')}
            </div>
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              style={{
                width: 32, height: 32, borderRadius: 10, border: 'none',
                background: 'var(--surface-var)', color: 'var(--text-muted)',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
          {formContent}
        </div>
      </div>
      {clubImportOpen && activeClub && (
        <ClubImportModal
          club={activeClub}
          existingNames={validPlayers.map(p => p.name.trim().toLowerCase())}
          onClose={() => setClubImportOpen(false)}
          onConfirm={(picked) => {
            handleImportFromClub(picked);
            setClubImportOpen(false);
          }}
        />
      )}
    </>
  );
}

// ═══ ClubImportModal ═══════════════════════════════════════════════════════
// Sub-modal pro Quick match — vybere hráče z aktivního klubu (multi-select).
// Filtr podle ageCategory pokud klub má hráče ve víc kategoriích.
// Audit 2026-04-29: paralelní k ClubImportSheet z AdminRosterSheet,
// ale jednodušší (bez position picker, bez team color).
function ClubImportModal({
  club,
  existingNames,
  onClose,
  onConfirm,
}: {
  club: { id: string; name: string; players: ClubPlayer[] };
  existingNames: string[];
  onClose: () => void;
  onConfirm: (picked: ClubPlayer[]) => void;
}) {
  const { t } = useI18n();
  const activePlayers = useMemo(
    () => (club.players ?? []).filter(p => p.active !== false),
    [club.players],
  );
  const existingSet = useMemo(
    () => new Set(existingNames.map(n => n.toLowerCase())),
    [existingNames],
  );

  // Kategorie viditelné v hráčích
  const categoriesInUse = useMemo(() => {
    const s = new Set<string>();
    for (const p of activePlayers) if (p.ageCategory) s.add(p.ageCategory);
    return [...s].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });
  }, [activePlayers]);

  const [category, setCategory] = useState<string>(
    categoriesInUse.length === 1 ? categoriesInUse[0] : 'all',
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const visiblePlayers = useMemo(() => {
    const filtered = category === 'all'
      ? activePlayers
      : activePlayers.filter(p => p.ageCategory === category);
    return [...filtered].sort((a, b) => {
      const ja = a.jerseyNumber || 999;
      const jb = b.jerseyNumber || 999;
      if (ja !== jb) return ja - jb;
      return a.name.localeCompare(b.name);
    });
  }, [activePlayers, category]);

  const toggleOne = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const visibleSelectable = visiblePlayers.filter(
    p => !existingSet.has(p.name.trim().toLowerCase()),
  );
  const allVisibleSelected = visibleSelectable.length > 0
    && visibleSelectable.every(p => selected[p.id]);

  const toggleAll = () => {
    setSelected(prev => {
      const next = { ...prev };
      const setTo = !allVisibleSelected;
      for (const p of visibleSelectable) next[p.id] = setTo;
      return next;
    });
  };

  const pickedCount = Object.values(selected).filter(Boolean).length;

  const handleConfirm = () => {
    const picked = activePlayers.filter(p => selected[p.id]);
    onConfirm(picked);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480,
          height: '85dvh', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        {/* Header */}
        <div style={{
          padding: '4px 14px 8px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>
              📥 {t('match.quickSheet.importFromClub')}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {club.name}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Category filter */}
        {categoriesInUse.length > 1 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            padding: '0 14px 8px',
          }}>
            <button
              type="button"
              onClick={() => setCategory('all')}
              style={chipStyle(category === 'all')}
            >
              {t('match.quickSheet.categoryAll')}
            </button>
            {categoriesInUse.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                style={chipStyle(category === cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Toggle all + Player list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
          {visibleSelectable.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              style={{
                width: '100%', padding: '8px', borderRadius: 8,
                background: 'transparent', color: 'var(--primary)',
                border: '1px dashed var(--primary)', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, marginBottom: 8,
              }}
            >
              {allVisibleSelected
                ? t('match.quickSheet.deselectAll')
                : t('match.quickSheet.selectAll')}
            </button>
          )}
          {visiblePlayers.length === 0 ? (
            <div style={{
              padding: '24px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: 13,
            }}>
              {t('match.quickSheet.noClubPlayersInCategory')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {visiblePlayers.map(p => {
                const alreadyAdded = existingSet.has(p.name.trim().toLowerCase());
                const isSelected = !!selected[p.id];
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8,
                      background: alreadyAdded
                        ? 'transparent'
                        : isSelected ? 'var(--primary-light)' : 'var(--surface-var)',
                      border: alreadyAdded
                        ? '1px dashed var(--border)'
                        : isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                      cursor: alreadyAdded ? 'default' : 'pointer',
                      opacity: alreadyAdded ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={alreadyAdded}
                      onChange={() => toggleOne(p.id)}
                      style={{ width: 18, height: 18, cursor: alreadyAdded ? 'default' : 'pointer' }}
                    />
                    <span style={{
                      width: 36, fontSize: 12, fontWeight: 800,
                      textAlign: 'center', color: 'var(--text-muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {p.jerseyNumber > 0 ? `#${p.jerseyNumber}` : '—'}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 14, fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.name}
                      {alreadyAdded && (
                        <span style={{
                          marginLeft: 6, fontSize: 10, fontWeight: 700,
                          color: 'var(--text-muted)',
                        }}>
                          ✓ {t('match.quickSheet.alreadyAdded')}
                        </span>
                      )}
                    </span>
                    {p.birthYear && (
                      <span style={{
                        fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {p.birthYear}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirm */}
        <div style={{ padding: '8px 14px 14px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleConfirm}
            disabled={pickedCount === 0}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: pickedCount > 0 ? 'var(--primary)' : 'var(--border)',
              color: pickedCount > 0 ? '#fff' : 'var(--text-muted)',
              fontWeight: 800, fontSize: 14,
              cursor: pickedCount > 0 ? 'pointer' : 'default',
            }}
          >
            {pickedCount > 0
              ? t('match.quickSheet.importNPlayers', { n: pickedCount })
              : t('match.quickSheet.selectAtLeastOne')}
          </button>
        </div>
      </div>
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 11px', borderRadius: 8,
    background: active ? 'var(--primary)' : 'var(--surface-var)',
    color: active ? '#fff' : 'var(--text-muted)',
    border: '1px solid var(--border)',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  };
}
