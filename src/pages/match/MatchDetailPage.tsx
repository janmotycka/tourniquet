import { useState, useCallback, useEffect } from 'react';
import type { Page } from '../../App';
import { useMatchesStore } from '../../store/matches.store';
import { useConfirmStore } from '../../store/confirm.store';
import { useI18n } from '../../i18n';
import { formatDate, computeElapsed, formatTime } from '../../components/match/match-utils';
import { LiveTab } from '../../components/match/LiveTab';
import { LineupTab } from '../../components/match/LineupTab';
import { RatingsTab } from '../../components/match/RatingsTab';
import { ShareMatchSheet } from '../../components/match/ShareMatchSheet';
import { EditMatchSheet } from '../../components/match/EditMatchSheet';
import { TennisTeamTab } from '../../modules/tennis/components/TennisTeamTab';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useClubsStore } from '../../store/clubs.store';
import { PageHeader, OfficialLinkButton } from '../../components/ui';
import { useToastStore } from '../../store/toast.store';
import { generateFacrTextReport, exportFacrReportPdf } from '../../utils/match-facr-report';
import { generateMatchSummaryText, generateNominationText } from '../../utils/match-summary';
import { generateTennisTeamSummaryText } from '../../modules/tennis/utils/tennis-team';
import { getMatchPublicUrl } from '../../utils/qr-code';
import { useMatchLock } from '../../hooks/useMatchLock';
import { useMatchPerspective } from '../../hooks/useMatchPerspective';
import { subscribeToSingleMatch } from '../../services/match.firebase';
import { useUserPrefsStore } from '../../store/userPrefs.store';

interface Props { matchId: string; navigate: (p: Page) => void; }

type Tab = 'live' | 'lineup' | 'ratings';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MatchDetailSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ height: 20, width: '60%', background: 'var(--surface-var)', borderRadius: 8, marginBottom: 12, animation: 'skeletonPulse 1.5s infinite' }} />
      <div style={{ height: 120, background: 'var(--surface)', borderRadius: 20, marginBottom: 12, animation: 'skeletonPulse 1.5s infinite' }} />
      <div style={{ height: 60, background: 'var(--surface)', borderRadius: 16, animation: 'skeletonPulse 1.5s infinite' }} />
    </div>
  );
}

// ─── MatchDetailPage ──────────────────────────────────────────────────────────

