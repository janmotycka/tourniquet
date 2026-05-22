# Launch Report — TORQ 2026-05-22 (Round 4)

Sentry verifikace + Soupiska reorder + cleanup local helpers.

---

## ✅ Round 1 — 2026-05-16
- 22 commitů pushnuto, CI deploy úspěšný
- Smoke test produkce — všechny featury fungují

## ✅ Round 2 — 2026-05-17
- 5 UX zlepšení implementovaných z 3 paralelních UX agentů
- Náš tým ikona, delete bubble, Sdílet spotlight, squad opt-in, Simple form

## ✅ Round 3 — 2026-05-22 ráno
- CI build fix (Tournament.format → Tournament.settings.format)
- App Check verified % audit: 11% → 91% (RTDB)

## ✅ Round 4 — 2026-05-22 odpoledne (tato session)

### Sentry audit
- ✅ Přihlášení do Sentry dashboard
- **1 error, 6 dní zpět, 0 affected users 30d** — „Maximum update depth exceeded"
- Handled: true (error boundary catch)
- Non-blocking, předpokládaný source: `HomePage.tsx:74` (lint warning už identifikovaný)
- Bez source mapy — nelze identifikovat přesné místo, ale low priority

### Test data cleanup
- Match list je prázdný (žádné test matches v produkci)
- Archive obsahuje 2 reálné turnaje (Vrchovina CUP U9 obě verze)
- **Nic ke smazání** ✅

### Soupiska reorder → první pozice
- Player editor blok přesunut z konce layoutu na první pozici po Hintu
- Soupiska sedí MIMO `(!isSimpleMode || showAdvancedDetails)` wrapper
  → vždy viditelná pro všechny módy
- Build fix: original script error u JSX boundary — opraveno, build OK

### Cleanup
- 2 nechtěné local soubory smazány z repo:
  - `test_connection.py` (Claude Code helper)
  - `TORQ-WEB-2 - Error.eml` (Sentry export, 30 KB)
- `.gitignore` updated pro `*.eml` + `test_connection.py`

### Validace
- ✅ TS clean, full `npm run build` pass (replicates CI)
- ✅ 245/245 tests
- ✅ CI deploy 2× úspěšný (commits bb16fbe + 47992dd)
- ✅ Smoke test produkce: layout správný, vše funguje

---

## 🎯 Aktuální produkční stav

| | |
|---|---|
| Branch `main` | `47992dd` |
| Live URL | https://torq.cz |
| Posledních deployů | 4 (vše success) |
| Tests | 245/245 |
| TypeScript | Clean |
| Lint | 0 errors |
| Console errors v produkci | 0 |
| Sentry errors (30d) | 1 (handled, 0 users affected) |
| App Check | Monitoring, 91% verified |

---

## ⏳ Co zbývá

### 🟢 Beta launch ready
**Aplikace je v solidním produkčním stavu.**

- Pošli odkaz `torq.cz` 3-5 trenérům
- 3-7 dní sběru feedback
- Pak iterace podle reálných problémů

### 🟡 Monitoring
- App Check % v Firebase Console (cíl 95%+ pro enforce)
- Sentry dashboard pro nové errors

### 🔵 Nedoporučeno automaticky
- Hex literály → CSS tokens (audit-heavy)
- htmlFor/id label pairing (a11y audit)
- Walkover one-tap (UX flow rozhodnutí)
- Manual seed override (UX design)
- Stripe integrace (business rozhodnutí)
- Privacy/ToS revize právníkem
- Marketing landing page
- Real device test iOS + Android

---

## 📊 Statistika celkem (Round 1-4)

- Commitů na produkci: ~35
- UX agent audits: 3
- UX zlepšení: 7+ (5 UI + 1 reorder + 1 print label)
- Smoke testů: 4
- Pre-flight audity: 3
- i18n klíčů: 2835 napříč cs/en/de

---

## 🚀 Doporučený další krok

**Pusť beta s 3-5 trenéry.** Aplikace má vše co potřebuje. Další iterace musí být řízené reálnou zpětnou vazbou, ne našimi domněnkami.

---

_Generated 2026-05-22 by automated launch run (Round 4)._
_Latest deploy: https://github.com/janmotycka/tourniquet/actions/runs/26280768911_
