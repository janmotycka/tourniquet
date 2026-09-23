// Migrace starých domén (2026-09-23). torq.cz / torqcoach.com měly vlastní
// instalovanou PWA. Po přesunu na golovka.cz byly přepnuté na 301 redirect —
// jenže service worker registrovaný na starém originu se přes cross-origin
// redirect NIKDY neaktualizuje (fetch SW skriptu má redirect mode 'error'),
// takže instalované PWA zůstaly navždy zamrzlé ve starém buildu. Sentry
// TORQ-WEB-Q: auth/firebase-app-check-token-is-invalid z https://torq.cz/.
//
// Řešení: staré domény opět SERVÍRUJÍ obsah (SW se dokáže aktualizovat na
// tento build) a tenhle skript na starém hostu odregistruje SW, smaže cache
// a přesměruje na golovka.cz se zachováním cesty. Na golovka.cz je no-op.
// Externí soubor (ne inline) kvůli CSP script-src 'self'.
(function () {
  var LEGACY = { 'torq.cz': 1, 'www.torq.cz': 1, 'torqcoach.com': 1, 'www.torqcoach.com': 1 };
  if (!LEGACY[location.hostname]) return;
  var target = 'https://golovka.cz' + location.pathname + location.search + location.hash;
  var done = false;
  var finish = function () { if (done) return; done = true; location.replace(target); };
  try {
    setTimeout(finish, 1500); // pojistka — nečekat na úklid donekonečna
    var jobs = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }));
    }
    if (window.caches && caches.keys) {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }));
    }
    Promise.all(jobs).then(finish, finish);
  } catch (e) { finish(); }
})();
