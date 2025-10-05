// sw.js — PWA hardening for GitHub Pages
const SCOPE = '/YourDamnBudget/';
const CACHE = 'ydb-v12';

const ASSETS = [
  `${SCOPE}`, `${SCOPE}index.html`,
  `${SCOPE}styles.css?v=12`, `${SCOPE}nav.js?v=7`,
  `${SCOPE}ads.js?v=11`, `${SCOPE}install.js?v=12`, `${SCOPE}app.js?v=12`,
  `${SCOPE}engine.js`, `${SCOPE}storage.js`,
  `${SCOPE}i18n/en.json`, `${SCOPE}i18n/es.json`,
  `${SCOPE}manifest.webmanifest`,
  `${SCOPE}icons/flat-192.png`, `${SCOPE}icons/flat-512.png`
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Respect scope only
  if (!url.pathname.startsWith(SCOPE)) return;

  // Handle navigation requests (prevent 404 when launched from Home Screen)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      (async ()=>{
        try{
          // Try network first
          const net = await fetch(e.request);
          // Cache a fresh copy
          const c = await caches.open(CACHE); c.put(e.request, net.clone());
          return net;
        }catch{
          // Fallback to cached index.html if offline
          const c = await caches.open(CACHE);
          return (await c.match(`${SCOPE}index.html`)) || fetch(e.request);
        }
      })()
    );
    return;
  }

  // Other requests: network-first, fall back to cache
  e.respondWith(
    fetch(e.request).then(r => { caches.open(CACHE).then(c=>c.put(e.request, r.clone())); return r; })
      .catch(()=>caches.match(e.request))
  );
});