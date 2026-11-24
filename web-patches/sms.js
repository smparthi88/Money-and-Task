/* Money & Tasks patch v4: SMS Inbox – bank/UPI SMS captured by the Android app, reviewed here (phone or laptop) */
(function(){
const p2=n=>String(n).padStart(2,"0");
const MONS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const isoD=(y,m,d)=>{y=+y;if(y<100)y+=2000;m=+m;d=+d;if(!(m>=1&&m<=12&&d>=1&&d<=31&&y>2000&&y<2100))return null;const t=new Date(y,m-1,d);return t.getMonth()===m-1?y+"-"+p2(m)+"-"+p2(d):null};
const dOf=ms=>{const t=new Date(+ms);return t.getFullYear()+"-"+p2(t.getMonth()+1)+"-"+p2(t.getDate())};

/* ---------------- SMS parser ---------------- */
const REJECT=/\botp\b|one[\s-]?time\s*pass|verification code|\bwill be (?:debited|credited|deducted)|\bis due\b|\bdue (?:on|by|date)|min(?:imum)?\.? (?:amt|amount) due|total (?:amt|amount) due|bill (?:is )?generated|statement (?:is )?generated|\brequested\b|\brequest(?:ed)? (?:of|for|from)|collect request|declined|\bfailed\b|unsuccessful|not successful|pre-?approved|\boffer\b|\bwin\b|\bcoupon\b|eligible|apply now|click here|emi of rs.*is due/i;
const DEBIT=/\b(debited|debit(?:ed)? (?:of|for|by|with)|spent|paid|withdrawn|withdrawal|sent|purchase[d]?|transferred to|deducted|dr\.?\b|using your .*card|txn of|transaction of|payment of|charged)/i;
const CREDIT=/\b(credited|received|deposited|refund(?:ed)?|cr\.?\b|added to your|reversed to your|cashback of)/i;
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)+"-"+s.length.toString(36)}
function findAmt(b){
  const re=/(?:rs\.?|inr|₹|rupees)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/ig;let m;
  while(m=re.exec(b)){const pre=b.slice(Math.max(0,m.index-22),m.index).toLowerCase();if(/(bal|balance|limit|avl|available|outstanding|due)[^a-z]*$/.test(pre))continue;const v=parseFloat(m[1].replace(/,/g,""));if(v>0)return v}
  m=b.match(/(?:debited|credited|deducted)\s*(?:by|with|for)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);if(m){const v=parseFloat(m[1].replace(/,/g,""));if(v>0)return v}
  return null}
