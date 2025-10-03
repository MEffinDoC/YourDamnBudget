// sw.js — cache-busted & scoped for GitHub Pages
const SCOPE = '/YourDamnBudget/';
const CACHE = 'ydb-v7'; // bumped for nav fixes

const ASSETS = [
  `${SCOPE}`, `${SCOPE}index.html`,
  `${SCOPE}styles.css?v=7`, `${SCOPE}nav.js?v=7`,
  `${SCOPE}app.js?v=7`, `${SCOPE}engine.js`, `${SCOPE}storage.js`,
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
  if (!url.pathname.startsWith(SCOPE)) return;
  e.respondWith(
    fetch(e.request).then(r => { caches.open(CACHE).then(c=>c.put(e.request, r.clone())); return r; })
      .catch(()=>caches.match(e.request))
  );
});