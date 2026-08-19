# 🚀 Gólovka — Beta launch handover

Pro tebe (Jan), abys mohl plynule rozjet beta s 3–5 trenéry.

**Updated 2026-08-10** — po rebrandu TORQ → Gólovka, přesunu na golovka.cz,
osekání na jádro (fotbal, cs-only) a bezpečnostním auditu před betou.
**Stav: technicky připraveno k betě.**

---

## ✅ TL;DR — co je hotové a nasazené

| Oblast | Stav |
|---|---|
| Doména | **golovka.cz** live (SSL), `www` → redirect na apex |
| Staré domény | `torq.cz` + `torqcoach.com` → **301 redirect** na golovka.cz (staré QR/odkazy fungují) |
| Přihlášení | ✅ Google + e-mail/heslo (authDomain opraven po rebrandu) |
| Vzhled | auto podle systému + **přepínač světlý/tmavý i pro nepřihlášené** (landing, login, veřejný turnaj/zápas) |
| Jazyk | **jen čeština** (EN/DE odstraněny) |
| Sport | **jen fotbal** (tenis/florbal odstraněny) |
| Bezpečnost | ✅ audit hotový (viz níže) |
| CI/CD | push na `main` → auto-deploy functions → database → hosting (~2–4 min) |
| Konzole v produkci | 0 chyb |

---

## 🔒 Bezpečnost — stav před betou

**Verdikt: solidní.** Audit 2026-08-10 opravil dva legacy nálezy, žádný blocker nezůstal.

- ✅ Žádný nechráněný zápis do DB (`.write: true`)
- ✅ Admin Cloud Functions kontrolují `ADMIN_UID`
- ✅ PIN: rate-limit (10 pokusů/10 min → blok 30 min), server-side ověření
- ✅ **PIN hashe jen v `/pin-auth` (`.read:false`)** — legacy leak z `/public` opraven (migrace + cleanup + odstraněn server fallback)
- ✅ **PIN se generuje kryptograficky** (`crypto`, ne `Math.random()`)
- ✅ App Check na **Authentication = Enforced**
- ✅ PII dětí chráněné: ve `/public` jen jméno+dres (záměr pro rodiče), **ročník narození nikde**; kontakt na trenéra strippován (GDPR)
- ✅ Žádný Stripe secret v repu (přes Google Secret Manager)

### ⚠️ App Check na Realtime Database — ZÁMĚRNĚ NECHÁNO VYPNUTÉ
Nezapínat pro betu. Klientský App Check init je v `try/catch` a **v anonymním okně / s ad-blockerem** reCAPTCHA selže → klient jede bez tokenu. Enforced RTDB by takové uživatele **odmítl** = výpadek pro část trenérů/rodičů. Bezpečnostní pravidla jsou dostatečná vrstva. Zvážit až po betě a jen s monitoringem odmítnutých requestů.

---

## 📋 Co ještě potřebuje TVOJE ruce (nejde bez tvých účtů)

Nic z toho není blocker bety — jsou to poslední kusy leštění.

### 1. Rozeslat beta zprávu trenérům (šablona níže) — **jediný krok k rozjezdu**

### 2. E-mailová doména (volitelné, kosmetika)
Notifikační maily teď chodí z `Gólovka <noreply@torq.cz>` (funkční, verifikováno v Resend; tělo i odkazy už jsou golovka.cz). Chceš-li i odesílací adresu na golovka.cz:
1. V Resendu přidej doménu `golovka.cz` → dá ti DNS záznamy (SPF/DKIM)
2. Přidej je do Active24 DNS
3. Nastav env `EMAIL_FROM=Gólovka <noreply@golovka.cz>` u funkcí
→ Řekni a udělám kroky 1–3 s tebou (Resend + DNS).

### 3. Podpora / donate (až budeš chtít monetizovat)
`DONATE_URL` v `src/types/feature-flags.ts` je prázdný → tlačítko „Podpořit Gólovku" skryté. Až vytvoříš Stripe Payment Link, pošli mi URL a odemknu ho (jeden řádek).

---

## 📨 Beta zpráva — copy-paste šablona

Vyber 3–5 trenérů, ideálně 2 různé scénáře (klubový trenér vs. učitel TV / ad-hoc turnaj, a někdo s větším turnajem 8–16 týmů).

