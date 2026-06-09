/**
 * BracketView — vizuální turnajový pavouk se spojovacími čarami.
 *
 * Audit 2026-05-29 (Apple Sports inspirace): přepracováno z vertikálního
 * seznamu sekcí na SKUTEČNÝ binární strom s SVG spojnicemi:
 *  - Sloupce per kolo (ČF → SF → Finále), horizontální scroll na mobilu
 *  - SVG elbow konektory mezi koly (vítěz postupuje vpravo)
 *  - „Sleduj můj tým" — zvýraznění cesty vybraného týmu pavoukem
 *  - Animovaný reveal — karta poskočí když se do ní propíše postupující tým
 *  - Kompaktní karty (přehled „na první pohled"); detail na tap
 *
 * Play-out (o umístění) + zápas o 3. místo se nevejdou do binárního stromu →
 * renderují se jako sekce POD pavoukem.
 *
 * Live skóre přes Firebase realtime (data přicházejí v `matches` propu).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Match, Team, MatchStage } from '../types/tournament.types';
import { useI18n } from '../i18n';
import { TeamBadge } from './tournament/TeamBadge';
import { MatchCardTimer } from './tournament/MatchCardTimer';

interface BracketViewProps {
  matches: Match[];        // filtrované na knockout (stage !== 'group')
  teams: Team[];
  onMatchClick?: (matchId: string) => void;
  onLiveClick?: () => void;  // klik na live zápas → přepne na záložku Zápasy
}

// Binární strom: tato kola tvoří pavouk. Placement + third-place jsou bokem.
const TREE_STAGE_ORDER: MatchStage[] = ['quarterfinal', 'semifinal', 'final'];

const STAGE_LABEL_KEYS: Record<string, string> = {
  quarterfinal: 'knockout.quarterfinal',
  semifinal: 'knockout.semifinal',
  final: 'knockout.final',
  'third-place': 'knockout.thirdPlaceMatch',
  placement: 'knockout.placement',
};

// ─── Layout konstanty (deterministický strom — fixní výška karty) ──────────────
const CARD_W = 156;
const CARD_H = 58;
const COL_GAP = 34;     // mezera mezi sloupci (prostor pro konektory)
const ROW_GAP = 14;     // mezera mezi kartami v prvním kole
const PAD_TOP = 8;

export function BracketView({ matches, teams, onMatchClick, onLiveClick }: BracketViewProps) {
  const { t } = useI18n();
  const [focusTeamId, setFocusTeamId] = useState<string | null>(null);

  // ── Rozdělit zápasy podle stage + seřadit podle bracketPosition ──
  const { treeRounds, placementSections, thirdPlace } = useMemo(() => {
    const byStage = new Map<string, Match[]>();
    for (const m of matches) {
      const stage = m.stage ?? 'unknown';
      if (!byStage.has(stage)) byStage.set(stage, []);
      byStage.get(stage)!.push(m);
    }
    for (const [, arr] of byStage) {
      arr.sort((a, b) => (a.bracketPosition ?? a.matchIndex) - (b.bracketPosition ?? b.matchIndex));
    }

    const tRounds: { stage: MatchStage; matches: Match[] }[] = [];
    for (const stage of TREE_STAGE_ORDER) {
      const sm = byStage.get(stage);
      if (sm && sm.length > 0) tRounds.push({ stage, matches: sm });
    }

    const placement = (byStage.get('placement') ?? [])
      .slice().sort((a, b) => a.matchIndex - b.matchIndex);

    return {
      treeRounds: tRounds,
      placementSections: placement,
      thirdPlace: byStage.get('third-place')?.[0] ?? null,
    };
  }, [matches]);

  const getTeamName = (m: Match, side: 'home' | 'away') => {
    const teamId = side === 'home' ? m.homeTeamId : m.awayTeamId;
    const placeholder = side === 'home' ? m.homeTeamPlaceholder : m.awayTeamPlaceholder;
    if (teamId) return teams.find(tm => tm.id === teamId)?.name ?? '?';
    return placeholder ?? t('knockout.tbd');
  };
  const isTeamResolved = (m: Match, side: 'home' | 'away') =>
    !!(side === 'home' ? m.homeTeamId : m.awayTeamId);

  // ── Výpočet pozic karet v binárním stromě (deterministický) ──
  // Round 0: karty rovnoměrně pod sebou. Round r: každá karta vycentrovaná
  // mezi své dva „feeder" zápasy z předchozího kola (pozice 2P a 2P+1).
  const layout = useMemo(() => {
    if (treeRounds.length === 0) return { cards: [], width: 0, height: 0 };
    const unit = CARD_H + ROW_GAP;
    // centers[round][positionInColumn] = y-střed karty
    const centers: number[][] = [];
    treeRounds.forEach((round, rIdx) => {
      const col: number[] = [];
      round.matches.forEach((m, i) => {
        if (rIdx === 0) {
          col.push(PAD_TOP + i * unit + CARD_H / 2);
        } else {
          // Najdi feeder centra z předchozího kola podle bracketPosition.
          const prevCenters = centers[rIdx - 1];
          const pos = m.bracketPosition ?? i;
          const f1 = prevCenters[pos * 2];
          const f2 = prevCenters[pos * 2 + 1];
          if (f1 != null && f2 != null) col.push((f1 + f2) / 2);
          else if (f1 != null) col.push(f1);
          else col.push(PAD_TOP + i * unit * Math.pow(2, rIdx) + CARD_H / 2);
        }
      });
      centers.push(col);
    });

    type CardPos = { match: Match; round: number; x: number; y: number };
    const cards: CardPos[] = [];
    let maxY = 0;
    treeRounds.forEach((round, rIdx) => {
      round.matches.forEach((m, i) => {
        const cy = centers[rIdx][i];
        const x = rIdx * (CARD_W + COL_GAP);
        cards.push({ match: m, round: rIdx, x, y: cy - CARD_H / 2 });
        maxY = Math.max(maxY, cy + CARD_H / 2);
      });
    });

    // Konektory: feeder (pravý okraj) → cílová karta (levý okraj), elbow path.
    type Conn = { d: string; matchId: string; feederId: string };
    const conns: Conn[] = [];
    for (let rIdx = 1; rIdx < treeRounds.length; rIdx++) {
      const round = treeRounds[rIdx];
      round.matches.forEach((m, i) => {
        const pos = m.bracketPosition ?? i;
        const targetCy = centers[rIdx][i];
        const targetX = rIdx * (CARD_W + COL_GAP);
        [pos * 2, pos * 2 + 1].forEach(fp => {
          const fCy = centers[rIdx - 1]?.[fp];
          if (fCy == null) return;
          const feederMatch = treeRounds[rIdx - 1].matches[fp];
          const feederRightX = (rIdx - 1) * (CARD_W + COL_GAP) + CARD_W;
          const midX = feederRightX + COL_GAP / 2;
          // elbow: ven z feederu → vertikální v půlce → do cíle
          const d = `M ${feederRightX} ${fCy} H ${midX} V ${targetCy} H ${targetX}`;
          conns.push({ d, matchId: m.id, feederId: feederMatch?.id ?? '' });
        });
      });
    }

    const width = treeRounds.length * CARD_W + (treeRounds.length - 1) * COL_GAP;
    return { cards, conns, width, height: maxY + PAD_TOP };
  }, [treeRounds]);

  // ── Focus tým: cesta pavoukem (zápasy kde tým aktuálně hraje) ──
  const focusMatchIds = useMemo(() => {
    if (!focusTeamId) return new Set<string>();
    const ids = new Set<string>();
    for (const m of matches) {
      if (m.homeTeamId === focusTeamId || m.awayTeamId === focusTeamId) ids.add(m.id);
    }
    return ids;
  }, [focusTeamId, matches]);

  // Týmy do focus chipů — jen ty co jsou v knockout zápasech
  const knockoutTeams = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matches) {
      if (m.homeTeamId) ids.add(m.homeTeamId);
      if (m.awayTeamId) ids.add(m.awayTeamId);
    }
    return teams.filter(tm => ids.has(tm.id));
  }, [matches, teams]);

  if (treeRounds.length === 0 && placementSections.length === 0 && !thirdPlace) return null;

  return (
    <div>
      <style>{`
        @keyframes bracketGoalPop { 0% { transform: scale(0.7); opacity: 0; } 50% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes bracketResolvePop { 0% { transform: scale(0.85); opacity: 0.4; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes bracketConnDraw { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontWeight: 800, fontSize: 15, color: 'var(--primary)' }}>
          {t('knockout.playoffStage')}
        </h3>
      </div>

      {/* ── Focus-my-team chip row ── */}
      {knockoutTeams.length > 1 && (
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6,
          WebkitOverflowScrolling: 'touch',
        }}>
          <button
            type="button"
            onClick={() => setFocusTeamId(null)}
            style={focusChipStyle(focusTeamId === null)}
          >
            {t('knockout.allTeams')}
          </button>
          {knockoutTeams.map(tm => (
            <button
              key={tm.id}
              type="button"
              onClick={() => setFocusTeamId(focusTeamId === tm.id ? null : tm.id)}
              style={{ ...focusChipStyle(focusTeamId === tm.id), display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <TeamBadge team={tm} size={12} />
              {tm.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Pavouk (horizontální scroll) ── */}
      {treeRounds.length > 0 && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>
          <div style={{ position: 'relative', width: layout.width, height: layout.height + 20, minWidth: '100%' }}>
            {/* Sloupcové hlavičky (kola) */}
            {treeRounds.map((round, rIdx) => (
              <div
                key={round.stage}
                style={{
                  position: 'absolute',
                  left: rIdx * (CARD_W + COL_GAP), top: -2, width: CARD_W,
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                  textTransform: 'uppercase', textAlign: 'center',
                  color: round.stage === 'final' ? 'var(--warning)' : 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              >
                {round.stage === 'final' ? '🏆 ' : ''}{t(STAGE_LABEL_KEYS[round.stage] ?? round.stage)}
              </div>
            ))}

            {/* SVG konektory */}
            <svg
              width={layout.width} height={layout.height}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', marginTop: 14 }}
            >
              {(layout.conns ?? []).map((c, i) => {
                const onPath = focusMatchIds.has(c.matchId) && focusMatchIds.has(c.feederId);
                return (
                  <path
                    key={i}
                    d={c.d}
                    fill="none"
                    stroke={onPath ? 'var(--primary)' : 'var(--border)'}
                    strokeWidth={onPath ? 2.5 : 1.5}
                    strokeLinejoin="round"
                  />
                );
              })}
            </svg>

            {/* Karty (absolutně pozicované, +14px na hlavičky kol) */}
            {layout.cards.map(({ match, x, y }) => (
              <div key={match.id} style={{ position: 'absolute', left: x, top: y + 14, width: CARD_W }}>
                <BracketCard
                  match={match}
                  teams={teams}
                  getTeamName={getTeamName}
                  isTeamResolved={isTeamResolved}
                  isFinal={match.stage === 'final'}
                  dimmed={focusTeamId != null && !focusMatchIds.has(match.id)}
                  onPath={focusMatchIds.has(match.id)}
                  onClick={match.status === 'live' && onLiveClick ? onLiveClick : onMatchClick ? () => onMatchClick(match.id) : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Play-out (o umístění) + 3. místo — pod pavoukem ── */}
      {(placementSections.length > 0 || thirdPlace) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {thirdPlace && (
            <ExtraMatchSection
              label={`🥉 ${t('knockout.thirdPlaceMatch')}`}
              match={thirdPlace}
              teams={teams}
              getTeamName={getTeamName}
              isTeamResolved={isTeamResolved}
              focusMatchIds={focusMatchIds}
              focusActive={focusTeamId != null}
              onMatchClick={onMatchClick}
              onLiveClick={onLiveClick}
            />
          )}
          {placementSections.map(m => (
            <ExtraMatchSection
              key={m.id}
              label={`🏅 ${m.placementLabel ?? t('knockout.placement')}`}
              match={m}
              teams={teams}
              getTeamName={getTeamName}
              isTeamResolved={isTeamResolved}
              focusMatchIds={focusMatchIds}
              focusActive={focusTeamId != null}
              onMatchClick={onMatchClick}
              onLiveClick={onLiveClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function focusChipStyle(active: boolean): React.CSSProperties {
  return {
    flexShrink: 0, padding: '5px 11px', borderRadius: 999,
    background: active ? 'var(--primary)' : 'var(--surface-var)',
    color: active ? '#fff' : 'var(--text-muted)',
    border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

// ─── ExtraMatchSection — play-out / 3. místo (mimo strom) ────────────────────────
function ExtraMatchSection({ label, match, teams, getTeamName, isTeamResolved, focusMatchIds, focusActive, onMatchClick, onLiveClick }: {
  label: string;
  match: Match;
  teams: Team[];
  getTeamName: (m: Match, side: 'home' | 'away') => string;
  isTeamResolved: (m: Match, side: 'home' | 'away') => boolean;
  focusMatchIds: Set<string>;
  focusActive: boolean;
  onMatchClick?: (id: string) => void;
  onLiveClick?: () => void;
}) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 800, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ maxWidth: CARD_W + 60 }}>
        <BracketCard
          match={match}
          teams={teams}
          getTeamName={getTeamName}
          isTeamResolved={isTeamResolved}
          isFinal={false}
          dimmed={focusActive && !focusMatchIds.has(match.id)}
          onPath={focusMatchIds.has(match.id)}
          onClick={match.status === 'live' && onLiveClick ? onLiveClick : onMatchClick ? () => onMatchClick(match.id) : undefined}
        />
      </div>
    </div>
  );
}

// ─── BracketCard — kompaktní karta zápasu (přehled na první pohled) ─────────────
function BracketCard({ match, teams, getTeamName, isTeamResolved, isFinal, dimmed, onPath, onClick }: {
  match: Match;
  teams: Team[];
  getTeamName: (m: Match, side: 'home' | 'away') => string;
  isTeamResolved: (m: Match, side: 'home' | 'away') => boolean;
  isFinal: boolean;
  dimmed?: boolean;
  onPath?: boolean;
  onClick?: () => void;
}) {
  const { t } = useI18n();
  const isFinished = match.status === 'finished';
  const isLive = match.status === 'live';
  const homeName = getTeamName(match, 'home');
  const awayName = getTeamName(match, 'away');
  const homeResolved = isTeamResolved(match, 'home');
  const awayResolved = isTeamResolved(match, 'away');
  const homeTeam = match.homeTeamId ? teams.find(tm => tm.id === match.homeTeamId) : null;
  const awayTeam = match.awayTeamId ? teams.find(tm => tm.id === match.awayTeamId) : null;

  const hasPenalty = match.homePenaltyScore != null && match.awayPenaltyScore != null;
  const homeWon = isFinished && (
    match.homeScore > match.awayScore ||
    (match.homeScore === match.awayScore && hasPenalty && match.homePenaltyScore! > match.awayPenaltyScore!)
  );
  const awayWon = isFinished && (
    match.awayScore > match.homeScore ||
    (match.homeScore === match.awayScore && hasPenalty && match.awayPenaltyScore! > match.homePenaltyScore!)
  );

  // Goal flash — změna skóre u live zápasů
  const prevScore = useRef({ home: match.homeScore, away: match.awayScore });
  const [goalFlash, setGoalFlash] = useState<'home' | 'away' | null>(null);
  useEffect(() => {
    if (!isLive) return;
    const prev = prevScore.current;
    if (match.homeScore > prev.home) setGoalFlash('home');
    else if (match.awayScore > prev.away) setGoalFlash('away');
    prevScore.current = { home: match.homeScore, away: match.awayScore };
  }, [match.homeScore, match.awayScore, isLive]);
  useEffect(() => {
    if (!goalFlash) return;
    const timer = setTimeout(() => setGoalFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [goalFlash]);

  // Reveal pop — když se TBD karta vyřeší (propíše postupující tým)
  const prevResolved = useRef(homeResolved && awayResolved);
  const [revealPop, setRevealPop] = useState(false);
  useEffect(() => {
    const nowResolved = homeResolved && awayResolved;
    if (!prevResolved.current && nowResolved) {
      setRevealPop(true);
      const tm = setTimeout(() => setRevealPop(false), 700);
      prevResolved.current = nowResolved;
      return () => clearTimeout(tm);
    }
    prevResolved.current = nowResolved;
  }, [homeResolved, awayResolved]);

  const border = onPath ? '2px solid var(--primary)'
    : isLive ? '2px solid var(--danger)'
    : isFinal ? '2px solid var(--primary)'
    : '1px solid var(--border)';

  // Render helper (NE komponenta — vyhne se „component created during render").
  const renderTeamRow = (side: 'home' | 'away') => {
    const name = side === 'home' ? homeName : awayName;
    const won = side === 'home' ? homeWon : awayWon;
    const resolved = side === 'home' ? homeResolved : awayResolved;
    const team = side === 'home' ? homeTeam : awayTeam;
    const score = side === 'home' ? match.homeScore : match.awayScore;
    const flashing = goalFlash === side;
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '3px 5px', margin: '0 -5px', borderRadius: 5,
        background: won ? 'var(--primary-light)' : 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          {team && <TeamBadge team={team} size={11} />}
          <span style={{
            fontSize: 11, fontWeight: won ? 800 : 600,
            color: won ? 'var(--primary)' : resolved ? 'var(--text)' : 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </span>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 800, minWidth: 14, textAlign: 'right',
          color: flashing ? 'var(--success)' : won ? 'var(--primary)' : 'var(--text)',
          ...(flashing ? { animation: 'bracketGoalPop 0.4s ease-out both', fontSize: 14 } : {}),
        }}>
          {isFinished || isLive ? score : ''}
        </span>
      </div>
    );
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: goalFlash ? 'rgba(46,125,50,.08)'
          : isFinal ? 'linear-gradient(135deg, var(--surface) 0%, rgba(255,193,7,.08) 100%)'
          : 'var(--surface)',
        borderRadius: 9, padding: '6px 8px', border,
        boxShadow: goalFlash ? '0 0 10px rgba(46,125,50,.25)'
          : isLive ? '0 2px 8px rgba(198,40,40,.15)' : 'var(--shadow-sm)',
        cursor: onClick ? 'pointer' : 'default',
        opacity: dimmed ? 0.4 : 1,
        transition: 'opacity .2s, box-shadow .3s',
        boxSizing: 'border-box',
        ...(revealPop ? { animation: 'bracketResolvePop 0.6s ease-out both' } : {}),
      }}
    >
      {/* Live / penalty mini-indikátor */}
      {isLive && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 2 }}>
          <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--danger)', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {t('knockout.liveShort')}
          </span>
          <MatchCardTimer match={match} variant="list" />
        </div>
      )}
      {renderTeamRow('home')}
      <div style={{ height: 1, background: 'var(--border)', margin: '1px 0' }} />
      {renderTeamRow('away')}
      {/* Penalty suffix (kompaktně) */}
      {hasPenalty && (
        <div style={{ textAlign: 'center', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', marginTop: 1 }}>
          pen {match.homePenaltyScore}:{match.awayPenaltyScore}
        </div>
      )}
    </div>
  );
}
