// Saves the big game files on the phone after the first visit, so players don't pay for the same data twice.
// Models and the 3D engine are cached forever under their versioned address (?v=size, three@0.165.0).
// The page and the game code always come from the network first (so updates arrive at once) and from
// the cache only when offline. Bump VERSION only to wipe everything.
const VERSION = 'ns-2026-10-28a';
const HEAVY = u => (u.origin === location.origin && /\/assets\/(models|characters|people|maps|sounds)\//.test(u.pathname)) ||
  u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'fonts.gstatic.com';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ns-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function store(cache, key, res) {
  // keep one copy per file: drop older ?v= versions of the same path
  const u = new URL(typeof key === 'string' ? key : key.url);
  if (u.origin === location.origin && u.search) {
    for (const old of await cache.keys()) { const o = new URL(old.url); if (o.pathname === u.pathname && o.href !== u.href) await cache.delete(old); }
  }
  await cache.put(key, res);
}

// no network and nothing saved: a small page instead of a blank one (a blank page is what the "black screen" complaints were)
const offline = () => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Naija Streets</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0e13;color:#fff;font:17px/1.5 system-ui,sans-serif;text-align:center;padding:24px"><div><h1 style="font-size:22px;margin:0 0 8px">No network o!</h1><p style="margin:0 0 18px;color:#bcc3cf">Naija Streets could not reach Lagos. Check your data or Wi-Fi.</p><button onclick="location.replace(location.pathname)" style="font:inherit;font-weight:700;padding:12px 22px;border:0;border-radius:12px;background:#2fd17e;color:#06130b">TRY AGAIN</button></div>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return;

  if (/\/assets\/sounds\/mu_/.test(u.pathname)) return;   // songs stream straight from the network (media range requests)
  if (HEAVY(u)) { // cache first
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req);
      const type = r.headers.get('content-type') || '';
      if (r.status === 200 && !/text\/html/.test(type)) e.waitUntil(store(c, req, r.clone()));
      return r;
    }));
    return;
  }
  if (u.origin === location.origin) { // network first (revalidated), offline fallback
    const nav = req.mode === 'navigate';
    const key = nav ? u.origin + u.pathname : req.url;   // pages are stored without ?fresh= / ?dev= variations
    // (a page request is refetched by address, not by re-wrapping the navigation request: Safari is picky about that)
    e.respondWith((nav ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(new Request(req, { cache: 'no-cache' }))).then(r => {
      if (r.status === 200) { const cp = r.clone(); e.waitUntil(caches.open(VERSION).then(c => store(c, key, cp))); }
      return r;
    }).catch(() => caches.match(key, { ignoreSearch: nav }).then(hit => hit || caches.match(req, { ignoreSearch: true })).then(hit => hit || (nav ? offline() : Response.error()))));
  }
});
