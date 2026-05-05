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
import { useClubsStore } from '../../store/clubs.store';
import type { SimpleSquad } from '../../types/simpleSquad.types';
import {
  SettingRow,
  ChipPair,
  CompactNumberInput,
  SettingsList,
  PageHeader,
} from '../ui';

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

interface Props {
  onClose: () => void;
  onCreate: (opponent: string, roster: string[], squadId?: string, preset?: QuickMatchPreset) => void;
  /**
   * 'sheet' (default) — bottom-sheet modal pattern (legacy).
   * 'page' — full page layout konzistentní s tournament wizardem.
   * Audit 2026-04-29: User feedback že match creation by měla být plná stránka,
   * ne bottom sheet (jako tournament wizard má svou stránku).
   */
  mode?: 'sheet' | 'page';
  /**
   * Pro 'page' mode: navigate funkce pro link na "Plný zápas se sestavou".
   * Když undefined, link se neukáže.
   */
  onSwitchToFullMatch?: () => void;
}

export function QuickMatchSheet({ onClose, onCreate, mode = 'sheet', onSwitchToFullMatch }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const allSquads = useSimpleSquadsStore(s => s.squads);
  const createSquad = useSimpleSquadsStore(s => s.createSquad);
  const markUsed = useSimpleSquadsStore(s => s.markUsed);
  // Audit 2026-04-29 (varianta A): když user má aktivní klub s hráči, ať
  // místo psaní jmen do textarea klikatelně vybere hráče (chip per hráč).
  // Pokud klub nemá / nemá hráče → fallback na manuální textarea.
  const clubs = useClubsStore(s => s.clubs);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const activeClub = useMemo(
    () => clubs.find(c => c.id === activeClubId) ?? null,
    [clubs, activeClubId],
  );
  const clubPlayers = useMemo(
    () => (activeClub?.players ?? []).filter(p => p.active),
    [activeClub],
  );
  const hasClubPlayers = clubPlayers.length > 0;
  // Audit 2026-04-25 (user feedback): „může si torq pamatovat soupeře které
  // jsem zadával? aby mi to nabízelo jak budu psát?" → ano, vytáhneme
  // unikátní opponenty z user vlastních zápasů (stejný sport), seřadíme
  // podle frekvence + recency. Žádný external katalog — jen historie usera.
  const allMatches = useMatchesStore(s => s.matches);

  const [opponent, setOpponent] = useState('');
  const [opponentFocused, setOpponentFocused] = useState(false);
  const [rosterText, setRosterText] = useState('');
  // Audit 2026-04-25 (user): „hráče bych nechal jen pokud chce trenér zadat
  // soupisku — checkbox → po zaškrtnutí se zobrazí pole". Default off pro
  // čistý quick flow (user typicky nepotřebuje sestavu pro plácek/přátelák).
  const [wantRoster, setWantRoster] = useState(false);
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
  // Audit 2026-04-28 (research-driven UX overhaul): match format jako visible
  // setting (předtím auto-derived z duration ≥60min). Coach klubový tým hraje
  // pevný format (5+1, 7+1, 11+1) — má smysl ho exponovat. Default 5+1
  // (mládež malé hřiště — dominantní amatérský fotbal v ČR).
  const [matchFormat, setMatchFormat] = useState<QuickMatchPreset['matchFormat']>('5+1');
  // Audit 2026-04-29 (varianta A): „pickerMode" určuje jak user zadává soupisku
  // pod accordionem „Chci zadat soupisku":
  //   - 'club'   = klikatelný grid hráčů z aktivního klubu (default pokud má hráče)
  //   - 'manual' = textarea (jeden hráč na řádek; default pokud není klub / hráči)
  // User může mezi módy přepínat (např. „chci připsat hosta" → manuální).
  const [pickerMode, setPickerMode] = useState<'club' | 'manual'>(
    hasClubPlayers ? 'club' : 'manual',
  );
  // Filter podle ageCategory v club picker módu — pokud klub má hráče ve
  // víc kategoriích (U10/U12/...), nemíchat je do jednoho seznamu.
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);

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
      // Privacy guard — useMatchesStore už filtruje podle Firebase auth uid
      // (zápasy načtené z /matches/{uid}), tj. vidíme jen vlastní + sdílené
      // klubové. Pro Simple mode (individual-quick) jsou zápasy vždy soukromé.
      // Pro Advanced klubový kontext: zápasy klubu jsou sdílené s asistentem,
      // což je očekávané — opponent history odpovídá kontextu, ve kterém
      // user funguje. Žádný další guard není potřeba.
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
    setWantRoster(true); // pre-pickutá squad implikuje, že user chce soupisku
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
    setWantRoster(true); // user vybral partu → chce soupisku
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

  // Audit 2026-04-29 (varianta A): toggle hráče z klubového pickeru.
  // Single source of truth = `rosterText` (řádky); club picker tak může
  // koexistovat s manual módem — selectované jméno jen přidá/uberé řádek.
  const togglePlayer = (name: string) => {
    const lines = rosterText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const idx = lines.indexOf(name);
    if (idx >= 0) lines.splice(idx, 1);
    else lines.push(name);
    setRosterText(lines.join('\n'));
  };
  const isPlayerSelected = (name: string) => parsedRoster().includes(name);

  // Unikátní kategorie z klubu (pro filter chip bar v picker módu).
  // Natural sort U6 < U7 < ... < U19, plus „all" jako default.
  const clubCategories = useMemo(() => {
    const set = new Set<string>();
    clubPlayers.forEach(p => { if (p.ageCategory) set.add(p.ageCategory); });
    return [...set].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });
  }, [clubPlayers]);

  const visibleClubPlayers = useMemo(() => {
    if (categoryFilter === 'all') return clubPlayers;
    return clubPlayers.filter(p => p.ageCategory === categoryFilter);
  }, [clubPlayers, categoryFilter]);

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

    // Sestavíme preset z current values. Match format je teď user-controlled
    // (visible setting), ne auto-derived.
    const totalMinutes = periodCount * periodMinutes;
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

  // Audit 2026-04-29: Page mode = full page layout (jako tournament wizard).
  // Sheet mode = legacy bottom-sheet modal (zachováno pro backward compat).
  const isPageMode = mode === 'page';

  // Společný formulář (oba módy ho používají uvnitř svých wrapperů).
  const formContent = (
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

          {/* Hráči — accordion karta (audit 2026-04-25 user: „není jasné že
              když kliknu na soupisku, něco se stane"). Místo checkboxu udělaná
              jako klikatelná karta s ikonou a šipkou (▼/▲) — jasný visual
              cue že je to interactive. Po kliku se rozbalí textarea. */}
          <div>
            <button
              type="button"
              onClick={() => setWantRoster(v => !v)}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                background: wantRoster ? 'var(--primary-light)' : 'var(--surface-var)',
                border: `1.5px solid ${wantRoster ? 'var(--primary)' : 'var(--border)'}`,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background .15s, border-color .15s',
              }}
              aria-expanded={wantRoster}
            >
              <span style={{ fontSize: 22 }}>👥</span>
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 700,
                color: wantRoster ? 'var(--primary)' : 'var(--text)',
              }}>
                {wantRoster
                  ? t('match.quickSheet.wantRosterActive')
                  : t('match.quickSheet.wantRoster')}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: wantRoster ? 'var(--primary)' : 'var(--text-muted)',
                transform: wantRoster ? 'rotate(180deg)' : 'none',
                transition: 'transform .2s',
              }}>
                ▼
              </span>
            </button>
            {wantRoster && (
              <div style={{ marginTop: 10 }}>
                {/* ── Club picker mode (varianta A): klikatelný grid hráčů
                    z aktivního klubu. Defaultně aktivní pokud klub má hráče. */}
                {pickerMode === 'club' && hasClubPlayers && (
                  <div>
                    {/* Category filter chips — jen pokud klub má víc kategorií */}
                    {clubCategories.length > 1 && (
                      <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10,
                      }}>
                        <button
                          type="button"
                          onClick={() => setCategoryFilter('all')}
                          style={{
                            padding: '5px 11px', borderRadius: 8,
                            background: categoryFilter === 'all' ? 'var(--primary)' : 'var(--surface-var)',
                            color: categoryFilter === 'all' ? '#fff' : 'var(--text-muted)',
                            border: '1px solid var(--border)',
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          {t('match.quickSheet.categoryAll')}
                        </button>
                        {clubCategories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setCategoryFilter(cat)}
                            style={{
                              padding: '5px 11px', borderRadius: 8,
                              background: categoryFilter === cat ? 'var(--primary)' : 'var(--surface-var)',
                              color: categoryFilter === cat ? '#fff' : 'var(--text-muted)',
                              border: '1px solid var(--border)',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Player chips grid */}
                    {visibleClubPlayers.length === 0 ? (
                      <div style={{
                        padding: '14px', textAlign: 'center',
                        color: 'var(--text-muted)', fontSize: 13,
                        background: 'var(--surface-var)', borderRadius: 10,
                      }}>
                        {t('match.quickSheet.noClubPlayersInCategory')}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {visibleClubPlayers.map(p => {
                          const selected = isPlayerSelected(p.name);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => togglePlayer(p.name)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '7px 12px', borderRadius: 999,
                                background: selected ? 'var(--primary)' : 'var(--surface-var)',
                                color: selected ? '#fff' : 'var(--text)',
                                border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                transition: 'background .12s, border-color .12s',
                              }}
                              aria-pressed={selected}
                            >
                              {p.jerseyNumber > 0 && (
                                <span style={{
                                  fontWeight: 800, fontSize: 11,
                                  opacity: selected ? 0.85 : 0.55,
                                }}>
                                  #{p.jerseyNumber}
                                </span>
                              )}
                              <span>{p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Status row + switch to manual */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: 10, gap: 8, flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {t('match.quickSheet.playersSelected', { n: parsedRoster().length })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPickerMode('manual')}
                        style={{
                          padding: '6px 10px', borderRadius: 8,
                          background: 'transparent', color: 'var(--text-muted)',
                          border: '1px dashed var(--border)',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        ✏️ {t('match.quickSheet.switchToManual')}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Manual mode: textarea (jeden hráč na řádek). Fallback
                    pro Simple mode bez klubu, host hráče, ručně dopsané jméno. */}
                {pickerMode === 'manual' && (
                  <div>
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
                    {hasClubPlayers && (
                      <div style={{
                        display: 'flex', justifyContent: 'flex-end', marginTop: 6,
                      }}>
                        <button
                          type="button"
                          onClick={() => setPickerMode('club')}
                          style={{
                            padding: '6px 10px', borderRadius: 8,
                            background: 'transparent', color: 'var(--text-muted)',
                            border: '1px dashed var(--border)',
                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          👥 {t('match.quickSheet.switchToClub')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Uložit jako partu — jen pokud user chce roster, nemá vybranou squad a něco napsal */}
          {wantRoster && !selectedSquadId && parsedRoster().length > 0 && (
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

          {/* Detaily zápasu — Settings Preview pattern (konzistentní s wizardem).
              Smart defaults viditelné jako řádky, klikni inline editor pro úpravu.
              Audit 2026-04-28: nahrazuje předchozí 2-col layout (Poločasy + Délka)
              + přidává matchFormat jako visible setting (předtím auto-derived). */}
          <div style={{
            background: 'var(--surface-var)',
            borderRadius: 12, padding: '4px 14px',
            border: '1px solid var(--border)',
          }}>
            <SettingsList>
              <SettingRow icon="⏱" label={t('match.quickSheet.periodsLabel')}>
                <ChipPair
                  value={periodCount}
                  options={[
                    { v: 1, label: '1' },
                    { v: 2, label: '2' },
                  ]}
                  onChange={v => setPeriodCount(v as 1 | 2)}
                />
              </SettingRow>
              <SettingRow
                icon="🕐"
                label={periodCount === 1
                  ? t('match.quickSheet.durationOneLabel')
                  : t('match.quickSheet.durationEachLabel')}
              >
                <CompactNumberInput
                  value={periodMinutes}
                  min={1}
                  max={60}
                  unit="min"
                  onChange={setPeriodMinutes}
                />
              </SettingRow>
              <SettingRow icon="⚽" label={t('match.quickSheet.matchFormatLabel')} isLast>
                <ChipPair
                  value={matchFormat}
                  options={[
                    { v: '5+1', label: '5+1' },
                    { v: '7+1', label: '7+1' },
                    { v: '11+1', label: '11+1' },
                  ]}
                  onChange={v => setMatchFormat(v as QuickMatchPreset['matchFormat'])}
                />
              </SettingRow>
            </SettingsList>
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

          {/* Link na "Plný zápas se sestavou" — pro power users co chtějí
              klubový zápas s lineup, střídáním, hodnocením. Audit 2026-04-29:
              místo separátního pickeru má tenhle link uvnitř quick form. */}
          {onSwitchToFullMatch && (
            <button
              type="button"
              onClick={onSwitchToFullMatch}
              style={{
                marginTop: 8, padding: '10px 14px', borderRadius: 10,
                background: 'transparent', border: '1.5px dashed var(--border)',
                color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              {t('match.quickSheet.switchToFullMatch')}
            </button>
          )}
        </div>
  );

  // ─── Page mode: full page layout (jako tournament wizard) ─────────────
  if (isPageMode) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        minHeight: '100dvh', background: 'var(--bg)',
      }}>
        <div style={{
          width: '100%', maxWidth: 720, margin: '0 auto',
          flex: 1, display: 'flex', flexDirection: 'column',
        }}>
          <PageHeader
            title={`⚡ ${t('match.list.quickMatch')}`}
            onBack={onClose}
          />
          <div style={{ paddingTop: 8, paddingBottom: 24 }}>
            {formContent}
          </div>
        </div>
      </div>
    );
  }

  // ─── Sheet mode (legacy): bottom-sheet modal ─────────────────────────
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

        {formContent}
      </div>
    </div>
  );
}
