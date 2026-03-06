import type { Team } from '../../types/tournament.types';
import { colorSwatch } from '../../utils/team-colors';

export function TeamBadge({ team, size = 12 }: { team?: Team; size?: number }) {
  if (team?.logoBase64) {
    return <img src={team.logoBase64} alt={team.name} style={{ width: size, height: size, borderRadius: size / 3, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return <div style={colorSwatch(team?.color ?? '#ccc', size)} />;
}
