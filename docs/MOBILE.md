# TORQ Mobile (iOS + Android) — Capacitor wrap

> **Status:** Capacitor 7 nakonfigurovaný, Android projekt funkční,
> iOS projekt vyžaduje Xcode (viz krok 0).
> Connector: Web React/Vite → Capacitor → native WebView.

## Co je hotové (commit Capacitor wrap)

- [x] Capacitor 7 nainstalovaný (`@capacitor/core`, `cli`, `ios`, `android`)
- [x] 7 nativních pluginů: `share`, `haptics`, `preferences`, `push-notifications`, `app`, `status-bar`, `splash-screen`
- [x] `capacitor.config.ts` s app ID `cz.torq.app` + brand colors
- [x] iOS projekt v `ios/App/App.xcworkspace` (potřebuje Xcode pro build)
- [x] Android projekt v `android/` (Android Studio gradle build)
- [x] App icon 1024×1024 + Apple Touch Icon 180×180 v `public/icons/`
- [x] iOS IAP guard v `src/utils/platform.ts` — `shouldHideStripeUpgrade()`
- [x] Native share fallback v `SharePreviewModal` (Capacitor.Share preferovaný)
- [x] NPM scripts: `mobile:build`, `mobile:ios`, `mobile:android`, `mobile:icons`
- [x] Public legal pages: `/privacy.html`, `/terms.html`
- [x] Store listing drafts: `docs/store-listing/`

## Co potřebuješ ty

| Krok | Co | Čas | Náklady |
|---|---|---|---|
| 0 | Stáhnout Xcode z Mac App Store (~10 GB) | 30-60 min | zdarma |
| 1 | Apple Developer Account (volitelné, jen pro store submission) | 1 den (verifikace) | $99/rok |
| 2 | Google Play Console | 1-2 dny | $25 jednorázově |

---

## Krok 0 — Xcode setup (jen iOS)

```bash
# Stáhnout Xcode z Mac App Store (~10 GB, trvá 30-60 min)
# https://apps.apple.com/cz/app/xcode/id497799835

# Po instalaci:
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept

# Verifikuj
xcode-select -p   # → /Applications/Xcode.app/Contents/Developer
```

Po Xcode instalaci:
```bash
cd /Users/jan.motycka/Documents/WORK/Active/Tourniquet
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios
```

---

## Krok 1 — Spustit aplikaci v simulátoru

### iOS
```bash
npm run mobile:ios
# Otevře Xcode → vybrat iPhone simulator → Cmd+R
```

### Android
```bash
npm run mobile:android
# Otevře Android Studio → Run (Shift+F10) na emulator nebo USB device
```

### Test na fyzickém zařízení (free, bez Apple Dev account)

**iOS** (max 7 dní free certificate):
1. Otevři `ios/App/App.xcworkspace` v Xcode
2. Připoj iPhone přes USB
3. Tlumeně zkontroluj „Trust This Computer" na iPhonu
4. V Xcode: vyber tvůj iPhone v device picker (top bar)
5. Cmd+R → app se nainstaluje na iPhone (vyžaduje Apple ID v Xcode → Preferences → Accounts)
6. **POZN:** Free profile expiruje po 7 dnech, app přestane fungovat. Pro déle = Apple Dev $99/rok.

**Android** (žádný expiry):
1. Zapnout USB debugging na telefonu (Settings → Developer Options)
2. `npm run mobile:android` → Android Studio
3. Vybrat USB device, Run

---

## Krok 2 — App Store Connect submission (po Apple Dev account)

### Prerekvizity
- ✓ Apple Developer Program (`developer.apple.com/programs/`) — $99/rok
- ✓ Xcode nainstalovaný
- ✓ App icon 1024×1024 (✓ máme `public/icons/icon-1024.png`)
- ✓ Privacy URL veřejně dostupné (✓ `https://torq.cz/privacy.html`)

### Workflow

```bash
# 1. Build production
npm run mobile:build

# 2. Otevři v Xcode
npx cap open ios

# 3. V Xcode:
#    - Select „Any iOS Device (arm64)" v device picker (top bar)
#    - Product → Archive
#    - Po archivaci: Distribute App → App Store Connect → Upload
#    - Vyber Team (tvůj Apple Dev account)

# 4. App Store Connect (https://appstoreconnect.apple.com):
#    - Create new app → bundle ID „cz.torq.app"
#    - Vyplň listing dle docs/store-listing/app-store-cs.md
#    - Upload screenshots
#    - Submit for Review
```

**Review trvá 1-7 dní.** První pokus může být odmítnut (typicky kvůli IAP nebo
„repackaged web app"). V tomto repu mám iOS-specific guards (premium hidden
in iOS, native share preferován) — pravděpodobnost první přijetí ~70 %.

### Pokud Apple odmítne — typické důvody

