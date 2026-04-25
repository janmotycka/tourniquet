# Google Play Console — TORQ — česky

> **Návod:** Google Play Console je flexibilnější než App Store. Stripe platby
> jsou povoleny (žádný IAP requirement pro digital subscriptions, pokud je
> Stripe deklarován correctly v Data Safety formuláři).

---

## App Details

**App Name** (max 30 znaků):
```
TORQ — Trénink a zápasy
```

**Short Description** (max 80 znaků, hlavní marketing copy):
```
Vytvoř turnaj za minutu. Klikej skóre na telefonu. Rodičům link do WhatsAppu.
```

**Full Description** (max 4000 znaků):

```
TORQ — Sportovní turnaje, zápasy a tréninky pro trenéry mládeže.

Učíte tělocvik a vezmete kluky na McDonald's Cup? Vedete fotbalový kroužek?
Organizujete školní turnaj? TORQ je pro vás.

⚡ JEDNODUCHÝ MÓD (zdarma, neomezeno)

✓ Vytvoř zápas za 30 sekund — soupeř, soupiska, hraj
✓ Klikej skóre přímo na telefonu, časomíra běží sama
✓ Pošli rodičům výsledek do WhatsAppu (jedním tlačítkem)
✓ Sdílej obrázek na Instagram nebo Facebook
✓ Ulož si „partu" hráčů a použij ji znovu příští zápas
✓ Vytvoř turnaj se 4-16 týmy, vytiskni si pavouk + rozpis

🏟️ POKROČILÝ MÓD (klubový)

• Sdílený workspace s asistent-trenérem
• Multi-trainer lock — oba editujete naživo bez konfliktů
• Sezónní statistiky hráčů (góly, asistence, karty, herní čas)
• Hodnocení hráčů po zápase (5 atributů — effort, technika, týmovost…)
• FAČR zápas PDF jedním klikem (oficiální český fotbalový zápis)
• Cross-team pairing — soupeř se připojí PINem, oba zapisujete

🎾 TŘI SPORTY

⚽ Fotbal (formáty 3+1 až 11+1, oficiální i amatérské)
🎾 Tenis (single i čtyřhry, ČTenis odkaz)
🏑 Florbal (rychlý zápas + turnaj)

🎬 ŽIVÉ SDÍLENÍ

• Diváci sledují skóre v reálném čase přes QR kód nebo odkaz
• Žádná registrace pro spektátory
• Push notifikace na góly (volitelné)

💚 ZDARMA NAPOŘÁD

• Simple mód: bez limitů
• Pokročilý: 10 zápasů + 5 tréninků + 1 turnaj zdarma
• Premium 99 Kč / měsíc — bez limitů, ale není povinné

OBLÍBENÉ U:
- Učitelů tělesné výchovy (tělocvik, ZŠ + SŠ)
- Trenérů mládeže (přípravka, žáci, dorost)
- Organizátorů školních a firemních turnajů
- Rodičů, kteří trénují kamarády svých dětí

🇨🇿 Vyrobeno v České republice. Plně přeloženo do češtiny, angličtiny a němčiny.

📧 Otázky? privacy@torq.cz
🌐 Web: https://torq.cz
```

---

## Categorization

- **App or game:** App
- **Category:** Sports
- **Tags (max 5):** sports management, tournament, match, coaching, youth sports

---

## Contact Details

- **Website:** https://torq.cz
- **Email:** privacy@torq.cz

---

## Privacy Policy URL

```
https://torq.cz/privacy.html
```

---

## Data Safety Section

### Data Collected

| Data Type | Collected | Shared | Required | Purpose |
|---|---|---|---|---|
| Email address | Yes | No | No | App functionality, Account management |
| Name | Yes | No | No | App functionality |
| User IDs (Firebase UID) | Yes | No | No | App functionality |
| App activity (matches, tournaments) | Yes | No | No | App functionality |
| Photos and videos | No | — | — | Coaches can upload club logos (stored as base64, not photos) |
| Crash logs (Sentry) | Yes | Yes (with Sentry GmbH) | No | Analytics, App functionality |
| Performance data (Sentry) | Yes | Yes (with Sentry GmbH) | No | Analytics |

### Security Practices

- ✓ Data is encrypted in transit (TLS 1.2+)
- ✓ You can request data deletion (privacy@torq.cz)
- ✓ Independent security review: No (start-up, planned 2026)
- ✓ Data follows Google's "Families Policy"? Yes (no ads, no third-party tracking)

---

## Content Rating

Spusti **Content Rating questionnaire** v Play Console:
- Violence: None
- Sexual content: None
- Profanity: None
- Drugs/Alcohol: None
- User-generated content: Yes (chat, team names) — moderation: post-publish takedown
- → Result: **Everyone** (PEGI 3)

---

## App Access

**Demo account for review** (vytvoř a sděl v Play Console):
- Email: `play-review@torq.cz`
- Password: (silné heslo, jen v Play Console formuláři)

Note: Anonymous mód je dostupný — recenzent může app otevřít a používat
bez přihlášení. Ale Play Console preferuje real account.

---

## Pricing & Distribution

- **Price:** Free
- **In-App Purchases:** Yes (subscription via web — Stripe, NE Google Play Billing)
  - Tohle musíš deklarovat v Play Console: pokud Premium subscription je
    dostupný JEN přes web (mimo Play Billing), musíš to označit jako
    "subscriptions handled outside Google Play". To je legální (jako TeamSnap,
    Spotify, atd.) ale Google to musí vědět.
  - Alternativa: použít Google Play Billing pro Android verzi (15-30% komise)
    a Stripe pro iOS/web. To je rozhodnutí pro budoucnost.

---

## Mobile screenshots

**Phone screenshots:** 1080×1920 (portrait) nebo 1080×2400 — 2-8 screenshots

Doporučená sekvence (stejná jako App Store):
1. Dashboard s živým zápasem
2. Quick Match Sheet
3. Live tab se skóre tlačítky
4. Share modal s preview
5. Tournament dashboard

**Tablet screenshots:** 1200×1920 (volitelné, zvyšuje viditelnost na tablech)

**Feature graphic:** 1024×500 PNG/JPG — banner na vrchu Play listingu.
Tady navrhnu základ:
- Levá polovina: TORQ logo + tagline „Sportovní turnaje za minutu"
- Pravá polovina: telefon screenshot s live skóre

---

## Build & Submission

```bash
# 1. Build production AAB
npm run mobile:build
cd android
./gradlew bundleRelease

# 2. Output: android/app/build/outputs/bundle/release/app-release.aab

# 3. Sign s release keystore (vytvoř jednorázově):
keytool -genkey -v -keystore torq-release-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias torq-release

# 4. Upload do Play Console → Production track → Create new release
# 5. Submit pro review (typicky 1-3 dny)
```

**KRITICKÉ:** keystore SOUBOR + heslo si zazálohuj! Ztráta = nejde aktualizovat
existing app v Play Store, museli bys vytvořit nový product listing.
