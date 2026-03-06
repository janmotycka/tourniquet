import { useState } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useI18n } from '../../i18n';
import { formatDate } from '../../components/match/match-utils';
import { LiveTab } from '../../components/match/LiveTab';
import { LineupTab } from '../../components/match/LineupTab';
import { RatingsTab } from '../../components/match/RatingsTab';

interface Props { matchId: string; navigate: (p: Page) => void; }

type Tab = 'live' | 'lineup' | 'ratings';

// ─── MatchDetailPage ──────────────────────────────────────────────────────────

export function MatchDetailPage({ matchId, navigate }: Props) {
  const { t } = useI18n();
  const match = useMatchesStore(s => s.getMatchById(matchId));
  const matches = useMatchesStore(s => s.matches); // Subscribe for reactivity
  const [tab, setTab] = useState<Tab>('live');

  // Re-read match on any store change
  const currentMatch = matches.find(m => m.id === matchId) ?? match;

  if (!currentMatch) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{t('match.detail.notFound')}</div>
        <button onClick={() => navigate({ name: 'match-list' })}
          style={{ background: '#1565C0', color: '#fff', borderRadius: 12, padding: '10px 20px', fontWeight: 700 }}>
          ← Zpět na seznam
        </button>
      </div>
    );
  }

  const isLive = currentMatch.status === 'live';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px', background: 'var(--surface)',
        boxShadow: '0 1px 0 var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button
            onClick={() => navigate({ name: 'match-list' })}
            style={{ background: 'var(--surface-var)', borderRadius: 10, padding: '7px 12px', fontWeight: 700, fontSize: 14 }}
          >
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentMatch.isHome ? 'My' : currentMatch.opponent} vs {currentMatch.isHome ? currentMatch.opponent : 'My'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {formatDate(currentMatch.date)} · {currentMatch.kickoffTime}
              {isLive && <span style={{ color: '#C62828', fontWeight: 700, marginLeft: 6 }}>● ŽIVĚ</span>}
            </div>
          </div>
          <div style={{
            fontWeight: 900, fontSize: 20, color: isLive ? '#1565C0' : 'var(--text)',
            letterSpacing: 1, flexShrink: 0,
          }}>
            {currentMatch.homeScore}:{currentMatch.awayScore}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([['live', isLive ? '● Live' : '📋 Zápas'], ['lineup', '👕 Sestava'], ['ratings', '⭐ Hodnocení']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 10, fontWeight: 700, fontSize: 12,
                background: tab === key ? (isLive && key === 'live' ? '#1565C0' : 'var(--primary)') : 'var(--surface-var)',
                color: tab === key ? '#fff' : 'var(--text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {tab === 'live' && <LiveTab match={currentMatch} />}
        {tab === 'lineup' && <LineupTab match={currentMatch} />}
        {tab === 'ratings' && <RatingsTab match={currentMatch} />}
      </div>
    </div>
  );
}
