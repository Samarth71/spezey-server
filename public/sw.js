// Spezezy service worker. To release an update: change V (spezezy-v4 -> spezezy-v5).
const V='spezezy-v4',FONTS='spezezy-fonts',CORE=['./','index.html','srv.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!==FONTS).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 if(u.origin===location.origin){
  if(u.pathname.startsWith('/api/'))return;
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(h=>h||fetch(r).then(n=>{const c=n.clone();caches.open(V).then(x=>x.put(r,c));return n}).catch(()=>caches.match('index.html'))));return}
 if(/(googleapis|gstatic)\.com$/.test(u.hostname)){
  e.respondWith(caches.open(FONTS).then(c=>c.match(r).then(h=>{const f=fetch(r).then(n=>{c.put(r,n.clone());return n}).catch(()=>h);return h||f})))}
});
self.addEventListener('push',e=>{e.waitUntil(self.registration.showNotification('Spezezy',{body:'Your class practice is ready. Tap to open.',icon:'icon-192.png',badge:'icon-192.png',tag:'spezezy',renotify:true}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(l=>l.length?l[0].focus():clients.openWindow('./')))});
