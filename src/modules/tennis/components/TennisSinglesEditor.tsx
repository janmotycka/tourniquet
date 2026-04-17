/**
 * TennisSinglesEditor — inline editor pro tenisovou dvouhru (jediný set stack).
 *
 * Zobrazuje:
 *  - Jméno našeho hráče (výběr z klubu) + jméno soupeře (text input)
 *  - Řadu setů: 6:4, 6:2 (+ / − tlačítka)
 *  - Toggle „Skreč" s výběrem kdo skrečoval
 *  - Automaticky spočítá vítěze (použije `determineSubMatchWinner`)
 */

import type { SeasonMatch, TennisSubMatch } from '../../../types/match.types';
import { useMatchesStore } from '../../../store/matches.store';
import { useClubsStore } from '../../../store/clubs.store';
import { useMyPlayersStore } from '../store/myPlayers.store';
import { useI18n } from '../../../i18n';
import { determineSubMatchWinner, formatSubMatchScore, normalizeSubMatch } from '../utils/tennis-team';

interface Props {
  match: SeasonMatch;
  clubDisplayName: string;
}

export function TennisSinglesEditor({ match, clubDisplayName }: Props) {
  const { t } = useI18n();
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const activeClub = useClubsStore(s => s.clubs.find(c => c.id === match.clubId));
  const clubPlayers = activeClub?.players?.filter(p => p.active) ?? [];
  // Individuální mód — zápas je vázaný na konkrétního myPlayera; ten se použije
  // místo výběru z klubového rosteru.
  const myPlayer = useMyPlayersStore(s =>
    match.myPlayerId ? s.players.find(p => p.id === match.myPlayerId) : undefined,
  );
  const isIndividual = !!match.myPlayerId;

  // Normalizuj — Firebase stripuje prázdné homePlayerIds a sets (po round-tripu undefined).
  const rawSub = (match.subMatches ?? [])[0];
  const sub = rawSub ? normalizeSubMatch(rawSub) : undefined;
  if (!sub) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
        {t('tennis.detail.noSubMatch')}
      </div>
    );
  }

  const patchSub = (patch: Partial<TennisSubMatch>) => {
    const merged: TennisSubMatch = { ...sub, ...patch };
    merged.winner = determineSubMatchWinner(merged);
    const subMatches = [merged];
    // Promítni agregát do homeScore/awayScore (pro match-list přehled).
    const homeScore = merged.winner === 'home' ? 1 : 0;
    const awayScore = merged.winner === 'away' ? 1 : 0;
    // Z perspektivy trenéra: isHome určuje "naši/soupeř"; v sub-matchi
    // home = domácí tým (ČTenis), takže pokud isHome=false (my venku), prohodíme.
    const swappedHome = match.isHome ? homeScore : awayScore;
    const swappedAway = match.isHome ? awayScore : homeScore;
    updateMatch(match.id, { subMatches, homeScore: swappedHome, awayScore: swappedAway });
  };

  const addSet = () => patchSub({ sets: [...sub.sets, { home: 0, away: 0 }] });
  const removeSet = (idx: number) => patchSub({ sets: sub.sets.filter((_, i) => i !== idx) });
  const updateSetScore = (idx: number, side: 'home' | 'away', value: number) => {
    const clamped = Math.max(0, Math.min(99, value));
    const sets = sub.sets.map((s, i) => i === idx ? { ...s, [side]: clamped } : s);
    patchSub({ sets });
  };

  const homeLabel = match.isHome ? clubDisplayName : match.opponent;
  const awayLabel = match.isHome ? match.opponent : clubDisplayName;
  const winnerText = sub.winner === 'home'
    ? (match.isHome ? t('tennis.detail.weWon') : t('tennis.detail.opponentWon'))
    : sub.winner === 'away'
    ? (match.isHome ? t('tennis.detail.opponentWon') : t('tennis.detail.weWon'))
    : null;

  const ourPlayerId = sub.homePlayerIds[0];
  const ourPlayer = clubPlayers.find(p => p.id === ourPlayerId);

  const togglePlayer = (playerId: string) => {
    if (ourPlayerId === playerId) {
      patchSub({ homePlayerIds: [] });
    } else {
      patchSub({ homePlayerIds: [playerId] });
    }
  };

  const toggleRetired = (retiredBy: 'home' | 'away' | null) => {
    if (retiredBy === null) {
      patchSub({ retired: false });
      return;
    }
    const winner: 'home' | 'away' = retiredBy === 'home' ? 'away' : 'home';
    patchSub({ retired: true, winner });
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header: players + score */}
      <div style={{
        background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
        color: '#fff', borderRadius: 16, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, textAlign: 'center' }}>
          🎾 {t('tennis.detail.singlesHeader')}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>{homeLabel}</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
              {isIndividual
                ? (match.isHome ? (myPlayer?.name ?? '—') : (sub.awayPlayerName || '—'))
                : (ourPlayer?.name ?? (match.isHome ? t('tennis.detail.pickYourPlayer') : sub.awayPlayerName || '—'))}
            </div>
          </div>
          <div style={{
            fontSize: 26, fontWeight: 900, minWidth: 90, textAlign: 'center',
            letterSpacing: 1, fontVariantNumeric: 'tabular-nums',
          }}>
            {formatSubMatchScore(sub)}
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>{awayLabel}</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
              {isIndividual
                ? (match.isHome ? (sub.awayPlayerName || '—') : (myPlayer?.name ?? '—'))
                : (match.isHome ? (sub.awayPlayerName || t('tennis.detail.enterOpponent')) : (ourPlayer?.name ?? t('tennis.detail.pickYourPlayer')))}
            </div>
          </div>
        </div>
        {winnerText && (
          <div style={{
            textAlign: 'center', fontSize: 12, fontWeight: 700,
            background: 'rgba(255,255,255,.2)', borderRadius: 8, padding: '4px 10px',
            alignSelf: 'center',
          }}>
            {winnerText}
          </div>
        )}
      </div>

      {/* Our player picker — v individuálním módu ne (hráč je pevně daný myPlayerId) */}
      <Card>
        {!isIndividual && (
          <>
            <Label>{t('tennis.detail.ourPlayer')}</Label>
            {clubPlayers.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {t('tennis.detail.noPlayersInClub')}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {clubPlayers.map(p => {
                  const active = ourPlayerId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlayer(p.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: active ? 'var(--primary)' : 'var(--surface-var)',
                        color: active ? '#fff' : 'var(--text-muted)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        <Label style={isIndividual ? undefined : { marginTop: 14 }}>{t('tennis.detail.opponentPlayer')}</Label>
        <input
          type="text"
          value={sub.awayPlayerName}
          onChange={e => patchSub({ awayPlayerName: e.target.value })}
          placeholder={t('tennis.detail.opponentNamePlaceholder')}
          style={inputStyle}
        />
      </Card>

      {/* Sets */}
      <Card>
        <Label>{t('tennis.detail.sets')}</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sub.sets.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 42 }}>
                {t('tennis.detail.setN', { n: idx + 1 })}
              </span>
              <input
                type="number" min={0} max={99}
                value={s.home}
                onChange={e => updateSetScore(idx, 'home', Number(e.target.value))}
                style={scoreInputStyle}
              />
              <span style={{ fontWeight: 800 }}>:</span>
              <input
                type="number" min={0} max={99}
                value={s.away}
                onChange={e => updateSetScore(idx, 'away', Number(e.target.value))}
                style={scoreInputStyle}
              />
              <button
                onClick={() => removeSet(idx)}
                aria-label={t('common.delete')}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: 'var(--danger-light)', color: 'var(--danger)',
                  border: 'none', cursor: 'pointer', marginLeft: 'auto',
                }}
              >×</button>
            </div>
          ))}
          <button
            onClick={addSet}
            style={{
              padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: 'var(--surface-var)', color: 'var(--primary)',
              border: '1.5px dashed var(--primary)', cursor: 'pointer',
            }}
          >
            + {t('tennis.detail.addSet')}
          </button>
        </div>
      </Card>

      {/* Retired toggle */}
      <Card style={{
        background: sub.retired ? 'var(--warning-light)' : 'var(--surface)',
        border: `1px solid ${sub.retired ? 'var(--warning)' : 'var(--border)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Label style={{ marginBottom: 2, color: sub.retired ? 'var(--warning)' : 'var(--text)' }}>
              ⚠️ {t('tennis.detail.retired')}
            </Label>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {t('tennis.detail.retiredHint')}
            </div>
          </div>
          <button
            onClick={() => toggleRetired(sub.retired ? null : 'away')}
            aria-pressed={!!sub.retired}
            style={{
              position: 'relative', width: 46, height: 26, borderRadius: 13,
              background: sub.retired ? 'var(--warning)' : 'var(--border)',
              border: 'none', cursor: 'pointer', flexShrink: 0,
              transition: 'background .18s ease',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: sub.retired ? 22 : 3,
              width: 20, height: 20, borderRadius: '50%',
              background: '#fff', transition: 'left .18s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,.2)',
            }} />
          </button>
        </div>
        {sub.retired && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', marginBottom: 6 }}>
              {t('tennis.detail.retiredWho')}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => toggleRetired('home')}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: sub.winner === 'away' ? 'var(--danger-light)' : 'var(--bg)',
                  color: sub.winner === 'away' ? 'var(--danger)' : 'var(--text-muted)',
                  border: `1.5px solid ${sub.winner === 'away' ? 'var(--danger)' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
              >
                {match.isHome ? t('tennis.detail.weRetired') : t('tennis.detail.opponentRetired')}
              </button>
              <button
                onClick={() => toggleRetired('away')}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: sub.winner === 'home' ? 'var(--success-light)' : 'var(--bg)',
                  color: sub.winner === 'home' ? 'var(--success)' : 'var(--text-muted)',
                  border: `1.5px solid ${sub.winner === 'home' ? 'var(--success)' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
              >
                {match.isHome ? t('tennis.detail.opponentRetired') : t('tennis.detail.weRetired')}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
      boxShadow: 'var(--shadow-sm)', ...style,
    }}>
      {children}
    </div>
  );
}
function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: 'var(--text)',
      textTransform: 'uppercase', letterSpacing: 0.4,
      marginBottom: 6, ...style,
    }}>
      {children}
    </div>
  );
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontSize: 14,
  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
};
const scoreInputStyle: React.CSSProperties = {
  width: 54, padding: '8px', borderRadius: 8,
  border: '1.5px solid var(--border)', fontSize: 16, fontWeight: 700,
  textAlign: 'center', background: 'var(--bg)', color: 'var(--text)',
};
