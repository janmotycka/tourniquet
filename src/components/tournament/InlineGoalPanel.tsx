import type { Match, Team } from '../../types/tournament.types';
import { textOnColor } from '../../utils/team-colors';
import { useI18n } from '../../i18n';

export function InlineGoalPanel({ match, teams, teamId, onGoal, onClose }: {
  match: Match;
  teams: Team[];
  teamId: string;         // předvybraný tým (domácí nebo hosté)
  onGoal: (matchId: string, teamId: string, playerId: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const team = teams.find(tm => tm.id === teamId);
  const teamColor = team?.color ?? '#666';

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: '0 0 14px 14px',
      boxShadow: `0 0 0 2px ${teamColor}`,
      overflow: 'hidden',
    }}>
      {/* Hlavička s barvou týmu */}
      <div style={{
        background: teamColor, padding: '6px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {team?.logoBase64
            ? <img src={team.logoBase64} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
            : null
          }
          <span style={{ color: textOnColor(teamColor), fontWeight: 700, fontSize: 13 }}>
            ⚽ {team?.name ?? '?'}
          </span>
        </div>
        <button onClick={onClose} style={{ color: textOnColor(teamColor), opacity: 0.75, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>✕</button>
      </div>

      {/* Hráči */}
      <div style={{ padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {/* Bez střelce */}
        <button
          onClick={() => { onGoal(match.id, teamId, null); onClose(); }}
          style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            border: '1.5px dashed var(--border)',
          }}
        >
          {t('tournament.detail.noScorer')}
        </button>

        {(team?.players ?? [])
          .slice()
          .sort((a, b) => a.jerseyNumber - b.jerseyNumber)
          .map(p => (
            <button
              key={p.id}
              onClick={() => { onGoal(match.id, teamId, p.id); onClose(); }}
              style={{
                padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: teamColor, color: textOnColor(teamColor),
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <span style={{
                background: 'rgba(255,255,255,.22)', borderRadius: 4, padding: '1px 5px',
                fontSize: 11, fontWeight: 800, minWidth: 20, textAlign: 'center',
              }}>{p.jerseyNumber}</span>
              {p.name}
            </button>
          ))}

        {(team?.players ?? []).length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
            Žádní hráči v soupisce.
          </span>
        )}
      </div>
    </div>
  );
}
