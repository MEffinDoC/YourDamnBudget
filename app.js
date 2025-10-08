// Your Damn Budget v15.8.5 — optimistic feedback send (no scary error)
console.info('YDB app.js', '15.8.5');

const app = document.getElementById('app');
const TABS = document.querySelector('nav.tabs');

// ---------- State ----------
const storeKey = 'ydb:v3';
let S = JSON.parse(localStorage.getItem(storeKey) || '{}');
S.ui ??= { onboarded:false, lang:'en' };
S.user ??= { paydayWeekday:5, faFundsPerWeek:50, bankBalance:0 };
S.pay  ??= { baseHourly:20, withholding:0.2, otMultiplier:1.5 };
S.hours??= { regular:40, ot:0 };
S.bills??= [];      // {id,name,amount,dueDay}
S.loans??= [];      // {id,name,minimumPayment,dueDay}
S.events??= [];     // {id,name,amount,dateISO}
S.envelopes??= [];  // {id,name,weeklyTarget}
S.paid??= [];       // {kind,id,dateISO}
function save(){ localStorage.setItem(storeKey, JSON.stringify(S)); }
save();

// ---------- Utils ----------
const money = n => (isNaN(+n)?0:+n).toLocaleString(undefined,{style:'currency',currency:'USD'});
const iso = d => new Date(d).toISOString().slice(0,10);
function boundsOfPayPeriod(dt=new Date(), paydayDow=(S.user.paydayWeekday??5)){
  const d=new Date(dt); const day=d.getDay();
  const diff=(day<=paydayDow?paydayDow-day:7-(day-paydayDow));
  const end=new Date(d); end.setDate(d.getDate()+diff); end.setHours(0,0,0,0);
  const start=new Date(end); start.setDate(end.getDate()-7);
  return {start,end};
}
function uid(){ return Math.random().toString(36).slice(2,9); }
function toast(txt,ok=true){ const t=document.createElement('div'); Object.assign(t.style,{position:'fixed',left:'50%',bottom:'20px',transform:'translateX(-50%)',background:ok?'#0ea5a8':'#ef4444',color:ok?'#012a2c':'#fff',padding:'10px 14px',borderRadius:'10px',zIndex:100,fontWeight:'700'}); t.textContent=txt; document.body.appendChild(t); setTimeout(()=>t.remove(),2000); }
function section(h,b=''){ const s=document.createElement('section'); s.className='card'; s.innerHTML=(h?`<h2>${h}</h2>`:'')+b; return s; }
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));}
function weeklyNet(){
  const base=(+S.hours.regular||0)*(+S.pay.baseHourly||0);
  const ot  =(+S.hours.ot||0)*(+S.pay.baseHourly||0)*(+S.pay.otMultiplier||1.5);
  const gross=base+ot, net=gross*(1-(+S.pay.withholding||0));
  return {gross,net};
}

