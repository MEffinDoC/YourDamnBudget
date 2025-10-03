import { load, save, makeBackup, getBackups, restoreBackup, deleteBackup, importFile } from './storage.js';
import { project, monthlyReality, computeWeekPay } from './engine.js';

let state = load();
const app = document.getElementById('app');
const wizard = document.getElementById('wizard');

function fmt(n){ return (n<0?'-':'') + '$' + Math.abs(Number(n||0)).toFixed(2); }
function iso(d){ return new Date(d).toISOString().slice(0,10); }
function todayISO(){ return iso(new Date()); }
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// programmatic nav
function navTo(view){
  const tabs = document.querySelectorAll('nav .tab');
  tabs.forEach(b=>{ b.classList.toggle('active', b.dataset.view===view); });
  render();
}

// scroll-safe tap
function attachSafeTap(el, onTap){
  if(!el) return;
  let startX=0, startY=0, startT=0, moved=false;
  const THRESH = 10, TIME = 500;
  el.addEventListener('pointerdown', (e)=>{ startX=e.clientX; startY=e.clientY; startT=Date.now(); moved=false; el.setPointerCapture?.(e.pointerId); }, {passive:true});
  el.addEventListener('pointermove', (e)=>{ if(Math.abs(e.clientX-startX)>THRESH || Math.abs(e.clientY-startY)>THRESH){ moved=true; } }, {passive:true});
  el.addEventListener('pointerup', (e)=>{ const dt = Date.now()-startT; if(!moved && dt<=TIME) onTap(); try{ el.releasePointerCapture?.(e.pointerId); }catch{} }, {passive:true});
}

// payday helpers
function lastPaydayFrom(d, paydayWeekday=5){ const date=new Date(d); const dow=date.getDay(); const diff=(dow - paydayWeekday + 7) % 7; const last=new Date(date); last.setDate(date.getDate() - diff); last.setHours(0,0,0,0); return last; }
function nextPaydayFrom(d, paydayWeekday=5){ const date=new Date(d); const dow=date.getDay(); const diff=(paydayWeekday - dow + 7) % 7; const next=new Date(date); next.setDate(date.getDate() + diff + (diff===0?7:0)); next.setHours(0,0,0,0); return next; }

function getUpcomingThisPayPeriod(){
  const start = lastPaydayFrom(new Date(), state.user.paydayWeekday);
  const end = nextPaydayFrom(new Date(), state.user.paydayWeekday);
  const items = [];
  for(const b of state.bills||[]){
    for(let mOff=0;mOff<2;mOff++){
      const due=new Date(start.getFullYear(), start.getMonth()+mOff, b.dueDay);
      if(due>=start && due<end){ items.push({kind:'bill', id:b.id, name:b.name, date: iso(due), amount:Number(b.amount||0)}); }
    }
  }
  for(const l of state.loans||[]){
    for(let mOff=0;mOff<2;mOff++){
      const due=new Date(start.getFullYear(), start.getMonth()+mOff, l.dueDay);
      if(due>=start && due<end){ items.push({kind:'loan', id:l.id, name:l.name, date: iso(due), amount:Number(l.minimumPayment||0)}); }
    }
  }
  for(const e of state.events||[]){
    if(e.type==='discretionary'){
      const d=new Date(e.date); if(d>=start && d<end){ items.push({kind:'event', id:e.id, name:e.name||'One-time', date: iso(d), amount:Number(e.amount||0)}); }
    }
  }
  const paid = new Set((state.paid||[]).map(p=>`${p.kind}:${p.id}:${p.dateISO}`));
  return items.sort((a,b)=> new Date(a.date)-new Date(b.date) || a.name.localeCompare(b.name)).filter(it => !paid.has(`${it.kind}:${it.id}:${it.date}`));
}
function markPaid(kind, id, dateISO){ state.paid = state.paid || []; state.paid.push({kind, id, dateISO}); save(state); }

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

