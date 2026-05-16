import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — TORQ native app pro iOS + Android.
 *
 * Strategie: Capacitor obaluje naši PWA do native shellu. Stejný React/Vite
 * codebase běží v WebView, ale s přístupem k native API (push, share,
 * haptics, biometric, atd.). Žádný React Native rewrite.
 *
 * Build flow:
 *   1. `npm run mobile:build` → vite build → dist/
 *   2. `npx cap sync` → zkopíruje dist do ios/App/App/public + android/app/src/main/assets/public
 *   3. `npx cap open ios` (nebo android) → otevře v Xcode/Android Studio
 *   4. Build & run nebo Archive & upload do App Store / Play Console
 *
 * Apple App Store rule 3.1.1 (digital goods → IAP):
 *   V iOS verzi MUSÍME schovat všechny upgrade tlačítka co vedou na Stripe.
 *   Premium subscription se prodává jen na webu — v iOS appce user vidí jen
 *   informaci „Premium spravuj na webu". Detekuje se přes platform.ts.
 *
 * Bundle ID (cz.torq.app):
 *   - iOS: musí matchovat App ID v Apple Developer Portal
 *   - Android: musí být unikátní v Google Play Console
 *   - Změna bundle ID po prvním releasu = nelze (nový product listing)
 */
const config: CapacitorConfig = {
  appId: 'cz.torq.app',
  appName: 'TORQ',
  // `dist` je výstup Vite build (vite-plugin-pwa generuje sw.js do dist/).
  // Capacitor zkopíruje dist/ do native bundle při `cap sync`.
  webDir: 'dist',

  // Server config — během vývoje můžeš přepnout na live-reload server,
  // ale pro produkci to MUSÍ být undefined / commentnuté (jinak appka
  // bude pokoušet o spojení s dev serverem v cestě).
  // Pro hot-reload na fyzickém zařízení odkomentuj a nastav svou IP:
  // server: { url: 'http://192.168.1.10:5173', cleartext: true },

  // iOS-specific
  ios: {
    // Schéma URL pro deep-linking (universal links)
    scheme: 'TORQ',
    // Content inset = automatic (status bar nepřekrývá content)
    contentInset: 'automatic',
  },

  // Android-specific
  android: {
    // Allow mixed content (HTTP fonts, assets) — všechny naše Firebase volání
    // jsou HTTPS, ale legacy HTTP CDN by jinak nefungovaly.
    allowMixedContent: false,
    // Capture všechny gesta zpět = handle v JS přes App.addListener('backButton')
    captureInput: true,
  },

  // Plugin config
  plugins: {
    SplashScreen: {
      // Krátký splash, fade-out, branded barvy TORQ.
      launchShowDuration: 1500,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#1B5E20',  // TORQ primary green (matches manifest theme_color)
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      // Sync s `theme_color` v manifestu — green status bar pro brand kontinuitu
      backgroundColor: '#1B5E20',
      style: 'DARK',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
