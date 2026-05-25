# 🚀 TORQ — Beta launch handover

Pro tebe (Jan), abys mohl plynule rozjet beta s 3-5 trenéry.

**Updated 2026-05-22 22:25** — po deep audit + UX research + Phase 1+2
refactoru. Stav je solidní pro beta. Phase 3 (lineup page rewrite) v
další session.

---

## 🎁 Co nového po deep audit (Phase 1 + Phase 2)

**2 paralelní agenti** prošli code (CreateMatchPage + QuickMatchSheet) +
UX research (Strava, GameChanger, TeamSnap, FotMob best practices).
Identifikovali 30+ findings. Implementoval jsem nejhodnotnější:

### Quick match — kritické bug fixy
- ✅ **Opponent validation** — Spustit zápas je teď disabled bez opponenta (min 2 znaky). Žádný DB junk.
- ✅ **Unsaved form guard** — refresh už neztratí 18 hráčů
- ✅ **Smart defaults z lastMatch** — format/délka/soutěž/kategorie/trackAssists se přebírá z minulého zápasu
- ✅ **Smart defaults banner** — „💡 Předvyplněno z minulého zápasu (14. 5.). Můžeš změnit." Konec silent auto-fill.
- ✅ **Match format dropdown** — místo 6 chips (overflow na mobile 360px), native select s edukativními labels („5+1 — malá kopaná, 6 hráčů")

### Shared infrastructure (pro budoucí Phase 3)
- ✅ `<CollapsibleSection>` shared component
- ✅ `useMatchSmartDefaults` hook (sjednocený zdroj defaults)
- ✅ `<MatchFormatSelect>` component (dropdown s i18n hints)

---

## 📋 Pro tebe — co předtím udělat

### 1. App Check enforcement (15 min)

App Check verified % je teď:
- **Realtime Database: 92%** (počkat na 95%+, pak enforce — risk že 8% legitimních usrů vypadne)
- **Authentication: 96%** ✅ — **můžeš enforce hned**

**Postup:**
1. Otevři https://console.firebase.google.com/project/tourniquet-7a123/appcheck/products
2. U **Authentication** klikni `Monitoring...` → změň na **Enforce**
3. Sleduj 24h, jestli někdo neztratí přístup
4. Pokud ano → vrať na Monitoring; pokud OK → udělej totéž s **Realtime Database** (až 95%+)

### 2. Beta tester výběr (15 min)

Vyber 3-5 trenérů kde **alespoň 2 různé scénáře:**
- 1-2× klubový trenér (Advanced mode, sezónní zápasy, FAČR)
- 1-2× učitel TV / amatér (Simple mode, ad-hoc turnaje)
- 1× někdo kdo organizuje větší turnaj (8-16 týmů)

### 3. Beta zpráva — copy-paste šablona

Pošli každému trenérovi tuto zprávu:

```
Ahoj!

Pracuju na aplikaci TORQ pro amatérské trenéry — vytvoření turnaje za
minutu, živé skórování zápasů přes telefon, sdílení s rodiči přes QR
kód. Funguje na webu i offline (PWA).

Chtěl bych ji s tebou vyzkoušet — pomohlo by mi 30 minut tvého času
během příštího týdne. Co potřebuju:

1. Otevři: https://torq.cz
2. Přihlas se přes Google
3. Zkus vytvořit turnaj nebo zápas (záleží na tom co reálně používáš)
4. Dej mi vědět co tě překvapilo / mátlo / chybělo

Bugs nebo zmatky pošli mi prosím:
- Email: jan@torq.cz
- Případně screenshot + popis co tě štvalo

⚠️ Když budeš chtít sdílet zápas přes QR/odkaz s rodiči, app se zeptá
na GDPR souhlas (musíš mít souhlas od rodičů nezletilých hráčů).
Pokud souhlas nemáš, neaktivuj „Zveřejnit" — výsledky pošli ručně.

Díky moc!
Jan
```

---

## 🔍 Co aplikace **už umí**

### Pro trenéra
- ✅ Vytvořit turnaj (2-32 týmů, 3 formáty)
- ✅ Vytvořit zápas (Quick match s smart defaults z minula)
- ✅ Živé skóre (góly, karty žluté/červené, střídání, půlčasy)
- ✅ Asistent střídání (auto-alert + auto-split starters/bench)
- ✅ Captain selector
- ✅ Track assists toggle
- ✅ Klubový roster (správa hráčů, věkové kategorie U6-U19)
- ✅ Sdílení s asistenty trenéra
- ✅ Statistiky hráčů (góly, asistence, hodnocení)
- ✅ FAČR export PDF
- ✅ Offline mode (PWA)
- ✅ Multi-language (cs/en/de)
- ✅ Unsaved form guard (refresh už neztratí data)

### Pro rodiče
- ✅ Sledování zápasu naživo přes QR kód / odkaz
- ✅ Žádná registrace, žádný download

### Pro AI agenty (Claude/ChatGPT/Perplexity)
- ✅ `llms.txt`, rich JSON-LD (FAQ + HowTo), `<noscript>` fallback
- ✅ TORQ je dohledatelný + AI agenty mohou doporučovat

---

## ⚠️ Známé limitace (k pravdivému sdělení trenérům)

### Nejde teď
- ❌ **Stripe placení** — premium plán existuje jako limit, ale není jak koupit
- ❌ **Walkover one-tap** (pro turnaj kdy tým nepřijde, musíš ručně dát skóre 0:0)
- ❌ **Bracket spojnice** v live view (vidíš jen tabulkou)
- ❌ **Manual seed override** ve wizardu (jen automatic)
- ❌ **iOS/Android App Store** — zatím jen PWA (Capacitor wrappery připraveny, nepublikováno)

### Zatím skryté za feature flag
- ❌ **Modul tréninků** (`TRAINING_ENABLED = false`) — připravený, ale chce ověřit core flow
- ❌ **Tenis a florbal** (`ENABLED_SPORTS = ['football']`) — kód existuje

### Pre-release legal
- ⚠️ **Privacy Policy + ToS** — stránky existují, ale nemáš revizi od právníka
- ⚠️ **Account deletion** — jen email request (GDPR-compliant manuálně)

---

## 📊 Co měřit během beta

### Týdenní metriky (kontroluj v pondělí)
1. **Aktivní users** v Firebase Auth — kolik se přihlásilo
2. **Sentry errors** — https://jan-motycka.sentry.io/issues/?project=4510997348548688
3. **App Check %** — chceš 95%+ pro safe enforcement
4. **Manuální feedback** — co tě trenéři řeknou

### Co znamená "úspěch beta"
- 3+ trenérů app **používá víc než 1×** (retention)
- 1+ trenér ji použije při **reálném zápase nebo turnaji**
- 0 P0 bugů (crashes, data loss, broken UI)

---

## 🐛 Když se objeví bug

### Triage pravidla
1. **P0 — data loss / crash / login broken** → fix do 24h
2. **P1 — feature broken pro vícero trenérů** → fix do týdne
3. **P2 — UX friction, malé bugy** → next sprint

### Hotfix flow
```bash
# 1. Lokálně oprav
# 2. Pre-commit (TS + tests prošlo)
git add . && git commit -m "fix(area): description"
git push origin main

# CI automaticky deployuje (~2 min)
# Smoke test na produkci přes incognito browser
```

---

## 📞 Co když ti někdo z trenérů řekne…

| Co řeknou | Co odpovědět |
|---|---|
| „Nejde to nainstalovat" | „PWA — v Chromu klikni `⋮` → `Přidat na plochu`. Není to App Store." |
| „Funguje to offline?" | „Ano, ale poprvé musíš být online aby si app cachla." |
| „Můžu mít víc klubů?" | „Free plan: 3 osobní kluby. Pro víc je premium plán brzy." |
| „Mohou to vidět rodiče bez registrace?" | „Ano — zapni v zápase `Sdílet`, dostaneš QR + odkaz." |
| „Co když nemám aktivní klub?" | „Quick match funguje i bez klubu — Simple mode flow." |
| „Nepoběží mi to na iOS?" | „PWA funguje na všech iOS od 16+. Push notifikace omezené." |
| „Dělají se i tréninkové cvičení?" | „Brzy — feature flag teď schovaný, čekáme na ověření core flow." |

---

## 🎯 Po týdnu beta — co dělat

### Pokud bylo OK (0-2 P0 bugů, retention ≥ 50%)
1. **App Check enforcement** (pokud nejsi už hotov)
2. **Rozšíření beta na 10-20 trenérů**
3. **Stripe MVP** pokud chceš premium platit
4. **Začít plánovat marketing landing page**

### Pokud bylo špatně (≥ 3 P0 bugů nebo nikdo to nepoužije)
1. **Identifikuj root cause** — onboarding? Mobile UX? Konkrétní feature?
2. **Iterace 2 týdny** — fix top 3 problémů
3. **Re-beta s těmi samými trenéry**

---

## 🔗 Quick links

- **Live app**: https://torq.cz
- **GitHub**: https://github.com/janmotycka/tourniquet
- **CI/CD**: https://github.com/janmotycka/tourniquet/actions
- **Firebase Console**: https://console.firebase.google.com/project/tourniquet-7a123
- **Sentry**: https://jan-motycka.sentry.io/issues/?project=4510997348548688
- **AEO check**:
  - https://torq.cz/llms.txt
  - https://torq.cz/sitemap.xml
  - https://torq.cz/robots.txt

---

## 📊 Stav po této session (2026-05-24)

| | |
|---|---|
| Branch `main` | latest |
| Last deploy | success |
| Tests | 245/245 |
| Sentry errors 14d | 1 (handled, 0 users affected) |
| App Check RTDB | 92% verified (target 95%+) |
| App Check Auth | 96% verified ✅ ready to enforce |
| AEO assets | ✅ llms.txt, JSON-LD (3 schemas), noscript, sitemap |
| Console errors v produkci | 0 |
| Public test data | ✅ Cleaned |
| Security RTDB rules | ✅ S-2, S-3, S-4, S-5 fixed |
| PIN brute force | ✅ S-7 server-side rate limit (10 fail/10min → block 30min) |
| GDPR consent gate | ✅ J-2 modal před prvním Zveřejnit |
| Quick→Lineup edit flow | ✅ J-1 sticky Spustit zápas v LineupTab |
| Match creation paywall | ✅ J-3 limit check v useQuickMatchCreate |
| Sport switch guard | ✅ J-4 redirect pro mismatch |
| Squad chip navigation | ✅ J-5 prefillSquadId |
| Captain display | ✅ J-7 "C" badge v LineupTab |
| Tournament free limit | ✅ J-8 bumped 1 → 3 |
| npm audit | ✅ 0 vulnerabilities (root) |
| Pending user actions | ⚠️ Viz SECURITY_MIGRATION.md (Stripe key rotation) |

---

_Good luck! Pokud někdo z beta ti řekne něco překvapivého — slušné, špatné, neutrální — pošli mi to. Můžeme iterovat cíleně podle reálné zpětné vazby._

_— Jan & Claude, 2026-05-24_
