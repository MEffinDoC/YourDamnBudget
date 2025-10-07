// YDB v15 — full app (no placeholders)
import { computeWeekPay, iso, money, paydayBounds } from './engine.js';

const app=document.getElementById('app'), wizard=document.getElementById('wizard'); const TABS=document.querySelector('nav.tabs');
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function key(){const repo=(location.pathname.split('/')[1]||'root').toLowerCase();return `ydb:${repo}:v3`;}
let state=JSON.parse(localStorage.getItem(key()))||{};
state.ui=state.ui||{onboarded:false,lang:'en',tone:'spicy'}; state.user=state.user||{paydayWeekday:5,faFundsPerWeek:50};
state.bank=state.bank||{currentBalance:0}; state.payRules=state.payRules||{baseHourly:20,withholdingRatio:.2};
state.hours=state.hours||{mode:'simple',regular:40,ot:0,otMultiplier:1.5};
state.bills=state.bills||[]; state.loans=state.loans||[]; state.envelopes=state.envelopes||[]; state.events=state.events||[]; state.paid=state.paid||[];
save();

function save(){localStorage.setItem(key(),JSON.stringify(state));}
function section(h,b=''){const s=document.createElement('section');s.className='card';s.innerHTML=(h?`<h2>${h}</h2>`:'')+b;return s;}
function lastNext(){return paydayBounds(new Date(), state.user.paydayWeekday||5);}

// ---------- HOME ----------
function renderHome(){
  const {start,end}=lastNext(); const bankBal=+state.bank.currentBalance||0;
  const pay=computeWeekPay(state.payRules,state.hours), weeklyNet=+pay.net||0;
  const variables=(state.envelopes||[]).reduce((s,e)=>s+(+e.weeklyTarget||0),0);
  const faf=+state.user.faFundsPerWeek||0;
  const starting=bankBal+weeklyNet;

  // upcoming within pay period (bills, loans, events) minus already paid entries
  const items=[]; const paidKey=p=>`${p.kind}:${p.id}:${p.dateISO}`; const paid=new Set(state.paid.map(p=>paidKey(p)));
  (state.bills||[]).forEach(b=>{for(let m=0;m<2;m++){const d=new Date(start.getFullYear(),start.getMonth()+m,b.dueDay); if(d>=start&&d<end){const it={kind:'bill',id:b.id,name:b.name,dateISO:iso(d),amount:+b.amount}; if(!paid.has(paidKey(it))) items.push(it);}}});
  (state.loans||[]).forEach(l=>{for(let m=0;m<2;m++){const d=new Date(start.getFullYear(),start.getMonth()+m,l.dueDay); if(d>=start&&d<end){const it={kind:'loan',id:l.id,name:l.name,dateISO:iso(d),amount:+l.minimumPayment}; if(!paid.has(paidKey(it))) items.push(it);}}});
  (state.events||[]).forEach(e=>{const d=new Date(e.date); if(d>=start&&d<end){const it={kind:'event',id:e.id,name:e.name||'One-time',dateISO:iso(d),amount:+e.amount}; if(!paid.has(paidKey(it))) items.push(it);}}));
  items.sort((a,b)=>a.dateISO.localeCompare(b.dateISO)||a.name.localeCompare(b.name));

  const paidAmt=(state.paid||[]).filter(p=>new Date(p.dateISO)>=start&&new Date(p.dateISO)<end).reduce((s,p)=>{
    if(p.kind==='bill'){const b=state.bills.find(x=>x.id===p.id); return s+(b?+b.amount:0);}
    if(p.kind==='loan'){const l=state.loans.find(x=>x.id===p.id); return s+(l?+l.minimumPayment:0);}
    if(p.kind==='event'){const e=state.events.find(x=>x.id===p.id); return s+(e?+e.amount:0);}
    return s;
  },0);

  const live=starting - paidAmt - variables - faf;
  const kpis=section('Weekly Damage Report',`
    <div class="grid cols-3" style="margin-top:6px">
      <div><div class="kpi-label">Cash This Week</div><div class="kpi-value">${money(starting)}</div>
        <details class="disclosure"><summary>Show breakdown</summary>
          <div class="help">Bank: ${money(bankBal)} + Est. net paycheck: ${money(weeklyNet)}</div>
          <div class="help">Pay period: ${iso(start)} → ${iso(end)}</div>
        </details></div>
      <div><div class="kpi-label">Fuck Around Funds</div><div class="kpi-value">${money(faf)}</div><div class="help">Edit in Settings</div></div>
      <div><div class="kpi-label">After Damage</div><div class="kpi-value ${live<0?'negative':'positive'}">${money(live)}</div><div class="help">= Cash – paid – buckets – FAF</div></div>
    </div>`);
  app.appendChild(kpis);

  // Upcoming list with "I paid it" instant remove
  const upcoming=section('Due this pay period',`
    <div class="table-scroll"><table><thead><tr><th>Date</th><th>What</th><th>$</th><th></th></tr></thead>
    <tbody>${items.length?items.map(it=>`<tr><td>${it.dateISO}</td><td>${it.name}<span class="badge">${it.kind}</span></td><td>${money(it.amount)}</td><td><button class="button" data-paid='${JSON.stringify(it)}'>Paid ✔</button></td></tr>`).join(''):`<tr><td colspan="4" class="help">Nothing else due before ${iso(end)}.</td></tr>`}</tbody></table></div>`);
  app.appendChild(upcoming);
  upcoming.querySelectorAll('[data-paid]').forEach(b=>b.onclick=()=>{const it=JSON.parse(b.dataset.paid); state.paid.push({kind:it.kind,id:it.id,dateISO:it.dateISO}); save(); render();});

  // Afford check
  const afford=section('Can I afford this?',`
   <div class="grid cols-3"><div><label>Amount</label><input id="aff_amt" type="number" step="0.01" placeholder="e.g. 49.99"></div>
   <div><label>Date</label><input id="aff_date" type="date" value="${iso(new Date())}"></div>
   <div class="row"><button id="aff_go" class="button primary">Ask my damn budget</button></div></div><div id="aff_msg" class="help" style="margin-top:6px"></div>`);
  app.appendChild(afford);
  afford.querySelector('#aff_go').onclick=()=>{const amt=+afford.querySelector('#aff_amt').value||0;const left=live;const msg=afford.querySelector('#aff_msg'); if(amt<=0){msg.textContent='Enter a real amount.';return;} msg.textContent=(left-amt>=0)?`Yep. You’ll have ${money(left-amt)} left.`:`Careful — you’re about to fuck around and find out (${money(left-amt)}).`;};
}

