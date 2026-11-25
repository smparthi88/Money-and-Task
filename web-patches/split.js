/* Money & Tasks patch v4: Split payment – pay one expense from more than one account (e.g. savings + credit card) */
(function(){
const R=(s,a,b)=>{if(s.indexOf(a)<0)throw Error("anchor not found: "+a);return s.split(a).join(b)};
const r2=v=>Math.round(num(v)*100)/100;
const rowHtml=(accs,r)=>`<div class="sp-row" style="display:flex;gap:8px;align-items:flex-end;margin-top:4px">
 <div style="flex:1;min-width:0"><label>Also paid from</label><select class="spAcc">${accOptions(accs,r.acc||"")}</select></div>
 <div style="width:120px;flex:none"><label>Amount (₹)</label><input type="number" step="0.01" min="0.01" inputmode="decimal" class="spAmt" value="${r.amt||""}"></div>
 <button type="button" class="btn ghost sm spDel" title="Remove" style="flex:none;margin-bottom:4px">✕</button></div>`;

/* read split rows from the form into the entry state */
window.__spRead=n=>{if(!document.querySelector("#spBox"))return;n.split=$$("#spBox .sp-row").map(x=>({acc:x.querySelector(".spAcc").value,amt:x.querySelector(".spAmt").value}))};

window.__spHtml=(accs,n)=>{n.split=n.split||[];window.__spAccs=accs;
 return `<div id="spBox">${n.split.map(r=>rowHtml(accs,r)).join("")}</div>
 <a href="#" id="spAdd" style="display:inline-block;margin-top:8px;font-size:13px">+ Add another account (split payment)</a>
 <div id="spInfo" style="font-size:12px;margin-top:6px"></div>`};

window.__spBind=n=>{if(!$("#spAdd"))return;
 const info=()=>{const el=$("#spInfo");if(!el)return;window.__spRead(n);
  const rows=(n.split||[]).filter(r=>r.acc||num(r.amt));
  if(!rows.length){el.innerHTML="";return}
  const tot=num($("#xAmt").value),oth=rows.reduce((s,r)=>s+num(r.amt),0),main=r2(tot-oth),ma=accById($("#xAcc").value);
  el.innerHTML=`<div style="background:#f1f5f9;border-radius:10px;padding:8px">Total <b>${fmt(tot)}</b> = ${esc(ma?ma.name:"Main account")}: <b class="${main>0?"":"red"}">${fmt(main)}</b>${rows.map(r=>{const a=accById(r.acc);return ` + ${esc(a?a.name:"(select account)")}: <b>${fmt(num(r.amt))}</b>`}).join("")}${main>0?"":'<br><span class="red">Split amounts must be less than the total amount.</span>'}</div>`};
 const bind=()=>{$$("#spBox .spDel").forEach((b,k)=>b.onclick=()=>{window.__spRead(n);n.split.splice(k,1);draw()});
  $$("#spBox .spAcc,#spBox .spAmt").forEach(x=>{x.oninput=info;x.onchange=info})};
 const draw=()=>{$("#spBox").innerHTML=n.split.map(r=>rowHtml(window.__spAccs,r)).join("");bind();info()};
 $("#spAdd").onclick=e=>{e.preventDefault();window.__spRead(n);n.split.push({acc:"",amt:""});draw();const l=$$("#spBox .spAcc");l.length&&l[l.length-1].focus()};
 $("#xAmt")&&$("#xAmt").addEventListener("input",info);$("#xAcc")&&$("#xAcc").addEventListener("change",info);
 bind();info()};

/* validate on save */
window.__spGet=(n,total)=>{window.__spRead(n);
 const rows=(n.split||[]).filter(r=>r.acc||num(r.amt));if(!rows.length)return{rows:[]};
 const seen=new Set([n.acc]);let sum=0;
 for(const r of rows){if(!r.acc)return{err:"Select the account for each split row"};
  if(!(num(r.amt)>0))return{err:"Enter the amount for each split account"};
  if(seen.has(r.acc))return{err:"Each split account must be different"};
  seen.add(r.acc);sum+=num(r.amt)}
 if(r2(total-sum)<=0)return{err:"Split amounts must be less than the total amount"};
 for(const r of rows){const a=accById(r.acc);if(!a)continue;
  if(isCard(a)){const ci=cardInfo(a);if(ci.limit&&ci.available-num(r.amt)<0)toast("Warning: "+a.name+" – card limit exceeded!",!0)}
  else if(bal(a.id)-num(r.amt)<0)toast("Warning: "+a.name+(isLoan(a)?" – spending more than the loan amount available!":" balance goes negative!"),!0)}
 return{rows}};

/* one transaction row per account, so every account balance / card limit reflects its own share */
window.__spRows=(c,sp)=>{if(!sp||!sp.rows||!sp.rows.length)return[c];
 const tot=r2(c.amount),oth=sp.rows.reduce((s,r)=>s+num(r.amt),0),
  names=[c.account_id,...sp.rows.map(r=>r.acc)].map(id=>accById(id)?.name||"").join(" + "),
  note=(c.note?c.note+" · ":"")+"Split payment of "+fmt(tot)+" ("+names+")";
 return[{...c,amount:r2(tot-oth),note},...sp.rows.map(r=>({...c,account_id:r.acc,amount:r2(r.amt),note}))]};

try{
 let s=txnModal.toString();
 s=R(s,'<select id="xAcc">${accOptions(i,n.acc)}</select>','<select id="xAcc">${accOptions(i,n.acc)}</select>${e?"":window.__spHtml(i,n)}');
 s=R(s,'n.int=$("#xInt").value)}','n.int=$("#xInt").value),window.__spRead(n)}');
 s=R(s,'$("#xClose").onclick=closeModal;','$("#xClose").onclick=closeModal;"expense"!==a||e||window.__spBind(n);');
 s=R(s,'if(!n.acc)return toast("Select account",!0);','if(!n.acc)return toast("Select account",!0);const __sp="expense"!==a||e?null:window.__spGet(n,s);if(__sp&&__sp.err)return toast(__sp.err,!0);');
 s=R(s,'"income"!==a&&"loanin"!==a)','"income"!==a&&"loanin"!==a&&!(__sp&&__sp.rows.length))');
 s=R(s,'o>0&&t.push(c)','o>0&&t.push(...window.__spRows(c,__sp))');
 window.txnModal=(0,eval)("("+s+")");
}catch(x){console.warn("split payment patch",x)}
})();
