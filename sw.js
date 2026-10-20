// Saves the big game files on the phone after the first visit, so players don't pay for the same data twice.
// Models and the 3D engine are cached forever under their versioned address (?v=size, three@0.165.0).
// The page and the game code always come from the network first (so updates arrive at once) and from
// the cache only when offline. Bump VERSION only to wipe everything.
const VERSION = 'ns-2026-10-11a';
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
    e.respondWith(fetch(new Request(req, { cache: 'no-cache' })).then(r => {
      if (r.status === 200) { const cp = r.clone(); e.waitUntil(caches.open(VERSION).then(c => store(c, key, cp))); }
      return r;
    }).catch(() => caches.match(key, { ignoreSearch: nav }).then(hit => hit || caches.match(req, { ignoreSearch: true }))));
  }
});
