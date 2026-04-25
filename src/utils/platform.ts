/**
 * platform.ts — runtime detekce běžícího prostředí.
 *
 * Aplikace běží ve 3 různých režimech:
 *   1. Web prohlížeč (PWA na torq.cz nebo localhost)
 *   2. Capacitor iOS (App Store / TestFlight)
 *   3. Capacitor Android (Google Play / sideload)
 *
 * Hlavní use-case těchto helperů:
 *   a) **Apple App Store rule 3.1.1** — v iOS verzi MUSÍME schovat všechny
 *      upgrade tlačítka, která vedou na Stripe. Premium se prodává jen na
 *      webu. Tohle vyžaduje `isIOSNative()` check všude, kde je upgrade CTA.
 *      (Spotify, Netflix, Audible — všichni to dělají takhle.)
 *   b) **Native API fallback** — preferovat `Capacitor.Share` před `navigator.share`
 *      v native, lepší UX (bezpečnostní dialog, picker grids, atd.).
 *   c) **Push notifications** — web push vs native FCM/APNS.
 *
 * Default web: pokud Capacitor není dostupný (window.Capacitor undefined),
 * vrací false → UI se chová jako PWA.
 */

import { Capacitor } from '@capacitor/core';

/** True pokud běžíme jako native app (iOS nebo Android) — NE web prohlížeč. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True jen pro iOS Capacitor app. */
export function isIOSNative(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

/** True jen pro Android Capacitor app. */
export function isAndroidNative(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** True pokud běžíme v prohlížeči (PWA nebo regulérní web). */
export function isWebPlatform(): boolean {
  return Capacitor.getPlatform() === 'web';
}

/**
 * Hide upgrade CTA v iOS verzi (Apple 3.1.1 rule).
 *
 * Použití:
 *   {!shouldHideStripeUpgrade() && <UpgradeButton />}
 *
 * Důvod: Apple App Store odmítá apps, které nabízí digital subscriptions
 * jiným způsobem než Apple In-App Purchase. Workaround = v iOS verzi vůbec
 * nenabízíme upgrade. Existující Premium uživatelé můžou stále spravovat
 * (cancel) přes Customer Portal — to Apple toleruje.
 *
 * Android Play Store je flexibilnější — pro tyhle pravidla aplikujeme jen iOS.
 */
export function shouldHideStripeUpgrade(): boolean {
  return isIOSNative();
}

/**
 * Lidský název platformy pro logy / debug / analytics.
 */
export function platformLabel(): 'ios' | 'android' | 'web' {
  const p = Capacitor.getPlatform();
  if (p === 'ios' || p === 'android') return p;
  return 'web';
}
