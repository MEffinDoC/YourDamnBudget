// Your Damn Budget v13a — Wizard bills/loans allow multiple, show list, and can be skipped

import { load } from './storage.js';
import { project, computeWeekPay, iso } from './engine.js';
import { triggerInstall } from './install.js';

let state = load() || {};
const app = document.getElementById('app');
const wizard = document.getElementById('wizard');
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function storageKey(){ const repo=(location.pathname.split('/')[1]||'root').toLowerCase(); return `ydb:${repo}:v3`; }
function save(){ localStorage.setItem(storageKey(), JSON.stringify(state)); }
const money = n => (n<0?'-':'') + '$' + Math.abs(Number(n||0)).toFixed(2);
const todayISO = () => iso(new Date());
function section(title, bodyHtml=''){ const s=document.createElement('section'); s.className='card'; s.innerHTML=(title?`<h2>${title}</h2>`:'')+bodyHtml; return s; }
function lastPaydayFrom(d,weekday=5){ const x=new Date(d); const diff=(x.getDay()-weekday+7)%7; x.setDate(x.getDate()-diff); x.setHours(0,0,0,0); return x; }
function nextPaydayFrom(d,weekday=5){ const x=new Date(d); const diff=(weekday-x.getDay()+7)%7; x.setDate(x.getDate()+diff+(diff===0?7:0)); x.setHours(0,0,0,0); return x; }

/* ---------- Shared ---------- */
function getUpcomingThisPayPeriod(){
  const start = lastPaydayFrom(new Date(), state.user?.paydayWeekday ?? 5);
  const end   = nextPaydayFrom(new Date(), state.user?.paydayWeekday ?? 5);
  const items = [];
  for(const b of state.bills||[]){
    for(let m=0;m<2;m++){
      const due=new Date(start.getFullYear(), start.getMonth()+m, b.dueDay);
      if(due>=start && due<end) items.push({kind:'bill', id:b.id, name:b.name, date: iso(due), amount:+b.amount||0});
    }
  }
  for(const l of state.loans||[]){
    for(let m=0;m<2;m++){
      const due=new Date(start.getFullYear(), start.getMonth()+m, l.dueDay);
      if(due>=start && due<end) items.push({kind:'loan', id:l.id, name:l.name, date: iso(due), amount:+l.minimumPayment||0});
    }
  }
  for(const e of state.events||[]){
    const d=new Date(e.date);
    if(d>=start && d<end && e.type==='discretionary'){
      items.push({kind:'event', id:e.id, name:e.name||'One-time', date: iso(d), amount:+e.amount||0});
    }
  }
  const paid = new Set((state.paid||[]).map(p=>`${p.kind}:${p.id}:${p.dateISO}`));
  return items.sort((a,b)=> new Date(a.date)-new Date(b.date) || a.name.localeCompare(b.name))
              .filter(it => !paid.has(`${it.kind}:${it.id}:${it.date}`));
}
function markPaid(kind,id,dateISO){ state.paid=state.paid||[]; state.paid.push({kind,id,dateISO}); save(); }