export function MatchDetailPage({ matchId, navigate }: Props) {
  const { t, locale } = useI18n();
  const { isDesktop } = useLayoutMode();
  const match = useMatchesStore(s => s.getMatchById(matchId));
  const matches = useMatchesStore(s => s.matches); // Subscribe for reactivity
  const togglePublicMatch = useMatchesStore(s => s.togglePublicMatch);
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const resetMatch = useMatchesStore(s => s.resetMatch);
  const reopenMatch = useMatchesStore(s => s.reopenMatch);
  const ask = useConfirmStore(s => s.ask);
  const [tab, setTab] = useState<Tab>('live');
  const [showShare, setShowShare] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsHydrating(false), 600);
    return () => clearTimeout(timer);
  }, []);

  // Re-read match on any store change
  const currentMatch = matches.find(m => m.id === matchId) ?? match;
  const activeClub = useClubsStore(s => s.clubs.find(c => c.id === currentMatch?.clubId));
  const clubDisplayName = currentMatch?.clubName || activeClub?.name || t('match.detail.us');

  // Safety guard — pokud zápas patří jinému sportu (uživatel přepnul sport po
  // otevření stránky nebo přišel na starý URL), přesměruj na seznam.
  useEffect(() => {
    if (currentMatch && (currentMatch.sport ?? 'football') === 'tennis') {
      navigate({ name: 'match-list' });
    }
  }, [currentMatch, navigate]);

  const handleTogglePublic = useCallback(() => {
    togglePublicMatch(matchId);
  }, [matchId, togglePublicMatch]);

  const handleToggleLineupEarly = useCallback(() => {
    if (!currentMatch) return;
    const next = (currentMatch.lineupVisibility ?? 'atStart') === 'always' ? 'atStart' : 'always';
    updateMatch(matchId, { lineupVisibility: next });
  }, [matchId, currentMatch, updateMatch]);

  const handleCopyFacrText = useCallback(async () => {
    if (!currentMatch) return;
    try {
      const text = generateFacrTextReport(currentMatch, clubDisplayName);
      await navigator.clipboard.writeText(text);
      useToastStore.getState().show('success', t('match.detail.facrCopied'));
    } catch {
      useToastStore.getState().show('error', t('match.detail.facrCopied'));
    }
  }, [currentMatch, clubDisplayName, t]);

  const handleDownloadFacrPdf = useCallback(async () => {
    if (!currentMatch) return;
    try {
      await exportFacrReportPdf(currentMatch, clubDisplayName, t, locale);
    } catch {
      /* PDF generation failed silently */
    }
  }, [currentMatch, clubDisplayName, t, locale]);

  // Post-match summary — krátký, WhatsApp-friendly.
  // Link vždy — ať si rodič může kliknout na detail. Pokud zápas ještě není
  // public, link v tu chvíli nezafunguje; trenér si ho zveřejní přes Share.
  const buildSummaryText = useCallback((): string | null => {
    if (!currentMatch) return null;
    const publicUrl = getMatchPublicUrl(currentMatch.id);
    // Tennis team match → vlastní formát
    if (currentMatch.sport === 'tennis' && currentMatch.matchType === 'team') {
      const players = activeClub?.players ?? [];
      return generateTennisTeamSummaryText({
        match: currentMatch,
        clubDisplayName,
        playerNameResolver: (id: string) => players.find(p => p.id === id)?.name ?? null,
        publicUrl,
        lang: locale,
      });
    }
    return generateMatchSummaryText({
      match: currentMatch,
      clubDisplayName,
      publicUrl,
    }, locale);
  }, [currentMatch, clubDisplayName, locale, activeClub]);

  const handleCopySummary = useCallback(async () => {
    const text = buildSummaryText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      useToastStore.getState().show('success', t('match.detail.summaryCopied'));
    } catch {
      useToastStore.getState().show('error', t('match.detail.summaryCopied'));
    }
  }, [buildSummaryText, t]);

  const handleShareSummaryWhatsapp = useCallback(() => {
    const text = buildSummaryText();
    if (!text) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  }, [buildSummaryText]);

  // Nominace — pozvánka rodičům před zápasem. Funguje dokud má lineup > 0
  // a zápas ještě nezačal (typicky se posílá 2-3 dny předem).
  // Link vždy — ať si rodič klikne na detail / sledování zápasu.
  const buildNominationText = useCallback((): string | null => {
    if (!currentMatch || currentMatch.lineup.length === 0) return null;
    return generateNominationText({
      match: currentMatch,
      clubDisplayName,
      publicUrl: getMatchPublicUrl(currentMatch.id),
    }, locale);
  }, [currentMatch, clubDisplayName, locale]);

  const handleShareNominationWhatsapp = useCallback(() => {
    const text = buildNominationText();
    if (!text) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  }, [buildNominationText]);

  const handleCopyNomination = useCallback(async () => {
    const text = buildNominationText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      useToastStore.getState().show('success', t('match.detail.nominationCopied'));
    } catch {
      useToastStore.getState().show('error', t('match.detail.nominationCopied'));
    }
  }, [buildNominationText, t]);

  // Všechny hooks MUSÍ být volané před early return (React rules of hooks).
  // Proto voláme i když currentMatch může být null — hooky jsou null-safe.
  const isLive = currentMatch?.status === 'live';
  const isPublic = !!currentMatch?.isPublic;

  // Audit 2026-05-17 (UX agent #1): onboarding spotlight pro Sdílet button.
  // Po prvním vytvoření Quick match user neví, že může poslat odkaz rodičům
  // přes Sdílet button v headeru. Ukážeme tooltip jednorázově.
  const [showShareHint, setShowShareHint] = useState(false);
  useEffect(() => {
    if (!currentMatch || !isLive) return;
    try {
      if (localStorage.getItem('torq.shareHintSeen') === '1') return;
    } catch { /* localStorage blocked */ }
    const timer = setTimeout(() => setShowShareHint(true), 1500);
    return () => clearTimeout(timer);
  }, [currentMatch, isLive]);
  const dismissShareHint = () => {
    setShowShareHint(false);
    try { localStorage.setItem('torq.shareHintSeen', '1'); } catch { /* blocked */ }
  };

  // Live elapsed timer v headeru
  const [headerElapsed, setHeaderElapsed] = useState(() => currentMatch ? computeElapsed(currentMatch) : 0);
  useEffect(() => {
    if (!currentMatch || !isLive || currentMatch.pausedAt) return;
    const interval = setInterval(() => setHeaderElapsed(computeElapsed(currentMatch)), 1000);
    return () => clearInterval(interval);
  }, [isLive, currentMatch?.pausedAt, currentMatch]);
  useEffect(() => {
    if (!currentMatch) return;
     
    setHeaderElapsed(computeElapsed(currentMatch));
  }, [currentMatch]);

  const headerSubtitle = isLive
    ? `⏱ ${formatTime(headerElapsed)} ● ${t('match.live')}`
    : currentMatch ? `${formatDate(currentMatch.date)} · ${currentMatch.kickoffTime}` : '';

  // Multi-trainer soft lock — oba hooks jsou null-safe (zvládají undefined match).
  // V Simple módu (laik/učitel TV) lock úplně vypínáme — nepotřebuje řešit
  // „Spravuji" / „Převzít řízení" bannery, matou ho.
  const isSimpleMode = useUserPrefsStore(s => s.appMode === 'simple');
  const lock = useMatchLock(currentMatch);
  const perspective = useMatchPerspective(currentMatch);
  const isClubMatch = !!(currentMatch?.clubId && !currentMatch.clubId.startsWith('individual-'));
  const isPairedAwayCoach = perspective.role === 'away';
  const isPairedMatch = !!(currentMatch?.pairing?.awayCoachUid);
  const needsLock = (isClubMatch || isPairedMatch) && !isSimpleMode;
  const canEdit = !needsLock || lock.status === 'mine' || lock.status === 'idle';

  // Real-time subscribe na single match pro paired away coach-e.
  const ownerScopeForSubscribe = currentMatch?.pairing?.ownerScope
    ?? (currentMatch?.clubId && !currentMatch.clubId.startsWith('individual-') ? currentMatch.clubId : null);
  useEffect(() => {
    if (!isPairedAwayCoach || !ownerScopeForSubscribe) return;
    const unsubscribe = subscribeToSingleMatch(ownerScopeForSubscribe, matchId, (fresh) => {
      if (!fresh) return;
      useMatchesStore.setState(s => ({
        matches: s.matches.some(m => m.id === matchId)
          ? s.matches.map(m => m.id === matchId ? { ...fresh } : m)
          : [fresh, ...s.matches],
      }));
    });
    return () => unsubscribe();
  }, [isPairedAwayCoach, ownerScopeForSubscribe, matchId]);

  // Auto-claim při idle — pokud jsem otevřel zápas v klubu/paired a nikdo
  // aktivně needituje, automaticky se stanu editorem. Tím se skryje matoucí
  // banner „Nikdo nespravuje" + jiný trenér hned uvidí že jsem v zápase.
  useEffect(() => {
    if (!needsLock) return;
    if (lock.status !== 'idle') return;
    void lock.claim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLock, lock.status]);

  const handleClaim = useCallback(async () => {
    if (lock.status === 'other' && lock.editor) {
      const ok = await ask({
        title: t('matchLock.claimConfirmTitle'),
        message: t('matchLock.claimConfirmMsg', { name: lock.editor.name }),
      });
      if (!ok) return;
    }
    const claimed = await lock.claim();
    if (!claimed) {
      useToastStore.getState().show('error', t('matchLock.claimFailed'));
    }
  }, [lock, ask, t]);

  if (!currentMatch && isHydrating) {
    return <MatchDetailSkeleton />;
  }

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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', width: '100%', maxWidth: isDesktop ? 1400 : undefined, margin: isDesktop ? '0 auto' : undefined, boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-sm)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <PageHeader
          title={`${perspective.myTeamName || clubDisplayName} ${t('match.detail.vs')} ${perspective.theirTeamName || currentMatch.opponent}`}
          subtitle={headerSubtitle}
          onBack={() => navigate({ name: 'match-list' })}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              <button
                onClick={() => { setShowShare(true); dismissShareHint(); }}
                aria-label={t('matchShare.title')}
                style={{
                  background: isPublic
                    ? 'linear-gradient(135deg, var(--primary), var(--primary-600, var(--primary)))'
                    : 'var(--surface-var)',
                  borderRadius: 12, padding: '8px 12px', fontWeight: 700, fontSize: 12,
                  color: isPublic ? '#fff' : 'var(--text-muted)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                  border: 'none', cursor: 'pointer',
                  boxShadow: isPublic ? '0 2px 8px rgba(0,0,0,.15)' : 'none',
                  position: 'relative',
                  // Glow ring během share hintu pro vizuální upoutání pozornosti
                  outline: showShareHint ? '3px solid var(--primary)' : 'none',
                  outlineOffset: showShareHint ? 2 : 0,
                  animation: showShareHint ? 'shareHintPulse 1.5s ease-in-out infinite' : 'none',
                }}
                title={t('matchShare.title')}
              >
                <span style={{ fontSize: 14 }}>{isPublic ? '📡' : '🔗'}</span>
                <span>{t('matchShare.shareBtn')}</span>
                {isPublic && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#fff', marginLeft: 2,
                    animation: 'pulse 1.5s infinite',
                  }} />
                )}
              </button>
              <style>{`
                @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }
                @keyframes shareHintPulse {
                  0%,100% { box-shadow: 0 0 0 0 rgba(46,125,50,.6) }
                  50%     { box-shadow: 0 0 0 8px rgba(46,125,50,0) }
                }
              `}</style>
              {showShareHint && (
                <div
                  onClick={dismissShareHint}
                  role="tooltip"
                  style={{
                    position: 'absolute',
                    top: '100%', right: 0, marginTop: 8,
                    background: 'var(--primary)', color: '#fff',
                    padding: '10px 14px', borderRadius: 12,
                    fontSize: 12, fontWeight: 600, lineHeight: 1.4,
                    maxWidth: 240,
                    boxShadow: '0 6px 20px rgba(0,0,0,.25)',
                    zIndex: 50, cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 2 }}>
                    💡 {t('match.detail.shareHintTitle')}
                  </div>
                  <div style={{ opacity: 0.92 }}>
                    {t('match.detail.shareHintBody')}
                  </div>
                  <div style={{
                    position: 'absolute', top: -6, right: 16,
                    width: 0, height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid var(--primary)',
                  }} />
                </div>
              )}
              <div style={{
                fontWeight: 900, fontSize: 20, color: isLive ? 'var(--primary)' : 'var(--text)',
                letterSpacing: 1, flexShrink: 0,
              }}>
                {perspective.myScore}:{perspective.theirScore}
              </div>
            </div>
          }
        />
        <div style={{ padding: '0 16px 10px' }}>

        {/* Tab bar + edit.
            Tenis team match nemá klasický lineup/hodnocení tabs (sub-matches nesou svoje
            hráče + skóre jsou v sub-match řádcích). Schováváme je. */}
        {(() => {
          const isTennisTeam = currentMatch.sport === 'tennis' && currentMatch.matchType === 'team';
          // V Simple módu zobrazujeme jen 'live' tab — sestavu a hodnocení laik
          // nepotřebuje, matou ho (vyžadují klubovou vazbu, ratings atd.).
          const tabs = (isTennisTeam || isSimpleMode)
            ? ([['live', isLive ? `● ${t('match.detail.tabLive')}` : t('match.detail.tabMatch')]] as const)
            : ([['live', isLive ? `● ${t('match.detail.tabLive')}` : t('match.detail.tabMatch')], ['lineup', t('match.detail.tabLineup')], ['ratings', t('match.detail.tabRatings')]] as const);
          return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {tabs.map(([key, label]) => (
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
          <button
            onClick={() => setShowEdit(true)}
            aria-label={t('match.edit.title')}
            title={t('match.edit.title')}
            style={{
              padding: '8px 10px', borderRadius: 10, fontWeight: 700, fontSize: 13,
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
          >
            ✏️
          </button>
        </div>
          );
        })()}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {/* Multi-trainer lock banner — jen když zápas aktivně spravuje NĚKDO JINÝ.
            Pro idle stav automaticky claim-ujeme (níže v useEffect), takže
            banner se prakticky objeví jen v konfliktu (other/stale). */}
        {needsLock && (lock.status === 'other' || lock.status === 'stale') && (
          <div style={{
            margin: '10px 16px 0',
            padding: '10px 14px', borderRadius: 12,
            background: lock.status === 'stale'
              ? 'var(--warning-light)'
              : 'var(--danger-light)',
            border: `1px solid ${lock.status === 'stale' ? 'var(--warning)' : 'var(--danger)'}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {lock.status === 'stale' ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>
                    ⚠️ {t('matchLock.staleTitle', { name: lock.editor?.name || '?' })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {t('matchLock.staleHint', { seconds: lock.ageSeconds ?? 0 })}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>
                    🔒 {t('matchLock.otherTitle', { name: lock.editor?.name || '?' })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {t('matchLock.otherHint')}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => { void handleClaim(); }}
              style={{
                padding: '8px 12px', borderRadius: 8, border: 'none',
                background: 'var(--primary)', color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              🎯 {t('matchLock.claimBtn')}
            </button>
          </div>
        )}

        {/* Pokud mám lock — subtilní green banner "Spravuji" */}
        {needsLock && lock.status === 'mine' && (
          <div style={{
            margin: '10px 16px 0',
            padding: '8px 14px', borderRadius: 12,
            background: 'var(--success-light)', border: '1px solid var(--success)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>
                ✓ {t('matchLock.mineTitle')}
              </div>
            </div>
            <button
              onClick={() => { void lock.release(); }}
              style={{
                padding: '4px 10px', borderRadius: 6, border: 'none',
                background: 'transparent', color: 'var(--text-muted)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {t('matchLock.releaseBtn')}
            </button>
          </div>
        )}

        {/* Cross-team pairing badge — ukazuje, že zápas zapisují oba trenéři. */}
        {isPairedMatch && (
          <div style={{
            margin: '8px 16px 0',
            padding: '8px 14px', borderRadius: 12,
            background: 'var(--primary-light)',
            border: '1px solid var(--primary)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>🤝</span>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                {isPairedAwayCoach
                  ? t('matchPairing.bannerAwayRole', { club: currentMatch.clubName || perspective.theirTeamName })
                  : t('matchPairing.bannerHomeRole', { name: currentMatch.pairing?.awayCoachName || t('matchPairing.opposingCoach') })}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                {t('matchPairing.bannerHint')}
              </div>
            </div>
          </div>
        )}

        {/* Read-only gate wrapper — pokud nemám lock, editovací akce jsou disabled */}
        <div
          style={{
            pointerEvents: canEdit ? 'auto' : 'none',
            opacity: canEdit ? 1 : 0.55,
            transition: 'opacity .15s',
          }}
          aria-disabled={!canEdit}
        >
        {(() => {
          const isTennisTeam = currentMatch.sport === 'tennis' && currentMatch.matchType === 'team';
          // Tenis družstva — vždy render TennisTeamTab bez ohledu na `tab` state
          // (lineup/ratings nejsou relevantní — jejich UI je v TennisTeamTabu).
          if (isTennisTeam) {
            return <TennisTeamTab match={currentMatch} clubDisplayName={clubDisplayName} />;
          }
          if (tab === 'live') return <LiveTab match={currentMatch} />;
          // Pro paired away coach-e — lineup/ratings patří druhému trenérovi;
          // nezobrazujeme data soupeře, jen vysvětlující placeholder.
          if (isPairedAwayCoach && (tab === 'lineup' || tab === 'ratings')) {
            return (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🤝</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                  {t('matchPairing.awayTabUnavailableTitle')}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 360, margin: '0 auto' }}>
                  {t('matchPairing.awayTabUnavailableHint')}
                </div>
              </div>
            );
          }
          if (tab === 'lineup') return <LineupTab match={currentMatch} />;
          if (tab === 'ratings') return <RatingsTab match={currentMatch} />;
          return null;
        })()}
        </div>

        {/* Match actions */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {/* Official link (např. ČTenis) — pokud je k dispozici, ukaž prominentně. */}
          {currentMatch.officialResultsUrl && (
            <OfficialLinkButton url={currentMatch.officialResultsUrl} />
          )}

          {/* Nominace — pre-match pozvánka rodičům do WhatsApp.
              Zobrazí se dokud zápas nezačal a má aspoň 1 hráče v soupisce. */}
          {currentMatch.status === 'planned' && currentMatch.lineup.length > 0 && (
            <div style={{
              background: 'var(--primary-light)',
              border: '1px solid var(--primary-light)',
              borderRadius: 14, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 10,
              marginBottom: 4,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                📣 {t('match.detail.nominationTitle')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--primary)', opacity: 0.85, lineHeight: 1.4 }}>
                {t('match.detail.nominationDesc')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={handleShareNominationWhatsapp}
                  style={{
                    flex: '1 1 140px', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: '#25D366', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  💬 {t('match.detail.nominationWhatsapp')}
                </button>
                <button
                  onClick={handleCopyNomination}
                  style={{
                    flex: '1 1 140px', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: 'var(--surface)', color: 'var(--primary)',
                    border: '1px solid var(--primary)', cursor: 'pointer',
                  }}
                >
                  📋 {t('match.detail.nominationCopy')}
                </button>
              </div>
            </div>
          )}

          {/* Post-match summary — WhatsApp-friendly. Pro tenisové družstva je dostupné,
              jakmile je aspoň jeden sub-match rozhodnutý (živé průběžné skóre). */}
          {(currentMatch.status === 'finished' ||
            (currentMatch.sport === 'tennis' && currentMatch.matchType === 'team' &&
             (currentMatch.subMatches ?? []).some(s => s.winner !== null))) && (
            <div style={{
              background: 'var(--success-light)',
              border: '1px solid var(--success-light)',
              borderRadius: 14, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 10,
              marginBottom: 4,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>
                📢 {t('match.detail.summaryTitle')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--success)', opacity: 0.85, lineHeight: 1.4 }}>
                {t('match.detail.summaryDesc')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={handleShareSummaryWhatsapp}
                  style={{
                    flex: '1 1 140px', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: '#25D366', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  💬 {t('match.detail.summaryWhatsapp')}
                </button>
                <button
                  onClick={handleCopySummary}
                  style={{
                    flex: '1 1 140px', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: 'var(--surface)', color: 'var(--success)',
                    border: '1px solid var(--success)', cursor: 'pointer',
                  }}
                >
                  📋 {t('match.detail.summaryCopy')}
                </button>
              </div>
            </div>
          )}
          {/* Next-match CTA + Turnajový den summary — audit 2026-04-24 (Honza):
              „Po skončení zápasu jsem musel šipkou zpátky, žádný nudge na
              další." + „Po pátým zápase mi pořád vyskakuje 'založ další' a
              já už nechci — chybí tlačítko 'turnaj hotov'."

              Logika: spočítáme zápasy odehrané dnes (stejné date) ze stejného
              klubu. Při 3+ zápasech za den rozšíříme CTA o druhé tlačítko
              „🏁 Ukázat dnešní den" — vede na filtered match-list. */}
          {currentMatch.status === 'finished' &&
            !(currentMatch.sport === 'tennis') &&
            !currentMatch.pairing?.awayCoachUid && (() => {
              const sameDayMatches = matches.filter(m =>
                m.date === currentMatch.date &&
                m.clubId === currentMatch.clubId &&
                m.status === 'finished'
              );
              const isTournamentDay = sameDayMatches.length >= 3;
              return (
                <div style={{
                  background: 'linear-gradient(135deg, var(--primary) 0%, #0D47A1 100%)',
                  borderRadius: 14, padding: '14px 16px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                  marginBottom: 4,
                  color: '#fff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 26 }}>⚽</span>
                    <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        {isTournamentDay
                          ? t('match.detail.tournamentDayTitle', { n: sameDayMatches.length })
                          : t('match.detail.nextMatchCtaTitle')}
                      </div>
                      <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>
                        {isTournamentDay
                          ? t('match.detail.tournamentDayDesc')
                          : (isSimpleMode ? t('match.detail.nextMatchCtaDescSimple') : t('match.detail.nextMatchCtaDesc'))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => navigate({ name: 'match-list' })}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none',
                        background: '#fff', color: 'var(--primary)',
                        fontSize: 13, fontWeight: 800, cursor: 'pointer',
                      }}
                    >
                      + {t('match.detail.nextMatchCtaBtn')}
                    </button>
                    {/* „Stejná sestava" CTA — audit 2026-04-29: po Quick zápase
                        trenér často hraje další proti jinému soupeři se stejnou
                        sestavou (turnaj, plácek, tréninkový zápas). Tlačítko
                        ho pošle rovnou na QuickMatchPage s předvyplněnou
                        soupiskou. Skryté pro Advanced (tam má CreateMatchPage
                        vlastní copy-lineup feature). */}
                    {currentMatch.isQuickMatch && (
                      <button
                        onClick={() => navigate({
                          name: 'match-quick',
                          prefillFromMatchId: currentMatch.id,
                        })}
                        style={{
                          flex: 1, padding: '10px 12px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.18)', color: '#fff',
                          border: '1px solid rgba(255,255,255,0.35)',
                          fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        🔁 {t('match.detail.sameLineupBtn')}
                      </button>
                    )}
                    {!currentMatch.isQuickMatch && isTournamentDay && (
                      <button
                        onClick={() => navigate({ name: 'match-list' })}
                        style={{
                          flex: 1, padding: '10px 12px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.18)', color: '#fff',
                          border: '1px solid rgba(255,255,255,0.35)',
                          fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        🏁 {t('match.detail.tournamentDayBtn')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* FAČR report — Advanced/klubová feature (oficiální zápis pro českou
              fotbalovou asociaci). Skryté v Simple módu — laik / učitel TV ho
              nepotřebuje. Audit 2026-04-29: skryté i pro Quick match (rychlý
              zápas / přátelák) i v Advanced módu — bez kompletní sestavy
              s pozicemi nemá FAČR co reportovat. */}
          {currentMatch.status === 'finished' && !isSimpleMode && !currentMatch.isQuickMatch && (
            <div style={{
              background: 'var(--surface)', borderRadius: 14, padding: '12px 14px',
              border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10,
              marginBottom: 4,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                {t('match.detail.facrReportTitle')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={handleCopyFacrText}
                  style={{
                    flex: '1 1 140px', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  📋 {t('match.detail.facrCopyText')}
                </button>
                <button
                  onClick={handleDownloadFacrPdf}
                  style={{
                    flex: '1 1 140px', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: 'var(--surface-var)', color: 'var(--text)', border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  📄 {t('match.detail.facrDownloadPdf')}
                </button>
              </div>
            </div>
          )}
          {currentMatch.status === 'finished' && (
            <button
              onClick={async () => {
                const ok = await ask({
                  title: t('match.detail.reopenTitle'),
                  message: t('match.detail.reopenMessage'),
                });
                if (ok) reopenMatch(matchId);
              }}
              style={{
                width: '100%', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: 'var(--surface-var)', color: 'var(--text)', border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              {t('match.detail.reopenBtn')}
            </button>
          )}
          {(currentMatch.status === 'live' || currentMatch.status === 'finished') && (
            <button
              onClick={async () => {
                const ok = await ask({
                  title: t('match.detail.resetTitle'),
                  message: t('match.detail.resetMessage'),
                  destructive: true,
                  confirmLabel: t('match.detail.resetConfirm'),
                });
                if (ok) resetMatch(matchId);
              }}
              style={{
                width: '100%', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: 'var(--danger-light)', color: 'var(--danger)', border: 'none',
                cursor: 'pointer',
              }}
            >
              {t('match.detail.resetBtn')}
            </button>
          )}
        </div>
      </div>

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
        <EditMatchSheet
          match={currentMatch}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
