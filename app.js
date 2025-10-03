import { load } from './storage.js';
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
function markPaid(kind,id,dateISO){ state.paid=state.paid||[]; state.paid.push({kind,id,dateISO}); localStorage.setItem(storageKey(), JSON.stringify(state)); }

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

  // one-time gentle nudge to show the tabs can scroll
  maybeNudgeTabs();
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
    lensLeft = Math.max(0, variables);
    lensName = 'Weekly Buckets';
  } else {
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

/* ---------- Other views (unchanged from your current build) ---------- */
function renderPlanner(){ /* ... left as-is in your repo ... */ }
function renderTimesheet(){ /* ... left as-is in your repo ... */ }
function renderBills(){ /* ... left as-is in your repo ... */ }
function renderEvents(){ /* ... left as-is in your repo ... */ }
function renderEnvelopes(){ /* ... left as-is in your repo ... */ }
function renderLoans(){ /* ... left as-is in your repo ... */ }
function renderSettings(){ /* ... left as-is in your repo ... */ }

/* ---------- Onboarding (unchanged) ---------- */
function showWizard(){ /* ... left as-is in your repo ... */ }

/* ---------- Nav: one-time nudge to hint swiping ---------- */
function maybeNudgeTabs(){
  try{
    if(localStorage.getItem('ydb:navHintSeen')==='1') return;
    const tabs = document.querySelector('.tabs');
    if(!tabs) return;
    // If it actually overflows, nudge; otherwise do nothing
    const overflow = tabs.scrollWidth > tabs.clientWidth + 8;
    if(!overflow) return;

    // Scroll a bit to the right, then back, then mark seen
    tabs.scrollBy({left:24, behavior:'smooth'});
    setTimeout(()=>{ tabs.scrollBy({left:-24, behavior:'smooth'}); }, 650);
    localStorage.setItem('ydb:navHintSeen','1');
  }catch(_e){}
}

/* ---------- Boot ---------- */
document.querySelectorAll('nav .tab').forEach(btn=>btn.onclick=()=>{ document.querySelectorAll('nav .tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); render(); });
render();

/* ---------- helpers for markPaid (keep key stable) ---------- */
function storageKey(){
  const repo = (location.pathname.split('/')[1] || 'root').toLowerCase();
  return `ydb:${repo}:v3`;
}