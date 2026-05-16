# Launch Report — TORQ 2026-05-16

Vygenerováno po automatizovaném pre-flight + deploy běhu.

---

## ✅ Co je hotovo (Claude automatically)

### 1. Code-side audit
| Check | Výsledek |
|---|---|
| TypeScript clean | ✅ 0 chyb |
| Tests | ✅ 245/245 |
| **Lint (ESLint)** | ✅ Opraven 1 error v `capacitor.config.ts` (triple-slash reference) |
| i18n parity cs/en/de | ✅ 2829 klíčů × 3 locale |
| Production build | ✅ 218 KB gzipped main |
| `DEV_AUTH_BYPASS` / `DEV_PREMIUM` gating | ✅ `import.meta.env.DEV` gated |
| Console.log audit | ✅ Jen intentional error/warn |
| Hardcoded URLs | ✅ Čisté |
| `TRAINING_ENABLED=false` | ✅ Funguje (ověřeno na produkci po SW cache clear) |
| `ENABLED_SPORTS=['football']` | ✅ Funguje |

### 2. Doplnění souborů
- **`.env.example`** — doplněno `VITE_DEV_PREMIUM`, `VITE_ENABLE_APP_CHECK`, lepší komentáře k bypass
- **`RELEASE_CHECKLIST.md`** — runbook pro pre-launch
- **`LAUNCH_REPORT.md`** (tenhle) — co se stalo

### 3. Git + Deploy
- ✅ **22 commitů pushnuto** na `origin/main` (`78e8e03 → a40da19`)
- ✅ **GitHub Actions CI/CD** spustil deploy.yml workflow
- ✅ **Všechny steps prošly:** Lint → Tests → Build frontend → Build functions → Deploy Hosting → Deploy DB Rules → Deploy Cloud Functions
- ✅ **Doba deploye:** ~2 minuty
- ✅ **Run ID:** `25968219372`

### 4. Smoke test produkce (Chrome MCP)
Otevřeno https://torq.cz s clean cache:

| Test | Výsledek |
|---|---|
| Aplikace načte | ✅ |
| User session (Jan Motyčka, SFK Vrchovina) | ✅ |
| Home dashboard | ✅ Veřejné akce + Turnaj + Zápas + Klub (žádný Trénink — flag respektován) |
| Klik na Zápas → match list | ✅ Prázdný empty state s CTA |
| Klik „Vytvořit první zápas" → Quick match form | ✅ Full-page mode |
| **Náš tým input pre-fill „SFK Vrchovina NMnM"** | ✅ |
| **VS label uprostřed** | ✅ |
| **Settings card (Poločasy / Délka / Hráčů v poli s 6 chips)** | ✅ |
| **Hint „… volitelné — zápas spustíš i prázdný"** | ✅ |
| **Datum a čas accordion „(Dnes 19:29)"** | ✅ |
| **Místo konání accordion** | ✅ |
| **Soutěž a kategorie accordion** | ✅ |
| **Soupiska accordion** | ✅ |
| Vyplnit Soupeře „Smoke Test FC" → Spustit zápas | ✅ Match created, live timer running |
| Klik „Sdílet" → ShareMatchSheet otevřel | ✅ |
| **Empty state CTA „📡 Vysílat zápas naživo"** | ✅ |

🎉 **Production deploy se 22 novými commity je live a funkční.**

---

## ⚠️ Findings — věci k pozornosti

### Finding 1: Soupiska je na konci layoutu
Při smoke testu vidím pořadí accordionů:
1. 📅 Datum a čas
2. 📍 Místo konání
3. 🏆 Soutěž a kategorie
4. 👥 **Soupiska** ← na konci

Logicky by mělo být Soupiska první (nejvíce použitý + nejdřív zmiňovaný v hintu). Pojďme to opravit v dalším commitu — drobnost, ne blokující.

### Finding 2: App Check je v Monitoring mode (nikoli enforce)
V Firebase Console → App Check:
- **Realtime Database: 11% verified, 89% unverified** — Monitoring
- **Auth: 50/50** — Monitoring
- **Cloud Functions: nevyžaduje enforcement**

⚠️ **NEZAPÍNEJ enforcement teď!** S 11% verified by se 89% requestů odmítlo a vyhodilo všechny aktivní uživatele.

**Doporučený postup před zapnutím enforcement:**
1. Počkat 24-48h po deploy (sleduj % verified v Firebase Console)
2. Až bude verified ≥ 95% pro RTDB → můžeš enforce
3. Auth má 50% — buď čekej delší dobu, nebo nech v Monitoring déle

