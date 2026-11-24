/* Money & Tasks patch v2.1: Import Statement (Paytm / any bank / credit card – Excel, CSV, PDF incl. password PDFs, saved passwords, Category/Account columns) */
(function(){
const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
const p2=n=>String(n).padStart(2,"0");
const iso=(y,m,d)=>{y=+y;m=+m;d=+d;if(y<100)y+=2000;if(!(y>1990&&y<2100&&m>=1&&m<=12&&d>=1&&d<=31))return null;const dt=new Date(y,m-1,d);if(dt.getMonth()!==m-1)return null;return y+"-"+p2(m)+"-"+p2(d)};

/* ---------- date ---------- */
function parseDate(v,yh){
  if(v==null||v==="")return null;
  if(v instanceof Date&&!isNaN(v))return iso(v.getFullYear(),v.getMonth()+1,v.getDate());
  if(typeof v==="number"&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*864e5));return iso(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate())}
  const s=String(v).trim().replace(/\s+/g," ");let m;
  if(m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))return iso(m[1],m[2],m[3]);
  if(m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/))return iso(m[3],m[2],m[1]);
  if(m=s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.,]*([A-Za-z]{3,9})[\s\-\/.,']*(\d{4}|\d{2})?\b/)){const mo=MON[m[2].toLowerCase().slice(0,m[2].toLowerCase().startsWith("sept")?4:3)];if(mo){if(m[3])return iso(m[3],mo,m[1]);return yh?iso(yhFor(yh,mo),mo,m[1]):null}}
  if(m=s.match(/^([A-Za-z]{3,9})[\s\-.]+(\d{1,2}),?[\s\-']+(\d{4}|\d{2})\b/)){const mo=MON[m[1].toLowerCase().slice(0,3)];if(mo)return iso(m[3],mo,m[2])}
  return null}
/* yh = {year} or {ranges:[[y,m]...]} – pick year for a month */
function yhFor(yh,mo){if(yh.map&&yh.map[mo])return yh.map[mo];return yh.year}
function yearHint(text){
  const map={},cnt={};let m;const re=/\b([A-Za-z]{3,9})[\s\-',]*(20\d{2}|'\d{2})\b/g;
  while(m=re.exec(text)){const mo=MON[m[1].toLowerCase().slice(0,3)];if(!mo)continue;const y=m[2][0]==="'"?2000+ +m[2].slice(1):+m[2];map[mo]=y;cnt[y]=(cnt[y]||0)+1}
  const re2=/\b\d{1,2}[-\/.]\d{1,2}[-\/.](20\d{2})\b/g;while(m=re2.exec(text))cnt[m[1]]=(cnt[m[1]]||0)+1;
  const ys=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]);
  const now=new Date();return{year:ys.length?+ys[0]:now.getFullYear(),map}}

/* ---------- amount ---------- */
const AMT_RE=/^\(?\s*([+-])?\s*(?:rs\.?|inr|₹)?\s*([+-])?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*\)?\s*(cr|dr|c|d)?\.?$/i;
function parseAmt(v){
  if(v==null||v==="")return null;
  if(typeof v==="number")return isFinite(v)&&v!==0?{v:Math.abs(v),sign:v<0?-1:1,explicit:v<0}:null;
  const s=String(v).trim();const m=s.match(AMT_RE);if(!m)return null;
  const val=parseFloat(m[3].replace(/,/g,""));if(!(val>0))return null;
  let sign=0;const sg=m[1]||m[2];if(sg==="-")sign=-1;else if(sg==="+")sign=1;
  if(/^\(.*\)$/.test(s))sign=-1;
  const dc=(m[4]||"").toLowerCase();let dir=null;if(dc==="dr"||dc==="d")dir="debit";if(dc==="cr"||dc==="c")dir="credit";
  return{v:val,sign:sign||1,explicit:!!sg,dir,hasDec:/\.\d/.test(m[3])||/,/.test(m[3])||/rs|inr|₹/i.test(s)}}

/* ---------- direction from words ---------- */
function dirFromText(t){t=(t||"").toLowerCase();
  if(/\b(received from|money received|credited|refund|cashback|reversal|interest credit|salary|deposit|by transfer|neft cr|imps cr|upi cr|\bcr\b)/.test(t))return"credit";
  if(/\b(paid to|money sent|sent to|debited|purchase|withdraw|atm|bill paid|recharge|payment to|to transfer|\bdr\b|upi dr|pos )/.test(t))return"debit";
  return null}
function refOf(t){const m=String(t||"").match(/(?:upi\s*ref(?:erence)?\s*(?:no|id)?|utr|ref\s*no|rrn|txn\s*id)[\s.:#-]*([A-Za-z0-9]{8,})/i)||String(t||"").match(/\b(\d{12})\b/);return m?m[1]:""}
function cleanDesc(t){return String(t||"").replace(/\s+/g," ").replace(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/ig,"").replace(/\s{2,}/g," ").trim().slice(0,220)}

/* ---------- table (Excel / CSV) ---------- */
const H={
 date:/^(txn\.?\s*|tran\.?\s*|transaction\s*|posting\s*|value\s*)?date|^date\b|date\s*&\s*time|^dt$/i,
 desc:/narration|description|particular|transaction\s*details|^details|remarks?$|^remark|transaction\s*remarks|^info/i,
 other:/other\s*transaction\s*details|upi\s*id|counter\s*party|beneficiary|payee|merchant/i,
 debit:/withdraw|debit|^dr\.?$|dr\s*amount|paid\s*out|money\s*out|outflow/i,
 credit:/deposit|credit|^cr\.?$|cr\s*amount|paid\s*in|money\s*in|inflow/i,
 amount:/amount|^amt|value\s*\(?inr|^rs/i,
 drcr:/^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|txn\s*type|transaction\s*type|d\/c|c\/d|debit\s*\/\s*credit|status)$/i,
 bal:/balance/i, ref:/ref|utr|chq|cheque|rrn/i, acc:/your\s*account|account\s*(no|number)?$|^account\s*name$/i, time:/^time$/i, cat:/^(category|cat|head|expense\s*head)$/i};
function mapHeader(row){
  const c={};row.forEach((h,i)=>{h=String(h??"").trim();if(!h||h.length>60)return;const L=h.toLowerCase();
    const set=(k)=>{if(c[k]==null)c[k]=i};
    if(H.cat.test(L))return set("cat");
    if(H.drcr.test(L))return set("drcr");
    if(H.bal.test(L))return set("bal");
    if(H.date.test(L)){if(/value/.test(L)&&c.date!=null)return;if(c.date!=null&&/value/.test(String(row[c.date]).toLowerCase()))c.date=i;else set("date");return}
    if(H.other.test(L))return set("other");
    if(H.desc.test(L)&&!/date/.test(L))return set("desc");
    if(H.debit.test(L)&&!/credit/.test(L))return set("debit");
    if(H.credit.test(L)&&!/debit/.test(L))return set("credit");
    if(H.ref.test(L))return set("ref");
    if(H.time.test(L))return set("time");
    if(H.acc.test(L))return set("acc");
    if(H.amount.test(L))return set("amount");
  });return c}
function parseTable(rows,yh){
  let best=null;
  for(let i=0;i<Math.min(rows.length,60);i++){const c=mapHeader(rows[i]||[]);const sc=(c.date!=null?2:0)+(c.debit!=null&&c.credit!=null?2:c.amount!=null?2:0)+(c.desc!=null?1:0)+(c.bal!=null?.5:0);if(c.date!=null&&(c.amount!=null||c.debit!=null||c.credit!=null)&&(!best||sc>best.sc))best={i,c,sc}}
  if(!best)return[];
  const{c}=best,out=[];
  for(let r=best.i+1;r<rows.length;r++){const row=rows[r]||[];if(row.every(x=>x==null||String(x).trim()===""))continue;
    const d=parseDate(row[c.date],yh);
    const descParts=[c.desc,c.other].filter(x=>x!=null).map(k=>String(row[k]??"").trim()).filter(Boolean);
    if(!d){ /* continuation row */
      if(out.length&&descParts.length&&!row.some((x,k)=>k!==c.desc&&k!==c.other&&parseAmt(x)))out[out.length-1].desc=cleanDesc(out[out.length-1].desc+" "+descParts.join(" "));
      continue}
    const txt=descParts.join(" · ");
    if(/opening\s*balance|closing\s*balance|^total|brought\s*forward|b\/f/i.test(txt))continue;
    let amt=null,dir=null;
    if(c.debit!=null||c.credit!=null){const db=parseAmt(row[c.debit]),cr=parseAmt(row[c.credit]);if(db&&db.v>0){amt=db.v;dir="debit"}else if(cr&&cr.v>0){amt=cr.v;dir="credit"}}
    if(!amt&&c.amount!=null){const a=parseAmt(row[c.amount]);if(a){amt=a.v;
      const dc=c.drcr!=null?String(row[c.drcr]||"").toLowerCase():"";
      if(/\b(dr|debit|d|paid|sent|withdrawal|expense|spent)\b/.test(dc))dir="debit";else if(/\b(cr|credit|c|received|deposit|income|refund)\b/.test(dc))dir="credit";
      else if(a.dir)dir=a.dir;else if(a.explicit)dir=a.sign<0?"debit":"credit";else dir=dirFromText(txt)||"debit"}}
    if(!amt)continue;
    const ref=(c.ref!=null?String(row[c.ref]??"").trim():"")||refOf(txt);
    out.push({date:d,desc:cleanDesc(txt),amount:Math.round(amt*100)/100,dir,ref:ref.replace(/^'+/,""),acctxt:c.acc!=null?String(row[c.acc]??""):"",cattxt:c.cat!=null?String(row[c.cat]??"").trim():"",typetxt:c.drcr!=null?String(row[c.drcr]??"").trim().toLowerCase():"",bal:c.bal!=null?(parseAmt(row[c.bal])||{}).v:null})}
  return out}

/* ---------- PDF lines ---------- */
/* lines: [{items:[{s,x,w}], page}] */
function parsePdfLines(lines,yh){
  const out=[];let cols=null,cur=null,prevBal=null;
  const isAmtTok=s=>{const a=parseAmt(s);return a&&(a.hasDec)?a:null};
  const center=it=>it.x+(it.w||0)/2;
  const finish=()=>{if(cur&&cur.amount){cur.desc=cleanDesc(cur.desc).replace(/^\d{6,}\s+/,"").replace(/\s+\d{1,5}$/,"");if(!cur.ref)cur.ref=refOf(cur.raw);delete cur.raw;out.push(cur)}cur=null};
  for(const ln of lines){
    const items=[];for(const it of ln.items){if(!it.s.trim())continue;const pv=items[items.length-1];if(pv&&/^(cr|dr|c|d)\.?$/i.test(it.s.trim())&&isAmtTok(pv.s)&&!/[a-z]$/i.test(pv.s.trim())){items[items.length-1]={...pv,s:pv.s.trim()+" "+it.s.trim(),w:it.x+it.w-pv.x};continue}items.push({...it})}if(!items.length)continue;
    const text=items.map(i=>i.s).join(" ").replace(/\s+/g," ").trim();const L=text.toLowerCase();
    /* header row with columns */
    if(/date/.test(L)&&((/withdraw|debit|\bdr\b/.test(L)&&/deposit|credit|\bcr\b/.test(L))||/amount/.test(L))&&/balance|amount|debit|credit/.test(L)&&!isAmtTok(items[items.length-1].s)){
      const f=re=>{const it=items.find(i=>re.test(i.s.toLowerCase()));return it?center(it):null};
      const c={debit:f(/withdraw|debit|^dr\.?$|dr\s*amt/),credit:f(/deposit|credit|^cr\.?$|cr\s*amt/),bal:f(/balance/),amount:f(/amount/)};
      if(c.debit!=null||c.credit!=null)cols=c;continue}
    if(/total\s*(amount\s*)?due|min(imum)?\.?\s*(amount\s*)?due|payment\s*due\s*date|credit\s*limit|available\s*(credit|cash)|statement\s*(date|period)|previous\s*balance|reward\s*points?\s*(summary|earned)|cash\s*limit/i.test(text)){finish();continue}
    if(/opening\s*balance|closing\s*balance|brought\s*forward|^total\b|statement\s*summary|^page\s*\d/i.test(text)){if(/opening\s*balance/i.test(text)){const a=items.map(i=>isAmtTok(i.s)).filter(Boolean).pop();if(a)prevBal=a.v}finish();continue}
    /* does line start with a date? try first 1..4 tokens */
    let d=null,used=0;
    for(let k=1;k<=Math.min(3,items.length)&&!d;k++){const s=items.slice(0,k).map(i=>i.s).join(" ");if(s.length>16)break;const dd=parseDate(s,yh);if(dd&&/^\s*\d|^[A-Za-z]{3,9}\s+\d/.test(s)&&!/[A-Za-z]{3,9}\s+[A-Za-z]/.test(s.replace(/^[A-Za-z]{3,9}/,""))){d=dd;used=k;const nx=items[k]&&items[k].s.trim();if(nx&&/^[',]?\s*(\d{4}|'\d{2})$/.test(nx)){const d2=parseDate(s+" "+nx.replace(/^,/,""),yh);if(d2){d=d2;used=k+1}}}}
    if(!d){const m=text.match(/^(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3,9}(?:[\s\-',]+\d{2,4})?)\b/);if(m){d=parseDate(m[1],yh);if(d){used=-1}}}
    const amtItems=items.filter(i=>isAmtTok(i.s));
    if(d){finish();cur={date:d,desc:"",amount:0,dir:null,ref:"",raw:text,acctxt:""}}
    else if(!cur)continue;
    else cur.raw+=" "+text;
    /* description tokens */
    let rest=items.filter(i=>!isAmtTok(i.s));if(d&&used>0)rest=rest.filter(i=>!items.slice(0,used).includes(i));
    let dtxt=rest.map(i=>i.s).join(" ");if(used===-1)dtxt=dtxt.replace(/^(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3,9}(?:[\s\-',]+\d{2,4})?)\s*/,"");
    dtxt=dtxt.replace(/^\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}\s*/,"");/* value date */
    if(cur.desc.length<200&&dtxt&&!/^page\b/i.test(dtxt))cur.desc+=(cur.desc?" ":"")+dtxt;
    if(cur.amount||!amtItems.length)continue;
    /* amounts */
    const parsed=amtItems.map(i=>({a:isAmtTok(i.s),x:center(i)}));
    let amt=null,dir=null,bal=null;
    if(cols&&cols.debit!=null&&cols.credit!=null){
      for(const p of parsed){const cand=[["debit",cols.debit],["credit",cols.credit],["bal",cols.bal]].filter(c=>c[1]!=null).sort((a,b)=>Math.abs(a[1]-p.x)-Math.abs(b[1]-p.x))[0][0];
        if(cand==="bal")bal=p.a.v;else if(!amt){amt=p.a.v;dir=cand}}}
    if(!amt){
      if(parsed.length>=2&&(cols?.bal!=null||parsed.length>=2)){const b=parsed[parsed.length-1].a,a=parsed[parsed.length-2].a;amt=a.v;bal=b.v;dir=a.dir||(a.explicit?(a.sign<0?"debit":"credit"):null);
        if(!dir&&prevBal!=null){const df=Math.round((bal-prevBal)*100)/100;if(Math.abs(Math.abs(df)-amt)<0.02)dir=df<0?"debit":"credit"}}
      else{const a=parsed[0].a;amt=a.v;dir=a.dir||(a.explicit?(a.sign<0?"debit":"credit"):null)}
      if(!dir)dir=dirFromText(cur.raw)||"debit"}
    if(bal!=null)prevBal=bal;
    cur.amount=Math.round(amt*100)/100;cur.dir=dir;cur.bal=bal}
  finish();
  /* fix direction using balance chain where possible */
  for(let i=1;i<out.length;i++){const a=out[i-1],b=out[i];if(a.bal!=null&&b.bal!=null){const df=Math.round((b.bal-a.bal)*100)/100;if(Math.abs(Math.abs(df)-b.amount)<0.02)b.dir=df<0?"debit":"credit"}}
  return out}

window.IMPX={parseDate,parseAmt,parseTable,parsePdfLines,yearHint,dirFromText,refOf};
if(typeof document==="undefined")return;

/* ======================= UI ======================= */
const IMP=window.IMP=window.IMP||{rows:[],file:"",acc:"",flt:"all",q:""};
const css=document.createElement("style");css.textContent=`
.imp-drop{border:2px dashed #94a3b8;border-radius:14px;padding:22px;text-align:center;cursor:pointer;background:#f8fafc}
.imp-drop.over{background:#eef2ff;border-color:#4f46e5}
.imp-bar{position:sticky;top:0;z-index:5;background:#fff;border-radius:12px;padding:10px;box-shadow:0 2px 10px rgba(0,0,0,.08);margin:10px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.imp-row{display:flex;gap:10px;align-items:center;padding:10px 6px;border-bottom:1px solid #eef2f7;cursor:pointer}
.imp-row:hover{background:#f8fafc}.imp-row.off{opacity:.55}
.imp-row input[type=checkbox]{width:20px;height:20px;flex:none;margin:0}
.imp-mid{flex:1;min-width:0}.imp-d{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.imp-s{font-size:12px;color:#64748b;margin-top:2px;display:flex;flex-wrap:wrap;gap:6px}
.imp-tag{font-size:11px;padding:1px 7px;border-radius:999px;background:#eef2ff;color:#3730a3}
.imp-tag.dup{background:#fef3c7;color:#92400e}.imp-tag.nc{background:#fee2e2;color:#991b1b}.imp-tag.tr{background:#e0f2fe;color:#075985}
.imp-amt{font-weight:700;white-space:nowrap;text-align:right}
.imp-chips{display:flex;gap:6px;flex-wrap:wrap}.imp-chips a{padding:4px 10px;border-radius:999px;background:#f1f5f9;font-size:12px;cursor:pointer}.imp-chips a.on{background:#1e40af;color:#fff}
`;document.head.appendChild(css);

const learn=()=>{const m={};for(const t of S.txns){if(!t.category_id||!t.note)continue;const k=key(t.note);if(k)m[t.txn_type+"|"+k]=t.category_id}return m};
function key(n){return String(n).toLowerCase().replace(/paid to|received from|money sent to|sent to|upi\/?(dr|cr)?|transfer to|transfer from|by|to|from|neft|imps|rtgs|ref.*$|[0-9@\/\-:_.·*#]+/g," ").replace(/\s+/g," ").trim().split(" ").filter(w=>w.length>2).slice(0,3).join(" ")}
const RULES=[[/swiggy|zomato|hotel|restaurant|food|bakery|cafe|biryani|tea|canteen|mess/,["food","hotel","restaurant","snacks"]],[/petrol|fuel|hpcl|iocl|bpcl|indian oil|bharat petroleum|hp pay|shell/,["petrol","fuel","vehicle"]],[/amazon|flipkart|myntra|meesho|ajio|shopping|mart|store|supermarket|dmart|reliance/,["shopping","grocery","groceries","household"]],[/grocery|vegetable|kirana|provision|milk|dairy|aavin/,["grocery","groceries","provision","milk","household"]],[/electricity|tneb|tangedco|eb bill|power/,["electricity","eb","current bill","bills"]],[/recharge|airtel|jio|vodafone|\bvi\b|bsnl|dth|tata play|broadband|act fibernet/,["recharge","mobile","phone","internet","bills"]],[/medical|pharma|hospital|clinic|apollo|medplus|doctor|lab/,["medical","medicine","health","hospital"]],[/school|college|fees|tuition|education|exam/,["education","school","fees"]],[/irctc|railway|bus|redbus|uber|ola|rapido|travel|makemytrip|toll|fastag/,["travel","transport"]],[/rent/,["rent","house rent"]],[/emi|loan/,["emi","loan"]],[/insurance|lic|policy|premium/,["insurance","lic"]],[/netflix|hotstar|prime|spotify|youtube|subscription/,["subscription","entertainment"]],[/salary|sal |payroll/,["salary"]],[/interest/,["interest"]],[/cashback|reward/,["cashback","others"]],[/refund/,["refund","others"]],[/atm|cash withdrawal|cwdr/,["cash","atm"]]];
function suggestCat(r,L){const kind=r.type==="income"?"income":"expense";const k=key(r.desc);if(k&&L[r.type+"|"+k])return L[r.type+"|"+k];
  const t=r.desc.toLowerCase();const cats=S.cats.filter(c=>c.kind===kind);
  for(const[re,names]of RULES)if(re.test(t))for(const n of names){const c=cats.find(c=>c.name.toLowerCase()===n)||cats.find(c=>c.name.toLowerCase().includes(n));if(c)return c.id}
  return""}
function matchAccName(text){const t=String(text||"").trim().toLowerCase();if(!t)return"";const a=S.accs.find(a=>String(a._name||a.name).toLowerCase()===t)||S.accs.find(a=>a.name.toLowerCase()===t);return a?a.id:""}
function matchAcc(text){if(!text)return"";const d=String(text).replace(/\D/g,"");const t=String(text).toLowerCase();
  for(const a of S.accs){const tails=[a.acc_no&&String(a.acc_no).replace(/\D/g,"").slice(-4),a.card_last4].filter(x=>x&&x.length===4);if(tails.some(x=>d.endsWith(x)||new RegExp("(x|\\*|\\b)"+x+"\\b","i").test(t)))return a.id}
  return""}
function detectStmtAcc(text){const t=String(text);
  for(const a of S.accs){const tails=[a.acc_no&&String(a.acc_no).replace(/\D/g,"").slice(-4),a.card_last4].filter(x=>x&&x.length===4);
    for(const x of tails){if(a.acc_no&&String(a.acc_no).replace(/\D/g,"").length>=8&&t.replace(/\s/g,"").includes(String(a.acc_no).replace(/\D/g,"")))return a.id;if(new RegExp("(?:x{2,}|\\*{2,}|ending\\s*(?:with)?\\s*|a\\/c\\s*(?:no)?\\.?\\s*:?\\s*\\S*)"+x+"\\b","i").test(t))return a.id}}
  return""}
function isDup(r){const lo=new Date(r.date);lo.setDate(lo.getDate()-2);const hi=new Date(r.date);hi.setDate(hi.getDate()+2);const l=ds(lo),h=ds(hi);
  if(r.ref&&/^[A-Za-z0-9]{8,}$/.test(r.ref)&&S.txns.some(t=>(t.note||"").includes(r.ref)))return true;
  return S.txns.some(t=>Math.abs(num(t.amount)-r.amount)<0.01&&t.txn_date>=l&&t.txn_date<=h&&(t.account_id===r.acc||t.to_account_id===r.acc))}

let pdfLib=null;
function loadPdfJs(){if(pdfLib)return Promise.resolve(pdfLib);return new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";pdfLib=pdfjsLib;ok(pdfLib)};s.onerror=()=>no(Error("Could not load PDF reader. Check internet."));document.head.appendChild(s)})}
const PWK="impPdfPw";
const pwList=()=>{try{return JSON.parse(localStorage.getItem(PWK)||"[]")}catch(e){return[]}};
const pwSave=l=>{try{localStorage.setItem(PWK,JSON.stringify(l))}catch(e){}};
const BANKS=["sbi","icici","hdfc","axis","kotak","iob","canara","indian","bob","baroda","pnb","union","cub","kvb","tmb","idfc","yes","federal","amex","rbl","au","onecard","paytm"];
const guessLabel=n=>{n=String(n||"").toLowerCase();return(BANKS.find(b=>n.includes(b))||"").toUpperCase()};
function askPassword(msg,fname){return new Promise(res=>{const g=guessLabel(fname);openModal(`<h3>🔒 Password protected PDF</h3><p class="mute" style="font-size:13px">${esc(msg)}</p><div class="mute" style="font-size:12px;margin-bottom:6px">${esc(fname||"")}</div><label>PDF password</label><div class="row" style="gap:6px"><input type="password" id="ipw" autocomplete="off" style="flex:1"><button type="button" class="btn ghost sm" id="ipwEye">👁</button></div>
  <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="ipwSv" checked style="width:20px;height:20px">Save as default password for</label><input id="ipwLb" placeholder="e.g. SBI, ICICI, HDFC" value="${esc(g)}">
  <p class="mute" style="font-size:12px">Saved only on this device. Next time a ${esc(g||"bank")} statement opens automatically. Bank statement passwords are usually your DOB (DDMMYYYY), customer ID or name+DOB as given in the bank's email.</p><div class="row end"><button class="btn ghost" id="ipwC">Cancel</button><button class="btn" id="ipwO">Open</button></div>`);setTimeout(()=>$("#ipw").focus(),50);
  $("#ipwEye").onclick=()=>{const i=$("#ipw");i.type=i.type==="password"?"text":"password"};
  $("#ipwC").onclick=()=>{closeModal();res(null)};$("#ipwO").onclick=()=>{const v=$("#ipw").value;if(!v){$("#ipw").focus();return}const r={pw:v,save:$("#ipwSv").checked,label:($("#ipwLb").value||"").trim()};closeModal();res(r)};$("#ipw").onkeydown=e=>{e.key==="Enter"&&$("#ipwO").click()}})}
async function readPdf(buf,fname){const lib=await loadPdfJs();let doc=null;
  const open=async pw=>{try{return await lib.getDocument({data:buf.slice(0),password:pw}).promise}catch(e){if(e&&(e.name==="PasswordException"||/password/i.test(e.message||"")))return null;throw e}};
  doc=await open("");
  if(!doc){const fl=String(fname||"").toLowerCase();const saved=pwList().sort((a,b)=>(fl.includes(String(b.label).toLowerCase())?1:0)-(fl.includes(String(a.label).toLowerCase())?1:0));
    for(const p of saved){doc=await open(p.pw);if(doc){toast("🔓 Opened with saved "+(p.label||"")+" password");break}}
    for(let tries=0;tries<6&&!doc;tries++){const a=await askPassword(tries?"Wrong password – please try again.":(saved.length?"Saved passwords did not work. Enter the password for this statement.":"Enter the password to open this statement."),fname);if(!a)throw Error("Password not entered – file not imported");doc=await open(a.pw);
      if(doc&&a.save){const l=pwList().filter(x=>x.pw!==a.pw&&(!a.label||String(x.label).toLowerCase()!==a.label.toLowerCase()));l.unshift({label:a.label||guessLabel(fname)||"PDF",pw:a.pw});pwSave(l);toast("🔑 Password saved for "+(a.label||"PDF"))}}}
  if(!doc)throw Error("Could not open PDF – password not accepted");
  const lines=[];let all="";
  for(let p=1;p<=doc.numPages;p++){const pg=await doc.getPage(p);const tc=await pg.getTextContent();const rows=[];
    for(const it of tc.items){if(!it.str||!it.str.trim())continue;const y=it.transform[5],x=it.transform[4];let r=rows.find(r=>Math.abs(r.y-y)<2.5);if(!r){r={y,items:[]};rows.push(r)}r.items.push({s:it.str,x,w:it.width||0})}
    rows.sort((a,b)=>b.y-a.y);for(const r of rows){r.items.sort((a,b)=>a.x-b.x);/* merge touching fragments */const m=[];for(const it of r.items){const l=m[m.length-1];if(l&&it.x-(l.x+l.w)<1.2&&!/\s$/.test(l.s)){l.s+=it.s;l.w=it.x+it.w-l.x}else m.push({...it})}lines.push({items:m,page:p});all+=m.map(i=>i.s).join(" ")+"\n"}}
  if(all.replace(/\s/g,"").length<40)throw Error("This PDF has no readable text (scanned image). Please download the Excel/CSV statement instead.");
  return{lines,text:all}}
async function readFile(f){const buf=await f.arrayBuffer();const name=f.name.toLowerCase();
  if(name.endsWith(".pdf")||new Uint8Array(buf.slice(0,4)).join()==="37,80,68,70"){const{lines,text}=await readPdf(buf,f.name);const yh=yearHint(text);return{rows:parsePdfLines(lines,yh),text}}
  let wb;try{wb=XLSX.read(buf,{type:"array",cellDates:true,raw:false})}catch(e){if(/password|encrypt/i.test(e.message||""))throw Error("This Excel file is password protected. Please download the PDF or CSV statement, or open it in Excel → Save As without password.");throw e}let best=[],text="";
  for(const sn of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null});const t=rows.slice(0,40).map(r=>r.join(" ")).join("\n");text+=t+"\n";const yh=yearHint(t);const r=parseTable(rows,yh);if(r.length>best.length)best=r}
  return{rows:best,text}}

async function handleFile(f){
  $("#impMsg").innerHTML=`<div class="mute">⏳ Reading ${esc(f.name)}…</div>`;
  try{const{rows,text}=await readFile(f);
    if(!rows.length){$("#impMsg").innerHTML=`<div class="alert a" style="margin-top:10px">No transactions found in this file. Supported: Paytm UPI statement (Excel/PDF) and bank statements in Excel, CSV or PDF (text PDFs). If it's a PDF, try the Excel/CSV download from your bank.</div>`;return}
    const L=learn();const stmtAcc=detectStmtAcc(text)||IMP.acc||"";IMP.acc=stmtAcc;IMP.file=f.name;IMP.flt="all";IMP.q="";
    IMP.rows=rows.map((r,i)=>{const o={id:i+1,date:r.date,desc:r.desc||"(no description)",amount:r.amount,dir:r.dir,ref:r.ref||"",type:r.dir==="credit"?"income":"expense",acc:matchAccName(r.acctxt)||matchAcc(r.acctxt)||stmtAcc,to:"",cat:"",note:"",catTxt:r.cattxt||""};
      if(/transfer/.test(r.typetxt||"")){o.type="transfer";const ca=matchAccName(r.cattxt);if(ca){o.to=o.dir==="debit"?ca:o.acc;if(o.dir!=="debit"){o.acc=ca}o.catTxt=""}}
      if(o.catTxt&&o.type!=="transfer"){const k=o.type==="income"?"income":"expense";const c=S.cats.find(c=>c.kind===k&&c.name.toLowerCase()===o.catTxt.toLowerCase());if(c){o.cat=c.id;o.catTxt=""}}
      if(!o.cat&&!o.catTxt&&o.type!=="transfer")o.cat=suggestCat(o,L);o.note=noteOf(o);o.dup=o.acc?isDup(o):false;o.sel=!o.dup&&!(o.dir==="credit"&&isCard(accById(o.acc)));return o});
    vImport();toast(`${rows.length} transactions found`)}
  catch(e){$("#impMsg").innerHTML=`<div class="alert a" style="margin-top:10px">❌ ${esc(e.message||e)}</div>`}}
const noteOf=r=>(r.desc+(r.ref&&!r.desc.includes(r.ref)?" · Ref "+r.ref:"")).slice(0,240);
const kindOf=r=>r.type==="income"?"income":"expense";
const accList=()=>S.accs.filter(a=>a.active!==false);

function vImport(){
  const R=IMP.rows;
  $("#main").innerHTML=`<div class="row sb"><h2>📥 Import Statement</h2><div class="row">${R.length?'<button class="btn ghost sm" id="impNew">↺ New file</button>':""}<button class="btn ghost sm" id="impBack">📒 Transactions</button></div></div>
  ${R.length?"":`<div class="card"><div class="imp-drop" id="impDrop"><div style="font-size:34px">📄</div><b>Tap to choose your statement</b><div class="mute" style="font-size:13px;margin-top:4px">or drag & drop here · Excel (.xlsx/.xls), CSV or PDF</div></div>
   <input type="file" id="impFile" accept=".xlsx,.xls,.csv,.pdf,.txt" class="hidden"><div id="impMsg"></div>
   <div class="mute" style="font-size:13px;margin-top:12px;line-height:1.6"><b>Paytm:</b> Paytm app → Balance & History → Download UPI Statement → choose dates → Excel (or PDF).<br><b>Bank:</b> Net banking / bank app → Account Statement → download as Excel / CSV (best) or PDF.<br>Password-protected PDFs are supported – you'll be asked for the password (or a saved one is used). Nothing is saved until you tap <b>Add selected</b>.</div></div>
  <div class="card"><div class="row sb"><h3 style="margin:0">🔑 Saved PDF passwords <span class="mute" style="font-size:12px;font-weight:400">(this device only)</span></h3></div>
   <div id="impPw" style="margin-top:8px"></div>
   <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><input id="impPwL" placeholder="Bank / card (e.g. SBI)" style="flex:1;min-width:110px"><input id="impPwP" type="password" placeholder="Password" style="flex:1;min-width:110px" autocomplete="off"><button class="btn sm" id="impPwA">+ Save</button></div></div>
  <div class="card"><h3 style="margin:0 0 6px">📄 CSV format (corrected statements)</h3><div class="mute" style="font-size:13px;line-height:1.6">Columns: <b>Date, Description, Debit, Credit</b> – optional <b>Category, Account, Type, Ref</b>. Category / Account names that match yours are applied automatically; new category names are created when you add. Date as DD-MM-YYYY or YYYY-MM-DD.</div><button class="btn ghost sm" id="impTpl" style="margin-top:8px">⬇ Download CSV template</button></div>`}
  <div id="impList"></div>`;
  $("#impBack").onclick=()=>go("transactions");
  if($("#impNew"))$("#impNew").onclick=async()=>{if(IMP.rows.some(r=>r.sel)&&!await confirmBox("Discard this list and load a new file?"))return;IMP.rows=[];vImport()};
  if(!R.length){drawPw();$("#impPwA").onclick=()=>{const l=$("#impPwL").value.trim(),p=$("#impPwP").value;if(!p)return toast("Enter the password",!0);const L=pwList().filter(x=>String(x.label).toLowerCase()!==l.toLowerCase());L.unshift({label:l||"PDF",pw:p});pwSave(L);$("#impPwL").value="";$("#impPwP").value="";drawPw();toast("🔑 Saved")};
    $("#impTpl").onclick=()=>{const csv="Date,Description,Debit,Credit,Category,Account,Type,Ref\n01-11-2026,Paid to Saravana Stores,1200,,Groceries,SBI Savings,expense,633212345678\n02-11-2026,Salary November,,45000,Salary,SBI Savings,income,\n05-11-2026,Card bill payment,15000,,ICICI Card,SBI Savings,transfer,\n";const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="MoneyTasks_import_template.csv";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},60000)};
    const dz=$("#impDrop"),fi=$("#impFile");dz.onclick=()=>fi.click();fi.onchange=()=>fi.files[0]&&handleFile(fi.files[0]);
    dz.ondragover=e=>{e.preventDefault();dz.classList.add("over")};dz.ondragleave=()=>dz.classList.remove("over");dz.ondrop=e=>{e.preventDefault();dz.classList.remove("over");e.dataTransfer.files[0]&&handleFile(e.dataTransfer.files[0])};return}
  drawList()}

function drawPw(){const el=$("#impPw");if(!el)return;const L=pwList();el.innerHTML=L.length?L.map((p,i)=>`<div class="row sb" style="padding:6px 0;border-bottom:1px solid #eef2f7"><div><b>${esc(p.label)}</b> <span class="mute" data-pwv="${i}" style="cursor:pointer">••••••  (tap to show)</span></div><button class="btn ghost sm" data-pwd="${i}">🗑</button></div>`).join(""):'<div class="mute" style="font-size:13px">No saved passwords. Add one below, or tick "Save" when a PDF asks for its password.</div>';
  $$("[data-pwv]").forEach(e=>e.onclick=()=>{e.textContent=L[+e.dataset.pwv].pw});$$("[data-pwd]").forEach(b=>b.onclick=async()=>{if(!await confirmBox("Remove saved password for "+L[+b.dataset.pwd].label+"?"))return go("import");L.splice(+b.dataset.pwd,1);pwSave(L);go("import");toast("Removed")})}
function drawList(){
  const R=IMP.rows,el=$("#impList");if(!el)return;
  const vis=R.filter(r=>(IMP.flt==="all"||(IMP.flt==="debit"&&r.dir==="debit")||(IMP.flt==="credit"&&r.dir==="credit")||(IMP.flt==="dup"&&r.dup)||(IMP.flt==="sel"&&r.sel)||(IMP.flt==="nocat"&&r.type!=="transfer"&&!r.cat&&!r.catTxt))&&(!IMP.q||(r.desc+" "+r.amount).toLowerCase().includes(IMP.q.toLowerCase())));
  const sel=R.filter(r=>r.sel),dr=R.filter(r=>r.dir==="debit"),cr=R.filter(r=>r.dir==="credit");
  const sum=a=>a.reduce((s,r)=>s+r.amount,0);const dates=R.map(r=>r.date).sort();
  const accs=accList();
  el.innerHTML=`<div class="card"><div class="grid g4">
   <div class="stat"><div class="l">File</div><div class="v" style="font-size:13px;word-break:break-all">${esc(IMP.file)}</div><div class="mute" style="font-size:12px">${dmy(dates[0])} – ${dmy(dates[dates.length-1])}</div></div>
   <div class="stat"><div class="l">Debits (${dr.length})</div><div class="v red">${fmt(sum(dr))}</div></div>
   <div class="stat"><div class="l">Credits (${cr.length})</div><div class="v green">${fmt(sum(cr))}</div></div>
   <div class="stat"><div class="l">Possible duplicates</div><div class="v ${R.some(r=>r.dup)?"amber":""}">${R.filter(r=>r.dup).length}</div></div></div>
   <div style="margin-top:10px"><label>This statement belongs to account</label><select id="impAcc">${accOptions(accs,IMP.acc)}</select><div class="mute" style="font-size:12px;margin-top:4px">Changing this sets the account for all rows (you can still change single rows).</div></div></div>
  <div class="imp-bar"><label style="display:flex;align-items:center;gap:6px;margin:0;font-weight:600"><input type="checkbox" id="impAll" ${vis.length&&vis.every(r=>r.sel)?"checked":""} style="width:20px;height:20px">All</label>
   <div class="imp-chips">${[["all","All "+R.length],["debit","Debits"],["credit","Credits"],["sel","Selected"],["nocat","No category"],["dup","Duplicates"]].map(([k,l])=>`<a data-f="${k}" class="${IMP.flt===k?"on":""}">${l}</a>`).join("")}</div>
   <input id="impQ" placeholder="Search…" value="${esc(IMP.q)}" style="flex:1;min-width:120px">
   <select id="impBulkCat" style="max-width:190px"><option value="">Set category for selected…</option><optgroup label="Expense">${S.cats.filter(c=>c.kind==="expense").map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</optgroup><optgroup label="Income">${S.cats.filter(c=>c.kind==="income").map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</optgroup></select>
   <select id="impBulkAcc" style="max-width:190px"><option value="">Set account for selected…</option>${accs.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select>
   <button class="btn" id="impGo" ${sel.length?"":"disabled"}>✔ Add selected (${sel.length})</button></div>
  <div class="card list" id="impRows">${vis.map(rowHtml).join("")||'<div class="empty">Nothing here</div>'}</div>
  <p class="mute" style="font-size:12px">Tap a row to change type, category, account, date, amount or note before adding. Rows marked <span class="imp-tag dup">Possible duplicate</span> already look present in your app and are unticked.</p>`;
  $("#impAcc").onchange=e=>{IMP.acc=e.target.value;R.forEach(r=>{r.acc=IMP.acc;r.dup=r.acc?isDup(r):false});drawList()};
  $("#impAll").onchange=e=>{vis.forEach(r=>r.sel=e.target.checked);drawList()};
  $$("[data-f]").forEach(a=>a.onclick=()=>{IMP.flt=a.dataset.f;drawList()});
  $("#impQ").oninput=e=>{IMP.q=e.target.value;const p=e.target.selectionStart;drawList();const q=$("#impQ");q.focus();q.setSelectionRange(p,p)};
  $("#impBulkCat").onchange=e=>{const c=S.cats.find(c=>c.id===e.target.value);if(!c)return;let n=0;sel.forEach(r=>{if(r.type!=="transfer"&&kindOf(r)===c.kind){r.cat=c.id;n++}});toast(n?`Category set for ${n} row(s)`:`No selected ${c.kind} rows`,!n);drawList()};
  $("#impBulkAcc").onchange=e=>{const v=e.target.value;if(!v)return;sel.forEach(r=>{r.acc=v;if(r.to===v)r.to="";r.dup=isDup(r)});toast(`Account set for ${sel.length} row(s)`);drawList()};
  $$("#impRows [data-r]").forEach(row=>{const r=R.find(x=>x.id==row.dataset.r);row.querySelector("input").onclick=e=>{e.stopPropagation();r.sel=e.target.checked;drawList()};row.onclick=()=>editRow(r)});
  $("#impGo").onclick=doImport}

function rowHtml(r){const a=accById(r.acc),t=accById(r.to);
  const lab=r.type==="transfer"?`<span class="imp-tag tr">Transfer → ${esc(t?.name||"select account")}</span>`:r.cat?`<span class="imp-tag">${esc(catName(r.cat))}</span>`:r.catTxt?`<span class="imp-tag">${esc(r.catTxt)} (new)</span>`:'<span class="imp-tag nc">No category</span>';
  return`<div class="imp-row ${r.sel?"":"off"}" data-r="${r.id}"><input type="checkbox" ${r.sel?"checked":""}><div class="imp-mid"><div class="imp-d">${esc(r.desc)}</div><div class="imp-s"><span>${dmy(r.date)}</span><span>${esc(a?.name||"⚠ no account")}</span>${lab}${r.type!==(r.dir==="credit"?"income":"expense")&&r.type!=="transfer"?`<span class="imp-tag">${r.type}</span>`:""}${r.dup?'<span class="imp-tag dup">Possible duplicate</span>':""}</div></div><div class="imp-amt ${r.dir==="credit"?"green":"red"}">${r.dir==="credit"?"+":"−"}${fmt(r.amount)}</div></div>`}

function editRow(r){
  const accs=accList();let type=r.type;
  const body=()=>`<h3>Edit entry</h3><div class="mute" style="font-size:12px;margin-bottom:8px">${esc(r.desc)}</div>
   <label>Type</label><select id="eType">${[["expense","Expense (money out)"],["income","Income (money in)"],["transfer","Transfer / Card bill / Loan payment"]].map(([v,l])=>`<option value="${v}" ${type===v?"selected":""}>${l}</option>`).join("")}</select>
   <div class="f2"><div><label>Date</label><input type="date" id="eDate" value="${r.date}"></div><div><label>Amount</label><input type="number" step="0.01" id="eAmt" value="${r.amount}"></div></div>
   ${type==="transfer"?`<div class="f2"><div><label>From account</label><select id="eAcc">${accOptions(accs,r.acc)}</select></div><div><label>To account / card / loan</label><select id="eTo">${accOptions(accs,r.to)}</select></div></div>`
    :`<label>${type==="income"?"Credit to account":"Paid from account / card"}</label><select id="eAcc">${accOptions(accs,r.acc)}</select><label>Category</label><select id="eCat">${catOptions(kindOf({type}),r.cat)}</select>`}
   <label>Note</label><textarea id="eNote" rows="2">${esc(r.note)}</textarea>
   <label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="eSel" ${r.sel?"checked":""} style="width:20px;height:20px">Include this entry in import</label>
   <div class="row end" style="margin-top:12px"><button class="btn ghost" id="eC">Cancel</button><button class="btn" id="eS">Save</button></div>`;
  const draw=()=>{const keep={date:$("#eDate")?.value,amt:$("#eAmt")?.value,acc:$("#eAcc")?.value,note:$("#eNote")?.value};openModal(body());if(keep.date){$("#eDate").value=keep.date;$("#eAmt").value=keep.amt;$("#eAcc").value=keep.acc;$("#eNote").value=keep.note}
    $("#eCat")&&bindCatSelect($("#eCat"),kindOf({type}));
    $("#eType").onchange=e=>{type=e.target.value;draw()};$("#eC").onclick=closeModal;
    $("#eS").onclick=()=>{const amt=num($("#eAmt").value);if(!(amt>0))return toast("Enter amount",!0);const acc=$("#eAcc").value;if(!acc)return toast("Select account",!0);
      if(type==="transfer"){const to=$("#eTo").value;if(!to)return toast("Select To account",!0);if(to===acc)return toast("From and To cannot be same",!0);r.to=to;r.cat=""}else{r.to="";const c=$("#eCat").value;r.cat=c&&c!=="__new"?c:"";if(r.cat)r.catTxt=""}
      r.type=type;r.date=$("#eDate").value||r.date;r.amount=Math.round(amt*100)/100;r.acc=acc;r.note=$("#eNote").value.trim();r.sel=$("#eSel").checked;r.dup=isDup(r);closeModal();drawList()}};
  draw()}

async function doImport(){
  const sel=IMP.rows.filter(r=>r.sel);if(!sel.length)return;
  const bad=sel.find(r=>!r.acc||(r.type==="transfer"&&!r.to));if(bad){toast(!bad.acc?"Some selected rows have no account – choose the statement account":"A transfer row needs a To account",!0);return}
  const nc=sel.filter(r=>r.type!=="transfer"&&!r.cat&&!r.catTxt).length;
  if(!await confirmBox(`Add ${sel.length} entries to your transactions?${nc?` (${nc} without category)`:""}`))return;
  for(const r of sel)if(!r.cat&&r.catTxt&&r.type!=="transfer"){r.cat=await ensureCat(kindOf(r),r.catTxt)||"";r.catTxt=""}
  const recs=sel.map(r=>({txn_date:r.date,txn_type:r.type,amount:r.amount,category_id:r.type==="transfer"?null:r.cat||null,account_id:r.acc,to_account_id:r.type==="transfer"?r.to:null,note:r.note||null}));
  const b=$("#impGo");b.disabled=true;b.textContent="Saving…";
  for(let i=0;i<recs.length;i+=200){const{error}=await SB.from("transactions").insert(recs.slice(i,i+200));if(error){b.disabled=false;b.textContent="✔ Add selected";await loadAll();IMP.rows=IMP.rows.filter(r=>!sel.slice(0,i).includes(r));drawList();return toast(error.message,!0)}}
  const ds_=sel.map(r=>r.date).sort();IMP.rows=IMP.rows.filter(r=>!r.sel);
  await loadAll();drawHdr();toast(`✔ ${recs.length} entries added`);
  TF.from=ds_[0];TF.to=ds_[ds_.length-1];TF.type="";TF.acc="";TF.cat="";TF.q="";
  if(!IMP.rows.length)go("transactions");else{IMP.rows.forEach(r=>r.dup=isDup(r));drawList()}}

/* ---------- hook into app ---------- */
window.vImport=vImport;window.IMPX.readFile=readFile;
if(!VIEWS.some(v=>v[0]==="import")){const i=VIEWS.findIndex(v=>v[0]==="transactions");VIEWS.splice(i+1,0,["import","📥","Import Statement"])}
const _render=window.render;
window.render=function(){if(VIEW==="import"){killCharts();$$("[data-v]").forEach(t=>t.classList.toggle("active",t.dataset.v===VIEW));$("#bMore")&&$("#bMore").classList.add("active");vImport()}else _render()};
const _vTxns=window.vTxns;
window.vTxns=function(){_vTxns();const a=$("#tAdd");if(a&&!$("#tImp")){const b=document.createElement("button");b.className="btn ghost sm";b.id="tImp";b.textContent="⬆ Import";b.onclick=()=>go("import");a.before(b)}};
/* if nav was already drawn before this patch loaded */
const sn=$("#sideNav");if(sn&&sn.children.length&&!sn.querySelector('[data-v="import"]')){const t=sn.querySelector('[data-v="transactions"]');const a=document.createElement("a");a.dataset.v="import";a.title="Import Statement";a.innerHTML='<span class="ni">📥</span><span class="nl">Import Statement</span>';a.onclick=()=>go("import");t?t.after(a):sn.prepend(a)}
try{if(location.hash==="#import"&&S.user&&VIEW!=="import")go("import");else if(typeof VIEW!=="undefined"&&(VIEW==="transactions"||VIEW==="import")&&$("#main")&&S.user)render()}catch(x){}
})();
