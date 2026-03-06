/**
 * BracketView — vizuální pavoučkový bracket pro knockout fázi turnaje.
 *
 * Layout: sloupce (per round) s match kartami, spojovací čáry mezi koly.
 * Mobile: horizontální scroll.
 */

import type { Match, Team, MatchStage } from '../types/tournament.types';
import { useI18n } from '../i18n';

interface BracketViewProps {
  matches: Match[];        // filtrované na knockout (stage !== 'group')
  teams: Team[];
  onMatchClick?: (matchId: string) => void;
}

// Pořadí stage v bracket sloupcích (bez third-place — ten je zvlášť)
const STAGE_ORDER: MatchStage[] = ['quarterfinal', 'semifinal', 'final'];

const STAGE_LABEL_KEYS: Record<string, string> = {
  quarterfinal: 'knockout.quarterfinal',
  semifinal: 'knockout.semifinal',
  final: 'knockout.final',
  'third-place': 'knockout.thirdPlaceMatch',
};

export function BracketView({ matches, teams, onMatchClick }: BracketViewProps) {
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

  return (
    <div>
      <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, color: 'var(--primary)' }}>
        {t('knockout.playoffStage')}
      </h3>

      {/* Bracket grid s horizontálním scrollem */}
      <div style={{
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        paddingBottom: 8,
      }}>
        <div style={{
          display: 'flex', gap: 0, minWidth: rounds.length * 160,
        }}>
          {rounds.map((round, roundIdx) => (
            <div key={round.stage} style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'space-around',
              flex: 1, minWidth: 150, position: 'relative',
            }}>
              {/* Round label */}
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                textAlign: 'center', marginBottom: 8, textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                {t(STAGE_LABEL_KEYS[round.stage] ?? round.stage)}
              </div>

              {/* Match karty */}
              <div style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'space-around',
                flex: 1, gap: 8, padding: '0 6px',
              }}>
                {round.matches.map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    getTeamName={getTeamName}
                    isTeamResolved={isTeamResolved}
                    isFinal={m.stage === 'final'}
                    onClick={onMatchClick ? () => onMatchClick(m.id) : undefined}
                  />
                ))}
              </div>

              {/* Spojovací čáry do dalšího kola */}
              {roundIdx < rounds.length - 1 && round.matches.length > 1 && (
                <ConnectorLines matchCount={round.matches.length} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Zápas o 3. místo — pod bracket */}
      {thirdPlace && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
            textAlign: 'center', marginBottom: 6, textTransform: 'uppercase',
          }}>
            {t('knockout.thirdPlaceMatch')}
          </div>
          <div style={{ maxWidth: 220, margin: '0 auto' }}>
            <MatchCard
              match={thirdPlace}
              getTeamName={getTeamName}
              isTeamResolved={isTeamResolved}
              isFinal={false}
              onClick={onMatchClick ? () => onMatchClick(thirdPlace.id) : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MatchCard ─────────────────────────────────────────────────────────────────

function MatchCard({ match, getTeamName, isTeamResolved, isFinal, onClick }: {
  match: Match;
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

  const homeWon = isFinished && match.homeScore > match.awayScore;
  const awayWon = isFinished && match.awayScore > match.homeScore;

  return (
    <div
      onClick={onClick}
      style={{
        background: isFinal
          ? 'linear-gradient(135deg, var(--surface) 0%, rgba(255,193,7,.08) 100%)'
          : 'var(--surface)',
        borderRadius: 10,
        padding: '8px 10px',
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
        border: isLive ? '2px solid #43A047' : isFinal ? '2px solid var(--primary)' : '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isLive && (
        <div style={{
          position: 'absolute', top: 4, right: 6,
          fontSize: 8, fontWeight: 800, color: '#fff', background: '#43A047',
          padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase',
        }}>LIVE</div>
      )}

      {/* Home team */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '3px 0',
      }}>
        <span style={{
          fontSize: 12, fontWeight: homeWon ? 800 : 600,
          color: homeResolved ? 'var(--text)' : 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {homeName}
        </span>
        <span style={{
          fontSize: 13, fontWeight: 800, minWidth: 18, textAlign: 'right',
          color: homeWon ? 'var(--primary)' : 'var(--text)',
        }}>
          {isFinished || isLive ? match.homeScore : ''}
        </span>
      </div>

      {/* Separator */}
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

      {/* Away team */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '3px 0',
      }}>
        <span style={{
          fontSize: 12, fontWeight: awayWon ? 800 : 600,
          color: awayResolved ? 'var(--text)' : 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {awayName}
        </span>
        <span style={{
          fontSize: 13, fontWeight: 800, minWidth: 18, textAlign: 'right',
          color: awayWon ? 'var(--primary)' : 'var(--text)',
        }}>
          {isFinished || isLive ? match.awayScore : ''}
        </span>
      </div>
    </div>
  );
}

// ─── ConnectorLines ────────────────────────────────────────────────────────────
// Vizuální spojovací čáry mezi koly (CSS border trick)

function ConnectorLines({ matchCount }: { matchCount: number }) {
  const pairs = Math.floor(matchCount / 2);
  if (pairs === 0) return null;

  return (
    <div style={{
      position: 'absolute', right: -4, top: 0, bottom: 0,
      width: 8, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-around', pointerEvents: 'none',
    }}>
      {Array.from({ length: pairs }).map((_, i) => (
        <div key={i} style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{
            height: '50%', borderRight: '2px solid var(--border)',
            borderTop: '2px solid var(--border)', borderRadius: '0 6px 0 0',
          }} />
          <div style={{
            height: '50%', borderRight: '2px solid var(--border)',
            borderBottom: '2px solid var(--border)', borderRadius: '0 0 6px 0',
          }} />
        </div>
      ))}
    </div>
  );
}
