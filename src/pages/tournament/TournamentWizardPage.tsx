/**
 * TournamentWizardPage — sjednocený 3-step wizard pro vytváření turnaje.
 *
 * **Background (audit 2026-04-26, research-driven):**
 * Předtím existovaly 3 separátní cesty:
 *   - QuickTournamentPage (round-robin only)
 *   - TournamentPlannerPage (smart kalkulátor)
 *   - CreateTournamentPage (manual full form)
 * + TournamentCreateChoicePage jako rozcestník.
 *
 * Research 3 paralelních agentů (NN/g, Baymard, Material 3, Challonge,
 * Battlefy, Toornament, Tournify) ukázal:
 * 1. Multi-step wizard pro 8+ polí outperformuje single-page (HubSpot +86%)
 * 2. Smart-suggest engine podle počtu týmů = USP (žádná konkurence to nemá)
 * 3. Progressive disclosure pro Pokročilé (5-15% click rate je OK schovat)
 * 4. Mobile-first single column, on-blur validation, sticky bottom CTA
 *
 * **Logika napříč personami:**
 *
 * Persona A — Učitel TV (jednoduchý školní turnaj):
 *   - Krok 1: Název + datum + místo (30s)
 *   - Krok 2: počet týmů (chips) → smart-suggest formát ⭐ → vybere
 *   - Krok 3: jména týmů (auto-vyplnit) → "Vytvořit a hrát"
 *   - "Pokročilé" nesahá → 30-60s celkem
 *
 * Persona B — Klubový trenér (s registrací týmů, billing):
 *   - Krok 1+2 stejně
 *   - Krok 3: jména týmů + rozbalí "Pokročilé":
 *     - Online registrace přes link rodičům
 *     - Vstupné + billing profile
 *     - Vlastní pravidla / rozvrh
 *   - Stále jediný flow, jen s "Pokročilé" zaškrtnutým
 *
 * Persona C — Power user s vlastním rozvrhem:
 *   - Pokud potřebuje vlastní pořadí zápasů, custom bracket → fall-through
 *     na CreateTournamentPage (manual) přes "Manuální nastavení" odkaz
 *     na konci Pokročilé sekce. Nezahazujeme existing investment.
 */

import { useState, useEffect, useMemo } from 'react';
import type { Page } from '../../App';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useTournamentStore } from '../../store/tournament.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { useToastStore } from '../../store/toast.store';
import { generatePinSalt, hashPin } from '../../utils/pin-hash';
import { suggestFormats, type FormatSuggestion } from '../../utils/tournament-format-suggest';
import {
  PageHeader,
  FormCard, SectionTitle, FormField, PrimaryButton,
  formInputStyle,
  SettingRow, Toggle, CompactNumberInput, ExpandableTextEditor,
} from '../../components/ui';
import type { TournamentFormat } from '../../types/tournament.types';

interface Props { navigate: (p: Page) => void; }

type WizardStep = 1 | 2 | 3 | 4;

const TEAM_COLORS = [
  '#1565C0', '#C62828', '#2E7D32', '#E65100',
  '#6A1B9A', '#00695C', '#283593', '#F9A825',
  '#4A148C', '#4E342E', '#0D47A1', '#BF360C',
  '#1B5E20', '#37474F', '#AD1457', '#D32F2F',
];

const DRAFT_KEY = 'torq.tournamentWizard.draft.v1';
/** Maximální podporovaný počet týmů (smart-suggest engine + brackets generator). */
const TEAM_COUNT_MAX = 32;
/** Minimální počet týmů (round-robin potřebuje aspoň 2). */
const TEAM_COUNT_MIN = 2;
// V Step 3 používáme smart presets per format místo univerzálního chip rangu —
// quickChips se počítá in-render z draft.format.

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Mini bracket SVG diagrams (used in HeroFormatCard) ─────────────────────
// Stylované jako ikony, ne plnohodnotné brackets. Cíl: coach hned vidí strukturu.

function RoundRobinDiagram({ size = 56 }: { size?: number }) {
  const cx = size / 2;
  const r = size / 2 - 8;
  const dotR = 3.5;
  // 6 teček po obvodu kruhu, propojené čarami (round-robin = každý s každým)
  const dots = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cx + Math.sin(angle) * r };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Spojnice mezi všemi týmy (každý s každým) */}
      {dots.map((a, i) =>
        dots.slice(i + 1).map((b, j) => (
          <line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="var(--border)" strokeWidth="0.6" />
        ))
      )}
      {/* Týmy jako tečky */}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={dotR} fill="var(--primary)" />
      ))}
    </svg>
  );
}

function GroupsKnockoutDiagram({ size = 56 }: { size?: number }) {
  // 2 skupiny vlevo (každá 3 tečky) → bracket vpravo
  const w = size + 24;
  const dotR = 2.5;
  return (
    <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`}>
      {/* Skupina A — 3 tečky vlevo nahoře */}
      <rect x="2" y="4" width="22" height="20" fill="var(--surface-var)"
        stroke="var(--border)" strokeWidth="0.8" rx="3" />
      <circle cx="8" cy="14" r={dotR} fill="var(--primary)" />
      <circle cx="14" cy="10" r={dotR} fill="var(--primary)" />
      <circle cx="20" cy="14" r={dotR} fill="var(--primary)" />
      {/* Skupina B — 3 tečky vlevo dole */}
      <rect x="2" y={size - 24} width="22" height="20" fill="var(--surface-var)"
        stroke="var(--border)" strokeWidth="0.8" rx="3" />
      <circle cx="8" cy={size - 14} r={dotR} fill="var(--primary)" />
      <circle cx="14" cy={size - 18} r={dotR} fill="var(--primary)" />
      <circle cx="20" cy={size - 14} r={dotR} fill="var(--primary)" />
      {/* Bracket vpravo: 2 čáry → 1 čára → trofej */}
      <line x1="28" y1="14" x2="40" y2="14" stroke="var(--text)" strokeWidth="1.2" />
      <line x1="28" y1={size - 14} x2="40" y2={size - 14} stroke="var(--text)" strokeWidth="1.2" />
      <line x1="40" y1="14" x2="40" y2={size - 14} stroke="var(--text)" strokeWidth="1.2" />
      <line x1="40" y1={size / 2} x2="52" y2={size / 2} stroke="var(--text)" strokeWidth="1.2" />
      <text x={w - 16} y={size / 2 + 4} fontSize="11">🏆</text>
    </svg>
  );
}

function KnockoutDiagram({ size = 56 }: { size?: number }) {
  // Single elimination tree: 4 týmy → 2 → 1
  const w = size + 16;
  const dotR = 2.5;
  return (
    <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`}>
      {/* 4 startovní týmy (tečky vlevo) */}
      <circle cx="6" cy="8" r={dotR} fill="var(--primary)" />
      <circle cx="6" cy="22" r={dotR} fill="var(--primary)" />
      <circle cx="6" cy={size - 22} r={dotR} fill="var(--primary)" />
      <circle cx="6" cy={size - 8} r={dotR} fill="var(--primary)" />
      {/* První kolo — 2 zápasy (čáry) */}
      <line x1="10" y1="8" x2="22" y2="8" stroke="var(--text)" strokeWidth="1.2" />
      <line x1="10" y1="22" x2="22" y2="22" stroke="var(--text)" strokeWidth="1.2" />
      <line x1="22" y1="8" x2="22" y2="22" stroke="var(--text)" strokeWidth="1.2" />
      <line x1="22" y1="15" x2="38" y2="15" stroke="var(--text)" strokeWidth="1.2" />
      <line x1="10" y1={size - 22} x2="22" y2={size - 22} stroke="var(--text)" strokeWidth="1.2" />
      <line x1="10" y1={size - 8} x2="22" y2={size - 8} stroke="var(--text)" strokeWidth="1.2" />
      <line x1="22" y1={size - 22} x2="22" y2={size - 8} stroke="var(--text)" strokeWidth="1.2" />
      <line x1="22" y1={size - 15} x2="38" y2={size - 15} stroke="var(--text)" strokeWidth="1.2" />
      {/* Finále */}
      <line x1="38" y1="15" x2="38" y2={size - 15} stroke="var(--text)" strokeWidth="1.2" />
      <line x1="38" y1={size / 2} x2="52" y2={size / 2} stroke="var(--text)" strokeWidth="1.2" />
      <text x={w - 14} y={size / 2 + 4} fontSize="11">🏆</text>
    </svg>
  );
}

// Settings Preview komponenty (SettingRow, Toggle, ChipPair, CompactNumberInput,
// ExpandableTextEditor) jsou teď v `components/ui/SettingsPreview` a importují se
// přes `components/ui` index. Sdílí je TournamentWizardPage + QuickMatchSheet.

// ─── Tournament Structure Diagram (live preview podle settings) ──────────────
// Trener vidí přesně jak turnaj poběží: skupiny, kdo postupuje, struktura pavouka.
// Reaguje na advancePerGroup, thirdPlaceMatch, playOut toggly v reálném čase.

/**
 * Skupina jako kompaktní karta: Letter nahoře, týmy v sloupci pod sebou
 * (jako klasické turnajové standings). Skupiny vedle sebe v row layoutu,
 * coach vidí všechny naráz a porovná si je.
 *
 * Advancující týmy: warning oranžové glowing dots
 * Vyřazení: surface dimmed dots
 */
