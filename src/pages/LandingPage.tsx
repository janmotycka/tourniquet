import { useState, useEffect } from 'react';
import type { Page } from '../App';
import type { CatalogEntry } from '../types/tournament.types';
import { subscribeToCatalog } from '../services/catalog.firebase';
import { useI18n } from '../i18n';

interface Props {
  navigate: (p: Page) => void;
  onLogin: () => void;
}

export function LandingPage({ navigate, onLogin }: Props) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToCatalog((list) => {
      setEntries(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Rozdělit turnaje do kategorií
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const live = entries.filter(e => e.status === 'active');
  const upcoming = entries.filter(e => e.status === 'draft' && e.startDate >= todayStr);
  const recent = entries
    .filter(e => e.status === 'finished')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);

  const hasAny = live.length > 0 || upcoming.length > 0 || recent.length > 0;

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1A237E 0%, #283593 50%, #3949AB 100%)',
        color: '#fff', padding: '40px 24px 32px', textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'rgba(255,255,255,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, margin: '0 auto 16px',
          backdropFilter: 'blur(8px)',
        }}>⚽</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>TORQ</h1>
        <p style={{ fontSize: 15, opacity: 0.9, marginTop: 8, lineHeight: 1.5, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
          {t('landing.hero')}
        </p>
        <p style={{ fontSize: 13, opacity: 0.65, marginTop: 4, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
          {t('landing.heroSub')}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={onLogin}
            style={{
              padding: '12px 28px', borderRadius: 14, fontWeight: 800, fontSize: 15,
              background: '#fff', color: '#1A237E', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,.2)',
            }}
          >
            {t('landing.loginCta')}
          </button>
        </div>

        <span style={{
          fontSize: 11, opacity: 0.5, display: 'inline-block', marginTop: 12,
        }}>
          🚧 {t('home.betaNotice')}
        </span>
      </div>

      {/* ─── Catalog ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '20px 16px 32px', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚽</div>
            {t('common.loading')}
          </div>
        )}

        {!loading && !hasAny && (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: 'var(--text-muted)', fontSize: 14,
          }}>
            {t('landing.noTournaments')}
          </div>
        )}

        {/* LIVE */}
        {live.length > 0 && (
          <TournamentSection
            title={`🔴 ${t('landing.liveTitle')}`}
            entries={live}
            navigate={navigate}
            t={t}
            variant="live"
          />
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <TournamentSection
            title={`📅 ${t('landing.upcomingTitle')}`}
            entries={upcoming}
            navigate={navigate}
            t={t}
            variant="upcoming"
          />
        )}

        {/* Recent */}
        {recent.length > 0 && (
          <TournamentSection
            title={`🏆 ${t('landing.recentTitle')}`}
            entries={recent}
            navigate={navigate}
            t={t}
            variant="finished"
          />
        )}
      </div>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center', padding: '16px 24px 24px',
        fontSize: 12, color: 'var(--text-muted)',
      }}>
        <span>TORQ · torq.cz</span>
      </div>
    </div>
  );
}

// ─── Tournament Section ────────────────────────────────────────────────────────

function TournamentSection({
  title, entries, navigate, t, variant,
}: {
  title: string;
  entries: CatalogEntry[];
  navigate: (p: Page) => void;
  t: (key: string) => string;
  variant: 'live' | 'upcoming' | 'finished';
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(entry => (
          <TournamentCard
            key={entry.id}
            entry={entry}
            navigate={navigate}
            t={t}
            variant={variant}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Tournament Card ─────────────────────────────────────────────────────────

function TournamentCard({
  entry, navigate, t, variant,
}: {
  entry: CatalogEntry;
  navigate: (p: Page) => void;
  t: (key: string) => string;
  variant: 'live' | 'upcoming' | 'finished';
}) {
  const formatDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}.${m}.${y}`;
    } catch {
      return dateStr;
    }
  };

  const teamCountLabel = (count: number) => {
    if (count === 1) return `${count} ${t('landing.team')}`;
    if (count >= 2 && count <= 4) return `${count} ${t('landing.teamsCount')}`;
    return `${count} ${t('landing.teams')}`;
  };

  const formatKey = `landing.format.${entry.format}` as const;

  return (
    <button
      onClick={() => navigate({ name: 'tournament-public', tournamentId: entry.id })}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px', borderRadius: 14,
        background: 'var(--surface)', border: '1.5px solid var(--border)',
        cursor: 'pointer', width: '100%', textAlign: 'left',
        boxShadow: variant === 'live' ? '0 2px 12px rgba(229,57,53,.12)' : '0 1px 4px rgba(0,0,0,.05)',
        transition: 'transform .1s, box-shadow .15s',
      }}
    >
      {/* Team colors strip */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        flexShrink: 0,
      }}>
        {(entry.teamColors ?? []).slice(0, 6).map((color, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color,
            border: '1px solid rgba(0,0,0,.08)',
          }} />
        ))}
        {entry.teamCount > 6 && (
          <div style={{
            fontSize: 8, color: 'var(--text-muted)', textAlign: 'center',
            lineHeight: 1,
          }}>+{entry.teamCount - 6}</div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entry.name}
        </div>
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          <span>📅 {formatDate(entry.startDate)}</span>
          <span>⏰ {entry.startTime}</span>
          <span>{teamCountLabel(entry.teamCount)}</span>
          <span>{t(formatKey)}</span>
        </div>
      </div>

      {/* Status badge */}
      <div style={{ flexShrink: 0 }}>
        {variant === 'live' && (
          <span style={{
            background: '#E53935', color: '#fff',
            padding: '4px 10px', borderRadius: 8,
            fontSize: 11, fontWeight: 800,
            animation: 'pulse 2s infinite',
          }}>
            {t('landing.live')}
          </span>
        )}
        {variant === 'finished' && (
          <span style={{
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            padding: '4px 10px', borderRadius: 8,
            fontSize: 11, fontWeight: 600,
          }}>
            ✅
          </span>
        )}
        {variant === 'upcoming' && (
          <span style={{
            background: '#E3F2FD', color: '#1565C0',
            padding: '4px 10px', borderRadius: 8,
            fontSize: 11, fontWeight: 600,
          }}>
            📅
          </span>
        )}
      </div>
    </button>
  );
}
