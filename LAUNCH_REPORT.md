# Launch Report — TORQ 2026-05-17 (Round 2)

Aktualizace po implementaci 5 UX findings ze 3 paralelních UX agentů.

---

## ✅ Round 1 (předchozí session)

- Lint fix (`capacitor.config.ts`)
- 22 commitů pushnuto, CI deploy úspěšný (run 25968219372)
- Smoke test produkce — všechny featury fungují
- App Check audit — **NEZAPÍNAT enforcement** (11% verified, 89% by se odmítlo)
- Test match „Smoke Test FC" vytvořen v produkci
- Reorder Soupiska → selhal (CI ESLint parsing error), reverted

## ✅ Round 2 (tato session)

### 3 paralelní UX agents — feedback získán
- Agent 1 (Petr laik): ✅ ANO, ale Quick form přeplácaný v Simple módu
- Agent 2 (Honza power user): ⚠️ MAYBE pro real víkendový turnaj
- Agent 3 (UX/design system): 📋 Launch-able po P0 fix

### 5 UX zlepšení implementovaných (commit `6a46ece`)

1. **Náš tým ikona 🏠 → 👥** — domek koliduje s home/away konceptem
2. **Delete bubble na match cardu** zvětšen z 26→32px + odsunut od live indicator
3. **Onboarding spotlight pro Sdílet button** — tooltip + glow ring animace, zobrazí se 1×
4. **Auto-pre-pick squad → opt-in banner** — eliminuje stealth behavior, user má control
5. **Simple mode Quick form zjednodušen** — Datum/Místo/Soutěž schované za „▼ Více možností" (P0 fix)

### i18n
- 6 nových klíčů cs/en/de — všechny v parity (2829 → 2835)

### Validace
- TS clean ✅
- Lint 0 errors ✅ (1 unrelated warning)
- 245/245 tests ✅
- Production build OK

---

## ⏳ Co zbývá (nedoporučeno automaticky)

### Vyžadují user input nebo větší refactor
- **Reorder Soupiska → první** — script-based přesun selhal, manuální Edit je risky kvůli velikosti bloku (~270 řádků). Doporučení: dedikovaná session.
- **Hex literály → CSS tokens** v public views — vyžaduje audit ~30 míst, ovlivní dark mode
- **htmlFor/id label-input pairing** napříč form pages — audit-heavy
- **Walkover one-tap** pro tournament — UX flow rozhodnutí potřeba
- **Bracket spojnice** v live view — port SVG z wizardu (design)
- **Manual seed override** ve wizardu — UX design potřeba

### Vyžadují user / 3rd party
- **App Check enforcement** — počkej 24-48h, sleduj verified % v Firebase Console
- **Privacy Policy / ToS revize** právníkem
- **Stripe integrace** pro premium plán
- **Real device test** iOS + Android
- **Marketing landing page**

---

## 📊 Aktuální stav produkce

| | |
|---|---|
| Branch `main` | `6a46ece` (po deploy) |
| Commitů přidaných celkem | 28 (od poslední Round 1 push) |
| Production deploy | ⏳ Running |
| Tests | 245/245 |
| TypeScript | Clean |
| Lint | 0 errors |
| Build | OK |

---

## 🎯 Doporučený další krok (po deploy)

1. **Smoke test produkce po deploy** — Chrome MCP nebo manuálně
2. **Beta release** mezi 3-5 trenéry
3. **Sběr feedbacku** po 1 týdnu
4. **Iterace P1 podle priorit** z UX_FEEDBACK_REPORT.md

---

_Generated 2026-05-17 by automated launch run + 3 UX agent audit._
_Latest deploy: https://github.com/janmotycka/tourniquet/actions_
