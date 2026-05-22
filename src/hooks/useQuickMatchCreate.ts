/**
 * useQuickMatchCreate — sdílený handler pro vytvoření rychlého zápasu.
 *
 * Předtím byla logika v MatchListPage.handleQuickMatchCreate (kvůli sheet
 * mode). Audit 2026-04-29: po konverzi QuickMatchSheet na page mode
 * potřebujeme stejnou logiku v page route handleru — extrakce do hooku.
 *
 * Audit 2026-04-29 (refaktor 2): roster signature rozšířena z `string[]` na
 * `QuickMatchRosterEntry[]` (jméno + volitelný dres + ročník + clubPlayerId).
 * Lineup teď uchovává čísla dresů a ročníky pokud uživatel vyplnil.
 *
 * Hook returnuje handler, který:
 * 1. Vytvoří match přes createMatch store action
 * 2. Spustí ho přes startMatch (rovnou jde do live módu)
 * 3. Naviguje na match-detail
 *
 * Privacy: clubId je activeClubId, nebo 'individual-quick' pokud user
 * nemá aktivní klub (Simple mode / non-club user).
 */
import { useCallback } from 'react';
import type { Page } from '../App';
import { useMatchesStore } from '../store/matches.store';
import { useClubsStore } from '../store/clubs.store';
import { useUserPrefsStore } from '../store/userPrefs.store';
import { useI18n } from '../i18n';
import type {
  QuickMatchPreset,
  QuickMatchRosterEntry,
} from '../components/match/QuickMatchSheet';

export function useQuickMatchCreate(navigate: (p: Page) => void) {
  const createMatch = useMatchesStore(s => s.createMatch);
  const startMatch = useMatchesStore(s => s.startMatch);
  const clubs = useClubsStore(s => s.clubs);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const { t } = useI18n();

  return useCallback((
    opponent: string,
    roster: QuickMatchRosterEntry[],
    _squadId?: string,
    preset?: QuickMatchPreset,
  ) => {
    void _squadId; // pro budoucí audit trail (squad → match)
    const activeClub = clubs.find(c => c.id === activeClubId);
    const now = new Date();
    // Audit 2026-04-29 pt3: progressive disclosure — preset může obsahovat
    // user-zadané datum/čas/soutěž/kategorii. Fallback = teď + dnes.
    const today = preset?.date ?? now.toISOString().split('T')[0];
    const timeStr = preset?.kickoffTime
      ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    // Audit 2026-04-24 (P2.3): preset volitelný. Fallback = 15 min 1 perioda 5+1.
    // Audit 2026-04-25: Florbal default 4+1.
    const durationMinutes = preset?.durationMinutes ?? 15;
    const periods = preset?.periods ?? 1;
    const isFloorball = preferredSport === 'floorball';
    const matchFormat = preset?.matchFormat ?? (isFloorball ? '4+1' : '5+1');
    const periodDurationMinutes = Math.max(1, Math.round(durationMinutes / periods));

    // Audit 2026-05-22: sub assistant podporuje auto-rozdělení.
    // Match format „5+1" = 5 hráčů v poli + 1 brankář = celkem 6 starters.
    // Pokud user zapnul sub assistant, rozdělí prvních N jako starter,
    // zbytek na lavičku v pořadí jak je v rosteru.
    const startersCount = (() => {
      const m = matchFormat.match(/^(\d+)\+(\d+)$/);
      if (!m) return roster.length;
      return parseInt(m[1], 10) + parseInt(m[2], 10);
    })();
    const useSubAssistant = !!preset?.subAssistant && roster.length > startersCount;

    // Lineup zachovává jersey number + birthYear pokud user vyplnil (volitelné).
    // Pokud byl hráč importován z klubu, použijeme jeho clubPlayerId jako
    // playerId — propojí stats / hodnocení na klubový roster.
    const lineup = roster.map((entry, i) => ({
      playerId: entry.clubPlayerId ?? `manual-${i}-${now.getTime()}`,
      jerseyNumber: entry.jerseyNumber ?? 0,
      name: entry.name,
      birthYear: entry.birthYear,
      // Auto-split: prvních startersCount = isStarter, zbytek = bench
      isStarter: useSubAssistant ? i < startersCount : true,
      substituteOrder: useSubAssistant && i >= startersCount ? i - startersCount + 1 : 0,
      // Audit 2026-05-22 Stage 2b: kapitán z presetu
      isCaptain: entry.isCaptain,
    }));
    const match = createMatch({
      sport: isFloorball ? 'floorball' : 'football',
      matchType: 'single',
      clubId: activeClub?.id ?? 'individual-quick',
      // Audit 2026-05-06: explicit myTeamName z presetu má prioritu před
      // názvem aktivního klubu — user může chtít „Vrchovina B" nebo Simple
      // mode bez klubu vůbec definovat vlastní název.
      clubName: preset?.myTeamName?.trim() || activeClub?.name,
      opponent: opponent.trim() || t('match.list.quickMatchDefaultOpponent'),
      // Audit 2026-04-29: isHome + venue z presetu (collapsed accordion).
      // Default true (doma) pokud user accordion neotevřel.
      isHome: preset?.isHome ?? true,
      venue: preset?.venue,
      date: today,
      kickoffTime: timeStr,
      competition: preset?.competition ?? '',
      ageCategory: preset?.ageCategory,
      durationMinutes,
      periods,
      periodDurationMinutes,
      matchFormat,
      lineup,
      // Audit 2026-05-22 Stage 2: trackAssists z presetu (default false).
      trackAssists: preset?.trackAssists ?? false,
      // Audit 2026-05-22: sub assistant — settings z presetu (volitelné).
      substitutionSettings: preset?.subAssistant,
      // Audit 2026-04-29: označit jako rychlý zápas — UI některé Advanced
      // featury (FAČR hlášení) skryje pro Quick zápasy.
      isQuickMatch: true,
    });
    startMatch(match.id);
    navigate({ name: 'match-detail', matchId: match.id });
  }, [clubs, activeClubId, preferredSport, createMatch, startMatch, navigate, t]);
}
