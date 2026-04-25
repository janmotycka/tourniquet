/**
 * QuickMatchSheet — inline bottom sheet pro vytvoření rychlého zápasu.
 *
 * V Simple módu je tohle hlavní input point pro zápasy. Obsahuje:
 * - Input soupeře
 * - Výběr party (squad) nebo manuální zadání jmen
 * - Checkbox „Uložit jako partu" (pokud roster není ze squadu)
 *
 * Návrh pro scénář McDonald's Cup:
 * - 1. zápas: učitel zapíše 12 jmen, zaškrtne „Uložit jako partu",
 *   dá jméno „3.A" → uloží
 * - 2.–8. zápas: vybere partu „3.A" → roster rovnou nahraný → start
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { useSimpleSquadsStore } from '../../store/simpleSquads.store';
import { useMatchesStore } from '../../store/matches.store';
import type { SimpleSquad } from '../../types/simpleSquad.types';

/**
 * Audit 2026-04-24 (Honza): „McDonald's Cup má 10 min, ale app nabízí Poločas
 * po 30 min." Přidán preset picker — user si vybere délku (10/15/20/30 min)
 * a formu (1 nebo 2 periody). Default je 15 min bez poločasu.
 * Preset se předá do onCreate přes 4. argument (matchPreset).
 */
export interface QuickMatchPreset {
  /** Celková doba v minutách (součet period). */
  durationMinutes: number;
  /** Počet period (1 = bez poločasu, 2 = s poločasem). */
  periods: number;
  /** Fotbalový formát (5+1 malé hřiště, 7+1, 11+1). */
  matchFormat: '3+1' | '4+1' | '5+1' | '7+1' | '8+1' | '11+1';
  /** Lidský popisek pro diagnostiku. */
  label: string;
}

/** Přednastavené presety — laikovi seřazené od nejkratšího (McDonald's Cup)
 *  po plný zápas. První je default.
 *  Audit 2026-04-24 (Honza): microcopy „2×10" byla nečitelná — doplněno
 *  popiskem „2×10 min (poločas)" a „2×30 min (fotbal)" pod chip. */
export interface QuickPresetUI {
  preset: QuickMatchPreset;
  /** Sekundární popisek pod hlavní label chip (ušetří Honzovi hádání). */
  subtitle: string;
}
const QUICK_PRESETS: QuickMatchPreset[] = [
  { durationMinutes: 10, periods: 1, matchFormat: '5+1', label: '10 min' }, // McDonald's Cup
  { durationMinutes: 15, periods: 1, matchFormat: '5+1', label: '15 min' }, // casual
  { durationMinutes: 20, periods: 2, matchFormat: '5+1', label: '2×10' }, // přátelák s poločasem
  { durationMinutes: 60, periods: 2, matchFormat: '7+1', label: '2×30' }, // plný fotbal
];
/** i18n-independent subtitles — překládáme až v render (t() call) */
const QUICK_PRESET_SUBTITLES = ['short', 'casual', 'halftime', 'full'] as const;

interface Props {
  onClose: () => void;
  onCreate: (opponent: string, roster: string[], squadId?: string, preset?: QuickMatchPreset) => void;
}

