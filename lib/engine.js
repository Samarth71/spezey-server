'use strict';
// Loads the app's OWN question generator (from public/index.html) in a sandbox,
// so the server and the students' phones always produce the same sentences.
const vm=require('vm'),fs=require('fs');
const U=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>'':k==='then'?undefined:k==='length'?0:U(),apply:()=>U(),construct:()=>U(),set:()=>true});
function load(htmlPath,nowMs){
  const html=fs.readFileSync(htmlPath,'utf8'),m=html.match(/<script>\n([\s\S]*?)<\/script>/);
  if(!m)throw new Error('main script not found in '+htmlPath);
  const base=nowMs||Date.now();
  class FD extends Date{constructor(...a){a.length?super(...a):super(base)}static now(){return base}}
  const ctx={document:U(),navigator:{onLine:true,language:'en'},localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    location:{hash:'',href:'http://localhost/',host:'localhost',protocol:'https:',origin:'http://localhost'},
    matchMedia:()=>({matches:false}),Notification:class{static get permission(){return 'default'}},addEventListener(){},
    setInterval(){return 0},setTimeout(){return 0},requestAnimationFrame(){},alert(){},confirm(){return false},prompt(){return null},scrollTo(){},scrollY:0,
    performance:{now:()=>0},TextEncoder,TextDecoder,crypto:require('crypto').webcrypto,Blob,Response,URL,Image:class{},File:class{},console,Intl,Date:FD,btoa,atob,CompressionStream,DecompressionStream};
  ctx.window=ctx;vm.createContext(ctx);
  try{vm.runInContext(m[1],ctx,{filename:'app.js'})}catch(e){ctx.__loadError=String(e&&e.message||e)}
  return{ctx,run:x=>vm.runInContext(x,ctx),err:ctx.__loadError};
}
module.exports={load};