/* ---------- Views ---------- */
function renderHome(){
  const u = state.user || (state.user = { paydayWeekday: 5, faFundsPerWeek: 50 });
  const bank = state.bank || (state.bank = { currentBalance: 0 }); save();

  let weeks=[]; try{ weeks = project(state)||[]; }catch{ weeks=[]; }
  const w0 = weeks[0] || { income:0, start: todayISO() };

  const start = lastPaydayFrom(new Date(), u.paydayWeekday);
  const end   = nextPaydayFrom(new Date(), u.paydayWeekday);
  const variables = (state.envelopes||[]).reduce((s,e)=>s+Number(e.weeklyTarget||0),0);
  const faf = Number(u.faFundsPerWeek||0);
  const bankBal = Number(bank.currentBalance||0);
  const incomeThisWeek = Number(w0.income||0);

  const paidAmt = (state.paid||[]).filter(p => p.dateISO>=iso(start) && p.dateISO<iso(end))
    .reduce((s,p)=>{
      if(p.kind==='bill'){ const b=state.bills?.find(x=>x.id===p.id); return s + (b?+b.amount:0); }
      if(p.kind==='loan'){ const l=state.loans?.find(x=>x.id===p.id); return s + (l?+l.minimumPayment:0); }
      if(p.kind==='event'){ const e=state.events?.find(x=>x.id===p.id); return s + (e?+e.amount:0); }
      return s;
    },0);

  const starting = bankBal + incomeThisWeek;
  const liveBalance = starting - paidAmt - variables - faf;

  const daysLeft = Math.max(1, Math.round((nextPaydayFrom(new Date(), u.paydayWeekday) - new Date())/(1000*60*60*24)));
  const funLines = [
    `${daysLeft} days till your next beer fund 🍺`,
    `${daysLeft} late-night pizza runs till payday 🍕`,
    `${daysLeft} more ramen lunches till freedom 🍜`
  ];
  const party = funLines[Math.floor(Math.random()*funLines.length)];

  const s = section('Weekly Damage Report', `
    <div class="grid cols-3" style="margin-top:6px">
      <div>
        <div class="kpi-label">Cash This Week</div>
        <div class="kpi-value">${money(starting)}</div>
        <div class="help">${party}</div>
      </div>
      <div>
        <div class="kpi-label">Fuck Around Funds</div>
        <div class="kpi-value">${money(faf)}</div>
        <div class="help">Edit in Settings</div>
      </div>
      <div>
        <div class="kpi-label">After Damage</div>
        <div class="kpi-value ${liveBalance<0?'negative':'positive'}">${money(liveBalance)}</div>
      </div>
    </div>

    <h3 style="margin-top:10px">Reality Check — Can I afford this?</h3>
    <div class="grid cols-3" style="margin-top:6px">
      <div><label>Amount</label><input id="rc_amt" type="number" step="0.01" placeholder="0.00"></div>
      <div><label>When</label>
        <select id="rc_when">
          <option value="today">Today</option>
          <option value="beforePayday">Before Payday</option>
          <option value="pick">Pick a date…</option>
        </select>
      </div>
      <div id="rc_date_wrap" style="display:none"><label>Date</label><input id="rc_date" type="date" value="${todayISO()}"></div>
      <div><label>Pay from</label>
        <select id="rc_source">
          <option value="faf">Fuck Around Funds</option>
          <option value="buckets">Weekly Buckets</option>
          <option value="bank">Bank</option>
        </select>
      </div>
      <div class="row"><button class="primary" id="rc_go">Can I afford this?</button></div>
      <div class="row" style="gap:6px">
        <button class="button ghost rc_quick" data-v="20">$20</button>
        <button class="button ghost rc_quick" data-v="40">$40</button>
        <button class="button ghost rc_quick" data-v="60">$60</button>
      </div>
    </div>
    <div id="rc_result" class="help" style="margin-top:6px"></div>

    <h3 style="margin-top:12px">Bills Due This Week</h3>
  `);
  app.appendChild(s);

  const whenSel = s.querySelector('#rc_when');
  const wrapDate = s.querySelector('#rc_date_wrap');
  whenSel.onchange = () => { wrapDate.style.display = whenSel.value==='pick' ? '' : 'none'; };
  s.querySelectorAll('.rc_quick').forEach(b=>{ b.onclick = ()=>{ s.querySelector('#rc_amt').value = b.dataset.v; }; });
  s.querySelector('#rc_go').onclick = ()=>{
    const amt = Number(s.querySelector('#rc_amt').value||0);
    const source = s.querySelector('#rc_source').value;
    let byDate = new Date();
    if(whenSel.value==='beforePayday'){ byDate = new Date(nextPaydayFrom(new Date(), state.user?.paydayWeekday ?? 5)); byDate.setDate(byDate.getDate()-1); }
    if(whenSel.value==='pick'){ byDate = new Date(s.querySelector('#rc_date').value||todayISO()); }
    const verdict = affordCheck(amt, source, byDate);
    s.querySelector('#rc_result').innerHTML = verdict.html;
  };

  const upcoming = getUpcomingThisPayPeriod();
  const tbl = document.createElement('div');
  tbl.className='table-scroll'; tbl.style.marginTop='6px';
  tbl.innerHTML = upcoming.length===0 ? '<div class="help">Nothing due before next payday 🎉</div>' : `
    <table>
      <thead><tr><th>Due</th><th>Item</th><th>Amount</th><th>Paid?</th></tr></thead>
      <tbody>
        ${upcoming.map(it=>`
          <tr data-row="${it.kind}:${it.id}:${it.date}">
            <td>${it.date}</td>
            <td>${it.kind.toUpperCase()}: ${it.name||''}</td>
            <td>${money(it.amount)}</td>
            <td><button class="primary" data-pay="${it.kind}:${it.id}:${it.date}">Pay</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  s.appendChild(tbl);
  s.querySelectorAll('[data-pay]').forEach(btn=>{
    btn.onclick = ()=>{
      const [k,id,date] = btn.dataset.pay.split(':');
      markPaid(k, Number(id), date);
      const tr = s.querySelector(`tr[data-row="${btn.dataset.pay}"]`);
      if(tr){ tr.style.opacity='0'; setTimeout(()=>{ tr.remove(); render(); }, 180); }
    };
  });
}

