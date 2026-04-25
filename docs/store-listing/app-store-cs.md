# App Store Connect — TORQ — česky

> **Návod na použití:** Tohle je draft pro App Store Connect. Zkopíruj odpovídající
> sekce do listing form. Pole označená `# OPTIONAL` jsou volitelná, ostatní
> jsou povinná.

---

## Základní info

**Název / Name** (max 30 znaků):
```
TORQ — Trénink a zápasy
```

**Subtitle** (max 30 znaků):
```
Turnaje a sportovní zápasy
```

**Bundle ID:** `cz.torq.app`

**Primary Category:** Sports
**Secondary Category:** Productivity

**Age Rating:** 4+ (žádný nevhodný obsah)

---

## Promotional Text (max 170 znaků, lze měnit kdykoliv bez review)

```
Vytvoř turnaj za minutu. Klikej skóre na telefonu. Pošli rodičům link do WhatsAppu. Zdarma pro učitele TV i amatérské trenéry.
```

---

## Description (max 4000 znaků)

```
TORQ — Sportovní turnaje, zápasy a tréninky pro trenéry mládeže.

Učíte tělocvik a vezmete kluky na McDonald's Cup? Vedete fotbalový kroužek?
Organizujete školní turnaj? TORQ je pro vás.

⚡ JEDNODUCHÝ MÓD (zdarma, neomezeno)
- Vytvoř zápas za 30 sekund — soupeř, soupiska, hraj
- Klikej skóre přímo na telefonu, časomíra běží sama
- Pošli rodičům výsledek do WhatsAppu (jedním tlačítkem)
- Sdílej obrázek na Instagram nebo Facebook
- Ulož si „partu" hráčů a použij ji znovu příští zápas
- Vytvoř turnaj se 4-16 týmy, vytiskni si pavouk + rozpis

🏟️ POKROČILÝ MÓD (klubový)
- Sdílený workspace s asistent-trenérem
- Multi-trainer lock — oba editujete naživo bez konfliktů
- Sezónní statistiky hráčů (góly, asistence, karty, herní čas)
- Hodnocení hráčů po zápase (5 atributů)
- FAČR zápas PDF jedním klikem (oficiální zápis)
- Cross-team pairing — soupeř se připojí PINem, oba zapisujete

🎾 TŘI SPORTY
- ⚽ Fotbal (formáty 3+1 až 11+1, oficiální i amatérské)
- 🎾 Tenis (single i čtyřhry, ČTenis odkaz)
- 🏑 Florbal (rychlý zápas + turnaj)

🎬 ŽIVÉ SDÍLENÍ
- Diváci sledují skóre v reálném čase přes QR kód nebo odkaz
- Žádná registrace pro spektátory
- Push notifikace na góly (volitelné)

💚 ZDARMA NAPOŘÁD
- Simple mód: bez limitů
- Pokročilý: 10 zápasů + 5 tréninků + 1 turnaj zdarma
- Premium 99 Kč / měsíc — bez limitů, ale není povinné

OBLÍBENÉ U:
- Učitelů tělesné výchovy
- Trenérů mládeže (přípravka, žáci, dorost)
- Organizátorů školních a firemních turnajů
- Rodičů, kteří trénují kamarády svých dětí

🇨🇿 Vyrobeno v České republice. Plně přeloženo do češtiny, angličtiny a němčiny.

📧 Otázky? Napište na privacy@torq.cz
🌐 Web: https://torq.cz

POZN.: Premium předplatné lze v iOS aplikaci pouze prohlížet. Pro upgrade
pokračujte v prohlížeči na torq.cz/upgrade.
```

---

## Keywords (max 100 znaků, oddělené čárkou — bez mezer po čárce)

```
trénink,fotbal,tenis,florbal,turnaj,zápas,trenér,mladež,sport,skóre,timer,FAČR
```

---

## Support URL

```
https://torq.cz
```

## Marketing URL (OPTIONAL)

```
https://torq.cz
```

## Privacy Policy URL (POVINNÉ)

```
https://torq.cz/privacy.html
```

---

## App Privacy (Data Collection)

V App Store Connect → App Privacy klikni „Get Started" a vyplň podle této matice:

### Linked to User

- **Contact Info → Email Address:** Yes (App Functionality, Account)
- **Contact Info → Name:** Yes (App Functionality, Account)
- **User Content → Other:** Yes — sportovní data (sestavy, skóre) — App Functionality
- **Identifiers → User ID:** Yes — Firebase Auth UID — App Functionality

### NOT Linked to User

- **Diagnostics → Crash Data:** Sentry — App Functionality
- **Diagnostics → Performance Data:** Sentry — App Functionality

### Data Types NOT Collected

- Health & Fitness, Financial Info (Stripe je server-side, neukládáme card data)
- Location, Browsing History, Search History
- Sensitive Info, Contacts, Photos
- Audio/Video, Gameplay Content
- Customer Support

---

## Screenshots (musíš pořídit)

Apple požaduje screenshoty pro tyto velikosti:
- **iPhone 6.9"** (iPhone 16 Pro Max, 1320×2868) — 3-10 obrázků
- **iPhone 6.5"** (iPhone 11 Pro Max, 1284×2778) — 3-10 obrázků
- **iPad 13"** (iPad Pro 13", 2064×2752) — 3-10 obrázků (pokud podporuješ iPad)

**Doporučená sekvence (5 screenshots):**
1. Dashboard s živým zápasem („Sleduj naživo")
2. Quick Match Sheet — vytvoř zápas za 30s („Zápas za 30 sekund")
3. Live tab — velká skóre tlačítka („Klikni gól, hotovo")
4. Share modal s preview obrázkem („Pošli rodičům do WhatsApp")
5. Tournament dashboard s pavoukem („Pavouk + rozpis pro turnaj")

Screenshoty pořídíš v Xcode Simulátoru:
1. Otevři `ios/App/App.xcworkspace` v Xcode
2. Spusti aplikaci v Simulátoru (iPhone 16 Pro Max)
3. Cmd+S → screenshot uloží na desktop
4. Pro iPad: spustit v iPad Pro 13" simulátoru

---

## App Review Information

**Sign-In Required:** No (anonymous mode dostupný)
**Demo Account:** Pokud Apple chce, vytvoř test účet:
- Email: `appstore-review@torq.cz`
- Password: (vygeneruj silné heslo, sděl jen v App Store Connect)

**Notes for Reviewer (anglicky):**
```
TORQ is a sports tournament and match management app for amateur and youth coaches.

Anonymous mode: Open the app and skip login. You will be auto-signed in anonymously and can use Simple mode immediately (create a quick match, share with parents).

Premium subscription: Premium upgrade is NOT available in the iOS app (per App Store Review Guideline 3.1.1). Existing premium users may manage their subscription by visiting torq.cz/upgrade in a web browser. The iOS app provides full feature access for free users; premium unlocks higher limits (more matches, tournaments, trainings).

Test sport: Football (default), Tennis, or Floorball. All three sports are available in the sport picker on first launch.

Contact: privacy@torq.cz for any review questions.
```
