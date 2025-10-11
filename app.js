/* YDB core – v15.9.1 – single-shell, single-wizard */

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const STORE_KEY = 'ydb:data:v2';
const VERSION = 'v15.9.1';

const state = load() || seed();

function seed(){
  return {
    version: VERSION,
    lastWizard: null,
    bank: 0,
    payday: 5, // 0=Sun
    buckets: [], // {name, perWeek}
    bills: [],   // {name, amt, dueDay}
    ones: [],    // {name, amt, defer}
    debts: [],   // {name, minWeek}
    pay: { base: 0, otMult: 1.5, withheld: 0.2, reg: 40, ot: 0 },
    feedbackUrl: 'https://script.google.com/macros/s/AKfycbzXvydQk3zrQ_g2h8JTBQwzxVa5QJgeMxM9kGsBqE_nsXCKTSMR3LZI_K0CcmA0MFWC/exec'
  };
}

function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function load(){
  try { return JSON.parse(localStorage.getItem(STORE_KEY)); }
  catch{ return null; }
}

/* ---------- Tabs ---------- */
function bindTabs(){
  $('#tabbar').addEventListener('click', (e)=>{
    const btn = e.target.closest('.tab');
    if(!btn) return;
    const page = btn.dataset.page;
    $$('.tab').forEach(t=>t.classList.toggle('active', t===btn));
    $$('.page').forEach(p=>p.classList.toggle('active', p.id===page));
    if(page==='home') renderHome();
  });
}

/* ---------- Money helpers ---------- */
const fmt = n => (n<0?'-':'') + '$' + Math.abs(n).toFixed(2);

/* Payday window (current week -> next payday) */
function currentWindow(){
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Find this week's payday
  const day = d.getDay();
  let daysToFri = (state.payday - day + 7) % 7;
  const paydayDate = new Date(d); paydayDate.setDate(d.getDate() + daysToFri);
  // Range is from last payday+1 to this payday, inclusive-ish for UI
  const start = new Date(paydayDate); start.setDate(paydayDate.getDate()-6);
  return { start, end: paydayDate };
}

function inWindow(d){
  const {start,end} = currentWindow();
  return d >= start && d <= end;
}

