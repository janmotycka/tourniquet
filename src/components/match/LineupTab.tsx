import { useEffect, useState } from 'react';
import type { SeasonMatch, MatchLineupPlayer, AttendanceStatus } from '../../types/match.types';
import { formatToStarterCount } from '../../types/match.types';
import { useMatchesStore } from '../../store/matches.store';
import { useClubsStore } from '../../store/clubs.store';
import { useI18n } from '../../i18n';
import { ClubImportModal } from './ClubImportModal';

// ── Attendance helpers ──

const ATTENDANCE_OPTIONS: Array<{ status: AttendanceStatus; icon: string; labelKey: string }> = [
  { status: 'confirmed', icon: '✅', labelKey: 'match.attendance.confirmed' },
  { status: 'tentative', icon: '❔', labelKey: 'match.attendance.tentative' },
  { status: 'absent', icon: '❌', labelKey: 'match.attendance.absent' },
];

function getEffectiveAttendance(p: MatchLineupPlayer): AttendanceStatus {
  return p.attendance ?? 'tentative';
}

// ── Jersey badge + picker ─────────────────────────────────────────────────
/**
 * Číslo dresu jako barevný badge. Kliknutím se otevře bottom-sheet picker
 * s dostupnými čísly (obsazená čísla zmizí). Na klubu zůstává původní číslo
 * pro příští zápas — měníme jen `match.lineup[i].jerseyNumber`.
 *
 * Typický use-case: trenér na hřišti rozdává dresy (různá čísla každý zápas).
 */
