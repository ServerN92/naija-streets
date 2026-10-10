// Saves the big game files on the phone after the first visit, so players don't pay for the same data twice.
// Bump VERSION whenever a model, character or texture file changes.
const VERSION = 'ns-2026-10-10a';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ns-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const heavy = (u.origin === location.origin && /\/assets\/(models|characters)\//.test(u.pathname)) || u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'fonts.gstatic.com';
  if (heavy) { // cache first
    e.respondWith(caches.open(VERSION).then(async c => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }));
    return;
  }
  if (u.origin === location.origin) { // network first, offline fallback
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; }).catch(() => caches.match(req)));
  }
});