// ---------- PLANNER (12 weeks simple projection) ----------
function renderPlanner(){
  const rows=[]; const weeklyNet=computeWeekPay(state.payRules,state.hours).net||0;
  const must=(state.bills||[]).reduce((s,b)=>s+(+b.amount||0)/4.345,0)+(state.loans||[]).reduce((s,l)=>s+(+l.minimumPayment||0)/4.345,0);
  const vars=(state.envelopes||[]).reduce((s,e)=>s+(+e.weeklyTarget||0),0); const faf=+state.user.faFundsPerWeek||0;
  let d=new Date(); for(let i=0;i<12;i++){const start=iso(d);const left=weeklyNet - must - vars - faf; rows.push(`<tr><td>Week ${i+1}</td><td>${start}</td><td>${money(weeklyNet)}</td><td>${money(must)}</td><td>${money(vars)}</td><td>${money(faf)}</td><td class="${left<0?'negative':'positive'}">${money(left)}</td></tr>`); d.setDate(d.getDate()+7);}
  app.appendChild(section('Crystal Ball — 12 weeks', `<div class="table-scroll"><table><thead><tr><th>Wk</th><th>Start</th><th>Income</th><th>Must</th><th>Buckets</th><th>FAF</th><th>Left</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`));
}

// ---------- TIMESHEET ----------
function renderTimesheet(){
  const r=state.payRules, h=state.hours; const s=section('Hours → Paycheck',`
   <div class="grid cols-3">
     <div><label>Base hourly</label><input id="bh" type="number" step="0.01" value="${r.baseHourly||0}"></div>
     <div><label>Withholding (0–1)</label><input id="wr" type="number" step="0.01" value="${r.withholdingRatio??.2}"></div>
     <div><label>Mode</label><select id="mode"><option value="simple"${h.mode!=='advanced'?' selected':''}>Simple</option><option value="advanced"${h.mode==='advanced'?' selected':''}>Advanced</option></select></div>
   </div><div id="hrs"></div>
   <div class="grid cols-3" style="margin-top:8px"><button id="save" class="button primary">Save & Update Home</button></div>
   <div id="out" class="help" style="margin-top:6px"></div>`);
  app.appendChild(s);
  const hrs=s.querySelector('#hrs'), out=s.querySelector('#out');
  function draw(){ if(s.querySelector('#mode').value==='advanced'){hrs.innerHTML=`<div class="grid cols-3">
    <div><label>Regular</label><input id="hr" type="number" step="0.1" value="${h.regular||0}"></div>
    <div><label>OT 1.5×</label><input id="h15" type="number" step="0.1" value="${h.ot15||0}"></div>
    <div><label>OT 2×</label><input id="h2" type="number" step="0.1" value="${h.ot2||0}"></div></div>`;}
  else{hrs.innerHTML=`<div class="grid cols-3">
    <div><label>Regular</label><input id="hr" type="number" step="0.1" value="${h.regular||0}"></div>
    <div><label>OT hours</label><input id="hot" type="number" step="0.1" value="${h.ot||0}"></div>
    <div><label>OT Multiplier</label><select id="mult">
      <option value="1.25"${(+h.otMultiplier||1.5)==1.25?' selected':''}>1.25×</option>
      <option value="1.5"${(+h.otMultiplier||1.5)==1.5?' selected':''}>1.5×</option>
      <option value="2"${(+h.otMultiplier||1.5)==2?' selected':''}>2×</option></select></div></div>`;} }
  function preview(){const rules={baseHourly:+s.querySelector('#bh').value||0,withholdingRatio:+s.querySelector('#wr').value||0};let hours={mode:s.querySelector('#mode').value};
    if(hours.mode==='advanced'){hours.regular=+s.querySelector('#hr').value||0;hours.ot15=+s.querySelector('#h15').value||0;hours.ot2=+s.querySelector('#h2').value||0;}
    else{hours.regular=+s.querySelector('#hr').value||0;hours.ot=+s.querySelector('#hot').value||0;hours.otMultiplier=+s.querySelector('#mult').value||1.5;}
    const p=computeWeekPay(rules,hours); out.textContent=`Gross ${money(p.gross)} → Net ${money(p.net)}`;}
  s.querySelector('#mode').onchange=()=>{draw();preview()}; draw(); s.addEventListener('input',preview); preview();
  s.querySelector('#save').onclick=()=>{ state.payRules={baseHourly:+s.querySelector('#bh').value||0,withholdingRatio:+s.querySelector('#wr').value||0};
    if(s.querySelector('#mode').value==='advanced'){state.hours={mode:'advanced',regular:+s.querySelector('#hr').value||0,ot15:+s.querySelector('#h15').value||0,ot2:+s.querySelector('#h2').value||0};}
    else{state.hours={mode:'simple',regular:+s.querySelector('#hr').value||0,ot:+s.querySelector('#hot').value||0,otMultiplier:+s.querySelector('#mult').value||1.5};}
    save(); alert('Saved. Home will use this net estimate.'); };
}

