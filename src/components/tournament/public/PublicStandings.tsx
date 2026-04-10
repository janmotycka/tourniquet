import { useState } from 'react';
import type { Tournament } from '../../../types/tournament.types';
import { computeStandings } from '../../../utils/tournament-schedule';
import { useI18n, getDateLocale } from '../../../i18n';
import { BracketView } from '../../BracketView';
import { PublicTeamBadge } from './PublicTeamBadge';
import { StandingsCriteriaBox } from './StandingsCriteriaBox';

const GRID_COLS = '22px 1fr 22px 22px 22px 36px 30px';

export function PublicStandings({ tournament, selectedTeamId, onSwitchToResults }: { tournament: Tournament; selectedTeamId: string | null; onSwitchToResults?: () => void }) {
  const { t, locale } = useI18n();
  const [infoOpen, setInfoOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  const hasLiveMatch = tournament.matches.some(m => m.status === 'live');
  const [showLive, setShowLive] = useState(true);

  // Tabulka včetně live zápasů (pro zobrazení)
  const standings = computeStandings(
    tournament.matches,
    tournament.teams,
    tournament.settings.tiebreakerOrder,
    tournament.settings.penaltyResults,
    showLive,
  );

  // Tabulka BEZ live zápasů (pro výpočet posunu)
  const baseStandings = (hasLiveMatch && showLive)
    ? computeStandings(
        tournament.matches,
        tournament.teams,
        tournament.settings.tiebreakerOrder,
        tournament.settings.penaltyResults,
        false,
      )
    : null;

  // Mapa: teamId → pozice v base standings (1-indexed)
  const basePositionMap = new Map<string, number>();
  if (baseStandings) {
    baseStandings.forEach((s, i) => basePositionMap.set(s.teamId, i + 1));
  }

  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  const { settings } = tournament;
  const rules = settings.rules;

  // Compute time range
  const sortedMatches = [...tournament.matches].sort((a, b) =>
    new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
  );
  const firstMatch = sortedMatches[0];
  const lastMatch = sortedMatches[sortedMatches.length - 1];
  const endTime = lastMatch
    ? new Date(new Date(lastMatch.scheduledTime).getTime() + lastMatch.durationMinutes * 60 * 1000)
    : null;
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(getDateLocale(locale), { hour: '2-digit', minute: '2-digit' });

  const liveChip = hasLiveMatch ? (
    <button
      onClick={() => setShowLive(v => !v)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
        background: showLive ? 'var(--danger)' : 'var(--surface-var)',
        color: showLive ? '#fff' : 'var(--text-muted)',
        border: showLive ? 'none' : '1px solid var(--border)',
        cursor: 'pointer', transition: 'all .2s',
      }}
    >
      {showLive && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#fff', animation: 'pulse 1.5s infinite' }} />}
      {showLive ? 'LIVE' : 'Bez LIVE'}
    </button>
  ) : null;

  const format = settings.format ?? 'round-robin';
  const groups = settings.groups ?? [];
  const advance = settings.advancePerGroup ?? 1;

  const isTeamInLive = (teamId: string) => hasLiveMatch && tournament.matches.some(
    m => m.status === 'live' && (m.homeTeamId === teamId || m.awayTeamId === teamId),
  );

  // Shared footer (bracket, info, rules, criteria) — rendered below both views
  const sharedFooter = (
    <>
      {/* Knockout bracket */}
      {tournament.matches.some(m => m.stage && m.stage !== 'group') && (
        <div style={{ marginTop: 16 }}>
          <BracketView
            matches={tournament.matches.filter(m => m.stage && m.stage !== 'group')}
            teams={tournament.teams}
            onLiveClick={onSwitchToResults}
          />
        </div>
      )}

      {/* ── Kompaktní info o turnaji ── */}
      <div style={{
        marginTop: 16, background: 'var(--surface)', borderRadius: 14,
        overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
      }}>
        <div
          onClick={() => setInfoOpen(!infoOpen)}
          style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: infoOpen ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 14 }}>📋</span>
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{t('tournament.public.tournamentInfo')}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: infoOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
        {infoOpen && [
          {
            icon: '📅',
            value: new Date(settings.startDate).toLocaleDateString(getDateLocale(locale), { weekday: 'short', day: 'numeric', month: 'long' }),
          },
          firstMatch && {
            icon: '🕐',
            value: `${formatTime(firstMatch.scheduledTime)}${endTime ? ` – ${endTime.toLocaleTimeString(getDateLocale(locale), { hour: '2-digit', minute: '2-digit' })}` : ''}`,
          },
          {
            icon: '⏱',
            value: `${settings.matchDurationMinutes} min` + (settings.breakBetweenMatchesMinutes > 0 ? ` · ${t('tournament.public.breakShort')} ${settings.breakBetweenMatchesMinutes} min` : ''),
          },
          (settings.numberOfPitches ?? 1) > 1 && {
            icon: '🟩',
            value: t('tournament.public.pitchesValue', { count: settings.numberOfPitches ?? 1 }),
          },
        ].filter((x): x is { icon: string; value: string } => Boolean(x)).map((item, idx, arr) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 14px',
            borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.value}</span>
          </div>
        ))}

      </div>

      {/* ── Pravidla organizátora (sbalitelně, jen pokud vyplněna) ── */}
      {rules && rules.trim() !== '' && (
        <div style={{
          marginTop: 10, background: 'var(--surface)', borderRadius: 14,
          padding: '12px 14px', boxShadow: 'var(--shadow-sm)',
        }}>
          <div
            onClick={() => setRulesOpen(!rulesOpen)}
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}
          >
            <span style={{ fontSize: 14 }}>📝</span>
            <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{t('tournament.public.rulesAndRegulations')}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform .2s', transform: rulesOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </div>
          {rulesOpen && (
            <pre style={{
              fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6,
              color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              margin: '10px 0 0 0', paddingTop: 10, borderTop: '1px solid var(--border)',
            }}>
              {rules}
            </pre>
          )}
        </div>
      )}

      {/* ── Kritéria pro umístění ── */}
      <div style={{ marginTop: 10 }}>
        <StandingsCriteriaBox tiebreakerOrder={tournament.settings.tiebreakerOrder} penaltyResults={tournament.settings.penaltyResults} collapsible collapsed={!criteriaOpen} onToggle={() => setCriteriaOpen(!criteriaOpen)} />
      </div>
    </>
  );

  // Helper: render one standings table
  const renderStandingsTable = (
    standingsData: ReturnType<typeof computeStandings>,
    basePosMap: Map<string, number>,
    isAdvancingFn?: (idx: number, s: { played: number }) => boolean,
  ) => (
    <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 2, padding: '7px 10px', background: 'var(--surface-var)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
        <span>#</span><span>{t('tournament.public.team')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.played')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.won')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.lost')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.goalsFor')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.points')}</span>
      </div>
      {standingsData.map((s, idx) => {
        const team = getTeam(s.teamId);
        const isFirst = !isAdvancingFn && idx === 0 && s.played > 0;
        const isAdvancing = isAdvancingFn?.(idx, s) ?? false;
        const isHighlighted = selectedTeamId === s.teamId;
        const teamColor = team?.color ?? 'var(--primary)';
        const inLive = isTeamInLive(s.teamId);
        const currentPos = idx + 1;
        const basePos = basePosMap.get(s.teamId);
        const rawChange = basePos != null ? basePos - currentPos : 0;
        const posChange = inLive ? rawChange : 0;

        return (
          <div key={s.teamId} style={{
            display: 'grid', gridTemplateColumns: GRID_COLS, gap: 2,
            padding: '8px 10px', alignItems: 'center',
            borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
            background: isHighlighted ? `${teamColor}18` : isAdvancing ? 'var(--primary-light)' : isFirst ? 'var(--primary-light)' : inLive ? 'rgba(183,28,28,.04)' : 'transparent',
            borderLeft: isHighlighted ? `3px solid ${teamColor}` : '3px solid transparent',
            transition: 'background .3s ease',
          }}>
            <span style={{
              fontWeight: 700, fontSize: 12, textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
              color: posChange > 0 ? 'var(--success)' : posChange < 0 ? 'var(--danger)' : isAdvancing ? 'var(--primary)' : 'var(--text-muted)',
            }}>
              <span>{currentPos}</span>
              {posChange !== 0 && (
                <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 800, color: posChange > 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {posChange > 0 ? '\u25B2' : '\u25BC'}
                </span>
              )}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <PublicTeamBadge team={team} size={14} />
              <span style={{ fontWeight: isHighlighted || isFirst || isAdvancing ? 800 : 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? '?'}</span>
            </div>
            <span style={{ textAlign: 'center', fontSize: 12 }}>{s.played}</span>
            <span style={{ textAlign: 'center', fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>{s.won}</span>
            <span style={{ textAlign: 'center', fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>{s.lost}</span>
            <span style={{ textAlign: 'center', fontSize: 11 }}>{s.goalsFor}:{s.goalsAgainst}</span>
            <span style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, color: isFirst || isAdvancing ? 'var(--primary)' : 'var(--text)' }}>{s.points}</span>
          </div>
        );
      })}
    </div>
  );

  // ── Groups-knockout: per-group tables ──
  if (format === 'groups-knockout' && groups.length > 0) {
    return (
      <div style={{ padding: '12px 16px' }}>
        {groups.map((group, gi) => {
          const groupTeams = tournament.teams.filter(tm => group.teamIds.includes(tm.id));
          const groupMatches = tournament.matches.filter(m => m.groupId === group.id);
          const groupStandings = computeStandings(groupMatches, groupTeams, settings.tiebreakerOrder, settings.penaltyResults, showLive);
          const groupBaseStandings = (hasLiveMatch && showLive)
            ? computeStandings(groupMatches, groupTeams, settings.tiebreakerOrder, settings.penaltyResults, false)
            : null;
          const groupBaseMap = new Map<string, number>();
          if (groupBaseStandings) {
            groupBaseStandings.forEach((s, i) => groupBaseMap.set(s.teamId, i + 1));
          }

          return (
            <div key={group.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ fontWeight: 800, fontSize: 15, margin: 0, color: 'var(--primary)' }}>
                  {group.name}
                </h3>
                {gi === 0 && liveChip}
              </div>
              {renderStandingsTable(groupStandings, groupBaseMap, (idx, s) => idx < advance && s.played > 0)}
            </div>
          );
        })}
        {sharedFooter}
      </div>
    );
  }

  // ── Round-robin: single table ──
  return (
    <div style={{ padding: '12px 16px' }}>
      {renderStandingsTable(standings, basePositionMap)}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span>{t('tournament.public.standingsLegend')}</span>
        {liveChip}
      </div>
      {sharedFooter}
    </div>
  );
}