// ---------- HOME ----------
function renderHome(){
  const {start,end}=boundsOfPayPeriod(new Date(), S.user.paydayWeekday);
  const net=weeklyNet().net;
  const cashThisWeek = (+S.user.bankBalance||0) + net;

  const items=[];
  const paidKey=p=>`${p.kind}:${p.id}:${p.dateISO}`;
  const paidSet=new Set(S.paid.map(p=>paidKey(p)));

  (S.bills||[]).forEach(b=>{
    for(let m=0;m<2;m++){
      const d=new Date(start.getFullYear(),start.getMonth()+m,b.dueDay);
      if(d>=start && d<end){
        const it={kind:'bill',id:b.id,name:b.name,dateISO:iso(d),amount:+b.amount};
        if(!paidSet.has(paidKey(it))) items.push(it);
      }
    }
  });
  (S.loans||[]).forEach(l=>{
    for(let m=0;m<2;m++){
      const d=new Date(start.getFullYear(),start.getMonth()+m,l.dueDay);
      if(d>=start && d<end){
        const it={kind:'loan',id:l.id,name:l.name,dateISO:iso(d),amount:+l.minimumPayment};
        if(!paidSet.has(paidKey(it))) items.push(it);
      }
    }
  });
  (S.events||[]).forEach(e=>{
    const d=new Date(e.dateISO);
    if(d>=start && d<end){
      const it={kind:'event',id:e.id,name:e.name,dateISO:iso(d),amount:+e.amount};
      if(!paidSet.has(paidKey(it))) items.push(it);
    }
  });

  items.sort((a,b)=>a.dateISO.localeCompare(b.dateISO)||a.name.localeCompare(b.name));

  const vars=(S.envelopes||[]).reduce((s,e)=>s+(+e.weeklyTarget||0),0);
  const faf=+S.user.faFundsPerWeek||0;
  const after = cashThisWeek - vars - faf - items.reduce((s,x)=>s+(+x.amount||0),0);

  const k=section('Weekly Damage Report', `
    <div class="grid cols-3">
      <div><div class="kpi-label">Cash This Week</div><div class="kpi-value">${money(cashThisWeek)}</div>
        <div class="help">Bank: ${money(S.user.bankBalance||0)} + Est. net paycheck: ${money(net)}</div>
      </div>
      <div><div class="kpi-label">Fuck Around Funds</div><div class="kpi-value">${money(faf)}</div><div class="help">Edit in Settings</div></div>
      <div><div class="kpi-label">After Damage</div><div class="kpi-value ${after<0?'negative':'positive'}">${money(after)}</div>
        <div class="help">After must-pays + buckets + FAF</div>
      </div>
    </div>
  `);
  app.appendChild(k);

  const rows = items.map(it=>`
    <tr>
      <td>${it.dateISO}</td>
      <td>${escapeHtml(it.name)} <span class="badge">${it.kind}</span></td>
      <td>${money(it.amount)}</td>
      <td><button class="button paid-btn"
            data-kind="${it.kind}" data-id="${it.id}" data-date="${it.dateISO}">Paid ✔</button></td>
    </tr>`).join('');

  const up=section('Due this pay period', `
    <div class="table-scroll"><table>
      <thead><tr><th>Date</th><th>What</th><th>$</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="help">Nothing else due before ${iso(end)}.</td></tr>`}</tbody>
    </table></div>
  `);
  app.appendChild(up);

  up.querySelectorAll('.paid-btn').forEach(b=>{
    b.onclick=()=>{
      const it={kind:b.dataset.kind,id:b.dataset.id,dateISO:b.dataset.date};
      S.paid.push(it); save(); render();
    };
  });

  const afford=section('Can I afford this?', `
    <div class="grid cols-3">
      <div><label>Amount</label><input id="aff_amt" type="number" step="0.01" placeholder="e.g., 49.99"></div>
      <div><label>Date</label><input id="aff_date" type="date" value="${iso(new Date())}"></div>
      <div class="row"><button id="aff_go" class="button primary">Ask my damn budget</button></div>
    </div><div id="aff_msg" class="help" style="margin-top:6px"></div>
  `);
  app.appendChild(afford);
  afford.querySelector('#aff_go').onclick=()=>{
    const amt=+afford.querySelector('#aff_amt').value||0;
    const msg=afford.querySelector('#aff_msg'); if(!amt){msg.textContent='Enter a real amount.';return;}
    const left = after;
    msg.textContent = (left-amt>=0) ? `Yep. You’ll have ${money(left-amt)} left.` : `Careful — you’re about to fuck around and find out (${money(left-amt)}).`;
  };
}

// ---------- PLANNER ----------
function renderPlanner(){
  const weeks=12, arr=[]; const wk=weeklyNet().net;
  for(let i=0;i<weeks;i++){ arr.push({week:i+1, income:wk, buckets:(S.envelopes||[]).reduce((s,e)=>s+(+e.weeklyTarget||0),0), faf:S.user.faFundsPerWeek||0}); }
  const totalIncome=arr.reduce((s,x)=>s+x.income,0);
  const totalOut=arr.reduce((s,x)=>s+x.buckets+x.faf,0);
  const c=section('12-week snapshot',`
    <div class="grid cols-3">
      <div><div class="kpi-label">Est. Income</div><div class="kpi-value">${money(totalIncome)}</div></div>
      <div><div class="kpi-label">Buckets + FAF</div><div class="kpi-value">${money(totalOut)}</div></div>
      <div><div class="kpi-label">Projected Left</div><div class="kpi-value ${totalIncome-totalOut<0?'negative':'positive'}">${money(totalIncome-totalOut)}</div></div>
    </div>
  `);
  app.appendChild(c);
}

// ---------- TIMESHEET ----------
function renderTimesheet(){
  const est=weeklyNet();
  const s=section('Hours & Paycheck', `
    <div class="grid cols-3">
      <div><label>Base hourly</label><input id="pay_base" type="number" step="0.01" value="${S.pay.baseHourly}"></div>
      <div><label>OT multiplier</label>
        <select id="pay_ot">
          <option value="1.5" ${S.pay.otMultiplier==1.5?'selected':''}>1.5× (standard)</option>
          <option value="2" ${S.pay.otMultiplier==2?'selected':''}>2× (double time)</option>
          <option value="2.5" ${S.pay.otMultiplier==2.5?'selected':''}>2.5×</option>
        </select>
      </div>
      <div><label>Withholding (auto or manual)</label><input id="pay_with" type="number" step="0.001" value="${S.pay.withholding}"></div>
    </div>
    <div class="grid cols-3">
      <div><label>Regular hours</label><input id="h_reg" type="number" step="0.1" value="${S.hours.regular}"></div>
      <div><label>OT hours</label><input id="h_ot" type="number" step="0.1" value="${S.hours.ot}"></div>
      <div class="row"><button id="h_save" class="button primary">Save hours</button></div>
    </div>

    <div class="grid cols-3" style="margin-top:8px">
      <div><div class="kpi-label">Est. Gross / week</div><div class="kpi-value">${money(est.gross)}</div></div>
      <div><div class="kpi-label">Est. Net / week</div><div class="kpi-value">${money(est.net)}</div></div>
      <div><div class="kpi-label">Withholding</div><div class="kpi-value">${(S.pay.withholding*100).toFixed(1)}%</div></div>
    </div>

    <div class="grid cols-3" style="margin-top:8px">
      <div><label>Example pay (gross)</label><input id="ex_gross" type="number" step="0.01" placeholder="e.g., 1280.00"></div>
      <div><label>Example pay (net)</label><input id="ex_net" type="number" step="0.01" placeholder="e.g., 1024.00"></div>
      <div class="row"><button id="ex_apply" class="button">Apply as withholding</button></div>
    </div>
    <div class="help">We’ll compute withholding = 1 - net/gross.</div>
  `);
  app.appendChild(s);

  s.querySelector('#h_save').onclick=()=>{
    S.pay.baseHourly=+s.querySelector('#pay_base').value||0;
    S.pay.otMultiplier=+s.querySelector('#pay_ot').value||1.5;
    S.pay.withholding=Math.max(0,Math.min(0.6,+s.querySelector('#pay_with').value||0));
    S.hours.regular=+s.querySelector('#h_reg').value||0;
    S.hours.ot=+s.querySelector('#h_ot').value||0;
    save(); toast('Saved.'); render();
  };
  s.querySelector('#ex_apply').onclick=()=>{
    const g=+s.querySelector('#ex_gross').value||0;
    const n=+s.querySelector('#ex_net').value||0;
    if(g<=0||n<=0||n>g){toast('Enter a real paycheck pair.',false);return;}
    S.pay.withholding = Math.max(0, Math.min(0.6, 1 - (n/g)));
    save(); toast('Withholding updated.'); render();
  };
}

// ---------- BILLS ----------
function renderBills(){
  const wrap=section('Shit That Must Get Paid',`
    <div class="grid cols-3">
      <div><label>Name</label><input id="b_name" placeholder="Rent"></div>
      <div><label>Amount</label><input id="b_amt" type="number" step="0.01" placeholder="1200.00"></div>
      <div><label>Due day (1–31)</label><input id="b_day" type="number" min="1" max="31" value="1"></div>
    </div>
    <div class="row" style="margin-top:8px"><button id="b_add" class="button primary">Add bill</button></div>
    <div class="table-scroll" style="margin-top:8px"><table>
      <thead><tr><th>Name</th><th>$</th><th>Due day</th><th></th></tr></thead>
      <tbody id="b_body"></tbody>
    </table></div>
  `);
  app.appendChild(wrap);
  const tbody=wrap.querySelector('#b_body');
  function draw(){ tbody.innerHTML=(S.bills||[]).map(b=>`<tr>
    <td>${escapeHtml(b.name)}</td><td>${money(b.amount)}</td><td>${b.dueDay}</td>
    <td><button data-del="${b.id}" class="button">Delete</button></td>
  </tr>`).join('') || `<tr><td colspan="4" class="help">No bills yet.</td></tr>`; }
  draw();
  wrap.onclick=e=>{
    if(e.target.dataset.del){ S.bills=S.bills.filter(x=>x.id!==e.target.dataset.del); save(); draw(); }
  };
  wrap.querySelector('#b_add').onclick=()=>{
    const name=wrap.querySelector('#b_name').value.trim(); const amt=+wrap.querySelector('#b_amt').value||0; const day=+wrap.querySelector('#b_day').value||1;
    if(!name||amt<=0) return toast('Enter name + amount',false);
    S.bills.push({id:uid(),name,amount:amt,dueDay:day}); save(); draw();
    wrap.querySelector('#b_name').value=''; wrap.querySelector('#b_amt').value='';
  };
}

// ---------- EVENTS ----------
function renderEvents(){
  const wrap=section('Catch-Up Shit',`
    <div class="grid cols-3">
      <div><label>Name</label><input id="e_name" placeholder="Last month electric"></div>
      <div><label>Amount</label><input id="e_amt" type="number" step="0.01"></div>
      <div><label>Date</label><input id="e_date" type="date" value="${iso(new Date())}"></div>
    </div>
    <div class="row" style="margin-top:8px"><button id="e_add" class="button primary">Add</button></div>
    <div class="table-scroll" style="margin-top:8px"><table>
      <thead><tr><th>Date</th><th>What</th><th>$</th><th></th></tr></thead>
      <tbody id="e_body"></tbody>
    </table></div>
  `);
  app.appendChild(wrap);
  const tbody=wrap.querySelector('#e_body');
  function draw(){ tbody.innerHTML=(S.events||[]).sort((a,b)=>a.dateISO.localeCompare(b.dateISO)).map(x=>`<tr>
    <td>${x.dateISO}</td><td>${escapeHtml(x.name)}</td><td>${money(x.amount)}</td>
    <td><button class="button" data-del="${x.id}">Delete</button></td>
  </tr>`).join('') || `<tr><td colspan="4" class="help">No one-offs right now.</td></tr>`; }
  draw();
  wrap.onclick=e=>{ if(e.target.dataset.del){ S.events=S.events.filter(x=>x.id!==e.target.dataset.del); save(); draw(); } };
  wrap.querySelector('#e_add').onclick=()=>{
    const name=wrap.querySelector('#e_name').value.trim(); const amount=+wrap.querySelector('#e_amt').value||0; const dateISO=wrap.querySelector('#e_date').value;
    if(!name||amount<=0) return toast('Enter name + amount',false);
    S.events.push({id:uid(),name,amount,dateISO}); save(); draw();
    wrap.querySelector('#e_name').value=''; wrap.querySelector('#e_amt').value='';
  };
}

// ---------- ENVELOPES ----------
function renderEnvelopes(){
  const wrap=section('Where It Goes (weekly buckets)',`
    <div class="grid cols-3">
      <div><label>Name</label><input id="env_name" placeholder="Groceries"></div>
      <div><label>Weekly target</label><input id="env_amt" type="number" step="0.01" placeholder="125"></div>
      <div class="row"><button id="env_add" class="button primary">Add bucket</button></div>
    </div>
    <div class="table-scroll" style="margin-top:8px"><table>
      <thead><tr><th>Bucket</th><th>Weekly $</th><th></th></tr></thead>
      <tbody id="env_body"></tbody>
      <tfoot><tr><th>Total</th><th id="env_total"></th><th></th></tr></tfoot>
    </table></div>
  `);
  app.appendChild(wrap);
  const tbody=wrap.querySelector('#env_body'), total=wrap.querySelector('#env_total');
  function draw(){ tbody.innerHTML=(S.envelopes||[]).map(x=>`<tr>
    <td>${escapeHtml(x.name)}</td><td>${money(x.weeklyTarget)}</td><td><button class="button" data-del="${x.id}">Delete</button></td>
  </tr>`).join('') || `<tr><td colspan="3" class="help">Add your weekly buckets.</td></tr>`;
    total.textContent = money((S.envelopes||[]).reduce((s,x)=>s+(+x.weeklyTarget||0),0));
  }
  draw();
  wrap.onclick=e=>{ if(e.target.dataset.del){ S.envelopes=S.envelopes.filter(x=>x.id!==e.target.dataset.del); save(); draw(); } };
  wrap.querySelector('#env_add').onclick=()=>{
    const name=wrap.querySelector('#env_name').value.trim(); const amt=+wrap.querySelector('#env_amt').value||0;
    if(!name||amt<=0) return toast('Enter name + amount',false);
    S.envelopes.push({id:uid(),name,weeklyTarget:amt}); save(); draw(); wrap.querySelector('#env_name').value=''; wrap.querySelector('#env_amt').value='';
  };
}

// ---------- LOANS ----------
function renderLoans(){
  const wrap=section('Your Damn Debts',`
    <div class="grid cols-3">
      <div><label>Name</label><input id="l_name" placeholder="Car loan"></div>
      <div><label>Min payment</label><input id="l_amt" type="number" step="0.01"></div>
      <div><label>Due day (1–31)</label><input id="l_day" type="number" min="1" max="31" value="15"></div>
    </div>
    <div class="row" style="margin-top:8px"><button id="l_add" class="button primary">Add loan</button></div>
    <div class="table-scroll" style="margin-top:8px"><table>
      <thead><tr><th>Loan</th><th>Min $</th><th>Due day</th><th></th></tr></thead>
      <tbody id="l_body"></tbody>
    </table></div>
  `);
  app.appendChild(wrap);
  const tbody=wrap.querySelector('#l_body');
  function draw(){ tbody.innerHTML=(S.loans||[]).map(l=>`<tr>
    <td>${escapeHtml(l.name)}</td><td>${money(l.minimumPayment)}</td><td>${l.dueDay}</td>
    <td><button class="button" data-del="${l.id}">Delete</button></td>
  </tr>`).join('') || `<tr><td colspan="4" class="help">No debts logged yet.</td></tr>`; }
  draw();
  wrap.onclick=e=>{ if(e.target.dataset.del){ S.loans=S.loans.filter(x=>x.id!==e.target.dataset.del); save(); draw(); } };
  wrap.querySelector('#l_add').onclick=()=>{
    const name=wrap.querySelector('#l_name').value.trim(); const amt=+wrap.querySelector('#l_amt').value||0; const day=+wrap.querySelector('#l_day').value||1;
    if(!name||amt<=0) return toast('Enter name + amount',false);
    S.loans.push({id:uid(),name,minimumPayment:amt,dueDay:day}); save(); draw(); wrap.querySelector('#l_name').value=''; wrap.querySelector('#l_amt').value='';
  };
}

// ---------- DONATE ----------
function renderDonate(){
  app.appendChild(section('Donate (optional)',`
    <div class="grid cols-2">
      <a class="button primary" href="https://paypal.me/mdsdoc" target="_blank" rel="noopener">PayPal</a>
      <a class="button" style="background:#00d64f;color:black" href="https://cash.app/$mdsdoc" target="_blank" rel="noopener">Cash App</a>
    </div>
    <div class="help" style="margin-top:8px">Donations are appreciated, but they never unlock features and aren’t required.</div>
  `));
}

// ---------- FEEDBACK (optimistic) ----------
function renderFeedback(){
  const FEEDBACK_ENDPOINT = "https://script.google.com/macros/s/AKfycbzXvydQk3zrQ_g2h8JTBQwzxVa5QJgeMxM9kGsBqE_nsXCKTSMR3LZI_K0CcmA0MFWC/exec";
  const ver='15.8.5';
  const s=section('Feedback',`
    <div class="feedback">
      <label>Type</label>
      <select id="fb_type"><option>Idea</option><option>Bug</option><option>Praise</option><option>Question</option></select>
      <label>Message</label>
      <textarea id="fb_msg" placeholder="Tell us what rules, what sucks, or what broke…"></textarea>
      <label class="row"><input id="fb_include" type="checkbox" checked>Include app version and device info</label>
      <label class="row"><input id="fb_anon" type="checkbox">Send anonymously (ignore name/email)</label>
      <button id="fb_send" class="button primary">Send Feedback</button>
      <button id="fb_copy" class="button" style="margin-top:6px">Copy to clipboard</button>
    </div>
  `);
  app.appendChild(s);

  let sending=false;
  s.querySelector('#fb_send').onclick=async()=>{
    if(sending) return;
    const type=s.querySelector('#fb_type').value;
    const msg =s.querySelector('#fb_msg').value.trim();
    const anon=s.querySelector('#fb_anon').checked;
    const include=s.querySelector('#fb_include').checked && !anon;
    if(!msg){toast('Say at least one sentence.',false);return;}

    const meta = include ? `\n---\nApp: YDB v${ver}\nUA: ${navigator.userAgent}` : `\n---\nApp: YDB v${ver}`;
    const payloadObj = {type,msg,name: anon?'-':'-', email: anon?'-':'-', meta};
    const blob = new Blob([JSON.stringify(payloadObj)], {type:'text/plain'});

    sending=true;
    // Show success immediately (optimistic), then fire and forget
    toast('Thanks for speaking your damn mind 💬');
    try{
      if (navigator.sendBeacon) {
        navigator.sendBeacon(FEEDBACK_ENDPOINT, blob);
      } else {
        fetch(FEEDBACK_ENDPOINT,{ method:'POST', mode:'no-cors', body: blob, keepalive:true }).catch(()=>{});
      }
    }finally{ sending=false; }
  };

  s.querySelector('#fb_copy').onclick=async()=>{
    const type=s.querySelector('#fb_type').value;
    const msg =s.querySelector('#fb_msg').value.trim();
    const meta=`\n---\nApp: YDB v${ver}`;
    try{ await navigator.clipboard.writeText(`${type}\n\n${msg}${meta}`); toast('Copied.'); }catch{ toast('Copy failed — long-press to select.',false); }
  };
}

// ---------- SETTINGS ----------
function renderSettings(){
  const s=section('Settings',`
    <div class="grid cols-3">
      <div><label>Current bank balance</label><input id="st_bank" type="number" step="0.01" value="${S.user.bankBalance}"></div>
      <div><label>Payday weekday</label>
        <select id="st_dow">
          ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>`<option value="${i}" ${i==S.user.paydayWeekday?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div><label>Fuck Around Funds (weekly)</label><input id="st_faf" type="number" step="0.01" value="${S.user.faFundsPerWeek}"></div>
    </div>
    <div class="row" style="margin-top:8px"><button id="st_save" class="button primary">Save</button></div>

    <h3 style="margin-top:14px">Backup</h3>
    <div class="grid cols-3">
      <button id="st_export" class="button">Export data</button>
      <input id="st_file" type="file" accept="application/json">
      <button id="st_reset" class="button" style="border-color:#663;border-width:1px">Factory reset</button>
    </div>
  `);
  app.appendChild(s);
  s.querySelector('#st_save').onclick=()=>{
    S.user.bankBalance=+s.querySelector('#st_bank').value||0;
    S.user.paydayWeekday=+s.querySelector('#st_dow').value||5;
    S.user.faFundsPerWeek=+s.querySelector('#st_faf').value||0;
    save(); toast('Saved.'); render();
  };
  s.querySelector('#st_export').onclick=()=>{
    const a=document.createElement('a');
    a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(S,null,2));
    a.download='ydb-backup-'+iso(new Date())+'.json'; a.click();
  };
  s.querySelector('#st_file').onchange=e=>{
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>{ try{ S=JSON.parse(String(r.result)); save(); toast('Imported.'); render(); }catch{ toast('Bad file',false); } }; r.readAsText(f);
  };
  s.querySelector('#st_reset').onclick=()=>{
    if(confirm('This will wipe local data. Continue?')){ localStorage.removeItem(storeKey); location.reload(); }
  };
}

// ---------- Router ----------
function safeCall(name,fn){
  try{ if(typeof fn!=='function'){ app.appendChild(section('Oops',`<div class="help">View <b>${name}</b> is missing.</div>`)); return; } fn(); }
  catch(err){ app.appendChild(section('Something broke', `<pre style="white-space:pre-wrap">${err?.message||err}</pre>`)); console.error('view error',name,err); }
}
function render(){
  app.innerHTML='';
  const v=document.querySelector('nav .tab.active')?.dataset.view||'home';
  const map={home:renderHome,planner:renderPlanner,timesheet:renderTimesheet,bills:renderBills,events:renderEvents,envelopes:renderEnvelopes,loans:renderLoans,donate:renderDonate,feedback:renderFeedback,settings:renderSettings};
  safeCall(v,map[v]);
}
render();
TABS.addEventListener('click',e=>{
  const b=e.target.closest('.tab'); if(!b) return;
  document.querySelectorAll('nav .tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); render();
});