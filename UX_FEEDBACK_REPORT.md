# TORQ UX Feedback Report — 3 Agent Audit

**Datum:** 2026-05-17
**Metoda:** 3 paralelní AI agenti, každý s jinou personou + scope, code-only review (žádné Chrome MCP).

---

## 👤 Agent 1: Petr Novák (38, učitel TV, McDonald's Cup)

**Persona:** Laik, Simple mode, vytváří Quick match pro turnaj 5 zápasů za dopoledne.

**Verdikt:** ✅ **ANO, ale s caveatem**

### Co funguje skvěle
- Onboarding rozpozná Simple mode laika a přeskočí klub setup
- **Sticky obří gólová tlačítka** v Live tabu — trefíš palcem naslepo
- Quick-tap gól + 8s okno pro výběr střelce = perfektní pro rychlé góly
- Wake lock + landscape scoreboard
- Auto-enable public sharing v Simple módu

### Problémy (priority)
- 🔴 **Quick formulář je v Simple módu PŘELOŽENÝ — 6+ collapsibles**. Promise „rychlý zápas bez setupu" + hint „spustíš i prázdný" → ale form má Náš tým / Soupiska / Místo / Datum / Soutěž / Squad save. Měl by zůstat **jen Soupeř + Spustit** v Simple, ostatní za „Více možností".
- 🟡 **Auto-pre-pick squady = stealth behavior** — bez upozornění naplní hráče z minulého zápasu. User si může myslet, že je to bug a smaže to.
- 🟡 **„Místo konání" default = doma** — McDonald's Cup je často venku, ale sbalený accordion to skryje. Skóre se uloží jako „Doma 0:0" což pro turnaj nedává smysl.
- 🟡 **Sdílení rodičům** — žádný onboarding spotlight na `Sdílet` button v PageHeader. User musí hledat.
- 🟢 **„🏠 Náš tým" ikona** — domek koliduje s home/away konceptem. Lépe `👥` nebo `⚽`.

---

## 🏆 Agent 2: Honza Skalník (45, klubový trenér U12, 8-team turnaj víkend)

**Persona:** Power user, Advanced mode, organizuje real víkendový turnaj.

**Verdikt:** ⚠️ **MAYBE — pro friendly turnaj ANO, pro real víkendový McDonald's Cup MAYBE/NO bez manual seed UI a walkover flow**

### Co funguje skvěle
- **Direct manipulation v Step 3 wizardu** — klikni A1/A2 a vidíš bracket okamžitě
- **Cross-bracket seeding** je správně implementovaný (FIFA/UEFA standard)
- Sticky bottom CTA s progress barem 4/4 + draft autosave
- Live spectator banner + WhatsApp/copy share
- Co-owner invite link s PIN
- Penalty rozstřel modal (sudden death detekce, undo, vizualizace)

### Problémy (priority)
- 🔴 **Žádný „Vlastní" seeding override** — `generateBracketLabels` je čistě algoritmický. Power-user nemůže říct „Sparta nasaď do opačné půlky než SK Brno".
- 🔴 **Cross-bracket pairing není vysvětlený v UI** — uživatel vidí `A1/B2` ale neví proč, chybí tooltip s vysvětlením.
- 🔴 **Bye matches v live view jen jako „TBD"** — wizard má oranžový dashed box „(bye)", ale `BracketView` to ztrácí.
- 🔴 **Tým nedorazí / walkover** — žádný 1-tap flow. Musíš přes ScoreModal ručně 3:0.
- 🔴 **„Zrušit zápas" za reorderLocked toggle** — skrytá funkce.
- 🔴 **`BracketView` je vertikální stage-by-stage** — chybí klasický horizontální pavouk se spojnicemi. Wizard má pěkný SVG pavouk, ale **ne v live/public view**.
- 🟡 **Defaulty pro Step 1 jsou prázdné** — `numberOfPitches: 1` by mělo být `2` pro 8+ týmů.
- 🟡 **„Next match for team X" highlight** chybí v public default tabu.
- 🟡 **Per-match time edit** — `scheduledTime` jednotlivého zápasu nelze editovat (jen reorder).

### Top 3 chybějící pro produkci
1. **Walkover / no-show handling** — 100% reálný case. 1-tap „nepřišli" → 3:0 walkover + standings + bracket advance.
2. **Manual seed override** v Step 3 — drag & drop A1/B1/C1/D1 → cross-bracket sloty.
3. **Live PDF/print s aktuálním stavem** — pro nástěnku u hřiště, papír is king.

---

## 🎨 Agent 3: UX/Design System Reviewer

**Persona:** Senior design system auditor — konzistence, mobile-first, accessibility.

**Verdikt:** 📋 **Launch-able po MUST FIX, plně production-grade po LATER blocku**

### Co funguje skvěle
- Robustní theme layer (`index.css`, `tokens.ts`) — semantic colors, dark mode parity
- Konsolidované UI primitivy (`PageHeader`, `Button`, `BottomSheet`, `Card`, `Field`, `SettingsPreview`)
- Focus-visible ring globálně (WCAG 2.4.7)
- Empty states + skeletons + Suspense lazy routing (žádný white-flash)

