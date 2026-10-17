'use strict';
// Spezezy server - zero dependencies, Node 18+.  Serves the app, stores classes/results,
// sends daily WhatsApp messages (Meta WhatsApp Cloud API) and Web Push reminders.
process.env.TZ=process.env.TZ||'Asia/Kolkata';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const E=process.env,PORT=+E.PORT||8080,DATA=E.DATA_DIR||path.join(__dirname,'data'),PUB=E.PUBLIC_DIR||path.join(__dirname,'public');
const WA={token:E.WA_TOKEN||'',phone:E.WA_PHONE_ID||'',tpl:E.WA_TEMPLATE||'spezezy_daily',lang:E.WA_LANG||'en',ver:E.WA_API_VERSION||'v20.0'};
WA.mode=E.WA_MODE||(WA.token&&WA.phone?'template':'dry');
const TICK=+E.TICK_MS||20000;
fs.mkdirSync(DATA,{recursive:true});
const b64u=b=>Buffer.from(b).toString('base64url'),sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
// ---------- VAPID keys (Web Push) ----------
function genKeys(){const{publicKey,privateKey}=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}),j=privateKey.export({format:'jwk'});
  return{pub:b64u(Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')])),priv:j.d,x:j.x,y:j.y}}
if(process.argv.includes('--gen-keys')){const k=genKeys();console.log('VAPID_PUBLIC='+k.pub+'\nVAPID_PRIVATE='+k.priv+'\nVAPID_SUBJECT=mailto:you@example.com');process.exit(0)}
let VAPID=null;
try{if(E.VAPID_PUBLIC&&E.VAPID_PRIVATE){const pub=Buffer.from(E.VAPID_PUBLIC,'base64url');VAPID={pub:E.VAPID_PUBLIC,priv:E.VAPID_PRIVATE,x:b64u(pub.subarray(1,33)),y:b64u(pub.subarray(33,65))}}
  else{const f=path.join(DATA,'vapid.json');VAPID=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):(()=>{const k=genKeys();fs.writeFileSync(f,JSON.stringify(k));return k})()}}catch(e){console.error('VAPID setup failed:',e.message)}
const VKEY=VAPID&&crypto.createPrivateKey({key:{kty:'EC',crv:'P-256',x:VAPID.x,y:VAPID.y,d:VAPID.priv},format:'jwk'});
const vapidJwt=aud=>{const h=b64u(JSON.stringify({typ:'JWT',alg:'ES256'})),p=b64u(JSON.stringify({aud,exp:Math.floor(Date.now()/1e3)+12*3600,sub:E.VAPID_SUBJECT||'mailto:admin@example.com'})),
  s=crypto.sign('sha256',Buffer.from(h+'.'+p),{key:VKEY,dsaEncoding:'ieee-p1363'});return h+'.'+p+'.'+b64u(s)};
async function sendPush(sub){const u=new URL(sub.endpoint);
  const r=await fetch(sub.endpoint,{method:'POST',headers:{TTL:'7200',Urgency:'high',Authorization:'vapid t='+vapidJwt(u.origin)+', k='+VAPID.pub},signal:AbortSignal.timeout(15000)});return r.status}
// ---------- storage (JSON file, atomic writes) ----------
let DB={classes:{},students:{}};try{DB=JSON.parse(fs.readFileSync(path.join(DATA,'db.json'),'utf8'))}catch(e){}
DB.pro=DB.pro||{};
let dirty=0;const save=()=>{dirty=1},flush=()=>{if(!dirty)return;dirty=0;const t=path.join(DATA,'db.json.tmp');fs.writeFileSync(t,JSON.stringify(DB));fs.renameSync(t,path.join(DATA,'db.json'))};
setInterval(flush,1000).unref();for(const s of['SIGTERM','SIGINT'])process.on(s,()=>{flush();process.exit(0)});
// ---------- the app's own generator ----------
const engine=require('./lib/engine');let ENG=null,ENGD='';
const dateStr=()=>new Date().toLocaleDateString('en-CA');
function eng(){const d=dateStr();if(!ENG||ENGD!==d){ENG=engine.load(path.join(PUB,'index.html'));ENGD=d;if(ENG.err)console.error('engine warning:',ENG.err)}return ENG}
function packText(cfg,key){const e=eng();e.ctx.__c=cfg;return e.run('todayText(__c,'+(key?1:0)+')')}
function wkNow(){return eng().run('wkKey()')}
// ---------- helpers ----------
const ID_CH='ABCDEFGHJKMNPQRSTUVWXYZ23456789',newId=()=>{let s='';for(let i=0;i<6;i++)s+=ID_CH[crypto.randomInt(ID_CH.length)];return DB.classes[s]?newId():s};
const hashPin=(pin,salt=crypto.randomBytes(16).toString('hex'))=>salt+':'+crypto.scryptSync(String(pin),salt,32).toString('hex');
const okPin=(pin,h)=>{const[s,x]=h.split(':'),y=hashPin(pin,s).split(':')[1];return crypto.timingSafeEqual(Buffer.from(x),Buffer.from(y))};
const str=(x,n)=>String(x==null?'':x).slice(0,n),hmOk=x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x),toMin=x=>+x.slice(0,2)*60+ +x.slice(3);
const phoneNorm=p=>{p=String(p||'').replace(/\D/g,'');return p.length==10?'91'+p:p.length>=11&&p.length<=15?p:''};
function cleanCfg(c,old){c=c||{};const t=c.test||{},lv=['easy','mid','hard'];
  const o={v:1,name:str(c.name,60).trim(),seed:/^[a-z0-9]{4,16}$/.test(c.seed)?c.seed:(old&&old.seed)||crypto.randomBytes(5).toString('hex'),
   time:hmOk(c.time)?c.time:'17:00',n:Math.max(3,Math.min(30,+c.n||10)),dir:['he','eh','mix'].includes(c.dir)?c.dir:'he',
   plan:Array.from({length:7},(_,i)=>lv.includes((c.plan||[])[i])?c.plan[i]:'easy'),
   test:{day:Math.max(0,Math.min(6,+t.day||0)),from:hmOk(t.from)?t.from:'10:00',to:hmOk(t.to)?t.to:'12:00',n:Math.max(5,Math.min(40,+t.n||20))},
   hw:(Array.isArray(c.hw)?c.hw:[]).slice(0,100).filter(x=>Array.isArray(x)&&x.length==2).map(x=>[str(x[0],200),str(x[1],200)])};
  if(!o.name)throw httpErr(400,'Class name is required');return o}