function renderHome(){
  const weeks = project(state);
  const thisWeek = weeks[0];
  const start = lastPaydayFrom(new Date(), state.user.paydayWeekday);
  const end = nextPaydayFrom(new Date(), state.user.paydayWeekday);
  const upcoming = getUpcomingThisPayPeriod();
  const reality = monthlyReality(state);

  const card=document.createElement('div'); card.className='grid';
  card.innerHTML = `
    <section class="card">
      <div class="grid cols-3">
        <div class="clickable" id="tap-must">
          <div class="kpi-label">The Shit You Can’t Skip</div>
          <div class="kpi-value">${fmt(thisWeek.mustPays)}</div>
          <div class="help">(bills, housing, debts)</div>
        </div>
        <div class="clickable" id="tap-vars">
          <div class="kpi-label">Your Daily Damage</div>
          <div class="kpi-value">${fmt(thisWeek.variables)}</div>
          <div class="help">(food, gas, fun)</div>
        </div>
        <div class="clickable" id="tap-splurge">
          <div class="kpi-label">Splurge Money</div>
          <div class="kpi-value">${fmt(thisWeek.splurge)}</div>
          <div class="help">(edit in Settings)</div>
        </div>
      </div>
      <div class="grid cols-3" style="margin-top:8px">
        <div>
          <div class="kpi-label">The Ugly Truth</div>
          <div class="kpi-value ${thisWeek.freeToSpend<0?'negative':'positive'}">${fmt(thisWeek.inflows - (thisWeek.mustPays + thisWeek.variables + thisWeek.splurge))}</div>
          <div class="help">(where the fuck your money went)</div>
        </div>
        <div class="clickable" id="tap-inflows">
          <div class="kpi-label">Inflows</div>
          <div class="kpi-value">${fmt(thisWeek.inflows)}</div>
          <div class="help">(log hours)</div>
        </div>
        <div>
          <div class="kpi-label">Left After Damage</div>
          <div class="kpi-value ${thisWeek.freeToSpend<0?'negative':'positive'}">${fmt(thisWeek.freeToSpend)}</div>
        </div>
      </div>
    </section>

    <section class="card">
      <h3>Upcoming this pay period</h3>
      <div class="help">Pay period: ${iso(start)} → ${iso(end)} (Payday: ${DOW[state.user.paydayWeekday]}).</div>
      ${upcoming.length===0 ? '<div class="help">Nothing due before next payday 🎉</div>' : ''}
      ${upcoming.length>0 ? `
      <div class="table-scroll">
      <table>
        <thead><tr><th>Due</th><th>Item</th><th>Amount</th><th>Paid?</th></tr></thead>
        <tbody>
          ${upcoming.map(it=>`
            <tr>
              <td>${it.date}</td>
              <td>${it.kind.toUpperCase()}: ${it.name||''}</td>
              <td>${fmt(it.amount)}</td>
              <td><input type="checkbox" data-k="${it.kind}" data-id="${it.id}" data-date="${it.date}"></td>
            </tr>`).join('')}
        </tbody>
      </table></div>` : ''}
      <div class="help">Check it off when you pay it — gone for this period.</div>
    </section>

    <section class="card">
      <h3>Monthly Reality Check</h3>
      <div class="help">Month’s outflow vs what you’ve earned so far.</div>
      <div class="grid cols-3" style="margin-top:8px">
        <div>
          <div class="kpi-label">This month will cost</div>
          <div class="kpi-value">${fmt(reality.monthNeed)}</div>
        </div>
        <div>
          <div class="kpi-label">You’ve earned</div>
          <div class="kpi-value">${fmt(reality.earned)}</div>
        </div>
        <div>
          <div class="kpi-label">${reality.shortfall>0 ? 'Hours to cover it' : 'You’re covered'}</div>
          <div class="kpi-value ${reality.shortfall>0?'negative':'positive'}">${reality.shortfall>0 ? reality.hoursNeeded+' hrs' : '✔︎'}</div>
          ${reality.shortfall>0 ? `<div class="help">~${reality.perWeek} hrs/week for the rest of the month</div>` : ''}
        </div>
      </div>
    </section>
  `;
  app.appendChild(card);

  document.querySelectorAll('input[type="checkbox"][data-k]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked){ markPaid(cb.dataset.k, cb.dataset.id*1, cb.dataset.date); render(); }
    });
  });

  attachSafeTap(document.getElementById('tap-must'),   ()=>navTo('bills'));
  attachSafeTap(document.getElementById('tap-vars'),   ()=>navTo('envelopes'));
  attachSafeTap(document.getElementById('tap-splurge'),()=>navTo('settings'));
  attachSafeTap(document.getElementById('tap-inflows'),()=>navTo('timesheet'));

  // Show wizard if first run
  if(!state.meta?.onboarded){ showWizard(); }
}