export function QuickMatchSheet({ onClose, onCreate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const allSquads = useSimpleSquadsStore(s => s.squads);
  const createSquad = useSimpleSquadsStore(s => s.createSquad);
  const markUsed = useSimpleSquadsStore(s => s.markUsed);
  // Audit 2026-04-25 (user feedback): „může si torq pamatovat soupeře které
  // jsem zadával? aby mi to nabízelo jak budu psát?" → ano, vytáhneme
  // unikátní opponenty z user vlastních zápasů (stejný sport), seřadíme
  // podle frekvence + recency. Žádný external katalog — jen historie usera.
  const allMatches = useMatchesStore(s => s.matches);

  const [opponent, setOpponent] = useState('');
  const [opponentFocused, setOpponentFocused] = useState(false);
  const [rosterText, setRosterText] = useState('');
  // Audit 2026-04-24 (Honza): pro McDonald's Cup scénář — když user uloží
  // partu „3.A" v prvním zápase, při druhém má být auto-pre-picknutá
  // (nechceme friction hledat ji v seznamu). `squads` je seřazené podle
  // usageCount desc, takže squads[0] = nejčastější.
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [saveAsSquad, setSaveAsSquad] = useState(false);
  const [squadName, setSquadName] = useState('');
  // Audit 2026-04-24 user: „v rychlém zápase bych měl mít možnost si vybrat
  // jak dlouho bude poločas a jestli bude jen jeden". Místo pevných 4 presetů
  // teď 2 ovládací prvky:
  //   - periodCount: 1 nebo 2 (s poločasem / bez)
  //   - periodMinutes: 5–60 (numeric input, default 15)
  // Quick-pick chips zůstávají nahoře jako shortcuty — tapnutí zaseje obě
  // hodnoty. User pak může cokoli upravit inputem.
  const [periodCount, setPeriodCount] = useState<1 | 2>(1);
  const [periodMinutes, setPeriodMinutes] = useState(15);
  const inputRef = useRef<HTMLInputElement>(null);

  // Zjistí, jestli current values matchuje některý preset chip — pro zvýraznění.
  const activePresetIndex = useMemo(() => {
    return QUICK_PRESETS.findIndex(p =>
      p.periods === periodCount && Math.round(p.durationMinutes / p.periods) === periodMinutes
    );
  }, [periodCount, periodMinutes]);

  /** Historie soupeřů — unikátní `opponent` z user vlastních zápasů.
   *  Privacy: jen zápasy current usera (user.uid scope nebo individual-quick
   *  Simple mode). NIKDY sdílené klubové zápasy (asistent z klubu má vlastní
   *  historii — nemíchat). Tohle je čistě uživatelská soukromá historie.
   *
   *  Sortování: frekvence DESC + recency tie-break.
   *  Filtruje podle sportu (fotbal vs tenis vs florbal nemíchat). */
  const opponentHistory = useMemo(() => {
    if (!user?.uid) return [];
    type Entry = { name: string; count: number; lastDate: string };
    const map = new Map<string, Entry>();
    for (const m of allMatches) {
      const sport = m.sport ?? 'football';
      if (sport !== preferredSport) continue;
      // Privacy guard — jen zápasy vytvořené tímto uživatelem (ownerUid).
      // Soukromou historii soupeřů sdílet nechci, i když jiná klubová data
      // sdílím s asistentem. Match.ownerUid je nastavený v matches.firebase.ts
      // při createMatch() a je to uid původního tvůrce.
      if (m.ownerUid !== user.uid) continue;
      const name = m.opponent?.trim();
      if (!name) continue;
      // Skip default opponent placeholder ("Soupeř") — nebyl zadán reálně
      const isPlaceholder = name === t('match.list.quickMatchDefaultOpponent');
      if (isPlaceholder) continue;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if ((m.date ?? '') > existing.lastDate) existing.lastDate = m.date ?? '';
      } else {
        map.set(key, { name, count: 1, lastDate: m.date ?? '' });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return b.lastDate.localeCompare(a.lastDate);
    });
  }, [allMatches, preferredSport, t, user?.uid]);

  /** Suggested opponents — filtruje historii podle aktuálního textu. */
  const opponentSuggestions = useMemo(() => {
    const q = opponent.trim().toLowerCase();
    if (!opponentFocused) return [];
    if (opponentHistory.length === 0) return [];
    // Když user nenapsal nic, ukážeme top 5 nejpoužívanějších
    if (q.length === 0) return opponentHistory.slice(0, 5);
    // Jinak filtrujeme prefix > substring + ukážeme max 6
    const exactMatch = opponentHistory.find(o => o.name.toLowerCase() === q);
    if (exactMatch && opponentHistory.length === 1) return []; // už přesně sedí
    return opponentHistory
      .filter(o => o.name.toLowerCase().includes(q))
      .filter(o => o.name.toLowerCase() !== q) // skipuj přesnou shodu (nemá smysl nabízet)
      .slice(0, 6);
  }, [opponent, opponentFocused, opponentHistory]);

  const squads = useMemo(() => {
    return allSquads
      .filter(s => s.sport === preferredSport)
      .sort((a, b) => {
        // Nejčastěji-používané nahoře, pak podle lastUsed desc
        const aUse = a.usageCount ?? 0;
        const bUse = b.usageCount ?? 0;
        if (aUse !== bUse) return bUse - aUse;
        return (b.lastUsedAt ?? b.updatedAt ?? '').localeCompare(a.lastUsedAt ?? a.updatedAt ?? '');
      });
  }, [allSquads, preferredSport]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, []);

  // Auto-pre-pick nejužívanější party (squads[0] je už seřazené podle
  // usageCount desc). Honza v McDonald's Cupu: „po prvním zápase jsem
  // partu uložil jako „3.A", ale při druhém ji musel hledat" → tohle
  // to zkracuje: otevřeš sheet, parta je už vybraná, dopíšeš soupeře.
  // Lze zrušit tlačítkem „Změnit partu" (handleClearSquad).
  useEffect(() => {
    if (selectedSquadId) return; // už vybrané
    if (squads.length === 0) return; // žádné party
    // Auto-pick jen pokud existuje "silná" parta (použita alespoň jednou
    // předtím) — nechceme pre-selectovat ukládání-poprvé party ze stejné
    // session, user ji právě zavřel.
    const topSquad = squads[0];
    if ((topSquad.usageCount ?? 0) < 1) return;
    setSelectedSquadId(topSquad.id);
    setRosterText(topSquad.players.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Když vyberu squad → naplní rosterText a nabídne jeho jméno jako default.
  const handlePickSquad = (squad: SimpleSquad) => {
    setSelectedSquadId(squad.id);
    setRosterText(squad.players.join('\n'));
    setSaveAsSquad(false); // už je uložená
  };

  const handleClearSquad = () => {
    setSelectedSquadId(null);
    setRosterText('');
    setSaveAsSquad(false);
  };

  const parsedRoster = () => rosterText
    .split(/\r?\n/)
    .map(n => n.trim())
    .filter(n => n.length > 0);

  const handleStart = () => {
    const roster = parsedRoster();

    // Pokud user chce uložit jako novou partu a má roster + jméno
    let finalSquadId = selectedSquadId ?? undefined;
    if (saveAsSquad && !selectedSquadId && roster.length > 0 && squadName.trim() && user?.uid) {
      const newSquad = createSquad({
        name: squadName.trim(),
        sport: preferredSport,
        players: roster,
      }, user.uid);
      finalSquadId = newSquad.id;
    }

    // Pokud user použil existující squad, markni ho jako použitý (pro řazení)
    if (selectedSquadId) {
      markUsed(selectedSquadId);
    }

    // Sestavíme preset z current values (nejen z chipů, ale i z manual
    // inputů). Match format dědíme z nejbližšího chip presetu — 5+1 pro
    // krátké zápasy, 7+1 pro 60+ min.
    const totalMinutes = periodCount * periodMinutes;
    const matchFormat: QuickMatchPreset['matchFormat'] = totalMinutes >= 60 ? '7+1' : '5+1';
    const preset: QuickMatchPreset = {
      durationMinutes: totalMinutes,
      periods: periodCount,
      matchFormat,
      label: periodCount === 1 ? `${periodMinutes} min` : `${periodCount}×${periodMinutes}`,
    };
    onCreate(opponent, roster, finalSquadId, preset);
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px', borderRadius: 12,
    border: '1.5px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 15, outline: 'none',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'fadeIn .2s ease',
      }}
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, padding: '0 0 24px',
          maxHeight: '92dvh', overflowY: 'auto',
          animation: 'slideUp .25s ease',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 18px 14px',
        }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
            ⚡ {t('match.list.quickMatch')}
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Soupeř — s autocomplete z user vlastní historie zápasů.
              Privacy: jen vlastní zápasy (m.ownerUid === user.uid). */}
          <div style={{ position: 'relative' }}>
            <label htmlFor="quick-opponent" style={labelStyle}>
              {t('match.quickSheet.opponentLabel')}
            </label>
            <input
              id="quick-opponent"
              ref={inputRef}
              type="text"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              onFocus={() => setOpponentFocused(true)}
              onBlur={() => setTimeout(() => setOpponentFocused(false), 200)}
              placeholder={t('match.quickSheet.opponentPlaceholder')}
              style={inputStyle}
              autoComplete="off"
            />

            {/* Autocomplete dropdown — historie soupeřů */}
            {opponentSuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0, right: 0, zIndex: 30,
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                borderRadius: 12, marginTop: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                maxHeight: 200, overflowY: 'auto',
              }}>
                {opponentSuggestions.map(s => (
                  <button
                    key={s.name}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault(); // ať input neztratí focus dřív než nastavíme
                      setOpponent(s.name);
                      setOpponentFocused(false);
                    }}
                    style={{
                      width: '100%', padding: '10px 12px',
                      background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span style={{
                      fontSize: 14, fontWeight: 600, color: 'var(--text)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {s.name}
                    </span>
                    <span style={{
                      fontSize: 10, color: 'var(--text-muted)', flexShrink: 0,
                    }}>
                      {s.count}× {t('match.quickSheet.opponentMatchesAgo')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Squad picker — pokud jsou */}
          {squads.length > 0 && !selectedSquadId && (
            <div>
              <label style={labelStyle}>
                👥 {t('match.quickSheet.pickSquad')}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {squads.map(squad => (
                  <button
                    key={squad.id}
                    type="button"
                    onClick={() => handlePickSquad(squad)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--surface-var)', border: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>👥</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                        {squad.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {t('match.quickSheet.squadSize', { n: squad.players.length })}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 16, fontWeight: 700 }}>›</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Zvolená parta — show name + option to clear */}
          {selectedSquadId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--primary-light)', border: '1.5px solid var(--primary)',
            }}>
              <span style={{ fontSize: 20 }}>✓</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                  {squads.find(s => s.id === selectedSquadId)?.name ?? ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('match.quickSheet.squadActive', { n: parsedRoster().length })}
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearSquad}
                style={{
                  padding: '6px 10px', borderRadius: 8,
                  background: 'var(--surface)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {t('match.quickSheet.changeSquad')}
              </button>
            </div>
          )}

          {/* Roster — textarea (always visible, může být prázdná) */}
          <div>
            <label htmlFor="quick-roster" style={labelStyle}>
              {selectedSquadId ? t('match.quickSheet.rosterEditLabel') : t('match.quickSheet.rosterToggle')}
            </label>
            <textarea
              id="quick-roster"
              value={rosterText}
              onChange={e => setRosterText(e.target.value)}
              placeholder={t('match.quickSheet.rosterPlaceholder')}
              rows={selectedSquadId ? 4 : 5}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', borderRadius: 10,
                border: '1.5px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)',
                fontSize: 14, outline: 'none', resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Uložit jako partu — jen pokud nemám vybranou a mám roster */}
          {!selectedSquadId && parsedRoster().length > 0 && (
            <div style={{
              background: 'var(--surface-var)', borderRadius: 10, padding: 10,
              border: '1px solid var(--border)',
            }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={saveAsSquad}
                  onChange={e => setSaveAsSquad(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  💾 {t('match.quickSheet.saveAsSquad')}
                </span>
              </label>
              {saveAsSquad && (
                <input
                  type="text"
                  value={squadName}
                  onChange={e => setSquadName(e.target.value)}
                  placeholder={t('match.quickSheet.squadNamePlaceholder')}
                  style={{
                    ...inputStyle,
                    marginTop: 8, padding: '8px 10px', fontSize: 13,
                  }}
                />
              )}
            </div>
          )}

          {/* Délka zápasu — zjednodušeno (audit 2026-04-25 user: „je tam moc
              prvků, zjednoduš"). Vyhodily se: 4 quick-pick chipy + subtitles
              + min/max popisky pod sliderem + summary text. Zůstává jen:
              poločasy 1/2 toggle + slider s velkým displayem hodnoty. */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                ⏱ {t('match.quickSheet.durationLabel')}
              </span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
                {periodCount === 1 ? `${periodMinutes}` : `${periodCount}×${periodMinutes}`}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>min</span>
              </span>
            </div>

            {/* Poločasy 1/2 toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {([1, 2] as const).map(n => {
                const active = periodCount === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPeriodCount(n)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 10,
                      background: active ? 'var(--primary)' : 'var(--surface-var)',
                      color: active ? '#fff' : 'var(--text)',
                      border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {n === 1 ? t('match.quickSheet.periods1') : t('match.quickSheet.periods2')}
                  </button>
                );
              })}
            </div>

            {/* Slider — full-width, primary thumb */}
            <input
              type="range"
              min={5}
              max={60}
              step={1}
              value={periodMinutes}
              onChange={e => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setPeriodMinutes(n);
              }}
              aria-label={periodCount === 1
                ? t('match.quickSheet.durationOneLabel')
                : t('match.quickSheet.durationEachLabel')}
              className="torq-slider"
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          <button
            onClick={handleStart}
            disabled={saveAsSquad && !squadName.trim() && parsedRoster().length > 0}
            style={{
              padding: '14px', borderRadius: 12,
              background: 'var(--primary)', color: '#fff', border: 'none',
              fontWeight: 800, fontSize: 15, cursor: 'pointer',
              marginTop: 4, boxShadow: 'var(--shadow-sm)',
              opacity: (saveAsSquad && !squadName.trim() && parsedRoster().length > 0) ? 0.5 : 1,
            }}
          >
            ⚡ {t('match.quickSheet.startCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