function affordCheck(amount, source, byDate){
  const start = lastPaydayFrom(new Date(), state.user?.paydayWeekday ?? 5);
  const end   = nextPaydayFrom(new Date(), state.user?.paydayWeekday ?? 5);
  const inWindow = (d)=> d>=start && d<=end;

  const due = [];
  for(const b of state.bills||[]){
    const d1 = new Date(start.getFullYear(), start.getMonth(), b.dueDay);
    const d2 = new Date(start.getFullYear(), start.getMonth()+1, b.dueDay);
    [d1,d2].forEach(d=>{ if(inWindow(d) && d<=byDate) due.push(+b.amount||0); });
  }
  for(const l of state.loans||[]){
    const d1 = new Date(start.getFullYear(), start.getMonth(), l.dueDay);
    const d2 = new Date(start.getFullYear(), start.getMonth()+1, l.dueDay);
    [d1,d2].forEach(d=>{ if(inWindow(d) && d<=byDate) due.push(+l.minimumPayment||0); });
  }
  for(const e of state.events||[]){
    const d=new Date(e.date);
    if(inWindow(d) && d<=byDate && e.type==='discretionary') due.push(+e.amount||0);
  }
  const dueBefore = due.reduce((s,n)=>s+n,0);

  const bank = Number(state.bank?.currentBalance||0);
  let weeks=[]; try{ weeks = project(state)||[]; }catch{ weeks=[]; }
  const incomeThisWeek = Number((weeks[0]?.income)||0);
  const variables = (state.envelopes||[]).reduce((s,e)=>s+Number(e.weeklyTarget||0),0);
  const faf = Number(state.user?.faFundsPerWeek||0);

  const starting = bank + incomeThisWeek;
  const afterPeriod = (starting - dueBefore) - amount;

  let tone = '';
  if(afterPeriod < 0) tone = `Nope. You definitely fucked around and found out 👀`;
  else if(afterPeriod < 25) tone = `Technically yes, but you're about to fuck around and find out 😬`;
  else tone = `Yep. You're good — this won’t wreck the week 🎉`;

  const hours = suggestHoursNeeded(afterPeriod);
  return { html: `
    <div><strong>${tone}</strong></div>
    <div>After Damage by that date: ${money(afterPeriod)}</div>
    ${hours ? `<div class="help">~${hours} hrs overtime would make it painless</div>` : ``}
  `};
}
function suggestHoursNeeded(afterPeriod){
  if(afterPeriod >= 0) return 0;
  const base = Number(state.payRules?.baseHourly||20);
  const netPerHour = base * (1 - Number(state.payRules?.withholdingRatio??0.2));
  return Math.max(1, Math.ceil(Math.abs(afterPeriod) / Math.max(1,netPerHour)));
}

/* ---- Other views omitted for brevity (same as v13) ---- */
function renderPlanner(){ let weeks=[]; try{ weeks=project(state)||[]; }catch{}; const wrap=section('Crystal Ball — 12-week', `
<div class="table-scroll" style="margin-top:6px">
<table><thead><tr><th>Week Of</th><th>Income</th><th>Must Pay</th><th>Variables</th><th>FAF</th><th>Left</th></tr></thead>
<tbody>${weeks.map(w=>`<tr><td>${w.start}</td><td>${money(w.income)}</td><td>${money(w.mustPays)}</td><td>${money(w.variables)}</td><td>${money(Number(state.user?.faFundsPerWeek||0))}</td><td>${money(w.left)}</td></tr>`).join('')}</tbody></table>
</div>`); app.appendChild(wrap); }

