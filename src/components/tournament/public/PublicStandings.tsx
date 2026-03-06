import type { Tournament } from '../../../types/tournament.types';
import { computeStandings } from '../../../utils/tournament-schedule';
import { useI18n } from '../../../i18n';
import { BracketView } from '../../BracketView';
import { PublicTeamBadge } from './PublicTeamBadge';

export function PublicStandings({ tournament, selectedTeamId }: { tournament: Tournament; selectedTeamId: string | null }) {
  const { t } = useI18n();
  const standings = computeStandings(
    tournament.matches,
    tournament.teams,
    tournament.settings.tiebreakerOrder,
    tournament.settings.penaltyResults,
  );
  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  if (standings.every(s => s.played === 0)) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🏆</div>
        <p>{t('tournament.public.notStarted')}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 28px 28px 28px 40px 36px', gap: 4, padding: '8px 12px', background: 'var(--surface-var)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
          <span>#</span><span>{t('tournament.public.team')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.played')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.won')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.lost')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.goalsFor')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.points')}</span>
        </div>
        {standings.map((s, idx) => {
          const team = getTeam(s.teamId);
          const isFirst = idx === 0 && s.played > 0;
          const isHighlighted = selectedTeamId === s.teamId;
          const teamColor = team?.color ?? 'var(--primary)';
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
          return (
            <div key={s.teamId} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 28px 28px 28px 40px 36px', gap: 4,
              padding: '10px 12px', alignItems: 'center',
              borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
              background: isHighlighted ? `${teamColor}18` : isFirst ? 'var(--primary-light)' : 'transparent',
              borderLeft: isHighlighted ? `3px solid ${teamColor}` : '3px solid transparent',
            }}>
              <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                {idx + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {medal && <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{medal}</span>}
                <PublicTeamBadge team={team} size={16} />
                <span style={{ fontWeight: isHighlighted || isFirst ? 800 : 600, fontSize: 14 }}>{team?.name ?? '?'}</span>
              </div>
              <span style={{ textAlign: 'center', fontSize: 13 }}>{s.played}</span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#2E7D32', fontWeight: 600 }}>{s.won}</span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#C62828', fontWeight: 600 }}>{s.lost}</span>
              <span style={{ textAlign: 'center', fontSize: 12 }}>{s.goalsFor}:{s.goalsAgainst}</span>
              <span style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: isFirst ? 'var(--primary)' : 'var(--text)' }}>{s.points}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
        {t('tournament.public.standingsLegend')}
      </div>

      {/* Knockout bracket pod tabulkou */}
      {tournament.matches.some(m => m.stage && m.stage !== 'group') && (
        <div style={{ marginTop: 16 }}>
          <BracketView
            matches={tournament.matches.filter(m => m.stage && m.stage !== 'group')}
            teams={tournament.teams}
          />
        </div>
      )}
    </div>
  );
}
