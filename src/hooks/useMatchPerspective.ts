/**
 * useMatchPerspective — vrací, jakou „perspektivu" má aktuálně přihlášený
 * uživatel na daný zápas (home / away / viewer).
 *
 * Cross-team pairing: jeden match document slouží oběma trenérům (home + away).
 * Data zůstávají uložená v perspektivě vytvořitele (isHome, homeScore, awayScore,
 * opponent, clubName), ale UI musí zrcadlit pohled pro opozičního trenéra —
 * jeho tým je „my", soupeř je stále „oni".
 *
 * Vztah mezi role → data flip:
 *   role='home'  → žádný flip, mirror scores: { my: homeScore or awayScore dle isHome, their: opačně }
 *   role='away'  → naopak: perspektiva opozice, myTeam=originální `opponent`, theirTeam=original clubName
 *   role='viewer' → čtení-jen, používá creator perspektivu
 *
 * Konkrétně:
 *   - `myTeamName`, `theirTeamName` — jak pojmenovat týmy v UI
 *   - `myScore`, `theirScore` — skóre mého týmu vs soupeře
 *   - `isGoalMine(goal)` — byl to gól mého týmu? (přepočítává podle perspektivy)
 *   - `lineup` — pokud role='away', sestava creator-e NENÍ moje, takže se zamlčí
 *     (away coach používá svoji sestavu, kterou si může uložit lokálně)
 */

import { useMemo } from 'react';
import type { SeasonMatch, MatchGoal } from '../types/match.types';
import { useAuth } from '../context/AuthContext';
import { useClubsStore } from '../store/clubs.store';

export type MatchRole = 'home' | 'away' | 'viewer';

export interface MatchPerspective {
  /** Role aktuálně přihlášeného uživatele vůči tomuto zápasu. */
  role: MatchRole;
  /** Je uživatel home coach (= vytvořitel zápasu nebo člen klubu-vlastníka)? */
  isHomeCoach: boolean;
  /** Je uživatel paired away coach? */
  isAwayCoach: boolean;
  /** Jak zobrazit jméno MÉHO týmu. */
  myTeamName: string;
  /** Jak zobrazit jméno SOUPEŘOVA týmu. */
  theirTeamName: string;
  /** Skóre mého týmu (pohled uživatele). */
  myScore: number;
  /** Skóre soupeře. */
  theirScore: number;
  /** Hraje můj tým doma? (pro layout hřiště, ceremonie) */
  myTeamIsHome: boolean;
  /** Pomoc pro UI — ověří jestli je daný gól „můj" (mého týmu). */
  isGoalMine: (goal: Pick<MatchGoal, 'isOpponentGoal' | 'isOwnGoal'>) => boolean;
}

/** Detekce, jestli je zápas spárovaný (má awayCoachUid). */
export function isPairedMatch(match: SeasonMatch | null | undefined): boolean {
  return !!(match?.pairing?.awayCoachUid);
}

export function useMatchPerspective(match: SeasonMatch | null | undefined): MatchPerspective {
  const { user } = useAuth();
  const memberOfClubs = useClubsStore(s => s.memberOfClubs);

  return useMemo<MatchPerspective>(() => {
    if (!match) {
      return {
        role: 'viewer',
        isHomeCoach: false,
        isAwayCoach: false,
        myTeamName: '',
        theirTeamName: '',
        myScore: 0,
        theirScore: 0,
        myTeamIsHome: true,
        isGoalMine: () => false,
      };
    }

    const uid = user?.uid ?? null;
    const awayUid = match.pairing?.awayCoachUid ?? null;
    const clubId = match.clubId;
    const isClubMember = !!(clubId && !clubId.startsWith('individual-') && memberOfClubs[clubId]);
    // Home coach = vlastník zápasu nebo člen klubu-vlastníka
    const isHomeCoach = !!(uid && (
      // Legacy per-user scope (clubId absent nebo individual) → vlastník je uid rovnající se "scopeId",
      // ale bez vazby na clubId to nezjistíme — pokud ale není awayCoach, a zápas je z jiného scope,
      // fallback je že každý non-away je viewer. Proto:
      isClubMember || (!clubId || clubId.startsWith('individual-'))
        ? awayUid !== uid      // nejsem away → jsem home (pokud mám klub/individual přístup)
        : false
    ));
    const isAwayCoach = !!(uid && awayUid && uid === awayUid);

    let role: MatchRole = 'viewer';
    if (isAwayCoach) role = 'away';
    else if (isHomeCoach) role = 'home';

    // Creator perspektiva:
    //   match.isHome == true  → creator je home, skóre creator-e je homeScore
    //   match.isHome == false → creator je away, skóre creator-e je awayScore
    const creatorTeamName = match.clubName || 'Můj tým';
    const opponentTeamName = match.pairing?.awayClubName || match.opponent;

    const creatorScore = match.isHome ? match.homeScore : match.awayScore;
    const opponentScore = match.isHome ? match.awayScore : match.homeScore;

    if (role === 'away') {
      // Flip: můj = opponent (z dat), jejich = creator
      return {
        role,
        isHomeCoach: false,
        isAwayCoach: true,
        myTeamName: opponentTeamName,
        theirTeamName: creatorTeamName,
        myScore: opponentScore,
        theirScore: creatorScore,
        myTeamIsHome: !match.isHome,
        // Gól je „můj" pokud je to gól soupeře (z creator pohledu isOpponentGoal=true)
        // nebo pokud creator own-goaloval (isOwnGoal).
        isGoalMine: (g) => !!(g.isOpponentGoal || g.isOwnGoal),
      };
    }

    // Home / viewer — bez flipu
    return {
      role,
      isHomeCoach: role === 'home',
      isAwayCoach: false,
      myTeamName: creatorTeamName,
      theirTeamName: opponentTeamName,
      myScore: creatorScore,
      theirScore: opponentScore,
      myTeamIsHome: match.isHome,
      isGoalMine: (g) => !g.isOpponentGoal && !g.isOwnGoal,
    };
  }, [match, user?.uid, memberOfClubs]);
}
