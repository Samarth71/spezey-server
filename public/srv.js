// Spezezy server connection. Loaded after the main app. Adds: register class online,
// join with Class ID + PIN, automatic results, push reminders, teacher dashboard.
(function(){
let up=null,B=null,busy=0;
const u8=k=>{const p='='.repeat((4-k.length%4)%4),r=atob((k+p).split('-').join('+').split('_').join('/'));return Uint8Array.from(r,c=>c.charCodeAt(0))};
async function api(p,body,auth){const h={'content-type':'application/json'};if(auth==='t')h['x-teacher-key']=S.tkey||'';if(auth==='s')h['x-student-token']=S.stok||'';
  const r=await fetch((S.srvUrl||'')+p,{method:body?'POST':'GET',headers:h,body:body?JSON.stringify(body):undefined}),j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||('Server error '+r.status));return j}
const here=()=>/^https?:/.test(location.protocol)&&!/claude/i.test(location.host);
async function probe(){if(!here()&&!S.srvUrl){up=false;return}try{await api('/api/health');up=true}catch(e){up=false}if(tab=='cls'&&S.name)render()}
const ST=()=>`<p class="sm">${up?'Server connected.':'Server not reachable right now. Local mode still works.'}</p>`;
async function srvReg(){if(busy)return;busy=1;try{const r=await api('/api/class/create',{cfg:S.cls,pin:S.pin,roster:S.roster||[],teacherPhone:S.tph||''});S.sid=r.id;S.tkey=r.teacherKey;save();await srvBoard()}catch(e){alert(e.message)}busy=0;render()}
async function srvSync(){if(!S.tkey)return;try{await api('/api/class/update',{cfg:S.cls,roster:S.roster||[],teacherPhone:S.tph||'',pin:S.pin},'t')}catch(e){}}
async function srvBoard(){try{B=await api('/api/board',null,'t')}catch(e){B=null}if(tab=='cls')render()}
async function srvSend(kind){try{const r=await api('/api/send-now',{kind},'t');alert('WhatsApp ('+r.mode+'): '+r.sent+' sent'+(r.failed.length?', '+r.failed.length+' failed':'')+'. Push: '+r.push+' phone(s).')}catch(e){alert(e.message)}srvBoard()}
async function srvJoin(){const id=document.querySelector('#sj').value,pin=document.querySelector('#sjp').value;try{const r=await api('/api/join',{id,pin,name:S.name});S.cls=r.cfg;S.role='s';S.sid=r.id;S.stok=r.token;S.code='';save();render()}catch(e){alert(e.message)}}
async function srvPush(){try{const k=(await api('/api/push/key')).key;if(!k)throw new Error('The server has no push key.');if(!('PushManager'in window))throw new Error('This browser cannot receive push. On iPhone: add the app to the Home Screen first.');
  if(await Notification.requestPermission()!=='granted')throw new Error('Please allow notifications.');const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:u8(k)});
  await api('/api/push/subscribe',{sub:sub.toJSON()},'s');S.pushOn=1;save();render()}catch(e){alert(e.message)}}
function report(){if(!S.stok)return;try{if(Q.kind==='c')api('/api/progress',{type:'daily'},'s').catch(()=>{});
  else if(Q.kind==='tst'){const r=(S.tr||{})[wkKey()];if(r)api('/api/progress',{type:'test',wk:wkKey(),s:r.s,t:r.t,w:r.w||[]},'s').catch(()=>{})}}catch(e){}}
