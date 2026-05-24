# 🔐 Security migrace — co musí udělat Jan

Po audit 2026-05-23 zbývají 3 akce, které vyžadují manuální zásah (nemůžu je udělat za tebe). Jakmile je dokončíš, smaž tento soubor.

---

## 1. **🔴 P0 — Rotovat Stripe live key + přesunout do Firebase Secrets**

### Proč to spěchá
V `functions/.env` máš live Stripe secret key na disku v plaintextu:
```
STRIPE_SECRET_KEY=sk_live_51T4fIP...
STRIPE_WEBHOOK_SECRET=whsec_G4jB7uIw...
RESEND_API_KEY=re_...
```

Soubor JE `.gitignore`d (v gitu nikdy nebyl), ALE:
- Spotlight ho indexuje
- Time Machine ho zálohuje
- Jakákoli aplikace s read přístupem k home dir ho vidí (rozšíření, scripts)

### Kroky

**1.1 V Stripe Dashboardu** (https://dashboard.stripe.com/apikeys):
- Reveal secret key → **Roll** (vygeneruje nový)
- Starý key se invalidate během 12h

**1.2 V Stripe Webhooks** (https://dashboard.stripe.com/webhooks):
- Zobraz signing secret pro tvůj webhook endpoint
- Klikni "Roll" → uložit nový whsec_...

**1.3 V Resend** (https://resend.com/api-keys):
- Revoke starý API key → vygenerovat nový

**1.4 Uložit do Firebase Secrets** (terminál):
```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
# (vloží nový sk_live_...)

firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# (vloží nový whsec_...)

firebase functions:secrets:set RESEND_API_KEY
# (vloží nový re_...)
```

**1.5 Aktualizovat funkce** — přidat `runWith({ secrets: [...] })`:

V `functions/src/stripe.ts`, `webhook.ts`, `notifications.ts` upravit
exporty z `functions.region(...).https.onCall(...)` na:
```typescript
export const createCheckoutSession = functions
  .region('europe-west1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_PRODUCT_ID'] })
  .https.onCall(async (data, context) => { /* ... */ });
```

(STRIPE_PRODUCT_ID není citlivý → může zůstat v `.env`, ale pro konzistenci doporučuju taky přes secrets.)

**1.6 Deploy:**
```bash
firebase deploy --only functions
```

**1.7 Smazat soubor:**
```bash
rm /Users/jan.motycka/Documents/WORK/Active/Tourniquet/functions/.env
```

**1.8 Verify:** zkus checkout flow lokálně — pokud funguje s prázdným .env, je to OK.

---

## 2. **🟡 P2 — Admin custom claim místo hardcoded UID**

### Aktuální stav
V `src/constants/admin.ts` a `functions/src/constants.ts` je tvůj UID hardcoded:
```typescript
export const ADMIN_UID = 'EmIOqHuZVaWVbWN0imh6D1cttAf1';
```

Client bundle obsahuje string → útočník vidí přesně, koho cílit pro phishing.

### Migrace na custom claim

**2.1 V terminálu, jednorázově nastavit claim:**
```bash
# Vytvoř scripts/set-admin-claim.js (jednorázový)
node -e "
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });
admin.auth().setCustomUserClaims('EmIOqHuZVaWVbWN0imh6D1cttAf1', { admin: true })
  .then(() => console.log('Admin claim set')).then(() => process.exit(0));
"
```

**2.2 V Cloud Functions** nahradit:
```typescript
// PŘED:
if (context.auth?.uid !== ADMIN_UID) throw ...;

// PO:
if (!context.auth?.token?.admin) throw ...;
```

**2.3 V client** nahradit `currentUser?.uid === ADMIN_UID` za:
```typescript
const idToken = await currentUser?.getIdTokenResult();
const isAdmin = idToken?.claims.admin === true;
```

**2.4 Po deploy** musíš se odhlásit a znovu přihlásit, aby se claim načetl do tokenu.

**2.5 Smazat** `ADMIN_UID` z `src/constants/admin.ts` (klient).

---

## 3. **🟠 P1 — GDPR consent flow pro public sharing**

### Aktuální stav
Když trenér togglene "Sdílet zápas", v `public-matches` se zveřejní lineup s jmény VŠECH hráčů (sanitizováno na `J. Novák`). Žádný consent check od rodičů.

Pro CZ školy/kluby s dětmi (U6-U19) je to GDPR risk.

### Quick fix pro beta (5 min):
**V BETA_LAUNCH.md** přidat do beta zprávy:
> ⚠️ Sdílení s rodiči (`Zveřejnit`) toggle prosím **zatím nezapínej**. GDPR consent flow je v development. Pokud chceš ukázat rodičům výsledky, zatím raději ručně přes WhatsApp.

### Long-term fix (1 den dev):
- Přidat `consent: 'given' | 'denied' | 'pending'` na `ClubPlayer`
- V Soupiska UI form pro rodiče přidat checkbox "Souhlasím se zveřejněním jména v zápasech"
- V `sanitizeLineupForPublic` filtrovat `denied` + `pending`
- Default `denied` pro nové hráče

---

## ✅ Po dokončení 1+2 můžeš smazat tento soubor.

Bod 3 (GDPR) zůstává jako tracker pro post-beta development.
