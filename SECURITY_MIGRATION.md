# 🔐 Co musíš udělat sám (zbylé akce)

Po audit 2026-05-24 jsem hotov se vším, co se dá udělat kódem. Tohle musíš dokončit ručně. Po hotovu smaž tento soubor.

---

## 🔴 P0 — Rotovat Stripe + Resend keys → Firebase Secrets (15 min)

**Proč:** `functions/.env` na disku obsahuje live Stripe secret key v plaintextu. Soubor je v `.gitignore` (do gitu nikdy nešel), ALE: Spotlight indexuje, Time Machine zálohuje, jakákoli aplikace s read přístupem k home dir to vidí.

**Code už je připraven** — `stripe.ts`, `webhook.ts`, `notifications.ts` mají `runWith({ secrets: [...] })` (commit z 2026-05-24). Stačí nastavit secrets a deploy.

### Postup (terminál + 3 prohlížečové taby)

```bash
# 1) Stripe dashboard — rotace
open https://dashboard.stripe.com/apikeys
# - Reveal secret key → Roll → zkopíruj nový sk_live_...
# - Starý se invalidate za 12h

open https://dashboard.stripe.com/webhooks
# - Najdi tvůj endpoint → Reveal signing secret → Roll → zkopíruj whsec_...

open https://resend.com/api-keys
# - Revoke starý → Create API key → zkopíruj re_...

# 2) Uložit do Firebase Secrets (paste když se zeptá)
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set STRIPE_PRODUCT_ID
# (STRIPE_PRODUCT_ID je v functions/.env — taky paste)
firebase functions:secrets:set RESEND_API_KEY

# 3) Deploy
firebase deploy --only functions

# 4) Smazat .env
rm functions/.env

# 5) Verify (zkus checkout flow na torq.cz — měl by fungovat)
```

**Pokud Stripe webhook po deploy nepřijímá** → zkontroluj endpoint URL v Stripe Dashboard (musí být `https://europe-west1-tourniquet-7a123.cloudfunctions.net/stripeWebhook` nebo Firebase Hosting rewrite).

---

## 🟢 OPTIONAL — App Check Auth enforcement (5 min)

App Check Auth je na **96%** verified — bezpečné enforce.

```
open https://console.firebase.google.com/project/tourniquet-7a123/appcheck/products
```
- U **Authentication** klikni `Monitoring...` → změň na **Enforce**
- Sleduj 24h, jestli někdo neztratí přístup (Firebase Console → App Check)
- Pokud OK, počkej až RTDB dosáhne 95%+ a zopakuj

---

## 🟡 OPTIONAL — Admin custom claim (1 h, post-beta)

Tvůj UID je hardcoded v client bundle (`src/constants/admin.ts`) → útočník vidí, koho phishingovat. Pro beta s 3-5 trenéry low risk, ale post-beta cleanup.

Řešení: server-side `setCustomUserClaims({ admin: true })` + client/server check přes `idToken.claims.admin`.

Detailní postup — řekni mi „chci to udělat", připravím refactor jako separátní PR.

---

## 🟠 POST-BETA — GDPR consent na úrovni hráče

Aktuálně máme **modal upozornění** před prvním Zveřejnit (J-2 quick fix) — trenér musí potvrdit, že má souhlas rodičů. To pro beta stačí.

Long-term: `ClubPlayer.publicConsent: boolean` + UI toggle v Soupisce + filtr v `sanitizeLineupForPublic`. ~1 den dev po beta.

---

## ✅ Až dokončíš P0, smaž tento soubor (`git rm SECURITY_MIGRATION.md`).