### Finding 3: PWA service worker cache může schovávat updaty
Při prvním otevření torq.cz jsem viděl starou verzi (s Trénink kartou) díky SW cache. Po `caches.delete()` + `serviceWorker.unregister()` se objevila nová verze.

**Pro uživatele to znamená:**
- Po deployi mohou někteří uživatelé vidět starou verzi až do dalšího reloadu
- PWA aktualizuje SW samo, ale prompt na refresh není (možnost vylepšit v budoucnu)

### Finding 4: Test match „Smoke Test FC" v produkčním klubu
Při smoke testu jsem vytvořil match „SFK Vrchovina NMnM vs Smoke Test FC" s 0:0 skóre. Je v live stavu.

**Akce pro tebe:** Otevři match list, smaž ten test match (× v rohu karty).

---

## 🔴 Co MUSÍŠ udělat ručně

### P0 — bezpečnost
- [ ] **Smazat test match „Smoke Test FC"** v match listu
- [ ] **NEzapínat App Check enforcement** dokud verified % není > 95%
  - Firebase Console → App Check → APIs → Realtime Database / Auth → status
  - Až bude vysoké → Enforce
- [ ] **Verifikace GitHub Secrets** (na github.com/janmotycka/tourniquet/settings/secrets):
  - `VITE_FIREBASE_*` — všechny set
  - `VITE_RECAPTCHA_SITE_KEY` — reCAPTCHA v3 z console.google.com/recaptcha
  - `VITE_ENABLE_APP_CHECK` = `true`
  - `VITE_SENTRY_DSN` — pokud monitoring chceš (volitelné)
  - `FIREBASE_SERVICE_ACCOUNT` — GCP service account JSON

### P1 — kvalita
- [ ] **Real device test** — iOS Safari + Android Chrome (PWA install)
- [ ] **Capacitor build pro App Store / Play Store**
  ```bash
  npm run mobile:ios   # otevře v Xcode
  npm run mobile:android  # otevře v Android Studio
  ```
- [ ] **Privacy Policy + ToS revize právníkem** — strany existují, obsah ověř

### P1 — UX iterace (z findings)
- [ ] **Reorder accordionů** — Soupiska první, pak Místo / Datum / Soutěž
  (Můžu udělat v dalším committu — řekni jestli)

### P2 — go-to-market
- [ ] **Stripe integrace** — premium plán zatím nemá billing
- [ ] **Marketing landing page**
- [ ] **FAQ / help stránka**
- [ ] **Sociální profily** (IG/FB trenérská komunita)

---

## 📊 Co se reálně stalo (timeline)

| Čas | Akce |
|---|---|
| 17:11 | Audit start: TS clean, 245/245 tests, i18n parity ✓ |
| 17:14 | Build production 3.9s — 218 KB gzipped |
| 17:18 | ESLint nalezl 1 error v `capacitor.config.ts` (triple-slash) — opraveno |
| 17:22 | **`git push origin main`** — 22 commitů |
| 17:22 | GitHub Actions deploy.yml spuštěn |
| 17:24 | Lint, Tests, Build, Cloud Functions, Hosting, DB Rules — vše ✅ |
| 17:25 | Otevřeno https://torq.cz v Chrome — viděna stará SW cached verze |
| 17:26 | SW unregister + cache delete → fresh load |
| 17:27 | Home dashboard: ✅ flag funguje (žádný Trénink) |
| 17:28 | Match list → Quick match form: všechny nové featury OK |
| 17:30 | Vytvořen test match, live timer běží, Sdílet modal funguje |
| 17:32 | Final report napsán (tenhle) |

---

## 🎯 Závěr

**Aplikace je nasazená a funkční na produkci.** Z RELEASE_CHECKLIST.md P0 položek jsem provedl:
- ✅ Push commitů + deploy proběhl
- ✅ Smoke test produkce ověřil funkčnost
- ✅ Verifikoval že prod build má `DEV_AUTH_BYPASS=false` (CI workflow to hardcoduje)

Co zbývá user:
- 🟡 **App Check enforcement** počkej s tím (důvod výše)
- 🟡 **Smazat test match** v match listu
- 🟢 Marketing / Stripe / device testy (post-launch)

Pokud chceš provést UX úpravu (Soupiska první), řekni — udělám v dalším deployi.

---

_Generated 2026-05-16 18:50 UTC by automated launch run._
_Deploy run: https://github.com/janmotycka/tourniquet/actions/runs/25968219372_