// ---------- BILLS ----------
function renderBills(){
  const rows=(state.bills||[]).sort((a,b)=>a.dueDay-b.dueDay||a.name.localeCompare(b.name)).map(b=>`<tr data-id="${b.id}"><td>${b.name}</td><td>${money(+b.amount)}</td><td>${b.dueDay}</td><td class="row"><button data-edit="${b.id}" class="button">Edit</button><button data-del="${b.id}" class="button">Delete</button></td></tr>`).join('');
  const s=section('Shit That Must Get Paid',`
    <div class="grid cols-3"><div><input id="n" placeholder="Name"></div><div><input id="a" type="number" step="0.01" placeholder="Amount"></div><div><input id="d" type="number" min="1" max="31" placeholder="Due day"></div></div>
    <div class="grid cols-3" style="margin-top:8px"><button id="add" class="button primary">Add</button></div>
    <div class="table-scroll" style="margin-top:8px"><table><thead><tr><th>Name</th><th>Amount</th><th>Due</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="help">No bills yet.</td></tr>'}</tbody></table></div>`);
  app.appendChild(s);
  s.querySelector('#add').onclick=()=>{const n=s.querySelector('#n').value.trim(),a=+s.querySelector('#a').value||0,d=+s.querySelector('#d').value||0;if(!n||!a||d<1||d>31){alert('Name, amount, due day 1–31');return;}state.bills.push({id:Date.now()+Math.random(),name:n,amount:a,dueDay:d});save();render();};
  s.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{state.bills=state.bills.filter(x=>x.id!=b.dataset.del);save();render();});
  s.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const id=b.dataset.edit;const r=state.bills.find(x=>x.id==id);const n=prompt('Name',r.name)||r.name;const a=+prompt('Amount',r.amount)||r.amount;const d=+prompt('Due day',r.dueDay)||r.dueDay;Object.assign(r,{name:n,amount:a,dueDay:d});save();render();});
}

