/**
 * TennisTeamTab — editor týmového tenisového zápasu (ČTenis družstva).
 *
 * Zobrazí všechny sub-matches (4× dvouhra + 2× čtyřhra typicky), umožní:
 *  - Přiřadit hráče (dropdown z klubu) za domácí tým
 *  - Zadat jména soupeřů (free text)
 *  - Zadat výsledky setů (6:4 4:6 10:8)
 *  - Automaticky spočítat vítěze sub-matche
 *  - Zobrazit agregované týmové skóre
 *
 * Disclaimer: "Výsledky jsou orientační. Oficiální na ČTenis."
 */

import { useState } from 'react';
import type { SeasonMatch, TennisSubMatch, MatchLineupPlayer } from '../../../types/match.types';
import { useMatchesStore } from '../../../store/matches.store';
import { useClubsStore } from '../../../store/clubs.store';
import { useI18n } from '../../../i18n';
import {
  determineSubMatchWinner,
  aggregateTeamScore,
  formatSubMatchScore,
  normalizeSubMatches,
} from '../utils/tennis-team';

interface Props {
  match: SeasonMatch;
  clubDisplayName: string;
}

export function TennisTeamTab({ match, clubDisplayName }: Props) {
  const { t } = useI18n();
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const activeClub = useClubsStore(s => s.clubs.find(c => c.id === match.clubId));
  const clubPlayers = activeClub?.players?.filter(p => p.active) ?? [];

  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  // Normalizujeme — Firebase stripuje prázdná pole (homePlayerIds: [], sets: [])
  // → po round-tripu je undefined. Všechny konzumenty očekávají array.
  const subMatches = normalizeSubMatches(match.subMatches);
  const teamScore = aggregateTeamScore(subMatches);

  const updateSubMatch = (subId: string, patch: Partial<TennisSubMatch>) => {
    const updated = subMatches.map(sub => {
      if (sub.id !== subId) return sub;
      const merged = { ...sub, ...patch };
      // Automaticky spočítat winner z setů
      merged.winner = determineSubMatchWinner(merged);
      return merged;
    });
    updateMatch(match.id, { subMatches: updated });

    // Agregovat do main score (pro displej ve sticky headeru)
    const agg = aggregateTeamScore(updated);
    // home/away adaptováno podle isHome trenéra
    const homeScore = match.isHome ? agg.home : agg.away;
    const awayScore = match.isHome ? agg.away : agg.home;
    updateMatch(match.id, { subMatches: updated, homeScore, awayScore });
  };

  const addSet = (subId: string) => {
    const sub = subMatches.find(s => s.id === subId);
    if (!sub) return;
    updateSubMatch(subId, { sets: [...sub.sets, { home: 0, away: 0 }] });
  };

  const updateSet = (subId: string, setIdx: number, side: 'home' | 'away', value: number) => {
    const sub = subMatches.find(s => s.id === subId);
    if (!sub) return;
    const clamped = Math.max(0, Math.min(99, value));
    const newSets = sub.sets.map((s, i) => i === setIdx ? { ...s, [side]: clamped } : s);
    updateSubMatch(subId, { sets: newSets });
  };

  const removeSet = (subId: string, setIdx: number) => {
    const sub = subMatches.find(s => s.id === subId);
    if (!sub) return;
    updateSubMatch(subId, { sets: sub.sets.filter((_, i) => i !== setIdx) });
  };

  /** Toggle skreč. retiredBy = strana, která skrečovala; soupeř vyhrává. */
  const toggleRetired = (subId: string, retiredBy: 'home' | 'away' | null) => {
    const sub = subMatches.find(s => s.id === subId);
    if (!sub) return;
    if (retiredBy === null) {
      // Zrušit skreč — vrátit výpočet ze setů
      updateSubMatch(subId, { retired: false });
      return;
    }
    const winner: 'home' | 'away' = retiredBy === 'home' ? 'away' : 'home';
    updateSubMatch(subId, { retired: true, winner });
  };

  const singlesCount = subMatches.filter(s => s.type === 'singles').length;
  const doublesCount = subMatches.filter(s => s.type === 'doubles').length;

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Disclaimer */}
      {match.officialResultsNote && (
        <div style={{
          background: 'var(--warning-light)',
          color: 'var(--warning)',
          padding: '10px 14px',
          borderRadius: 12,
          fontSize: 12, fontWeight: 600, lineHeight: 1.4,
          border: '1px solid var(--warning)',
        }}>
          ⚠️ {match.officialResultsNote}
        </div>
      )}

      {/* Team score summary */}
      <div style={{
        background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
        color: '#fff', borderRadius: 16, padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600, textAlign: 'center' }}>
          {t('tennisTeam.aggregateScore')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, textAlign: 'right', overflow: 'hidden' }}>
            <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.isHome ? clubDisplayName : match.opponent}
            </div>
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 2, minWidth: 80, textAlign: 'center' }}>
            {teamScore.home}:{teamScore.away}
          </div>
          <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
            <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.isHome ? match.opponent : clubDisplayName}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 500, textAlign: 'center', marginTop: 2 }}>
          {t('tennisTeam.formatSummary', { singles: singlesCount, doubles: doublesCount })}
        </div>
      </div>

      {/* Sub-matches table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {subMatches.map(sub => {
          const isEditing = editingSubId === sub.id;
          const homePlayerNames = sub.homePlayerIds
            .map(id => clubPlayers.find(p => p.id === id)?.name ?? '?')
            .join(' / ');
          const awayPlayerNames = sub.type === 'doubles' && sub.awayPlayerName2
            ? `${sub.awayPlayerName} / ${sub.awayPlayerName2}`
            : sub.awayPlayerName;
          const needed = sub.type === 'singles' ? 1 : 2;

          return (
            <div key={sub.id} style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: '12px 14px',
              border: sub.winner
                ? `1.5px solid ${sub.winner === 'home' ? 'var(--success)' : 'var(--danger)'}`
                : '1.5px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                    background: 'var(--surface-var)', color: 'var(--text-muted)',
                  }}>
                    {t(sub.type === 'singles' ? 'tennisTeam.singles' : 'tennisTeam.doubles')} #{sub.order}
                  </span>
                  {sub.winner && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                      background: sub.winner === 'home' ? 'var(--success-light)' : 'var(--danger-light)',
                      color: sub.winner === 'home' ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {t(sub.winner === 'home' ? 'tennisTeam.homeWin' : 'tennisTeam.awayWin')}
                    </span>
                  )}
                  {sub.retired && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                      background: 'var(--warning-light)', color: 'var(--warning)',
                    }}>
                      {t('tennisTeam.retiredBadge')}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setEditingSubId(isEditing ? null : sub.id)}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                    background: isEditing ? 'var(--primary)' : 'var(--surface-var)',
                    color: isEditing ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {isEditing ? t('tennisTeam.done') : t('tennisTeam.edit')}
                </button>
              </div>

              {/* Display / edit */}
              {!isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{
                      flex: 1, fontWeight: 600, fontSize: 13, color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {homePlayerNames || <span style={{ color: 'var(--text-muted)' }}>{t('tennisTeam.noPlayers')}</span>}
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 800,
                      color: 'var(--text)', minWidth: 80, textAlign: 'center',
                    }}>
                      {formatSubMatchScore(sub)}
                    </div>
                    <div style={{
                      flex: 1, fontWeight: 600, fontSize: 13, color: 'var(--text)', textAlign: 'right',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {awayPlayerNames || <span style={{ color: 'var(--text-muted)' }}>{t('tennisTeam.noOpponent')}</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Home player(s) picker */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      {t('tennisTeam.ourPlayers', { n: needed })}
                    </div>
                    <HomePlayerPicker
                      players={clubPlayers}
                      selectedIds={sub.homePlayerIds}
                      needed={needed}
                      onChange={ids => updateSubMatch(sub.id, { homePlayerIds: ids })}
                    />
                  </div>

                  {/* Away player name(s) */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      {t(sub.type === 'singles' ? 'tennisTeam.opponentPlayer' : 'tennisTeam.opponentPlayers')}
                    </div>
                    <input
                      type="text"
                      value={sub.awayPlayerName}
                      onChange={e => updateSubMatch(sub.id, { awayPlayerName: e.target.value })}
                      placeholder={t('tennisTeam.opponentNamePlaceholder')}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 8,
                        border: '1.5px solid var(--border)', fontSize: 13,
                        background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                      }}
                    />
                    {sub.type === 'doubles' && (
                      <input
                        type="text"
                        value={sub.awayPlayerName2 ?? ''}
                        onChange={e => updateSubMatch(sub.id, { awayPlayerName2: e.target.value })}
                        placeholder={t('tennisTeam.opponentSecondPlaceholder')}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 8, marginTop: 6,
                          border: '1.5px solid var(--border)', fontSize: 13,
                          background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>

                  {/* Sets */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      {t('tennisTeam.sets')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sub.sets.map((set, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 40 }}>
                            {t('tennisTeam.set')} {idx + 1}
                          </span>
                          <input
                            type="number"
                            min={0} max={99}
                            value={set.home}
                            onChange={e => updateSet(sub.id, idx, 'home', Number(e.target.value))}
                            style={{
                              width: 48, padding: '6px', borderRadius: 6,
                              border: '1.5px solid var(--border)', fontSize: 14, fontWeight: 700,
                              textAlign: 'center', background: 'var(--bg)', color: 'var(--text)',
                            }}
                          />
                          <span style={{ fontSize: 14, fontWeight: 700 }}>:</span>
                          <input
                            type="number"
                            min={0} max={99}
                            value={set.away}
                            onChange={e => updateSet(sub.id, idx, 'away', Number(e.target.value))}
                            style={{
                              width: 48, padding: '6px', borderRadius: 6,
                              border: '1.5px solid var(--border)', fontSize: 14, fontWeight: 700,
                              textAlign: 'center', background: 'var(--bg)', color: 'var(--text)',
                            }}
                          />
                          <button
                            onClick={() => removeSet(sub.id, idx)}
                            style={{
                              padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: 'var(--danger-light)', color: 'var(--danger)',
                              border: 'none', cursor: 'pointer',
                            }}
                          >×</button>
                        </div>
                      ))}
                      <button
                        onClick={() => addSet(sub.id)}
                        style={{
                          padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          background: 'var(--surface-var)', color: 'var(--primary)',
                          border: '1px dashed var(--primary)', cursor: 'pointer',
                        }}
                      >
                        + {t('tennisTeam.addSet')}
                      </button>
                    </div>
                  </div>

                  {/* Skreč (retirement) */}
                  <div style={{
                    padding: '10px 12px', borderRadius: 10,
                    background: sub.retired ? 'var(--warning-light)' : 'var(--surface-var)',
                    border: `1px solid ${sub.retired ? 'var(--warning)' : 'var(--border)'}`,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      marginBottom: sub.retired ? 8 : 0,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: sub.retired ? 'var(--warning)' : 'var(--text)' }}>
                        ⚠️ {t('tennisTeam.retired')}
                      </div>
                      <button
                        onClick={() => toggleRetired(sub.id, sub.retired ? null : 'away')}
                        aria-pressed={!!sub.retired}
                        style={{
                          position: 'relative',
                          width: 42, height: 24, borderRadius: 12,
                          background: sub.retired ? 'var(--warning)' : 'var(--border)',
                          border: 'none', cursor: 'pointer', flexShrink: 0,
                          transition: 'background .18s ease',
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 2, left: sub.retired ? 20 : 2,
                          width: 20, height: 20, borderRadius: '50%',
                          background: '#fff', transition: 'left .18s ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                        }} />
                      </button>
                    </div>
                    {sub.retired && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>
                          {t('tennisTeam.retiredWho')}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => toggleRetired(sub.id, 'home')}
                            style={{
                              flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                              background: sub.winner === 'away' ? 'var(--danger-light)' : 'var(--bg)',
                              color: sub.winner === 'away' ? 'var(--danger)' : 'var(--text-muted)',
                              border: `1.5px solid ${sub.winner === 'away' ? 'var(--danger)' : 'var(--border)'}`,
                              cursor: 'pointer',
                            }}
                          >
                            {t('tennisTeam.retiredHome')}
                          </button>
                          <button
                            onClick={() => toggleRetired(sub.id, 'away')}
                            style={{
                              flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                              background: sub.winner === 'home' ? 'var(--success-light)' : 'var(--bg)',
                              color: sub.winner === 'home' ? 'var(--success)' : 'var(--text-muted)',
                              border: `1.5px solid ${sub.winner === 'home' ? 'var(--success)' : 'var(--border)'}`,
                              cursor: 'pointer',
                            }}
                          >
                            {t('tennisTeam.retiredAway')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Home player picker ─────────────────────────────────────────────────────

function HomePlayerPicker({ players, selectedIds, needed, onChange }: {
  players: Array<{ id: string; name: string; jerseyNumber: number }>;
  selectedIds: string[];
  needed: number;
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      // Pokud už je plno, nahradit posledně vybraný hráč
      if (selectedIds.length >= needed) {
        onChange([...selectedIds.slice(0, needed - 1), id]);
      } else {
        onChange([...selectedIds, id]);
      }
    }
  };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {players.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Žádní hráči v klubu — přidej v sekci Klub.
        </div>
      ) : (
        players.map(p => {
          const isSelected = selectedIds.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: isSelected ? 'var(--primary)' : 'var(--surface-var)',
                color: isSelected ? '#fff' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              #{p.jerseyNumber} {p.name}
            </button>
          );
        })
      )}
    </div>
  );
}

// ─── Unused import silencer ────────────────────────────────────────────────
// (MatchLineupPlayer used implicitly via SeasonMatch.lineup — reserved for future use)
export type _Unused = MatchLineupPlayer;
