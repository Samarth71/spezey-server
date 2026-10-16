// Spezezy service worker. To release an update: change V (spezezy-v5 -> spezezy-v6).
const V='spezezy-v5',FONTS='spezezy-fonts',PREF='spezezy-pref',CORE=['./','index.html','srv.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!==FONTS&&x!==PREF).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 if(u.origin===location.origin){
  if(u.pathname.startsWith('/api/'))return;
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(h=>h||fetch(r).then(n=>{const c=n.clone();caches.open(V).then(x=>x.put(r,c));return n}).catch(()=>caches.match('index.html'))));return}
 if(/(googleapis|gstatic)\.com$/.test(u.hostname)){
  e.respondWith(caches.open(FONTS).then(c=>c.match(r).then(h=>{const f=fetch(r).then(n=>{c.put(r,n.clone());return n}).catch(()=>h);return h||f})))}
});
const PM={m:["{n}, aaj ki class practice ready hai. Chal, ek-ek sawal! 💪","Chhota sa practice, bada sa fayda {n}. Tap karke shuru kar.","Streak bachani hai na {n}? App khol, 2 minute lagenge. 🔥"],
c:["Teacher dekh raha hai {n}... shayad. Class practice kar le. 👀","Breaking news: {n} ki class practice abhi tak pending hai. Source: Spezezy.","Notification dekh liya, ab app bhi khol le {n}. 😂"],
r:["{n}, notification dekhne ka time hai, practice ka nahi? Interesting. 😏","Teacher ko kal kya bahana dega {n}? Abhi kar le practice. 🤔","Grammar tujhe dekh kar rota hai {n}. Chup kara, app khol. 😭"]},
PT={m:'Spezezy 💪',c:'Spezezy 😂',r:'Spezezy 🔥'};
async function prefs(){try{const r=await (await caches.open(PREF)).match('p');return r?await r.json():{}}catch(e){return{}}}
self.addEventListener('push',e=>{e.waitUntil(prefs().then(p=>{const st=p.rl||'mix',cats=st=='soft'?['m','c']:st=='roast'?['r','r','c']:['m','c','r'],c=cats[Math.random()*cats.length|0],a=PM[c],m=a[Math.random()*a.length|0].replace(/\{n\}/g,p.n||'dost');
 return self.registration.showNotification(PT[c],{body:m,icon:'icon-192.png',badge:'icon-192.png',tag:'spezezy',renotify:true})}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(l=>l.length?l[0].focus():clients.openWindow('./')))});
