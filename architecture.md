# TORQ — Architecture

> Aktualizováno: 2026-04-08. Tento dokument shrnuje aktuální stav, ne historii.

## Stack

- **Frontend**: React 19 + TypeScript (strict) + Vite 7, Zustand 5
- **Backend**: Firebase — Realtime Database (europe-west1), Cloud Functions (Node 22), Auth, Hosting, App Check (reCAPTCHA v3)
- **Billing**: Stripe (Checkout + Customer Portal via callable CFs)
- **Observability**: Sentry, structured logger
- **PWA**: vite-plugin-pwa + Workbox (NetworkOnly pro Firebase URLy)

## Moduly

1. **Training Generator** — AI plánovač tréninků, knihovna cvičení, kalendář, attendance
2. **Tournament Manager** — real-time scoring, PIN co-host model, public view s MVP votingem/chatem, PDF exporty, QR rostery/registrations
3. **Match Tracker** — sezónní zápasy s lineupy, ratingy, public share

## Data model

```
/tournaments/{uid}/{tournamentId}    # owner data
/public/{tournamentId}               # spectator read-only mirror
/catalog/{tournamentId}              # lightweight list index
/matches/{uid}/{matchId}              # seasonal matches (user-scoped)
/trainings/{uid}/{trainingId}         # saved trainings (user-scoped)
/contacts/{uid}/{contactId}           # coach contacts (user-scoped)
/templates/{uid}/{templateId}         # tournament templates

/clubs/{clubId}                       # shared clubs (single model, no legacy)
  members: { uid: { role, joinedAt } }
  players: [...], ageCategories: [...]
/users/{uid}/memberOfClubs/{clubId}   # role pointer (written only by CF)
/users/{uid}/activeClubId             # current workspace selection
/users/{uid}/subscription             # Stripe state (server-written)
/users/{uid}/joinedTournaments        # co-host access via PIN

/clubInvites/{inviteId}               # read-only from client (CF only)
/clubPinAuth/{inviteId}               # PIN hash (separated — brute-force defense)
/clubRequests/{requestId}             # verified club requests (admin approval)
/clubsCatalog                         # Wikidata-synced club catalog
```

Poznámky:
- `/matches`, `/trainings`, `/contacts` jsou user-scoped (`$scopeId = uid`). DB rules akceptují i `clubId` jako scope pro budoucnost, ale writer je zatím uid.
- Klubový model je **jediný zdroj pravdy** přes `/clubs/{clubId}` + `memberOfClubs` pointery. Žádný legacy `/users/{uid}/clubs`.

## Routing

Custom `Page` union v `App.tsx` (no react-router). Hash-based public URLs:
- `#tournament={id}` pro public tournament view
- `#match={id}` pro public match view
- `?join=club&id={inviteId}#club` pro club PIN join intent
- `?t={tournamentId}&team={teamToken}` pro roster form
- `?t={tournamentId}` pro registration form

Většina stránek je lazy-loaded přes React.Suspense.

## State management

13 Zustand stores (`src/store/`):
- `tournament.store.ts` (~1100 LOC) — největší, realtime sync
- `matches.store.ts`, `trainings.store.ts`, `clubs.store.ts`, `contacts.store.ts`, `templates.store.ts`
- `subscription.store.ts` — Stripe status listener
- `page.store.ts`, `toast.store.ts`, `confirm.store.ts` — UI
- `generator.store.ts`, `exercises.store.ts`, `coaches.store.ts` — feature-specific

Pravidlo: kluby se nepersistent-cachují do localStorage — pravda je v Firebase. Ostatní stores perzistují přes `zustand/middleware/persist` + `safeStorage`.

## Cloud Functions (europe-west1)

- **Stripe**: `createCheckoutSession`, `createPortalSession`, `stripeWebhook` (HTTP)
- **Tournament PIN auth**: `joinTournamentByPin`, `verifyTournamentPin`
- **Shared Clubs** (`functions/src/clubs.ts`): `createPersonalClub`, `requestOfficialClub`, `adminApproveClubRequest`/`adminRejectClubRequest`/`adminListClubRequests`, `createClubInvite`/`joinClubByInvite`/`revokeClubInvite`/`listClubInvites`, `removeClubMember`/`changeClubMemberRole`/`leaveClub`, `adminAddClubMember`/`adminTransferClubOwnership`/`adminDeleteClub`
- **Notifications**: `onNewRegistration` (RTDB trigger), `rosterReminder` (scheduled)
- **Admin tooling**: user management, stats, catalog sync, blocking

## Security

- Firebase Auth s forced Google account picker
- App Check s reCAPTCHA v3
- Server-side PIN verifikace (SHA-256 + salt, separated `pinAuth` storage pro offline brute-force defense)
- Rate limiting na citlivých operacích (PIN attempts)
- CSP + Trusted Types kde to jde
- Stripe customer ID indexováno jen pro webhook lookup

## i18n

- `cs.ts` (primární), `en.ts`, `de.ts` — context-based provider v `i18n/context.tsx`
- Klíče: flat dot-notation (`tournament.create.title`, ...), paměťová parita mezi locales je manuální

## Testing

