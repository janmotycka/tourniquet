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
 *
 * Použití: route 'match-quick' v App.tsx.
 */
import type { Page } from '../../App';
import { QuickMatchSheet } from '../../components/match/QuickMatchSheet';
import { useQuickMatchCreate } from '../../hooks/useQuickMatchCreate';

interface Props {
  navigate: (p: Page) => void;
}

export function QuickMatchPage({ navigate }: Props) {
  const handleCreate = useQuickMatchCreate(navigate);

  return (
    <QuickMatchSheet
      mode="page"
      onClose={() => navigate({ name: 'match-list' })}
      onCreate={handleCreate}
      onSwitchToFullMatch={() => navigate({ name: 'match-create' })}
    />
  );
}
