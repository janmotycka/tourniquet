import { useState } from 'react';
import { useI18n } from '../../../i18n';
import type { TeamDraft, MatchOrderEntry, TournamentSettings } from './types';
import { colorSwatch } from '../../../utils/team-colors';
import { formatMatchTime, parseStartDateTime } from '../../../utils/tournament-schedule';

interface PinAndScheduleStepProps {
  pin: string;
  setPin: (v: string) => void;
  pinConfirm: string;
  setPinConfirm: (v: string) => void;
  pinError: string;
  setPinError: (v: string) => void;
  matchOrder: MatchOrderEntry[];
  setMatchOrder: React.Dispatch<React.SetStateAction<MatchOrderEntry[]>>;
  teams: TeamDraft[];
  totalMatches: number;
  totalHours: number;
  remainMinutes: number;
  matchDuration: number;
  breakDuration: number;
  numberOfPitches: number;
  settings: TournamentSettings;
  onResetMatchOrder: () => void;
}

export function PinAndScheduleStep({
  pin, setPin,
  pinConfirm, setPinConfirm,
  pinError, setPinError,
  matchOrder, setMatchOrder,
  teams,
  totalMatches, totalHours, remainMinutes,
  matchDuration, breakDuration, numberOfPitches,
  settings,
  onResetMatchOrder,
}: PinAndScheduleStepProps) {
  const { t, locale } = useI18n();

  // -- Schedule validation --
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);
  const [scheduleValidated, setScheduleValidated] = useState(false);

  // -- Drag & Drop --
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const moveMatchUp = (idx: number) => {
    if (idx <= 0) return;
    setMatchOrder(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setScheduleValidated(false);
  };

  const moveMatchDown = (idx: number) => {
    setMatchOrder(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setScheduleValidated(false);
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    setMatchOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(null);
    setDragOverIdx(null);
    setScheduleValidated(false);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  const handleResetMatchOrder = () => {
    onResetMatchOrder();
    setScheduleValidated(false);
  };

  const validateSchedule = () => {
    const warnings: string[] = [];
    const slotMinutes = matchDuration + breakDuration;

    // Pomocna fce: cas slotu v minutach od startu turnaje
    const slotTime = (matchIdx: number) =>
      Math.floor(matchIdx / numberOfPitches) * slotMinutes;

    // Pro kazdy tym najdi indexy jeho zapasu
    const teamMatchIndices: Record<number, number[]> = {};
    matchOrder.forEach((m, idx) => {
      [m.homeTeamIndex, m.awayTeamIndex].forEach(ti => {
        if (ti < 0) return; // skip BYE
        if (!teamMatchIndices[ti]) teamMatchIndices[ti] = [];
        teamMatchIndices[ti].push(idx);
      });
    });

    // Prumerna mezera pro porovnani (kolik slotu mezi zapasy by melo byt idealne)
    const totalSlots = Math.ceil(matchOrder.length / numberOfPitches);
    const teamCount = Object.keys(teamMatchIndices).length;

    for (const [ti, indices] of Object.entries(teamMatchIndices)) {
      const teamIdx = Number(ti);
      const teamName = teams[teamIdx]?.name ?? `Tym ${teamIdx + 1}`;
      const avgGapSlots = teamCount > 0 && indices.length > 1
        ? totalSlots / indices.length
        : 0;

      for (let i = 1; i < indices.length; i++) {
        const gapSlots = Math.floor(indices[i] / numberOfPitches) - Math.floor(indices[i - 1] / numberOfPitches);
        const gapMinutes = slotTime(indices[i]) - slotTime(indices[i - 1]);

        // 1) Dva zapasy po sobe (bez odpocinku)
        if (gapSlots <= 1) {
          warnings.push(`⚠️ ${teamName} hraje dva zapasy za sebou (${indices[i - 1] + 1}. a ${indices[i] + 1}. zapas)`);
        }
        // 2) Prilis dlouha pauza -- vic nez 2.5x prumerna mezera NEBO vic nez 60 minut
        else if (avgGapSlots > 0 && gapSlots > avgGapSlots * 2.5 && gapMinutes > 60) {
          const hrs = Math.floor(gapMinutes / 60);
          const mins = gapMinutes % 60;
          const timeStr = hrs > 0 ? `${hrs}h ${mins}min` : `${gapMinutes} min`;
          warnings.push(`⏳ ${teamName} ceka ${timeStr} mezi ${indices[i - 1] + 1}. a ${indices[i] + 1}. zapasem`);
        }
      }
    }
    setScheduleWarnings(warnings);
    setScheduleValidated(true);
  };

  const computeDisplayTime = (index: number): string => {
    const startDt = parseStartDateTime(settings);
    const slotIndex = Math.floor(index / numberOfPitches);
    const offsetMs = slotIndex * (matchDuration + breakDuration) * 60 * 1000;
    const dt = new Date(startDt.getTime() + offsetMs);
    return formatMatchTime(dt.toISOString(), locale);
  };

  return (
    <>
      {/* PIN */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('tournament.create.pinOrg')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('tournament.create.pinDesc')}
        </p>
        <div>
          <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.pinLabel')}</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
            placeholder="••••••"
            style={{
              width: '100%', padding: '12px', borderRadius: 10, fontSize: 20,
              border: `1.5px solid ${pinError ? '#C62828' : 'var(--border)'}`,
              background: 'var(--bg)', color: 'var(--text)', letterSpacing: 8, boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.pinConfirm')}</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinConfirm}
            onChange={e => { setPinConfirm(e.target.value.replace(/\D/g, '')); setPinError(''); }}
            placeholder="••••••"
            style={{
              width: '100%', padding: '12px', borderRadius: 10, fontSize: 20,
              border: `1.5px solid ${pinError ? '#C62828' : 'var(--border)'}`,
              background: 'var(--bg)', color: 'var(--text)', letterSpacing: 8, boxSizing: 'border-box',
            }}
          />
        </div>
        {pinError && <div style={{ color: '#C62828', fontSize: 13 }}>⚠️ {pinError}</div>}
      </div>

      {/* Poradi zapasu -- interaktivni seznam */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('tournament.create.scheduleOrder')}</h3>
          <button onClick={handleResetMatchOrder} style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
            {t('tournament.create.resetOrder')}
          </button>
        </div>
        <div style={{
          background: 'var(--primary-light)', borderRadius: 10, padding: '10px 14px',
          fontSize: 13, color: 'var(--primary)', lineHeight: 1.5,
        }}>
          <b>{t('tournament.create.teamsCount', { count: teams.length })}</b> · <b>{t('tournament.create.matchesCount', { count: totalMatches })}</b> · {t('tournament.create.estimatedTime', { time:
            `${totalHours > 0 ? `${totalHours}h ` : ''}${remainMinutes > 0 ? `${remainMinutes} ${t('common.min')}` : ''}`
          })}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
          {t('tournament.create.reorderHint')}
        </p>

        {/* Tlacitko validace poradi */}
        <button
          onClick={validateSchedule}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            borderRadius: 10, padding: '9px 14px', fontWeight: 600, fontSize: 13,
            color: 'var(--text)', cursor: 'pointer',
          }}
        >
          🔍 {t('tournament.create.validateOrder')}
        </button>

        {/* Varovani z validace */}
        {scheduleValidated && scheduleWarnings.length > 0 && (
          <div style={{
            background: '#FFF3E0', borderRadius: 10, padding: '10px 14px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {scheduleWarnings.map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: '#E65100', lineHeight: 1.4 }}>{w}</div>
            ))}
          </div>
        )}
        {scheduleValidated && scheduleWarnings.length === 0 && (
          <div style={{
            background: '#E8F5E9', borderRadius: 10, padding: '10px 14px',
            fontSize: 12, color: '#2E7D32', lineHeight: 1.4,
          }}>
            {t('tournament.create.scheduleOk')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {matchOrder.map((match, idx) => {
            const homeTeam = teams[match.homeTeamIndex];
            const awayTeam = teams[match.awayTeamIndex];
            const time = computeDisplayTime(idx);
            const pitch = (idx % numberOfPitches) + 1;
            const isFirst = idx === 0;
            const isLast = idx === matchOrder.length - 1;
            const isDragging = dragIdx === idx;
            const isDragOver = dragOverIdx === idx && dragIdx !== idx;

            return (
              <div
                key={`${match.homeTeamIndex}-${match.awayTeamIndex}-${match.roundIndex}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 8px', background: 'var(--surface-var)', borderRadius: 10,
                  opacity: isDragging ? 0.4 : 1,
                  borderTop: isDragOver ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                  transition: 'opacity .15s, border-color .15s',
                  cursor: 'grab',
                }}
              >
                {/* Drag handle */}
                <span style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0, cursor: 'grab', userSelect: 'none', lineHeight: 1 }}>
                  ⠿
                </span>
                {/* Poradove cislo */}
                <span style={{ width: 22, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 700, flexShrink: 0 }}>
                  {idx + 1}.
                </span>
                {/* Cas + hriste */}
                <span style={{ width: 42, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>
                  {time}
                </span>
                {numberOfPitches > 1 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, width: 18 }}>
                    H{pitch}
                  </span>
                )}
                {/* Domaci barva */}
                <div style={colorSwatch(homeTeam?.color ?? '#ccc', 10)} />
                {/* Nazvy tymu */}
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {homeTeam?.name ?? '?'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {awayTeam?.name ?? '?'}
                </span>
                {/* Hoste barva */}
                <div style={colorSwatch(awayTeam?.color ?? '#ccc', 10)} />
                {/* Tlacitka up/down */}
                <button
                  onClick={() => moveMatchUp(idx)}
                  disabled={isFirst}
                  style={{
                    width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isFirst ? 'transparent' : 'var(--surface)',
                    border: isFirst ? 'none' : '1px solid var(--border)',
                    fontSize: 12, color: isFirst ? 'var(--border)' : 'var(--text)',
                    cursor: isFirst ? 'default' : 'pointer',
                  }}
                >▲</button>
                <button
                  onClick={() => moveMatchDown(idx)}
                  disabled={isLast}
                  style={{
                    width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isLast ? 'transparent' : 'var(--surface)',
                    border: isLast ? 'none' : '1px solid var(--border)',
                    fontSize: 12, color: isLast ? 'var(--border)' : 'var(--text)',
                    cursor: isLast ? 'default' : 'pointer',
                  }}
                >▼</button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
