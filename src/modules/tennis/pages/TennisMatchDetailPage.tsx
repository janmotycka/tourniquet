/**
 * TennisMatchDetailPage — čistě tenisový detail zápasu.
 *
 * Obsahuje:
 *  - Header s tým. skórem (team) nebo set score (singles)
 *  - Pro team: TennisTeamTab (editor sub-matches)
 *  - Pro singles: TennisSinglesEditor
 *  - Share button (QR + WhatsApp + ČTenis link)
 *  - Delete / Edit buttons
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Page } from '../../../App';
import { useMatchesStore } from '../../../store/matches.store';
import { useClubsStore } from '../../../store/clubs.store';
import { useConfirmStore } from '../../../store/confirm.store';
import { useToastStore } from '../../../store/toast.store';
import { useI18n } from '../../../i18n';
import { PageHeader, OfficialLinkButton } from '../../../components/ui';
import { ShareMatchSheet } from '../../../components/match/ShareMatchSheet';
import { TennisEditMatchSheet } from '../components/TennisEditMatchSheet';
import { formatDate } from '../../../components/match/match-utils';
import { getMatchPublicUrl } from '../../../utils/qr-code';
import { TennisTeamTab } from '../components/TennisTeamTab';
import { TennisSinglesEditor } from '../components/TennisSinglesEditor';
import { aggregateTeamScore, generateTennisTeamSummaryText } from '../utils/tennis-team';
import { useMyPlayersStore } from '../store/myPlayers.store';

interface Props { matchId: string; navigate: (p: Page) => void; }

export function TennisMatchDetailPage({ matchId, navigate }: Props) {
  const { t, locale } = useI18n();
  const match = useMatchesStore(s => s.getMatchById(matchId));
  const matches = useMatchesStore(s => s.matches);
  const togglePublicMatch = useMatchesStore(s => s.togglePublicMatch);
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const deleteMatch = useMatchesStore(s => s.deleteMatch);
  const ask = useConfirmStore(s => s.ask);

  const [showShare, setShowShare] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // Reactive re-read on store change.
  const currentMatch = matches.find(m => m.id === matchId) ?? match;

  // Safety guard — pokud zápas patří fotbalu, přesměruj na seznam.
  // Stává se když uživatel přepne sport po otevření stránky.
  useEffect(() => {
    if (currentMatch && (currentMatch.sport ?? 'football') !== 'tennis') {
      navigate({ name: 'match-list' });
    }
  }, [currentMatch, navigate]);
  const activeClub = useClubsStore(s => s.clubs.find(c => c.id === currentMatch?.clubId));
  // V individuálním módu používáme jméno sledovaného hráče místo názvu klubu.
  const myPlayer = useMyPlayersStore(s =>
    currentMatch?.myPlayerId ? s.players.find(p => p.id === currentMatch.myPlayerId) : undefined,
  );
  const clubDisplayName = myPlayer?.name
    || currentMatch?.clubName
    || activeClub?.name
    || t('match.our');

  const isTeam = currentMatch?.matchType === 'team';

  const handleTogglePublic = useCallback(() => togglePublicMatch(matchId), [matchId, togglePublicMatch]);
  const handleToggleLineupEarly = useCallback(() => {
    if (!currentMatch) return;
    const next = (currentMatch.lineupVisibility ?? 'atStart') === 'always' ? 'atStart' : 'always';
    updateMatch(matchId, { lineupVisibility: next });
  }, [matchId, currentMatch, updateMatch]);

  // Summary (WhatsApp) — platí pro team i singles (generátor zvládne obojí)
  const summary = useMemo(() => {
    if (!currentMatch) return '';
    const players = activeClub?.players ?? [];
    return generateTennisTeamSummaryText({
      match: currentMatch,
      clubDisplayName,
      playerNameResolver: (id: string) => players.find(p => p.id === id)?.name ?? null,
      publicUrl: getMatchPublicUrl(currentMatch.id),
      lang: locale,
    });
  }, [currentMatch, clubDisplayName, activeClub, locale]);

  const handleCopySummary = useCallback(async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      useToastStore.getState().show('success', t('match.detail.summaryCopied'));
    } catch {
      useToastStore.getState().show('error', t('match.detail.summaryCopied'));
    }
  }, [summary, t]);
  const handleShareWhatsapp = useCallback(() => {
    if (!summary) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(summary)}`, '_blank');
  }, [summary]);

  const handleDelete = async () => {
    if (!currentMatch) return;
    const ok = await ask({
      title: t('common.delete'),
      message: t('match.list.deleteConfirm', { opponent: currentMatch.opponent }),
      destructive: true,
    });
    if (ok) {
      await deleteMatch(currentMatch.id);
      navigate({ name: 'match-list' });
    }
  };

  if (!currentMatch) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700 }}>{t('match.detail.notFound')}</div>
        <button
          onClick={() => navigate({ name: 'match-list' })}
          style={{
            padding: '10px 18px', borderRadius: 10, background: 'var(--primary)',
            color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer',
          }}
        >
          ← {t('match.detail.backToList')}
        </button>
      </div>
    );
  }

  const isPublic = !!currentMatch.isPublic;
  // Aggregate score pro header (team) nebo homeScore:awayScore (singles)
  const agg = isTeam
    ? aggregateTeamScore(currentMatch.subMatches ?? [])
    : { home: currentMatch.homeScore, away: currentMatch.awayScore };
  const headerScore = `${currentMatch.isHome ? agg.home : agg.away}:${currentMatch.isHome ? agg.away : agg.home}`;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', position: 'sticky', top: 0, zIndex: 10 }}>
        <PageHeader
          title={`${clubDisplayName} ${t('match.detail.vs')} ${currentMatch.opponent}`}
          subtitle={`🎾 ${formatDate(currentMatch.date)} · ${currentMatch.kickoffTime}`}
          onBack={() => navigate({ name: 'match-list' })}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setShowShare(true)}
                aria-label={t('matchShare.title')}
                style={{
                  background: isPublic
                    ? 'linear-gradient(135deg, #1565C0, #1976D2)'
                    : 'var(--surface-var)',
                  borderRadius: 10, padding: '7px 12px', fontWeight: 700, fontSize: 12,
                  color: isPublic ? '#fff' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {isPublic ? '📡' : '🔗'} {t('matchShare.shareBtn')}
              </button>
              <div style={{
                fontWeight: 900, fontSize: 20, color: 'var(--text)',
                letterSpacing: 1, minWidth: 52, textAlign: 'center',
              }}>
                {headerScore}
              </div>
              <button
                onClick={() => setShowEdit(true)}
                aria-label={t('match.edit.title')}
                style={{
                  padding: '7px 10px', borderRadius: 10, fontSize: 14,
                  background: 'var(--surface-var)', color: 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                ✏️
              </button>
            </div>
          }
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        {isTeam
          ? <TennisTeamTab match={currentMatch} clubDisplayName={clubDisplayName} />
          : <TennisSinglesEditor match={currentMatch} clubDisplayName={clubDisplayName} />
        }

        {/* Actions */}
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Official link (ČTenis) */}
          {currentMatch.officialResultsUrl && (
            <OfficialLinkButton url={currentMatch.officialResultsUrl} />
          )}

          {/* WhatsApp summary — dostupné jakmile je aspoň 1 sub-match rozhodnutý */}
          {(currentMatch.subMatches ?? []).some(s => s.winner !== null) && (
            <div style={{
              background: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)',
              borderRadius: 14, padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0D47A1' }}>
                📢 {t('tennis.detail.shareTitle')}
              </div>
              <div style={{ fontSize: 12, color: '#1565C0', lineHeight: 1.4 }}>
                {t('tennis.detail.shareDesc')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={handleShareWhatsapp}
                  style={{
                    flex: '1 1 140px', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: '#25D366', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >💬 WhatsApp</button>
                <button
                  onClick={handleCopySummary}
                  style={{
                    flex: '1 1 140px', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: '#fff', color: '#0D47A1', border: '1px solid #90CAF9',
                    cursor: 'pointer',
                  }}
                >📋 {t('match.detail.summaryCopy')}</button>
              </div>
            </div>
          )}

          {/* Delete button */}
          <button
            onClick={() => { void handleDelete(); }}
            style={{
              padding: '12px', borderRadius: 12, fontSize: 13, fontWeight: 700,
              background: 'transparent', color: 'var(--danger)',
              border: '1.5px solid var(--danger)', cursor: 'pointer',
              marginTop: 8,
            }}
          >
            🗑 {t('common.delete')}
          </button>
        </div>
      </div>

      {/* Sheets */}
      {showShare && (
        <ShareMatchSheet
          match={currentMatch}
          clubDisplayName={clubDisplayName}
          isPublic={isPublic}
          onTogglePublic={handleTogglePublic}
          onToggleLineupEarly={handleToggleLineupEarly}
          onClose={() => setShowShare(false)}
        />
      )}
      {showEdit && (
        <TennisEditMatchSheet
          match={currentMatch}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