// ---------- Onboarding Wizard ----------
function showWizard(){
  wizard.classList.remove('hidden');
  const stepper = document.createElement('div');
  stepper.className='panel';
  stepper.innerHTML = `
    <h2>Let’s set your damn basics</h2>
    <div id="wiz-body"></div>
    <div class="actions">
      <button id="wiz-prev" class="ghost">Back</button>
      <button id="wiz-next" class="primary">Next</button>
    </div>
  `;
  wizard.innerHTML = ''; wizard.appendChild(stepper);

  const steps = [stepBank, stepPayRules, stepBills, stepLoans, stepFinish];
  let idx = 0;

  function renderStep(){ steps[idx](document.getElementById('wiz-body')); document.getElementById('wiz-prev').style.visibility = idx===0?'hidden':'visible'; document.getElementById('wiz-next').textContent = idx===steps.length-1?'Finish':'Next'; }
  document.getElementById('wiz-prev').onclick = ()=>{ if(idx>0){ idx--; renderStep(); } };
  document.getElementById('wiz-next').onclick = ()=>{
    if(steps[idx].save && !steps[idx].save()) return;
    if(idx < steps.length-1){ idx++; renderStep(); } else { state.meta.onboarded=true; save(state); wizard.classList.add('hidden'); render(); }
  };
  renderStep();
}

function stepBank(container){
  container.innerHTML = `
    <div class="grid cols-2">
      <div>
        <label>What’s in the bank right now?</label>
        <input id="wbalance" type="number" step="0.01" value="${state.bank?.currentBalance||0}">
        <div class="help">We use this to show how much is safely spendable this week.</div>
      </div>
      <div>
        <label>When do you usually get paid?</label>
        <select id="wpayday">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>`<option value="${i}" ${i===state.user.paydayWeekday?'selected':''}>${d}</option>`).join('')}</select>
        <div class="help">Just to mark the pay period in your timeline.</div>
      </div>
    </div>
  `;
  stepBank.save = ()=>{
    state.bank = state.bank || {currentBalance:0};
    state.bank.currentBalance = Number(document.getElementById('wbalance').value||0);
    state.user.paydayWeekday = Number(document.getElementById('wpayday').value||5);
    save(state); return true;
  };
}

