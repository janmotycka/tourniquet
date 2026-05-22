# Launch Report — TORQ 2026-05-22 (Round 3)

Verifikace produkce po posledních deployech + App Check monitoring update.

---

## ✅ Round 1 — 2026-05-16
- 22 commitů pushnuto, CI deploy úspěšný
- Smoke test produkce — všechny featury fungují
- Test match „Smoke Test FC" vytvořen v produkci

## ✅ Round 2 — 2026-05-17
- 5 UX zlepšení implementovaných z 3 paralelních UX agentů
- Náš tým ikona, delete bubble enlarge, Sdílet spotlight, squad opt-in, Simple form
- i18n parity 2829 → 2835 klíčů

## ✅ Round 3 — 2026-05-22 (tato session)

### Fix produkce
- **CI build error opraven** — `Tournament.format` → `Tournament.settings.format` (s fallback `?? 'round-robin'`)
- Předchozí commit (8bff185) selhal v CI (`tsc -b` přísnější než `tsc --noEmit`)
- Oprava (23d3fcf) → CI success

### Smoke test produkce (Chrome MCP)
| Test | Výsledek |
|---|---|
| torq.cz load | ✅ |
| Home dashboard | ✅ (po SW cache clear) |
| Turnaj listing → Archive | ✅ |
| Detail turnaje "Vrchovina CUP U9 (3+1)" | ✅ |
| Tabulka / Střelci / Nastavení tabs | ✅ |
| Console errors | ✅ 0 errors / warnings z app |

### Monitoring update — App Check
**Výrazné zlepšení verified %:**

| API | 5 dní zpět | Teď | Cíl pro enforcement |
|---|---|---|---|
| Realtime Database | 11% | **91%** | 95%+ |
| Authentication | 50% | **90%** | 95%+ |

**Doporučení:** počkat ještě 2-3 dny pro 95%+, pak enforce.

---

## 🎯 Aktuální produkční stav

| | |
|---|---|
| Branch `main` | `23d3fcf` |
| Live URL | https://torq.cz |
| Last successful deploy | 2026-05-22 09:19 UTC (run 26279431483) |
| Tests | 245/245 |
| TypeScript | Clean |
| Lint | 0 errors |
| Build | OK |
| Console errors v produkci | 0 |
| App Check | Monitoring mode, 91% verified |
| Sentry | Configured (DSN active, user-only dashboard) |

---

## ⏳ Co zbývá (doporučení podle priority)

### 🟢 Beta launch ready
**App je v produkčním stavu, doporučuju spustit beta:**
- Pošli odkaz `torq.cz` 3-5 trenérům
- 3-7 dní sběru feedback
- Pak iterace podle reálných problémů

### 🟡 Sledovat (24-48h)
- **App Check verified %** v Firebase Console — cílíme 95%+
- **Sentry errors** dashboard — žádné nové crashes po deployi
- **PWA SW update** — uživatelé na starou cached verzi se časem updatují

### 🔵 Nedoporučeno automaticky (vyžaduje user input)
- Reorder Soupiska → první (script-based přesun selhal, manuální Edit risky)
- Hex literály → CSS tokens (audit-heavy)
- htmlFor/id label-input pairing (audit-heavy)
- Walkover one-tap (UX flow rozhodnutí)
- Manual seed override (UX design)
- Stripe integrace (business rozhodnutí)
- Privacy Policy / ToS právník
- Marketing landing page

### ⚠️ Risk-aware
- **App Check enforcement** — počkat na 95%+, jinak vyhodí legitimní uživatele
- **Real device test** — bez fyzického zařízení nemůžu udělat

---

## 📊 Statistika 3 rounds celkem

- Commitů pushnuto na produkci: ~30
- UX agent reports: 3
- UX zlepšení implementovaných: 5+
- Smoke testů: 3 (po každém Round)
- Pre-flight audity: 3
- i18n klíčů celkem: 2835 (cs/en/de)
- Tests: 245/245 napříč všemi rounds

---

## 🚀 Doporučený další krok

**Beta launch s 3-5 trenéry.**

Aplikace je technicky připravená. Další iterace už mají být řízené reálnou zpětnou vazbou, ne našimi domněnkami. Po týdnu beta zpětné vazby → priorita 2-3 nejbolavějších problémů → cílená oprava.

---

_Generated 2026-05-22 by automated launch run + Chrome MCP verification._
_Latest deploy: https://github.com/janmotycka/tourniquet/actions/runs/26279431483_
