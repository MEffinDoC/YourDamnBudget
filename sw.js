// YDB v14b
const SCOPE='/YourDamnBudget/', CACHE='ydb-v14b';
const ASSETS=[`${SCOPE}`,`${SCOPE}index.html`,`${SCOPE}styles.css?v=14b`,`${SCOPE}app.js?v=14b`,`${SCOPE}engine.js`,`${SCOPE}wizard.js?v=14b`,`${SCOPE}manifest.webmanifest`,`${SCOPE}icons/flat-192.png`,`${SCOPE}icons/flat-512.png`];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url); if(!u.pathname.startsWith(SCOPE)) return;
  e.respondWith(fetch(e.request).then(r=>{caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;}).catch(()=>caches.match(e.request)));});