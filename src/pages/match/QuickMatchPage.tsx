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

interface Props {
  navigate: (p: Page) => void;
  prefillFromMatchId?: string;
}

export function QuickMatchPage({ navigate, prefillFromMatchId }: Props) {
  const handleCreate = useQuickMatchCreate(navigate);
  const matches = useMatchesStore(s => s.matches);

  // Pokud byl předán prefillFromMatchId, vyextrahujeme lineup z minulého
  // zápasu a předáme ho do QuickMatchSheet jako initial roster. User vidí
  // soupisku rovnou předvyplněnou, může editovat / přidávat / mazat.
  const initialPlayers: QuickMatchInitialPlayer[] | undefined = useMemo(() => {
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
  }, [matches, prefillFromMatchId]);

  return (
    <QuickMatchSheet
      mode="page"
      onClose={() => navigate({ name: 'match-list' })}
      onCreate={handleCreate}
      onSwitchToFullMatch={() => navigate({ name: 'match-create' })}
      initialPlayers={initialPlayers}
    />
  );
}