function findDate(b,smsMs){
  const sd=dOf(smsMs);let m,d=null;
  if(m=b.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/))d=isoD(m[3],m[2],m[1]);
  if(!d&&(m=b.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)))d=isoD(m[1],m[2],m[3]);
  if(!d&&(m=b.match(/\b(\d{1,2})[\s\-]?([A-Za-z]{3})[a-z]*[\s\-,']*(\d{2,4})\b/))){const mo=MONS[m[2].toLowerCase()];if(mo)d=isoD(m[3],mo,m[1])}
  if(!d)return sd;
  const diff=Math.abs(new Date(d)-new Date(sd))/864e5;return diff<=45?d:sd}
function findParty(b,dir){
  b=b.split(/\b(?:not you|not u\?|if not|call \d|call 1800|sms block|to block|report fraud|never share)/i)[0];
  const ok=v=>{v=String(v||"").replace(/\s+/g," ").replace(/[.\-,;:]+$/,"").trim();return v.length>=2&&!/^(your|a\/c|ac|account|card|rs\.?|inr|date|the)\b/i.test(v)&&!/^\+?\d[\d\s]{6,}$/.test(v)?v:""};
  const all=(re)=>{for(const m of b.matchAll(re)){const v=ok(m[1]);if(v)return v}return""};
  const cut="(?=\\s+(?:on|ref|refno|upi|avl|avbl|via|from|for|dt|date|txn|bal|is|was|using|thru|through|info|total)\\b|[.;,(\\n]|$)";
  let v=all(/\bupi\/(?:p2[am]\/|cr\/|dr\/)?\d{6,}\/([^\/\n.]{2,40})/ig)||all(/\bvpa\s+([\w.\-]+@[\w]+)/ig);if(v)return v;
  if(dir==="debit")v=all(/;\s*([A-Za-z][A-Za-z0-9 .&*_-]{2,40}?)\s+credited/ig)||all(new RegExp("(?:trf|transfer(?:red)?|paid|sent|payment)\\s+to\\s+([^\\n]{2,45}?)"+cut,"ig"))||all(new RegExp("\\bto\\s+([A-Za-z0-9@._\\-][^\\n]{1,44}?)"+cut,"ig"))||all(new RegExp("\\bat\\s+([A-Za-z0-9][^\\n]{1,44}?)"+cut,"ig"))||all(/\bon\s+([A-Z][A-Z0-9 .&*_-]{2,40}?)\.(?:\s|$)/g)||all(/\btowards\s+([^\n.]{2,40})/ig);
  else v=all(new RegExp("\\bfrom\\s+([A-Za-z0-9@._\\-][^\\n]{1,44}?)"+cut,"ig"))||all(new RegExp("\\bby\\s+([A-Za-z0-9@._\\-][^\\n]{1,44}?)"+cut,"ig"));
  return v||all(/info[:\s-]+([^\n]{2,45}?)(?:\.|$)/ig)}
function findAcc(b){const m=b.match(/(?:a\/c|a\/c no\.?|ac|acct|account|card|debit card|credit card)\s*(?:no\.?|number)?\s*(?:ending\s*(?:with|in)?)?\s*[:\-]?\s*[x*X.\s]*(\d{3,6})\b/i);return m?m[1].slice(-4):""}
function findRef(b){const m=b.match(/(?:upi\s*ref(?:\s*no)?|upi[:\/]|ref(?:erence)?\s*(?:no|num|number|#|id)?|refno|utr|rrn|txn\s*(?:id|no)|imps\s*ref)[\s.:#-]*([A-Za-z0-9]{6,})/i);return m?m[1]:((b.match(/\b(\d{12})\b/)||[])[1]||"")}
function bankName(sender){const s=String(sender||"").toUpperCase().replace(/^[A-Z]{2}-/,"").replace(/-[A-Z]$/,"");const map={PAYTM:"Paytm",PHONEPE:"PhonePe",GPAY:"GPay",AMAZON:"Amazon Pay",SBI:"SBI",HDFC:"HDFC",ICICI:"ICICI",AXIS:"Axis",KOTAK:"Kotak",IOB:"IOB",CANARA:"Canara",CANBNK:"Canara",INDBNK:"Indian Bank",INDIAN:"Indian Bank",BOB:"BoB",PNB:"PNB",UNION:"Union",UBI:"Union",CUB:"CUB",KVB:"KVB",TMB:"TMB",IDFC:"IDFC",YES:"Yes Bank",FED:"Federal"};for(const k in map)if(s.includes(k))return map[k];return s.slice(0,8)}
function parseSms(body,sender,smsMs){
  const b=String(body||"").replace(/\s+/g," ").trim();
  if(b.length<20||REJECT.test(b))return null;
  const di=b.search(DEBIT),ci=b.search(CREDIT);if(di<0&&ci<0)return null;
  const dir=ci<0?"debit":di<0?"credit":di<ci?"debit":"credit";
  const amount=findAmt(b);if(!amount)return null;
  const party=findParty(b,dir);
  return{amount:Math.round(amount*100)/100,dir,txn_date:findDate(b,smsMs),descr:((dir==="debit"?"Paid to ":"Received from ")+(party||"?")+" · "+bankName(sender)).slice(0,200),ref:findRef(b),acc_hint:findAcc(b)}}
window.SMSX={parseSms,hash};
if(typeof document==="undefined")return;

/* ---------------- sync from Android ---------------- */
const A=()=>window.AndroidSMS;
const lsKey=()=>"smsScan:"+(S.user?.id||"");
let syncing=false,lastSync=0;
async function smsSync(days,quiet,rng){
  if(!A()||!S.user||syncing)return 0;
  try{if(!A().hasPerm())return 0}catch(e){return 0}
  syncing=true;let added=0;
  try{
    const now=Date.now();let since=rng?new Date(rng.from+"T00:00:00").getTime():days?now-days*864e5:+(localStorage.getItem(lsKey())||0);if(!since)since=now-30*864e5;const until=rng?new Date(rng.to+"T23:59:59").getTime():Infinity;
    let raw=[];try{raw=JSON.parse(A().scanInbox(String(since))||"[]").filter(m=>+m.date<=until)}catch(e){}
    let pend=[];try{pend=JSON.parse(A().getPending()||"[]")}catch(e){}
    const seen=new Set(),rows=[];
    for(const m of raw.concat(pend)){const h=hash((m.addr||"")+"|"+m.date+"|"+(m.body||""));if(seen.has(h))continue;seen.add(h);const p=parseSms(m.body,m.addr,m.date);if(!p)continue;rows.push({hash:h,sender:m.addr||"",body:String(m.body||"").slice(0,1000),sms_at:new Date(+m.date).toISOString(),...p})}
    for(let i=0;i<rows.length;i+=300){const{data,error}=await SB.from("sms_txns").upsert(rows.slice(i,i+300),{onConflict:"user_id,hash",ignoreDuplicates:true}).select("id");if(error)throw error;added+=(data||[]).length}
    if(rng){const hs=rows.map(r=>r.hash);for(let i=0;i<hs.length;i+=150){const{data,error}=await SB.from("sms_txns").update({status:"pending"}).eq("status","ignored").in("hash",hs.slice(i,i+150)).select("id");if(!error)added+=(data||[]).length}}
    try{A().ack(JSON.stringify(pend.map(m=>m.key||m.id)))}catch(e){}
    if(!rng)localStorage.setItem(lsKey(),String(now-2*864e5));lastSync=now;
    if(added&&!quiet)toast(`📩 ${added} new SMS transaction(s) in SMS Inbox`);
  }catch(e){toast("SMS sync: "+(e.message||e),!0)}
  finally{syncing=false}
  await countBadge();if(VIEW==="sms")loadList();
  return added}
async function countBadge(){if(!S.user)return;const{count}=await SB.from("sms_txns").select("id",{count:"exact",head:!0}).eq("status","pending");window.__smsN=count||0;
  $$('[data-v="sms"] .nl').forEach(e=>e.textContent="SMS Inbox"+(count?` (${count})`:""))}
window.smsSync=smsSync;window.onNewSms=()=>smsSync(0,false);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-lastSync>20000)smsSync(0,false)});

/* ---------------- SMS Inbox view ---------------- */
const SM=window.SM=window.SM||{rows:[],flt:"all",q:"",loaded:false,defAcc:localStorage.getItem("smsDefAcc")||"",from:"",to:""};
const dAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return ds(d)};
function accFor(hint){if(!hint)return"";for(const a of S.accs){const t=[a.acc_no&&String(a.acc_no).replace(/\D/g,"").slice(-4),a.card_last4,a.acc_no&&String(a.acc_no).replace(/\D/g,"").slice(-3)].filter(Boolean);if(t.some(x=>x.endsWith(hint.slice(-3))&&(x.length<4||hint.length<4||x===hint.slice(-4))))return a.id}return""}
function keyOf(n){return String(n||"").toLowerCase().replace(/paid to|received from|·.*$|upi|vpa|[0-9@\/\-:_.*#]+/g," ").replace(/\s+/g," ").trim().split(" ").filter(w=>w.length>2).slice(0,3).join(" ")}
function learn(){const m={};for(const t of S.txns){if(t.category_id&&t.note){const k=keyOf(t.note);if(k)m[t.txn_type+"|"+k]=t.category_id}}return m}
function isDupR(r){if(!r.acc)return false;const lo=new Date(r.date);lo.setDate(lo.getDate()-2);const hi=new Date(r.date);hi.setDate(hi.getDate()+2);const l=ds(lo),h=ds(hi);
  if(r.ref&&r.ref.length>=8&&S.txns.some(t=>(t.note||"").includes(r.ref)))return true;
  return S.txns.some(t=>Math.abs(num(t.amount)-r.amount)<0.01&&t.txn_date>=l&&t.txn_date<=h&&(t.account_id===r.acc||t.to_account_id===r.acc))}
async function loadList(){
  const{data,error}=await SB.from("sms_txns").select("*").eq("status","pending").order("txn_date",{ascending:!1}).order("sms_at",{ascending:!1}).limit(1000);
  if(error)return toast(error.message,!0);
  const L=learn(),old=new Map(SM.rows.map(r=>[r.id,r]));
  SM.rows=(data||[]).map(d=>{if(old.has(d.id))return old.get(d.id);const type=d.dir==="credit"?"income":"expense";const acc=accFor(d.acc_hint)||SM.defAcc||"";const r={id:d.id,date:d.txn_date,amount:num(d.amount),dir:d.dir,desc:d.descr||"",ref:d.ref||"",body:d.body||"",sender:d.sender||"",hint:d.acc_hint||"",type,acc,to:"",cat:"",note:(d.descr||"")+(d.ref?" · Ref "+d.ref:"")};const k=keyOf(r.desc);r.cat=(k&&L[type+"|"+k])||"";r.dup=isDupR(r);r.sel=!r.dup;return r});
  SM.loaded=true;window.__smsN=SM.rows.length;$$('[data-v="sms"] .nl').forEach(e=>e.textContent="SMS Inbox"+(SM.rows.length?` (${SM.rows.length})`:""));drawSms()}
function vSms(){
  const and=!!A();let perm=false;try{perm=and&&A().hasPerm()}catch(e){}
  $("#main").innerHTML=`<div class="row sb"><h2>📩 SMS Inbox</h2><div class="row"><button class="btn ghost sm" id="smRef">↻ Refresh</button></div></div>
  <div class="card"><div class="row" style="flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px"><div><label>From date</label><input type="date" id="smFrom" value="${SM.from}" style="width:auto"></div><div><label>To date</label><input type="date" id="smTo" value="${SM.to}" style="width:auto"></div><button class="btn ghost sm" id="smClr" title="Show all dates">All dates</button>${and&&perm?'<button class="btn sm" id="smScan">📥 Scan SMS for these dates</button>':""}</div>${and?(perm?`<div class="mute" style="font-size:12px">New bank / UPI SMS are captured automatically. "Scan" reads the SMS between the dates again – entries you deleted come back; entries already added do not.</div>`
     :`<div class="alert a" style="margin:0">Allow SMS permission so the app can read bank / UPI transaction SMS. SMS stay on your phone – only transaction details are saved to your account.</div><button class="btn" id="smPerm" style="margin-top:10px">Allow SMS access</button>`)
   :`<div class="mute" style="font-size:13px">SMS are captured by the <b>Money & Tasks Android app</b> on your phone. Captured transactions appear here on both phone and laptop – check and add them.</div>`}
   <div style="margin-top:10px"><label>Default account for SMS without a matching account number</label><select id="smDef">${accOptions(S.accs.filter(a=>a.active!==false),SM.defAcc)}</select></div></div>
  <div id="smList"><div class="mute" style="padding:12px">Loading…</div></div>`;
  $("#smRef").onclick=()=>{and&&perm?smsSync(0,false):loadList()};
  $("#smDef").onchange=e=>{SM.defAcc=e.target.value;localStorage.setItem("smsDefAcc",SM.defAcc);SM.rows.forEach(r=>{if(!accFor(r.hint)){r.acc=SM.defAcc;r.dup=isDupR(r);r.sel=!r.dup}});drawSms()};
  if($("#smPerm"))$("#smPerm").onclick=()=>{try{A().requestPerm()}catch(e){toast("Could not ask permission",!0)}};
  const rd=()=>{SM.from=$("#smFrom").value;SM.to=$("#smTo").value;drawSms()};$("#smFrom").onchange=rd;$("#smTo").onchange=rd;$("#smClr").onclick=()=>{SM.from="";SM.to="";$("#smFrom").value="";$("#smTo").value="";drawSms()};
  if($("#smScan"))$("#smScan").onclick=async()=>{const f=$("#smFrom").value||dAgo(30),t=$("#smTo").value||today();if(f>t)return toast("From date is after To date",!0);SM.from=f;SM.to=t;$("#smFrom").value=f;$("#smTo").value=t;const b=$("#smScan");b.disabled=true;b.textContent="Scanning…";const n=await smsSync(0,true,{from:f,to:t});toast(n?`📩 ${n} transaction SMS brought into the inbox`:"No transaction SMS found for these dates");b.disabled=false;b.textContent="📥 Scan SMS for these dates"};
  SM.loaded?drawSms():null;loadList()}
window.onSmsPerm=ok=>{if(ok){toast("SMS access allowed");smsSync(30,false);VIEW==="sms"&&vSms()}else toast("SMS permission denied",!0)};

function drawSms(){
  const el=$("#smList");if(!el)return;
  const inR=r=>(!SM.from||r.date>=SM.from)&&(!SM.to||r.date<=SM.to);const R=SM.rows.filter(inR);const rng=SM.from||SM.to?` <span class="mute" style="font-size:12px">(${SM.from?dmy(SM.from):"…"} – ${SM.to?dmy(SM.to):"…"} · ${R.length} of ${SM.rows.length})</span>`:"";
  if(!R.length){el.innerHTML=`<div class="card"><div class="empty">No pending SMS transactions${rng?" for these dates":""} 🎉</div></div>`;return}
  const vis=R.filter(r=>(SM.flt==="all"||(SM.flt==="debit"&&r.dir==="debit")||(SM.flt==="credit"&&r.dir==="credit")||(SM.flt==="dup"&&r.dup)||(SM.flt==="nocat"&&r.type!=="transfer"&&!r.cat)||(SM.flt==="noacc"&&!r.acc))&&(!SM.q||(r.desc+" "+r.amount+" "+r.body).toLowerCase().includes(SM.q.toLowerCase())));
  const sel=R.filter(r=>r.sel),accs=S.accs.filter(a=>a.active!==false),sum=a=>a.reduce((s,r)=>s+r.amount,0);
  el.innerHTML=`<div class="grid g4" style="margin:12px 0"><div class="stat"><div class="l">Pending${rng}</div><div class="v">${R.length}</div></div><div class="stat"><div class="l">Debits</div><div class="v red">${fmt(sum(R.filter(r=>r.dir==="debit")))}</div></div><div class="stat"><div class="l">Credits</div><div class="v green">${fmt(sum(R.filter(r=>r.dir==="credit")))}</div></div><div class="stat"><div class="l">Possible duplicates</div><div class="v ${R.some(r=>r.dup)?"amber":""}">${R.filter(r=>r.dup).length}</div></div></div>
  <div class="imp-bar"><label style="display:flex;align-items:center;gap:6px;margin:0;font-weight:600"><input type="checkbox" id="smAll" ${vis.length&&vis.every(r=>r.sel)?"checked":""} style="width:20px;height:20px">All</label>
   <div class="imp-chips">${[["all","All "+R.length],["debit","Debits"],["credit","Credits"],["noacc","No account"],["nocat","No category"],["dup","Duplicates"]].map(([k,l])=>`<a data-sf="${k}" class="${SM.flt===k?"on":""}">${l}</a>`).join("")}</div>
   <input id="smQ" placeholder="Search…" value="${esc(SM.q)}" style="flex:1;min-width:120px">
   <select id="smBulkCat" style="max-width:190px"><option value="">Set category for selected…</option><optgroup label="Expense">${S.cats.filter(c=>c.kind==="expense").map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</optgroup><optgroup label="Income">${S.cats.filter(c=>c.kind==="income").map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</optgroup></select>
   <select id="smBulkAcc" style="max-width:190px"><option value="">Set account for selected…</option>${accs.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select>
   <button class="btn danger sm" id="smDel" ${sel.length?"":"disabled"}>🗑 Delete (${sel.length})</button>
   <button class="btn" id="smGo" ${sel.length?"":"disabled"}>✔ Add selected (${sel.length})</button></div>
  <div class="card list" id="smRows">${vis.map(rowH).join("")||'<div class="empty">Nothing here</div>'}</div>
  <p class="mute" style="font-size:12px">Tap a row to see the SMS and change type, category, account, date or amount. Delete removes it from this list only.</p>`;
  $("#smAll").onchange=e=>{vis.forEach(r=>r.sel=e.target.checked);drawSms()};
  $$("[data-sf]").forEach(a=>a.onclick=()=>{SM.flt=a.dataset.sf;drawSms()});
  $("#smQ").oninput=e=>{SM.q=e.target.value;const p=e.target.selectionStart;drawSms();const q=$("#smQ");q.focus();q.setSelectionRange(p,p)};
  $("#smBulkCat").onchange=e=>{const c=S.cats.find(c=>c.id===e.target.value);if(!c)return;let n=0;sel.forEach(r=>{if(r.type!=="transfer"&&(r.type==="income"?"income":"expense")===c.kind){r.cat=c.id;n++}});toast(n?`Category set for ${n} row(s)`:`No selected ${c.kind} rows`,!n);drawSms()};
  $("#smBulkAcc").onchange=e=>{const v=e.target.value;if(!v)return;sel.forEach(r=>{r.acc=v;if(r.to===v)r.to="";r.dup=isDupR(r)});drawSms()};
  $$("#smRows [data-r]").forEach(row=>{const r=R.find(x=>x.id===row.dataset.r);row.querySelector("input").onclick=e=>{e.stopPropagation();r.sel=e.target.checked;drawSms()};row.onclick=()=>editSms(r)});
  $("#smGo").onclick=addSel;$("#smDel").onclick=()=>delRows(sel)}
function rowH(r){const a=accById(r.acc),t=accById(r.to);
  const lab=r.type==="transfer"?`<span class="imp-tag tr">Transfer → ${esc(t?.name||"select")}</span>`:r.cat?`<span class="imp-tag">${esc(catName(r.cat))}</span>`:'<span class="imp-tag nc">No category</span>';
  return`<div class="imp-row ${r.sel?"":"off"}" data-r="${r.id}"><input type="checkbox" ${r.sel?"checked":""}><div class="imp-mid"><div class="imp-d">${esc(r.desc)}</div><div class="imp-s"><span>${dmy(r.date)}</span><span>${a?esc(a.name):'<b style="color:#b91c1c">⚠ choose account'+(r.hint?" (xx"+esc(r.hint)+")":"")+"</b>"}</span>${lab}${r.dup?'<span class="imp-tag dup">Possible duplicate</span>':""}</div></div><div class="imp-amt ${r.dir==="credit"?"green":"red"}">${r.dir==="credit"?"+":"−"}${fmt(r.amount)}</div></div>`}
function editSms(r){
  const accs=S.accs.filter(a=>a.active!==false);let type=r.type;const kind=()=>type==="income"?"income":"expense";
  const body=()=>`<h3>SMS entry</h3><div style="background:#f1f5f9;border-radius:10px;padding:8px;font-size:12px;margin-bottom:8px;white-space:pre-wrap">${esc(r.sender)}: ${esc(r.body)}</div>
   <label>Type</label><select id="sType">${[["expense","Expense (money out)"],["income","Income (money in)"],["transfer","Transfer / Card bill / Loan payment"]].map(([v,l])=>`<option value="${v}" ${type===v?"selected":""}>${l}</option>`).join("")}</select>
   <div class="f2"><div><label>Date</label><input type="date" id="sDate" value="${r.date}"></div><div><label>Amount</label><input type="number" step="0.01" id="sAmt" value="${r.amount}"></div></div>
   ${type==="transfer"?`<div class="f2"><div><label>From account</label><select id="sAcc">${accOptions(accs,r.acc)}</select></div><div><label>To account / card / loan</label><select id="sTo">${accOptions(accs,r.to)}</select></div></div>`
    :`<label>${type==="income"?"Credit to account":"Paid from account / card"}</label><select id="sAcc">${accOptions(accs,r.acc)}</select><label>Category</label><select id="sCat">${catOptions(kind(),r.cat)}</select>`}
   <label>Note</label><textarea id="sNote" rows="2">${esc(r.note)}</textarea>
   <div class="row sb" style="margin-top:12px"><button class="btn danger" id="sDel">🗑 Delete</button><div class="row"><button class="btn ghost" id="sC">Cancel</button><button class="btn" id="sAdd">✔ Add now</button><button class="btn ghost" id="sS">Save</button></div></div>`;
  const draw=()=>{const keep={date:$("#sDate")?.value,amt:$("#sAmt")?.value,acc:$("#sAcc")?.value,note:$("#sNote")?.value};openModal(body());if(keep.date){$("#sDate").value=keep.date;$("#sAmt").value=keep.amt;$("#sAcc").value=keep.acc;$("#sNote").value=keep.note}
    $("#sCat")&&bindCatSelect($("#sCat"),kind());$("#sType").onchange=e=>{type=e.target.value;draw()};$("#sC").onclick=closeModal;
    const save=()=>{const amt=num($("#sAmt").value);if(!(amt>0)){toast("Enter amount",!0);return false}const acc=$("#sAcc").value;if(!acc){toast("Select account",!0);return false}
      if(type==="transfer"){const to=$("#sTo").value;if(!to||to===acc){toast(to?"From and To cannot be same":"Select To account",!0);return false}r.to=to;r.cat=""}else{r.to="";const c=$("#sCat").value;r.cat=c&&c!=="__new"?c:""}
      r.type=type;r.date=$("#sDate").value||r.date;r.amount=Math.round(amt*100)/100;r.acc=acc;r.note=$("#sNote").value.trim();r.dup=isDupR(r);return true};
    $("#sS").onclick=()=>{if(save()){r.sel=true;closeModal();drawSms()}};
    $("#sAdd").onclick=async()=>{if(save()){closeModal();await addRows([r])}};
    $("#sDel").onclick=async()=>{closeModal();await delRows([r])}};
  draw()}
async function delRows(rows){if(!rows.length)return;if(!await confirmBox(`Delete ${rows.length} SMS entr${rows.length>1?"ies":"y"} from the inbox? (Your transactions are not affected)`))return;
  const ids=rows.map(r=>r.id);const{error}=await SB.from("sms_txns").update({status:"ignored"}).in("id",ids);if(error)return toast(error.message,!0);
  SM.rows=SM.rows.filter(r=>!ids.includes(r.id));toast(`🗑 ${ids.length} deleted`);countBadge();drawSms()}
async function addSel(){const sel=SM.rows.filter(r=>r.sel&&(!SM.from||r.date>=SM.from)&&(!SM.to||r.date<=SM.to));if(!sel.length)return;
  const bad=sel.find(r=>!r.acc||(r.type==="transfer"&&!r.to));if(bad)return toast(!bad.acc?"Some selected rows have no account – set the default account or choose one":"A transfer needs a To account",!0);
  const nc=sel.filter(r=>r.type!=="transfer"&&!r.cat).length;
  if(!await confirmBox(`Add ${sel.length} entries to your transactions?${nc?` (${nc} without category)`:""}`))return;await addRows(sel)}
async function addRows(rows){
  if(rows.some(r=>!r.acc))return toast("Choose an account",!0);
  const recs=rows.map(r=>({txn_date:r.date,txn_type:r.type,amount:r.amount,category_id:r.type==="transfer"?null:r.cat||null,account_id:r.acc,to_account_id:r.type==="transfer"?r.to:null,note:r.note||null}));
  const{error}=await SB.from("transactions").insert(recs);if(error)return toast(error.message,!0);
  const ids=rows.map(r=>r.id);await SB.from("sms_txns").update({status:"added"}).in("id",ids);
  SM.rows=SM.rows.filter(r=>!ids.includes(r.id));await loadAll();drawHdr&&drawHdr();toast(`✔ ${recs.length} entr${recs.length>1?"ies":"y"} added`);
  SM.rows.forEach(r=>{r.dup=isDupR(r)});countBadge();VIEW==="sms"&&drawSms()}

/* ---------------- hook into app ---------------- */
if(!VIEWS.some(v=>v[0]==="sms")){const i=VIEWS.findIndex(v=>v[0]==="import");VIEWS.splice(i<0?4:i+1,0,["sms","📩","SMS Inbox"])}
const _render=window.render;
window.render=function(){if(VIEW==="sms"){killCharts();$$("[data-v]").forEach(t=>t.classList.toggle("active",t.dataset.v===VIEW));$("#bMore")&&$("#bMore").classList.add("active");vSms()}else _render()};
const sn=$("#sideNav");if(sn&&sn.children.length&&!sn.querySelector('[data-v="sms"]')){const t=sn.querySelector('[data-v="import"]')||sn.querySelector('[data-v="transactions"]');const a=document.createElement("a");a.dataset.v="sms";a.title="SMS Inbox";a.innerHTML='<span class="ni">📩</span><span class="nl">SMS Inbox</span>';a.onclick=()=>go("sms");t?t.after(a):sn.prepend(a)}
const _drawHdr=window.drawHdr;let first=true;
window.drawHdr=function(){_drawHdr.apply(this,arguments);if(first&&S.user){first=false;setTimeout(()=>{A()?smsSync(0,false):countBadge()},400)}};
try{if(S.user){first=false;setTimeout(()=>{A()?smsSync(0,false):countBadge()},400)}if(location.hash==="#sms"&&S.user&&VIEW!=="sms")go("sms")}catch(x){}
})();
