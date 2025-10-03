// Service worker for GitHub Pages subpath
const SCOPE = '/YourDamnBudget/';
const CACHE = 'ydb-v1';

const ASSETS = [
  `${SCOPE}`,
  `${SCOPE}index.html`,
  `${SCOPE}styles.css`,
  `${SCOPE}app.js`,
  `${SCOPE}engine.js`,
  `${SCOPE}storage.js`,
  `${SCOPE}manifest.webmanifest`,
  `${SCOPE}icons/icon-192.png`,
  `${SCOPE}icons/icon-512.png`
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first with cache fallback, limited to scope
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (!url.pathname.startsWith(SCOPE)) return; // ignore other origins/paths
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
