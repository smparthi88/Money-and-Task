/* Money & Tasks – offline mode v1
   Loaded BEFORE the app (index.html). Wraps window.fetch for Supabase REST calls:
   - online: normal request; results are kept in an on-device cache (IndexedDB, per user)
   - offline: reads come from the cache, writes are applied to the cache and queued
   - back online: queued writes are sent to Supabase in order, then the app reloads its data */
(function(){
if(window.__OFF)return;
const SBURL="https://tyzpyohjzmkmokediwhx.supabase.co",REF="tyzpyohjzmkmokediwhx";
const ofetch=window.fetch.bind(window);
const TABLES=["accounts","categories","transactions","tasks","subtasks","profiles","sms_txns"];
const HAS_ID=new Set(["accounts","categories","transactions","tasks","subtasks","sms_txns"]);
const PK={profiles:["user_id"]};
const DEF={accounts:{acc_type:"bank",opening_balance:0,active:true,interest_per:"year"},tasks:{priority:"medium",status:"pending",recurrence:"none"},subtasks:{done:false},sms_txns:{status:"pending"}};
const RESERVED=new Set(["select","order","offset","limit","on_conflict","columns"]);
const st={offline:!navigator.onLine,u:{},syncing:null,lastSync:0};
const O=window.__OFF={st,sync:()=>sync(true),pending:()=>pendingCount()};

/* ---------- IndexedDB key/value ---------- */
let dbp=null;
const db=()=>dbp||(dbp=new Promise((res,rej)=>{try{const r=indexedDB.open("mt-offline",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>{const d=r.result;d.onclose=()=>{dbp=null};d.onversionchange=()=>{d.close();dbp=null};res(d)};r.onerror=()=>{dbp=null;rej(r.error)}}catch(e){dbp=null;rej(e)}}));
const idb=(mode,fn)=>db().then(d=>new Promise((res,rej)=>{const tx=d.transaction("kv",mode),q=fn(tx.objectStore("kv"));tx.oncomplete=()=>res(q&&q.result);tx.onerror=tx.onabort=()=>rej(tx.error)}));
const iget=k=>idb("readonly",s=>s.get(k)).catch(()=>undefined);
const iput=(k,v)=>idb("readwrite",s=>s.put(v,k)).catch(e=>console.warn("offline cache save",e));

/* ---------- helpers ---------- */
const clone=o=>o==null?o:JSON.parse(JSON.stringify(o));
const uuid=()=>crypto.randomUUID?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
const jwt=t=>{try{const p=String(t||"").replace(/^Bearer\s+/i,"").split(".")[1];return JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g,"+").replace(/_/g,"/")))))}catch(e){return null}};
const storedSession=()=>{try{const v=JSON.parse(localStorage.getItem("sb-"+REF+"-auth-token")||"null");return v&&(v.currentSession||v.session||v)}catch(e){return null}};
const isNetErr=e=>e&&(e.name==="TypeError"||e.name==="AbortError"||e.__timeout);
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
function netFetch(url,init,ms){
  const ac=new AbortController(),sig=init&&init.signal;let timer;
  if(sig){if(sig.aborted)ac.abort();else sig.addEventListener("abort",()=>ac.abort())}
  const p=ofetch(url,{...init,signal:ac.signal});
  return Promise.race([p,new Promise((_,rej)=>{timer=setTimeout(()=>{ac.abort();const e=new Error("timeout");e.__timeout=1;rej(e)},ms||20000)})]).finally(()=>clearTimeout(timer));
}

/* ---------- per-user state ---------- */
function userState(uid){
  if(!st.u[uid])st.u[uid]=(async()=>{const U={uid,tables:{},queue:[],failed:[],dirty:new Set(),timer:null};
    const vals=await Promise.all(TABLES.map(t=>iget(uid+"|"+t)));TABLES.forEach((t,i)=>U.tables[t]=Array.isArray(vals[i])?vals[i]:null);
    U.queue=(await iget(uid+"|queue"))||[];U.failed=(await iget(uid+"|failed"))||[];st.u[uid].__v=U;return U})();
  return st.u[uid];
}
function saveTable(U,t){U.dirty.add(t);clearTimeout(U.timer);U.timer=setTimeout(()=>{for(const x of U.dirty)iput(U.uid+"|"+x,U.tables[x]);U.dirty.clear()},400)}
const saveQueue=U=>Promise.all([iput(U.uid+"|queue",U.queue),iput(U.uid+"|failed",U.failed)]);
const pkOf=t=>PK[t]||["id"];
const sameKey=(a,b,cols)=>cols.every(c=>a[c]!=null&&String(a[c])===String(b[c]));

