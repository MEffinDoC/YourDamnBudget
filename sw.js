// YDB sw.js v15c
const SCOPE='/YourDamnBudget/', CACHE='ydb-v15c';
const ASSETS=[`${SCOPE}`,`${SCOPE}index.html`,`${SCOPE}styles.css?v=15.3`,`${SCOPE}app.js?v=15.3`,`${SCOPE}engine.js`,`${SCOPE}wizard.js?v=15.2`,`${SCOPE}manifest.webmanifest`,`${SCOPE}icons/flat-192.png`,`${SCOPE}icons/flat-512.png`];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url); if(!u.pathname.startsWith(SCOPE)) return;
  e.respondWith(fetch(e.request).then(r=>{caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;}).catch(()=>caches.match(e.request)));});