# 🚀 TORQ — Beta launch handover

Pro tebe (Jan), abys mohl plynule rozjet beta s 3-5 trenéry.

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

Díky moc!
Jan
```

---

## 🔍 Co aplikace **už umí**

### Pro trenéra
- ✅ Vytvořit turnaj (2-32 týmů, 3 formáty)
- ✅ Vytvořit zápas (Quick match nebo plný s sestavou)
- ✅ Živé skóre (góly, karty žluté/červené, střídání, půlčasy)
- ✅ Klubový roster (správa hráčů, věkové kategorie U6-U19)
- ✅ Sdílení s asistenty trenéra
- ✅ Statistiky hráčů (góly, asistence, hodnocení)
- ✅ FAČR export PDF
- ✅ Offline mode (PWA)
- ✅ Multi-language (cs/en/de)

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

## 📊 Stav po této session (2026-05-22)

| | |
|---|---|
| Branch `main` | `429eac9` (latest) |
| Last deploy | 2026-05-22, success |
| Tests | 245/245 |
| Sentry errors 14d | 1 (handled, 0 users affected) |
| App Check RTDB | 92% verified (target 95%+) |
| App Check Auth | 96% verified ✅ ready to enforce |
| AEO assets | ✅ llms.txt, JSON-LD (3 schemas), noscript, sitemap |
| Console errors v produkci | 0 |
| Public test data | ✅ Cleaned |

---

_Good luck! Pokud někdo z beta ti řekne něco překvapivého — slušné, špatné, neutrální — pošli mi to. Můžeme iterovat cíleně podle reálné zpětné vazby._

_— Jan & Claude, 2026-05-22_