/* ---------- PostgREST query emulation ---------- */
function parseFilters(sp){const f=[];for(const[k,v]of sp){if(RESERVED.has(k))continue;f.push([k,v])}return f}
function matchOne(rv,expr){
  let neg=false;if(expr.startsWith("not.")){neg=true;expr=expr.slice(4)}
  const i=expr.indexOf("."),op=expr.slice(0,i),val=expr.slice(i+1);let r=true;
  const sv=rv==null?null:String(rv);
  const cmp=()=>{const a=parseFloat(rv),b=parseFloat(val);return !isNaN(a)&&!isNaN(b)&&/^-?[\d.]+$/.test(val)?a-b:(sv==null?-1:sv<val?-1:sv>val?1:0)};
  switch(op){
    case"eq":r=sv===val||(typeof rv==="number"&&rv===parseFloat(val));break;
    case"neq":r=!(sv===val||(typeof rv==="number"&&rv===parseFloat(val)));break;
    case"in":{const list=val.replace(/^\(|\)$/g,"").split(",").map(x=>x.trim().replace(/^"|"$/g,""));r=sv!=null&&list.includes(sv);break}
    case"is":r=val==="null"?rv==null:val==="true"?rv===true:val==="false"?rv===false:true;break;
    case"gt":r=rv!=null&&cmp()>0;break;case"gte":r=rv!=null&&cmp()>=0;break;
    case"lt":r=rv!=null&&cmp()<0;break;case"lte":r=rv!=null&&cmp()<=0;break;
    case"like":case"ilike":{const re=new RegExp("^"+val.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace(/[*%]/g,".*")+"$",op==="ilike"?"i":"");r=sv!=null&&re.test(sv);break}
    default:r=true;
  }
  return neg?!r:r;
}
const applyFilters=(rows,f)=>f.length?rows.filter(row=>f.every(([k,v])=>matchOne(row[k],v))):rows;
function applyOrder(rows,ord){
  if(!ord)return rows;
  const keys=ord.split(",").map(s=>{const p=s.split(".");return{c:p[0],desc:p.includes("desc"),nf:p.includes("nullsfirst")}});
  return rows.slice().sort((a,b)=>{for(const k of keys){const x=a[k.c],y=b[k.c];if(x==y)continue;if(x==null)return k.nf?-1:1;if(y==null)return k.nf?1:-1;
    const n=typeof x==="number"&&typeof y==="number"?x-y:String(x)<String(y)?-1:1;if(n)return k.desc?-n:n}return 0});
}
function project(rows,sel){if(!sel||sel==="*"||/[()]/.test(sel))return rows;const cols=sel.split(",").map(s=>s.trim().split(":").pop());return rows.map(r=>{const o={};cols.forEach(c=>o[c]=r[c]);return o})}
const jsonResp=(data,status,extra)=>new Response(data===undefined?null:JSON.stringify(data),{status:status||200,headers:{"Content-Type":"application/json",...(extra||{})}});

function localRead(U,table,u,method,h){
  const all=U.tables[table]||[];const sp=u.searchParams;
  let rows=applyOrder(applyFilters(all,parseFilters(sp)),sp.get("order"));
  const total=rows.length,off=+(sp.get("offset")||0),lim=sp.has("limit")?+sp.get("limit"):Infinity;
  rows=rows.slice(off,off+lim);rows=project(clone(rows),sp.get("select"));
  const extra={};const pref=h.get("Prefer")||"";
  if(/count=/.test(pref))extra["Content-Range"]=(rows.length?off+"-"+(off+rows.length-1):"*")+"/"+total;
  if(method==="HEAD")return new Response(null,{status:200,headers:extra});
  if(/vnd\.pgrst\.object/.test(h.get("Accept")||"")){
    if(rows.length===1)return jsonResp(rows[0],200,extra);
    return jsonResp({code:"PGRST116",details:"The result contains "+rows.length+" rows",hint:null,message:"JSON object requested, multiple (or no) rows returned"},406);
  }
  return jsonResp(rows,200,extra);
}