// ---------- EVENTS (one-time / overdue) ----------
function renderEvents(){
  const rows=(state.events||[]).sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<tr data-id="${e.id}"><td>${e.date}</td><td>${e.name}</td><td>${money(+e.amount)}</td><td class="row"><button data-edit="${e.id}" class="button">Edit</button><button data-del="${e.id}" class="button">Delete</button></td></tr>`).join('');
  const today=iso(new Date());
  const s=section('Catch-Up Shit (one-time / overdue)',`
    <div class="grid cols-3"><div><input id="n" placeholder="What for?"></div><div><input id="a" type="number" step="0.01" placeholder="Amount"></div><div><input id="dt" type="date" value="${today}"></div></div>
    <div class="grid cols-3" style="margin-top:8px"><button id="add" class="button primary">Add</button></div>
    <div class="table-scroll" style="margin-top:8px"><table><thead><tr><th>Date</th><th>Name</th><th>Amount</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="help">Nothing added.</td></tr>'}</tbody></table></div>`);
  app.appendChild(s);
  s.querySelector('#add').onclick=()=>{const n=s.querySelector('#n').value.trim(),a=+s.querySelector('#a').value||0,d=s.querySelector('#dt').value;if(!n||!a||!d){alert('Name, amount, date');return;}state.events.push({id:Date.now()+Math.random(),name:n,amount:a,date:d,type:'discretionary'});save();render();};
  s.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{state.events=state.events.filter(x=>x.id!=b.dataset.del);save();render();});
  s.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const id=b.dataset.edit;const r=state.events.find(x=>x.id==id);const n=prompt('Name',r.name)||r.name;const a=+prompt('Amount',r.amount)||r.amount;const d=prompt('Date (YYYY-MM-DD)',r.date)||r.date;Object.assign(r,{name:n,amount:a,date:d});save();render();});
}

// ---------- ENVELOPES (weekly buckets) ----------
function renderEnvelopes(){
  const rows=(state.envelopes||[]).map(e=>`<tr data-id="${e.id}"><td>${e.name}</td><td>${money(+e.weeklyTarget)}</td><td class="row"><button data-edit="${e.id}" class="button">Edit</button><button data-del="${e.id}" class="button">Delete</button></td></tr>`).join('');
  const s=section('Where It Goes (weekly buckets)',`
    <div class="grid cols-3"><div><input id="n" placeholder="Groceries, Gas, etc."></div><div><input id="t" type="number" step="0.01" placeholder="Weekly target"></div><div><button id="add" class="button primary">Add</button></div></div>
    <div class="table-scroll" style="margin-top:8px"><table><thead><tr><th>Name</th><th>Weekly $</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="3" class="help">No buckets yet.</td></tr>'}</tbody></table></div>`);
  app.appendChild(s);
  s.querySelector('#add').onclick=()=>{const n=s.querySelector('#n').value.trim(),t=+s.querySelector('#t').value||0;if(!n||!t){alert('Name + weekly $');return;}state.envelopes.push({id:Date.now()+Math.random(),name:n,weeklyTarget:t});save();render();};
  s.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{state.envelopes=state.envelopes.filter(x=>x.id!=b.dataset.del);save();render();});
  s.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const id=b.dataset.edit;const r=state.envelopes.find(x=>x.id==id);const n=prompt('Name',r.name)||r.name;const t=+prompt('Weekly target',r.weeklyTarget)||r.weeklyTarget;Object.assign(r,{name:n,weeklyTarget:t});save();render();});
}