function stepPayRules(container){
  const pr = state.payRules || {schema:'federal', baseHourly:20, withholdingRatio:0.2};
  container.innerHTML = `
    <div class="grid cols-2">
      <div>
        <label>What’s your damn pay rate? (Hourly)</label>
        <input id="wbase" type="number" step="0.01" value="${pr.baseHourly||20}">
        <div class="help">Before taxes and stuff.</div>
      </div>
      <div>
        <label>Withholding (0–1)</label>
        <input id="wwh" type="number" step="0.01" value="${pr.withholdingRatio??0.2}">
        <div class="help">0.20 = about 20% taken out.</div>
      </div>
      <div>
        <label>Overtime rules</label>
        <select id="wschema">
          <option value="federal" ${pr.schema==='federal'?'selected':''}>Federal (1.5× after 40/week)</option>
          <option value="california" ${pr.schema==='california'?'selected':''}>California (1.5× >8/day, 2× >12/day)</option>
          <option value="alaska" ${pr.schema==='alaska'?'selected':''}>Alaska (1.5× >8/day)</option>
          <option value="colorado" ${pr.schema==='colorado'?'selected':''}>Colorado (1.5× >12/day)</option>
          <option value="nevada" ${pr.schema==='nevada'?'selected':''}>Nevada (weekly; optional daily)</option>
          <option value="custom" ${pr.schema==='custom'?'selected':''}>Custom…</option>
        </select>
        <div class="help">Some places do daily overtime or double-time. Pick what fits you.</div>
      </div>
      <div id="wextras"></div>
    </div>
  `;
  function renderExtras(){
    const schema = document.getElementById('wschema').value;
    const extras = document.getElementById('wextras');
    if(schema==='nevada'){
      extras.innerHTML = `
        <label><input id="wnv8" type="checkbox" ${state.payRules?.nvDaily8?'checked':''}> Count daily overtime after 8 hours (not for 4×10 schedules)</label>
        <div class="help">Nevada daily OT applies in some cases; otherwise weekly after 40.</div>
      `;
    } else if(schema==='custom'){
      const c = state.payRules?.custom || {weekly:{threshold:40,multiplier:1.5}, daily:[{threshold:8,multiplier:1}], dailyAboveMultiplier:2.0};
      extras.innerHTML = `
        <div class="grid cols-2">
          <div><label>Weekly OT threshold</label><input id="c_wth" type="number" step="1" value="${c.weekly?.threshold||40}"></div>
          <div><label>Weekly OT multiplier</label><input id="c_wmul" type="number" step="0.1" value="${c.weekly?.multiplier||1.5}"></div>
          <div><label>Daily threshold #1 (hours)</label><input id="c_d1h" type="number" step="1" value="${c.daily?.[0]?.threshold||8}"></div>
          <div><label>Over that, multiplier becomes</label><input id="c_d1m" type="number" step="0.1" value="${c.daily?.[0]?.multiplier||1}"></div>
          <div><label>Daily threshold #2 (optional)</label><input id="c_d2h" type="number" step="1" value="${c.daily?.[1]?.threshold||12}"></div>
          <div><label>Above that, multiplier</label><input id="c_d2m" type="number" step="0.1" value="${c.daily?.[1]?.multiplier||1.5}"></div>
          <div><label>Daily above-top multiplier</label><input id="c_dam" type="number" step="0.1" value="${state.payRules?.custom?.dailyAboveMultiplier||2.0}"></div>
        </div>
        <div class="help">Example: 8→1×, 12→1.5×, above 12→2×.</div>
      `;
    } else {
      extras.innerHTML = '';
    }
  }
  renderExtras();
  document.getElementById('wschema').onchange = renderExtras;

  stepPayRules.save = ()=>{
    state.payRules = state.payRules || {};
    state.payRules.baseHourly = Number(document.getElementById('wbase').value||20);
    state.payRules.withholdingRatio = Number(document.getElementById('wwh').value||0.2);
    const schema = document.getElementById('wschema').value;
    state.payRules.schema = schema;
    if(schema==='nevada'){
      state.payRules.nvDaily8 = document.getElementById('wnv8')?.checked || false;
    } else if(schema==='custom'){
      const weekly = {threshold:Number(document.getElementById('c_wth').value||40), multiplier:Number(document.getElementById('c_wmul').value||1.5)};
      const d1h = Number(document.getElementById('c_d1h').value||0), d1m=Number(document.getElementById('c_d1m').value||1);
      const d2h = Number(document.getElementById('c_d2h').value||0), d2m=Number(document.getElementById('c_d2m').value||1.5);
      const daily = [];
      if(d1h>0) daily.push({threshold:d1h, multiplier:1});
      if(d2h>0) daily.push({threshold:d2h, multiplier:d1m});
      state.payRules.custom = {weekly, daily, dailyAboveMultiplier:Number(document.getElementById('c_dam').value||2)};
    }
    save(state); return true;
  };
}

