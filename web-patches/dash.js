/* Money & Tasks patch v3: Dashboard month/year picker – shows that month's figures and month-end closing balances */
(function(){
const R=(s,a,b)=>{if(s.indexOf(a)<0)throw Error("anchor not found: "+a);return s.split(a).join(b)};
try{
let s=vDash.toString();
s=R(s,"const t=mStart(),e=mEnd()","const t=mStart(window.__DM||today()),e=mEnd(window.__DM||today())");
s=R(s,"M=alerts()","M=window.__DCUR===false?[]:alerts()");
s=R(s,'<span class="mute" style="font-size:13px;font-weight:400">${MON[(new Date).getMonth()]} ${(new Date).getFullYear()}</span>','');
s=R(s,'</h2>','</h2><div class="card dmbar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;margin-bottom:12px"><button class="btn ghost sm" id="dmPrev" title="Previous month">◀</button><input type="month" id="dmPick" value="${(window.__DM||today()).slice(0,7)}" style="width:auto;flex:none"><button class="btn ghost sm" id="dmNext" title="Next month">▶</button>${window.__DCUR===false?\'<button class="btn sm" id="dmNow">This month</button><span class="mute" style="font-size:12px">Balances shown as on \'+dmy(e)+\'</span>\':\'\'}</div>');
s=R(s,"· this month","· ${window.__DML||\"this month\"}");
s=R(s,"Given this month","Given in ${window.__DML||\"month\"}");
s=R(s,"Returned this month","Returned in ${window.__DML||\"month\"}");
s=R(s,"This month's spending","${window.__DCUR===false?window.__DML+\" spending\":\"This month's spending\"}");
s=R(s,'<div class="stat"><div class="l">Total bank balance</div><div class="v">${fmt(w)}</div></div>','<div class="stat"><div class="l">Opening balance (${dmy(t)})</div><div class="v">${fmt(n.reduce((s,x)=>s+bal(x.id,t,!0),0))}</div></div><div class="stat" style="border:2px solid #4f46e5"><div class="l">Closing balance (${dmy(e)})</div><div class="v ${w<0?"red":""}">${fmt(w)}</div></div>');
s=R(s,"S.txns.slice(0,6).map(txnRow)","(a.length?a:S.txns).slice(0,8).map(txnRow)");
s=R(s,"<h3>Recent entries</h3>","<h3>${a.length?(window.__DML||\"This month\")+\" entries\":\"Recent entries\"}</h3>");
const patched=(0,eval)("("+s+")");
window.vDash=function(){
  const cur=today().slice(0,7),m=window.__DMv||cur;
  window.__DM=m+"-01";window.__DCUR=m===cur;window.__DML=MON[+m.slice(5,7)-1]+" "+m.slice(0,4);
  const end=mEnd(window.__DM),real=S.txns;
  S.txns=real.filter(x=>x.txn_date<=end);
  try{patched()}finally{S.txns=real}
  const set=v=>{window.__DMv=v;render()};
  const shift=k=>{const d=new Date(+m.slice(0,4),+m.slice(5,7)-1+k,1);set(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"))};
  $("#dmPrev").onclick=()=>shift(-1);$("#dmNext").onclick=()=>shift(1);
  $("#dmPick").onchange=e=>e.target.value&&set(e.target.value);
  $("#dmNow")&&($("#dmNow").onclick=()=>set(cur));
};
if(typeof VIEW!=="undefined"&&VIEW==="dashboard"&&S.user&&$("#main"))render();
}catch(x){console.warn("dash month patch",x)}
})();
