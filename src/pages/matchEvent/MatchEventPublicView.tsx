/**
 * MatchEventPublicView — veřejný pohled pro rodiče.
 *
 * Čistý read-only: seznam zápasů se skóre, auto-refresh přes Firebase subscribe.
 * Žádné přihlášení, stačí URL (`#match-event={id}`).
 */

import { useEffect, useState } from 'react';
import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { subscribeToPublicMatchEvent } from '../../services/matchEvent.firebase';
import { formatDate } from '../../components/match/match-utils';
import type { PublicMatchEvent } from '../../types/matchEvent.types';

interface Props {
  eventId: string;
  navigate: (p: Page) => void;
}

export function MatchEventPublicView({ eventId, navigate }: Props) {
  const { t, locale } = useI18n();
  const [event, setEvent] = useState<PublicMatchEvent | null | 'loading'>('loading');

  useEffect(() => {
    const unsubscribe = subscribeToPublicMatchEvent(eventId, (data) => {
      setEvent(data);
    });
    return unsubscribe;
  }, [eventId]);

  if (event === 'loading') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 14 }}>
        <div style={{ fontSize: 44 }}>⏳</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{t('matchEvent.loading')}</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 14 }}>
        <div style={{ fontSize: 44 }}>🔍</div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{t('matchEvent.notFound')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 340, lineHeight: 1.5 }}>
          {t('matchEvent.notFoundPublicHint')}
        </div>
        <button
          onClick={() => navigate({ name: 'home' })}
          style={{ padding: '10px 20px', borderRadius: 12, background: 'var(--primary)', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
        >
          {t('common.backHome')}
        </button>
      </div>
    );
  }

  // Celkové skóre — jen live/finished zápasy
  const anyLive = event.matches.some(m => m.status === 'live');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Header banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary) 100%)',
        padding: '20px 16px 24px', color: '#fff',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          📊 {t('matchEvent.publicBadge')}
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2, marginBottom: 6 }}>
          {event.name}
        </div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>
          📅 {formatDate(event.date, locale as 'cs' | 'en' | 'de')}
          {event.venue && ` · 📍 ${event.venue}`}
        </div>
        {anyLive && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 10, padding: '4px 10px', borderRadius: 12,
            background: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 800,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#FFEB3B', animation: 'pulse 1.5s infinite',
            }} />
            LIVE
          </div>
        )}
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }`}</style>
      </div>

      {/* Matches list */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {event.matches.length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            background: 'var(--surface)', borderRadius: 14,
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⏱</div>
            {t('matchEvent.publicEmptyHint')}
          </div>
        ) : (
          event.matches.map((m, idx) => {
            const isFinished = m.status === 'finished';
            const isLive = m.status === 'live';
            return (
              <div
                key={m.id}
                style={{
                  background: 'var(--surface)', borderRadius: 12, padding: '12px 14px',
                  boxShadow: 'var(--shadow-sm)',
                  border: isLive ? '2px solid var(--primary)' : '1px solid var(--border)',
                  opacity: isFinished ? 0.9 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {t('matchEvent.matchN', { n: idx + 1 })}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                    background: isFinished ? 'var(--surface-var)' : isLive ? 'var(--danger)' : 'var(--primary-light)',
                    color: isFinished ? 'var(--text-muted)' : isLive ? '#fff' : 'var(--primary)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    {isFinished ? t('matchEvent.statusFinished') : isLive ? t('matchEvent.statusLive') : t('matchEvent.statusPlanned')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.teamA}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', minWidth: 80, textAlign: 'center' }}>
                    {m.scoreA}:{m.scoreB}
                  </div>
                  <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.teamB}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 'auto', padding: '16px',
        fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
      }}>
        ⚽ {t('matchEvent.poweredBy')} <a href="https://torq.cz" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 700 }}>torq.cz</a>
      </div>
    </div>
  );
}