const cleanRoster=r=>(Array.isArray(r)?r:[]).slice(0,200).map(x=>({n:str(x.n,40).trim(),p:phoneNorm(x.p)})).filter(x=>x.n&&x.p);
const httpErr=(code,msg)=>Object.assign(new Error(msg),{code});
const hits=new Map();const rl=(k,max,ms)=>{const n=Date.now(),a=(hits.get(k)||[]).filter(t=>n-t<ms);if(a.length>=max)throw httpErr(429,'Too many tries. Please wait a few minutes.');a.push(n);hits.set(k,a)};
setInterval(()=>{const n=Date.now();for(const[k,a]of hits)if(!a.some(t=>n-t<6e5))hits.delete(k)},6e4).unref();
// ---------- WhatsApp Cloud API ----------
const waText=s=>String(s).replace(/\s*\n\s*/g,' | ').replace(/ {4,}/g,'   ').slice(0,1000);
async function waSend(to,name,text){
  const rec={t:new Date().toISOString(),to,mode:WA.mode};
  try{
    if(WA.mode==='dry'){fs.appendFileSync(path.join(DATA,'outbox.log'),JSON.stringify({...rec,name,text})+'\n');return{...rec,ok:true,dry:true}}
    const body=WA.mode==='text'?{messaging_product:'whatsapp',to,type:'text',text:{body:'Hi '+name+'!\n'+text}}
      :{messaging_product:'whatsapp',to,type:'template',template:{name:WA.tpl,language:{code:WA.lang},components:[{type:'body',parameters:[{type:'text',text:waText(name)},{type:'text',text:waText(text)}]}]}};
    const r=await fetch('https://graph.facebook.com/'+WA.ver+'/'+WA.phone+'/messages',{method:'POST',headers:{Authorization:'Bearer '+WA.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const j=await r.json().catch(()=>({}));return{...rec,ok:r.ok,status:r.status,err:r.ok?undefined:str(j.error&&j.error.message,200)}
  }catch(e){return{...rec,ok:false,err:str(e.message,200)}}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function sendRoster(c,kind){const out=[];let text;
  if(kind==='test'){const t=c.cfg.test,D=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];text='Your weekly test is open today, '+D[t.day]+', from '+t.from+' to '+t.to+'. Open Spezezy > Class > Start the test.'}
  else text=packText(c.cfg,kind==='key');
  for(const m of c.roster||[]){out.push({n:m.n,...(await waSend(m.p,m.n,text))});await sleep(WA.mode==='dry'?0:300)}
  c.log=[...(c.log||[]),...out.map(x=>({t:x.t,n:x.n,ok:x.ok,err:x.err,kind}))].slice(-60);save();return out}
async function pushClass(c,only){let n=0;const subs=Object.entries(DB.students).filter(([k,s])=>s.cid===c.id&&s.push&&(!only||only(s)));
  for(const[k,s]of subs){try{const st=await sendPush(s.push);if(st===404||st===410){s.push=null;save()}else if(st<300)n++}catch(e){}}return n}
// ---------- scheduler ----------
const inWin=(now,t)=>now>=t&&now<t+5;
async function tick(){const d=new Date(),date=d.toLocaleDateString('en-CA'),now=d.getHours()*60+d.getMinutes(),dow=d.getDay();
  for(const c of Object.values(DB.classes)){if(c.auto===false)continue;const s=c.sent=c.sent||{},t=toMin(c.cfg.time),T=c.cfg.test;
    try{
      if(inWin(now,t)&&s.daily!==date){s.daily=date;save();await sendRoster(c,'questions');await pushClass(c)}
      for(const o of[60,180])if(inWin(now,t+o)&&s['n'+o]!==date){s['n'+o]=date;save();await pushClass(c,st=>!(st.daily&&st.daily[date]))}
      if(dow===T.day&&inWin(now,toMin(T.from))&&s.test!==date){s.test=date;save();await sendRoster(c,'test');await pushClass(c)}
      if(dow===T.day&&inWin(now,toMin(T.to))&&s.sum!==date&&c.teacherPhone){s.sum=date;save();const b=board(c);await waSend(c.teacherPhone,'Teacher','Weekly test results for '+c.cfg.name+': '+(b.board.map((x,i)=>(i+1)+'. '+x.n+' '+x.s+'/'+x.t).join(', ')||'no results yet'))}
    }catch(e){console.error('tick error',c.id,e.message)}}}
setInterval(()=>tick().catch(e=>console.error(e)),TICK).unref();
// ---------- board ----------
function board(c){const wk=wkNow(),date=dateStr(),st=Object.values(DB.students).filter(s=>s.cid===c.id),by={};
  st.forEach(s=>{const r=(s.tests||{})[wk];if(r&&(!by[s.name]||r.s>by[s.name].s))by[s.name]={n:s.name,s:r.s,t:r.t,w:r.w||[]}});
  const rows=Object.values(by).sort((a,b)=>b.s-a.s),mis={};
  rows.forEach(r=>r.w.forEach(x=>{(mis[x.p]=mis[x.p]||{p:x.p,a:x.a,n:[]}).n.push(r.n)}));
  const names=[...new Set(st.map(s=>s.name))],done=names.filter(n=>st.some(s=>s.name===n&&s.daily&&s.daily[date]));
  return{wk,board:rows.map(({n,s,t})=>({n,s,t})),mistakes:Object.values(mis).sort((a,b)=>b.n.length-a.n.length).slice(0,10),
   today:{done,pending:names.filter(n=>!done.includes(n))},students:names.length,push:st.filter(s=>s.push).length,wa:{mode:WA.mode,last:(c.log||[]).slice(-8)}}}
// ---------- HTTP ----------
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain'};
const gz=new Map();
function serveStatic(req,res){let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';
  const f=path.normalize(path.join(PUB,p));if(!f.startsWith(path.resolve(PUB)+path.sep)&&f!==path.resolve(PUB)){res.writeHead(403);return res.end()}
  fs.stat(f,(e,st)=>{if(e||!st.isFile()){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found')}
    const ext=path.extname(f),h={'Content-Type':MIME[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':/sw\.js|index\.html|srv\.js|manifest/.test(f)?'no-cache':'public, max-age=86400'};
    const zip=/text|javascript|json|manifest/.test(h['Content-Type'])&&/gzip/.test(req.headers['accept-encoding']||'')&&st.size>1024;
    if(!zip){res.writeHead(200,{...h,'Content-Length':st.size});return fs.createReadStream(f).pipe(res)}
    const k=f+st.mtimeMs;let z=gz.get(k);if(!z){z=zlib.gzipSync(fs.readFileSync(f));gz.clear();gz.set(k,z)}
    res.writeHead(200,{...h,'Content-Encoding':'gzip','Content-Length':z.length,Vary:'Accept-Encoding'});res.end(z)})}
const readBody=req=>new Promise((ok,no)=>{let n=0;const a=[];req.on('data',c=>{n+=c.length;if(n>2e5){no(httpErr(413,'Request too large'));req.destroy()}else a.push(c)});req.on('end',()=>{try{ok(a.length?JSON.parse(Buffer.concat(a)):{})}catch(e){no(httpErr(400,'Invalid JSON'))}});req.on('error',no)});
const ip=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
const teacher=req=>{const k=req.headers['x-teacher-key']||'';const c=Object.values(DB.classes).find(c=>k&&c.tkh===sha(k));if(!c)throw httpErr(401,'Teacher key not valid');return c};
const student=req=>{const t=req.headers['x-student-token']||'',s=DB.students[sha(t)];if(!t||!s)throw httpErr(401,'Please join the class again');return s};
// ---------- Spezezy Pro promo codes: each code works ONE time ----------
// Only salted hashes of the codes live here (PBKDF2). Override with PRO_HASHES=hash1,hash2 in .env
const PRO_H=(E.PRO_HASHES||'ffe2d56c17c1f4605d4c049b945ed030af00349f4a91c30cb1116f201d8a16ed,4cc445aa1cddb026380da10d164edd15fcea9c14d0c26a35a4acee24bc1986e0').split(',').map(x=>x.trim()).filter(Boolean);
const proNorm=c=>{let n=String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');return n};
const proHash=c=>new Promise((ok,no)=>crypto.pbkdf2(c,'spz-pro-2',150000,32,'sha256',(e,k)=>e?no(e):ok(k.toString('hex'))));
const admin=req=>{const k=String(req.headers['x-admin-key']||'');if(!E.ADMIN_KEY||k.length<8||k!==E.ADMIN_KEY)throw httpErr(401,'Admin key not valid');};
const routes={
 'POST /api/pro/redeem':async(req,b)=>{rl('p'+ip(req),10,36e5);const n=proNorm(str(b.code,30));if(n.length!==8)throw httpErr(400,'Enter the full code, like AB12-CD34.');
   const h=await proHash(n);if(!PRO_H.includes(h))throw httpErr(403,'That code is not valid. Check it and try again.');
   const rec=DB.pro[h],tok=str(b.token,80);
   if(!rec){const t=crypto.randomBytes(16).toString('hex');DB.pro[h]={th:sha(t),at:Date.now()};save();return{ok:true,token:t}}
   if(tok&&sha(tok)===rec.th)return{ok:true,token:tok,again:true};
   throw httpErr(409,'This code was already used on another phone.')},
 'GET /api/pro/status':async req=>{admin(req);return{codes:PRO_H.map((h,i)=>({slot:i+1,used:!!DB.pro[h],at:DB.pro[h]?new Date(DB.pro[h].at).toISOString():null}))}},
 'POST /api/pro/release':async(req,b)=>{admin(req);const n=proNorm(str(b.code,30)),h=await proHash(n);if(!PRO_H.includes(h))throw httpErr(404,'Unknown code');delete DB.pro[h];save();return{ok:true}},
 'GET /api/health':async()=>({ok:true,wa:WA.mode,push:!!VAPID,tz:process.env.TZ,time:new Date().toISOString()}),
 'GET /api/push/key':async()=>({key:VAPID?VAPID.pub:''}),
 'POST /api/class/create':async(req,b)=>{rl('c'+ip(req),20,36e5);const pin=str(b.pin,40);if(pin.length<4)throw httpErr(400,'PIN needs 4 or more characters');
   const id=newId(),key=crypto.randomBytes(24).toString('hex');DB.classes[id]={id,cfg:cleanCfg(b.cfg),pin:hashPin(pin),tkh:sha(key),roster:cleanRoster(b.roster),teacherPhone:phoneNorm(b.teacherPhone),auto:true,sent:{},log:[],created:Date.now()};save();return{id,teacherKey:key}},
 'POST /api/class/update':async(req,b)=>{const c=teacher(req);if(b.cfg)c.cfg=cleanCfg(b.cfg,c.cfg);if(b.roster)c.roster=cleanRoster(b.roster);if('teacherPhone'in b)c.teacherPhone=phoneNorm(b.teacherPhone);
   if(typeof b.pin==='string'&&b.pin.length>=4)c.pin=hashPin(b.pin.slice(0,40));if(typeof b.auto==='boolean')c.auto=b.auto;save();return{ok:true,cfg:c.cfg}},
 'POST /api/join':async(req,b)=>{const id=str(b.id,10).toUpperCase().trim();rl('j'+ip(req)+id,8,6e5);const c=DB.classes[id];
   if(!c||!okPin(str(b.pin,40),c.pin))throw httpErr(403,'Wrong class ID or PIN');const name=str(b.name,40).trim()||'Student',tok=crypto.randomBytes(24).toString('hex');
   DB.students[sha(tok)]={cid:id,name,joined:Date.now(),push:null,daily:{},tests:{}};save();return{id,token:tok,cfg:c.cfg}},
 'POST /api/progress':async(req,b)=>{const s=student(req);
   if(b.type==='daily'){s.daily[dateStr()]=1;const k=Object.keys(s.daily).sort().slice(-60);s.daily=Object.fromEntries(k.map(x=>[x,1]))}
   else if(b.type==='test'&&/^\d{4}-\d{2}-\d{2}$/.test(b.wk)){const t=Math.max(1,Math.min(100,+b.t||1));s.tests[b.wk]={s:Math.max(0,Math.min(t,+b.s||0)),t,w:(Array.isArray(b.w)?b.w:[]).slice(0,10).map(x=>({p:str(x.p,200),a:str(x.a,200),y:str(x.y,200)}))}}
   else throw httpErr(400,'Unknown progress type');save();return{ok:true}},
 'POST /api/push/subscribe':async(req,b)=>{const s=student(req),u=b.sub||{};if(typeof u.endpoint!=='string'||!/^https:\/\//.test(u.endpoint)||u.endpoint.length>600)throw httpErr(400,'Bad subscription');s.push={endpoint:u.endpoint};save();return{ok:true}},
 'GET /api/board':async req=>{const c=teacher(req);return{...board(c),roster:c.roster.length,auto:c.auto!==false,cfg:c.cfg,teacherPhone:c.teacherPhone}},
 'POST /api/send-now':async(req,b)=>{const c=teacher(req);rl('s'+c.id,30,36e5);const k=['questions','key','test'].includes(b.kind)?b.kind:'questions';
   const r=await sendRoster(c,k),p=k==='key'?0:await pushClass(c);return{sent:r.filter(x=>x.ok).length,failed:r.filter(x=>!x.ok).map(x=>({n:x.n,err:x.err})),push:p,mode:WA.mode}}
};
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'),key=req.method+' '+u.pathname;
  if(E.ALLOW_ORIGIN){res.setHeader('Access-Control-Allow-Origin',E.ALLOW_ORIGIN);res.setHeader('Access-Control-Allow-Headers','content-type,x-teacher-key,x-student-token');if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}}
  if(!u.pathname.startsWith('/api/'))return serveStatic(req,res);
  try{const h=routes[key];if(!h)throw httpErr(404,'Not found');const out=await h(req,req.method==='POST'?await readBody(req):{});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(out))}
  catch(e){const code=e.code>=400&&e.code<600?e.code:500;if(code===500)console.error(e);res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify({error:code===500?'Server error':e.message}))}
}).listen(PORT,()=>console.log('Spezezy server on :'+PORT+' | WhatsApp: '+WA.mode+' | Push: '+(VAPID?'on':'off')+' | TZ: '+process.env.TZ));
module.exports={tick};