function stepBills(container){
  container.innerHTML = `
    <div class="help" style="margin-bottom:6px">What bills are strangling you every month?</div>
    <div class="grid cols-3">
      <div><label>Name</label><input id="bn"></div>
      <div><label>Due Day (1–31)</label><input id="bd" type="number" min="1" max="31"></div>
      <div><label>Amount</label><input id="ba" type="number" step="0.01"></div>
      <div class="row" style="align-items:center"><button id="addBill" class="primary">Add</button></div>
    </div>
    <div id="btable" style="margin-top:10px"></div>
  `;
  function renderTable(){
    const rows = (state.bills||[]).map((b,i)=>`<tr><td>${b.name}</td><td>${b.dueDay}</td><td>${fmt(b.amount)}</td><td><button data-i="${i}" class="ghost delbill">Delete</button></td></tr>`).join('');
    document.getElementById('btable').innerHTML = state.bills?.length?`<div class="table-scroll"><table><thead><tr><th>Name</th><th>Due</th><th>Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="help">No bills yet.</div>';
    document.querySelectorAll('.delbill').forEach(btn=>btn.onclick=()=>{ const i=Number(btn.dataset.i); state.bills.splice(i,1); save(state); renderTable(); });
  }
  renderTable();
  document.getElementById('addBill').onclick=()=>{
    const b={ id: Date.now(), name:document.getElementById('bn').value||'Bill', dueDay:Number(document.getElementById('bd').value||1), amount:Number(document.getElementById('ba').value||0) };
    state.bills = state.bills || []; state.bills.push(b); save(state); renderTable();
  };
  stepBills.save = ()=>true;
}

function stepLoans(container){
  container.innerHTML = `
    <div class="help" style="margin-bottom:6px">You got any damn debts?</div>
    <div class="grid cols-3">
      <div><label>Name</label><input id="ln"></div>
      <div><label>Min Payment</label><input id="lmin" type="number" step="0.01"></div>
      <div><label>Due Day</label><input id="ldue" type="number" min="1" max="31"></div>
      <div class="row" style="align-items:center"><button id="addLoan" class="primary">Add Debt</button></div>
    </div>
    <div id="ltable" style="margin-top:10px"></div>
  `;
  function renderTable(){
    const rows = (state.loans||[]).map((l,i)=>`<tr><td>${l.name}</td><td>${fmt(l.minimumPayment)}</td><td>${l.dueDay}</td><td><button data-i="${i}" class="ghost delloan">Delete</button></td></tr>`).join('');
    document.getElementById('ltable').innerHTML = state.loans?.length?`<div class="table-scroll"><table><thead><tr><th>Name</th><th>Min</th><th>Due</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="help">No debts yet.</div>';
    document.querySelectorAll('.delloan').forEach(btn=>btn.onclick=()=>{ const i=Number(btn.dataset.i); state.loans.splice(i,1); save(state); renderTable(); });
  }
  renderTable();
  document.getElementById('addLoan').onclick=()=>{
    const l={ id: Date.now(), name:document.getElementById('ln').value||'Debt', minimumPayment:Number(document.getElementById('lmin').value||0), dueDay:Number(document.getElementById('ldue').value||1) };
    state.loans = state.loans || []; state.loans.push(l); save(state); renderTable();
  };
  stepLoans.save = ()=>true;
}

function stepFinish(container){
  container.innerHTML = `<div class="help">You’re set. Home shows the damage; Hours logs paychecks; Bills/Debts keep you honest. Go get it.</div>`;
  stepFinish.save = ()=>true;
}

