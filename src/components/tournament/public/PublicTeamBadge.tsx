import type { Team } from '../../../types/tournament.types';
import { colorSwatch } from '../../../utils/team-colors';

export function PublicTeamBadge({ team, size = 12 }: { team: Team | undefined; size?: number }) {
  if (!team) return <div style={{ width: size, height: size, borderRadius: Math.floor(size / 3), background: '#ccc', flexShrink: 0 }} />;
  if (team.logoBase64) {
    return <img src={team.logoBase64} alt={team.name} style={{ width: size, height: size, borderRadius: Math.floor(size / 3), objectFit: 'cover', flexShrink: 0 }} />;
  }
  return <div style={colorSwatch(team.color ?? '#ccc', size)} />;
}
