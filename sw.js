// YDB SW – v15.9.0 (LKG)
const CACHE = 'ydb-v15m';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=15.9.0',
  './app.js?v=15.9.0',
  './manifest.webmanifest',
  './icons/flat-192.png',
  './icons/flat-512.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', e=>{
  const req = e.request;
  e.respondWith(
    caches.match(req).then(cached=>{
      const fetchPromise = fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put(req, copy));
        return res;
      }).catch(()=>cached);
      return cached || fetchPromise;
    })
  );
});