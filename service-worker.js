// Basic offline cache — version bump to invalidate
const CACHE = 'ydb-cache-v2';
const ASSETS = [
  '/',                      // main path
  '/index.html',            // app shell
  '/manifest.webmanifest',  // manifest for install
  '/icons/icon-192.png',    // app icons
  '/icons/icon-512.png'
];

// Install: cache the assets
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting(); // activate new worker immediately
  })());
});

// Activate: clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim(); // take control of all pages
  })());
});

// Fetch: serve cached assets, fall back to network
self.addEventListener('fetch', (e) => {
  const req = e.request;
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      return fresh;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});