window.srvReg=srvReg;window.srvBoard=srvBoard;window.srvSend=srvSend;window.srvJoin=srvJoin;window.srvPush=srvPush;
window.srvPh=()=>{S.tph=document.querySelector('#tph').value;save();srvSync();alert('Saved')};
function teacherCard(){if(!up)return '<div class="fp"><b>Server</b>'+ST()+'</div>';
  if(!S.tkey)return `<div class="fp"><b>5. Automatic sending (server)</b><p class="sm">Register this class on the server. Then it sends the questions on WhatsApp every day at ${esc(S.cls.time)} by itself, and students can join with a short Class ID.</p><button class="go" onclick="srvReg()">Register class on server</button></div>`;
  const b=B,li=a=>a&&a.length?esc(a.join(', ')):'-';
  return `<div class="fp"><b>5. Automatic sending is ON</b><p class="sm">Class ID for students (with the PIN):</p><div style="font:700 34px 'Plus Jakarta Sans',sans-serif;letter-spacing:4px;margin:4px 0 8px">${esc(S.sid)}</div>
  <p class="sm">Every day at ${esc(S.cls.time)} the server sends today's questions on WhatsApp to your students list, and a push reminder to phones that allowed it.</p>
  <b>Your WhatsApp number (for weekly summary)</b><input id="tph" value="${esc(S.tph||'')}" placeholder="9876543210" style="margin:6px 0"><button class="go d" onclick="srvPh()">Save number</button>
  <button class="go" onclick="srvSend('questions')">Send today's questions now</button><button class="go d" onclick="srvSend('key')">Send answer key now</button><button class="go d" onclick="srvSend('test')">Send "test is open" now</button>
  <button class="go d" onclick="srvBoard()">Refresh dashboard</button>
  ${b?`<div style="margin-top:14px"><b>Today</b><p class="sm" style="margin:4px 0">Done: ${li(b.today.done)}<br>Not yet: ${li(b.today.pending)}</p><b>Weekly test leaderboard</b>${b.board.length?'<table class="lb">'+b.board.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.n)}</td><td><b>${x.s}/${x.t}</b></td></tr>`).join('')+'</table>':'<p class="sm" style="margin:4px 0">No results yet.</p>'}
  <b>Most missed sentences</b>${b.mistakes.length?b.mistakes.map(m=>`<p class="sm" style="margin:8px 0 0">${esc(m.p)}<br><b style="color:var(--ink)">${esc(m.a)}</b><br>Missed by ${m.n.length}: ${esc(m.n.join(', '))}</p>`).join(''):'<p class="sm" style="margin:4px 0">None yet.</p>'}
  <p class="sm" style="margin-top:10px">${b.students} student(s) joined \u00b7 ${b.push} with push \u00b7 WhatsApp mode: ${esc(b.wa.mode)}</p></div>`:''}</div>`}
function studentCard(){if(!S.stok)return up?'':'';return `<div class="fp"><b>Connected to your teacher</b><p class="sm">Your results are sent automatically.</p>${S.pushOn?'<p class="sm">Push reminders are ON on this phone.</p>':'<button class="go" onclick="srvPush()">Turn on push reminders</button>'}</div>`}
const JOIN=()=>`<div class="fp"><b>Join online with Class ID</b><p class="sm">Your teacher gives you a Class ID and a PIN.</p><input id="sj" placeholder="Class ID, e.g. K7M2QX" style="margin:8px 0" autocapitalize="characters"><input id="sjp" placeholder="PIN"><button class="go" onclick="srvJoin()">Join online</button></div>`;
const _tv=teacherView;teacherView=function(c){return _tv(c)+teacherCard()};
const _sv=studentView;studentView=function(c){return _sv(c)+studentCard()};
const _ch=clsHTML;clsHTML=function(){let h=_ch();if(!S.cls&&!edit&&up)h=h.replace(/<\/div>$/,JOIN()+'</div>');return h};
const _cd=clsDone;clsDone=function(){const h=_cd();report();return h};
const _mk=mkCls;mkCls=async function(){await _mk();if(S.tkey&&S.role==='t')srvSync()};
const _sr=saveRos;saveRos=function(){_sr();if(S.tkey&&S.role==='t')srvSync()};
const _lv=leaveCls;leaveCls=function(){_lv();if(!S.cls){S.sid='';S.tkey='';S.stok='';S.pushOn=0;save()}};
const _ck=chk30;chk30=function(){const r=_ck();if(r&&S.stok)api('/api/progress',{type:'daily'},'s').catch(()=>{});return r};
probe().then(()=>{if(S.tkey&&up)srvBoard()});
})();