/* apply a write to the local cache; returns affected rows */
function applyWrite(U,table,method,u,body,pref){
  const list=U.tables[table]||(U.tables[table]=[]);const sp=u.searchParams;let out=[];
  const data=body?JSON.parse(body):null;const now=new Date().toISOString();
  if(method==="POST"){
    const rows=Array.isArray(data)?data:[data];
    const upsert=/resolution=(merge|ignore)-duplicates/.test(pref),ignore=/ignore-duplicates/.test(pref);
    const conflict=sp.get("on_conflict")?sp.get("on_conflict").split(","):pkOf(table);
    for(const r0 of rows){
      const r={...(DEF[table]||{}),user_id:U.uid,created_at:now,...r0};
      if(table==="transactions"&&!r.txn_date)r.txn_date=today();
      if(table==="profiles")r.updated_at=r0.updated_at||now;
      const ex=list.find(x=>sameKey(x,r,upsert?conflict:pkOf(table)));
      if(ex){if(upsert&&ignore)continue;Object.assign(ex,r0,upsert?{}:{created_at:ex.created_at});out.push(ex)}
      else{list.push(r);out.push(r)}
    }
  }else if(method==="PATCH"){
    const hit=applyFilters(list,parseFilters(sp));hit.forEach(r=>Object.assign(r,data));out=hit;
  }else if(method==="DELETE"){
    const hit=new Set(applyFilters(list,parseFilters(sp)));out=[...hit];
    U.tables[table]=list.filter(r=>!hit.has(r));
  }
  saveTable(U,table);return clone(out);
}

/* online responses -> cache */
async function absorb(U,table,method,u,body,pref,res){
  try{
    if(method==="GET"){
      const sel=u.searchParams.get("select")||"*";if(sel!=="*")return;
      let data=await res.clone().json();if(data==null)return;if(!Array.isArray(data))data=[data];
      const f=parseFilters(u.searchParams),off=+(u.searchParams.get("offset")||0),pk=pkOf(table);
      if(!f.length&&off===0)U.tables[table]=clone(data);
      else{const list=U.tables[table]||(U.tables[table]=[]);for(const r of data){const i=list.findIndex(x=>sameKey(x,r,pk));i>=0?list[i]=clone(r):list.push(clone(r))}}
      saveTable(U,table);
    }else if(method!=="HEAD")applyWrite(U,table,method,u,body,pref);
  }catch(e){console.warn("offline absorb",e)}
}

/* ---------- auth token for replay ---------- */
async function freshToken(uid){
  let s=storedSession();
  const p=s&&jwt(s.access_token);
  if(!p||p.sub!==uid)return null;
  if(p.exp*1000>Date.now()+60000)return s.access_token;
  try{st.noFake=true;const{data,error}=await SB.auth.refreshSession();if(error||!data.session)return null;return data.session.access_token}
  catch(e){return null}finally{st.noFake=false}
}

