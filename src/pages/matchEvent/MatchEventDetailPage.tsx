/**
 * MatchEventDetailPage — live view pro učitele („Den zápasů").
 *
 * UX: učitel vidí seznam zápasů, u každého velké -/+1 tlačítka pro skóre,
 * přidává další zápasy během dne, sdílí URL s rodiči přes bottom share sheet.
 *
 * Záměrně nemá: lineup, ratings, karty, FAČR report, statistiky.
 */

import { useState, useEffect } from 'react';
import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { useMatchEventsStore } from '../../store/matchEvents.store';
import { useConfirmStore } from '../../store/confirm.store';
import { useToastStore } from '../../store/toast.store';
import { PageHeader } from '../../components/ui';
import { formatDate } from '../../components/match/match-utils';
import type { MatchEventMatch } from '../../types/matchEvent.types';

interface Props {
  eventId: string;
  navigate: (p: Page) => void;
}

function getPublicUrl(eventId: string): string {
  const base = window.location.origin + window.location.pathname;
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase}#match-event=${eventId}`;
}

export function MatchEventDetailPage({ eventId, navigate }: Props) {
  const { t, locale } = useI18n();
  const event = useMatchEventsStore(s => s.events.find(e => e.id === eventId));
  const events = useMatchEventsStore(s => s.events); // subscribe for reactivity
  const addMatch = useMatchEventsStore(s => s.addMatch);
  const removeMatch = useMatchEventsStore(s => s.removeMatch);
  const updateMatchScore = useMatchEventsStore(s => s.updateMatchScore);
  const setMatchStatus = useMatchEventsStore(s => s.setMatchStatus);
  const resetMatch = useMatchEventsStore(s => s.resetMatch);
  const deleteEvent = useMatchEventsStore(s => s.deleteEvent);
  const togglePublic = useMatchEventsStore(s => s.togglePublic);
  const updateEvent = useMatchEventsStore(s => s.updateEvent);

  const [addingOpen, setAddingOpen] = useState(false);
  const [newTeamA, setNewTeamA] = useState('');
  const [newTeamB, setNewTeamB] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Reactive re-read
  const currentEvent = events.find(e => e.id === eventId) ?? event;

  useEffect(() => {
    // scroll to top
    window.scrollTo(0, 0);
  }, [eventId]);

  if (!currentEvent) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{t('matchEvent.notFound')}</div>
        <button
          onClick={() => navigate({ name: 'home' })}
          style={{ padding: '10px 20px', borderRadius: 12, background: 'var(--primary)', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
        >
          ← {t('common.backHome')}
        </button>
      </div>
    );
  }

  const publicUrl = getPublicUrl(currentEvent.id);

  const handleAddMatch = () => {
    if (!newTeamA.trim() && !newTeamB.trim()) return;
    addMatch(currentEvent.id, newTeamA, newTeamB);
    setNewTeamA('');
    setNewTeamB('');
    setAddingOpen(false);
  };

  const handleFinishMatch = (matchId: string) => {
    setMatchStatus(currentEvent.id, matchId, 'finished');
  };

  const handleReopenMatch = (matchId: string) => {
    setMatchStatus(currentEvent.id, matchId, 'live');
  };

  const handleResetMatch = async (matchId: string) => {
    const ok = await useConfirmStore.getState().ask({
      title: t('matchEvent.resetMatchTitle'),
      message: t('matchEvent.resetMatchMsg'),
      destructive: true,
    });
    if (ok) resetMatch(currentEvent.id, matchId);
  };

  const handleRemoveMatch = async (matchId: string) => {
    const ok = await useConfirmStore.getState().ask({
      title: t('matchEvent.removeMatchTitle'),
      message: t('matchEvent.removeMatchMsg'),
      destructive: true,
    });
    if (ok) removeMatch(currentEvent.id, matchId);
  };

  const handleDeleteEvent = async () => {
    const ok = await useConfirmStore.getState().ask({
      title: t('matchEvent.deleteEventTitle'),
      message: t('matchEvent.deleteEventMsg', { name: currentEvent.name }),
      destructive: true,
      requireTypeText: currentEvent.name,
      requireTypeTextLabel: t('confirm.typeToConfirm', { text: currentEvent.name }),
    });
    if (ok) {
      deleteEvent(currentEvent.id);
      navigate({ name: 'home' });
    }
  };

  const handleTogglePublic = () => {
    if (!currentEvent.isPublic) {
      togglePublic(currentEvent.id);
      setShareOpen(true);
    } else {
      togglePublic(currentEvent.id);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      useToastStore.getState().show('success', t('matchEvent.linkCopied'));
    } catch { /* clipboard unavailable */ }
  };

  const handleShareWhatsapp = () => {
    const lines = [
      `📊 *${currentEvent.name}*`,
      `📅 ${formatDate(currentEvent.date, locale as 'cs' | 'en' | 'de')}`,
      ...(currentEvent.venue ? [`📍 ${currentEvent.venue}`] : []),
      '',
      t('matchEvent.whatsappFollow'),
      '',
      publicUrl,
    ];
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title={currentEvent.name}
        subtitle={`${formatDate(currentEvent.date, locale as 'cs' | 'en' | 'de')}${currentEvent.venue ? ` · ${currentEvent.venue}` : ''}`}
        onBack={() => navigate({ name: 'home' })}
        action={
          <button
            onClick={() => setShareOpen(true)}
            aria-label={t('common.share')}
            style={{
              padding: '8px 12px', borderRadius: 10,
              background: currentEvent.isPublic ? 'var(--primary)' : 'var(--surface-var)',
              color: currentEvent.isPublic ? '#fff' : 'var(--text-muted)',
              border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {currentEvent.isPublic ? '📡' : '🔗'}
            <span>{t('common.share')}</span>
          </button>
        }
      />

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Empty state */}
        {currentEvent.matches.length === 0 && !addingOpen && (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            background: 'var(--surface-var)', borderRadius: 14,
            color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>⚽</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
              {t('matchEvent.emptyTitle')}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 300, margin: '0 auto' }}>
              {t('matchEvent.emptyHint')}
            </div>
          </div>
        )}

        {/* Matches list */}
        {currentEvent.matches.map((m, idx) => (
          <MatchRow
            key={m.id}
            match={m}
            index={idx + 1}
            onScore={(deltaA, deltaB) => updateMatchScore(currentEvent.id, m.id, deltaA, deltaB)}
            onFinish={() => handleFinishMatch(m.id)}
            onReopen={() => handleReopenMatch(m.id)}
            onReset={() => handleResetMatch(m.id)}
            onRemove={() => handleRemoveMatch(m.id)}
            t={t}
          />
        ))}

        {/* Add match form */}
        {addingOpen ? (
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: 12,
            border: '2px solid var(--primary)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>
              ➕ {t('matchEvent.addMatchTitle')}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={newTeamA}
                onChange={e => setNewTeamA(e.target.value)}
                placeholder={t('matchEvent.teamA')}
                autoFocus
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', minWidth: 0 }}
              />
              <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 12 }}>vs</span>
              <input
                type="text"
                value={newTeamB}
                onChange={e => setNewTeamB(e.target.value)}
                placeholder={t('matchEvent.teamB')}
                onKeyDown={e => { if (e.key === 'Enter') handleAddMatch(); }}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', minWidth: 0 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setAddingOpen(false); setNewTeamA(''); setNewTeamB(''); }}
                style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--surface-var)', color: 'var(--text)', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleAddMatch}
                disabled={!newTeamA.trim() && !newTeamB.trim()}
                style={{
                  flex: 2, padding: '10px', borderRadius: 10,
                  background: (newTeamA.trim() || newTeamB.trim()) ? 'var(--primary)' : 'var(--border)',
                  color: (newTeamA.trim() || newTeamB.trim()) ? '#fff' : 'var(--text-muted)',
                  border: 'none', fontWeight: 700, fontSize: 13,
                  cursor: (newTeamA.trim() || newTeamB.trim()) ? 'pointer' : 'not-allowed',
                }}
              >
                {t('matchEvent.addMatchCta')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingOpen(true)}
            style={{
              padding: '14px', borderRadius: 12,
              background: 'var(--primary)', color: '#fff',
              border: 'none', fontWeight: 800, fontSize: 14,
              cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
            }}
          >
            ➕ {t('matchEvent.addMatch')}
          </button>
        )}

        {/* Event name edit + delete */}
        <details style={{
          marginTop: 20, background: 'var(--surface)', borderRadius: 12,
          padding: 12, border: '1px solid var(--border)',
        }}>
          <summary style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
            ⚙️ {t('matchEvent.settingsLabel')}
          </summary>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>
                {t('matchEvent.nameLabel')}
              </label>
              <input
                type="text"
                value={currentEvent.name}
                onChange={e => updateEvent(currentEvent.id, { name: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>
            <button
              onClick={handleTogglePublic}
              style={{
                padding: '10px', borderRadius: 10,
                background: currentEvent.isPublic ? 'var(--success)' : 'var(--surface-var)',
                color: currentEvent.isPublic ? '#fff' : 'var(--text)',
                border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              {currentEvent.isPublic ? `✓ ${t('matchEvent.publicOn')}` : t('matchEvent.publicOff')}
            </button>
            <button
              onClick={handleDeleteEvent}
              style={{
                padding: '10px', borderRadius: 10,
                background: 'var(--danger-light)', color: 'var(--danger)',
                border: '1px solid var(--danger)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              🗑 {t('matchEvent.deleteEvent')}
            </button>
          </div>
        </details>
      </div>

      {/* Share sheet */}
      {shareOpen && (
        <div
          onClick={() => setShareOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 900,
            background: 'rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: '20px 20px 0 0',
              width: '100%', maxWidth: 480,
              padding: '16px 20px 28px', boxShadow: 'var(--shadow-lg)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
                📡 {t('matchEvent.shareTitle')}
              </div>
              <button
                onClick={() => setShareOpen(false)}
                style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Public toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: currentEvent.isPublic ? 'var(--primary-light)' : 'var(--surface-var)',
              padding: '12px 14px', borderRadius: 12,
              border: `1px solid ${currentEvent.isPublic ? 'var(--primary)' : 'var(--border)'}`,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: currentEvent.isPublic ? 'var(--primary)' : 'var(--text)' }}>
                  {t('matchEvent.publicToggle')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {currentEvent.isPublic ? t('matchEvent.publicOnHint') : t('matchEvent.publicOffHint')}
                </div>
              </div>
              <button
                onClick={handleTogglePublic}
                style={{
                  width: 48, height: 28, borderRadius: 14,
                  background: currentEvent.isPublic ? 'var(--primary)' : 'var(--border)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: currentEvent.isPublic ? 23 : 3,
                  width: 22, height: 22, borderRadius: '50%', background: '#fff',
                  transition: 'left .18s ease', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                }} />
              </button>
            </div>

            {currentEvent.isPublic && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    readOnly
                    value={publicUrl}
                    onFocus={e => e.currentTarget.select()}
                    style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-var)', fontSize: 12, color: 'var(--text)', fontFamily: 'monospace' }}
                  />
                  <button
                    onClick={handleCopyLink}
                    style={{
                      padding: '0 14px', borderRadius: 10, border: 'none',
                      background: linkCopied ? 'var(--success)' : 'var(--primary)',
                      color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {linkCopied ? '✓' : '📋'}
                  </button>
                </div>
                <button
                  onClick={handleShareWhatsapp}
                  style={{
                    padding: '12px', borderRadius: 12,
                    background: '#25D366', color: '#fff', border: 'none',
                    fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  💬 {t('matchEvent.shareWhatsapp')}
                </button>
                <div style={{
                  background: 'var(--surface-var)', borderRadius: 10, padding: '10px 12px',
                  fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
                }}>
                  👨‍👩‍👧 {t('matchEvent.shareInfoText')}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MatchRow — jeden zápas se skórem + tlačítky ──────────────────────────────

function MatchRow({
  match, index, onScore, onFinish, onReopen, onReset, onRemove, t,
}: {
  match: MatchEventMatch;
  index: number;
  onScore: (deltaA: number, deltaB: number) => void;
  onFinish: () => void;
  onReopen: () => void;
  onReset: () => void;
  onRemove: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const isFinished = match.status === 'finished';
  const isLive = match.status === 'live';

  const vibrate = (ms: number = 20) => {
    try { navigator.vibrate?.(ms); } catch { /* no support */ }
  };

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14,
      padding: 14, boxShadow: 'var(--shadow-sm)',
      border: isLive ? '2px solid var(--primary)' : '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 10,
      opacity: isFinished ? 0.85 : 1,
    }}>
      {/* Header: index + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
          {t('matchEvent.matchN', { n: index })}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
          background: isFinished ? 'var(--surface-var)' : isLive ? 'var(--danger)' : 'var(--primary-light)',
          color: isFinished ? 'var(--text-muted)' : isLive ? '#fff' : 'var(--primary)',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {isFinished ? t('matchEvent.statusFinished') : isLive ? t('matchEvent.statusLive') : t('matchEvent.statusPlanned')}
        </div>
      </div>

      {/* Skóre řádek */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Team A */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {match.teamA}
          </div>
        </div>
        {/* Score A */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => { vibrate(); onScore(1, 0); }}
            disabled={isFinished}
            aria-label={`+1 ${match.teamA}`}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: isFinished ? 'var(--surface-var)' : 'var(--success)',
              color: '#fff', border: 'none', fontSize: 18, fontWeight: 800,
              cursor: isFinished ? 'not-allowed' : 'pointer', opacity: isFinished ? 0.5 : 1,
            }}
          >
            +
          </button>
          <div style={{
            fontSize: 36, fontWeight: 900, color: 'var(--text)',
            minWidth: 44, textAlign: 'center', lineHeight: 1,
          }}>
            {match.scoreA}
          </div>
          <button
            onClick={() => { vibrate(); onScore(-1, 0); }}
            disabled={isFinished || match.scoreA === 0}
            aria-label={`-1 ${match.teamA}`}
            style={{
              width: 36, height: 28, borderRadius: 8,
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              border: 'none', fontSize: 14, fontWeight: 700,
              cursor: (isFinished || match.scoreA === 0) ? 'not-allowed' : 'pointer',
              opacity: (isFinished || match.scoreA === 0) ? 0.4 : 1,
            }}
          >
            −
          </button>
        </div>
        {/* Separator */}
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-muted)' }}>:</div>
        {/* Score B */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => { vibrate(); onScore(0, 1); }}
            disabled={isFinished}
            aria-label={`+1 ${match.teamB}`}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: isFinished ? 'var(--surface-var)' : 'var(--success)',
              color: '#fff', border: 'none', fontSize: 18, fontWeight: 800,
              cursor: isFinished ? 'not-allowed' : 'pointer', opacity: isFinished ? 0.5 : 1,
            }}
          >
            +
          </button>
          <div style={{
            fontSize: 36, fontWeight: 900, color: 'var(--text)',
            minWidth: 44, textAlign: 'center', lineHeight: 1,
          }}>
            {match.scoreB}
          </div>
          <button
            onClick={() => { vibrate(); onScore(0, -1); }}
            disabled={isFinished || match.scoreB === 0}
            aria-label={`-1 ${match.teamB}`}
            style={{
              width: 36, height: 28, borderRadius: 8,
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              border: 'none', fontSize: 14, fontWeight: 700,
              cursor: (isFinished || match.scoreB === 0) ? 'not-allowed' : 'pointer',
              opacity: (isFinished || match.scoreB === 0) ? 0.4 : 1,
            }}
          >
            −
          </button>
        </div>
        {/* Team B */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {match.teamB}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 6 }}>
        {!isFinished && (
          <button
            onClick={onFinish}
            style={{
              flex: 1, padding: '8px', borderRadius: 8,
              background: 'var(--success)', color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            ✓ {t('matchEvent.finishMatch')}
          </button>
        )}
        {isFinished && (
          <button
            onClick={onReopen}
            style={{
              flex: 1, padding: '8px', borderRadius: 8,
              background: 'var(--primary)', color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            {t('matchEvent.reopenMatch')}
          </button>
        )}
        <button
          onClick={onReset}
          style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}
          title={t('matchEvent.resetMatch')}
        >
          ↻
        </button>
        <button
          onClick={onRemove}
          style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--surface-var)', color: 'var(--danger)',
            border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}
          title={t('matchEvent.removeMatch')}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