```
Ahoj!

Pracuju na aplikaci Gólovka pro amatérské trenéry — vytvoření turnaje za
minutu, živé skórování zápasů přes telefon a sdílení s rodiči přes QR kód
(rodiče vidí výsledky živě, bez registrace). Funguje na webu i offline (PWA).

Chtěl bych ji s tebou vyzkoušet — pomohlo by mi 30 minut tvého času během
příštího týdne:

1. Otevři: https://golovka.cz
2. Přihlas se (Google nebo e-mail)
3. Zkus vytvořit turnaj nebo zápas — podle toho, co reálně používáš
4. Dej mi vědět, co tě překvapilo / mátlo / chybělo

Bugs nebo zmatky pošli prosím na jan@golovka.cz (klidně screenshot + popis).

⚠️ Když budeš chtít sdílet zápas přes QR/odkaz s rodiči, app se zeptá na
GDPR souhlas (musíš mít souhlas rodičů nezletilých hráčů). Bez souhlasu
„Zveřejnit" neaktivuj — výsledky pošli ručně.

Díky moc!
Jan
```

---

## 🔍 Co aplikace umí (aktuální)

**Pro trenéra:** turnaj (2–32 týmů, 3 formáty) · quick match se smart defaults · živé skóre (góly, karty, střídání, půlčasy) · asistent střídání · kapitán · asistence toggle · klubový roster (U6–U19) · sdílení s asistenty · statistiky hráčů · offline PWA.

**Pro rodiče:** sledování zápasu i turnaje naživo přes QR/odkaz — **bez registrace**, s tabulkou, střelci, diskuzí, reakcemi a anketami.

**Pro AI/SEO:** `llms.txt`, JSON-LD (WebApplication + FAQ), `<noscript>` fallback, sitemap.

---

## ⚠️ Známé limitace (řekni trenérům pravdivě)

- ❌ **Placení** — premium existuje jako limit, ale není jak koupit (Stripe MVP až později)
- ❌ **Walkover one-tap** — když tým nepřijde, dej skóre ručně
- ❌ **Bracket spojnice** v live view (vidíš tabulkou)
- ❌ **App Store** — zatím jen PWA (Capacitor wrappery připraveny, nepublikováno)
- ❌ **Modul tréninků** — za feature flagem (`TRAINING_ENABLED=false`), čeká na ověření jádra
- ⚠️ **Privacy Policy + ToS** — stránky existují, bez revize právníkem
- ⚠️ **Smazání účtu** — přes e-mail request (GDPR-compliant manuálně)

---

## 📊 Co měřit během beta (kontroluj v pondělí)

1. **Aktivní users** ve Firebase Auth
2. **Sentry errors** — https://jan-motycka.sentry.io/issues/?project=4510997348548688
3. **Manuální feedback** od trenérů

**Úspěch beta:** 3+ trenéři app použijí víc než 1× · 1+ ji použije při reálném zápase/turnaji · 0 P0 bugů (crash / ztráta dat / rozbité UI).

**Nejcennější otázka teď:** cizí trenér (`janecekjirka`) si v dubnu nachystal turnaj škol (11 týmů, 55 zápasů) a **ani jednou v něm neskóroval**. Zeptej se ho proč — jediný reálný datový bod od cizího uživatele.

---

## 🐛 Bug triage & hotfix

| Priorita | Co | SLA |
|---|---|---|
| P0 | ztráta dat / crash / rozbité přihlášení | do 24 h |
| P1 | feature rozbitý pro víc trenérů | do týdne |
| P2 | UX friction, malé bugy | next sprint |

```bash
# oprav lokálně → pre-commit (TS + testy) → push → CI deploy ~2–4 min
git add . && git commit -m "fix(area): popis"
git push origin main
# smoke test na produkci v anonymním okně
```

---

## 📞 Když ti trenér řekne…

| Řeknou | Odpověz |
|---|---|
| „Nejde nainstalovat" | „PWA — v Chromu `⋮` → `Přidat na plochu`. Není to App Store." |
| „Funguje offline?" | „Ano, ale poprvé musíš být online, ať se app cachne." |
| „Vidí to rodiče bez registrace?" | „Ano — v zápase/turnaji zapni `Sdílet`, dostaneš QR + odkaz." |
| „Nemám klub, půjde to?" | „Quick match funguje i bez klubu." |
| „Poběží na iOS?" | „PWA na iOS 16+. Push notifikace omezené." |
| „Dělají se tréninky?" | „Brzy — feature zatím skrytá, ověřujeme jádro." |

---

## 🔗 Quick links

- **Live**: https://golovka.cz
- **GitHub**: https://github.com/janmotycka/tourniquet
- **CI/CD**: https://github.com/janmotycka/tourniquet/actions
- **Firebase**: https://console.firebase.google.com/project/tourniquet-7a123
- **Sentry**: https://jan-motycka.sentry.io/issues/?project=4510997348548688

---

_Good luck! Cokoliv překvapivého z bety — dobré, špatné, neutrální — pošli, iterujeme podle reálné zpětné vazby._

_— Jan & Claude, 2026-08-10_