### Problémy (priority)
- 🔴 **QuickMatchSheet ignoruje design system** — 1500+ řádků s lokálními `labelStyle`/`inputStyle` místo `Field`/`Input` primitive. Re-implementuje vlastní bottom-sheet místo `BottomSheet`.
- 🔴 **Duplicitní modal patterns** — `QuickMatchSheet`, `ClubImportModal`, `TournamentListPage joinModal` všechny custom místo `BottomSheet`.
- 🟡 **Header pattern nekonzistentní** — `MatchListPage` wrapuje `PageHeader` extra divem s custom buttony místo `Button`. Tlačítka mají různé radiusy (10/12/14).
- 🟡 **Hard-coded hex literály** — `#fff`, `#25D366` (WhatsApp), `#43A047`, `#FF5252` napříč MatchPublicView/Detail. **Dark mode bude rozbitý na public stránkách.**
- 🟡 **Inline `<style>` keyframes injekce** — `@keyframes pulse` definováno 3× se stejným jménem, re-injekce při každém re-renderu.
- 🟢 Status badges mají vlastní getter funkce s jiným tvarem — `<StatusBadge>` komponenta by sjednotila.
- 🟢 Border-radius drift — tokens říkají sm:8/md:10/lg:12/xl:14/xxl:20, ale v kódu se valí 6, 7, 13, 5.

### Mobile-first risiky (360px iPhone SE)
- **QuickMatchSheet add-player row** — 3 inputy + 8px gaps = name input < 200px, oříznutý placeholder. Padding 6×2 = tap target 32px (pod doporučených 44).
- **Delete bubble** na match cardu — 26×26px (pod 44), překrývá borderLeft live indicator. Lze omylem smazat při swipe gestu.
- **Filter chips** 5px padding — height ~26px, velmi malé.

### Accessibility top 5
1. **`<label>` bez `htmlFor` + `<input>` bez `id`** napříč modaly — screen reader čte „edit text" bez kontextu.
2. **`<img src={qr} alt="QR" />`** — pro screen reader QR sám nedává info. Měl by být `alt={t('matchShare.qrCodeFor', {opponent})}`.
3. **Toggle switch v `SettingsPreview`** má `role="switch"` ale chybí `aria-labelledby` na row label.
4. **Kontrast `--text-disabled` (#9CA3AF)** na surface = 2.9:1, pod WCAG AA 4.5:1.
5. **MatchListPage „Stats" button** má `title` ale chybí `aria-label`.

### MUST FIX před public launch
1. Sjednotit hard-coded `#fff` + WhatsApp green + green-success hex literály na CSS tokens (~30 míst v MatchPublicView/Detail/List)
2. Přidat `htmlFor`/`id` pairing na inputs v join-modal a všech form pages
3. Zvětšit delete bubble na 32×32 + odsunout od live indicator
4. QuickMatchSheet add-player row pod 380px stack vertical nebo 8px padding (44 target)

### LATER (post-launch)
- Refactor QuickMatchSheet 1500-line file → AccordionRow primitive, migrate to BottomSheet, replace local styles s Field/Input
- `<StatusBadge>` + `<FilterPill>` shared primitives
- Focus-trap v BottomSheet
- Sjednotit border-radius drift
- Přesunout `@keyframes` z inline style do `index.css`

---

## 🎯 Konsolidovaný „MUST FIX" před public launch

### P0 (BLOKUJE — opravit hned)
- [ ] **Quick match v Simple módu zjednodušit** (Agent 1 #1) — schovat collapsibles za „Více možností" když `appMode === 'simple'`
- [ ] **Hard-coded hex literály → CSS tokens** (Agent 3 #1) — public view dark mode broken
- [ ] **htmlFor/id label-input pairing** (Agent 3 a11y #1) — WCAG baseline

### P1 (zhoršuje UX, ne blokuje)
- [ ] **Walkover one-tap** pro tournament (Agent 2 #1)
- [ ] **Onboarding spotlight** na Sdílet button po prvním Quick match (Agent 1 #4)
- [ ] **Bracket spojnice ve `BracketView`** — port SVG z wizardu (Agent 2 #2)
- [ ] **Auto-pre-pick squady** opt-in banner místo silent fill (Agent 1 #2)
- [ ] **Delete bubble** na match cardu zvětšit + odsunout (Agent 3 mobile)
- [ ] **Cross-bracket seeding tooltip** s vysvětlením (Agent 2 #2)

### P2 (nice-to-have post-launch)
- [ ] Manual seed override v Step 3 wizardu (Agent 2 #1)
- [ ] Per-match scheduledTime edit (Agent 2)
- [ ] „Next match for team X" highlight v public default tabu (Agent 2)
- [ ] Live PDF print pro nástěnku (Agent 2)
- [ ] QuickMatchSheet refactor → použít design system primitives (Agent 3)
- [ ] `<StatusBadge>` + `<FilterPill>` shared (Agent 3)
- [ ] Focus-trap v BottomSheet (Agent 3)
- [ ] Border-radius drift cleanup (Agent 3)

---

## 📊 Verdikty agentů

| Agent | Persona | Verdikt |
|---|---|---|
| 1 | Petr (laik) | ✅ ANO (s caveat — Quick form je přeplácaný v Simple) |
| 2 | Honza (power user) | ⚠️ MAYBE pro real víkendový turnaj |
| 3 | UX reviewer | 📋 Launch-able po P0 fix, full-grade po LATER |

## 🚀 Doporučení

**Můžeš spustit jako beta** pro **3-5 trenérů** s těmito caveats:
- Pro Simple mode users: app je usable ale Quick form je přeplácaný (P0.1)
- Pro Tournament organizers: app je usable pro friendly turnaje, **ne pro fairness-critical** víkendové turnaje bez P1 walkover + bracket spojnice
- Pro public sharing rodičům: nemusí fungovat dark mode dobře (P0.2)

**Doporučený scope public launch v1.0:**
- Zacíli na **Simple mode users** (Petr-persona) — McDonald's Cup, plácek, friendly
- Tournament module nech k dispozici, ale **marketing focus na zápasy + sdílení rodičům**
- Po feedback od prvních 10 trenérů → iterovat P1+P2 podle priorit

---

_Generated 2026-05-17 by 3 paralelních UX agentů. Detailní reporty každého agenta jsou v session transcript._