function JerseyBadge({
  playerName, number, onChange, editable, variant = 'starter', existingNumbers,
}: {
  playerName: string;
  number: number;
  onChange: (n: number) => void;
  editable: boolean;
  variant?: 'starter' | 'bench';
  /** Všechna čísla přidělená hráčům v tomto zápase (včetně tohoto hráče). */
  existingNumbers: number[];
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);

  const isDuplicate = existingNumbers.filter(n => n === number).length > 1;

  const style: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 8,
    background: variant === 'starter' ? 'var(--primary)' : 'var(--surface-var)',
    color: variant === 'starter' ? '#fff' : 'var(--text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 800, flexShrink: 0,
    cursor: editable ? 'pointer' : 'default',
    border: 'none',
    position: 'relative',
    ...(isDuplicate ? { outline: '2px solid var(--danger)', outlineOffset: -2 } : {}),
  };

  return (
    <>
      <div
        onClick={() => editable && setPickerOpen(true)}
        title={editable ? t('match.lineup.jerseyPickerHint') : undefined}
        style={style}
      >
        {number || '—'}
      </div>
      {pickerOpen && (
        <JerseyNumberPicker
          playerName={playerName}
          currentNumber={number}
          takenNumbers={existingNumbers}
          onPick={n => { onChange(n); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

// ── Jersey number picker (bottom sheet) ───────────────────────────────────
function JerseyNumberPicker({
  playerName, currentNumber, takenNumbers, onPick, onClose,
}: {
  playerName: string;
  currentNumber: number;
  takenNumbers: number[];
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [expandedRange, setExpandedRange] = useState(false);
  const [manualInput, setManualInput] = useState('');

  // Esc zavře
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Obsazená čísla: vše co je v lineup kromě tohoto hráče.
  // Current hráč má právě `currentNumber` — to ukážeme jako "aktuální".
  const takenSet = new Set(takenNumbers);
  const isTaken = (n: number) => takenSet.has(n) && n !== currentNumber;

  // Většinou stačí 1–20 (obvyklé číslování mládeže). Rozbalí se na 21–99 pokud
  // trenér potřebuje vyšší číslo.
  const maxNumber = expandedRange ? 99 : 20;
  const numbers = Array.from({ length: maxNumber }, (_, i) => i + 1);
  const available = numbers.filter(n => !isTaken(n));

  const handleManualSubmit = () => {
    const n = parseInt(manualInput, 10);
    if (!isNaN(n) && n >= 1 && n <= 99) {
      onPick(n);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 520,
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          maxHeight: '85dvh', overflowY: 'auto',
          animation: 'jerseyPickerUp .22s ease-out',
        }}
      >
        <style>{`@keyframes jerseyPickerUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{ padding: '4px 20px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            👕 {t('match.lineup.jerseyPickerTitle')}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
            {playerName}
            {currentNumber > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginLeft: 8 }}>
                ({t('match.lineup.jerseyCurrent', { n: currentNumber })})
              </span>
            )}
          </div>
        </div>

        {/* Number grid */}
        <div style={{ padding: '16px 20px 10px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 8,
          }}>
            {available.map(n => {
              const isCurrent = n === currentNumber;
              return (
                <button
                  key={n}
                  onClick={() => onPick(n)}
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 10,
                    background: isCurrent ? 'var(--primary)' : 'var(--surface-var)',
                    color: isCurrent ? '#fff' : 'var(--text)',
                    fontSize: 18, fontWeight: 800,
                    border: isCurrent ? 'none' : '1.5px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'background .1s, transform .1s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onTouchStart={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.92)'; }}
                  onTouchEnd={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                >
                  {n}
                </button>
              );
            })}
          </div>

          {!expandedRange && (
            <button
              onClick={() => setExpandedRange(true)}
              style={{
                marginTop: 12, width: '100%', padding: '10px',
                background: 'transparent', color: 'var(--primary)',
                border: '1.5px dashed var(--primary)', borderRadius: 10,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {t('match.lineup.jerseyShowMore')}
            </button>
          )}
        </div>

        {/* Manual input fallback */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            {t('match.lineup.jerseyManual')}
          </span>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={1}
            max={99}
            value={manualInput}
            onChange={e => setManualInput(e.target.value.slice(0, 2))}
            onKeyDown={e => { if (e.key === 'Enter') handleManualSubmit(); }}
            onFocus={e => e.target.select()}
            placeholder="99"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontSize: 14, fontWeight: 700, textAlign: 'center',
              background: 'var(--bg)', color: 'var(--text)',
            }}
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualInput}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: manualInput ? 'var(--primary)' : 'var(--surface-var)',
              color: manualInput ? '#fff' : 'var(--text-muted)',
              fontSize: 13, fontWeight: 700, border: 'none',
              cursor: manualInput ? 'pointer' : 'not-allowed',
            }}
          >
            {t('common.ok')}
          </button>
        </div>

        {/* Cancel */}
        <div style={{ padding: '10px 20px 4px' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '12px', borderRadius: 10,
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
            }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttendanceChips({
  player,
  onChange,
  disabled,
}: {
  player: MatchLineupPlayer;
  onChange: (status: AttendanceStatus) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const current = getEffectiveAttendance(player);
  return (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      {ATTENDANCE_OPTIONS.map(opt => {
        const active = current === opt.status;
        return (
          <button
            key={opt.status}
            onClick={() => !disabled && onChange(opt.status)}
            disabled={disabled}
            title={t(opt.labelKey)}
            aria-label={t(opt.labelKey)}
            aria-pressed={active}
            style={{
              fontSize: 13, padding: '5px 8px', borderRadius: 8,
              background: active ? 'var(--primary)' : 'var(--surface-var)',
              color: active ? '#fff' : 'var(--text-muted)',
              border: 'none', cursor: disabled ? 'default' : 'pointer',
              minWidth: 32, lineHeight: 1,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}

// ── Inline player editor ──

function PlayerEditor({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const updateMatch = useMatchesStore(s => s.updateMatch);
  const setLineupAttendance = useMatchesStore(s => s.setLineupAttendance);
  // Audit 2026-05-25: import z klubu pro existující match (PlayerEditor reuse
  // sdílené ClubImportModal s Quick flow). Aktivuje se jen pro klubový match.
  const activeClub = useClubsStore(s =>
    s.clubs.find(c => c.id === match.clubId) ?? null,
  );
  const [clubImportOpen, setClubImportOpen] = useState(false);
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  // Slot picker — když trenér klepne na prázdné místo, otevře se výběr z lavice
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const showAttendance = match.status === 'planned';

  // Cílový počet hráčů v základu = odvozeno z formátu ('7+1' → 8). Fallback 11.
  const targetStarters = match.matchFormat ? formatToStarterCount(match.matchFormat) : 11;

  const starters = match.lineup.filter(p => p.isStarter).sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const benchers = match.lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);
  const emptySlots = Math.max(0, targetStarters - starters.length);
  const hasClubPlayers = !!(activeClub && (activeClub.players ?? []).length > 0);

  const handleAdd = () => {
    const j = parseInt(jersey);
    if (!name.trim() || isNaN(j) || j < 1 || j > 99) return;
    const newPlayer: MatchLineupPlayer = {
      playerId: `manual-${Date.now()}-${j}`,
      jerseyNumber: j,
      name: name.trim(),
      isStarter: starters.length < targetStarters,
      substituteOrder: starters.length < targetStarters ? 0 : benchers.length + 1,
    };
    updateMatch(match.id, { lineup: [...match.lineup, newPlayer] });
    setName('');
    setJersey('');
  };

  const handleRemove = (playerId: string) => {
    updateMatch(match.id, { lineup: match.lineup.filter(p => p.playerId !== playerId) });
  };

  /** Přepsat číslo dresu jednoho hráče jen pro tento zápas (klubová hodnota
   *  zůstává nezměněna). Trenér to typicky dělá když na hřišti rozdá dresy. */
  const updateJerseyNumber = (playerId: string, newNumber: number) => {
    updateMatch(match.id, {
      lineup: match.lineup.map(p =>
        p.playerId === playerId ? { ...p, jerseyNumber: newNumber } : p,
      ),
    });
  };

  const allJerseyNumbers = match.lineup.map(p => p.jerseyNumber);
  const canEditJersey = match.status !== 'finished';

  const toggleStarter = (playerId: string) => {
    const player = match.lineup.find(p => p.playerId === playerId);
    if (!player) return;
    const currentStarters = match.lineup.filter(p => p.isStarter);
    if (player.isStarter) {
      // Hráč jde na lavici
      const benchCount = match.lineup.filter(p => !p.isStarter).length;
      updateMatch(match.id, {
        lineup: match.lineup.map(p =>
          p.playerId === playerId ? { ...p, isStarter: false, substituteOrder: benchCount + 1 } : p
        ),
      });
    } else if (currentStarters.length < targetStarters) {
      updateMatch(match.id, {
        lineup: match.lineup.map(p =>
          p.playerId === playerId ? { ...p, isStarter: true, substituteOrder: 0 } : p
        ),
      });
    }
  };

  // Klik na empty slot → otevřít picker s lavicí. Klik na hráče → povýšit.
  const handleFillSlot = (playerId: string) => {
    toggleStarter(playerId);
    setSlotPickerOpen(false);
  };

  // Audit 2026-05-25: import handler — přidá vybrané klubové hráče do lineup.
  // Filtruje duplicity podle case-insensitive jména. Auto-assign starter/bench
  // podle targetStarters (nejprve fill starters, pak bench).
  const handleClubImport = (picked: import('../../types/club.types').ClubPlayer[]) => {
    setClubImportOpen(false);
    const existingNames = new Set(match.lineup.map(p => p.name.trim().toLowerCase()));
    const newPlayers: MatchLineupPlayer[] = [];
    let startersCount = starters.length;
    let benchCount = benchers.length;
    const ts = Date.now();
    for (const cp of picked) {
      if (existingNames.has(cp.name.trim().toLowerCase())) continue;
      const isStarter = startersCount < targetStarters;
      newPlayers.push({
        playerId: cp.id || `manual-${ts}-${newPlayers.length}`,
        jerseyNumber: cp.jerseyNumber || 0,
        name: cp.name,
        birthYear: cp.birthYear ?? undefined,
        isStarter,
        substituteOrder: isStarter ? 0 : benchCount + 1,
      });
      if (isStarter) startersCount += 1;
      else benchCount += 1;
    }
    if (newPlayers.length > 0) {
      updateMatch(match.id, { lineup: [...match.lineup, ...newPlayers] });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Audit 2026-05-25: Import z klubu — primárně viditelný button v editor
          headeru pro klubové matches. Otevře ClubImportModal (sdílený s Quick). */}
      {hasClubPlayers && activeClub && match.status !== 'finished' && (
        <button
          type="button"
          onClick={() => setClubImportOpen(true)}
          style={{
            alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 10,
            background: 'var(--primary-light)', color: 'var(--primary)',
            border: '1.5px solid var(--primary)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          📥 {t('match.quickSheet.importFromClub')}
        </button>
      )}
      {clubImportOpen && activeClub && (
        <ClubImportModal
          club={{ id: activeClub.id, name: activeClub.name, players: activeClub.players ?? [] }}
          existingNames={match.lineup.map(p => p.name)}
          onClose={() => setClubImportOpen(false)}
          onConfirm={handleClubImport}
        />
      )}

      {/* Starters */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>👕 {t('match.create.startingLineup')}</h3>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
            background: starters.length === targetStarters ? 'var(--success-light)' : 'var(--warning-light)',
            color: starters.length === targetStarters ? 'var(--success)' : 'var(--warning)',
          }}>
            {starters.length}/{targetStarters}
            {match.matchFormat && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>· {match.matchFormat}</span>}
          </span>
        </div>
        {starters.length === 0 && emptySlots === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            {t('match.lineup.emptyStarters')}
          </p>
        )}
        {starters.map(p => {
          const isAbsent = getEffectiveAttendance(p) === 'absent';
          return (
            <div key={p.playerId} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
              opacity: isAbsent ? 0.5 : 1,
            }}>
              <JerseyBadge
                playerName={p.name}
                number={p.jerseyNumber}
                onChange={n => updateJerseyNumber(p.playerId, n)}
                editable={canEditJersey}
                variant="starter"
                existingNumbers={allJerseyNumbers}
              />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 100, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {p.name}
                {p.guestCategory && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5,
                    background: 'var(--info-light)', color: 'var(--info)',
                    letterSpacing: 0.3,
                  }}>
                    {p.guestCategory}
                  </span>
                )}
              </span>
              {showAttendance && (
                <AttendanceChips
                  player={p}
                  onChange={status => setLineupAttendance(match.id, p.playerId, status)}
                />
              )}
              {match.status !== 'finished' && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => toggleStarter(p.playerId)}
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, background: 'var(--warning-light)', color: 'var(--warning)', border: 'none', cursor: 'pointer' }}>
                    → {t('match.lineup.toBench')}
                  </button>
                  <button onClick={() => handleRemove(p.playerId)}
                    style={{ fontSize: 13, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: 'var(--danger-light)', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Prázdné sloty — viditelný signál že chybí hráč v základu */}
        {match.status !== 'finished' && emptySlots > 0 && (
          <>
            {Array.from({ length: emptySlots }).map((_, idx) => (
              <button
                key={`empty-${idx}`}
                onClick={() => benchers.length > 0 && setSlotPickerOpen(true)}
                disabled={benchers.length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: idx === 0 ? 'none' : '1px dashed var(--border)',
                  borderBottom: '1px solid var(--border)',
                  width: '100%', textAlign: 'left',
                  cursor: benchers.length > 0 ? 'pointer' : 'not-allowed',
                  opacity: benchers.length > 0 ? 1 : 0.5,
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  border: '2px dashed var(--warning)',
                  color: 'var(--warning)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 900, flexShrink: 0,
                }}>?</div>
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--warning)',
                }}>
                  {benchers.length > 0
                    ? `${t('match.lineup.emptySlot')} — ${t('match.lineup.tapToFill')}`
                    : t('match.lineup.emptySlotNoBench')}
                </span>
                {benchers.length > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: 'var(--warning-light)', color: 'var(--warning)',
                  }}>
                    + {t('match.lineup.fillFromBench')}
                  </span>
                )}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Slot picker — výběr hráče z lavice pro doplnění prázdného slotu */}
      {slotPickerOpen && (
        <div
          onClick={() => setSlotPickerOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: '20px 20px 0 0',
              width: '100%', maxWidth: 480,
              paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
              maxHeight: '75dvh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2 }} />
            </div>
            <div style={{ padding: '4px 16px 12px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>⬆️ {t('match.lineup.pickFromBench')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {t('match.lineup.pickFromBenchHint', { count: emptySlots })}
              </div>
            </div>
            <div style={{ padding: '8px 16px' }}>
              {benchers.map(p => (
                <button
                  key={p.playerId}
                  onClick={() => handleFillSlot(p.playerId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '10px 4px',
                    background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, background: 'var(--surface-var)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: 'var(--text)', flexShrink: 0,
                  }}>{p.jerseyNumber}</div>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                    background: 'var(--success-light)', color: 'var(--success)',
                  }}>
                    + {t('match.lineup.putOnField')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bench — sbalitelná, defaultně sbalená (lavička je sekundární info). */}
      <details style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden' }}>
        <summary style={{
          padding: '14px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 15,
          display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)',
          listStyle: 'none', WebkitAppearance: 'none',
        }}>
          <span>🪑</span> {t('match.create.benchTitle')}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            {benchers.length}
          </span>
        </summary>
        <div style={{ padding: '0 16px 14px' }}>
        {benchers.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
            {t('match.lineup.emptyBench')}
          </p>
        )}
        {benchers.map(p => {
          const isAbsent = getEffectiveAttendance(p) === 'absent';
          return (
            <div key={p.playerId} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
              opacity: isAbsent ? 0.5 : 1,
            }}>
              <JerseyBadge
                playerName={p.name}
                number={p.jerseyNumber}
                onChange={n => updateJerseyNumber(p.playerId, n)}
                editable={canEditJersey}
                variant="bench"
                existingNumbers={allJerseyNumbers}
              />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 100, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {p.name}
                {p.guestCategory && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5,
                    background: 'var(--info-light)', color: 'var(--info)',
                    letterSpacing: 0.3,
                  }}>
                    {p.guestCategory}
                  </span>
                )}
              </span>
              {showAttendance && (
                <AttendanceChips
                  player={p}
                  onChange={status => setLineupAttendance(match.id, p.playerId, status)}
                />
              )}
              {match.status !== 'finished' && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => toggleStarter(p.playerId)}
                    disabled={starters.length >= targetStarters}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: starters.length >= targetStarters ? 'not-allowed' : 'pointer',
                      background: starters.length >= targetStarters ? 'var(--surface-var)' : 'var(--success-light)',
                      color: starters.length >= targetStarters ? 'var(--text-muted)' : 'var(--success)',
                    }}>
                    → {t('match.lineup.toStart')}
                  </button>
                  <button onClick={() => handleRemove(p.playerId)}
                    style={{ fontSize: 13, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: 'var(--danger-light)', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </details>

      {/* Add player */}
      {match.status !== 'finished' && (
        <div style={{
          borderRadius: 14, padding: '14px 16px',
          border: '2px dashed var(--border)', background: 'transparent',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textAlign: 'center' }}>
            👤 {t('match.create.addPlayerManual')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('match.create.playerNamePlaceholder')}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)',
                fontSize: 14, background: 'var(--bg)', color: 'var(--text)',
              }}
            />
            <input
              type="number"
              value={jersey}
              onChange={e => setJersey(e.target.value)}
              placeholder="#"
              min={1} max={99}
              style={{
                width: 52, padding: '10px 8px', borderRadius: 10, border: '1.5px solid var(--border)',
                fontSize: 14, background: 'var(--bg)', color: 'var(--text)', textAlign: 'center',
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!name.trim() || !jersey}
              style={{
                padding: '10px 16px', borderRadius: 12, fontWeight: 800, fontSize: 16,
                background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: (!name.trim() || !jersey) ? 0.4 : 1,
              }}
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main LineupTab ──

export function LineupTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const setLineupAttendance = useMatchesStore(s => s.setLineupAttendance);
  // Audit 2026-05-23 J-1: dual CTA z QuickMatchSheet posílá usera s
  // `initialTab='lineup'` — bez startMatch button by uvízl, musel by ručně
  // přepnout na Live tab. Sticky CTA dole = clear next action.
  const startMatch = useMatchesStore(s => s.startMatch);
  const [editMode, setEditMode] = useState(false);
  const showAttendance = match.status === 'planned';
  const isPlanned = match.status === 'planned';

  const starters = match.lineup.filter(p => p.isStarter).sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const bench = match.lineup.filter(p => !p.isStarter).sort((a, b) => a.substituteOrder - b.substituteOrder);
  const hasLineup = match.lineup.length > 0;

  // If no lineup, show editor directly
  if (!hasLineup || editMode) {
    return (
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {hasLineup && (
          <button
            onClick={() => setEditMode(false)}
            style={{
              alignSelf: 'flex-start', fontSize: 13, fontWeight: 600,
              color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            {t('common.back')}
          </button>
        )}
        <PlayerEditor match={match} />
      </div>
    );
  }

  const getPlayerGoals = (playerId: string) =>
    match.goals.filter(g => g.scorerId === playerId && !g.isOwnGoal && !g.isOpponentGoal).length;
  const getPlayerCards = (playerId: string) =>
    match.cards.filter(c => c.playerId === playerId);
  const subbedOnMinute = (playerId: string) => {
    const sub = match.substitutions.find(s => s.playerInId === playerId);
    return sub?.minute ?? null;
  };
  const subbedOffMinute = (playerId: string) => {
    const sub = match.substitutions.find(s => s.playerOutId === playerId);
    return sub?.minute ?? null;
  };

  const PlayerRow = ({ p, isBench = false }: { p: MatchLineupPlayer; isBench?: boolean }) => {
    const goals = getPlayerGoals(p.playerId);
    const cards = getPlayerCards(p.playerId);
    const offMin = subbedOffMinute(p.playerId);
    const onMin = subbedOnMinute(p.playerId);
    const subbedOff = offMin !== null;
    const subbedOn = onMin !== null;
    const isAbsent = getEffectiveAttendance(p) === 'absent';
    const mutedOpacity = showAttendance && isAbsent ? 0.5 : (isBench && !subbedOn ? 0.65 : 1);

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
        opacity: mutedOpacity,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: isBench ? 'var(--surface-var)' : 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: isBench ? 'var(--text)' : '#fff',
        }}>
          {p.jerseyNumber}
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Audit 2026-05-23 J-7: captain pásek po startu, dříve isCaptain
                ukládán do lineup ale nikde nedisplayed. */}
            {p.isCaptain && (
              <span
                title={t('match.lineup.captainTooltip')}
                style={{
                  fontSize: 10, fontWeight: 800, color: '#fff',
                  background: 'var(--primary)', padding: '2px 5px', borderRadius: 4,
                  flexShrink: 0,
                }}
              >C</span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          </div>
          {p.position && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.position}</div>}
        </div>
        {showAttendance ? (
          <AttendanceChips
            player={p}
            onChange={status => setLineupAttendance(match.id, p.playerId, status)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {goals > 0 && <span style={{ fontSize: 13 }}>⚽×{goals}</span>}
            {cards.map((c, i) => (
              <span key={i} style={{ fontSize: 14 }}>
                {c.type === 'yellow' ? '🟨' : c.type === 'red' ? '🟥' : '🟨🟥'}
              </span>
            ))}
            {subbedOff && <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>↓{offMin}'</span>}
            {subbedOn && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>↑{onMin}'</span>}
            {isBench && !subbedOn && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-var)', padding: '2px 6px', borderRadius: 6 }}>
                #{p.substituteOrder}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Audit 2026-05-25: instruction banner pro planned status — vysvětluje co
          trenér může dělat před spuštěním. Sticky "Spustit zápas" CTA dole. */}
      {isPlanned && (
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'var(--primary-light)',
          border: '1px dashed var(--primary)',
          fontSize: 12, color: 'var(--primary)', lineHeight: 1.45,
        }}>
          <strong>📝 {t('match.lineup.plannedBannerTitle')}</strong>
          <br />
          <span style={{ color: 'var(--text-muted)' }}>
            {t('match.lineup.plannedBannerHint')}
          </span>
        </div>
      )}

      {/* Edit button */}
      {match.status !== 'finished' && (
        <button
          onClick={() => setEditMode(true)}
          style={{
            alignSelf: 'flex-end', fontSize: 13, fontWeight: 700,
            padding: '6px 14px', borderRadius: 10,
            background: 'var(--primary-light)', color: 'var(--primary)',
            border: 'none', cursor: 'pointer',
          }}
        >
          ✏️ {t('match.lineup.edit')}
        </button>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👕 {t('match.lineup.starters')} ({starters.length})</h3>
        {starters.map(p => <PlayerRow key={p.playerId} p={p} />)}
      </div>

      {bench.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🪑 {t('match.lineup.bench')} ({bench.length})</h3>
          {bench.map(p => <PlayerRow key={p.playerId} p={p} isBench />)}
        </div>
      )}

      {match.substitutions.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{t('match.detail.subsLog', { count: match.substitutions.length })}</h3>
          {match.substitutions.map(s => {
            const out = match.lineup.find(p => p.playerId === s.playerOutId);
            const inn = match.lineup.find(p => p.playerId === s.playerInId);
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-muted)', minWidth: 28 }}>{s.minute}'</span>
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>↓ {out?.name ?? '?'}</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>↑ {inn?.name ?? '?'}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Audit 2026-05-23 J-1: Sticky "Spustit zápas" CTA pro planned status.
          Bez něj uvízne user co přišel přes "Přidat sestavu" z Quick flow. */}
      {isPlanned && (
        <button
          onClick={() => startMatch(match.id)}
          style={{
            marginTop: 6, padding: '14px', borderRadius: 12,
            background: 'var(--primary)', color: '#fff',
            border: 'none', fontWeight: 800, fontSize: 15,
            cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
            minHeight: 48, width: '100%',
          }}
        >
          ⚡ {t('match.lineup.startMatchCta')}
        </button>
      )}
    </div>
  );
}
