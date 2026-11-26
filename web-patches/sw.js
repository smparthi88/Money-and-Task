const C='mt-v24';
const BINS=['00','01','02','03a','03b','04','05','06','07','08','09','10','11','12','13','14','15','16'].map(i=>'/o/p'+i+'.bin?v=22');
const SHELL=['/','/manifest.webmanifest','/favicon-32.png','/icon-192.png','/o/off.js?v=1','/o/x.js?v=2','/o/imp.js?v=2','/o/dash.js?v=1','/o/sms.js?v=2','/o/split.js?v=1',...BINS];
const CDN=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js','https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'];
const CDN_HOST=/^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;
const grab=(c,u)=>fetch(u,{cache:'reload',mode:u.startsWith('http')?'cors':'same-origin'}).catch(()=>fetch(u,{mode:'no-cors'})).then(r=>(r.ok||r.type==='opaque')&&c.put(u,r)).catch(()=>{});
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all([...SHELL,...CDN].map(u=>grab(c,u)))).then(()=>self.skipWaiting(),()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 const same=u.origin===location.origin;if(!same&&!CDN_HOST.test(u.hostname))return;
 e.respondWith(netFirst(r,same?6000:8000))});
/* network first (fresh app when online); cache when offline or the network is too slow */
async function netFirst(r,ms){
 const c=await caches.open(C);
 const net=fetch(r).then(res=>{if(res.ok||res.type==='opaque')c.put(r,res.clone()).catch(()=>{});return res});
 net.catch(()=>{});
 const fromCache=()=>c.match(r).then(m=>m||(r.mode==='navigate'?c.match('/'):undefined));
 try{return await Promise.race([net,new Promise((_,rej)=>setTimeout(()=>rej('slow'),ms))])}
 catch(_){const m=await fromCache();if(m)return m;return net}
}