/* ---------- sync queued changes ---------- */
async function flush(U){
  if(st.syncing)return st.syncing;
  st.syncing=(async()=>{let sent=0,bad=0;
    while(U.queue.length){
      const q=U.queue[0];if(typeof SB==="undefined")break;const tok=await freshToken(U.uid);if(!tok){if(!navigator.onLine)setOffline(true);break}
      const pref=(q.p||"").replace("return=representation","return=minimal")||"return=minimal";
      let r;try{r=await netFetch(SBURL+q.u,{method:q.m,headers:{apikey:q.k,Authorization:"Bearer "+tok,"Content-Type":"application/json",Prefer:pref},body:q.b},25000)}
      catch(e){setOffline(true);break}
      if(r.ok){U.queue.shift();sent++}
      else if(r.status===409){const t=await r.text();U.queue.shift();if(/23505|duplicate key/.test(t))sent++;else{U.failed.push({...q,err:t.slice(0,300)});bad++}}
      else if(r.status===401){const t=await r.text();if(/expired/i.test(t)){st.noFake=true;try{await SB.auth.refreshSession()}catch(e){}finally{st.noFake=false}}break}
      else if(r.status>=500||r.status===429){break}
      else{U.queue.shift();U.failed.push({...q,err:(await r.text()).slice(0,300)});bad++}
      await saveQueue(U);setOffline(false);
    }
    await saveQueue(U);return{sent,bad};
  })();
  try{return await st.syncing}finally{st.syncing=null;badge()}
}

