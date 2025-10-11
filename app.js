/* YDB – v15.9.0 (LKG) */
const STORE_KEY = 'ydb:data:v15.9.0';
const VERSION = 'v15.9.0';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => (n<0?'-':'') + '$' + Math.abs(Number(n||0)).toFixed(2);

const state = load() || seed();
function seed(){
  return {
    version: VERSION,
    bank: 0,
    payday: 5, // Fri
    buckets: [], // {name, perWeek}
    bills: [],   // {name, amt, dueDay}
    ones: [],    // {name, amt, defer}
    debts: [],   // {name, minWeek}
    pay: { base: 0, otMult: 1.5, withheld: 0.2, reg: 40, ot: 0 },
    feedbackUrl: 'https://script.google.com/macros/s/AKfycbzXvydQk3zrQ_g2h8JTBQwzxVa5QJgeMxM9kGsBqE_nsXCKTSMR3LZI_K0CcmA0MFWC/exec'
  };
}
function load(){ try{ return JSON.parse(localStorage.getItem(STORE_KEY)); }catch{ return null; } }
function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

/* ---------- Tabs ---------- */
$('#tabbar').addEventListener('click', e=>{
  const btn = e.target.closest('.tab'); if(!btn) return;
  const page = btn.dataset.page;
  $$('.tab').forEach(t=>t.classList.toggle('active', t===btn));
  $$('.page').forEach(p=>p.classList.toggle('active', p.id===page));
  if(page==='home') renderHome();
});

/* ---------- Helpers ---------- */
function paydayRange(){
  const d = new Date();
  const now = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = now.getDay();
  // window: current calendar week ending the coming payday (simple & stable)
  const toPay = (state.payday - day + 7) % 7;
  const end = new Date(now); end.setDate(now.getDate()+toPay);
  const start = new Date(end); start.setDate(end.getDate()-6);
  return {start,end};
}
const md = d => d.toLocaleDateString(undefined,{month:'short', day:'2-digit'});

