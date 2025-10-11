// YDB LKG SW (very light)
const CACHE = 'ydb-lkg-15.8';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=15.8-lkg',
  './app.js?v=15.8-lkg',
  './manifest.webmanifest'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
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