function renderTimesheet(){
  const u = state.payRules || (state.payRules = { baseHourly: 20, withholdingRatio: 0.2 });
  const hours = state.hours || (state.hours = { regular: 40, ot15: 0, ot2: 0 });
  (state.user = state.user || {}).paydayWeekday = state.user.paydayWeekday ?? 5; save();

  let pay={gross:0,net:0}; try{ pay = computeWeekPay(u, hours) || pay; }catch{}

  const s = section('Hours — Paycheck', `
    <div class="grid cols-3">
      <div><label>Base hourly</label><input id="p_base" type="number" step="0.01" value="${u.baseHourly}"></div>
      <div><label>Withholding (0–1)</label><input id="p_tax" type="number" step="0.01" value="${u.withholdingRatio}"></div>
      <div><label>Payday (weekday)</label>
        <select id="p_weekday">
          ${DOW.map((d,i)=>`<option value="${i}" ${i===(state.user?.paydayWeekday??5)?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>

    <h3 style="margin-top:10px">Estimate withholding from a real check</h3>
    <div class="grid cols-3">
      <div><label>Example Gross</label><input id="ex_gross" type="number" step="0.01" placeholder="e.g. 1200.00"></div>
      <div><label>Example Net</label><input id="ex_net" type="number" step="0.01" placeholder="e.g. 930.00"></div>
      <div class="row"><button class="primary" id="applyRatio">Apply</button></div>
    </div>

    <h3 style="margin-top:10px">Hours this week</h3>
    <div class="grid cols-3">
      <div><label>Regular</label><input id="h_r" type="number" step="0.25" value="${hours.regular}"></div>
      <div><label>OT ×1.5</label><input id="h_15" type="number" step="0.25" value="${hours.ot15}"></div>
      <div><label>OT ×2.0</label><input id="h_2" type="number" step="0.25" value="${hours.ot2}"></div>
    </div>

    <div class="grid cols-3" style="margin-top:8px">
      <div><div class="kpi-label">Gross</div><div class="kpi-value">${money(pay.gross)}</div></div>
      <div><div class="kpi-label">Net</div><div class="kpi-value">${money(pay.net)}</div></div>
      <div><div class="kpi-label">This week income</div><div class="kpi-value">${money(pay.net)}</div></div>
    </div>

    <div class="actions" style="margin-top:10px"><button class="primary" id="savePay">Save</button></div>
  `);
  app.appendChild(s);

  s.querySelector('#applyRatio').onclick = ()=>{
    const g = Number(s.querySelector('#ex_gross').value||0);
    const n = Number(s.querySelector('#ex_net').value||0);
    if(g<=0 || n<=0 || n>g){ alert('Use a real paycheck: net must be less than gross.'); return; }
    const ratio = Math.max(0, Math.min(0.6, 1 - (n/g)));
    state.payRules.withholdingRatio = Number(ratio.toFixed(3));
    save(); render();
  };

  s.querySelector('#savePay').onclick = ()=>{
    state.payRules.baseHourly = Number(s.querySelector('#p_base').value||0);
    state.payRules.withholdingRatio = Number(s.querySelector('#p_tax').value||0);
    (state.user = state.user || {}).paydayWeekday = Number(s.querySelector('#p_weekday').value||5);
    state.hours.regular = Number(s.querySelector('#h_r').value||0);
    state.hours.ot15 = Number(s.querySelector('#h_15').value||0);
    state.hours.ot2 = Number(s.querySelector('#h_2').value||0);
    save(); render();
  };
}

function renderBills(){
  state.bills = state.bills || []; save();
  const s = section('Shit That Must Get Paid — Bills', `
    <div class="grid cols-3">
      <div><label>Name</label><input id="b_name" placeholder="Rent, Electric"></div>
      <div><label>Amount</label><input id="b_amt" type="number" step="0.01"></div>
      <div><label>Due day</label><input id="b_day" type="number" min="1" max="31" placeholder="1–31"></div>
    </div>
    <div class="actions"><button class="primary" id="b_add">Add bill</button></div>

    <div class="table-scroll" style="margin-top:8px">
      <table><thead><tr><th>Name</th><th>Amount</th><th>Due</th><th></th></tr></thead>
      <tbody id="b_rows">
        ${state.bills.map(b=>`<tr data-id="${b.id}"><td>${b.name}</td><td>${money(b.amount)}</td><td>${b.dueDay}</td><td><button data-del="${b.id}">Delete</button></td></tr>`).join('')}
      </tbody></table>
    </div>
  `);
  app.appendChild(s);

  s.querySelector('#b_add').onclick = ()=>{
    const name = s.querySelector('#b_name').value.trim();
    const amount = Number(s.querySelector('#b_amt').value||0);
    const dueDay = Number(s.querySelector('#b_day').value||1);
    if(!name) return;
    state.bills.push({ id: Date.now()+Math.random(), name, amount, dueDay });
    save(); render();
  };
  s.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick = ()=>{ state.bills = state.bills.filter(b=>b.id!=btn.dataset.del); save(); render(); };
  });
}

function renderEvents(){
  state.events = state.events || []; save();
  const s = section('Catch-Up Shit — One-time & Overdue', `
    <div class="grid cols-3">
      <div><label>Name</label><input id="e_name" placeholder="Last month electric"></div>
      <div><label>Amount</label><input id="e_amt" type="number" step="0.01"></div>
      <div><label>Date</label><input id="e_date" type="date" value="${todayISO()}"></div>
    </div>
    <div class="actions"><button class="primary" id="e_add">Add</button></div>

    <div class="table-scroll" style="margin-top:8px">
      <table><thead><tr><th>Date</th><th>Name</th><th>Amount</th><th></th></tr></thead>
      <tbody id="e_rows">
        ${state.events.map(e=>`<tr data-id="${e.id}"><td>${e.date}</td><td>${e.name||''}</td><td>${money(e.amount)}</td><td><button data-del="${e.id}">Delete</button></td></tr>`).join('')}
      </tbody></table>
    </div>
  `);
  app.appendChild(s);

  s.querySelector('#e_add').onclick = ()=>{
    const name = s.querySelector('#e_name').value.trim();
    const amount = Number(s.querySelector('#e_amt').value||0);
    const date = s.querySelector('#e_date').value || todayISO();
    state.events.push({ id: Date.now()+Math.random(), name, amount, date, type: 'discretionary' });
    save(); render();
  };
  s.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick = ()=>{ state.events = state.events.filter(e=>e.id!=btn.dataset.del); save(); render(); };
  });
}

function renderEnvelopes(){
  state.envelopes = state.envelopes || []; save();
  const s = section('Where It Goes — Weekly Buckets', `
    <div class="grid cols-3">
      <div><label>Name</label><input id="v_name" placeholder="Food, Gas, Fun"></div>
      <div><label>Weekly $</label><input id="v_amt" type="number" step="0.01"></div>
      <div class="row"><button class="primary" id="v_add">Add</button></div>
    </div>

    <div class="table-scroll" style="margin-top:8px">
      <table><thead><tr><th>Name</th><th>Weekly Target</th><th></th></tr></thead>
      <tbody id="v_rows">
        ${state.envelopes.map(e=>`<tr data-id="${e.id}"><td>${e.name}</td><td>${money(e.weeklyTarget)}</td><td><button data-del="${e.id}">Delete</button></td></tr>`).join('')}
      </tbody></table>
    </div>
  `);
  app.appendChild(s);

  s.querySelector('#v_add').onclick = ()=>{
    const name = s.querySelector('#v_name').value.trim();
    const weeklyTarget = Number(s.querySelector('#v_amt').value||0);
    if(!name) return;
    state.envelopes.push({ id: Date.now()+Math.random(), name, weeklyTarget });
    save(); render();
  };
  s.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick = ()=>{ state.envelopes = state.envelopes.filter(e=>e.id!=btn.dataset.del); save(); render(); };
  });
}

function renderLoans(){
  state.loans = state.loans || []; save();
  const s = section('Your Damn Debts — Loans & IOUs', `
    <div class="grid cols-3">
      <div><label>Name</label><input id="l_name" placeholder="Car, CC, Student"></div>
      <div><label>Minimum $</label><input id="l_min" type="number" step="0.01"></div>
      <div><label>Due day</label><input id="l_day" type="number" min="1" max="31"></div>
      <div><label>Balance (opt)</label><input id="l_bal" type="number" step="0.01"></div>
    </div>
    <div class="actions"><button class="primary" id="l_add">Add loan</button></div>

    <div class="table-scroll" style="margin-top:8px">
      <table><thead><tr><th>Name</th><th>Min</th><th>Due</th><th>Balance</th><th></th></tr></thead>
      <tbody id="l_rows">
        ${state.loans.map(l=>`<tr data-id="${l.id}"><td>${l.name}</td><td>${money(l.minimumPayment)}</td><td>${l.dueDay}</td><td>${l.balance?money(l.balance):'-'}</td><td><button data-del="${l.id}">Delete</button></td></tr>`).join('')}
      </tbody></table>
    </div>
  `);
  app.appendChild(s);

  s.querySelector('#l_add').onclick = ()=>{
    const name = s.querySelector('#l_name').value.trim();
    const minimumPayment = Number(s.querySelector('#l_min').value||0);
    const dueDay = Number(s.querySelector('#l_day').value||1);
    const balance = Number(s.querySelector('#l_bal').value||0) || undefined;
    if(!name || !minimumPayment || !(dueDay>=1 && dueDay<=31)) return;
    state.loans.push({ id: Date.now()+Math.random(), name, minimumPayment, dueDay, balance });
    save(); render();
  };
  s.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick = ()=>{ state.loans = state.loans.filter(l=>l.id!=btn.dataset.del); save(); render(); };
  });
}

/* ---------- Donate ---------- */
function renderDonate(){
  const s = section('Donate (Optional)', `
    <div class="help">Donations are optional and don’t change features or remove ads. They just help keep Your Damn Budget free for everyone.</div>
    <div class="grid cols-2" style="margin-top:8px">
      <a class="button primary" href="https://paypal.me/mdsdoc" target="_blank" rel="noopener">PayPal @mdsdoc</a>
      <a class="button primary" href="https://cash.app/$mdsdoc" target="_blank" rel="noopener">Cash App $mdsdoc</a>
    </div>
    <div class="help" style="margin-top:8px">This is a voluntary tip. It doesn’t grant ad-free or extra features.</div>
  `);
  app.appendChild(s);
}

/* ---------- Settings ---------- */
function renderSettings(){
  const u = state.user || (state.user = { paydayWeekday: 5, faFundsPerWeek: 50 });
  const bank = state.bank || (state.bank = { currentBalance: 0 });
  state.ui = state.ui || { lang:'en', tone:'spicy', onboarded:false }; save();

  const s = section('Settings', `
    <div class="grid cols-3">
      <div><label>Language</label>
        <select id="s_lang">
          <option value="en" ${(state.ui.lang||'en')==='en'?'selected':''}>English</option>
          <option value="es" ${(state.ui.lang||'en')==='es'?'selected':''}>Español</option>
        </select>
      </div>
      <div><label>Tone</label>
        <select id="s_tone">
          <option value="spicy" ${(state.ui.tone||'spicy')==='spicy'?'selected':''}>Spicy</option>
          <option value="clean" ${(state.ui.tone||'spicy')==='clean'?'selected':''}>Clean</option>
        </select>
      </div>
      <div><label>Bank Balance</label><input id="s_bank" type="number" step="0.01" value="${bank.currentBalance}"></div>
      <div><label>Payday weekday</label>
        <select id="s_weekday">${DOW.map((d,i)=>`<option value="${i}" ${i===u.paydayWeekday?'selected':''}>${d}</option>`).join('')}</select>
      </div>
      <div><label>Fuck Around Funds (per week)</label><input id="s_faf" type="number" step="0.01" value="${u.faFundsPerWeek}"></div>
      <div><label>Install App</label><button id="installBtn" class="button primary">Install</button></div>
    </div>

    <div class="actions" style="margin-top:10px">
      <button class="primary" id="s_save">Save</button>
      <button class="button ghost" id="s_export">Export backup</button>
      <label class="button ghost" style="padding:8px 10px;display:inline-block;cursor:pointer">
        Import backup<input id="s_import" type="file" accept="application/json" style="display:none">
      </label>
    </div>
  `);
  app.appendChild(s);

  s.querySelector('#s_save').onclick = ()=>{
    state.bank.currentBalance = Number(s.querySelector('#s_bank').value||0);
    state.user.paydayWeekday = Number(s.querySelector('#s_weekday').value||5);
    state.user.faFundsPerWeek = Number(s.querySelector('#s_faf').value||0);
    state.ui.lang = s.querySelector('#s_lang').value;
    state.ui.tone = s.querySelector('#s_tone').value;
    save(); render();
  };
  s.querySelector('#s_export').onclick = ()=>{
    const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `ydb-backup-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  s.querySelector('#s_import').onchange = (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{ try{ state = JSON.parse(String(r.result)); save(); render(); }catch(err){ alert('Bad file'); } };
    r.readAsText(f);
  };
  s.querySelector('#installBtn').onclick = async ()=>{ await triggerInstall(); };
}

/* ---------- In-place Wizard (updated bills/loans) ---------- */
function showWizard(){
  state.user = state.user || { paydayWeekday: 5, faFundsPerWeek: 50 };
  state.bank = state.bank || { currentBalance: 0 };
  state.payRules = state.payRules || { baseHourly: 20, withholdingRatio: 0.2 };
  state.bills = state.bills || [];
  state.loans = state.loans || [];
  save();

  let step = 0;
  const steps = ['bank','pay','bill','loan','done'];

  function renderStep(){
    document.body.classList.add('noscroll');
    wizard.classList.remove('hidden');

    const progress = Math.min(100, Math.round((step/(steps.length-1))*100));
    let inner = `<div class="panel"><div class="progress"><div style="width:${progress}%"></div></div>`;

    if(steps[step]==='bank'){
      inner += `
        <h2>Start here — Bank Balance</h2>
        <div class="step-hint">What’s in your account right now?</div>
        <div class="grid cols-2">
          <div><label>Current balance</label><input id="w_bank" type="number" step="0.01" value="${state.bank.currentBalance}"></div>
          <div><label>Payday weekday</label>
            <select id="w_weekday">${DOW.map((d,i)=>`<option value="${i}" ${i===(state.user?.paydayWeekday??5)?'selected':''}>${d}</option>`).join('')}</select>
          </div>
        </div>
        <div class="actions"><button id="skip" class="button ghost">Skip</button><span class="spacer"></span><button id="next" class="button primary">Save & Next</button></div>
      `;
    }
    else if(steps[step]==='pay'){
      inner += `
        <h2>Your Paycheck</h2>
        <div class="step-hint">Set your base hourly and estimate withholding from one real check.</div>
        <div class="grid cols-3">
          <div><label>Base hourly</label><input id="w_base" type="number" step="0.01" value="${state.payRules.baseHourly}"></div>
          <div><label>Withholding (0–1)</label><input id="w_tax" type="number" step="0.01" value="${state.payRules.withholdingRatio}"></div>
          <div><label>Fuck Around Funds (weekly)</label><input id="w_faf" type="number" step="0.01" value="${state.user.faFundsPerWeek}"></div>
        </div>
        <div class="grid cols-3">
          <div><label>Example Gross</label><input id="w_gross" type="number" step="0.01" placeholder="e.g. 1200.00"></div>
          <div><label>Example Net</label><input id="w_net" type="number" step="0.01" placeholder="e.g. 930.00"></div>
          <div class="row"><button id="w_apply" class="button ghost">Estimate</button></div>
        </div>
        <div class="actions"><button id="back" class="button ghost">Back</button><span class="spacer"></span><button id="next" class="button primary">Save & Next</button></div>
      `;
    }
    else if(steps[step]==='bill'){
      const rows = state.bills.map(b=>`<tr data-id="${b.id}"><td>${b.name}</td><td>${money(b.amount)}</td><td>${b.dueDay}</td><td><button data-del="${b.id}" class="button ghost">Remove</button></td></tr>`).join('');
      inner += `
        <h2>The Shit You Can’t Skip</h2>
        <div class="step-hint">Add as many bills as you remember. You can always add more later.</div>

        <div class="grid cols-3">
          <div><label>Name</label><input id="w_bname" placeholder="Rent, Electric"></div>
          <div><label>Amount</label><input id="w_bamt" type="number" step="0.01"></div>
          <div><label>Due day</label><input id="w_bday" type="number" min="1" max="31" placeholder="1–31"></div>
        </div>
        <div class="actions">
          <button id="back" class="button ghost">Back</button>
          <button id="add" class="button">Add bill</button>
          <span class="spacer"></span>
          <button id="skip" class="button ghost">Skip</button>
          <button id="next" class="button primary">Next</button>
        </div>

        <div class="table-scroll" style="margin-top:8px">
          <table>
            <thead><tr><th>Name</th><th>Amount</th><th>Due</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="4" class="help">No bills yet.</td></tr>`}</tbody>
          </table>
        </div>
      `;
    }
    else if(steps[step]==='loan'){
      const rows = state.loans.map(l=>`<tr data-id="${l.id}"><td>${l.name}</td><td>${money(l.minimumPayment)}</td><td>${l.dueDay}</td><td>${l.balance?money(l.balance):'-'}</td><td><button data-del="${l.id}" class="button ghost">Remove</button></td></tr>`).join('');
      inner += `
        <h2>Your Damn Debts</h2>
        <div class="step-hint">Add any loans/IOUs. Optional now; add more later.</div>

        <div class="grid cols-3">
          <div><label>Name</label><input id="w_lname" placeholder="Car, CC, Student"></div>
          <div><label>Minimum $</label><input id="w_lmin" type="number" step="0.01"></div>
          <div><label>Due day</label><input id="w_lday" type="number" min="1" max="31"></div>
          <div><label>Balance (opt)</label><input id="w_lbal" type="number" step="0.01"></div>
        </div>
        <div class="actions">
          <button id="back" class="button ghost">Back</button>
          <button id="add" class="button">Add loan</button>
          <span class="spacer"></span>
          <button id="skip" class="button ghost">Skip</button>
          <button id="next" class="button primary">Next</button>
        </div>

        <div class="table-scroll" style="margin-top:8px">
          <table>
            <thead><tr><th>Name</th><th>Min</th><th>Due</th><th>Balance</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5" class="help">No loans yet.</td></tr>`}</tbody>
          </table>
        </div>
      `;
    }
    else {
      inner += `
        <h2>All set 🎉</h2>
        <div class="step-hint">You can tweak anything in Settings or the tabs anytime.</div>
        <div class="actions"><span class="spacer"></span><button id="finish" class="button primary">Finish</button></div>
      `;
    }

    inner += `</div>`;
    wizard.innerHTML = inner;

    // Wire actions
    const $ = s => wizard.querySelector(s);

    if(steps[step]==='bank'){
      $('#next').onclick = ()=>{
        state.bank.currentBalance = Number($('#w_bank').value||0);
        (state.user = state.user || {}).paydayWeekday = Number($('#w_weekday').value||5);
        save(); step++; renderStep();
      };
      $('#skip').onclick = ()=>{ step++; renderStep(); };
    }
    else if(steps[step]==='pay'){
      $('#w_apply').onclick = ()=>{
        const g = Number($('#w_gross').value||0), n = Number($('#w_net').value||0);
        if(g>0 && n>0 && n<g){
          const ratio = Math.max(0, Math.min(0.6, 1-(n/g)));
          $('#w_tax').value = String(ratio.toFixed(3));
          alert(`Estimated withholding: ${(ratio*100).toFixed(1)}%`);
        } else {
          alert('Use a real paycheck: net must be less than gross.');
        }
      };
      $('#back').onclick = ()=>{ step--; renderStep(); };
      $('#next').onclick = ()=>{
        state.payRules.baseHourly = Number($('#w_base').value||0);
        state.payRules.withholdingRatio = Number($('#w_tax').value||0);
        (state.user = state.user || {}).faFundsPerWeek = Number($('#w_faf').value||0);
        save(); step++; renderStep();
      };
    }
    else if(steps[step]==='bill'){
      $('#add').onclick = ()=>{
        const name = ($('#w_bname').value||'').trim();
        const amount = Number($('#w_bamt').value||0);
        const day = Number($('#w_bday').value||0);
        if(!name || !amount || !(day>=1 && day<=31)){
          alert('Add a name, amount, and due day (1–31).'); return;
        }
        state.bills.push({ id: Date.now()+Math.random(), name, amount, dueDay: day });
        save(); renderStep(); // re-render to show in list and clear inputs
      };
      $('#back').onclick = ()=>{ step--; renderStep(); };
      $('#skip').onclick = ()=>{ step++; renderStep(); };
      $('#next').onclick = ()=>{ step++; renderStep(); };
      wizard.querySelectorAll('[data-del]').forEach(btn=>{
        btn.onclick = ()=>{ state.bills = state.bills.filter(b=>b.id!=btn.dataset.del); save(); renderStep(); };
      });
    }
    else if(steps[step]==='loan'){
      $('#add').onclick = ()=>{
        const name = ($('#w_lname').value||'').trim();
        const min = Number($('#w_lmin').value||0);
        const day = Number($('#w_lday').value||0);
        const bal = Number($('#w_lbal').value||0) || undefined;
        if(!name || !min || !(day>=1 && day<=31)){
          alert('Add name, minimum, due day (1–31). Or Skip.'); return;
        }
        state.loans.push({ id: Date.now()+Math.random(), name, minimumPayment:min, dueDay:day, balance:bal });
        save(); renderStep();
      };
      $('#back').onclick = ()=>{ step--; renderStep(); };
      $('#skip').onclick = ()=>{ step++; renderStep(); };
      $('#next').onclick = ()=>{ step++; renderStep(); };
      wizard.querySelectorAll('[data-del]').forEach(btn=>{
        btn.onclick = ()=>{ state.loans = state.loans.filter(l=>l.id!=btn.dataset.del); save(); renderStep(); };
      });
    }
    else {
      $('#finish').onclick = ()=>{
        (state.ui = state.ui || {}).onboarded = true; save();
        wizard.classList.add('hidden'); document.body.classList.remove('noscroll');
        document.querySelectorAll('nav .tab').forEach(b=>b.classList.remove('active'));
        document.querySelector('nav .tab[data-view="home"]').classList.add('active');
        render();
      };
    }
  }

  renderStep();
}

/* ---------- Router ---------- */
function safe(fn){ try{ fn(); }catch(e){ console.error(e); app.appendChild(section('Oops', '<div class="help">We hit a snag.</div>')); } }
function render(){
  app.innerHTML='';
  const view = document.querySelector('nav .tab.active')?.dataset.view || 'home';
  if(view==='home')        safe(renderHome);
  if(view==='planner')     safe(renderPlanner);
  if(view==='timesheet')   safe(renderTimesheet);
  if(view==='bills')       safe(renderBills);
  if(view==='events')      safe(renderEvents);
  if(view==='envelopes')   safe(renderEnvelopes);
  if(view==='loans')       safe(renderLoans);
  if(view==='donate')      safe(renderDonate);
  if(view==='settings')    safe(renderSettings);
}
document.querySelectorAll('nav .tab').forEach(btn=>{
  btn.onclick=()=>{ document.querySelectorAll('nav .tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); render(); };
});

/* ---------- Boot ---------- */
(function boot(){
  render();
  if(!state.ui?.onboarded){ showWizard(); }
})();