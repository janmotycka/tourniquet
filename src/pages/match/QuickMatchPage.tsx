/**
 * QuickMatchPage — full-page wrapper kolem QuickMatchSheet (mode='page').
 *
 * Audit 2026-04-29: Match creation flow byl bottom-sheet modal, na rozdíl od
 * tournament wizardu (full page). User feedback: konzistentní = lepší UX.
 *
 * Tato page:
 * - Renderuje QuickMatchSheet v page mode (PageHeader + max-width 720)
 * - Handluje vytvoření matche přes useQuickMatchCreate hook
 * - Nabízí link "Plný zápas se sestavou" pro power users (klubový zápas
 *   s lineup, střídáním, hodnocením) → naviguje na CreateMatchPage.
 * - Volitelně předvyplní soupisku z minulého zápasu (prefillFromMatchId) —
 *   pro flow „další zápas se stejnou sestavou" (audit 2026-04-29 pt2).
 *
 * Použití: route 'match-quick' v App.tsx.
 */
import { useMemo } from 'react';
import type { Page } from '../../App';
import { QuickMatchSheet, type QuickMatchInitialPlayer } from '../../components/match/QuickMatchSheet';
import { useQuickMatchCreate } from '../../hooks/useQuickMatchCreate';
import { useMatchesStore } from '../../store/matches.store';
import { useSimpleSquadsStore } from '../../store/simpleSquads.store';

interface Props {
  navigate: (p: Page) => void;
  prefillFromMatchId?: string;
  /**
   * Audit 2026-05-23 J-5: prefill soupisky ze Simple squad (HomePage chip).
   * Dříve squad chip navigoval na match-list bez prefill → broken UX promise.
   */
  prefillSquadId?: string;
}

export function QuickMatchPage({ navigate, prefillFromMatchId, prefillSquadId }: Props) {
  const handleCreate = useQuickMatchCreate(navigate);
  const matches = useMatchesStore(s => s.matches);
  const squads = useSimpleSquadsStore(s => s.squads);

  // Pokud byl předán prefillFromMatchId, vyextrahujeme lineup z minulého
  // zápasu a předáme ho do QuickMatchSheet jako initial roster. User vidí
  // soupisku rovnou předvyplněnou, může editovat / přidávat / mazat.
  // prefillSquadId má prioritu (typicky z HomePage chipu).
  const initialPlayers: QuickMatchInitialPlayer[] | undefined = useMemo(() => {
    if (prefillSquadId) {
      const squad = squads.find(s => s.id === prefillSquadId);
      if (!squad || squad.players.length === 0) return undefined;
      return squad.players.map(name => ({ name }));
    }
    if (!prefillFromMatchId) return undefined;
    const source = matches.find(m => m.id === prefillFromMatchId);
    if (!source || source.lineup.length === 0) return undefined;
    return source.lineup.map(p => ({
      name: p.name,
      jerseyNumber: p.jerseyNumber || undefined,
      birthYear: p.birthYear,
      // Zachovat clubPlayerId, pokud byl hráč napojený na klubový roster —
      // ratings / stats se pak propíšou na ten samý profil.
      clubPlayerId: p.playerId.startsWith('manual-') ? undefined : p.playerId,
    }));
  }, [matches, prefillFromMatchId, prefillSquadId, squads]);

  // Audit 2026-05-25: tlačítko "Plný zápas se sestavou" odebráno pro football/floorball
  // — Quick flow už pokrývá veškerou funkčnost (lineup editor v match-detail tabu Sestava
  // umožňuje doplnit pozice, kapitány, attendance po vytvoření). CreateMatchPage zůstává
  // jako fallback **jen pro tennis team zápasy** (sub-matches), kam routuje App.tsx
  // přímo (match-create) bez nutnosti přepínat z Quick.
  return (
    <QuickMatchSheet
      mode="page"
      onClose={() => navigate({ name: 'match-list' })}
      onCreate={handleCreate}
      initialPlayers={initialPlayers}
    />
  );
}
