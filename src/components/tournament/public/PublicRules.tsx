import type { Tournament } from '../../../types/tournament.types';
import { useI18n, getDateLocale } from '../../../i18n';
import { StandingsCriteriaBox } from './StandingsCriteriaBox';

export function PublicRules({ tournament }: { tournament: Tournament }) {
  const { t, locale } = useI18n();
  const { settings } = tournament;
  const rules = settings.rules;

  // Výpočet délky turnaje — čas prvního a posledního zápasu
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

  const totalGoals = tournament.matches.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  const playedMatches = tournament.matches.filter(m => m.status === 'finished').length;
  const totalMatches = tournament.matches.length;
  const rounds = tournament.matches.length > 0
    ? Math.max(...tournament.matches.map(m => m.roundIndex)) + 1
    : 0;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Základní info o turnaji ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{t('tournament.public.tournamentInfo')}</span>
        </div>
        {[
          {
            icon: '📅',
            label: t('tournament.public.date'),
            value: new Date(settings.startDate).toLocaleDateString(getDateLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          },
          firstMatch && {
            icon: '🕐',
            label: t('tournament.public.time'),
            value: `${formatTime(firstMatch.scheduledTime)}${endTime ? ` – ${endTime.toLocaleTimeString(getDateLocale(locale), { hour: '2-digit', minute: '2-digit' })}` : ''}`,
          },
          {
            icon: '👥',
            label: t('tournament.public.teamsCount'),
            value: t('tournament.public.teamsValue', { count: tournament.teams.length }),
          },
          (settings.numberOfPitches ?? 1) > 1 && {
            icon: '🟩',
            label: t('tournament.public.pitches'),
            value: t('tournament.public.pitchesValue', { count: settings.numberOfPitches ?? 1 }),
          },
          rounds > 0 && {
            icon: '🔄',
            label: t('tournament.public.rounds'),
            value: t('tournament.public.roundsValue', { count: rounds }),
          },
          {
            icon: '⚽',
            label: t('tournament.public.matchesCount'),
            value: playedMatches > 0
              ? t('tournament.public.matchesPlayed', { played: playedMatches, total: totalMatches })
              : t('tournament.public.matchesTotal', { count: totalMatches }),
          },
          totalGoals > 0 && {
            icon: '🥅',
            label: t('tournament.public.goalsCount'),
            value: t('tournament.public.goalsValue', { count: totalGoals }),
          },
        ].filter((x): x is { icon: string; label: string; value: string } => Boolean(x)).map((item, idx, arr) => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '11px 16px',
            borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0, minWidth: 90 }}>{item.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* ── Formát zápasů ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>⏱</span>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{t('tournament.public.matchFormat')}</span>
        </div>
        {[
          { label: t('tournament.public.matchDuration'), value: `${settings.matchDurationMinutes} ${t('common.minutes')}` },
          { label: t('tournament.public.breakDuration'), value: settings.breakBetweenMatchesMinutes === 0 ? t('tournament.public.noBreak') : `${settings.breakBetweenMatchesMinutes} ${t('common.minutes')}` },
          { label: t('tournament.public.pointsForWin'), value: t('tournament.public.pointsWinValue') },
          { label: t('tournament.public.pointsForDraw'), value: t('tournament.public.pointsDrawValue') },
          { label: t('tournament.public.pointsForLoss'), value: t('tournament.public.pointsLossValue') },
        ].map((row, idx, arr) => (
          <div key={row.label} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px',
            borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>{row.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* ── Pravidla pořadatele (jen pokud vyplněna) ── */}
      {rules && rules.trim() !== '' && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 style={{ fontWeight: 800, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📋</span> {t('tournament.public.rulesAndRegulations')}
          </h2>
          <pre style={{
            fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7,
            color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            margin: 0,
          }}>
            {rules}
          </pre>
        </div>
      )}

      {/* ── Kritéria pro umístění ── */}
      <StandingsCriteriaBox tiebreakerOrder={tournament.settings.tiebreakerOrder} penaltyResults={tournament.settings.penaltyResults} />
    </div>
  );
}
