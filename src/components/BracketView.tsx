/**
 * BracketView — vizuální pavoučkový bracket pro knockout fázi turnaje.
 *
 * Layout: sloupce (per round) s match kartami, spojovací čáry mezi koly.
 * Mobile: horizontální scroll.
 */

import { useEffect, useRef, useState } from 'react';
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

// Pořadí stage v bracket sloupcích (bez third-place — ten je zvlášť)
const STAGE_ORDER: MatchStage[] = ['quarterfinal', 'semifinal', 'final', 'placement'];

const STAGE_LABEL_KEYS: Record<string, string> = {
  quarterfinal: 'knockout.quarterfinal',
  semifinal: 'knockout.semifinal',
  final: 'knockout.final',
  'third-place': 'knockout.thirdPlaceMatch',
  'placement': 'knockout.placement',
};

export function BracketView({ matches, teams, onMatchClick, onLiveClick }: BracketViewProps) {
  const { t } = useI18n();

  // Rozdělit zápasy podle stage
  const byStage = new Map<string, Match[]>();
  for (const m of matches) {
    const stage = m.stage ?? 'unknown';
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage)!.push(m);
  }

  // Seřadit v rámci stage podle bracketPosition nebo matchIndex
  for (const [, arr] of byStage) {
    arr.sort((a, b) => (a.bracketPosition ?? a.matchIndex) - (b.bracketPosition ?? b.matchIndex));
  }

  // Sestavit sloupce bracketu (bez third-place)
  const rounds: { stage: MatchStage; matches: Match[] }[] = [];
  for (const stage of STAGE_ORDER) {
    const stageMatches = byStage.get(stage);
    if (stageMatches && stageMatches.length > 0) {
      rounds.push({ stage, matches: stageMatches });
    }
  }

  const thirdPlace = byStage.get('third-place')?.[0] ?? null;

  if (rounds.length === 0) return null;

  const getTeamName = (m: Match, side: 'home' | 'away') => {
    const teamId = side === 'home' ? m.homeTeamId : m.awayTeamId;
    const placeholder = side === 'home' ? m.homeTeamPlaceholder : m.awayTeamPlaceholder;
    if (teamId) {
      const team = teams.find(tm => tm.id === teamId);
      return team?.name ?? '?';
    }
    return placeholder ?? t('knockout.tbd');
  };

  const isTeamResolved = (m: Match, side: 'home' | 'away') => {
    return !!(side === 'home' ? m.homeTeamId : m.awayTeamId);
  };

  // Seskupit všechny zápasy do sekcí podle stage: SF → F → 3rd
  // Na mobilu vertikální flow (pod sebe), žádný horizontální pavouk.
  // PDF bracket zůstává — ten se renderuje jinde (tournament-pdf.ts).
  // Pořadí: QF → SF → Play-out (O umístění) → O 3. místo → Finále
  const allPlayoffMatches: { stage: MatchStage; label: string; emoji: string; matches: Match[] }[] = [];
  for (const round of rounds) {
    if (round.stage === 'final' || round.stage === 'placement') continue;
    allPlayoffMatches.push({
      stage: round.stage,
      label: t(STAGE_LABEL_KEYS[round.stage] ?? round.stage),
      emoji: round.stage === 'quarterfinal' ? '⚔️' : '⚔️',
      matches: round.matches,
    });
  }

  // Play-out zápasy — každý má vlastní label (O 5. místo, O 7. místo...)
  // Řazení podle matchIndex = stejné pořadí jako v rozpisu zápasů
  const placementMatches = (byStage.get('placement') ?? [])
    .slice()
    .sort((a, b) => a.matchIndex - b.matchIndex);
  if (placementMatches.length > 0) {
    for (const m of placementMatches) {
      const label = m.placementLabel ?? t('knockout.placement');
      allPlayoffMatches.push({
        stage: 'placement',
        label,
        emoji: '🏅',
        matches: [m],
      });
    }
  }

  if (thirdPlace) {
    allPlayoffMatches.push({
      stage: 'third-place',
      label: t('knockout.thirdPlaceMatch'),
      emoji: '🥉',
      matches: [thirdPlace],
    });
  }
  const finalRound = rounds.find(r => r.stage === 'final');
  if (finalRound) {
    allPlayoffMatches.push({
      stage: 'final',
      label: t(STAGE_LABEL_KEYS['final']),
      emoji: '🏆',
      matches: finalRound.matches,
    });
  }

  return (
    <div>
      <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 12, color: 'var(--primary)' }}>
        {t('knockout.playoffStage')}
      </h3>

      {/* Vertikální flow — každá fáze pod sebe */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {allPlayoffMatches.map(section => (
          <div key={section.stage}>
            {/* Stage header */}
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: section.stage === 'final' ? 'var(--warning)' : 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 0.5,
              marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {section.emoji} {section.label}
            </div>

            {/* Zápasy v této fázi */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.matches.map(m => (
                <MatchCard
                  key={m.id}
                  match={m}
                  teams={teams}
                  getTeamName={getTeamName}
                  isTeamResolved={isTeamResolved}
                  isFinal={m.stage === 'final'}
                  onClick={m.status === 'live' && onLiveClick ? onLiveClick : onMatchClick ? () => onMatchClick(m.id) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MatchCard ─────────────────────────────────────────────────────────────────

function MatchCard({ match, teams, getTeamName, isTeamResolved, isFinal, onClick }: {
  match: Match;
  teams: Team[];
  getTeamName: (m: Match, side: 'home' | 'away') => string;
  isTeamResolved: (m: Match, side: 'home' | 'away') => boolean;
  isFinal: boolean;
  onClick?: () => void;
}) {
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

  // Goal flash — detekce změny skóre u live zápasů
  const prevScore = useRef({ home: match.homeScore, away: match.awayScore });
  const [goalFlash, setGoalFlash] = useState<'home' | 'away' | null>(null);

  useEffect(() => {
    if (!isLive) return;
    const prev = prevScore.current;
    if (match.homeScore > prev.home) {
      setGoalFlash('home');
    } else if (match.awayScore > prev.away) {
      setGoalFlash('away');
    }
    prevScore.current = { home: match.homeScore, away: match.awayScore };
  }, [match.homeScore, match.awayScore, isLive]);

  useEffect(() => {
    if (!goalFlash) return;
    const timer = setTimeout(() => setGoalFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [goalFlash]);

  // Finish flash — detekce přechodu live → finished
  const prevStatus = useRef(match.status);
  const [finishFlash, setFinishFlash] = useState(false);

  useEffect(() => {
    if (prevStatus.current === 'live' && match.status === 'finished') {
      setFinishFlash(true);
      const timer = setTimeout(() => setFinishFlash(false), 6000);
      return () => clearTimeout(timer);
    }
    prevStatus.current = match.status;
  }, [match.status]);

  return (
    <div
      onClick={onClick}
      style={{
        background: finishFlash
          ? 'linear-gradient(90deg, var(--surface) 0%, rgba(102,187,106,.15) 50%, var(--surface) 100%)'
          : goalFlash
          ? 'rgba(46,125,50,.08)'
          : isFinal
          ? 'linear-gradient(135deg, var(--surface) 0%, rgba(255,193,7,.08) 100%)'
          : 'var(--surface)',
        borderRadius: 10,
        padding: '8px 10px',
        boxShadow: finishFlash
          ? '0 0 12px rgba(46,125,50,.3)'
          : goalFlash
          ? '0 0 12px rgba(46,125,50,.25)'
          : isLive ? '0 2px 8px rgba(198,40,40,.15)' : 'var(--shadow-sm)',
        border: finishFlash
          ? '2px solid var(--success)'
          : goalFlash
          ? '2px solid var(--success)'
          : isLive ? '2px solid var(--danger)' : isFinal ? '2px solid var(--primary)' : '1px solid var(--border)',
        cursor: isLive || onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all .3s ease',
      }}
    >
      {/* Goal flash overlay */}
      {goalFlash && (
        <style>{`
          @keyframes bracketGoalPop { 0% { transform: scale(0.7); opacity: 0; } 50% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }
        `}</style>
      )}
      {/* Finish flash */}
      {finishFlash && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          marginBottom: 4, padding: '2px 0',
        }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🏁 Ukončeno
          </span>
        </div>
      )}
      {/* Live indicator with timer */}
      {isLive && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginBottom: 4, padding: '2px 0',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--danger)', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Právě se hraje
          </span>
          <MatchCardTimer match={match} variant="list" />
        </div>
      )}
      {/* Home team */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 6px', margin: '0 -6px',
        borderRadius: 6,
        background: homeWon ? 'var(--primary-light)' : 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          {homeTeam && <TeamBadge team={homeTeam} size={12} />}
          <span style={{
            fontSize: 12, fontWeight: homeWon ? 800 : 600,
            color: homeWon ? 'var(--primary)' : homeResolved ? 'var(--text)' : 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {homeName}
          </span>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 800, minWidth: 18, textAlign: 'right',
          color: goalFlash === 'home' ? 'var(--success)' : homeWon ? 'var(--primary)' : 'var(--text)',
          ...(goalFlash === 'home' ? { animation: 'bracketGoalPop 0.4s ease-out both', fontSize: 16 } : {}),
        }}>
          {isFinished || isLive ? match.homeScore : ''}
        </span>
      </div>

      {/* Separator */}
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

      {/* Away team */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 6px', margin: '0 -6px',
        borderRadius: 6,
        background: awayWon ? 'var(--primary-light)' : 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          {awayTeam && <TeamBadge team={awayTeam} size={12} />}
          <span style={{
            fontSize: 12, fontWeight: awayWon ? 800 : 600,
            color: awayWon ? 'var(--primary)' : awayResolved ? 'var(--text)' : 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {awayName}
          </span>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 800, minWidth: 18, textAlign: 'right',
          color: goalFlash === 'away' ? 'var(--success)' : awayWon ? 'var(--primary)' : 'var(--text)',
          ...(goalFlash === 'away' ? { animation: 'bracketGoalPop 0.4s ease-out both', fontSize: 16 } : {}),
        }}>
          {isFinished || isLive ? match.awayScore : ''}
        </span>
      </div>

      {/* Live penalty kicks visualization */}
      {isLive && (match.penaltyKicks?.length ?? 0) > 0 && (
        <div style={{ marginTop: 4, padding: '4px 0', borderTop: '1px dashed var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 3 }}>
            <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--warning)', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Penalty</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {(match.penaltyKicks ?? []).filter(k => k.side === 'home').map((k, i) => (
                <span key={i} style={{ fontSize: 12 }}>{k.scored ? '⚽' : '❌'}</span>
              ))}
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)' }}>
              {match.homePenaltyScore ?? 0}:{match.awayPenaltyScore ?? 0}
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              {(match.penaltyKicks ?? []).filter(k => k.side === 'away').map((k, i) => (
                <span key={i} style={{ fontSize: 12 }}>{k.scored ? '⚽' : '❌'}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Penalty result (finished match) */}
      {isFinished && hasPenalty && (
        <div style={{
          textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
          marginTop: 2, letterSpacing: 0.3,
        }}>
          penalty {match.homePenaltyScore}:{match.awayPenaltyScore}
        </div>
      )}
    </div>
  );
}

// ─── ConnectorLines ────────────────────────────────────────────────────────────
