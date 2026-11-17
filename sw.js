/* Zara's Poképacks service worker: precache app shell, cache card images as they're seen. */
const V = 'packvault-v3';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'pack-model.js', 'fonts/pokemon-solid.woff2', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'img/packs/pfl.webp', 'img/packs/asc.webp', 'img/packs/pre.webp', 'img/packs/cri.webp', 'img/ui/card-back.webp', 'img/ui/sparkle.png', 'img/energy/grass.webp', 'img/energy/fire.webp', 'img/energy/water.webp', 'img/energy/lightning.webp', 'img/energy/psychic.webp', 'img/energy/fighting.webp', 'img/energy/darkness.webp', 'img/energy/metal.webp'];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await c.addAll(SHELL);
    self.skipWaiting();
    // warm the cache with chase-card art in the background (best effort)
    try { const r = await fetch('precache-imgs.json'); const list = await r.json(); for (const u of list) { try { await c.add(u); } catch {} } } catch {}
  })());
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/img/')) {
    e.respondWith(caches.open(V).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // app shell: network first (so updates land), fall back to cache offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(V).then(c => c.put(e.request, r.clone())); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