// ---------- LOANS ----------
function renderLoans(){
  const rows=(state.loans||[]).sort((a,b)=>a.dueDay-b.dueDay||a.name.localeCompare(b.name)).map(l=>`<tr data-id="${l.id}"><td>${l.name}</td><td>${money(+l.minimumPayment)}</td><td>${l.dueDay}</td><td>${l.balance?money(+l.balance):'-'}</td><td class="row"><button data-edit="${l.id}" class="button">Edit</button><button data-del="${l.id}" class="button">Delete</button></td></tr>`).join('');
  const s=section('Your Damn Debts',`
    <div class="grid cols-3"><div><input id="n" placeholder="Name (Car, CC)"></div><div><input id="m" type="number" step="0.01" placeholder="Minimum"></div><div><input id="d" type="number" min="1" max="31" placeholder="Due day"></div><div><input id="b" type="number" step="0.01" placeholder="Balance (opt)"></div></div>
    <div class="grid cols-3" style="margin-top:8px"><button id="add" class="button primary">Add</button></div>
    <div class="table-scroll" style="margin-top:8px"><table><thead><tr><th>Name</th><th>Min</th><th>Due</th><th>Balance</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="help">No loans yet.</td></tr>'}</tbody></table></div>`);
  app.appendChild(s);
  s.querySelector('#add').onclick=()=>{const n=s.querySelector('#n').value.trim(),m=+s.querySelector('#m').value||0,d=+s.querySelector('#d').value||0,b=+s.querySelector('#b').value||undefined;if(!n||!m||d<1||d>31){alert('Name, minimum, due day 1–31');return;}state.loans.push({id:Date.now()+Math.random(),name:n,minimumPayment:m,dueDay:d,balance:b});save();render();};
  s.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{state.loans=state.loans.filter(x=>x.id!=b.dataset.del);save();render();});
  s.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const id=b.dataset.edit;const r=state.loans.find(x=>x.id==id);const n=prompt('Name',r.name)||r.name;const m=+prompt('Minimum',r.minimumPayment)||r.minimumPayment;const d=+prompt('Due day',r.dueDay)||r.dueDay;const bl=+(prompt('Balance',r.balance??'')||r.balance)||r.balance;Object.assign(r,{name:n,minimumPayment:m,dueDay:d,balance:bl});save();render();});
}

// ---------- DONATE ----------
function renderDonate(){
  app.appendChild(section('Donate (optional)',`
    <div class="grid cols-2"><a class="button" href="https://paypal.me/mdsdoc" target="_blank" rel="noopener">PayPal</a>
    <a class="button" href="https://cash.app/$mdsdoc" target="_blank" rel="noopener">Cash App</a></div>
    <div class="help" style="margin-top:6px">Donations never unlock features and aren’t required.</div>`));
}

// ---------- SETTINGS ----------
function renderSettings(){
  const s=section('Settings',`
    <div class="grid cols-3">
      <div><label>Bank balance</label><input id="bal" type="number" step="0.01" value="${state.bank.currentBalance}"></div>
      <div><label>Weekly FAF</label><input id="faf" type="number" step="0.01" value="${state.user.faFundsPerWeek}"></div>
      <div><label>Payday weekday</label><select id="day">${DOW.map((d,i)=>`<option value="${i}" ${i===(state.user.paydayWeekday??5)?'selected':''}>${d}</option>`).join('')}</select></div>
    </div>
    <div class="grid cols-3" style="margin-top:8px"><button id="save" class="button primary">Save</button></div>`);
  app.appendChild(s);
  s.querySelector('#save').onclick=()=>{state.bank.currentBalance=+s.querySelector('#bal').value||0;state.user.faFundsPerWeek=+s.querySelector('#faf').value||0;state.user.paydayWeekday=+s.querySelector('#day').value||5;save();alert('Saved.');};
}

// ---------- ROUTER ----------
function render(){ app.innerHTML=''; const v=document.querySelector('nav .tab.active')?.dataset.view||'home';
  if(v==='home')renderHome(); else if(v==='planner')renderPlanner(); else if(v==='timesheet')renderTimesheet();
  else if(v==='bills')renderBills(); else if(v==='events')renderEvents(); else if(v==='envelopes')renderEnvelopes();
  else if(v==='loans')renderLoans(); else if(v==='donate')renderDonate(); else if(v==='settings')renderSettings(); }
render();
TABS.addEventListener('click',e=>{const b=e.target.closest('.tab'); if(!b)return; document.querySelectorAll('nav .tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); render();});

// First-run wizard
if(!state.ui.onboarded && wizard){ import('./wizard.js?v=15').then(m=>m.showWizard(state,save,render)).catch(e=>console.error('wizard',e)); }