/* ---------- Supabase REST interception ---------- */
async function rest(u,init){
  const method=(init.method||"GET").toUpperCase(),h=new Headers(init.headers||{});
  const p=jwt(h.get("Authorization")),uid=p&&p.sub,table=decodeURIComponent(u.pathname.slice(9));
  if(!uid||!TABLES.includes(table))return ofetch(u.href,init);
  const U=await userState(uid);
  let body=typeof init.body==="string"?init.body:init.body==null?null:undefined;
  if(body===undefined)return ofetch(u.href,init);
  const pref=h.get("Prefer")||"";
  if(method==="POST"&&body&&HAS_ID.has(table)){ /* client-side ids: makes offline rows and retries safe */
    const d=JSON.parse(body);const add=r=>{if(r&&typeof r==="object"&&!r.id)r.id=uuid();return r};
    body=JSON.stringify(Array.isArray(d)?d.map(add):add(d));
    const cols=u.searchParams.get("columns");
    if(cols&&!cols.split(",").some(c=>c.replace(/"/g,"").trim()==="id"))u.searchParams.set("columns",cols+',"id"');
  }
  if(!navigator.onLine)setOffline(true);
  if(!st.offline&&U.queue.length)await flush(U);
  if(!st.offline&&!U.queue.length){
    try{
      let r=await netFetch(u.href,{...init,body},method==="GET"||method==="HEAD"?15000:25000);
      if(r.status===401){const t=await r.clone().text();if(/expired/i.test(t)){const tok=await freshToken(uid);if(tok){h.set("Authorization","Bearer "+tok);r=await netFetch(u.href,{...init,headers:h,body},25000)}}}
      setOffline(false);
      if(r.ok)await absorb(U,table,method,u,body,pref,r);
      return r;
    }catch(e){if(!isNetErr(e))throw e;setOffline(true)}
  }
  /* ---- offline ---- */
  if(method==="GET"||method==="HEAD"){
    if(U.tables[table]==null&&table!=="sms_txns")console.warn("offline: no cached data yet for",table);
    return localRead(U,table,u,method,h);
  }
  const rows=applyWrite(U,table,method,u,body,pref);
  U.queue.push({m:method,u:u.pathname+u.search,b:body,p:pref,k:h.get("apikey"),t:Date.now()});
  await saveQueue(U);badge();
  if(/return=representation/.test(pref)){
    const data=project(rows,u.searchParams.get("select"));
    if(/vnd\.pgrst\.object/.test(h.get("Accept")||""))return data.length===1?jsonResp(data[0],method==="POST"?201:200):jsonResp({code:"PGRST116",message:"JSON object requested, multiple (or no) rows returned",details:"The result contains "+data.length+" rows"},406);
    return jsonResp(data,method==="POST"?201:200);
  }
  return new Response(null,{status:method==="POST"?201:204});
}

/* offline: let the saved login keep working (token is refreshed for real once back online) */
async function authRefresh(url,init){
  if(!st.offline&&navigator.onLine){
    try{const r=await netFetch(url,init,15000);setOffline(false);return r}
    catch(e){if(st.noFake||!isNetErr(e))throw e;setOffline(true)}
  }
  if(st.noFake)throw new TypeError("Failed to fetch (offline)");
  const s=storedSession();if(!s||!s.refresh_token)throw new TypeError("Failed to fetch (offline)");
  const now=Math.floor(Date.now()/1000);
  return jsonResp({...s,expires_in:3600,expires_at:now+3600});
}

window.fetch=function(input,init){
  try{
    const url=typeof input==="string"?input:input instanceof URL?input.href:null;
    if(url&&url.startsWith(SBURL+"/")){
      const u=new URL(url);
      if(u.pathname.startsWith("/rest/v1/"))return rest(u,init||{});
      if(u.pathname==="/auth/v1/token"&&u.searchParams.get("grant_type")==="refresh_token")return authRefresh(url,init||{});
    }
  }catch(e){console.warn("offline fetch wrap",e)}
  return ofetch(input,init);
};

/* ---------- online/offline status ---------- */
function setOffline(v){if(st.offline!==v){st.offline=v;badge();if(!v)setTimeout(()=>sync(false),300)}}
function pendingCount(){let n=0,f=0;const s=storedSession(),p=s&&jwt(s.access_token),U=p&&st.u[p.sub]&&st.u[p.sub].__v;if(U){n=U.queue.length;f=U.failed.length}return{n,f}}
async function curUser(){const s=storedSession(),p=s&&jwt(s.access_token);if(!p||!p.sub)return null;const U=await userState(p.sub);st.u[p.sub].__v=U;return U}
async function sync(manual){
  if(!navigator.onLine){setOffline(true);return}
  const U=await curUser();if(!U)return;
  const had=U.queue.length;
  if(!had&&!st.offline&&!manual)return badge();
  st.offline=false;badge();
  const r=await flush(U);
  if(st.offline)return;
  if(had||manual){try{typeof refresh==="function"&&typeof S!=="undefined"&&S.user&&await refresh()}catch(e){}}
  if(r.sent&&typeof toast==="function")toast("✔ Synced "+r.sent+" offline change"+(r.sent>1?"s":""));
  if(r.bad&&typeof toast==="function")toast("⚠ "+r.bad+" offline change(s) could not be saved to server",!0);
  badge();
}
function badge(){
  if(!document.body)return;
  curUser().then(U=>{
    const n=U?U.queue.length:0,f=U?U.failed.length:0;let el=document.getElementById("offBadge");
    if(!el){el=document.createElement("div");el.id="offBadge";el.style.cssText="position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:9999;background:#334155;color:#fff;border-radius:999px;padding:6px 14px;font:600 12px/1.3 Inter,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer;max-width:92vw;text-align:center";el.onclick=async()=>{const U=await curUser();if(!U)return;if(U.failed.length&&!U.queue.length&&!st.offline){const e=U.failed.map(x=>x.m+" "+x.u.split("?")[0].replace("/rest/v1/","")+": "+String(x.err||"").slice(0,120)).join(" | ");typeof toast==="function"&&toast("Not saved: "+e,!0);console.warn("offline changes rejected",U.failed);U.failed=[];saveQueue(U);badge()}else sync(true)};document.body.appendChild(el)}
    let t="";
    if(st.offline)t="📴 Offline – saved on this phone"+(n?" · "+n+" to sync":"");
    else if(st.syncing||n)t="🔄 Syncing "+n+" change"+(n===1?"":"s")+"…";
    else if(f)t="⚠ "+f+" change(s) not synced – tap";
    el.textContent=t;el.style.display=t?"block":"none";el.style.background=st.offline?"#334155":f&&!n?"#b45309":"#1d4ed8";
  });
}
/* document.open() (used by the app loader) erases window listeners, so (re)bind them for each new page body */
function bind(){const b=document.body;if(!b||b.__offL)return;b.__offL=1;
  addEventListener("online",()=>setTimeout(()=>sync(true),1500));
  addEventListener("offline",()=>setOffline(true));
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")sync(false)});}
bind();
setInterval(()=>{const{n}=pendingCount();if(navigator.onLine&&(st.offline||n))sync(false)},20000);
setInterval(()=>{bind();if(!navigator.onLine&&!st.offline)setOffline(true);badge()},2000);
})();