// ---------- Views ----------
function renderPlanner(){
  const weeks = project(state);
  const table = document.createElement('section');
  table.className='card';
  let rows = weeks.map((w,i)=>`
    <tr>
      <td>Week ${i+1}<span class="badge">${iso(w.weekStart)}</span></td>
      <td>${fmt(w.inflows)}</td>
      <td>${fmt(w.mustPays)}</td>
      <td>${fmt(w.variables)}</td>
      <td>${fmt(w.splurge)}</td>
      <td class="${w.freeToSpend<0?'negative':''}">${fmt(w.freeToSpend)}</td>
    </tr>`).join('');
  table.innerHTML = `
    <h2>Crystal Ball</h2>
    <div class="help">12-week forecast. If you’re in the red, trim Daily Damage or Splurge.</div>
    <div class="table-scroll">
    <table>
      <thead><tr><th>Week</th><th>Inflows</th><th>Shit You Can’t Skip</th><th>Your Daily Damage</th><th>Splurge Money</th><th>Left</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  app.appendChild(table);
}

function renderTimesheet(){
  const pr = state.payRules;
  const card = document.createElement('section');
  card.className='card';
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  card.innerHTML = `
    <h2>Count Your Damn Hours</h2>
    <div class="help">Enter hours per day. We’ll handle overtime, double-time, and taxes.</div>
    <div class="grid cols-3">
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
    <div id="ruleExtras" class="help" style="margin-top:6px"></div>
    <div class="grid cols-2" style="margin-top:10px">
      <div class="table-scroll">
        <table>
          <thead><tr>${days.map(d=>`<th>${d}</th>`).join('')}</tr></thead>
          <tbody><tr>${days.map((_,i)=>`<td><input id="d${i}" type="number" step="0.1" value="0"></td>`).join('')}</tr></tbody>
        </table>
      </div>
      <div>
        <div class="row"><button class="primary" id="calc">Save week</button><button class="ghost" id="preview">Preview net</button></div>
        <div id="tsHelp" class="help" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  app.appendChild(card);

  function showRuleHelp(){
    const s = document.getElementById('schema').value;
    const box = document.getElementById('ruleExtras');
    const notes = {
      federal: "1.5× after 40 hours in a workweek.",
      california: "1.5× after 8 hours/day; 2× after 12 hours/day; extra rules for 7th consecutive day.",
      alaska: "1.5× after 8 hours/day and after 40 hours/week.",
      colorado: "1.5× after 12 hours/day or 40 hours/week.",
      nevada: "Weekly after 40. Optional daily OT after 8 unless 4×10 schedule.",
      custom: "Set your own thresholds in Settings → Onboarding (re-run)."
    };
    box.textContent = notes[s] || '';
  }
  showRuleHelp();
  document.getElementById('schema').onchange = showRuleHelp;

  document.getElementById('calc').onclick=()=>{
    state.payRules.baseHourly = Number(document.getElementById('base').value||20);
    state.payRules.withholdingRatio = Number(document.getElementById('wh').value||0.2);
    state.payRules.schema = document.getElementById('schema').value;
    const daysArr = Array.from({length:7}, (_,i)=>Number(document.getElementById('d'+i).value||0));
    state.timesheets.push({weekStart: todayISO(), days:daysArr});
    save(state);
    const pay = computeWeekPay(daysArr, state.payRules);
    document.getElementById('tsHelp').innerText = `Saved. Estimated net added: ${fmt(pay.net)} for ${pay.totalHours} hrs.`;
  };
  document.getElementById('preview').onclick=()=>{
    const daysArr = Array.from({length:7}, (_,i)=>Number(document.getElementById('d'+i).value||0));
    const pay = computeWeekPay(daysArr, { ...state.payRules, baseHourly:Number(document.getElementById('base').value||state.payRules.baseHourly), withholdingRatio:Number(document.getElementById('wh').value||state.payRules.withholdingRatio), schema: document.getElementById('schema').value });
    document.getElementById('tsHelp').innerText = `Preview: Net ${fmt(pay.net)} (gross ${fmt(pay.gross)}) for ${pay.totalHours} hrs.`;
  };
}