| Důvod | Jak opravit |
|---|---|
| 3.1.1 — In-App Purchase | Schované Stripe upgrade (✓ máme `shouldHideStripeUpgrade`) — zkontroluj že žádné upgrade tlačítko v iOS verzi |
| 4.2 — Insufficient Native Functionality | Přidat víc native featur (push notifications už máme, biometric login je další možnost) |
| 5.1.1 — Privacy Policy | URL musí být veřejně dostupné, ne jen v app (✓ máme `/privacy.html`) |
| 4.0 — App Crashes | Test na všech device sizes před submit |

---

## Krok 3 — Google Play submission

### Prerekvizity
- ✓ Google Play Console account ($25 jednorázově)
- ✓ Android Studio nainstalovaný
- ✓ Java 17+ JDK
- ✓ Release keystore (vygeneruješ jednorázově, viz níže)

### Vygenerování release keystore (KRITICKÉ — záloha!)

```bash
keytool -genkey -v -keystore ~/torq-release-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias torq-release
# Zadej silné heslo. ZAZÁLOHUJ keystore soubor + heslo!
# Ztráta = nelze aktualizovat existing app v Play Store.
```

### Build AAB

```bash
# 1. Build web + sync
npm run mobile:build

# 2. Edituj android/gradle.properties — přidej:
#    TORQ_RELEASE_STORE_FILE=/Users/jan.motycka/torq-release-key.keystore
#    TORQ_RELEASE_KEY_ALIAS=torq-release
#    TORQ_RELEASE_STORE_PASSWORD=...
#    TORQ_RELEASE_KEY_PASSWORD=...

# 3. Edituj android/app/build.gradle — uncomment release signing config
#    (Capacitor template má placeholder pro tohle)

# 4. Build
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab

# 5. Upload do Play Console → Production track → Create release
# 6. Submit pro review (typicky 1-3 dny)
```

---

## Pravidelný workflow (po launchi)

```bash
# Při změně web kódu (90 % případů):
npm run build              # vite build
npx cap sync               # sync to ios/android
# Otevři Xcode/Android Studio, znovu archive + upload

# Při přidání plugin (např. nový Capacitor plugin):
npm install @capacitor/[plugin]
cd ios/App && pod install   # iOS only
npx cap sync
```

---

## Apple App Store rule 3.1.1 — Co dělat a nedělat

### NESMÍŠ v iOS verzi

- Tlačítko/odkaz vedoucí na Stripe Checkout
- Banner „Upgrade na Premium" s tlačítkem Subscribe
- Externí URL na payment processor

### MŮŽEŠ v iOS verzi

- ✓ Informaci „Premium spravuj na webu" (text only, žádné klikatelné upgrade)
- ✓ Stripe Customer Portal (cancel existing subscription) — Apple toleruje
- ✓ Reading existing subscription state (premium funkce odemčeny)
- ✓ Free tier features bez omezení

### Kód

`src/utils/platform.ts` má helper `shouldHideStripeUpgrade()`:
```ts
{!shouldHideStripeUpgrade() && <UpgradeButton onClick={subscribe} />}
```
True pro `Capacitor.getPlatform() === 'ios'`, false pro Android + web.

---

## Časté problémy

### `pod install` selhal s encoding error

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios
```

### `cap sync` říká „Could not find web assets directory"

Spustil jsi z jiného adresáře. Capacitor CLI musí běžet v project root.

### Android build selhal s Gradle wrapper

```bash
cd android
./gradlew --version   # ověř Gradle
./gradlew clean
./gradlew bundleRelease
```

### iOS app nezobrazuje obsah (bílá obrazovka)

`webDir: 'dist'` v capacitor.config.ts — ujisti se, že `dist/` existuje a obsahuje `index.html`. Spusti `npm run build` před `cap sync`.

---

## Co dál (roadmap)

### Před prvním App Store launchem (P0)
- [ ] Stáhnout Xcode (ty)
- [ ] `pod install` v ios/App (ty)
- [ ] Apple Developer account ($99) — ty
- [ ] Screenshoty z iOS simulátoru — ty
- [ ] App Store Connect listing — vyplnit z `docs/store-listing/app-store-cs.md`

### Před prvním Google Play launchem (P0)
- [ ] Google Play Console ($25) — ty
- [ ] Vygenerovat keystore (a zazálohovat!) — ty
- [ ] Screenshoty z Android emulátoru — ty
- [ ] Play Console listing — vyplnit z `docs/store-listing/google-play-cs.md`

### Po launchi (P1)
- [ ] Native push notifications setup (FCM)
  - iOS: APNs certificate v Apple Dev → import do Firebase
  - Android: google-services.json už existuje (Firebase)
- [ ] Biometric login (Face ID / Touch ID)
- [ ] Apple Sign-In (povinné pro Apple pokud máš email/password login)
- [ ] App Store Optimization (ASO) keywords research

### Nice-to-have (P2)
- [ ] iOS App Clip (preview app pro QR scanning)
- [ ] Android Instant App
- [ ] Universal Links (iOS) + App Links (Android) — deep linking

---

## Kontakty

- **Apple Developer support:** developer.apple.com/contact
- **Google Play support:** support.google.com/googleplay/android-developer
- **Capacitor docs:** capacitorjs.com/docs