- Vitest + @testing-library/react
- Pokrytí: utility funkce (pin-hash, schedule, validation, id, time, match-utils, team-colors, export-csv, rate-limiter) + `matches.store` + `clubs.store`
- Cíl: **kritické cesty, ne 100 % coverage**. Snow-plough sustaining mode.

---

## Sustaining mode (od 2026-04)

TORQ je v režimu údržby s jedním aktivním testerem, nula platících uživatelů. Tento stav záměrně minimalizuje čas na rozšiřování produktu a investuje disproporčně do stability a jednoduchosti.

### Principy

1. **Mobile-first a pouze mobile** — desktop layout je zmražen. `useLayoutMode()` vždy vrací `'mobile'` bez ohledu na viewport. Desktop kód (`DesktopShell`, `DesktopPage`, `LayoutModeToggle`) byl odstraněn z App shell routingu; mobile build je dostatečně responzivní i na větších obrazovkách.
2. **Jeden klubový model** — pouze sdílené kluby na `/clubs/{clubId}`. Legacy `/users/{uid}/clubs` vrstva byla smazána (store, service, DB rules, Cloud Function `migrateUserClubs`, admin migrační UI).
3. **Žádný scope creep** — nové featury se neotevírají, dokud základ není bulletproof. Buglist z reálného mobilního testu má přednost před jakoukoli ideou "ještě tohle přidat".
4. **Jedna iterace méně kódu > jedna iterace více featur** — cleanup a mazání nepoužívaných větví má vyšší hodnotu než přidávání.

### Co je podporováno

- Plný offline-capable flow pro tři moduly (Training, Tournament, Match) v mobilní verzi
- Shared Clubs s PIN pozvánkami a rolemi owner/coach/viewer
- Stripe Checkout + Customer Portal
- Public spectator views (QR, hash URL)
- cs / en / de lokalizace

### Co je zmraženo

- **Desktop layout** — žádné nové desktop-specific komponenty, žádný sidebar nav, žádné 2-sloupcové dashboardy. Existující desktop větve (DesktopShell, DesktopPage) zůstávají v repu jako dead code pro případnou budoucí rehydrataci — **nemazat, ale nevolat**.
- **Přepínač layoutu v UI** — odstraněn ze Settings. Uživatel nemá způsob, jak si vynutit desktop mode.
- **Marketingová landing page polish, docs, veřejný onboarding pro kluby** — dokud není akvizice.

### Co bylo explicitně opuštěno

- B2B verified club flow (Wikidata catalog → admin approval) — kód zůstává v Cloud Functions, UI je dostupné v admin konzoli, ale není tlačeno v onboardingu
- Další jazyky / DE polish
- Refactor `tournament.store.ts` (~1100 LOC) — nedotýkat se bez důvodu
- Migrace `$scopeId` pro trainings/matches/contacts z `uid` na `clubId`
- Pokrytí testy nad 80 %
- Redesign barev / design systému

### Příští iterace (až bude základ bulletproof)

**Rodičovské nominace zápasů** — jediná nová featura v plánu. Trenér poskládá nominaci z klubového rosteru, vygeneruje WhatsApp-friendly odkaz, rodič klikne a potvrdí účast dítěte (`Budu / Nebudu / Nevím`) přes parent token + public URL. Reusne existující mechaniku hash URL + realtime RTDB sync, která už funguje pro tournament/match public views. Nedělat, dokud mobile flow není absolutně stabilní.

### Graceful degradation plán

Tyto věci přestanou samy fungovat, pokud se projekt 3-6 měsíců neudržuje:

| Riziko | Jak se projeví | Co zkontrolovat před pauzou |
|---|---|---|
| **Firebase Functions runtime deprecation** | Deploy začne failovat, staré funkce v runtime poslední N měsíců přestanou startovat | `functions/package.json` `engines.node` = 22 (aktuálně OK do cca 2027) |
| **Firebase SDK major update** | Breaking changes v APIs, runtime warnings, časem hard break | Před pauzou: bump na poslední stabilní major a deploy test |
| **Stripe API verze** | Webhooks mohou přestat validovat payload při změně schema | Pin Stripe API version v Cloud Function; sledovat changelog při update |
| **reCAPTCHA site key expirace / rotace** | App Check začne failovat, klient nedostane token | Site key v environment variable, pravidelně ověřit v GCP Console |
| **Google OAuth consent screen audit** | App může být označená jako "unverified" pokud dlouho nebyla použita | Po 6+ měsících pauzy zkontrolovat v GCP OAuth Consent Screen |
| **Firebase RTDB limity** | Free tier limit na spojení / velikost DB — při růstu může dojít | Sledovat v Firebase Console monitoring |
| **Platební metoda v GCP** | Expirovaná karta → přerušení služby | Automatické upozornění z GCP + osobní kontrola |

**Před delší pauzou projít**: deploy aktuální verze, udělat `npm audit fix` s patch-level updaty, commitnout, push, otagovat jako "sustaining-pause-YYYY-MM".

### Metrika úspěchu pro tento režim

**Žádné**. Nečekáme růst uživatelské základny. Jediné pozitivní znaménko: vrátit se k projektu za 3 měsíce, pustit `npm run dev`, otevřít mobil, a všechno prostě funguje. To je úspěch.