function renderBills(){
  const card=document.createElement('section'); card.className='card';
  const rows = (state.bills||[]).map((b,i)=>`<tr><td>${b.name}</td><td>${b.dueDay}</td><td>${fmt(b.amount)}</td><td><button data-i="${i}" class="ghost del bill">Delete</button></td></tr>`).join('');
  card.innerHTML = `
    <h2>Shit That Must Get Paid</h2>
    <div class="help">Rent, power, housing, debts.</div>
    <div class="grid cols-3" style="margin-top:8px">
      <div><label>Name</label><input id="bn"></div>
      <div><label>Due Day (1-31)</label><input id="bd" type="number" min="1" max="31"></div>
      <div><label>Amount</label><input id="ba" type="number" step="0.01"></div>
      <div class="row" style="align-items:center"><button class="primary" id="addBill">Add</button></div>
    </div>
    <div class="table-scroll"><table style="margin-top:12px"><thead><tr><th>Name</th><th>Due</th><th>Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
  app.appendChild(card);
  document.getElementById('addBill').onclick=()=>{
    const b={ id: Date.now(), name:document.getElementById('bn').value||'Bill', dueDay:Number(document.getElementById('bd').value||1), amount:Number(document.getElementById('ba').value||0) };
    state.bills.push(b); save(state); render();
  };
  card.querySelectorAll('button.bill').forEach(btn=>btn.onclick=()=>{ const i=Number(btn.dataset.i); state.bills.splice(i,1); save(state); render(); });
}

function renderEvents(){
  const card=document.createElement('section'); card.className='card';
  const rows = (state.events||[]).map((e,i)=>`
    <tr>
      <td>${e.date}</td>
      <td>${e.type==='income'?'Income':'Catch-Up Shit'}</td>
      <td>${e.name||''}</td>
      <td>${fmt(e.amount)}</td>
      <td><button data-i="${i}" class="ghost ev">Delete</button></td>
    </tr>`).join('');
  card.innerHTML = `
    <h2>Catch-Up Shit</h2>
    <div class="help">Late bills & one-time hits.</div>
    <div class="grid cols-3" style="margin-top:8px">
      <div><label>Type</label>
        <select id="evtype">
          <option value="discretionary">Catch-Up (spend)</option>
          <option value="income">One-time Income</option>
        </select>
      </div>
      <div><label>Date</label><input id="evdate" type="date" value="${todayISO()}"></div>
      <div><label>Amount</label><input id="evamt" type="number" step="0.01" placeholder="0.00"></div>
      <div class="grid cols-2">
        <div><label>Label (optional)</label><input id="evname" placeholder="e.g., Last month electric"></div>
        <div class="row" style="align-items:center"><button class="primary" id="addEvent">Add</button></div>
      </div>
    </div>
    <div class="table-scroll"><table style="margin-top:12px">
      <thead><tr><th>Date</th><th>Type</th><th>Label</th><th>Amount</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `;
  app.appendChild(card);
  document.getElementById('addEvent').onclick=()=>{
    const e={ id: Date.now(), type: document.getElementById('evtype').value, date: document.getElementById('evdate').value, amount: Number(document.getElementById('evamt').value||0), name: document.getElementById('evname').value || '' };
    state.events = state.events || [];
    state.events.push(e); save(state); render();
  };
  card.querySelectorAll('button.ev').forEach(btn=>btn.onclick=()=>{ const i=Number(btn.dataset.i); state.events.splice(i,1); save(state); render(); });
}

function renderEnvelopes(){
  const card=document.createElement('section'); card.className='card';
  const rows = (state.envelopes||[]).map((e,i)=>`<tr><td>${e.name}</td><td>${fmt(e.weeklyTarget)}</td><td><button data-i="${i}" class="ghost env">Delete</button></td></tr>`).join('');
  card.innerHTML = `
    <h2>Where the Hell It Goes</h2>
    <div class="help">Spending buckets by week.</div>
    <div class="grid cols-3">
      <div><label>Name</label><input id="en"></div>
      <div><label>Weekly Target</label><input id="et" type="number" step="0.01"></div>
      <div class="row" style="align-items:center"><button class="primary" id="addEnv">Add Bucket</button></div>
    </div>
    <div class="table-scroll"><table style="margin-top:12px"><thead><tr><th>Name</th><th>Weekly Target</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
  app.appendChild(card);
  document.getElementById('addEnv').onclick=()=>{
    const e={id:Date.now(), name:document.getElementById('en').value||'Bucket', weeklyTarget:Number(document.getElementById('et').value||0), rollover:true};
    state.envelopes.push(e); save(state); render();
  };
  card.querySelectorAll('button.env').forEach(btn=>btn.onclick=()=>{ const i=Number(btn.dataset.i); state.envelopes.splice(i,1); save(state); render(); });
}

