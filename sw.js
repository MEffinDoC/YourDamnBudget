// YDB SW — v15.9.0 (stable, safe updates)
const CACHE_STATIC = 'ydb-static-v1590';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=15.9.0',
  './app.js?v=15.9.0',
  './wizard.js?v=15.9.0',
  './manifest.webmanifest',
  './icons/flat-192.png',
  './icons/flat-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_STATIC).then((c) => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_STATIC).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Strategy:
// - HTML/navigation: **network-first** (prevents stale app shell).
// - Static assets with version query (?v=): **cache-first** (fast), but easy to bust by bumping ?v=.
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // If this is a navigation (HTML) request, do network-first.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // For other requests (CSS/JS/PNG/etc): cache-first.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_STATIC).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});