# Pre-Release Checklist

Stav: **2026-05-06**, branch `main` ahead of origin by 20 lokálních commitů.

---

## 🟢 Code-side audity (provedeno automaticky)

| Check | Status | Poznámka |
|---|---|---|
| TypeScript clean | ✅ | `npx tsc --noEmit` — 0 chyb |
| Tests | ✅ | 245/245 testů, 15 test files |
| i18n parity (cs/en/de) | ✅ | 2829 klíčů v každém locale, žádný odchylky |
| Production build | ✅ | 3.9s, 218 KB gzipped main, 3.7 MB total precache |
| `DEV_AUTH_BYPASS` gating | ✅ | Production build ignoruje (`import.meta.env.DEV === false`) |
| `DEV_PREMIUM` gating | ✅ | Stejně gated |
| Console.log audit | ✅ | Jen intentional error/warn pro debugging |
| Hardcoded localhost | ✅ | Jen v dev-bypass user email (gated) |
| `.env.example` kompletní | ✅ | Doplněno `VITE_DEV_PREMIUM` + `VITE_ENABLE_APP_CHECK` |
| Pre-release feature flags | ✅ | `TRAINING_ENABLED=false`, `ENABLED_SPORTS=['football']` |
| TODO/FIXME markers | ✅ | 3 non-blocking (logo loading, propozice PDF, scheduler comment) |

---

## 🔴 Před spuštěním (musíš udělat ručně)

### P0 — bezpečnost / deploy
- [ ] **Pushni 20 lokálních commitů** na `origin/main`
  ```bash
  git push origin main
  ```
- [ ] **Ověř produkční env** (Firebase Hosting / Vercel / wherever):
  - `VITE_DEV_AUTH_BYPASS` NENÍ nastaveno nebo je `false`
  - `VITE_DEV_PREMIUM` NENÍ nastaveno
  - `VITE_ENABLE_APP_CHECK=true`
  - `VITE_RECAPTCHA_SITE_KEY` má reálný reCAPTCHA v3 site key
- [ ] **App Check enforcement v Firebase Console**
  - App Check → APIs → Cloud Functions → Enforce
  - App Check → APIs → Realtime Database → Enforce
- [ ] **Smoke test na produkci**
  1. Otevři https://torq.cz v incognito (žádný cache)
  2. Přihlas se Googlem
  3. Vytvoř klub (musí projít, ne 401)
  4. Vytvoř turnaj 8 týmů + odehraj
  5. Vytvoř Quick match → spustit → gól → ukončit
  6. Otevři Sdílet → ověř že QR + odkaz funguje (otevři na druhém zařízení)

### P1 — testování (24h před public)
- [ ] **Real device test**
  - [ ] iOS Safari (PWA install + offline mode)
  - [ ] Android Chrome (PWA install)
  - [ ] Capacitor iOS build (`npx cap open ios` → archive)
  - [ ] Capacitor Android build (`npx cap open android` → build APK)
- [ ] **Slow 3G test** — Chrome DevTools throttling → check feedback during load
- [ ] **Firefox + Edge** — major flow walkthrough

### P1 — legal (právník)
- [ ] Privacy Policy revize (zejména: data retention, third parties — Firebase + Sentry, GDPR-compliance)
- [ ] Terms of Service revize
- [ ] Cookie consent banner — pokud používáš Google Analytics nebo non-essential tracking
- [ ] Email pro `account deletion request` — funkční mailbox (v i18n je info@torq.cz nebo podobné)

### P2 — go-to-market
- [ ] Stripe integrace pro premium plán (zatím všichni free)
- [ ] Marketing landing page (`torq.cz` root nebo separátní subdoména)
- [ ] FAQ / help stránka
- [ ] Sociální profily (Instagram trenérská komunita)
- [ ] Tisková zpráva / spuštění mezi 3–5 trenéry pro feedback

---

## 🎯 Doporučený plán pro public beta

| Den | Akce |
|---|---|
| **Po – Út** | P0 (push + App Check + smoke test) |
| **St** | Real device + Capacitor builds |
| **Čt** | Stripe MVP NEBO „premium brzy, sběr emailů" |
| **Pá** | Legal revize → deploy |
| **So – Ne** | Beta s 3–5 trenéry (mlčící skupina, sběr feedback) |
| **Pondělí týden 2** | Public spuštění |

---

## 📦 Co lze odložit post-launch

- **Etapa 2/3 Quick + Full match sjednocení** — funguje dvojkolejně, refactor bezpečně po validaci
- **Sdílení match přes deep linking** v iOS/Android apps
- **Stripe billing flow** — pokud spustíš free-only
- **Analytics events** (Mixpanel / Plausible)
- **Onboarding tour / tooltips**
- **App Store / Google Play release** — PWA dostatečné pro web

---

## 🔥 Co dělat když něco selže

**Cloud Function 401 v produkci:**
1. Zkontroluj App Check enforcement (může být enforced ale recaptcha key chybný)
2. Zkontroluj že frontend produkce má správný `VITE_RECAPTCHA_SITE_KEY`
3. Allowed domains v reCAPTCHA Console: torq.cz, www.torq.cz, *.web.app

**Sentry hláší produkční chyby:**
- Configured DSN: `o4510997338193920.ingest.de.sentry.io` (z .env.local)
- Dashboard: https://sentry.io → torq projekt

**Cloud Functions deploy:**
```bash
cd functions && npm run build && firebase deploy --only functions
```

**Hosting deploy:**
```bash
npm run build && firebase deploy --only hosting
```

---

_Generated 2026-05-06 by automated pre-release audit._
