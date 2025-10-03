import { load, save, makeBackup, getBackups, restoreBackup, deleteBackup, importFile } from './storage.js';
import { project, monthlyReality, computeWeekPay, iso } from './engine.js';

let state = load();
const app = document.getElementById('app');
const wizard = document.getElementById('wizard');

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const money = n => (n<0?'-':'') + '$' + Math.abs(Number(n||0)).toFixed(2);
const todayISO = () => iso(new Date());

// Payday helpers
function lastPaydayFrom(d, weekday=5){ const x=new Date(d); const diff=(x.getDay()-weekday+7)%7; x.setDate(x.getDate()-diff); x.setHours(0,0,0,0); return x; }
function nextPaydayFrom(d, weekday=5){ const x=new Date(d); const diff=(weekday-x.getDay()+7)%7; x.setDate(x.getDate()+diff+(diff===0?7:0)); x.setHours(0,0,0,0); return x; }

// Upcoming items within current pay period (unchecked)
function getUpcomingThisPayPeriod(){
  const start = lastPaydayFrom(new Date(), state.user.paydayWeekday);
  const end   = nextPaydayFrom(new Date(), state.user.paydayWeekday);
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
function markPaid(kind,id,dateISO){ state.paid=state.paid||[]; state.paid.push({kind,id,dateISO}); save(state); }

// Party countdown
function countdownLine(days){
  const pool = [
    `${days} days till your next beer fund 🍺`,
    `${days} late-night pizza runs till payday 🍕`,
    `${days} Netflix binges till you can fuck around again 📺`,
    `${days} more ramen lunches till freedom 🍜`,
    `One weekend bender away from money drop 🎉`
  ];
  return pool[Math.floor(Math.random()*pool.length)];
}

// Router
function navTo(view){
  document.querySelectorAll('nav .tab').forEach(b => b.classList.toggle('active', b.dataset.view===view));
  render();
}
function render(){
  const view = document.querySelector('nav .tab.active')?.dataset.view || 'home';
  app.innerHTML='';
  if(view==='home') renderHome();
  if(view==='planner') renderPlanner();
  if(view==='timesheet') renderTimesheet();
  if(view==='bills') renderBills();
  if(view==='events') renderEvents();
  if(view==='envelopes') renderEnvelopes();
  if(view==='loans') renderLoans();
  if(view==='settings') renderSettings();
}

// ---------- HOME (Weekly + Monthly + Reality Check) ----------
function renderHome(){
  const weeks = project(state);
  const w0 = weeks[0];
  const start = lastPaydayFrom(new Date(), state.user.paydayWeekday);
  const end   = nextPaydayFrom(new Date(), state.user.paydayWeekday);
  const upcoming = getUpcomingThisPayPeriod();

  // Weekly ledger pieces
  const bank = Number(state.bank?.currentBalance||0);
  const incomeThisWeek = w0.income;
  const paidAmt = (state.paid||[]).filter(p => p.dateISO>=iso(start) && p.dateISO<iso(end))
    .reduce((s,p)=>{
      if(p.kind==='bill'){ const b=state.bills.find(x=>x.id===p.id); return s + (b?+b.amount:0); }
      if(p.kind==='loan'){ const l=state.loans.find(x=>x.id===p.id); return s + (l?+l.minimumPayment:0); }
      if(p.kind==='event'){ const e=state.events.find(x=>x.id===p.id); return s + (e?+e.amount:0); }
      return s;
    },0);
  const variables = (state.envelopes||[]).reduce((s,e)=>s+Number(e.weeklyTarget||0),0);
  const faf = Number(state.user?.faFundsPerWeek||0);
  const starting = bank + incomeThisWeek;
  const liveBalance = starting - paidAmt - variables - faf;

  // Warnings
  let warn = '';
  if(liveBalance < 0) warn = `You definitely fucked around and found out 👀`;
  else if(liveBalance < 25) warn = `You're about to fuck around and find out 😬`;

  const daysLeft = Math.max(1, Math.round((nextPaydayFrom(new Date(), state.user.paydayWeekday) - new Date())/(1000*60*60*24)));
  const party = countdownLine(daysLeft);

  // Weekly card
  const weekCard = document.createElement('section');
  weekCard.className='card';
  weekCard.innerHTML = `
    <h2>Weekly Damage Report</h2>
    <div class="grid cols-3" style="margin-top:6px">
      <div>
        <div class="kpi-label">Cash This Week</div>
        <div class="kpi-value">${money(starting)}</div>
        <div class="help">${party}</div>
      </div>
      <div>
        <div class="kpi-label">Fuck Around Funds</div>
        <div class="progress" aria-label="FAF"><div style="width:100%"></div></div>
        <div class="help">FAF left: ${money(faf)} — Ambush costs hurt more when this hits zero.</div>
      </div>
      <div>
        <div class="kpi-label">After Damage</div>
        <div class="kpi-value ${liveBalance<0?'negative':'positive'}">${money(liveBalance)}</div>
        ${warn ? `<div class="help warn">⚠ ${warn}</div>` : ``}
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
        <button class="ghost rc_quick" data-v="20">$20</button>
        <button class="ghost rc_quick" data-v="40">$40</button>
        <button class="ghost rc_quick" data-v="60">$60</button>
      </div>
    </div>
    <div id="rc_result" class="help" style="margin-top:6px"></div>

    <h3 style="margin-top:12px">Bills Due This Week</h3>
    <div class="help">Pay period: ${iso(start)} → ${iso(end)} (Payday: ${DOW[state.user.paydayWeekday]}). One-time ambushes live in Catch-Up Shit.</div>
    ${upcoming.length===0 ? '<div class="help">Nothing due before next payday 🎉</div>' : `
      <div class="table-scroll" style="margin-top:6px">
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
        </table>
      </div>
    `}
  `;
  app.appendChild(weekCard);

  // Reality Check UI wiring
  const wrapDate = weekCard.querySelector('#rc_date_wrap');
  const whenSel = weekCard.querySelector('#rc_when');
  whenSel.onchange = () => { wrapDate.style.display = whenSel.value==='pick' ? '' : 'none'; };

  weekCard.querySelectorAll('.rc_quick').forEach(b=>{
    b.onclick = ()=>{ weekCard.querySelector('#rc_amt').value = b.dataset.v; };
  });

  weekCard.querySelector('#rc_go').onclick = ()=>{
    const amt = Number(weekCard.querySelector('#rc_amt').value||0);
    const source = weekCard.querySelector('#rc_source').value;
    let byDate = new Date();
    if(whenSel.value==='beforePayday'){ byDate = new Date(end); byDate.setDate(byDate.getDate()-1); }
    if(whenSel.value==='pick'){ byDate = new Date(weekCard.querySelector('#rc_date').value||todayISO()); }

    const verdict = affordCheck(amt, source, byDate);
    const out = weekCard.querySelector('#rc_result');
    out.innerHTML = verdict.html;
  };

  // Pay buttons (instant remove)
  weekCard.querySelectorAll('[data-pay]').forEach(btn=>{
    btn.onclick = ()=>{
      const [k,id,date] = btn.dataset.pay.split(':');
      markPaid(k, Number(id), date);
      const tr = weekCard.querySelector(`tr[data-row="${btn.dataset.pay}"]`);
      if(tr){ tr.style.opacity='0'; setTimeout(()=>{ tr.remove(); render(); }, 180); }
    };
  });

  // Monthly card
  const m = monthlyReality(state);
  const monthCard = document.createElement('section');
  monthCard.className='card';
  monthCard.innerHTML = `
    <h2>Monthly Reality Check</h2>
    <div class="help">Month’s outflow vs your income so far.</div>
    <div class="grid cols-3" style="margin-top:8px">
      <div>
        <div class="kpi-label">This month will cost</div>
        <div class="kpi-value">${money(m.monthNeed)}</div>
      </div>
      <div>
        <div class="kpi-label">Income so far</div>
        <div class="kpi-value">${money(m.earned)}</div>
      </div>
      <div>
        <div class="kpi-label">${m.shortfall>0?'Hours to cover it':'You’re covered'}</div>
        <div class="kpi-value ${m.shortfall>0?'negative':'positive'}">${m.shortfall>0? m.hoursNeeded+' hrs':'✔︎'}</div>
        ${m.shortfall>0? `<div class="help">~${m.perWeek} hrs/week for the rest of the month</div>`:''}
      </div>
    </div>
  `;
  app.appendChild(monthCard);

  if(!state.meta?.onboarded){ showWizard(); }
}

// Affordability logic (simple, on-brand)
function affordCheck(amount, source, byDate){
  const start = lastPaydayFrom(new Date(), state.user.paydayWeekday);
  const end   = nextPaydayFrom(new Date(), state.user.paydayWeekday);
  const inWindow = (d)=> d>=start && d<=end;

  // what’s due before chosen date
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

  // available cash lens
  const bank = Number(state.bank?.currentBalance||0);
  const incomeThisWeek = project(state)[0].income;
  const variables = (state.envelopes||[]).reduce((s,e)=>s+Number(e.weeklyTarget||0),0);
  const faf = Number(state.user?.faFundsPerWeek||0);

  const starting = bank + incomeThisWeek;
  const safety = 0; // could be a user setting later
  let lensLeft = 0;
  let lensName = '';

  if(source==='faf'){
    lensLeft = faf;
    lensName = 'Fuck Around Funds';
  } else if(source==='buckets'){
    lensLeft = Math.max(0, variables); // total weekly buckets; could be refined by category later
    lensName = 'Weekly Buckets';
  } else {
    // bank view = broad “spendable” this period
    const paidAmt = (state.paid||[]).filter(p => {
      const d = new Date(p.dateISO);
      return d>=start && d<=end;
    }).reduce((s,_p)=>s,0); // already accounted in live calc
    lensLeft = starting - dueBefore - safety;
    lensName = 'Bank';
  }

  const afterLens = lensLeft - amount;
  const afterPeriod = (starting - dueBefore - safety) - amount;

  let tone = '';
  if(afterPeriod < 0) tone = `Nope. You definitely fucked around and found out 👀`;
  else if(afterPeriod < 25) tone = `Technically yes, but you're about to fuck around and find out 😬`;
  else tone = `Yep. You're good — this won’t wreck the week 🎉`;

  const hours = suggestHoursNeeded(afterPeriod);

  return {
    html: `
      <div><strong>${tone}</strong></div>
      <div>From <em>${lensName}</em>: ${money(lensLeft)} → ${money(afterLens)}</div>
      <div>After Damage by that date: ${money(afterPeriod)}</div>
      ${hours ? `<div class="help">~${hours} hrs overtime would make it painless</div>` : ``}
    `
  };
}
function suggestHoursNeeded(afterPeriod){
  if(afterPeriod >= 0) return 0;
  const base = Number(state.payRules?.baseHourly||20);
  const netPerHour = base * (1 - Number(state.payRules?.withholdingRatio??0.2));
  return Math.max(1, Math.ceil(Math.abs(afterPeriod) / Math.max(1,netPerHour)));
}

// Other views (unchanged copy highlights)
function renderPlanner(){
  const weeks = project(state);
  const s = document.createElement('section'); s.className='card';
  s.innerHTML = `
    <h2>Crystal Ball</h2>
    <div class="help">12-week forecast. Trim FAF or weekly buckets if you’re consistently red.</div>
    <div class="table-scroll" style="margin-top:8px">
      <table>
        <thead><tr><th>Week</th><th>Income</th><th>Shit You Can’t Skip</th><th>Weekly Buckets</th><th>Fuck Around Funds</th><th>Left</th></tr></thead>
        <tbody>
          ${weeks.map((w,i)=>`
            <tr>
              <td>Week ${i+1}<span class="badge">${iso(w.weekStart)}</span></td>
              <td>${money(w.income)}</td>
              <td>${money(w.mustPays)}</td>
              <td>${money(w.variables)}</td>
              <td>${money(w.splurge||state.user.faFundsPerWeek||0)}</td>
              <td class="${w.freeToSpend<0?'negative':''}">${money(w.freeToSpend)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  app.appendChild(s);
}

function renderTimesheet(){
  const pr = state.payRules;
  const s = document.createElement('section'); s.className='card';
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  s.innerHTML = `
    <h2>Count Your Damn Hours</h2>
    <div class="help">Enter hours per day. We’ll compute overtime, double-time, and taxes.</div>
    <div class="grid cols-3" style="margin-top:6px">
      <div><label>Base Hourly</label><input id="base" type="number" step="0.01" value="${pr.baseHourly||20}"></div>
      <div><label>Withholding (0–1)</label><input id="wh" type="number" step="0.01" value="${pr.withholdingRatio??0.2}"></div>
      <div><label>Overtime rules</label>
        <select id="schema">
          <option value="federal" ${pr.schema==='federal'?'selected':''}>Federal</option>
          <option value="california" ${pr.schema==='california'?'selected':''}>California</option>
          <option value="alaska" ${pr.schema==='alaska'?'selected':''}>Alaska</option>
          <option value="colorado" ${pr.schema==='colorado'?'selected':''}>Colorado</option>
          <option value="nevada" ${pr.schema==='nevada'?'selected':''}>Nevada</option>
          <option value="custom" ${pr.schema==='custom'?'selected':''}>Custom</option>
        </select>
      </div>
    </div>
    <div id="otnote" class="help" style="margin-top:4px"></div>

    <div class="grid cols-2" style="margin-top:10px">
      <div class="table-scroll">
        <table>
          <thead><tr>${days.map(d=>`<th>${d}</th>`).join('')}</tr></thead>
          <tbody><tr>${days.map((_,i)=>`<td><input id="d${i}" type="number" step="0.1" value="0"></td>`).join('')}</tr></tbody>
        </table>
      </div>
      <div>
        <div class="row"><button class="primary" id="saveWeek">Save week</button><button class="ghost" id="preview">Preview net</button></div>
        <div id="tsHelp" class="help" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  app.appendChild(s);

  const notes = {
    federal: "1.5× after 40 hours in a workweek.",
    california: "1.5× after 8 hrs/day, 2× after 12 hrs/day; special rules on the 7th consecutive day.",
    alaska: "1.5× after 8 hrs/day and after 40 hrs/week (greater benefit applies).",
    colorado: "1.5× after 12 hrs/day or after 40 hrs/week (greater benefit applies).",
    nevada: "Weekly OT after 40; optional daily OT after 8 (not for 4×10s).",
    custom: "Set your own thresholds in Setup (wizard)."
  };
  const otnote = ()=> s.querySelector('#otnote').textContent = notes[document.getElementById('schema').value]||'';
  otnote();
  s.querySelector('#schema').onchange = otnote;

  s.querySelector('#saveWeek').onclick=()=>{
    state.payRules.baseHourly = Number(document.getElementById('base').value||20);
    state.payRules.withholdingRatio = Number(document.getElementById('wh').value||0.2);
    state.payRules.schema = document.getElementById('schema').value;
    const arr = Array.from({length:7},(_,i)=>Number(document.getElementById('d'+i).value||0));
    state.timesheets.push({weekStart: todayISO(), days:arr});
    save(state);
    const pay = computeWeekPay(arr, state.payRules);
    s.querySelector('#tsHelp').innerText = `Saved. Estimated net added: ${money(pay.net)} for ${pay.totalHours} hrs.`;
  };
  s.querySelector('#preview').onclick=()=>{
    const arr = Array.from({length:7},(_,i)=>Number(document.getElementById('d'+i).value||0));
    const pay = computeWeekPay(arr, { ...state.payRules,
      baseHourly:Number(document.getElementById('base').value||state.payRules.baseHourly),
      withholdingRatio:Number(document.getElementById('wh').value||state.payRules.withholdingRatio),
      schema:document.getElementById('schema').value
    });
    s.querySelector('#tsHelp').innerText = `Preview: Net ${money(pay.net)} (gross ${money(pay.gross)}) for ${pay.totalHours} hrs.`;
  };
}

function renderBills(){
  const s=document.createElement('section'); s.className='card';
  const rows=(state.bills||[]).map((b,i)=>`<tr><td>${b.name}</td><td>${b.dueDay}</td><td>${money(b.amount)}</td><td><button data-i="${i}" class="ghost del">Delete</button></td></tr>`).join('');
  s.innerHTML=`
    <h2>Shit That Must Get Paid</h2>
    <div class="help">Rent, power, housing, debts.</div>
    <div class="grid cols-3" style="margin-top:8px">
      <div><label>Name</label><input id="bn"></div>
      <div><label>Due Day (1-31)</label><input id="bd" type="number" min="1" max="31"></div>
      <div><label>Amount</label><input id="ba" type="number" step="0.01"></div>
      <div class="row"><button class="primary" id="add">Add</button></div>
    </div>
    <div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>Name</th><th>Due</th><th>Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
  app.appendChild(s);
  s.querySelector('#add').onclick=()=>{ const b={id:Date.now(),name:val('bn','Bill'),dueDay:+val('bd',1),amount:+val('ba',0)}; state.bills.push(b); save(state); render(); };
  s.querySelectorAll('.del').forEach(btn=>btn.onclick=()=>{ const i=+btn.dataset.i; state.bills.splice(i,1); save(state); render(); });
  function val(id,f){ const v=s.querySelector('#'+id).value; return v===''?f:v; }
}

function renderEvents(){
  const s=document.createElement('section'); s.className='card';
  const rows=(state.events||[]).map((e,i)=>`
    <tr><td>${e.date}</td><td>${e.type==='income'?'One-time income':'Ambush cost'}</td><td>${e.name||''}</td><td>${money(e.amount)}</td><td><button data-i="${i}" class="ghost del">Delete</button></td></tr>
  `).join('');
  s.innerHTML=`
    <h2>Catch-Up Shit</h2>
    <div class="help">One-time & overdue (aka ambush costs).</div>
    <div class="grid cols-3" style="margin-top:8px">
      <div><label>Type</label>
        <select id="t"><option value="discretionary">Ambush cost</option><option value="income">One-time income</option></select>
      </div>
      <div><label>Date</label><input id="d" type="date" value="${todayISO()}"></div>
      <div><label>Amount</label><input id="a" type="number" step="0.01"></div>
      <div class="grid cols-2">
        <div><label>Label (optional)</label><input id="n" placeholder="e.g., Last month electric"></div>
        <div class="row"><button class="primary" id="add">Add</button></div>
      </div>
    </div>
    <div class="table-scroll" style="margin-top:12px"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Label</th><th>Amount</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `;
  app.appendChild(s);
  s.querySelector('#add').onclick=()=>{ const e={id:Date.now(),type:s.querySelector('#t').value,date:s.querySelector('#d').value,amount:+s.querySelector('#a').value||0,name:s.querySelector('#n').value||''}; state.events.push(e); save(state); render(); };
  s.querySelectorAll('.del').forEach(btn=>btn.onclick=()=>{ const i=+btn.dataset.i; state.events.splice(i,1); save(state); render(); });
}

function renderEnvelopes(){
  const s=document.createElement('section'); s.className='card';
  const rows=(state.envelopes||[]).map((e,i)=>`<tr><td>${e.name}</td><td>${money(e.weeklyTarget)}</td><td><button data-i="${i}" class="ghost del">Delete</button></td></tr>`).join('');
  s.innerHTML=`
    <h2>Where the Hell It Goes</h2>
    <div class="help">Weekly buckets for food, gas, etc.</div>
    <div class="grid cols-3" style="margin-top:8px">
      <div><label>Name</label><input id="n"></div>
      <div><label>Weekly Target</label><input id="t" type="number" step="0.01"></div>
      <div class="row"><button class="primary" id="add">Add Bucket</button></div>
    </div>
    <div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>Name</th><th>Weekly Target</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
  app.appendChild(s);
  s.querySelector('#add').onclick=()=>{ const e={id:Date.now(),name:s.querySelector('#n').value||'Bucket',weeklyTarget:+s.querySelector('#t').value||0,rollover:true}; state.envelopes.push(e); save(state); render(); };
  s.querySelectorAll('.del').forEach(btn=>btn.onclick=()=>{ const i=+btn.dataset.i; state.envelopes.splice(i,1); save(state); render(); });
}

function renderLoans(){
  const s=document.createElement('section'); s.className='card';
  const rows=(state.loans||[]).map((l,i)=>`<tr><td>${l.name}</td><td>${money(l.minimumPayment)}</td><td><button data-i="${i}" class="ghost del">Delete</button></td></tr>`).join('');
  s.innerHTML=`
    <h2>Your Damn Debts</h2>
    <div class="grid cols-3" style="margin-top:8px">
      <div><label>Name</label><input id="n"></div>
      <div><label>Min Payment</label><input id="m" type="number" step="0.01"></div>
      <div><label>Due Day</label><input id="d" type="number" min="1" max="31"></div>
      <div class="row"><button class="primary" id="add">Add Debt</button></div>
    </div>
    <div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>Name</th><th>Min</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
  app.appendChild(s);
  s.querySelector('#add').onclick=()=>{ const l={id:Date.now(),name:s.querySelector('#n').value||'Debt',minimumPayment:+s.querySelector('#m').value||0,dueDay:+s.querySelector('#d').value||1}; state.loans.push(l); save(state); render(); };
  s.querySelectorAll('.del').forEach(btn=>btn.onclick=()=>{ const i=+btn.dataset.i; state.loans.splice(i,1); save(state); render(); });
}

function renderSettings(){
  const backups = getBackups();
  const u = state.user;
  const s=document.createElement('section'); s.className='card';
  s.innerHTML=`
    <h2>Settings</h2>
    <div class="grid cols-3" style="margin-top:6px">
      <div><label>Fuck Around Funds per Week ($)</label><input id="faf" type="number" step="1" value="${u.faFundsPerWeek||50}"></div>
      <div><label>Payday Weekday</label>
        <select id="payday">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>`<option value="${i}" ${i===u.paydayWeekday?'selected':''}>${d}</option>`).join('')}</select>
      </div>
      <div><label>Current Bank Balance ($)</label><input id="bal" type="number" step="0.01" value="${state.bank?.currentBalance||0}"></div>
      <div class="row"><button class="primary" id="save">Save</button></div>
    </div>

    <h3 style="margin-top:12px">Backups</h3>
    <div class="grid cols-3" style="margin-top:6px">
      <div><label>New backup name</label><input id="bname" placeholder="e.g., Before rent"></div>
      <div class="row"><button class="primary" id="mk">Save Backup</button></div>
      <div><label class="import-label">Import file <input type="file" id="imp" accept=".json,.ydb.json" style="display:none;"></label></div>
    </div>

    <div class="grid cols-2" style="margin-top:8px">
      <div>
        <label>Restore from backup</label>
        <select id="sel">${backups.map(b=>`<option value="${b.id}">${b.name} — ${new Date(b.ts).toLocaleString()}</option>`).join('')}</select>
      </div>
      <div class="row"><button class="primary" id="rest">Restore</button></div>
    </div>

    <div class="help" style="margin-top:10px">YDB 0.10.0 • cache ydb-v3</div>
  `;
  app.appendChild(s);
  s.querySelector('#save').onclick=()=>{ state.user.faFundsPerWeek=+s.querySelector('#faf').value||0; state.user.paydayWeekday=+s.querySelector('#payday').value||5; state.bank=state.bank||{currentBalance:0}; state.bank.currentBalance=+s.querySelector('#bal').value||0; save(state); alert('Saved.'); };
  s.querySelector('#mk').onclick=()=>{ makeBackup(s.querySelector('#bname').value||''); alert('Backup saved.'); render(); };
  s.querySelector('#rest').onclick=()=>{ const id=s.querySelector('#sel').value; if(!id) return alert('No backups yet'); if(confirm('Restore this backup?')){ if(restoreBackup(id)){ state=load(); alert('Restored.'); render(); } } };
  s.querySelector('#imp').addEventListener('change', (e)=>{ const f=e.target.files?.[0]; if(!f) return; importFile(f,(ok)=>{ if(ok){ state=load(); render(); } else alert('Import failed'); }); });
}

// Onboarding (same as prior)
function showWizard(){
  wizard.classList.remove('hidden');
  const wrap=document.createElement('div'); wrap.className='panel';
  wrap.innerHTML=`
    <h2>Let’s set your damn basics</h2>
    <div id="wbody"></div>
    <div class="actions"><button id="prev" class="ghost">Back</button><button id="next" class="primary">Next</button></div>
  `;
  wizard.innerHTML=''; wizard.appendChild(wrap);
  const steps=[stepBank, stepPayRules, stepBills, stepFinish]; let i=0;
  function draw(){ steps[i](document.getElementById('wbody')); document.getElementById('prev').style.visibility=i===0?'hidden':'visible'; document.getElementById('next').textContent=i===steps.length-1?'Finish':'Next'; }
  document.getElementById('prev').onclick=()=>{ if(i>0){i--;draw();} };
  document.getElementById('next').onclick=()=>{ if(steps[i].save && !steps[i].save()) return; if(i<steps.length-1){ i++; draw(); } else { state.meta.onboarded=true; save(state); wizard.classList.add('hidden'); render(); } };
  draw();
}
function stepBank(el){
  el.innerHTML=`
    <div class="grid cols-2">
      <div><label>What’s in the bank right now?</label><input id="wb" type="number" step="0.01" value="${state.bank?.currentBalance||0}"><div class="help">We use this for “Cash This Week”.</div></div>
      <div><label>When do you get paid?</label><select id="wp">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>`<option value="${i}" ${i===state.user.paydayWeekday?'selected':''}>${d}</option>`).join('')}</select><div class="help">Sets the pay-period window.</div></div>
    </div>
  `;
  stepBank.save=()=>{ state.bank=state.bank||{currentBalance:0}; state.bank.currentBalance=+el.querySelector('#wb').value||0; state.user.paydayWeekday=+el.querySelector('#wp').value||5; save(state); return true; };
}
function stepPayRules(el){
  const pr = state.payRules || {schema:'federal',baseHourly:20,withholdingRatio:0.2};
  el.innerHTML=`
    <div class="grid cols-3">
      <div><label>Hourly rate</label><input id="b" type="number" step="0.01" value="${pr.baseHourly||20}"></div>
      <div><label>Withholding (0–1)</label><input id="w" type="number" step="0.01" value="${pr.withholdingRatio??0.2}"></div>
      <div><label>Overtime rules</label>
        <select id="s">
          <option value="federal" ${pr.schema==='federal'?'selected':''}>Federal</option>
          <option value="california" ${pr.schema==='california'?'selected':''}>California</option>
          <option value="alaska" ${pr.schema==='alaska'?'selected':''}>Alaska</option>
          <option value="colorado" ${pr.schema==='colorado'?'selected':''}>Colorado</option>
          <option value="nevada" ${pr.schema==='nevada'?'selected':''}>Nevada</option>
          <option value="custom" ${pr.schema==='custom'?'selected':''}>Custom</option>
        </select>
      </div>
    </div>
    <div class="help" id="note" style="margin-top:6px"></div>
  `;
  const notes = {
    federal: "1.5× after 40 hours in a workweek.",
    california: "1.5× after 8 hrs/day, 2× after 12 hrs/day; special rules on 7th consecutive day.",
    alaska: "1.5× after 8 hrs/day and 40 hrs/week (greater benefit applies).",
    colorado: "1.5× after 12 hrs/day or 40 hrs/week (greater benefit applies).",
    nevada: "Weekly after 40; optional daily after 8 (not for 4×10).",
    custom: "You’ll set your own thresholds later."
  };
  const note=()=> el.querySelector('#note').textContent = notes[el.querySelector('#s').value]||'';
  note();
  el.querySelector('#s').onchange=note;
  stepPayRules.save=()=>{ state.payRules=state.payRules||{}; state.payRules.baseHourly=+el.querySelector('#b').value||20; state.payRules.withholdingRatio=+el.querySelector('#w').value||0.2; state.payRules.schema=el.querySelector('#s').value; save(state); return true; };
}
function stepBills(el){
  el.innerHTML=`
    <div class="help" style="margin-bottom:6px">Add the non-negotiables.</div>
    <div class="grid cols-3">
      <div><label>Name</label><input id="n"></div>
      <div><label>Due Day (1–31)</label><input id="d" type="number" min="1" max="31"></div>
      <div><label>Amount</label><input id="a" type="number" step="0.01"></div>
      <div class="row"><button class="primary" id="add">Add</button></div>
    </div>
    <div id="tbl" style="margin-top:10px" class="help">Add a couple to start; you can edit later.</div>
  `;
  el.querySelector('#add').onclick=()=>{ state.bills=state.bills||[]; state.bills.push({id:Date.now(),name:el.querySelector('#n').value||'Bill',dueDay:+el.querySelector('#d').value||1,amount:+el.querySelector('#a').value||0}); save(state); el.querySelector('#tbl').textContent = `${state.bills.length} added`; };
  stepBills.save=()=>true;
}
function stepFinish(el){ el.innerHTML=`<div class="help">Done. Home shows the damage; Hours logs paychecks; Catch-Up Shit is for ambush costs.</div>`; }

document.querySelectorAll('nav .tab').forEach(btn=>btn.onclick=()=>{ document.querySelectorAll('nav .tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); render(); });
render();