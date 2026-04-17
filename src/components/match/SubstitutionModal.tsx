/**
 * SubstitutionModal — manuální střídání.
 *
 * Používá STEJNÝ UX jako asistent střídání v LiveTab:
 *   • Dva sloupce (OUT vlevo, IN vpravo)
 *   • Multi-select — tap přidá hráče, pořadové číslo ukazuje párování
 *   • Confirm vyžaduje stejný počet OUT a IN
 *
 * Rozdíl oproti asistentu:
 *   • Manuální — zobrazí VŠECHNY hráče (bez queue limit)
 *   • Má editor minuty (pro opravu času nebo non-live zadání)
 *   • Plná výška obrazovky pro pohodlný výběr
 */

import { useState } from 'react';
import type { SeasonMatch, MatchLineupPlayer } from '../../types/match.types';
import { computeElapsed, computePlayingTime, computeCurrentStretch, type TFn } from './match-utils';

interface SubstitutionModalProps {
  match: SeasonMatch;
  onAdd: (sub: { minute: number; playerOutId: string; playerInId: string }) => void;
  onClose: () => void;
  suggestedIn: MatchLineupPlayer[];
  suggestedOut: MatchLineupPlayer[];
  t: TFn;
}

export function SubstitutionModal({ match, onAdd, onClose, suggestedIn, suggestedOut, t }: SubstitutionModalProps) {
  const elapsed = computeElapsed(match);
  const elapsedMinutes = elapsed / 60;
  const currentMinute = Math.floor(elapsedMinutes) + 1;
  const [minute, setMinute] = useState(match.status === 'live' ? currentMinute : 1);
  const [selectedOutIds, setSelectedOutIds] = useState<string[]>([]);
  const [selectedInIds, setSelectedInIds] = useState<string[]>([]);

  // Kandidáti — všichni, seřazení podle priority (stejně jako asistent)
  const playingTime = computePlayingTime(match, Math.max(0, elapsedMinutes));
  const stretchTime = computeCurrentStretch(match, Math.max(0, elapsedMinutes));
  const onFieldCandidates = [...match.lineup.filter(p => p.isStarter)]
    .sort((a, b) =>
      (stretchTime.get(b.playerId) ?? 0) - (stretchTime.get(a.playerId) ?? 0)
      || (playingTime.get(b.playerId) ?? 0) - (playingTime.get(a.playerId) ?? 0),
    );
  const benchCandidates = [...match.lineup.filter(p => !p.isStarter)]
    .sort((a, b) =>
      (stretchTime.get(b.playerId) ?? 0) - (stretchTime.get(a.playerId) ?? 0)
      || (playingTime.get(a.playerId) ?? 0) - (playingTime.get(b.playerId) ?? 0),
    );

  const suggestedOutIds = new Set(suggestedOut.map(p => p.playerId));
  const suggestedInIds = new Set(suggestedIn.map(p => p.playerId));

  const toggleOut = (id: string) => {
    try { navigator.vibrate?.(15); } catch { /* ignore */ }
    setSelectedOutIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleIn = (id: string) => {
    try { navigator.vibrate?.(15); } catch { /* ignore */ }
    setSelectedInIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const outCount = selectedOutIds.length;
  const inCount = selectedInIds.length;
  const canConfirm = outCount > 0 && outCount === inCount;
  const confirmHint = (() => {
    if (outCount === 0 && inCount === 0) return 'subSelectBoth';
    if (outCount > inCount) return 'subSelectMoreIn';
    if (inCount > outCount) return 'subSelectMoreOut';
    return null;
  })();

  const handleConfirm = () => {
    if (!canConfirm) return;
    try { navigator.vibrate?.([40, 30, 40]); } catch { /* ignore */ }
    for (let i = 0; i < outCount; i++) {
      onAdd({
        minute: Math.max(1, minute),
        playerOutId: selectedOutIds[i],
        playerInId: selectedInIds[i],
      });
    }
    onClose();
  };

  const hasBench = benchCandidates.length > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
        animation: 'fadeIn .2s ease',
      }}
    >
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, maxHeight: '90dvh',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          animation: 'slideUp .25s ease',
        }}
      >
        {/* Handle + header */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2 }} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 16px 12px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{t('match.detail.substitution')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {t('match.detail.subMultiHint')}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'var(--surface-var)', border: 'none', borderRadius: 8,
              width: 32, height: 32, fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)',
            }}
          >✕</button>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>

          {/* Minute editor — jen pokud není live, nebo chce trenér opravit */}
          {match.status !== 'live' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                {t('match.detail.minute')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setMinute(m => Math.max(1, m - 1))}
                  style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700, border: 'none', cursor: 'pointer' }}>−</button>
                <span style={{ fontWeight: 800, fontSize: 22, minWidth: 40, textAlign: 'center', color: 'var(--primary)' }}>{minute}'</span>
                <button onClick={() => setMinute(m => m + 1)}
                  style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontSize: 20, fontWeight: 700, border: 'none', cursor: 'pointer' }}>+</button>
              </div>
            </div>
          )}

          {/* Dva sloupce — DOLŮ | NAHORU */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          }}>
            {/* OUT sloupec */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: 'var(--danger)',
                textAlign: 'center', padding: '4px 0', letterSpacing: 0.5,
              }}>
                ↓ {t('match.detail.subOutCol')} {outCount > 0 && `(${outCount})`}
              </div>
              {onFieldCandidates.map((p) => {
                const orderIdx = selectedOutIds.indexOf(p.playerId);
                const isSelected = orderIdx !== -1;
                const isRecommended = suggestedOutIds.has(p.playerId);
                return (
                  <button
                    key={p.playerId}
                    onClick={() => toggleOut(p.playerId)}
                    style={{
                      position: 'relative',
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: isSelected ? 'var(--danger-light)' : 'var(--bg)',
                      color: isSelected ? 'var(--danger)' : 'var(--text)',
                      borderRadius: 10, padding: '8px',
                      cursor: 'pointer', textAlign: 'left', minWidth: 0,
                      border: isSelected
                        ? '2px solid var(--danger)'
                        : isRecommended
                          ? '2px dashed var(--danger)'
                          : '2px solid var(--border)',
                    }}
                  >
                    <span style={{
                      width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                      background: isSelected ? 'var(--danger)' : 'var(--danger-light)',
                      color: isSelected ? '#fff' : 'var(--danger)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 900,
                    }}>{p.jerseyNumber}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      {(() => {
                        const stretch = Math.round(stretchTime.get(p.playerId) ?? 0);
                        return (
                          <div style={{
                            fontSize: 11, fontWeight: 800,
                            color: stretch >= 15 ? 'var(--danger)'
                              : stretch >= 10 ? 'var(--warning)'
                              : 'var(--text-muted)',
                          }}>
                            {stretch}' {t('match.detail.subOnFieldNow')}
                          </div>
                        );
                      })()}
                    </div>
                    {isSelected && (
                      <span style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'var(--danger)', color: '#fff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 900,
                      }}>{orderIdx + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* IN sloupec */}
            {hasBench ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, color: 'var(--success)',
                  textAlign: 'center', padding: '4px 0', letterSpacing: 0.5,
                }}>
                  ↑ {t('match.detail.subInCol')} {inCount > 0 && `(${inCount})`}
                </div>
                {benchCandidates.map((p) => {
                  const orderIdx = selectedInIds.indexOf(p.playerId);
                  const isSelected = orderIdx !== -1;
                  const isRecommended = suggestedInIds.has(p.playerId);
                  return (
                    <button
                      key={p.playerId}
                      onClick={() => toggleIn(p.playerId)}
                      style={{
                        position: 'relative',
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: isSelected ? 'var(--success-light)' : 'var(--bg)',
                        color: isSelected ? 'var(--success)' : 'var(--text)',
                        borderRadius: 10, padding: '8px',
                        cursor: 'pointer', textAlign: 'left', minWidth: 0,
                        border: isSelected
                          ? '2px solid var(--success)'
                          : isRecommended
                            ? '2px dashed var(--success)'
                            : '2px solid var(--border)',
                      }}
                    >
                      <span style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: isSelected ? 'var(--success)' : 'var(--success-light)',
                        color: isSelected ? '#fff' : 'var(--success)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 900,
                      }}>{p.jerseyNumber}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </div>
                        {(() => {
                          const stretch = Math.round(stretchTime.get(p.playerId) ?? 0);
                          return (
                            <div style={{
                              fontSize: 11, fontWeight: 800,
                              color: stretch >= 15 ? 'var(--success)'
                                : stretch >= 10 ? 'var(--primary)'
                                : 'var(--text-muted)',
                            }}>
                              {stretch}' {t('match.detail.subOnBenchNow')}
                            </div>
                          );
                        })()}
                      </div>
                      {isSelected && (
                        <span style={{
                          position: 'absolute', top: 4, right: 4,
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'var(--success)', color: '#fff',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 900,
                        }}>{orderIdx + 1}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: 12, textAlign: 'center',
                padding: 20,
              }}>
                {t('match.lineup.emptyBench')}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer — confirm button */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '12px 16px 4px',
          background: 'var(--surface)',
        }}>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 15,
              background: canConfirm ? 'var(--primary)' : 'var(--surface-var)',
              color: canConfirm ? '#fff' : 'var(--text-muted)',
              border: 'none',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            {canConfirm
              ? `✓ ${t('match.detail.subExecuteN', { count: outCount })}`
              : confirmHint === 'subSelectBoth'
                ? t('match.detail.subSelectBoth')
                : confirmHint === 'subSelectMoreIn'
                  ? t('match.detail.subSelectMoreInN', { missing: outCount - inCount })
                  : t('match.detail.subSelectMoreOutN', { missing: inCount - outCount })
            }
          </button>
        </div>
      </div>
    </div>
  );
}
