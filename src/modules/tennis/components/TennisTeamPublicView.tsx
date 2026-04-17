/**
 * TennisTeamPublicView — veřejné zobrazení tenisového týmového zápasu.
 *
 * Pro rodiče a diváky — read-only, bez editace.
 * Ukazuje:
 *   - Agregované týmové skóre nahoře
 *   - Tabulku všech dvouher + čtyřher s výsledky
 *   - Disclaimer: výsledky orientační, oficiální na ČTenis
 */

import type { PublicSeasonMatch } from '../../../types/match.types';
import {
  aggregateTeamScore,
  formatSubMatchScore,
  normalizeSubMatches,
} from '../utils/tennis-team';
import { OfficialLinkButton } from '../../../components/ui';

interface Props {
  match: PublicSeasonMatch;
  clubDisplayName: string;
}

export function TennisTeamPublicView({ match, clubDisplayName }: Props) {
  const subMatches = normalizeSubMatches(match.subMatches);
  const aggregate = aggregateTeamScore(subMatches);
  const homeLabel = match.isHome ? clubDisplayName : match.opponent;
  const awayLabel = match.isHome ? match.opponent : clubDisplayName;

  const singlesCount = subMatches.filter(s => s.type === 'singles').length;
  const doublesCount = subMatches.filter(s => s.type === 'doubles').length;

  // Rozdělit na dvouhry a čtyřhry pro lepší čitelnost
  const singles = subMatches.filter(s => s.type === 'singles').sort((a, b) => a.order - b.order);
  const doubles = subMatches.filter(s => s.type === 'doubles').sort((a, b) => a.order - b.order);

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      width: '100%',
    }}>
      {/* Header with aggregate score */}
      <div style={{
        background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
        color: '#fff', padding: '24px 20px',
      }}>
        <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginBottom: 4 }}>
          🎾 Tenis · Soutěž družstev
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          marginTop: 12,
        }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{
              fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {homeLabel}
            </div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: 2, minWidth: 96, textAlign: 'center' }}>
            {aggregate.home}:{aggregate.away}
          </div>
          <div style={{ flex: 1, overflow: 'hidden', textAlign: 'right' }}>
            <div style={{
              fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {awayLabel}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.75, marginTop: 6 }}>
          {singlesCount}× dvouhra + {doublesCount}× čtyřhra
        </div>
      </div>

      {/* Disclaimer */}
      {match.officialResultsNote && (
        <div style={{
          background: 'var(--warning-light)',
          color: 'var(--warning)',
          padding: '10px 20px',
          fontSize: 12, fontWeight: 600, lineHeight: 1.4,
          borderBottom: '1px solid var(--warning)',
        }}>
          ⚠️ {match.officialResultsNote}
        </div>
      )}

      {/* Sub-matches */}
      <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Singles */}
        {singles.length > 0 && (
          <SectionWithTable title="Dvouhra" subMatches={singles} />
        )}
        {/* Doubles */}
        {doubles.length > 0 && (
          <SectionWithTable title="Čtyřhra" subMatches={doubles} />
        )}

        {subMatches.length === 0 && (
          <div style={{
            textAlign: 'center', padding: 40,
            color: 'var(--text-muted)', fontSize: 14,
          }}>
            Zápasy ještě nejsou zadány.
          </div>
        )}
      </div>

      {/* Official link (pokud vyplněn) */}
      {match.officialResultsUrl && (
        <div style={{ padding: '12px 20px 0' }}>
          <OfficialLinkButton url={match.officialResultsUrl} />
        </div>
      )}

      {/* Footer disclaimer again */}
      <div style={{
        padding: '16px 20px',
        fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
        borderTop: '1px solid var(--border)',
      }}>
        Oficiální výsledky ověřujte na <b>ČTenis</b> (cztenis.cz).
      </div>
    </div>
  );
}

// ─── Helper: section with sub-matches table ─────────────────────────────────

function SectionWithTable({
  title, subMatches,
}: {
  title: string;
  subMatches: PublicSeasonMatch['subMatches'];
}) {
  if (!subMatches || subMatches.length === 0) return null;
  return (
    <div>
      <h2 style={{
        fontSize: 13, fontWeight: 800, letterSpacing: 0.5,
        color: 'var(--text-muted)', margin: '0 0 8px',
      }}>
        {title.toUpperCase()}
      </h2>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
      }}>
        {subMatches.map((sub, idx) => {
          const isLast = idx === subMatches.length - 1;
          const homeWin = sub.winner === 'home';
          const awayWin = sub.winner === 'away';
          const scoreText = formatSubMatchScore(sub);
          return (
            <div key={sub.id} style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              gap: 10,
              alignItems: 'center',
              padding: '12px 14px',
              borderBottom: isLast ? 'none' : '1px solid var(--border)',
              background: homeWin ? 'rgba(46,125,50,.04)' : awayWin ? 'rgba(198,40,40,.04)' : 'transparent',
            }}>
              {/* Home side */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
              }}>
                <div style={{
                  fontWeight: homeWin ? 800 : 600, fontSize: 13,
                  color: homeWin ? 'var(--success)' : 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {sub.homePlayerIds.length > 0
                    ? sub.homePlayerIds.map((_id, i) => (
                        <span key={i}>{i > 0 ? ' / ' : ''}Hráč {i + 1}</span>
                      ))
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>
                  }
                </div>
              </div>

              {/* Score center */}
              <div style={{
                fontWeight: 800, fontSize: 13, letterSpacing: 0.3,
                color: 'var(--text)', minWidth: 92, textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {scoreText}
              </div>

              {/* Away side */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, textAlign: 'right',
              }}>
                <div style={{
                  fontWeight: awayWin ? 800 : 600, fontSize: 13,
                  color: awayWin ? 'var(--danger)' : 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {sub.awayPlayerName2
                    ? `${sub.awayPlayerName} / ${sub.awayPlayerName2}`
                    : sub.awayPlayerName || <span style={{ color: 'var(--text-muted)' }}>—</span>
                  }
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