function GroupCard({
  size, advance, letter, onRemove, onSetAdvance,
}: {
  size: number;
  advance: 1 | 2;
  letter: string;
  /** Smazat skupinu — × button v rohu. Undefined = nelze smazat. */
  onRemove?: () => void;
  /** Klik na řádek nastaví advance na ten index. Undefined = read-only. */
  onSetAdvance?: (n: 1 | 2) => void;
}) {
  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: 'var(--surface-var)',
      border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8,
      minWidth: 56,
      position: 'relative',
    }}>
      {/* × button pro smazání skupiny — top-right corner */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Smazat skupinu ${letter}`}
          title={`Smazat skupinu ${letter}`}
          style={{
            position: 'absolute',
            top: -7, right: -7,
            width: 20, height: 20,
            borderRadius: '50%',
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: 12, lineHeight: 1, fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,.08)',
          }}
        >×</button>
      )}
      <span style={{
        fontSize: 12, fontWeight: 800, color: 'var(--text)',
      }}>
        {letter}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Array.from({ length: size }).map((_, i) => {
          const advancing = i < advance;
          const label = `${letter}${i + 1}`;
          // Kliknutelné jsou řádky s indexem 1 nebo 2 (advance může být 1 nebo 2)
          const idx = i + 1;
          const isClickable = !!onSetAdvance && (idx === 1 || idx === 2);
          return (
            <div
              key={i}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onClick={isClickable ? () => onSetAdvance!(idx as 1 | 2) : undefined}
              onKeyDown={isClickable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSetAdvance!(idx as 1 | 2);
                }
              } : undefined}
              title={
                isClickable
                  ? (idx === 1
                    ? `Klikni — postupuje jen vítěz skupiny`
                    : `Klikni — postupují nejlepší 2 ze skupiny`)
                  : (advancing ? `${label} — postupuje` : `${label} — končí`)
              }
              style={{
                padding: '3px 8px',
                fontSize: 11, fontWeight: 800,
                borderRadius: 5,
                background: advancing ? 'var(--warning)' : 'var(--surface)',
                color: advancing ? '#fff' : 'var(--text-muted)',
                border: `1.5px solid ${advancing ? 'var(--warning)' : 'var(--border)'}`,
                minWidth: 30,
                textAlign: 'center',
                opacity: advancing ? 1 : 0.65,
                boxShadow: advancing ? '0 0 0 1.5px rgba(245, 158, 11, 0.18)' : 'none',
                transition: 'background .2s, box-shadow .2s',
                letterSpacing: 0.3,
                cursor: isClickable ? 'pointer' : 'default',
                userSelect: 'none',
              }}
            >
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Direct toggle button uvnitř diagramu — výrazný visual při on, ghost při off.
 * Použito pro 3. místo a play-out toggly přímo v Tournament Structure diagramu.
 */
function DirectToggleButton({
  active, activeLabel, inactiveLabel, onClick,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        background: active ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
        border: `1.5px ${active ? 'solid' : 'dashed'} ${active ? 'var(--warning)' : 'var(--border)'}`,
        color: active ? 'var(--warning)' : 'var(--text-muted)',
        fontSize: 11, fontWeight: 700,
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'background .2s, border-color .2s',
      }}
    >
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

/**
 * Generuje labely pro první kolo bracketu (cross-bracket seeding).
 * Standardní turnajové pravidlo: 1. místo skupiny se nesetkává s jiným 1. místem
 * v prvním kole. Returns array slotů (délka = bracketSize), s '—' pro bye.
 *
 * Příklady:
 *  - 2 groups × 1: ['A1', 'B1'] (just final)
 *  - 2 groups × 2: ['A1', 'B2', 'B1', 'A2'] → SF1: A1 vs B2, SF2: B1 vs A2
 *  - 4 groups × 1: ['A1', 'C1', 'B1', 'D1']
 *  - 4 groups × 2: ['A1','B2','C1','D2','B1','A2','D1','C2']
 *  - 3 groups × 2: ['A1','—','B2','C1','B1','—','A2','C2'] (top seedi mají bye)
 */
function generateBracketLabels(groupCount: number, advancePerGroup: 1 | 2): string[] {
  const letter = (i: number) => String.fromCharCode(65 + i);

  if (advancePerGroup === 1) {
    // Pouze vítězové skupin: pair adjacent (A vs B, C vs D, ...)
    if (groupCount === 2) return ['A1', 'B1'];
    if (groupCount === 3) return ['A1', '—', 'B1', 'C1']; // bracket of 4 with 1 bye
    if (groupCount === 4) return ['A1', 'C1', 'B1', 'D1']; // cross-bracket SF
    return Array.from({ length: groupCount }, (_, i) => `${letter(i)}1`);
  }

  // advancePerGroup === 2 — cross-bracket
  if (groupCount === 2) return ['A1', 'B2', 'B1', 'A2'];
  if (groupCount === 4) return ['A1', 'B2', 'C1', 'D2', 'B1', 'A2', 'D1', 'C2'];
  if (groupCount === 3) {
    // 6 teams in bracket of 8. Top seeds (A1, B1) get bye into SF.
    // QF1: bye/A1 → SF1
    // QF2: B2 vs C1 → SF1
    // QF3: bye/B1 → SF2
    // QF4: A2 vs C2 → SF2
    return ['A1', '—', 'B2', 'C1', 'B1', '—', 'A2', 'C2'];
  }
  // Fallback for unusual configs
  return [];
}

/**
 * SVG bracket tree — skutečný vizuální pavouk.
 * Round 0 (první kolo) má rovnoměrně rozložené matche, každé další kolo
 * má y-pozici = průměr y dvou rodičovských matchů (proto se větve sbíhají).
 *
 * Pro non-power-of-2 (např. 6 týmů → bracket 8 s 2 bye): bye-sloty jsou
 * nahoře (top seeded), zobrazené jako čárkované rámečky bez pozadí.
 *
 * Pokud `thirdPlace`, pod hlavním bracketem se zobrazí samostatný box
 * "Zápas o 3. místo" (semifinálisti, kteří prohráli, hrají o bronz).
 */
function BracketTree({
  teams, thirdPlace, labels,
  noFinaleLabel = false,
  noTrophy = false,
  finalReplacementLabel,
  onSetThirdPlace,
  thirdPlaceLabel = '3. místo',
}: {
  teams: number;
  thirdPlace: boolean;
  /** Optional cross-bracket seeding labels (length = bracketSize, '—' for bye). */
  labels?: string[];
  /** Pro play-out: nezobrazuj "Finále" text uvnitř posledního boxu. */
  noFinaleLabel?: boolean;
  /** Pro play-out: nezobrazuj 🏆 trofej za finále. */
  noTrophy?: boolean;
  /** Pokud noFinaleLabel=false a tohle je nastavené, použij místo "Finále" tenhle text
      (např. play-out tier konverguje k jednomu match boxu = ne fakticky "Finále"). */
  finalReplacementLabel?: string;
  /** Direct manipulation 3. místa. Když poskytnuto:
   *  - thirdPlace=false: rendruje dashed placeholder pod finále (klik = přidat)
   *  - thirdPlace=true:  rendruje × button v rohu 3rd place boxu (klik = odebrat) */
  onSetThirdPlace?: (v: boolean) => void;
  /** Label pro bronze match. Default "3. místo" pro hlavní turnaj.
   *  Pro play-out tier je to relativní (např. "11. místo" pro tier 9-12). */
  thirdPlaceLabel?: string;
}) {
  if (teams < 2) return null;

  // Round up to next power of 2 → bracket size
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(teams)));
  const byes = bracketSize - teams;

  // Spočti rounds: [r1Count, r2Count, ...] — finále je 1
  const rounds: number[] = [];
  let cur = bracketSize;
  while (cur > 1) {
    cur = cur / 2;
    rounds.push(cur);
  }
  const r1Count = bracketSize / 2;

  // Layout konstanty (px). Mobile-friendly: kompaktní, ale čitelné.
  // matchH bigger pro labels — 2 řádky textu (slot1 / slot2)
  const matchH = labels && labels.length > 0 ? 32 : 24;
  const matchW = 60;
  const matchGap = 8;
  const colGap = 14;

  const totalH = r1Count * (matchH + matchGap) - matchGap;
  // Šířka: rounds * (matchW + colGap) + místo na trofej (28px)
  const totalW = rounds.length * (matchW + colGap) - colGap + 32;

  // Bye distribuce: bye = empty slot, top seedi mají bye do R2.
  // Standardní pravidlo: každý R1 match má MAX 1 bye partner (jeden tým hraje,
  // druhý má bye = neexistuje protihráč → tým auto-postupuje).
  //
  // Pokládáme byes do odd slotů (1, 3, 5, ...) — tím každý R1 match má pár
  // (slot 2k, slot 2k+1) kde slot 2k+1 je bye, slot 2k má reálný tým.
  // Pokud byes > r1Count (víc bye než R1 matchů), zbylé byes se umístí
  // do even slotů (degenerate case, ale podporujeme pro robustnost).
  const slotIsBye: boolean[] = new Array(bracketSize).fill(false);
  let byesPlaced = 0;
  // První pass: odd sloty (1, 3, 5, ..., bracketSize-1)
  for (let i = 1; i < bracketSize && byesPlaced < byes; i += 2) {
    slotIsBye[i] = true;
    byesPlaced++;
  }
  // Backup pass (jen pokud byes > r1Count): even sloty
  for (let i = 0; i < bracketSize && byesPlaced < byes; i += 2) {
    slotIsBye[i] = true;
    byesPlaced++;
  }

  type MatchPos = {
    round: number;
    idx: number;
    y: number;
    /** True když má match 2 reálné týmy (žádný bye). */
    isReal: boolean;
    /** True když match má právě 1 bye = pass-through (1 tým auto-postupuje). */
    isPassThrough: boolean;
  };
  const positions: MatchPos[] = [];

  // Round 0 (první kolo): rovnoměrně rozložené, y = idx * (matchH + matchGap)
  for (let i = 0; i < r1Count; i++) {
    const slot1Bye = slotIsBye[2 * i];
    const slot2Bye = slotIsBye[2 * i + 1];
    // isReal = oba sloty mají reálné týmy
    // isPassThrough = právě 1 bye (= 1 tým auto-postupuje, nehraje)
    const byeCount = (slot1Bye ? 1 : 0) + (slot2Bye ? 1 : 0);
    positions.push({
      round: 0,
      idx: i,
      y: i * (matchH + matchGap),
      isReal: byeCount === 0,
      isPassThrough: byeCount === 1,
    });
  }

  // Další kola: y = průměr y dvou rodičovských matchů (sbíhání větví)
  for (let r = 1; r < rounds.length; r++) {
    for (let i = 0; i < rounds[r]; i++) {
      const p1 = positions.find(p => p.round === r - 1 && p.idx === i * 2);
      const p2 = positions.find(p => p.round === r - 1 && p.idx === i * 2 + 1);
      const y = (p1!.y + p2!.y) / 2;
      positions.push({ round: r, idx: i, y, isReal: true, isPassThrough: false });
    }
  }

  const matchAtPos = (round: number, idx: number) =>
    positions.find(p => p.round === round && p.idx === idx)!;

  // 3. místo box je pod finále (stejná x-coordinate jako finále)
  const finalPos = matchAtPos(rounds.length - 1, 0);
  const finalX = (rounds.length - 1) * (matchW + colGap);
  const thirdPlaceX = finalX;
  const thirdPlaceY = finalPos.y + matchH + 18;

  // SVG height: bracket + (3. místo pod finále, pokud zapnuto NEBO toggleable).
  // Když je onSetThirdPlace poskytnuto, rezervujeme místo pro placeholder
  // i v off stavu (aby se layout nepřeskakoval po toggle).
  const showThirdPlaceArea = thirdPlace || !!onSetThirdPlace;
  const svgH = showThirdPlaceArea
    ? Math.max(totalH + 12, thirdPlaceY + matchH + 12)
    : totalH + 12;

  return (
    <div style={{
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
      maxWidth: '100%',
      display: 'flex',
      justifyContent: 'center',
    }}>
      <svg
        width={totalW}
        height={svgH}
        viewBox={`0 0 ${totalW} ${svgH}`}
        style={{ display: 'block', flexShrink: 0, margin: '0 auto' }}
      >
        {/* Spojnice mezi koly */}
        {positions.map(p => {
          if (p.round === rounds.length - 1) return null; // poslední (finále) — není kam pokračovat
          const x1 = (p.round + 1) * (matchW + colGap) - colGap; // pravý okraj match boxu
          const startY = p.y + matchH / 2;
          // Najdi cílový match v dalším kole
          const nextIdx = Math.floor(p.idx / 2);
          const next = matchAtPos(p.round + 1, nextIdx);
          const nextX = (p.round + 1) * (matchW + colGap);
          const nextStartY = next.y + matchH / 2;
          const midX = x1 + colGap / 2;
          // Path: vodorovně doprava → svisle (k pozici dalšího matchu) → vodorovně dál
          return (
            <path
              key={`line-${p.round}-${p.idx}`}
              d={`M${x1},${startY} L${midX},${startY} L${midX},${nextStartY} L${nextX},${nextStartY}`}
              stroke="var(--border)"
              strokeWidth={1.5}
              fill="none"
            />
          );
        })}

        {/* Match boxy */}
        {positions.map(p => {
          const x = p.round * (matchW + colGap);
          const isFinal = p.round === rounds.length - 1;
          const isFirstRound = p.round === 0;
          // Slot labels pro první kolo (nasazení skupin → bracket)
          const slot1 = labels?.[p.idx * 2];
          const slot2 = labels?.[p.idx * 2 + 1];
          const hasLabels = isFirstRound && labels && (slot1 || slot2);
          const slot1Bye = slot1 === '—';
          const slot2Bye = slot2 === '—';
          // Pass-through je z position (správná bye distribuce) NEBO z labels
          // (label '—' indikuje bye partner pro daný slot).
          const isPassThrough = p.isPassThrough
            || (hasLabels && (slot1Bye || slot2Bye) && !(slot1Bye && slot2Bye));
          // realMatch = 0 byes (oba sloty mají reálné týmy)
          const isRealMatch = p.isReal && !slot1Bye && !slot2Bye;

          return (
            <g key={`match-${p.round}-${p.idx}`}>
              <rect
                x={x}
                y={p.y}
                width={matchW}
                height={matchH}
                fill={
                  isFinal ? 'var(--primary-light)'
                  : isPassThrough ? 'rgba(245, 158, 11, 0.08)'
                  : isRealMatch ? 'var(--surface-var)'
                  : 'transparent'
                }
                stroke={
                  isFinal ? 'var(--primary)'
                  : isPassThrough ? 'var(--warning)'
                  : 'var(--border)'
                }
                strokeWidth={isFinal ? 1.8 : 1.2}
                strokeDasharray={(!isRealMatch && !isPassThrough && !isFinal) ? '3,3' : 'none'}
                rx={5}
              />
              {/* Finale label — pouze pokud není potlačen (play-out režim) */}
              {isFinal && !noFinaleLabel && (
                <text
                  x={x + matchW / 2}
                  y={p.y + matchH / 2 + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={800}
                  fill="var(--primary)"
                >
                  {finalReplacementLabel ?? 'Finále'}
                </text>
              )}
              {/* První kolo: stacked labels A1 / B2 */}
              {isFirstRound && hasLabels && !isFinal && (() => {
                if (isPassThrough) {
                  // Pass-through (bye): single label centered
                  const realLabel = slot1Bye ? slot2 : slot1;
                  return (
                    <text
                      x={x + matchW / 2}
                      y={p.y + matchH / 2 + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={800}
                      fill="var(--warning)"
                    >
                      {realLabel} <tspan fontSize={9} fontWeight={600}>(bye)</tspan>
                    </text>
                  );
                }
                // Standard: two stacked labels
                return (
                  <>
                    <text
                      x={x + matchW / 2}
                      y={p.y + matchH / 2 - 2}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill="var(--text)"
                    >
                      {slot1}
                    </text>
                    <text
                      x={x + matchW / 2}
                      y={p.y + matchH / 2 + 11}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill="var(--text)"
                    >
                      {slot2}
                    </text>
                  </>
                );
              })()}
              {/* Bye label pro pass-through match bez labels (5+ skupin)
                  Match má 1 reálný tým + 1 bye — zobrazujeme "(bye)" indicator */}
              {p.isPassThrough && !hasLabels && (
                <text
                  x={x + matchW / 2}
                  y={p.y + matchH / 2 + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--warning)"
                  fontStyle="italic"
                  fontWeight={700}
                >
                  bye
                </text>
              )}
              {/* Šipka z finále k trofeji — pouze pokud trofej zobrazujeme */}
              {isFinal && !noTrophy && (() => {
                const fx = x + matchW;
                const fy = p.y + matchH / 2;
                return (
                  <line
                    x1={fx}
                    y1={fy}
                    x2={fx + colGap}
                    y2={fy}
                    stroke="var(--primary)"
                    strokeWidth={1.8}
                  />
                );
              })()}
            </g>
          );
        })}

        {/* Trofej za finále — pouze pokud noTrophy != true (play-out nemá) */}
        {!noTrophy && (() => {
          const tx = totalW - 18;
          const ty = finalPos.y + matchH / 2 + 6;
          return (
            <text x={tx} y={ty} fontSize={20} textAnchor="middle">🏆</text>
          );
        })()}

        {/* 3. místo — direct manipulation v diagramu:
            ON: oranžový box s × button v rohu (klik = odebrat)
            OFF + onSetThirdPlace: dashed placeholder s "+ 🥉" (klik = přidat)
            OFF + read-only: nic (placeholder se nezobrazí) */}
        {thirdPlace && (() => {
          const finalCenterX = finalX + matchW / 2;
          const finalBottomY = finalPos.y + matchH;
          const tpTopY = thirdPlaceY;
          return (
            <g>
              {/* Čárkovaná spojnice z finále dolů k 3. místo boxu */}
              <line
                x1={finalCenterX}
                y1={finalBottomY}
                x2={finalCenterX}
                y2={tpTopY}
                stroke="var(--warning)"
                strokeWidth={1.2}
                strokeDasharray="3,2"
                opacity={0.6}
              />
              <rect
                x={thirdPlaceX}
                y={thirdPlaceY}
                width={matchW}
                height={matchH}
                fill="rgba(245, 158, 11, 0.12)"
                stroke="var(--warning)"
                strokeWidth={1.5}
                rx={5}
              />
              <text
                x={thirdPlaceX + matchW / 2}
                y={thirdPlaceY + matchH / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={800}
                fill="var(--warning)"
              >
                🥉 {thirdPlaceLabel}
              </text>
              {/* × button pro odstranění (stejný pattern jako u skupin) */}
              {onSetThirdPlace && (
                <g
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSetThirdPlace(false)}
                  aria-label="Odebrat zápas o 3. místo"
                >
                  <circle
                    cx={thirdPlaceX + matchW - 2}
                    cy={thirdPlaceY - 2}
                    r={9}
                    fill="var(--surface)"
                    stroke="var(--border)"
                    strokeWidth={1.5}
                  />
                  <text
                    x={thirdPlaceX + matchW - 2}
                    y={thirdPlaceY - 2 + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="var(--text-muted)"
                  >×</text>
                </g>
              )}
            </g>
          );
        })()}

        {/* Placeholder pro přidání 3. místa — jen pokud je toggleable (off stav).
            Stejný pattern jako "+ Skupina" ghost card. */}
        {!thirdPlace && onSetThirdPlace && (
          <g
            style={{ cursor: 'pointer' }}
            onClick={() => onSetThirdPlace(true)}
            aria-label="Přidat zápas o 3. místo"
          >
            <rect
              x={thirdPlaceX}
              y={thirdPlaceY}
              width={matchW}
              height={matchH}
              fill="transparent"
              stroke="var(--warning)"
              strokeWidth={1.5}
              strokeDasharray="4,3"
              opacity={0.55}
              rx={5}
            />
            <text
              x={thirdPlaceX + matchW / 2}
              y={thirdPlaceY + matchH / 2 + 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="var(--warning)"
              opacity={0.7}
            >
              + 🥉 {thirdPlaceLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * Kompletní vizuální schéma turnaje. Reaguje na všechny settings.
 * Direct manipulation: groupCount + advance + 3rd place + play-out se nastavují
 * přímo zde (nebudou potřeba setting řádky pod). User klikne `+ Skupina` ghost
 * card → přidá; klikne × na skupině → smaže; klikne řádek (A1/A2) → změní advance;
 * klikne ghost button "+ 🥉" / "+ ⚔️" → přidá; klikne aktivní 3rd-place box / playout
 * badge → odebere.
 */
function TournamentStructureDiagram({
  format, teamCount, groupSizes, advancePerGroup, thirdPlaceMatch, playOut,
  onSetGroupCount, onSetAdvancePerGroup, onSetThirdPlace, onSetPlayOut,
}: {
  format: TournamentFormat | null;
  teamCount: number;
  groupSizes?: number[];
  advancePerGroup: 1 | 2;
  thirdPlaceMatch: boolean;
  playOut: boolean;
  /** Změnit počet skupin (přidat/ubrat). Undefined = read-only diagram. */
  onSetGroupCount?: (n: number) => void;
  /** Změnit počet postupujících (1 nebo 2). */
  onSetAdvancePerGroup?: (n: 1 | 2) => void;
  /** Toggle zápasu o 3. místo. */
  onSetThirdPlace?: (v: boolean) => void;
  /** Toggle play-out. */
  onSetPlayOut?: (v: boolean) => void;
}) {
  if (!format) return null;

  // Round-robin: jen kruh teček (každý s každým)
  if (format === 'round-robin') {
    const matches = Math.floor((teamCount * (teamCount - 1)) / 2);
    return (
      <div style={{
        padding: 12, borderRadius: 10,
        background: 'var(--surface)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 240 }}>
          {Array.from({ length: teamCount }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--primary)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 9, fontWeight: 800,
              }}
            >
              {String.fromCharCode(65 + i)}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
          Každý hraje s každým<br />
          <b style={{ color: 'var(--text)' }}>{matches} zápasů</b> celkem
        </div>
      </div>
    );
  }

  // Knockout (single elimination): jen bracket stages
  if (format === 'knockout') {
    return (
      <div style={{
        padding: 12, borderRadius: 10,
        background: 'var(--surface)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          🏆 Vyřazovací fáze ({teamCount} týmů)
        </div>
        {/* 3. místo se řeší přímo v bracketu (× / + placeholder) */}
        <BracketTree
          teams={teamCount}
          thirdPlace={thirdPlaceMatch}
          onSetThirdPlace={onSetThirdPlace}
        />
      </div>
    );
  }

  // Groups + Knockout: skupiny vlevo → bracket vpravo
  if (format === 'groups-knockout' && groupSizes && groupSizes.length > 0) {
    const totalAdvance = groupSizes.length * advancePerGroup;
    const bracketLabels = generateBracketLabels(groupSizes.length, advancePerGroup);
    // Maximum počet skupin pro tenhle teamCount (min 2 týmy ve skupině, max 4 skupiny)
    // Max 8 skupin (UEFA Euro = 6, FIFA World Cup classic = 8). Min 2 týmy/skupina.
    const maxGroups = Math.min(8, Math.floor(teamCount / 2));
    const canAddGroup = !!onSetGroupCount && groupSizes.length < maxGroups;
    const canRemoveGroup = !!onSetGroupCount && groupSizes.length > 2;

    // Edge case validation: skupinová fáze je smysluplná, když z každé skupiny
    // alespoň 1 tým KONČÍ (nepostupuje). Když advance >= minGroupSize, znamená
    // to že z nejmenší skupiny postupují všichni — skupina = formalita.
    const minGroupSize = Math.min(...groupSizes);
    const maxGroupSize = Math.max(...groupSizes);
    const everyoneAdvancesFromSmallest = advancePerGroup >= minGroupSize;
    const everyoneAdvancesFromAll = advancePerGroup >= maxGroupSize;

    return (
      <div style={{
        padding: 12, borderRadius: 10,
        background: 'var(--surface)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* Skupinová fáze */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
          }}>
            📋 Skupinová fáze
          </div>
          {/* Skupiny v gridu — max 4 sloupce. Pro 8 skupin = 4+4 (čistý
              symetrický layout místo flex-wrap 5+3 chaosu).
              Pro 2-4 skupiny grid drží přesný počet sloupců; pro 5-8 je 4 cols
              a další řada se naplňuje zleva. Centrované přes justify-content. */}
          <div style={{
            display: 'grid',
            // Počet sloupců = min(4, skupiny + případný "+" button)
            gridTemplateColumns: `repeat(${Math.min(4, groupSizes.length + (canAddGroup ? 1 : 0))}, minmax(56px, auto))`,
            gap: 8,
            justifyContent: 'center',
            paddingTop: canRemoveGroup ? 8 : 0, // místo pro × buttony nahoře
          }}>
            {groupSizes.map((size, idx) => (
              <GroupCard
                key={idx}
                size={size}
                advance={advancePerGroup}
                letter={String.fromCharCode(65 + idx)}
                onRemove={
                  canRemoveGroup
                    ? () => onSetGroupCount!(groupSizes.length - 1)
                    : undefined
                }
                onSetAdvance={onSetAdvancePerGroup}
              />
            ))}
            {/* "+ Skupina" ghost card */}
            {canAddGroup && (
              <button
                type="button"
                onClick={() => onSetGroupCount!(groupSizes.length + 1)}
                aria-label="Přidat skupinu"
                title="Přidat skupinu"
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'transparent',
                  border: '1.5px dashed var(--primary)',
                  color: 'var(--primary)',
                  fontWeight: 800,
                  cursor: 'pointer',
                  minWidth: 56,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, letterSpacing: 0.3 }}>
                  Skupina
                </span>
              </button>
            )}
          </div>
          <div style={{
            fontSize: 10, color: 'var(--text-muted)', marginTop: 8,
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: 'var(--warning)', display: 'inline-block',
            }} />
            postupuje
            <span style={{ marginLeft: 8, marginRight: 4,
              width: 10, height: 10, borderRadius: '50%',
              background: 'var(--surface-var)',
              border: '1.5px solid var(--border)', display: 'inline-block',
            }} />
            končí
            {onSetAdvancePerGroup && (
              <span style={{ marginLeft: 'auto', fontStyle: 'italic', opacity: 0.8 }}>
                💡 klikni na řádek pro změnu postupu
              </span>
            )}
          </div>

          {/* Validační warning: skupinová fáze nemá smysl když všichni postupují */}
          {everyoneAdvancesFromAll && (
            <div style={{
              marginTop: 10,
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(198, 40, 40, 0.08)',
              border: '1px solid var(--danger)',
              fontSize: 11, color: 'var(--danger)', fontWeight: 700,
              lineHeight: 1.4,
            }}>
              ⚠️ Z každé skupiny postupují <b>všichni</b> — skupinová fáze nemá soutěžní smysl.
              Doporučujeme zvolit <b>round-robin</b> nebo přidat skupiny.
            </div>
          )}
          {!everyoneAdvancesFromAll && everyoneAdvancesFromSmallest && (
            <div style={{
              marginTop: 10,
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.10)',
              border: '1px solid var(--warning)',
              fontSize: 11, color: 'var(--warning)', fontWeight: 700,
              lineHeight: 1.4,
            }}>
              ⚠️ Z menších skupin (po {minGroupSize} týmech) postupují všichni — skupina je formalita.
              Zvaž rovnoměrnější rozdělení nebo méně skupin.
            </div>
          )}
        </div>

        {/* Šipka mezi fázemi */}
        <div style={{
          textAlign: 'center', fontSize: 11, color: 'var(--text-muted)',
          fontWeight: 700,
        }}>
          ↓ {totalAdvance} týmů postupuje do pavouka ↓
        </div>

        {/* Vyřazovací fáze */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
          }}>
            🏆 Vyřazovací fáze
          </div>
          <BracketTree
            teams={totalAdvance}
            thirdPlace={thirdPlaceMatch}
            labels={bracketLabels.length > 0 ? bracketLabels : undefined}
            onSetThirdPlace={onSetThirdPlace}
          />
        </div>

        {/* ⚔️ Play-out brackety (zápasy o umístění) — generické pro N skupin.
            Position-based logika: pro každou nepostupující pozici (advance+1, +2, ...)
            hraje stejná pozice ze všech skupin svůj vlastní mini-pavouk.
            Příklad pro 4 skupiny × 2 advance, 4 týmy/skupina:
              Tier 3 (A3, B3, C3, D3) → mini bracket → místa 9-12
              Tier 4 (A4, B4, C4, D4) → mini bracket → místa 13-16
            Pro 2 skupiny (degenerate case): tier má 2 týmy = 1 match.
            NOTE: scheduler (tournament-schedule.ts) zatím generuje skutečné
            zápasy jen pro 2 skupiny. Pro 3+ skupin je zatím jen vizuální preview;
            implementace v scheduler je samostatný TODO task. */}
        {playOut && (() => {
          const groupCount = groupSizes.length;
          const minSize = Math.min(...groupSizes);

          type PlayoutTier = {
            position: number;
            teams: string[];
            placeStart: number;
            placeEnd: number;
          };

          const tiers: PlayoutTier[] = [];
          for (let pos = advancePerGroup + 1; pos <= minSize; pos++) {
            // Sebrat týmy z každé skupiny, která má aspoň `pos` týmů
            const tierTeams: string[] = [];
            for (let g = 0; g < groupCount; g++) {
              if (pos <= groupSizes[g]) {
                tierTeams.push(`${String.fromCharCode(65 + g)}${pos}`);
              }
            }
            if (tierTeams.length < 2) continue; // Potřebujeme aspoň 2 týmy pro match
            // Place range: ((pos-1)*N + 1) až (pos*N)
            const placeStart = (pos - 1) * groupCount + 1;
            const placeEnd = pos * groupCount;
            tiers.push({
              position: pos,
              teams: tierTeams,
              placeStart,
              placeEnd,
            });
          }

          if (tiers.length === 0) return null;

          // Cross-bracket pairing pro libovolný počet týmů (1-3, 2-4 split)
          const tierLabels = (teamLabels: string[]): string[] => {
            const N = teamLabels.length;
            if (N === 2) return [teamLabels[0], teamLabels[1]];
            if (N === 3) return [teamLabels[0], '—', teamLabels[1], teamLabels[2]];
            if (N === 4) return [teamLabels[0], teamLabels[2], teamLabels[1], teamLabels[3]];
            // Fallback: padding na mocninu 2
            const bracketSize = Math.pow(2, Math.ceil(Math.log2(N)));
            return Array.from({ length: bracketSize }, (_, i) => teamLabels[i] ?? '—');
          };

          return (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 800, color: 'var(--warning)',
                textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
              }}>
                ⚔️ Zápasy o umístění (play-out)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {tiers.map((tier, idx) => {
                  const N = tier.teams.length;
                  // Top bracket určuje top 4 místa (s bronze pro 3.+4. tieru).
                  // Pro N >= 5 přidáme consolation bracket pro R1 poražené.
                  const hasBronze = N >= 4;
                  const topPlacesCount = Math.min(N, 4); // Maximum 4 places ranked from top bracket
                  const topPlaceStart = tier.placeStart;
                  const topPlaceEnd = tier.placeStart + topPlacesCount - 1;
                  const consolationCount = Math.max(0, N - 4); // Teams in consolation
                  const consolationPlaceStart = topPlaceEnd + 1;
                  const consolationPlaceEnd = tier.placeEnd;

                  const placeLabel = topPlaceStart === topPlaceEnd
                    ? `O ${topPlaceStart}. místo`
                    : `O ${topPlaceStart}.–${topPlaceEnd}. místo`;

                  // Consolation bracket labels: "P1", "P2", ... = poražený R1.X
                  // Cross-bracket pairing pro consolation (1-3, 2-4 split jako v main)
                  const consolationLabels = (count: number): string[] => {
                    const losers = Array.from({ length: count }, (_, i) => `P${i + 1}`);
                    if (losers.length === 2) return losers;
                    if (losers.length === 4) return [losers[0], losers[2], losers[1], losers[3]];
                    if (losers.length === 3) return [losers[0], '—', losers[1], losers[2]];
                    const bracketSize = Math.pow(2, Math.ceil(Math.log2(count)));
                    return Array.from({ length: bracketSize }, (_, i) => losers[i] ?? '—');
                  };

                  return (
                    <div key={idx} style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                      padding: '10px 12px', borderRadius: 8,
                      background: 'rgba(245, 158, 11, 0.06)',
                      border: '1.5px solid rgba(245, 158, 11, 0.4)',
                    }}>
                      <div style={{
                        fontSize: 11, fontWeight: 800, color: 'var(--warning)',
                        letterSpacing: 0.3, textAlign: 'center',
                      }}>
                        🥇 {placeLabel}
                      </div>
                      <BracketTree
                        teams={N}
                        thirdPlace={hasBronze}
                        labels={tierLabels(tier.teams)}
                        noFinaleLabel
                        noTrophy
                        // Bronze v tieru = top 3rd place tieru
                        // (vítěz bronzu = topPlaceStart+2, poražený = topPlaceStart+3)
                        thirdPlaceLabel={`${topPlaceStart + 2}. místo`}
                      />
                      {/* Consolation bracket pro R1 poražené (jen když N >= 5) */}
                      {consolationCount >= 2 && (
                        <>
                          <div style={{
                            marginTop: 6,
                            fontSize: 10, fontWeight: 800, color: 'var(--text-muted)',
                            letterSpacing: 0.3, textAlign: 'center',
                            textTransform: 'uppercase',
                          }}>
                            ↓ Poražení v 1. kole hrají o {consolationPlaceStart}.{consolationPlaceEnd > consolationPlaceStart ? `–${consolationPlaceEnd}.` : '.'} místo ↓
                          </div>
                          <BracketTree
                            teams={consolationCount}
                            thirdPlace={consolationCount >= 4}
                            labels={consolationLabels(consolationCount)}
                            noFinaleLabel
                            noTrophy
                            // Bronze v consolation = 3. místo consolation tieru
                            thirdPlaceLabel={`${consolationPlaceStart + 2}. místo`}
                          />
                          <div style={{
                            fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic',
                            textAlign: 'center', opacity: 0.8,
                          }}>
                            P1, P2, … = poražení v 1. kole hlavního pavouka
                          </div>
                        </>
                      )}
                      {/* Singleton consolation team — N=5 → 1 R1 poražený automaticky 5. místo */}
                      {consolationCount === 1 && (
                        <div style={{
                          marginTop: 4,
                          fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic',
                          textAlign: 'center', opacity: 0.85,
                        }}>
                          Poražený v 1. kole = automaticky {consolationPlaceStart}. místo
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Scheduler caveat — pro 3+ skupin je to zatím jen visual preview */}
              {groupCount > 2 && (
                <div style={{
                  marginTop: 8,
                  fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic',
                  textAlign: 'center', lineHeight: 1.4,
                }}>
                  ⓘ Pro 3+ skupiny se rozpis play-out zápasů generuje na vyžádání po vytvoření turnaje.
                </div>
              )}
            </div>
          );
        })()}

        {/* Play-out toggle (3. místo je teď přímo v bracketu jako placeholder/×) */}
        {onSetPlayOut && (
          <DirectToggleButton
            active={playOut}
            activeLabel="⚔️ Play-out: poražení dohrají všechna umístění (klikni pro odebrání)"
            inactiveLabel="+ ⚔️ Přidat play-out (zápasy o všechna umístění)"
            onClick={() => onSetPlayOut(!playOut)}
          />
        )}
      </div>
    );
  }

  return null;
}

interface WizardDraft {
  step: WizardStep;
  name: string;
  date: string;
  venue: string;
  /** Začátek turnaje "HH:MM". Default 10:00. */
  startTime: string;
  /** Volitelný plánovaný konec "HH:MM". Když je set, ukáže se warning pokud predikce přesahuje. */
  plannedEndTime: string;
  teamCount: number;
  format: TournamentFormat | null; // null = ještě nevybráno
  teamNames: string[];
  // Časování — viditelné v Step 2
  matchDurationMinutes: number;
  numberOfPitches: number;

  // ── Settings (viditelné jako Settings Preview na Step 3) ──
  /** Pauza mezi zápasy v minutách. Default 5. */
  breakBetweenMatchesMinutes: number;
  /** User override počtu skupin (null = smart heuristika podle teamCount). */
  groupCountOverride: number | null;
  /** Postup z každé skupiny do KO (1 = jen vítěz, 2 = nejlepší 2). Jen pro groups-knockout. */
  advancePerGroup: 1 | 2;
  /** Hraje se zápas o 3. místo? Jen pro groups-knockout / knockout. */
  thirdPlaceMatch: boolean;
  /** Hrají i poražení play-out (consolation)? Jen pro groups-knockout. */
  playOut: boolean;
  /** Online registrace s PIN. */
  registrationEnabled: boolean;
  /** Vstupné v Kč (null = 0). */
  entryFee: number | null;
  /** Vlastní text pravidel. */
  rules: string;
}

function emptyDraft(): WizardDraft {
  return {
    step: 1,
    name: '',
    date: todayStr(),
    venue: '',
    startTime: '10:00',
    plannedEndTime: '',
    teamCount: 4,
    format: null,
    teamNames: ['', '', '', ''],
    matchDurationMinutes: 10,
    numberOfPitches: 1,
    breakBetweenMatchesMinutes: 5,
    groupCountOverride: null,
    advancePerGroup: 2,
    thirdPlaceMatch: false,
    playOut: false,
    registrationEnabled: false,
    entryFee: null,
    rules: '',
  };
}

/** Konvertuje "HH:MM" → minuty od půlnoci. Vrátí null když invalid. */
function parseTimeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return h * 60 + mn;
}

/** Konvertuje minuty od půlnoci → "HH:MM". Wrap-around přes půlnoc je OK (vrací mod 24h). */
function minutesToTimeStr(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const mn = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

/** Spočítá predikovaný konec turnaje ze začátku + estimovaných minut. */
function computeEndTime(startTime: string, durationMin: number): string | null {
  const start = parseTimeToMinutes(startTime);
  if (start === null) return null;
  return minutesToTimeStr(start + durationMin);
}

function loadDraft(): WizardDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardDraft>;
    // Validace — pokud má vyplněné jméno a není starší 24h, je validní draft
    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') return null;
    return { ...emptyDraft(), ...parsed } as WizardDraft;
  } catch {
    return null;
  }
}

function saveDraft(d: WizardDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch { /* ignore quota errors */ }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch { /* ignore */ }
}

// ─── Component ─────────────────────────────────────────────────────────

export function TournamentWizardPage({ navigate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const createTournament = useTournamentStore(s => s.createTournament);
  const allTournaments = useTournamentStore(s => s.tournaments);

  // ── State ──
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  // Resume prompt — zobrazí se jen jednou při mount, pokud je validní draft
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  // Templates — show jen pokud user má >= 1 předchozí turnaj
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  // Vlastní počet týmů — toggle (zobrazí inline number input pro >16 týmů)
  const [showCustomTeamCount, setShowCustomTeamCount] = useState(false);

  // Load draft on mount
  useEffect(() => {
    const existing = loadDraft();
    if (existing) {
      setShowResumePrompt(true);
    }
  }, []);

  // Auto-save draft on every change (debounced via effect)
  useEffect(() => {
    if (draft.name.trim() === '' && draft.step === 1) return; // don't save empty
    const timeout = setTimeout(() => saveDraft(draft), 500);
    return () => clearTimeout(timeout);
  }, [draft]);

  const updateDraft = <K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
    // Clear error on this field
    if (errors[key as string]) setErrors(e => ({ ...e, [key]: undefined }));
  };

  const handleResumeAccept = () => {
    const existing = loadDraft();
    if (existing) setDraft(existing);
    setShowResumePrompt(false);
  };

  const handleResumeDiscard = () => {
    clearDraft();
    setShowResumePrompt(false);
  };

  // ── Smart-suggest format computations ──
  const formatSuggestions = useMemo<FormatSuggestion[]>(
    () => suggestFormats(
      draft.teamCount,
      draft.matchDurationMinutes,
      draft.numberOfPitches,
      draft.breakBetweenMatchesMinutes,
      draft.groupCountOverride,
    ),
    [
      draft.teamCount,
      draft.matchDurationMinutes,
      draft.numberOfPitches,
      draft.breakBetweenMatchesMinutes,
      draft.groupCountOverride,
    ]
  );

  // Auto-select recommended format když user změní počet týmů (pokud nemá vybráno nebo má neplatný)
  useEffect(() => {
    const recommended = formatSuggestions.find(f => f.recommended);
    if (!recommended) return;
    const currentValid = draft.format && formatSuggestions.find(f => f.format === draft.format && f.valid);
    if (!draft.format || !currentValid) {
      setDraft(d => ({ ...d, format: recommended.format }));
    }
  }, [formatSuggestions, draft.format]);

  // ── Templates: posledních 5 turnajů usera, nejnovější první ──
  const templates = useMemo(() => {
    return allTournaments
      .filter(tt => (tt.sport ?? 'football') === preferredSport)
      .slice() // copy
      .sort((a, b) => (b.settings.startDate ?? '').localeCompare(a.settings.startDate ?? ''))
      .slice(0, 5);
  }, [allTournaments, preferredSport]);

  const handleUseTemplate = (templateId: string) => {
    const tpl = allTournaments.find(tt => tt.id === templateId);
    if (!tpl) return;
    setDraft(d => ({
      ...d,
      name: `${tpl.name} (kopie)`,
      teamCount: tpl.teams.length,
      teamNames: tpl.teams.map(team => team.name),
      format: tpl.settings.format ?? 'round-robin',
      venue: tpl.settings.venueName ?? '',
      matchDurationMinutes: tpl.settings.matchDurationMinutes,
      numberOfPitches: tpl.settings.numberOfPitches ?? 1,
      registrationEnabled: !!tpl.settings.registrationEnabled,
      entryFee: tpl.settings.entryFee ?? null,
      rules: tpl.settings.rules ?? '',
    }));
    setShowTemplatePicker(false);
  };

  // ── Team count change — adjust teamNames pole ──
  const handleTeamCountChange = (n: number) => {
    setDraft(d => {
      const next = [...d.teamNames];
      while (next.length < n) next.push('');
      return { ...d, teamCount: n, teamNames: next.slice(0, n) };
    });
  };

  const updateTeamName = (idx: number, val: string) => {
    setDraft(d => ({
      ...d,
      teamNames: d.teamNames.map((nm, i) => (i === idx ? val : nm)),
    }));
  };

  const autoFillTeamNames = () => {
    setDraft(d => ({
      ...d,
      teamNames: d.teamNames.map((nm, i) => nm.trim() || `${t('tournament.wizard.teamFallback')} ${String.fromCharCode(65 + i)}`),
    }));
  };

  // ── Validace per krok (on-submit) ──
  // Step 1: Základy (název povinný, datum/čas/místo volitelné)
  // Step 2: Formát (jen 1 výběr — round-robin/groups-knockout/knockout)
  // Step 3: Detaily (počet týmů + časování — má smart defaults)
  // Step 4: Týmy + dolaďení (jména týmů povinná, settings preview volitelný)
  const validateStep1 = (): boolean => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('tournament.wizard.errorNameRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: typeof errors = {};
    if (!draft.format) e.format = t('tournament.wizard.errorFormatRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = (): boolean => {
    const e: typeof errors = {};
    if (draft.teamCount < 2) e.teamCount = t('tournament.wizard.errorTeamCountMin');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep4 = (): boolean => {
    const e: typeof errors = {};
    const filledNames = draft.teamNames.slice(0, draft.teamCount).filter(n => n.trim());
    if (filledNames.length < draft.teamCount) {
      e.teamNames = t('tournament.wizard.errorTeamNamesIncomplete');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    if (draft.step === 1 && !validateStep1()) return;
    if (draft.step === 2 && !validateStep2()) return;
    if (draft.step === 3 && !validateStep3()) return;
    if (draft.step === 4) return; // submit handled separately
    updateDraft('step', (draft.step + 1) as WizardStep);
    window.scrollTo(0, 0);
  };

  const goBack = () => {
    if (draft.step === 1) {
      navigate({ name: 'tournament-list' });
      return;
    }
    updateDraft('step', (draft.step - 1) as WizardStep);
    window.scrollTo(0, 0);
  };

  // ── Submit (final step) ──
  const handleSubmit = async () => {
    if (!validateStep4()) return;
    if (!user) return;

    // Auto-fill prázdná jména pro robustnost
    const names = draft.teamNames.slice(0, draft.teamCount).map((nm, i) =>
      nm.trim() || `${t('tournament.wizard.teamFallback')} ${String.fromCharCode(65 + i)}`
    );

    setBusy(true);
    try {
      const teams = names.map((nm, i) => ({
        name: nm,
        color: TEAM_COLORS[i % TEAM_COLORS.length],
        players: [],
      }));

      // Admin PIN — random, schovaný (user ho teď nepotřebuje, je v Settings turnaje)
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const pinSalt = generatePinSalt();
      const pinHash = await hashPin(pin, pinSalt);

      // Format-specific settings
      const format = draft.format ?? 'round-robin';

      const tournament = await createTournament({
        name: draft.name.trim(),
        sport: preferredSport === 'tennis'
          ? 'tennis'
          : preferredSport === 'floorball'
            ? 'floorball'
            : 'football',
        teams,
        pinHash,
        pinSalt,
        settings: {
          matchDurationMinutes: draft.matchDurationMinutes,
          breakBetweenMatchesMinutes: draft.breakBetweenMatchesMinutes,
          numberOfPitches: draft.numberOfPitches,
          startDate: draft.date,
          startTime: draft.startTime,
          format,
          // Settings z Settings Preview (user může změnit, default je sensible)
          ...(format === 'groups-knockout' ? { advancePerGroup: draft.advancePerGroup } : {}),
          ...((format === 'groups-knockout' || format === 'knockout') && draft.thirdPlaceMatch
            ? { thirdPlaceMatch: true }
            : {}),
          ...(format === 'groups-knockout' && draft.playOut ? { playOut: true } : {}),
          ...(draft.venue.trim() ? { venueName: draft.venue.trim() } : {}),
          ...(draft.rules.trim() ? { rules: draft.rules.trim() } : {}),
          ...(draft.registrationEnabled ? { registrationEnabled: true } : {}),
          ...(draft.entryFee != null && draft.entryFee > 0 ? { entryFee: draft.entryFee } : {}),
        },
      });

      clearDraft();
      useToastStore.getState().show('success', t('tournament.wizard.createdSuccess'));
      navigate({ name: 'tournament-detail', tournamentId: tournament.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useToastStore.getState().show('error', msg);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ──

  const stepLabel = `${t('tournament.wizard.step')} ${draft.step}/4`;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: '100dvh', background: 'var(--bg)',
    }}>
      {/* Wrapper — center wizard na desktopu, full width na mobilu.
          Sticky CTA je uvnitř, takže respektuje max-width parenta. */}
      <div style={{
        width: '100%', maxWidth: 720, margin: '0 auto',
        flex: 1, display: 'flex', flexDirection: 'column',
      }}>
        <PageHeader
          title={t('tournament.wizard.title')}
          subtitle={stepLabel}
          onBack={goBack}
        />

        {/* Progress bar (4 steps: Základy / Formát / Detaily / Týmy) */}
        <div style={{ padding: '0 16px', display: 'flex', gap: 6, marginBottom: 16 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= draft.step ? 'var(--primary)' : 'var(--border)',
              transition: 'background .3s',
            }} />
          ))}
        </div>

      {/* Resume prompt — toast-like banner */}
      {showResumePrompt && (
        <div style={{
          margin: '0 16px 12px',
          background: 'var(--info-light)',
          border: '1px solid var(--info)',
          borderRadius: 12, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 22 }}>📝</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--info)' }}>
              {t('tournament.wizard.resumeTitle')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('tournament.wizard.resumeHint')}
            </div>
          </div>
          <button
            onClick={handleResumeAccept}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: 'var(--info)', color: '#fff',
              border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t('tournament.wizard.resumeContinue')}
          </button>
          <button
            onClick={handleResumeDiscard}
            aria-label={t('common.dismiss')}
            style={{
              padding: '6px 8px', borderRadius: 8,
              background: 'transparent', color: 'var(--text-muted)',
              border: 'none', fontSize: 14, cursor: 'pointer',
            }}
          >✕</button>
        </div>
      )}

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── KROK 1: Základ ──────────────────────────────────────────────── */}
        {draft.step === 1 && (
          <>
            {/* Templates picker — jen pokud má user předchozí turnaje */}
            {templates.length > 0 && !draft.name.trim() && (
              <FormCard>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <SectionTitle>✨ {t('tournament.wizard.templateTitle')}</SectionTitle>
                  <button
                    type="button"
                    onClick={() => setShowTemplatePicker(o => !o)}
                    style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                    }}
                  >
                    {showTemplatePicker
                      ? t('tournament.wizard.templateHide')
                      : t('tournament.wizard.templateShow')}
                  </button>
                </div>
                {showTemplatePicker && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {templates.map(tpl => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleUseTemplate(tpl.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 10,
                          background: 'var(--surface-var)', border: '1px solid var(--border)',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>🏆</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: 700, fontSize: 13, color: 'var(--text)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {tpl.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {tpl.teams.length} {t('tournament.wizard.templateTeams')} · {tpl.settings.startDate}
                          </div>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>›</span>
                      </button>
                    ))}
                  </div>
                )}
              </FormCard>
            )}

            <FormCard>
              <SectionTitle>{t('tournament.wizard.step1Title')}</SectionTitle>

              <FormField id="tw-name" label={t('tournament.wizard.nameLabel')} required>
                <input
                  id="tw-name"
                  type="text"
                  value={draft.name}
                  onChange={e => updateDraft('name', e.target.value)}
                  placeholder={t('tournament.wizard.namePlaceholder')}
                  style={{
                    ...formInputStyle,
                    borderColor: errors.name ? 'var(--danger)' : (formInputStyle.borderColor as string),
                  }}
                  autoFocus
                  maxLength={60}
                />
              </FormField>
              {errors.name && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: -4 }}>
                  {errors.name}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 100px', minWidth: 100 }}>
                  <FormField id="tw-date" label={t('tournament.wizard.dateLabel')}>
                    <input
                      id="tw-date"
                      type="date"
                      value={draft.date}
                      onChange={e => updateDraft('date', e.target.value)}
                      style={formInputStyle}
                    />
                  </FormField>
                </div>
                <div style={{ flex: '1 1 90px', minWidth: 90 }}>
                  <FormField id="tw-time" label={t('tournament.wizard.timeLabel')}>
                    <input
                      id="tw-time"
                      type="time"
                      value={draft.startTime}
                      onChange={e => updateDraft('startTime', e.target.value)}
                      style={formInputStyle}
                    />
                  </FormField>
                </div>
                <div style={{ flex: '1 1 90px', minWidth: 90 }}>
                  <FormField
                    id="tw-end-time"
                    label={t('tournament.wizard.endTimeLabel')}
                    hint={t('tournament.wizard.endTimeHint')}
                  >
                    <input
                      id="tw-end-time"
                      type="time"
                      value={draft.plannedEndTime}
                      onChange={e => updateDraft('plannedEndTime', e.target.value)}
                      // Audit 2026-04-28: <input type="time"> s prázdnou value
                      // (controlled empty string) nereaguje spolehlivě na klik
                      // na některých prohlížečích — explicit showPicker() to fixne.
                      onClick={(e) => {
                        const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                        try { el.showPicker?.(); } catch { /* fallback: native focus */ }
                      }}
                      style={formInputStyle}
                    />
                  </FormField>
                </div>
              </div>

              <FormField id="tw-venue" label={t('tournament.wizard.venueLabel')}>
                <input
                  id="tw-venue"
                  type="text"
                  value={draft.venue}
                  onChange={e => updateDraft('venue', e.target.value)}
                  placeholder={t('tournament.wizard.venuePlaceholder')}
                  style={formInputStyle}
                />
              </FormField>
            </FormCard>
          </>
        )}

        {/* ── KROK 2: Formát ─────────────────────────────────────────────────
            Hero icon cards (32px emoji + mini bracket diagram). Jeden focused
            choice. Žádný count, žádné inputy — jen výběr "jak se hraje".
            Coach pak v Step 3 řeší kolik týmů a časování. */}
        {draft.step === 2 && (
          <FormCard>
            <SectionTitle>{t('tournament.wizard.step2HowToPlayTitle')}</SectionTitle>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              {t('tournament.wizard.step2HowToPlayHint')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(['round-robin', 'groups-knockout', 'knockout'] as const).map(fmt => {
                const isActive = draft.format === fmt;
                const emoji = fmt === 'round-robin' ? '🔁' : fmt === 'groups-knockout' ? '🏆' : '⚔️';
                const titleKey = fmt === 'round-robin' ? 'roundRobin' : fmt === 'groups-knockout' ? 'groupsKnockout' : 'knockout';
                const teamRangeKey = `tournament.format.${titleKey}.teamRange`;
                const Diagram = fmt === 'round-robin' ? RoundRobinDiagram
                  : fmt === 'groups-knockout' ? GroupsKnockoutDiagram
                  : KnockoutDiagram;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => updateDraft('format', fmt)}
                    style={{
                      position: 'relative',
                      padding: '16px 16px', borderRadius: 16,
                      background: isActive ? 'var(--primary-light)' : 'var(--surface)',
                      border: `2px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 14,
                      transform: isActive ? 'scale(1.01)' : 'none',
                      transition: 'transform .15s, background .15s, border-color .15s',
                    }}
                  >
                    <span style={{ fontSize: 32, flexShrink: 0, lineHeight: 1 }}>{emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 16, fontWeight: 800,
                        color: isActive ? 'var(--primary)' : 'var(--text)',
                        marginBottom: 2,
                      }}>
                        {t(`tournament.format.${titleKey}.title`)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {t(teamRangeKey)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, opacity: 0.85 }}>
                      <Diagram size={56} />
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.format && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
                {errors.format}
              </div>
            )}
          </FormCard>
        )}

        {/* ── KROK 3: Detaily turnaje ─────────────────────────────────────────
            Počet týmů (presets podle formátu) + délka zápasu + počet hřišť.
            Live smart-suggest preview ukazuje X zápasů · ~Y min · skončí ~HH:MM.
            Strukturní volby (postup ze skupiny, 3. místo, play-out) jsou tady
            kontextově — patří k formátu, ne k organizaci. */}
        {draft.step === 3 && (() => {
          // Audit 2026-04-28: počet týmů má být FLEXIBILNÍ — dáváme všechny
          // hodnoty 3-16 jako kompaktní chipy + stepper (-/+) pro fine-tune
          // + "+ Vlastní" pro >16 (až 32). User může mít 7, 9, 11, 13 týmů
          // — předchozí "smart presets per format" bylo moc restriktivní.
          const quickChips: number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
          // Smart-suggest pro vybraný formát (live)
          const currentSuggestion = formatSuggestions.find(f => f.format === draft.format);
          const predictedEnd = currentSuggestion
            ? computeEndTime(draft.startTime, currentSuggestion.estimatedMinutes)
            : null;
          const startMin = parseTimeToMinutes(draft.startTime);
          const plannedEndMin = draft.plannedEndTime ? parseTimeToMinutes(draft.plannedEndTime) : null;
          const overflowMin =
            currentSuggestion && startMin !== null && plannedEndMin !== null
              ? (startMin + currentSuggestion.estimatedMinutes) - plannedEndMin
              : null;
          const exceeds = overflowMin !== null && overflowMin > 0;
          return (
            <>
              <FormCard>
                <SectionTitle>{t('tournament.wizard.step3DetailsTitle')}</SectionTitle>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  {t('tournament.wizard.step3DetailsHint')}
                </p>

                {/* Počet týmů — flexibilní: stepper +/- pro fine-tune,
                    chipy 3-16 jako rychlá volba, "+ Vlastní" pro >16 (až 32). */}
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 10,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {t('tournament.wizard.teamCountLabel')}
                    </div>
                    {/* Stepper +/- */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (draft.teamCount > TEAM_COUNT_MIN) {
                            handleTeamCountChange(draft.teamCount - 1);
                          }
                        }}
                        disabled={draft.teamCount <= TEAM_COUNT_MIN}
                        aria-label="−1"
                        style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: 'var(--surface-var)',
                          border: '1.5px solid var(--border)',
                          fontSize: 18, fontWeight: 700,
                          color: draft.teamCount <= TEAM_COUNT_MIN ? 'var(--text-muted)' : 'var(--text)',
                          cursor: draft.teamCount <= TEAM_COUNT_MIN ? 'not-allowed' : 'pointer',
                          lineHeight: 1, padding: 0,
                        }}
                      >−</button>
                      <span style={{
                        minWidth: 32, textAlign: 'center',
                        fontSize: 18, fontWeight: 800, color: 'var(--primary)',
                      }}>{draft.teamCount}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (draft.teamCount < TEAM_COUNT_MAX) {
                            handleTeamCountChange(draft.teamCount + 1);
                          }
                        }}
                        disabled={draft.teamCount >= TEAM_COUNT_MAX}
                        aria-label="+1"
                        style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: 'var(--surface-var)',
                          border: '1.5px solid var(--border)',
                          fontSize: 18, fontWeight: 700,
                          color: draft.teamCount >= TEAM_COUNT_MAX ? 'var(--text-muted)' : 'var(--text)',
                          cursor: draft.teamCount >= TEAM_COUNT_MAX ? 'not-allowed' : 'pointer',
                          lineHeight: 1, padding: 0,
                        }}
                      >+</button>
                    </div>
                  </div>
                  {/* Kompaktní chipy 3-16 — 7 sloupců × 2 řádky, jasně skenovatelné */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 5,
                  }}>
                    {quickChips.map(n => {
                      const active = draft.teamCount === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setShowCustomTeamCount(false);
                            handleTeamCountChange(n);
                          }}
                          style={{
                            padding: '7px 0',
                            borderRadius: 8,
                            fontSize: 13, fontWeight: 700,
                            background: active ? 'var(--primary)' : 'var(--surface-var)',
                            color: active ? '#fff' : 'var(--text-muted)',
                            border: active ? 'none' : '1px solid var(--border)',
                            cursor: 'pointer',
                          }}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  {/* "+ Vlastní" pro >16 (až 32) */}
                  <button
                    type="button"
                    onClick={() => setShowCustomTeamCount(o => !o)}
                    style={{
                      marginTop: 8,
                      padding: '6px 10px', borderRadius: 8,
                      fontSize: 11, fontWeight: 700,
                      background: showCustomTeamCount ? 'var(--primary-light)' : 'transparent',
                      color: 'var(--primary)',
                      border: '1.5px dashed var(--primary)',
                      cursor: 'pointer',
                    }}
                  >
                    {showCustomTeamCount ? '×' : `+ ${t('tournament.wizard.teamCountCustomShort')} (>16)`}
                  </button>
                  {showCustomTeamCount && (
                    <div style={{
                      marginTop: 10,
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--primary-light)',
                    }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={TEAM_COUNT_MIN}
                        max={TEAM_COUNT_MAX}
                        value={draft.teamCount}
                        onChange={e => {
                          const raw = parseInt(e.target.value, 10);
                          if (Number.isNaN(raw)) return;
                          handleTeamCountChange(Math.max(TEAM_COUNT_MIN, Math.min(TEAM_COUNT_MAX, raw)));
                        }}
                        style={{
                          width: 70, padding: '8px 10px',
                          fontSize: 16, fontWeight: 800, textAlign: 'center',
                          borderRadius: 8, border: '1.5px solid var(--primary)',
                          background: 'var(--surface)', color: 'var(--text)',
                        }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {t('tournament.wizard.teamCountCustomHint', { max: TEAM_COUNT_MAX })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Délka zápasu + počet hřišť (vždy viditelné) */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <FormField id="tw-match-duration" label={t('tournament.wizard.matchDurationLabel')}>
                      <input
                        id="tw-match-duration"
                        type="number"
                        min={1}
                        max={90}
                        value={draft.matchDurationMinutes}
                        onChange={e => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n)) updateDraft('matchDurationMinutes', Math.max(1, Math.min(90, n)));
                        }}
                        style={formInputStyle}
                        inputMode="numeric"
                      />
                    </FormField>
                  </div>
                  <div style={{ flex: 1 }}>
                    <FormField id="tw-pitches" label={t('tournament.wizard.pitchesLabel')}>
                      <input
                        id="tw-pitches"
                        type="number"
                        min={1}
                        max={8}
                        value={draft.numberOfPitches}
                        onChange={e => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n)) updateDraft('numberOfPitches', Math.max(1, Math.min(8, n)));
                        }}
                        style={formInputStyle}
                        inputMode="numeric"
                      />
                    </FormField>
                  </div>
                </div>

                {/* Smart-suggest preview — live recap */}
                {currentSuggestion && currentSuggestion.valid && currentSuggestion.totalMatches > 0 && (
                  <div style={{
                    padding: '12px 14px', borderRadius: 12,
                    background: 'var(--primary-light)',
                    border: '1.5px solid var(--primary)',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                      📊 {currentSuggestion.totalMatches} {t('tournament.wizard.matchesUnit')}
                      {' · '}
                      ⏱ ~{currentSuggestion.estimatedMinutes} {t('tournament.wizard.minutesUnit')}
                      {predictedEnd && (
                        <>
                          {' · '}
                          🏁 {t('tournament.wizard.endsAround')} {predictedEnd}
                        </>
                      )}
                    </div>
                    {currentSuggestion.format === 'groups-knockout' && currentSuggestion.groupSizes && currentSuggestion.groupSizes.length > 0 && (() => {
                      const allSame = currentSuggestion.groupSizes!.every(sz => sz === currentSuggestion.groupSizes![0]);
                      return (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {allSame
                            ? `${currentSuggestion.groupSizes!.length}× ${t('tournament.wizard.groupsLabel')} ${t('tournament.wizard.groupsBy')} ${currentSuggestion.groupSizes![0]}`
                            : `${currentSuggestion.groupSizes!.length} ${t('tournament.wizard.groupsLabel')}: ${currentSuggestion.groupSizes!.join('·')}`}
                        </div>
                      );
                    })()}
                    {exceeds && (
                      <div style={{
                        fontSize: 11, fontWeight: 700,
                        color: 'var(--danger)',
                        background: 'rgba(198, 40, 40, 0.08)',
                        padding: '6px 10px', borderRadius: 8,
                      }}>
                        ⚠️ {t('tournament.wizard.exceedsPlannedEnd', { minutes: overflowMin })}
                      </div>
                    )}
                  </div>
                )}
                {errors.teamCount && (
                  <div style={{ fontSize: 12, color: 'var(--danger)' }}>{errors.teamCount}</div>
                )}
              </FormCard>

              {/* Strukturní volby — kontextově dle formátu.
                  VŠECHNO se nastavuje DIRECT v diagramu:
                  - Skupiny: + Skupina ghost card / × button na kartě
                  - Postup: klik na řádek (A1 = 1 postupuje, A2 = 2 postupují)
                  - 3. místo: ghost button "+ 🥉..." nebo aktivní box
                  - Play-out: ghost button "+ ⚔️..." nebo aktivní badge
                  Žádné setting řádky pod — všechna interakce v diagramu. */}
              {(draft.format === 'groups-knockout' || draft.format === 'knockout') && (
                <FormCard>
                  <SectionTitle>{t('tournament.wizard.step3StructureTitle')}</SectionTitle>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    {t('tournament.wizard.step3StructureHintDirect')}
                  </p>

                  <TournamentStructureDiagram
                    format={draft.format}
                    teamCount={draft.teamCount}
                    groupSizes={currentSuggestion?.groupSizes}
                    advancePerGroup={draft.advancePerGroup}
                    thirdPlaceMatch={draft.thirdPlaceMatch}
                    playOut={draft.playOut}
                    onSetGroupCount={(n) => {
                      // Pokud user pickne defaultní hodnotu pro daný teamCount,
                      // resetuj override na null (clean state).
                      // Heuristika: ceil(teams/4) clamped na [2, 8] — match engine.
                      const maxAllowed = Math.min(8, Math.floor(draft.teamCount / 2));
                      const wouldDefault = Math.max(2, Math.min(8, Math.ceil(draft.teamCount / 4), maxAllowed));
                      updateDraft('groupCountOverride', n === wouldDefault ? null : n);
                    }}
                    onSetAdvancePerGroup={(n) => updateDraft('advancePerGroup', n)}
                    onSetThirdPlace={(v) => updateDraft('thirdPlaceMatch', v)}
                    onSetPlayOut={(v) => updateDraft('playOut', v)}
                  />
                </FormCard>
              )}
            </>
          );
        })()}

        {/* ── KROK 4: Týmy + Doladění ─────────────────────────────────────────
            Jména týmů (s auto-fill) + Settings Preview omezený na organizační
            volby (pauza, registrace, vstupné, pravidla). Strukturní volby
            jsou v Step 3 (logicky tam patří, závisí na formátu). */}
        {draft.step === 4 && (
          <>
            <FormCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionTitle>{t('tournament.wizard.step4TeamNamesTitle')}</SectionTitle>
                <button
                  type="button"
                  onClick={autoFillTeamNames}
                  style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  {t('tournament.wizard.autoFillTeams')}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: draft.teamCount }).map((_, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, alignItems: 'center',
                    background: 'var(--surface-var)', borderRadius: 10, padding: 8,
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 8,
                      background: TEAM_COLORS[i % TEAM_COLORS.length],
                      color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0,
                    }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <input
                      type="text"
                      value={draft.teamNames[i] ?? ''}
                      onChange={e => updateTeamName(i, e.target.value)}
                      placeholder={t('tournament.wizard.teamPlaceholder', { letter: String.fromCharCode(65 + i) })}
                      style={{ ...formInputStyle, padding: '8px 10px', fontSize: 13, flex: 1, minWidth: 0 }}
                    />
                  </div>
                ))}
              </div>
              {errors.teamNames && (
                <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                  {errors.teamNames}
                </div>
              )}
            </FormCard>

            {/* Settings Preview — jen organizační volby (Honza projde očima,
                Petr klikne na to co potřebuje). Strukturní volby v Step 3. */}
            <FormCard>
              <SectionTitle>🎯 {t('tournament.wizard.settingsPreviewTitle')}</SectionTitle>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                {t('tournament.wizard.settingsPreviewHint')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <SettingRow
                  icon="⏱"
                  label={t('tournament.wizard.breakLabel')}
                >
                  <CompactNumberInput
                    value={draft.breakBetweenMatchesMinutes}
                    min={0}
                    max={30}
                    unit="min"
                    onChange={v => updateDraft('breakBetweenMatchesMinutes', v)}
                  />
                </SettingRow>
                <SettingRow
                  icon="🌐"
                  label={t('tournament.wizard.registrationEnabled')}
                >
                  <Toggle
                    checked={draft.registrationEnabled}
                    onChange={v => updateDraft('registrationEnabled', v)}
                  />
                </SettingRow>
                <SettingRow
                  icon="💰"
                  label={t('tournament.wizard.entryFeeLabel')}
                >
                  <CompactNumberInput
                    value={draft.entryFee ?? 0}
                    min={0}
                    max={99999}
                    unit="Kč"
                    onChange={v => updateDraft('entryFee', v > 0 ? v : null)}
                    nullable
                  />
                </SettingRow>
                <SettingRow
                  icon="📜"
                  label={t('tournament.wizard.rulesLabel')}
                  isLast
                >
                  <ExpandableTextEditor
                    value={draft.rules}
                    placeholder={t('tournament.wizard.rulesPlaceholder')}
                    onChange={v => updateDraft('rules', v)}
                    addLabel={t('tournament.wizard.rulesAddLabel')}
                  />
                </SettingRow>
              </div>
            </FormCard>
          </>
        )}
      </div>

        {/* Sticky bottom CTA — `position: sticky` UVNITŘ wizard kontejneru,
            takže respektuje max-width 720px wrapperu (na desktopu se nataží
            jen přes wizard, na mobilu přes celou šířku obrazovky).
            Audit 2026-04-26 (user 2× iter): původně `position: fixed` přes
            celý viewport vypadal rozbitě. Sticky in-flow řeší to čistě.
            `marginTop: auto` strká CTA na konec flex column kontejneru.  */}
        <div style={{
          marginTop: 'auto',
          position: 'sticky', bottom: 0,
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          padding: '12px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          display: 'flex', gap: 10,
          zIndex: 50,
        }}>
          <button
            type="button"
            onClick={goBack}
            aria-label={t('common.back')}
            style={{
              padding: '14px 20px', borderRadius: 12,
              background: 'var(--surface-var)', color: 'var(--text)',
              border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ←
          </button>
          <PrimaryButton
            onClick={draft.step === 4 ? handleSubmit : goNext}
            disabled={busy}
            style={{ flex: 1 }}
          >
            {busy
              ? t('common.loading')
              : draft.step === 4
                ? `⚡ ${t('tournament.wizard.createCta')}`
                : t('tournament.wizard.nextCta')}
          </PrimaryButton>
        </div>
      </div>{/* /wizard wrapper */}
    </div>
  );
}
