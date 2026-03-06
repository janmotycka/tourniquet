import type { Page } from '../../../App';
import type { Tournament, Match } from '../../../types/tournament.types';
import { useI18n } from '../../../i18n';
import { LiveBannerTimer } from './LiveBannerTimer';

type Tab = 'standings' | 'results' | 'scorers' | 'rules' | 'chat';

interface PublicHeaderProps {
  tournament: Tournament;
  tournamentId: string;
  navigate: (p: Page) => void;
  isTournamentOwner: boolean;
  hasJoined: boolean;
  onShowLeaveConfirm: () => void;
  liveMatch: Match | undefined;
  tab: Tab;
  setTab: (tab: Tab) => void;
  tabs: { id: Tab; label: string }[];
}

export function PublicHeader({
  tournament, tournamentId, navigate, isTournamentOwner, hasJoined,
  onShowLeaveConfirm, liveMatch, tab, setTab, tabs,
}: PublicHeaderProps) {
  const { t } = useI18n();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            🏆 {tournament.name}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {new Date(tournament.settings.startDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })} · {t('tournament.public.teamsValue', { count: tournament.teams.length })}
          </div>
        </div>
        {/* Tlačítko pro připojení/odpojení rozhodčího — nenápadné, v pravém rohu */}
        {isTournamentOwner ? (
          /* Vlastník — tlačítko pro přechod do admin detailu */
          <button
            onClick={() => navigate({ name: 'tournament-detail', tournamentId })}
            title={t('tournament.public.openAdmin')}
            style={{
              flexShrink: 0, height: 32, borderRadius: 8, padding: '0 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: 'var(--primary)', border: 'none', color: '#fff',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1,
            }}
          >
            ⚙️ Admin
          </button>
        ) : hasJoined ? (
          /* Připojený rozhodčí — volba otevřít admin nebo opustit */
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => navigate({ name: 'tournament-detail', tournamentId })}
              title={t('tournament.public.openAdmin')}
              style={{
                height: 32, borderRadius: 8, padding: '0 10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                background: 'var(--primary)', border: 'none', color: '#fff',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1,
              }}
            >
              ⚙️ Admin
            </button>
            <button
              onClick={onShowLeaveConfirm}
              title={t('tournament.public.leaveTitle')}
              style={{
                width: 32, height: 32, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#FFEBEE', border: '1.5px solid #FFCDD2',
                cursor: 'pointer', fontSize: 16, lineHeight: 1,
              }}
            >
              🚪
            </button>
          </div>
        ) : null /* Nepřipojený divák — žádné admin tlačítko, join jen přes ?join=1 odkaz */}
      </div>

      {/* Live banner s timerem */}
      {liveMatch && (() => {
        const homeTeam = tournament.teams.find(tm => tm.id === liveMatch.homeTeamId);
        const awayTeam = tournament.teams.find(tm => tm.id === liveMatch.awayTeamId);
        return (
          <div style={{
            background: 'linear-gradient(90deg, #B71C1C, #C62828)', color: '#fff',
            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            {/* Pulzující tečka */}
            <div style={{ width: 10, height: 10, borderRadius: 5, background: '#fff', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0 }}>
              {t('tournament.public.liveLabel')}: {homeTeam?.name ?? '?'} {liveMatch.homeScore}:{liveMatch.awayScore} {awayTeam?.name ?? '?'}
            </span>
            {/* Timer */}
            <LiveBannerTimer match={liveMatch} />
          </div>
        );
      })()}

      {/* Tab bar */}
      <div style={{ display: 'flex', padding: '0 8px' }}>
        {tabs.map(tabItem => (
          <button key={tabItem.id} onClick={() => setTab(tabItem.id)} style={{
            flex: 1, padding: '10px 4px', fontWeight: 600, fontSize: 12,
            color: tab === tabItem.id ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === tabItem.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            whiteSpace: 'nowrap',
          }}>{tabItem.label}</button>
        ))}
      </div>
    </div>
  );
}
