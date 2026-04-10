# TORQ Design Audit

> 2026-04-08 — Sustaining mode. Cílem je najít vizuální nekonzistence a sjednotit design slovník **bez redesignu**.

## Shrnutí

Aplikace má jasný design direction (mobile-first, bottom sheets, kulaté rohy, kompaktní cards), ale **vizuální slovník není tokenizovaný**. Konkrétně:

- **Padding, border-radius, fontSize** jsou psané inline na každém místě → 5-10 variant na každý prvek
- **~600 hardcoded barev** (`#C62828`, `#2E7D32`, `#E65100`...) místo CSS variables
- **6-8 různých box-shadow** hodnot bez systému
- **Gap spacing** je chaos 8-16px bez scale

Tohle se opravuje **lightweight tokeny v TypeScriptu** + znovupoužitelné primitivy (`Button`, `Card`, `Field`, `PageHeader`). Žádný redesign, jen extrakce toho, co už v kódu je, do jednoho zdroje pravdy.

---

## Findings

### 1. Buttons

**Primary button — padding inkonsistence** (6 variant):
- `12px 24px` — HomePage.tsx:531 (premium banner)
- `14px 20px` — HomePage.tsx:257
- `12px 20px` — ClubMembersPage.tsx:269
- `13px` — LoginPage.tsx:211, CreateClubModal.tsx
- `12px` — SavedPage.tsx:85
- `10px 20px` — AdminPage.tsx:385

**Border-radius** (4 varianty): 12, 14, 16, 20

**Font-weight:** většinou 700, občas 800 (LoginPage:211)

**Back button (←)** — většinou `36×36, radius: 10, bg: surface-var`, ale některé stránky mají `background: 'none'` (ExerciseLibraryPage, CalendarPage).

**Close button (×)** v modalech: `30×30, radius: 15` (CreateClubModal) vs inline `fontSize: 22` bez box (GoalModal).

**Stepper buttons (±):** konzistentní — `36×36, radius: 10`.

### 2. Inputs

**Canonical style** (ClubForm.tsx:35-46 — bereme jako referenci):
```ts
padding: '10px 12px',
borderRadius: 10,
border: '1.5px solid var(--border)',
background: 'var(--bg)',
fontSize: 14,
fontWeight: 600,
```

**Variace:** LoginPage.tsx používá `padding: '12px 14px', borderRadius: 12`. AdminPage.tsx:527 má `padding: '12px'` shorthand.

### 3. Cards

**Padding:** 14, 16, 20, 22, 24 — bez pravidla.
**Border-radius:** 12 (desktop), 14 (mobile), 16 (modal card), 20 (modal background).
**Box-shadow** (3+ varianty subtle):
- `0 1px 4px rgba(0,0,0,.06)` — nejčastější
- `0 1px 4px rgba(0,0,0,.05)` — SettingsTab
- `0 2px 8px rgba(0,0,0,.08)` — MyClubSection

### 4. Page headers

Pattern: `← back + h1 title + subtitle` — většina stránek dodržuje, ale:

**Title font-size:** 18 (TournamentCreateChoicePage) · 20 (SettingsPage, MatchListPage — majority) · 22 (TrainingHomePage) · 24 (HomePage).

**Subtitle:** 12 nebo 13px.

**Header padding:** `16px 20px` (majority) · `12px 20px` (CalendarPage).

### 5. Modals

3 kategorie, ve všech třech existují nesrovnalosti:

**Bottom sheet** (27+ modalů) — canonical struktura:
```
position: fixed, inset: 0
background: rgba(0,0,0,.5) (overlay)
alignItems: flex-end
→ inner: background: var(--surface)
       borderRadius: '20px 20px 0 0'
       maxWidth: 480
       maxHeight: 85-90dvh
```
Header padding uvnitř sheetu: `20px 16px 32px` (GoalModal) vs `6px 16px 0` (CreateClubModal) vs `24px` (OnboardingModal).

**Centered modal** — jen ConfirmModal (+ dřív CreateClubModal/JoinClubModal, teď už sheet).

**Full-page** — TournamentCreateChoicePage, nově ClubForm s `mode='page'`.

### 6. Hardcoded barvy (TOP 10)

```
147×  #C62828   (červená — delete, danger)
106×  #2E7D32   (zelená — success)
101×  #E65100   (oranžová — premium, planner accent)
 58×  #FFEBEE   (světlé červené bg)
 44×  #FFF3E0   (světlé oranžové bg)
 41×  #E8F5E9   (světlé zelené bg)
 21×  #1565C0   (modrá)
 20×  #FFCDD2
 17×  #FFF8E1
 14×  #F57F17
```

**Celkem 600+ instancí** hardcoded hex barev. Mělo by jít přes CSS variables (`var(--danger)`, `var(--success)`, `var(--warning)` atd.), které už částečně existují.

### 7. Spacing

Top gap hodnoty podle četnosti: `10, 12, 14, 16, 8, 20` — **všechny legitimní krok po 2px**, ale bez scale = chaos. Cíl: omezit na `4, 8, 12, 16, 24`.

---

## 🎯 Top 10 doporučení (high impact / low effort nahoře)

| # | Co | Impact | Effort |
|---|---|---|---|
| 1 | Vytvořit `src/theme/tokens.ts` s `radius`, `spacing`, `fontSize`, `fontWeight`, `shadow` konstantami | 🔴 High | 🟢 Low |
| 2 | Vytvořit primitivy `<Button>`, `<Card>`, `<Field>`, `<PageHeader>` v `src/components/ui/` | 🔴 High | 🟡 Med |
| 3 | Sjednotit primary button padding na `12px 20px`, radius 12 | 🔴 High | 🟢 Low |
| 4 | Sjednotit page title na `fontSize: 20, fontWeight: 800` | 🟡 Med | 🟢 Low |
| 5 | Sjednotit input styling (padding `10px 12px`, radius 10) | 🟡 Med | 🟢 Low |
| 6 | Sjednotit page header `padding: '16px 20px'`, back button 36×36 s bg | 🟡 Med | 🟢 Low |
| 7 | CSS variables pro top barvy (`--danger`, `--success`, `--warning`, `--info`) + jejich light verze | 🟡 Med | 🟡 Med |
| 8 | 3 kanonické box-shadow tokeny (`shadow.sm`, `shadow.md`, `shadow.lg`) | 🟡 Med | 🟢 Low |
| 9 | Sjednotit bottom sheet header (drag handle + title + close) jako sdílená komponenta `<SheetHeader>` | 🟢 Low | 🟡 Med |
| 10 | Gradual refactor existujících stránek na nové primitivy (jedna stránka = jedna session) | 🟢 Low | 🔴 High |

---

## Plán implementace

1. **Fáze 1 — Tokens + primitivy** (tato session): `tokens.ts`, `ui/Button.tsx`, `ui/Card.tsx`, `ui/Field.tsx`, `ui/PageHeader.tsx`.
2. **Fáze 2 — Refactor high-value stránek**: ClubsPage, CreateMatchPage, TournamentCreateChoicePage, TournamentPlannerPage Step1Form, SettingsPage.
3. **Fáze 3 — Barvy** (samostatná session): rozšířit `theme/` CSS variables o sémantické barvy a masová náhrada hex hodnot.
4. **Fáze 4 — Zbytek stránek** (on-demand): HomePage, MatchListPage, TrainingDetailPage a další až při příští úpravě dané stránky.

Cílem není zrefaktorovat 100 % aplikace. Cílem je mít **tokeny + primitivy jako zdroj pravdy**, používat je v novém kódu, a starý kód migrovat postupně, když se ho stejně dotýkáme.
