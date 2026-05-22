/**
 * useMatchSmartDefaults — sjednocený zdroj defaults pro vytvoření zápasu.
 *
 * Audit 2026-05-22 Phase 1b: dříve byla smart defaults logika rozdělena
 * mezi `CreateMatchPage.lastMatch` useMemo + ad-hoc fallbacks v `useQuickMatchCreate`.
 * Tento hook to sjednocuje: jeden source of truth pro Quick i Full match flow.
 *
 * Vrací smart defaults na základě:
 * - **lastMatch** — posledně vytvořený zápas (formát, soutěž, periods, atd.)
 * - **activeClub** — kategorie, název týmu
 * - **preferredSport** — sport-aware fallbacks (4+1 floorball, 5+1 fotbal)
 *
 * Použití:
 *   const defaults = useMatchSmartDefaults();
 *   const [matchFormat, setMatchFormat] = useState(defaults.matchFormat);
 *   const [periods, setPeriods] = useState(defaults.periods);
 *   ...
 */
import { useMemo } from 'react';
import { useMatchesStore } from '../store/matches.store';
import { useClubsStore } from '../store/clubs.store';
import { useUserPrefsStore } from '../store/userPrefs.store';
import type { MatchFormat } from '../types/match.types';

export interface MatchSmartDefaults {
  /** Match format (5+1 fotbal default, 4+1 florbal default). */
  matchFormat: MatchFormat;
  /** Počet poločasů (default 1, lastMatch fallback 2 pokud byl). */
  periods: number;
  /** Délka jedné periody v minutách (default 15 nebo z lastMatch). */
  periodDuration: number;
  /** Celková délka zápasu v minutách (= periods × periodDuration). */
  durationMinutes: number;
  /** Soutěž — z lastMatch (užitečné pokud trenér hraje stejnou ligu). */
  competition: string;
  /** Track assists — z lastMatch (default false pro Simple users). */
  trackAssists: boolean;
  /** Náš tým name — z aktivního klubu. */
  myTeamName: string;
  /** Doporučená kategorie — z aktivního klubu (první v seznamu). */
  ageCategory: string;
  /**
   * Sub assistant suggestion — null pokud user nemá lavičku potential.
   * Pokud roster.length >= starterCount + 2 → suggested settings.
   */
  subAssistantSuggestion: {
    enabled: boolean;
    intervalMinutes: number;
    playersAtOnce: number;
  };
  /**
   * Existuje lastMatch? Pro UI „💡 Použít nastavení z minule" banner.
   */
  hasLastMatch: boolean;
  /** Datum/čas lastMatch — pro „14. 5." UX hint v banneru. */
  lastMatchLabel: string | null;
}

export function useMatchSmartDefaults(): MatchSmartDefaults {
  const allMatches = useMatchesStore(s => s.matches);
  const clubs = useClubsStore(s => s.clubs);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const preferredSport = useUserPrefsStore(s => s.preferredSport);

  const activeClub = useMemo(
    () => clubs.find(c => c.id === activeClubId) ?? null,
    [clubs, activeClubId],
  );

  // Filter matches by sport — typický scenario: trenér přepne sport,
  // nechceme prefill z fotbalu když právě dělá florbal.
  const lastMatch = useMemo(() => {
    const filtered = allMatches.filter(m => {
      if (!m) return false;
      const sport = m.sport ?? 'football';
      return sport === preferredSport;
    });
    if (filtered.length === 0) return null;
    return [...filtered].sort((a, b) => {
      const ac = a?.createdAt ?? '';
      const bc = b?.createdAt ?? '';
      return bc.localeCompare(ac);
    })[0];
  }, [allMatches, preferredSport]);

  const isFloorball = preferredSport === 'floorball';
  const defaultFormat: MatchFormat = isFloorball ? '4+1' : '5+1';

  // Format hint label — pro UX banner („14. 5.")
  const lastMatchLabel = useMemo(() => {
    if (!lastMatch?.date) return null;
    try {
      const d = new Date(lastMatch.date);
      const day = d.getDate();
      const month = d.getMonth() + 1;
      return `${day}. ${month}.`;
    } catch {
      return null;
    }
  }, [lastMatch]);

  // Sub assistant suggestion logic — jen pokud user měl historii s rotací
  const subAssistantSuggestion = useMemo(() => {
    const lastSub = lastMatch?.substitutionSettings;
    return {
      enabled: false, // smart auto-on logic runs in UI s threshold check
      intervalMinutes: lastSub?.intervalMinutes ?? 5,
      playersAtOnce: lastSub?.playersAtOnce ?? 1,
    };
  }, [lastMatch]);

  const periods = lastMatch?.periods ?? 1;
  const periodDuration = lastMatch?.periodDurationMinutes ?? 15;

  return {
    matchFormat: (lastMatch?.matchFormat as MatchFormat | undefined) ?? defaultFormat,
    periods,
    periodDuration,
    durationMinutes: periods * periodDuration,
    competition: lastMatch?.competition ?? '',
    trackAssists: lastMatch?.trackAssists ?? false,
    myTeamName: activeClub?.name ?? '',
    ageCategory: lastMatch?.ageCategory ?? activeClub?.ageCategories?.[0] ?? '',
    subAssistantSuggestion,
    hasLastMatch: lastMatch != null,
    lastMatchLabel,
  };
}
