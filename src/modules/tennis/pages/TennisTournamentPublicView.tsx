/**
 * TennisTournamentPublicView — veřejné zobrazení tenisového turnaje.
 *
 * Pro rodiče + diváky, čistě tenisové. Zobrazí:
 *  - Header s názvem + datumem
 *  - Seznam účastníků (hráčů / týmů)
 *  - Seznam zápasů (s výsledky kde jsou)
 *  - ČTenis link (pokud je)
 *  - Refresh tlačítko (data z Firebase public mirror)
 *
 * Data přihlašuje přes existující `subscribeToPublicTournament` (sport-agnostic).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Page } from '../../../App';
import { useI18n, getDateLocale } from '../../../i18n';
import type { Tournament } from '../../../types/tournament.types';
import { subscribeToPublicTournament } from '../../../services/tournament.firebase';
import { OfficialLinkButton } from '../../../components/ui';
import { logger } from '../../../utils/logger';

interface Props {
  tournamentId: string;
  navigate: (p: Page) => void;
}

export function TennisTournamentPublicView({ tournamentId, navigate }: Props) {
  const { t, locale } = useI18n();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToPublicTournament(
      tournamentId,
      (data) => {
        if (data) {
          setTournament(data);
          setError(null);
        } else {
          setError(t('tournament.public.notFound'));
        }
        setLastUpdate(new Date());
        setLoading(false);
      },
      (err) => {
        logger.warn('[TennisTournamentPublicView] Load error:', err);
        setError(t('tournament.public.loadError'));
        setLoading(false);
      },
    );
    return () => unsub();
  }, [tournamentId, t]);

  const timeSinceLabel = useMemo(() => {
    const minutes = Math.floor((Date.now() - lastUpdate.getTime()) / 60000);
    if (minutes < 1) return t('tournament.public.justNow');
    if (minutes === 1) return t('tournament.public.oneMinuteAgo');
    return t('tournament.public.nMinutesAgo', { n: minutes });
  }, [lastUpdate, t]);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 32 }}>🎾</div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40,
      }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700 }}>{error || t('tournament.public.notFound')}</div>
        <button
          onClick={() => navigate({ name: 'home' })}
          style={{
            padding: '10px 18px', borderRadius: 10, background: 'var(--primary)',
            color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer',
          }}
        >
          {t('common.back')}
        </button>
      </div>
    );
  }

  const date = new Date(tournament.settings.startDate + 'T00:00:00').toLocaleDateString(
    getDateLocale(locale),
    { day: 'numeric', month: 'long', year: 'numeric' },
  );
  const finishedMatches = tournament.matches.filter(m => m.status === 'finished').length;
  const totalMatches = tournament.matches.length;

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #00695C 0%, #00897B 100%)',
        color: '#fff', padding: '24px 20px',
      }}>
        <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginBottom: 4 }}>
          🎾 Tenisový turnaj
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>
          {tournament.name}
        </div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10,
          fontSize: 13, opacity: 0.9,
        }}>
          <span>📅 {date}</span>
          <span>⏰ {tournament.settings.startTime}</span>
          <span>👥 {tournament.teams.length}</span>
          <span>🎾 {finishedMatches}/{totalMatches}</span>
          {tournament.settings.venueName && (
            <span>📍 {tournament.settings.venueName}</span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Official link (ČTenis) */}
        {tournament.settings.officialResultsUrl && (
          <OfficialLinkButton url={tournament.settings.officialResultsUrl} />
        )}

        {/* Participants */}
        <Section title={t('tennis.tournamentPublic.participants')}>
          {tournament.teams.length === 0 ? (
            <EmptyRow text={t('tennis.tournamentPublic.noParticipants')} />
          ) : tournament.teams.map((team, idx) => (
            <div key={team.id ?? idx} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              borderBottom: idx < tournament.teams.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 14,
                background: team.color, color: '#fff',
                fontSize: 11, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>{idx + 1}</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
                {team.name}
              </span>
            </div>
          ))}
        </Section>

        {/* Matches */}
        <Section title={t('tennis.tournamentPublic.matches')}>
          {tournament.matches.length === 0 ? (
            <EmptyRow text={t('tennis.tournamentPublic.noMatches')} />
          ) : tournament.matches.map((m, idx) => {
            const home = tournament.teams.find(tt => tt.id === m.homeTeamId);
            const away = tournament.teams.find(tt => tt.id === m.awayTeamId);
            const done = m.status === 'finished';
            return (
              <div key={m.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10,
                alignItems: 'center', padding: '12px 14px',
                borderBottom: idx < tournament.matches.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>
                  {home?.name ?? '?'}
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 800, minWidth: 50, textAlign: 'center',
                  color: done ? 'var(--text)' : 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {done ? `${m.homeScore}:${m.awayScore}` : '—'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {away?.name ?? '?'}
                </div>
              </div>
            );
          })}
        </Section>

        {/* Disclaimer */}
        <div style={{
          padding: '10px 14px',
          background: 'var(--warning-light)', color: 'var(--warning)',
          borderRadius: 10, fontSize: 12, fontWeight: 600, lineHeight: 1.4,
          textAlign: 'center',
        }}>
          ⚠️ {t('tennis.tournamentPublic.disclaimer')}
        </div>
      </div>

      {/* Refresh footer */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
            {t('tournament.public.lastUpdate')}: {timeSinceLabel}
          </span>
          <button onClick={handleRefresh} style={{
            background: 'linear-gradient(135deg, #00695C, #00897B)',
            color: '#fff', fontWeight: 700, fontSize: 13,
            padding: '8px 14px', borderRadius: 10,
            border: 'none', cursor: 'pointer',
          }}>
            {t('tournament.public.refresh')}
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          <a
            href="https://torq.cz"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            ⚡ Powered by <strong style={{ color: 'var(--primary)' }}>TORQ</strong>
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{
        fontSize: 12, fontWeight: 800, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px',
      }}>
        {title}
      </h3>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
      }}>
        {children}
      </div>
    </div>
  );
}
function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
      {text}
    </div>
  );
}
