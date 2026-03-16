import { useState, useCallback } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useI18n } from '../../i18n';
import { formatDate } from '../../components/match/match-utils';
import { LiveTab } from '../../components/match/LiveTab';
import { LineupTab } from '../../components/match/LineupTab';
import { RatingsTab } from '../../components/match/RatingsTab';
import { getMatchPublicUrl, generateMatchQRCodeDataUrl } from '../../utils/qr-code';

interface Props { matchId: string; navigate: (p: Page) => void; }

type Tab = 'live' | 'lineup' | 'ratings';

// ─── MatchDetailPage ──────────────────────────────────────────────────────────

export function MatchDetailPage({ matchId, navigate }: Props) {
  const { t } = useI18n();
  const match = useMatchesStore(s => s.getMatchById(matchId));
  const matches = useMatchesStore(s => s.matches); // Subscribe for reactivity
  const togglePublicMatch = useMatchesStore(s => s.togglePublicMatch);
  const [tab, setTab] = useState<Tab>('live');
  const [showShare, setShowShare] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Re-read match on any store change
  const currentMatch = matches.find(m => m.id === matchId) ?? match;

  const handleTogglePublic = useCallback(() => {
    togglePublicMatch(matchId);
    setShowShare(prev => !prev);
  }, [matchId, togglePublicMatch]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getMatchPublicUrl(matchId));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }, [matchId]);

  const handleShowQr = useCallback(async () => {
    if (qrDataUrl) { setQrDataUrl(null); return; }
    try {
      const url = await generateMatchQRCodeDataUrl(matchId);
      setQrDataUrl(url);
    } catch { /* QR gen failed */ }
  }, [matchId, qrDataUrl]);

  const handleWhatsApp = useCallback(() => {
    if (!currentMatch) return;
    const url = getMatchPublicUrl(matchId);
    const dateStr = formatDate(currentMatch.date);
    const msg = t('matchShare.whatsappMessage', {
      opponent: currentMatch.opponent,
      date: dateStr,
      time: currentMatch.kickoffTime,
      competition: currentMatch.competition,
      url,
    });
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  }, [matchId, currentMatch, t]);

  if (!currentMatch) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{t('match.detail.notFound')}</div>
        <button onClick={() => navigate({ name: 'match-list' })}
          style={{ background: 'var(--primary)', color: '#fff', borderRadius: 12, padding: '10px 20px', fontWeight: 700 }}>
          ← {t('match.detail.backToList')}
        </button>
      </div>
    );
  }

  const isLive = currentMatch.status === 'live';
  const isPublic = !!currentMatch.isPublic;

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
              {currentMatch.isHome ? t('match.detail.us') : currentMatch.opponent} {t('match.detail.vs')} {currentMatch.isHome ? currentMatch.opponent : t('match.detail.us')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {formatDate(currentMatch.date)} · {currentMatch.kickoffTime}
              {isLive && <span style={{ color: '#C62828', fontWeight: 700, marginLeft: 6 }}>● {t('match.live')}</span>}
            </div>
          </div>
          <button
            onClick={isPublic ? () => setShowShare(s => !s) : handleTogglePublic}
            style={{
              background: isPublic ? 'var(--primary-light)' : 'var(--surface-var)',
              borderRadius: 10, padding: '7px 10px', fontWeight: 700, fontSize: 13,
              color: isPublic ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0,
            }}
            title={t('matchShare.shareTitle')}
          >
            📡
          </button>
          <div style={{
            fontWeight: 900, fontSize: 20, color: isLive ? 'var(--primary)' : 'var(--text)',
            letterSpacing: 1, flexShrink: 0,
          }}>
            {currentMatch.homeScore}:{currentMatch.awayScore}
          </div>
        </div>

        {/* Share panel */}
        {isPublic && showShare && (
          <div style={{
            background: 'var(--primary-light)', borderRadius: 12, padding: '12px 14px', marginBottom: 10,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>📡 {t('matchShare.liveSharing')}</span>
              <button
                onClick={handleTogglePublic}
                style={{ fontSize: 11, fontWeight: 600, color: '#C62828', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {t('matchShare.stopSharing')}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--primary)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {getMatchPublicUrl(matchId)}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={handleCopyLink} style={shareBtn}>
                {linkCopied ? `✓ ${t('matchShare.copied')}` : `📋 ${t('matchShare.copyLink')}`}
              </button>
              <button onClick={handleWhatsApp} style={shareBtn}>
                💬 WhatsApp
              </button>
              <button onClick={handleShowQr} style={shareBtn}>
                {qrDataUrl ? `✕ ${t('matchShare.hideQr')}` : `📱 ${t('matchShare.showQr')}`}
              </button>
            </div>
            {qrDataUrl && (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <img src={qrDataUrl} alt="QR" style={{ width: 180, height: 180, maxWidth: '70%' }} />
              </div>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([['live', isLive ? `● ${t('match.detail.tabLive')}` : t('match.detail.tabMatch')], ['lineup', t('match.detail.tabLineup')], ['ratings', t('match.detail.tabRatings')]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 10, fontWeight: 700, fontSize: 12,
                background: tab === key ? (isLive && key === 'live' ? 'var(--primary)' : 'var(--primary)') : 'var(--surface-var)',
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

const shareBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
  background: '#fff', color: 'var(--primary)', border: '1px solid #BBDEFB', cursor: 'pointer',
};
