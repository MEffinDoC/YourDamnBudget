// YDB SW — v15.9.0 (store-friendly, no query strings)
// Strategy: Stale-While-Revalidate for a short, safe core list.
// No ?v=... anywhere; cache name bump controls updates.

const CACHE_NAME = 'ydb-v15-9-0';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './wizard.js',
  './manifest.webmanifest',
  './icons/flat-192.png',
  './icons/flat-512.png',
];

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          // Update cache for same-origin successful responses
          try {
            const url = new URL(req.url);
            if (res.ok && url.origin === location.origin) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
          } catch (_) {}
          return res;
        })
        .catch(() => cached); // fall back to cache when offline

      // If we have a cached copy, serve it immediately and refresh in bg
      return cached || networkFetch;
    })
  );
});