function renderLoans(){
  const card=document.createElement('section'); card.className='card';
  const rows = (state.loans||[]).map((l,i)=>`<tr><td>${l.name}</td><td>${fmt(l.minimumPayment)}</td><td><button data-i="${i}" class="ghost loan">Delete</button></td></tr>`).join('');
  card.innerHTML = `
    <h2>Your Damn Debts</h2>
    <div class="grid cols-3">
      <div><label>Name</label><input id="ln"></div>
      <div><label>Min Payment</label><input id="lmin" type="number" step="0.01"></div>
      <div><label>Due Day</label><input id="ldue" type="number" min="1" max="31"></div>
      <div class="row" style="align-items:center"><button class="primary" id="addLoan">Add Debt</button></div>
    </div>
    <div class="table-scroll"><table style="margin-top:12px"><thead><tr><th>Name</th><th>Min</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
  app.appendChild(card);
  document.getElementById('addLoan').onclick=()=>{
    const l={id:Date.now(), name:document.getElementById('ln').value||'Debt', minimumPayment:Number(document.getElementById('lmin').value||0), dueDay:Number(document.getElementById('ldue').value||1)};
    state.loans.push(l); save(state); render();
  };
  card.querySelectorAll('button.loan').forEach(btn=>btn.onclick=()=>{ const i=Number(btn.dataset.i); state.loans.splice(i,1); save(state); render(); });
}

function renderSettings(){
  const u = state.user;
  const backups = getBackups();
  const card=document.createElement('section'); card.className='card';
  card.innerHTML = `
    <h2>Settings</h2>
    <div class="grid cols-3">
      <div><label>Splurge Money per Week ($)</label><input id="splurge" type="number" step="1" value="${u.splurgePerWeek||50}"></div>
      <div><label>Payday Weekday</label>
        <select id="payday">
          ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>`<option value="${i}" ${i===u.paydayWeekday?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div><label>Current Bank Balance ($)</label><input id="bal" type="number" step="0.01" value="${state.bank?.currentBalance||0}"></div>
      <div class="row" style="align-items:center"><button class="primary" id="saveSet">Save</button></div>
    </div>

    <hr style="margin:12px 0;border:none;border-top:1px solid #1F2937" />

    <h3>Backups</h3>
    <div class="help">Create and restore backups here. (Import file is optional.)</div>
    <div class="grid cols-3" style="margin-top:8px">
      <div><label>New backup name</label><input id="bname" placeholder="e.g., Before rent"></div>
      <div class="row" style="align-items:center"><button class="primary" id="mkBackup">Save Backup</button></div>
      <div class="row" style="align-items:center">
        <label class="import-label">Import file
          <input type="file" id="importFile" accept=".json,.ydb.json" style="display:none;">
        </label>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:8px">
      <div>
        <label>Restore from backup</label>
        <select id="restoreSel">
          ${backups.map(b=>`<option value="${b.id}">${b.name} — ${new Date(b.ts).toLocaleString()}</option>`).join('')}
        </select>
      </div>
      <div class="row" style="align-items:center;gap:8px">
        <button class="primary" id="restoreBtn">Restore</button>
      </div>
    </div>
  `;
  app.appendChild(card);

  document.getElementById('saveSet').onclick=()=>{
    state.user.splurgePerWeek = Number(document.getElementById('splurge').value||50);
    state.user.paydayWeekday = Number(document.getElementById('payday').value||5);
    state.bank = state.bank || {currentBalance:0};
    state.bank.currentBalance = Number(document.getElementById('bal').value||0);
    save(state); alert('Saved.');
  };
  document.getElementById('mkBackup').onclick=()=>{ makeBackup(document.getElementById('bname').value||''); alert('Backup saved.'); render(); };
  document.getElementById('restoreBtn').onclick=()=>{
    const id = document.getElementById('restoreSel').value;
    if(!id){ alert('No backups yet.'); return; }
    if(confirm('Restore this backup? Your current data will be replaced.')){
      const ok = restoreBackup(id);
      if(ok){ state=load(); alert('Restored.'); render(); }
      else alert('Backup not found.');
    }
  };
  document.getElementById('importFile').addEventListener('change', (e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    importFile(f,(ok)=>{ if(ok){ state=load(); render(); } else alert('Import failed'); });
  });
}

// nav wiring
function wireNav(){
  const tabs = document.querySelectorAll('nav .tab');
  tabs.forEach(btn=>btn.onclick=()=>{ tabs.forEach(b=>b.classList.remove('active')); btn.classList.add('active'); render(); });
}
wireNav(); render();