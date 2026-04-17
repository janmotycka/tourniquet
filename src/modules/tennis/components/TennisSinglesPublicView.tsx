/**
 * TennisSinglesPublicView — veřejné zobrazení tenisové dvouhry.
 *
 * Pro rodiče a diváky — read-only, bez editace.
 * Ukazuje:
 *  - Oba hráče s jejich kluby
 *  - Sety jako velké skóre
 *  - ČTenis link (pokud je)
 *  - Disclaimer (oficiální na ČTenis)
 */

import type { PublicSeasonMatch } from '../../../types/match.types';
import { formatSubMatchScore, determineSubMatchWinner, normalizeSubMatch } from '../utils/tennis-team';
import { OfficialLinkButton } from '../../../components/ui';

interface Props {
  match: PublicSeasonMatch;
  clubDisplayName: string;
}

export function TennisSinglesPublicView({ match, clubDisplayName }: Props) {
  const rawSub = (match.subMatches ?? [])[0];
  const sub = rawSub ? normalizeSubMatch(rawSub) : undefined;

  const homeLabel = match.isHome ? clubDisplayName : match.opponent;
  const awayLabel = match.isHome ? match.opponent : clubDisplayName;
  const winner = sub ? determineSubMatchWinner(sub) : null;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      width: '100%',
    }}>
      {/* Header s gradientem */}
      <div style={{
        background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
        color: '#fff', padding: '24px 20px',
      }}>
        <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginBottom: 4 }}>
          🎾 Tenis · Dvouhra
        </div>

        {sub && sub.sets.length > 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            marginTop: 12,
          }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{homeLabel}</div>
              <div style={{
                fontSize: 18, fontWeight: 800, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: winner === 'home' ? '#fff' : 'rgba(255,255,255,.7)',
              }}>
                {match.isHome ? '🏠 ' : ''}
                {sub.homePlayerIds.length > 0 ? '(hráč)' : (match.isHome ? clubDisplayName : sub.awayPlayerName || '—')}
              </div>
            </div>
            <div style={{
              fontSize: 28, fontWeight: 900, letterSpacing: 1,
              minWidth: 120, textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatSubMatchScore(sub)}
            </div>
            <div style={{ flex: 1, overflow: 'hidden', textAlign: 'right' }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{awayLabel}</div>
              <div style={{
                fontSize: 18, fontWeight: 800, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: winner === 'away' ? '#fff' : 'rgba(255,255,255,.7)',
              }}>
                {!match.isHome ? '🏠 ' : ''}
                {match.isHome ? (sub.awayPlayerName || '—') : clubDisplayName}
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, marginTop: 16, flexDirection: 'column', textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {homeLabel} <span style={{ opacity: 0.7 }}>vs</span> {awayLabel}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {match.status === 'planned' ? 'Zápas se teprve bude hrát' : 'Zatím bez skóre'}
            </div>
          </div>
        )}
      </div>

      {/* Meta + disclaimer */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10,
          fontSize: 12, color: 'var(--text-muted)',
        }}>
          <span>📅 {match.date}</span>
          <span>⏰ {match.kickoffTime}</span>
          {match.competition && <span>🏆 {match.competition}</span>}
          {match.venue && <span>📍 {match.venue}</span>}
        </div>

        {match.officialResultsNote && (
          <div style={{
            background: 'var(--warning-light)',
            color: 'var(--warning)',
            padding: '10px 14px',
            fontSize: 12, fontWeight: 600, lineHeight: 1.4,
            borderRadius: 10, border: '1px solid var(--warning)',
          }}>
            ⚠️ {match.officialResultsNote}
          </div>
        )}

        {sub && sub.retired && (
          <div style={{
            background: 'var(--warning-light)',
            color: 'var(--warning)',
            padding: '10px 14px',
            fontSize: 13, fontWeight: 700, lineHeight: 1.4,
            borderRadius: 10, textAlign: 'center',
          }}>
            ⚠️ Zápas skrečován
          </div>
        )}

        {match.officialResultsUrl && (
          <OfficialLinkButton url={match.officialResultsUrl} />
        )}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 'auto',
        padding: '16px 20px',
        fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
        borderTop: '1px solid var(--border)',
      }}>
        Oficiální výsledky ověřujte na <b>ČTenis</b> (cztenis.cz).
      </div>
    </div>
  );
}