/* ---------- Render Home ---------- */
function renderHome(){
  const {start,end} = paydayRange();
  $('#home-range').textContent = `${md(start)}–${md(end)} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][state.payday]} payday)`;

  // income (LKG behavior): always include estimated net for display
  const gross = (state.pay.base*state.pay.reg) + (state.pay.base*state.pay.otMult*state.pay.ot);
  const net = gross * (1 - state.pay.withheld);
  const cash = Number(state.bank||0) + net;

  const dueRows = state.bills.map(b=>({
    ...b,
    date: new Date(new Date().getFullYear(), new Date().getMonth(), Math.min(31,Math.max(1, Number(b.dueDay))))
  })).filter(r => r.date >= start && r.date <= end);

  const onesNow = state.ones; // LKG: include all one-offs
  const bucketSum = state.buckets.reduce((s,b)=>s+Number(b.perWeek||0),0);
  const debtMin = state.debts.reduce((s,d)=>s+Number(d.minWeek||0),0);
  const billsSum = dueRows.reduce((s,b)=>s+Number(b.amt||0),0) + onesNow.reduce((s,o)=>s+Number(o.amt||0),0);
  const faf = 50; // fixed playful buffer
  const after = cash - (bucketSum + debtMin + billsSum) + faf;

  $('#cashThisWeek').textContent = fmt(cash);
  $('#cashBreakdown').textContent = `Bank: ${fmt(state.bank)} + Est. net paycheck: ${fmt(net)}`;
  $('#faf').textContent = fmt(faf);
  const AD = $('#afterDamage'); AD.textContent = fmt(after); AD.classList.toggle('neg', after<0); AD.classList.toggle('pos', after>=0);

  // table
  const tb = $('#dueTable tbody'); tb.innerHTML='';
  for(const r of dueRows){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${md(r.date)}</td><td>${esc(r.name)}<br><small class="muted">bill</small></td><td class="right">${fmt(r.amt)}</td><td><input type="checkbox"></td>`;
    tb.appendChild(tr);
  }
}

/* ---------- Forms ---------- */
function esc(s=''){return s.replace(/[&<>"]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]))}

$('#billAdd').onclick = () => {
  const name=$('#billName').value.trim();
  const amt=parseFloat($('#billAmt').value||'0');
  const due=parseInt($('#billDue').value||'1',10);
  if(!name || !(amt>0)) return;
  state.bills.push({name, amt, dueDay:due}); save();
  $('#billName').value=''; $('#billAmt').value=''; $('#billDue').value='';
  paintBills(); renderHome();
};
function paintBills(){
  const tb=$('#billTable tbody'); tb.innerHTML='';
  state.bills.forEach((b,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(b.name)}</td><td class="right">${fmt(b.amt)}</td><td>${b.dueDay}</td><td><button class="btn-secondary" data-del-b="${i}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.onclick = e=>{
    const btn=e.target.closest('[data-del-b]'); if(!btn) return;
    const i=+btn.dataset.delB; state.bills.splice(i,1); save(); paintBills(); renderHome();
  };
}

$('#oneAdd').onclick = () => {
  const name=$('#oneName').value.trim();
  const amt=parseFloat($('#oneAmt').value||'0');
  const defer=$('#oneDefer').checked;
  if(!name || !(amt>0)) return;
  state.ones.push({name, amt, defer}); save();
  $('#oneName').value=''; $('#oneAmt').value=''; $('#oneDefer').checked=true;
  paintOnes(); renderHome();
};
function paintOnes(){
  const tb=$('#oneTable tbody'); tb.innerHTML='';
  state.ones.forEach((o,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(o.name)}</td><td class="right">${fmt(o.amt)}</td><td>${o.defer?'Yes':'No'}</td><td><button class="btn-secondary" data-del-o="${i}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.onclick=e=>{
    const btn=e.target.closest('[data-del-o]'); if(!btn) return;
    const i=+btn.dataset.delO; state.ones.splice(i,1); save(); paintOnes(); renderHome();
  };
}

$('#bAdd').onclick = () => {
  const name=$('#bName').value.trim();
  const perWeek=parseFloat($('#bAmt').value||'0');
  if(!name || !(perWeek>0)) return;
  state.buckets.push({name, perWeek}); save();
  $('#bName').value=''; $('#bAmt').value='';
  paintBuckets(); renderHome();
};
function paintBuckets(){
  const tb=$('#bTable tbody'); tb.innerHTML='';
  state.buckets.forEach((b,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(b.name)}</td><td class="right">${fmt(b.perWeek)}</td><td><button class="btn-secondary" data-del-bu="${i}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.onclick=e=>{
    const btn=e.target.closest('[data-del-bu]'); if(!btn) return;
    const i=+btn.dataset.delBu; state.buckets.splice(i,1); save(); paintBuckets(); renderHome();
  };
}

$('#dAdd').onclick = () => {
  const name=$('#dName').value.trim();
  const minWeek=parseFloat($('#dMin').value||'0');
  if(!name || !(minWeek>0)) return;
  state.debts.push({name, minWeek}); save();
  $('#dName').value=''; $('#dMin').value='';
  paintDebts(); renderHome();
};
function paintDebts(){
  const tb=$('#dTable tbody'); tb.innerHTML='';
  state.debts.forEach((d,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(d.name)}</td><td class="right">${fmt(d.minWeek)}</td><td><button class="btn-secondary" data-del-d="${i}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.onclick=e=>{
    const btn=e.target.closest('[data-del-d]'); if(!btn) return;
    const i=+btn.dataset.delD; state.debts.splice(i,1); save(); paintDebts(); renderHome();
  };
}

/* Hours + Pay */
function calcHours(){
  const gross = (state.pay.base*state.pay.reg) + (state.pay.base*state.pay.otMult*state.pay.ot);
  const net = gross*(1-state.pay.withheld);
  $('#grossW').textContent = fmt(gross);
  $('#netW').textContent = fmt(net);
  $('#whPct').textContent = (state.pay.withheld*100).toFixed(1)+'%';
}
$('#saveHours').onclick = ()=>{
  state.pay.base=parseFloat($('#payBase').value||'0')||0;
  state.pay.otMult=parseFloat($('#otMult').value||'1.5')||1.5;
  state.pay.withheld=parseFloat($('#withheld').value||'0.2')||0.2;
  state.pay.reg=parseFloat($('#hrsReg').value||'40')||40;
  state.pay.ot=parseFloat($('#hrsOT').value||'0')||0;
  save(); calcHours(); renderHome();
};
$('#applyExample').onclick = ()=>{
  const g=parseFloat($('#grossExample').value||'0'); if(!(g>0)) return;
  const inferred = state.pay.withheld; // remain simple in LKG
  state.pay.withheld = Math.max(0, Math.min(0.6, inferred));
  save(); calcHours();
};

/* Settings */
$('#saveSettings').onclick = ()=>{
  state.bank=parseFloat($('#bankBal').value||'0')||0;
  state.payday=parseInt($('#payday').value,10);
  save(); renderHome();
};
$('#runWizard').onclick = openWizard;

/* Afford */
$('#affordAsk').onclick = ()=>{
  const amt = parseFloat($('#affordAmt').value||'0');
  if(!(amt>0)) return;
  const left = parseFloat($('#afterDamage').textContent.replace(/[$,]/g,'')) - amt;
  $('#affordResult').textContent = left>=0 ? 'Yeah, you’re good.' : "You're about to fuck around and find out.";
};

/* Feedback */
$('#fbSend').onclick = async ()=>{
  const type = $('#fbType').value;
  const msg  = $('#fbMsg').value.trim();
  const anon = $('#fbAnon').checked;
  const include = $('#fbMeta').checked;
  if(!msg){ $('#fbNote').textContent='Please add a message.'; return; }
  $('#fbNote').textContent='Sending…';
  try{
    const body = { type, message: msg, anon };
    if(include) body.meta = { version: VERSION, ua: navigator.userAgent };
    const res = await fetch(state.feedbackUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if(!res.ok) throw 0;
    $('#fbMsg').value=''; $('#fbNote').textContent='Sent — thanks!'; setTimeout(()=>$('#fbNote').textContent='', 2500);
  }catch(e){
    $('#fbNote').textContent='Could not send. Try again later.';
  }
};

/* Wizard (manual; open from Settings) */
function openWizard(){
  if($('.wizard-overlay')) return;
  const wrap=document.createElement('div');
  wrap.className='wizard-overlay';
  wrap.innerHTML=`
  <div class="wizard-card card">
    <div class="card-title">Let’s set you up</div>
    <label class="small muted">What’s in your account right now?</label>
    <input id="wizBank" inputmode="decimal" placeholder="0" />
    <small class="muted">Tip: You can enter negative if you’re overdrawn.</small>
    <label class="small muted" style="margin-top:12px">Payday weekday</label>
    <select id="wizDay">
      <option value="0">Sun</option><option value="1">Mon</option><option value="2">Tue</option>
      <option value="3">Wed</option><option value="4">Thu</option><option value="5" selected>Fri</option>
      <option value="6">Sat</option>
    </select>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn-secondary" id="wizCancel">Cancel</button>
      <button class="btn" id="wizSave">Save</button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  $('#wizCancel').onclick=()=>wrap.remove();
  $('#wizSave').onclick=()=>{
    state.bank=parseFloat($('#wizBank').value||'0')||0;
    state.payday=parseInt($('#wizDay').value,10);
    save(); renderHome(); wrap.remove();
  };
}

/* Mount defaults / paint */
function init(){
  $('#bankBal').value = state.bank;
  $('#payday').value = String(state.payday);
  $('#payBase').value = state.pay.base || '';
  $('#otMult').value = String(state.pay.otMult);
  $('#withheld').value = state.pay.withheld || '';
  $('#hrsReg').value = state.pay.reg || 40;
  $('#hrsOT').value = state.pay.ot || 0;

  paintBills(); paintOnes(); paintBuckets(); paintDebts();
  calcHours(); renderHome();
}
document.addEventListener('DOMContentLoaded', init);