/**
 * publicPreview — dynamické OG tagy pro sdílené odkazy (audit 2026-06-10,
 * growth #3).
 *
 * Problém: share URL byly hash-based (#match=ID) — fragment se neposílá na
 * server, takže WhatsApp/FB boti viděli vždy generický og-image + titulek.
 * Náhled „⚽ Spartak 3:1 Viktorka" dramaticky zvedá CTR sdílených odkazů
 * (WhatsApp je hlavní kanál rodičů).
 *
 * Řešení: nové share cesty /m/{matchId} a /t/{tournamentId} → Firebase
 * Hosting rewrite na tuto funkci. Funkce přečte public mirror z RTDB
 * (admin SDK), vrátí minimální HTML s OG tagy + <meta refresh> redirect
 * na hash-routu, kterou SPA umí. Boti meta-refresh nesledují a přečtou
 * OG; lidé jsou přesměrováni okamžitě.
 *
 * Region: us-central1 (DEFAULT, bez .region()) — Firebase Hosting rewrites
 * na 1st-gen funkce podporují jen us-central1. Latence nevadí (jeden hop
 * při kliku na sdílený odkaz, pak už SPA).
 *
 * CSP poznámka: žádný inline <script> — hosting headers (firebase.json)
 * mají script-src bez 'unsafe-inline'. Meta refresh CSP neblokuje.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SITE = 'https://torq.cz';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlPage(opts: {
  title: string;
  description: string;
  url: string;       // kanonická share URL (path forma)
  redirect: string;  // hash routa pro lidi (relativní)
}): string {
  const t = esc(opts.title);
  const d = esc(opts.description);
  const u = esc(opts.url);
  const r = esc(opts.redirect);
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${u}" />
<meta property="og:image" content="${SITE}/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="cs_CZ" />
<meta name="twitter:card" content="summary_large_image" />
<meta http-equiv="refresh" content="0;url=${r}" />
</head>
<body>
<p style="font-family:system-ui;text-align:center;margin-top:40vh">
⚽ <a href="${r}">${t}</a>
</p>
</body>
</html>`;
}

interface PublicMatchLite {
  clubName?: string;
  opponent?: string;
  isHome?: boolean;
  homeScore?: number;
  awayScore?: number;
  status?: string;
  date?: string;
  kickoffTime?: string;
  competition?: string;
}

async function matchPreview(id: string): Promise<{ title: string; description: string } | null> {
  const snap = await admin.database().ref(`public-matches/${id}`).get();
  if (!snap.exists()) return null;
  const m = snap.val() as PublicMatchLite;

  const us = m.clubName || 'Náš tým';
  const them = m.opponent || 'Soupeř';
  const home = m.isHome === false ? them : us;
  const away = m.isHome === false ? us : them;

  let title: string;
  let description: string;
  if (m.status === 'live') {
    title = `⚽ ${home} ${m.homeScore ?? 0}:${m.awayScore ?? 0} ${away} — ŽIVĚ`;
    description = 'Zápas právě běží — sleduj skóre živě na TORQ.';
  } else if (m.status === 'finished') {
    title = `⚽ ${home} ${m.homeScore ?? 0}:${m.awayScore ?? 0} ${away}`;
    description = `Konečný výsledek${m.competition ? ` · ${m.competition}` : ''}. Sestava a průběh zápasu na TORQ.`;
  } else {
    title = `⚽ ${home} vs ${away}`;
    const when = [m.date, m.kickoffTime].filter(Boolean).join(' ');
    description = `${when ? when + ' · ' : ''}Sleduj zápas živě na TORQ — skóre, sestava, góly.`;
  }
  return { title, description };
}

async function tournamentPreview(id: string): Promise<{ title: string; description: string } | null> {
  // Číst jen malé uzly (name/status) — public mirror obsahuje celé teams/matches.
  const db = admin.database();
  const [nameSnap, statusSnap] = await Promise.all([
    db.ref(`public/${id}/name`).get(),
    db.ref(`public/${id}/status`).get(),
  ]);
  if (!nameSnap.exists()) return null;
  const name = String(nameSnap.val());
  const status = statusSnap.exists() ? String(statusSnap.val()) : '';

  const title = `🏆 ${name}${status === 'active' ? ' — ŽIVĚ' : ''}`;
  const description = status === 'finished'
    ? 'Výsledky, tabulky a pavouk turnaje na TORQ.'
    : 'Živé výsledky, tabulky a pavouk turnaje na TORQ — bez registrace.';
  return { title, description };
}

export const publicPreview = functions.https.onRequest(async (req, res) => {
  try {
    const match = req.path.match(/^\/(m|t)\/([^/]+)\/?$/);
    const kind = match?.[1];
    const id = match?.[2];

    let preview: { title: string; description: string } | null = null;
    let redirect = '/';
    let shareUrl = SITE;

    if (kind && id && ID_RE.test(id)) {
      if (kind === 'm') {
        preview = await matchPreview(id);
        redirect = `/#match=${id}`;
        shareUrl = `${SITE}/m/${id}`;
      } else {
        preview = await tournamentPreview(id);
        redirect = `/#tournament=${id}`;
        shareUrl = `${SITE}/t/${id}`;
      }
    }

    // Fallback na generické OG (neexistující ID apod.) — lidi pošleme do app,
    // ať nikdy neuvíznou na 404.
    const title = preview?.title ?? 'TORQ — Fotbalové turnaje a zápasy';
    const description = preview?.description
      ?? 'Živé skórování zápasů a turnajů pro amatérské trenéry. Zdarma.';

    // Vždy 200 — FB/WhatsApp scrapery OG z non-2xx zahazují a negativní
    // preview si drží dlouho. Reálný race: trenér zkopíruje link dřív, než se
    // public mirror dozapisuje → bot by si zacachoval 404 (review finding P2).
    // Miss proto neukládáme do CDN (no-store), hit cachujeme 60 s.
    res.set('Cache-Control', preview ? 'public, max-age=0, s-maxage=60' : 'no-store');
    res.status(200).send(htmlPage({ title, description, url: shareUrl, redirect }));
  } catch (err) {
    functions.logger.error('[publicPreview] failed:', err);
    // I při chybě pošleme člověka do aplikace.
    res.set('Cache-Control', 'no-store');
    res.status(200).send(htmlPage({
      title: 'TORQ — Fotbalové turnaje a zápasy',
      description: 'Živé skórování zápasů a turnajů pro amatérské trenéry. Zdarma.',
      url: SITE,
      redirect: '/',
    }));
  }
});
