// YDB sw.js v15l
const SCOPE = '/YourDamnBudget/';
const CACHE = 'ydb-v15l';

const ASSETS = [
  `${SCOPE}`,
  `${SCOPE}index.html`,
  `${SCOPE}styles.css?v=15.8.2`,
  `${SCOPE}app.js?v=15.8.5`,
  `${SCOPE}engine.js`,
  `${SCOPE}wizard.js?v=15.2`,
  `${SCOPE}manifest.webmanifest`,
  `${SCOPE}icons/flat-192.png`,
  `${SCOPE}icons/flat-512.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(SCOPE)) return;

  event.respondWith(
    fetch(event.request)
      .then((r) => {
        caches.open(CACHE).then((c) => c.put(event.request, r.clone()));
        return r;
      })
      .catch(() => caches.match(event.request))
  );
});