/* ---------- Render: Home ---------- */
function renderHome(){
  // header subrange
  const {start,end} = currentWindow();
  const opts = { month:'short', day:'2-digit' };
  $('#home-range').textContent = `${start.toLocaleDateString(undefined,opts)}–${end.toLocaleDateString(undefined,opts)} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][state.payday]} payday)`;

  // income this week: ONLY include paycheck on payday (not before)
  let income = 0;
  const today = new Date().getDay();
  if(today === state.payday){
    const gross = state.pay.base*state.pay.reg + (state.pay.base*state.pay.otMult*state.pay.ot);
    const net = gross * (1 - state.pay.withheld);
    income += net;
  }
  const bank = Number(state.bank)||0;

  // must-pays due within window
  const due = state.bills
    .map(b => ({...b, date: dayThisMonth(b.dueDay)}))
    .filter(row => inWindow(row.date));

  // catch-ups deferred logic: include only if not deferred or we still have slack
  const onesDue = state.ones.filter(o => !o.defer || today === state.payday);

  const mustTotal = due.reduce((s,b)=>s+Number(b.amt||0),0)
                    + onesDue.reduce((s,o)=>s+Number(o.amt||0),0)
                    + state.debts.reduce((s,d)=>s+Number(d.minWeek||0),0)
                    + state.buckets.reduce((s,b)=>s+Number(b.perWeek||0),0); // buckets weekly

  const faf = 50;
  const cash = bank + income;
  const after = cash - mustTotal + faf;

  $('#cashThisWeek').textContent = fmt(cash);
  $('#cashBreakdown').textContent = `Bank: ${fmt(bank)}${today===state.payday ? ` + Est. paycheck: ${fmt(income)}` : ''}`;
  $('#faf').textContent = fmt(faf);
  const afterEl = $('#afterDamage');
  afterEl.textContent = fmt(after);
  afterEl.classList.toggle('pos', after>=0);
  afterEl.classList.toggle('neg', after<0);

  // due table
  const tb = $('#dueTable tbody');
  tb.innerHTML = '';
  for(const b of due){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${md(b.date)}</td><td>${escapeHtml(b.name)}<br><small class="muted">bill</small></td><td class="right">${fmt(Number(b.amt||0))}</td><td><input type="checkbox" data-paid="${b.name}"></td>`;
    tb.appendChild(tr);
  }
}

function md(d){
  return d.toLocaleDateString(undefined,{month:'short', day:'2-digit'});
}
function dayThisMonth(day){
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), Math.min(Math.max(1, Number(day)),31));
}
function escapeHtml(s=''){ return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

/* ---------- Donate / Feedback / Forms ---------- */
function bindForms(){
  // Bills
  $('#billAdd').addEventListener('click', ()=>{
    const name = $('#billName').value.trim();
    const amt  = parseFloat($('#billAmt').value||'0');
    const due  = parseInt($('#billDue').value||'1',10);
    if(!name || !(amt>0)) return;
    state.bills.push({name, amt, dueDay: due});
    save(); paintBillTable();
    $('#billName').value=''; $('#billAmt').value=''; $('#billDue').value='';
    renderHome();
  });
  // Catch-ups
  $('#oneAdd').addEventListener('click', ()=>{
    const name=$('#oneName').value.trim();
    const amt=parseFloat($('#oneAmt').value||'0');
    const defer=$('#oneDefer').checked;
    if(!name || !(amt>0)) return;
    state.ones.push({name, amt, defer});
    save(); paintOneTable();
    $('#oneName').value=''; $('#oneAmt').value=''; $('#oneDefer').checked=true;
    renderHome();
  });
  // Buckets
  $('#bAdd').addEventListener('click', ()=>{
    const name=$('#bName').value.trim();
    const perWeek=parseFloat($('#bAmt').value||'0');
    if(!name || !(perWeek>0)) return;
    state.buckets.push({name, perWeek});
    save(); paintBucketTable(); renderHome();
    $('#bName').value=''; $('#bAmt').value='';
  });
  // Debts
  $('#dAdd').addEventListener('click', ()=>{
    const name=$('#dName').value.trim();
    const minWeek=parseFloat($('#dMin').value||'0');
    if(!name || !(minWeek>0)) return;
    state.debts.push({name, minWeek});
    save(); paintDebtTable(); renderHome();
    $('#dName').value=''; $('#dMin').value='';
  });

  // Hours
  $('#saveHours').addEventListener('click', ()=>{
    state.pay.base = parseFloat($('#payBase').value||'0')||0;
    state.pay.otMult = parseFloat($('#otMult').value||'1.5')||1.5;
    state.pay.withheld = parseFloat($('#withheld').value||'0.2')||0.2;
    state.pay.reg = parseFloat($('#hrsReg').value||'40')||40;
    state.pay.ot = parseFloat($('#hrsOT').value||'0')||0;
    save(); calcHours(); renderHome();
  });
  $('#applyExample').addEventListener('click', ()=>{
    const gross = parseFloat($('#grossExample').value||'0');
    if(!(gross>0)) return;
    const net = gross * (1 - state.pay.withheld);
    if(net<=0) return;
    const inferred = 1 - (net/gross);
    state.pay.withheld = Math.max(0, Math.min(0.6, inferred));
    save(); calcHours();
  });

  // Settings
  $('#saveSettings').addEventListener('click', ()=>{
    state.bank = parseFloat($('#bankBal').value||'0')||0;
    state.payday = parseInt($('#payday').value,10);
    save(); renderHome();
  });

  // Afford
  $('#affordAsk').addEventListener('click', ()=>{
    const amt = parseFloat($('#affordAmt').value||'0');
    if(!(amt>0)) return;
    const msg = (Number($('#afterDamage').textContent.replace(/[$,]/g,'')) - amt) >= 0
      ? "Yeah, you’re good."
      : "You're about to fuck around and find out.";
    $('#affordResult').textContent = msg;
  });

  // Feedback
  $('#fbSend').addEventListener('click', async ()=>{
    const type = $('#fbType').value;
    const msg = $('#fbMsg').value.trim();
    const anon = $('#fbAnon').checked;
    const include = $('#fbMeta').checked;
    if(!msg) return;
    let payload = { type, message: msg };
    if(include) payload.meta = { version: VERSION, ua: navigator.userAgent };
    if(anon) payload.anon = true;
    $('#fbNote').textContent = 'Sending…';
    try{
      const res = await fetch(state.feedbackUrl, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error('bad');
      $('#fbMsg').value = '';
      $('#fbNote').textContent = 'Sent — thanks!';
      setTimeout(()=>$('#fbNote').textContent='', 2500);
    }catch(_){
      $('#fbNote').textContent = 'Could not send. Try again later.';
    }
  });
}

/* Paint tables */
function paintBillTable(){
  const tb = $('#billTable tbody'); tb.innerHTML='';
  state.bills.forEach((b,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${escapeHtml(b.name)}</td><td class="right">${fmt(b.amt)}</td><td>${b.dueDay}</td><td><button class="btn-secondary" data-del-b="${i}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.addEventListener('click', (e)=>{
    const btn=e.target.closest('[data-del-b]');
    if(!btn) return;
    const i=parseInt(btn.dataset.delB,10);
    state.bills.splice(i,1); save(); paintBillTable(); renderHome();
  }, {once:false});
}
function paintOneTable(){
  const tb=$('#oneTable tbody'); tb.innerHTML='';
  state.ones.forEach((o,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${escapeHtml(o.name)}</td><td class="right">${fmt(o.amt)}</td><td>${o.defer?'Yes':'No'}</td><td><button class="btn-secondary" data-del-o="${i}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-del-o]');
    if(!btn) return;
    const i=parseInt(btn.dataset.delO,10);
    state.ones.splice(i,1); save(); paintOneTable(); renderHome();
  },{once:false});
}
function paintBucketTable(){
  const tb=$('#bTable tbody'); tb.innerHTML='';
  state.buckets.forEach((b,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${escapeHtml(b.name)}</td><td class="right">${fmt(b.perWeek)}</td><td><button class="btn-secondary" data-del-bu="${i}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-del-bu]');
    if(!btn) return;
    const i=parseInt(btn.dataset.delBu,10);
    state.buckets.splice(i,1); save(); paintBucketTable(); renderHome();
  },{once:false});
}
function paintDebtTable(){
  const tb=$('#dTable tbody'); tb.innerHTML='';
  state.debts.forEach((d,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${escapeHtml(d.name)}</td><td class="right">${fmt(d.minWeek)}</td><td><button class="btn-secondary" data-del-d="${i}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-del-d]');
    if(!btn) return;
    const i=parseInt(btn.dataset.delD,10);
    state.debts.splice(i,1); save(); paintDebtTable(); renderHome();
  },{once:false});
}

/* Hours calc */
function calcHours(){
  const gross = state.pay.base*state.pay.reg + (state.pay.base*state.pay.otMult*state.pay.ot);
  const net = gross * (1 - state.pay.withheld);
  $('#grossW').textContent = fmt(gross);
  $('#netW').textContent = fmt(net);
  $('#whPct').textContent = (state.pay.withheld*100).toFixed(1)+'%';
}

/* ---------- Wizard (single) ---------- */
function ensureWizardOnce(){
  if($('.wizard-overlay')) return; // already present
  if(state.lastWizard) return; // already finished once

  const wrap = document.createElement('div');
  wrap.className = 'wizard-overlay';
  wrap.innerHTML = `
    <div class="wizard-box wiz">
      <div class="card-title" style="margin-top:-6px">Let’s set you up</div>

      <label class="small muted" style="margin-top:6px">What’s in your account right now?</label>
      <input id="wizBank" inputmode="decimal" placeholder="0" />
      <small class="muted">Tip: You can enter negative if you’re overdrawn.</small>

      <label class="small muted" style="margin-top:12px">Payday weekday</label>
      <select id="wizDay">
        <option value="0">Sun</option><option value="1">Mon</option>
        <option value="2">Tue</option><option value="3">Wed</option>
        <option value="4">Thu</option><option value="5" selected>Fri</option>
        <option value="6">Sat</option>
      </select>

      <div style="margin-top:14px; display:flex; gap:8px; justify-content:flex-end">
        <button class="btn-secondary" id="wizSkip">Skip</button>
        <button class="btn" id="wizNext">Save & Next</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  $('#wizSkip').onclick = ()=> { state.lastWizard = Date.now(); save(); wrap.remove(); };
  $('#wizNext').onclick = ()=>{
    state.bank = parseFloat($('#wizBank').value||'0')||0;
    state.payday = parseInt($('#wizDay').value,10);
    state.lastWizard = Date.now();
    save(); renderHome(); wrap.remove();
  };
}

/* ---------- Init ---------- */
function init(){
  bindTabs();
  bindForms();
  paintBillTable(); paintOneTable(); paintBucketTable(); paintDebtTable();
  calcHours(); renderHome();
  ensureWizardOnce();
  // settings form defaults
  $('#bankBal').value = state.bank;
  $('#payday').value = String(state.payday);
  $('#payBase').value = state.pay.base || '';
  $('#otMult').value = String(state.pay.otMult);
  $('#withheld').value = state.pay.withheld || '';
  $('#hrsReg').value = state.pay.reg || 40;
  $('#hrsOT').value = state.pay.ot || 0;
}
document.addEventListener('DOMContentLoaded', init);