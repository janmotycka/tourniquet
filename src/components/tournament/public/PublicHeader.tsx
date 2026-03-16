import { useState } from 'react';
import type { Page } from '../../../App';
import type { Tournament, Match } from '../../../types/tournament.types';
import { useI18n, getDateLocale } from '../../../i18n';
import { LiveBannerTimer } from './LiveBannerTimer';
import { Dropdown, DropdownIconCircle } from '../../ui/Dropdown';
import type { DropdownItem } from '../../ui/Dropdown';

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
  tabs: { id: Tab; label: string; highlight?: boolean }[];
}

export function PublicHeader({
  tournament, tournamentId, navigate, isTournamentOwner, hasJoined,
  onShowLeaveConfirm, liveMatch, tab, setTab, tabs,
}: PublicHeaderProps) {
  const { t, locale } = useI18n();

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
            {new Date(tournament.settings.startDate).toLocaleDateString(getDateLocale(locale), { day: 'numeric', month: 'long', year: 'numeric' })} · {t('tournament.public.teamsValue', { count: tournament.teams.length })}
          </div>
        </div>
        {/* Pravý roh: sdílení + admin/leave */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <ShareDropdownButton tournamentId={tournamentId} tournament={tournament} />
          {isTournamentOwner ? (
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
            <>
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
            </>
          ) : null}
        </div>
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
            <span style={{
              fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
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
            color: tab === tabItem.id ? 'var(--primary)' : tabItem.highlight ? '#E53935' : 'var(--text-muted)',
            borderBottom: tab === tabItem.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            whiteSpace: 'nowrap',
          }}>{tabItem.label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Share dropdown button (for all users) ──────────────────────────────────
function ShareDropdownButton({ tournamentId, tournament }: { tournamentId: string; tournament: Tournament }) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);

  const getUrl = () => `${window.location.origin}${window.location.pathname}#tournament=${tournamentId}`;

  const getShareText = () => {
    const url = getUrl();
    const date = new Date(tournament.settings.startDate).toLocaleDateString(
      getDateLocale(locale), { day: 'numeric', month: 'long' },
    );
    return `🏆 ${tournament.name}\n📅 ${date} · ${tournament.teams.length} ${t('tournament.public.teamsLabel')}\n\n👉 ${t('tournament.public.shareDesc')}\n${url}`;
  };

  const copyLink = async () => {
    const text = getShareText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const WA_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.11.546 4.095 1.504 5.82L0 24l6.335-1.627A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.82c-1.87 0-3.63-.5-5.14-1.37l-.37-.22-3.76.97.99-3.65-.24-.38A9.79 9.79 0 012.18 12c0-5.42 4.4-9.82 9.82-9.82 5.42 0 9.82 4.4 9.82 9.82 0 5.42-4.4 9.82-9.82 9.82z"/></svg>;
  const FB_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>;
  const COPY_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>;
  const SHARE_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>;

  const items: DropdownItem[] = [
    {
      id: 'whatsapp', label: 'WhatsApp',
      icon: <DropdownIconCircle color="#25D366">{WA_ICON}</DropdownIconCircle>,
      onClick: () => window.open(`https://wa.me/?text=${encodeURIComponent(getShareText())}`, '_blank'),
    },
    {
      id: 'facebook', label: 'Facebook',
      icon: <DropdownIconCircle color="#1877F2">{FB_ICON}</DropdownIconCircle>,
      onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getUrl())}`, '_blank', 'width=600,height=400'),
    },
    {
      id: 'copy', label: copied ? '✅' : t('common.copyLink'),
      icon: <DropdownIconCircle color="var(--text-muted)">{COPY_ICON}</DropdownIconCircle>,
      onClick: copyLink,
    },
  ];

  if (typeof navigator !== 'undefined' && navigator.share) {
    items.push({
      id: 'native', label: t('tournament.public.shareTitle'),
      icon: <DropdownIconCircle color="#666">{SHARE_ICON}</DropdownIconCircle>,
      onClick: async () => {
        try { await navigator.share({ title: tournament.name, text: getShareText(), url: getUrl() }); } catch { /* */ }
      },
    });
  }

  return (
    <Dropdown
      trigger={<span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, lineHeight: 1 }}><span style={{ fontSize: 14 }}>{copied ? '✅' : '📤'}</span> {t('common.share')}</span>}
      triggerStyle={{
        height: 32, borderRadius: 8, padding: '0 10px',
        background: copied ? '#E8F5E9' : 'var(--surface-var)',
        border: '1.5px solid var(--border)',
      }}
      items={items}
      align="right"
    />
  );
}
