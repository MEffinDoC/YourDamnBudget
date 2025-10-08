// YDB app.js v15.3 — Donate styling fix + Feedback page
import { computeWeekPay, iso, money, paydayBounds } from './engine.js';

const app=document.getElementById('app'), wizard=document.getElementById('wizard');
const TABS=document.querySelector('nav.tabs'); const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function key(){const repo=(location.pathname.split('/')[1]||'root').toLowerCase();return `ydb:${repo}:v3`;}

let state=JSON.parse(localStorage.getItem(key()))||{};
state.ui=state.ui||{onboarded:false,lang:'en',tone:'spicy'};
state.user=state.user||{paydayWeekday:5,faFundsPerWeek:50};
state.bank=state.bank||{currentBalance:0};
state.payRules=state.payRules||{baseHourly:20,withholdingRatio:.2};
state.hours=state.hours||{mode:'simple',regular:40,ot:0,otMultiplier:1.5};
state.bills=state.bills||[]; state.loans=state.loans||[]; state.envelopes=state.envelopes||[]; state.events=state.events||[]; state.paid=state.paid||[]; state.feedback=state.feedback||[];
save();

function save(){localStorage.setItem(key(),JSON.stringify(state));}
function section(h,b=''){const s=document.createElement('section');s.className='card';s.innerHTML=(h?`<h2>${h}</h2>`:'')+b;return s;}
function lastNext(){return paydayBounds(new Date(), state.user.paydayWeekday||5);}

// ---------------- HOME (unchanged from 15.2) ----------------
function renderHome(){
  const {start,end}=lastNext();
  const bankBal=+state.bank.currentBalance||0;
  const pay=computeWeekPay(state.payRules,state.hours); const weeklyNet=+pay.net||0;
  const variables=(state.envelopes||[]).reduce((s,e)=>s+(+e.weeklyTarget||0),0);
  const faf=+state.user.faFundsPerWeek||0;
  const starting=bankBal+weeklyNet;

  const items=[]; const paidKey=p=>`${p.kind}:${p.id}:${p.dateISO}`; const paid=new Set((state.paid||[]).map(p=>paidKey(p)));
  (state.bills||[]).forEach(b=>{for(let m=0;m<2;m++){const d=new Date(start.getFullYear(),start.getMonth()+m,b.dueDay); if(d>=start&&d<end){const it={kind:'bill',id:b.id,name:b.name,dateISO:iso(d),amount:+b.amount}; if(!paid.has(paidKey(it))) items.push(it);}}});
  (state.loans||[]).forEach(l=>{for(let m=0;m<2;m++){const d=new Date(start.getFullYear(),start.getMonth()+m,l.dueDay); if(d>=start&&d<end){const it={kind:'loan',id:l.id,name:l.name,dateISO:iso(d),amount:+l.minimumPayment}; if(!paid.has(paidKey(it))) items.push(it);}}});
  (state.events||[]).forEach(e=>{const d=new Date(e.date); if(d>=start&&d<end){const it={kind:'event',id:e.id,name:e.name||'One-time',dateISO:iso(d),amount:+e.amount}; if(!paid.has(paidKey(it))) items.push(it);}});

  items.sort((a,b)=>a.dateISO.localeCompare(b.dateISO)||a.name.localeCompare(b.name));

  const paidAmt=(state.paid||[]).filter(p=>{const d=new Date(p.dateISO);return d>=start&&d<end;}).reduce((s,p)=>{
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
        </details>
      </div>
      <div><div class="kpi-label">Fuck Around Funds</div><div class="kpi-value">${money(faf)}</div><div class="help">Edit in Settings</div></div>
      <div><div class="kpi-label">After Damage</div><div class="kpi-value ${live<0?'negative':'positive'}">${money(live)}</div><div class="help">= Cash – paid – buckets – FAF</div></div>
    </div>`);
  app.appendChild(kpis);

  const monthlyIncome = weeklyNet*4.345;
  const monthlyMust = (state.bills||[]).reduce((s,b)=>s+(+b.amount||0),0) + (state.loans||[]).reduce((s,l)=>s+(+l.minimumPayment||0),0);
  const monthlyBuckets = (state.envelopes||[]).reduce((s,e)=>s+((+e.weeklyTarget||0)*4.345),0);
  const monthlyFaf = faf*4.345;
  const monthlyLeft = monthlyIncome - monthlyMust - monthlyBuckets - monthlyFaf;
  const monthCard = section('Monthly Snapshot',`
    <div class="grid cols-3">
      <div><div class="kpi-label">Est. Monthly Income</div><div class="kpi-value">${money(monthlyIncome)}</div></div>
      <div><div class="kpi-label">Monthly Must-Pays</div><div class="kpi-value">${money(monthlyMust)}</div></div>
      <div><div class="kpi-label">Buckets + FAF</div><div class="kpi-value">${money(monthlyBuckets+monthlyFaf)}</div></div>
    </div>
    <div class="help" style="margin-top:4px">Income uses your weekly estimate × 4.345.</div>
    <div class="kpi-value ${monthlyLeft<0?'negative':'positive'}" style="margin-top:8px">Left after damage: ${money(monthlyLeft)}</div>
  `);
  app.appendChild(monthCard);

  const upcoming=section('Due this pay period',`
    <div class="table-scroll"><table><thead><tr><th>Date</th><th>What</th><th>$</th><th></th></tr></thead>
    <tbody>${items.length?items.map(it=>`<tr><td>${it.dateISO}</td><td>${it.name}<span class="badge">${it.kind}</span></td><td>${money(it.amount)}</td><td><button class="button" data-paid='${JSON.stringify(it)}'>Paid ✔</button></td></tr>`).join(''):`<tr><td colspan="4" class="help">Nothing else due before ${iso(end)}.</td></tr>`}</tbody></table></div>`);
  app.appendChild(upcoming);
  upcoming.querySelectorAll('[data-paid]').forEach(b=>b.onclick=()=>{const it=JSON.parse(b.dataset.paid); state.paid.push({kind:it.kind,id:it.id,dateISO:it.dateISO}); save(); render();});

  const afford=section('Can I afford this?',`
    <div class="grid cols-3">
      <div><label>Amount</label><input id="aff_amt" type="number" step="0.01" placeholder="e.g. 49.99"></div>
      <div><label>Date</label><input id="aff_date" type="date" value="${iso(new Date())}"></div>
      <div class="row"><button id="aff_go" class="button primary">Ask my damn budget</button></div>
    </div><div id="aff_msg" class="help" style="margin-top:6px"></div>`);
  app.appendChild(afford);
  afford.querySelector('#aff_go').onclick=()=>{const amt=+afford.querySelector('#aff_amt').value||0;const left=live;const msg=afford.querySelector('#aff_msg');
    if(amt<=0){msg.textContent='Enter a real amount.';return;}
    msg.textContent=(left-amt>=0)?`Yep. You’ll have ${money(left-amt)} left.`:`Careful — you’re about to fuck around and find out (${money(left-amt)}).`;
  };
}

// ---------------- Planner / Timesheet / Bills / Events / Envelopes / Loans / Settings ----------------
// (same as v15.2; omitted here for brevity in this message — keep your current v15.2 sections unchanged)

// ---------------- DONATE (styled tiles; no underlines) ----------------
function renderDonate() {
  const s = section('Donate (optional)', `
    <div class="grid cols-2 donate-grid">
      <a class="button btn-paypal" href="https://paypal.me/mdsdoc" target="_blank" rel="noopener" aria-label="Donate via PayPal">
        <span style="font-weight:700">PayPal</span>
      </a>
      <a class="button btn-cashapp" href="https://cash.app/$mdsdoc" target="_blank" rel="noopener" aria-label="Donate via Cash App">
        <span style="font-weight:700">Cash App</span>
      </a>
    </div>
    <div class="help" style="margin-top:8px">
      Donations are appreciated, but they never unlock features and aren’t required.
    </div>
  `);
  app.appendChild(s);
}

// ===== Feedback (private in-app send via Google Apps Script) =====
function renderFeedback(){
  const FEEDBACK_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbzXvydQk3zrQ_g2h8JTBQwzxVa5QJgeMxM9kGsBqE_nsXCKTSMR3LZI_K0CcmA0MFWC/exec";

  const ver = '15.3';
  const s = section('Feedback', `
    <div class="feedback">
      <div class="grid cols-3">
        <div>
          <label>Your name (optional)</label>
          <input id="fb_name" placeholder="Jane">
        </div>
        <div>
          <label>Email (optional)</label>
          <input id="fb_email" type="email" placeholder="you@example.com">
        </div>
        <div>
          <label>Type</label>
          <select id="fb_type">
            <option>Idea</option>
            <option>Bug</option>
            <option>Praise</option>
            <option>Question</option>
          </select>
        </div>
      </div>

      <div class="grid cols-1" style="margin-top:8px">
        <div>
          <label>Message</label>
          <textarea id="fb_msg" placeholder="Tell us what rules, what sucks, or what broke…"></textarea>
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:8px">
        <label class="row" style="gap:8px">
          <input id="fb_include" type="checkbox" checked>
          <span>Include app version and device info</span>
        </label>
        <label class="row" style="gap:8px">
          <input id="fb_anon" type="checkbox">
          <span>Send anonymously (ignore name/email)</span>
        </label>
      </div>

      <div class="grid cols-3" style="margin-top:8px">
        <button id="fb_send" class="button primary">Send Feedback</button>
        <button id="fb_email" class="button">Email instead</button>
        <button id="fb_copy" class="button">Copy to clipboard</button>
      </div>

      <small class="help" style="display:block;margin-top:8px">
        “Send Feedback” sends privately from inside the app — no login or email app required.
      </small>
    </div>
  `);
  app.appendChild(s);

  const $=id=>s.querySelector(id);

  function build(){
    const anon=$('#fb_anon').checked;
    const name=anon?'-':($('#fb_name').value.trim()||'-');
    const email=anon?'-':($('#fb_email').value.trim()||'-');
    const type=$('#fb_type').value;
    const msg=$('#fb_msg').value.trim();
    const include=$('#fb_include').checked && !anon;
    const meta = include ? `\n---\nApp: Your Damn Budget v${ver}\nUA: ${navigator.userAgent}` : `\n---\nApp: Your Damn Budget v${ver}`;
    return {name,email,type,msg,meta};
  }

  function toast(txt,ok=true){
    const t=document.createElement('div');
    t.textContent=txt;
    Object.assign(t.style,{
      position:'fixed',
      left:'50%',
      bottom:'calc(env(safe-area-inset-bottom,0) + 18px)',
      transform:'translateX(-50%)',
      background: ok?'#0ea5a8':'#ef4444',
      color: ok?'#012a2c':'#fff',
      padding:'10px 14px',
      borderRadius:'10px',
      zIndex:100,
      fontWeight:'600'
    });
    document.body.appendChild(t);
    setTimeout(()=>t.remove(),2200);
  }

  $('#fb_send').onclick=async()=>{
    const e=build();
    if(!e.msg){toast('Say at least one sentence.',false);return;}
    try{
      const res = await fetch(FEEDBACK_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:e.type,msg:e.msg,name:e.name,email:e.email,meta:e.meta})
      });
      const js = await res.json().catch(()=>({}));
      if(res.ok && js.ok!==false){ toast('Thanks for speaking your damn mind 💬'); }
      else { throw new Error(js.error||'Failed'); }
    }catch(err){
      console.error(err);
      toast('Could not send. Try Email instead?',false);
    }
  };

  $('#fb_email').onclick=()=>{
    const e=build();
    const subj=encodeURIComponent(`YDB Feedback — ${e.type}`);
    const body=encodeURIComponent(`${e.msg}${e.meta}\nFrom: ${e.name} (${e.email})`);
    location.href=`mailto:yourdamnbudget@gmail.com?subject=${subj}&body=${body}`;
  };

  $('#fb_copy').onclick=async()=>{
    const e=build();
    const text=`${e.type}\n\n${e.msg}${e.meta}\nFrom: ${e.name} (${e.email})`;
    try{
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard.');
    }catch{
      toast('Copy failed — long-press to select.',false);
    }
  };
}

// ---------------- Router ----------------
function render(){ app.innerHTML=''; const v=document.querySelector('nav .tab.active')?.dataset.view||'home';
  if(v==='home')renderHome(); else if(v==='planner')renderPlanner(); else if(v==='timesheet')renderTimesheet();
  else if(v==='bills')renderBills(); else if(v==='events')renderEvents(); else if(v==='envelopes')renderEnvelopes();
  else if(v==='loans')renderLoans(); else if(v==='donate')renderDonate(); else if(v==='feedback')renderFeedback(); else if(v==='settings')renderSettings(); }
render();
TABS.addEventListener('click',e=>{const b=e.target.closest('.tab'); if(!b)return; document.querySelectorAll('nav .tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); render();});

// Wizard stays as in v15.2
if(!state.ui.onboarded && wizard){ import('./wizard.js?v=15.2').then(m=>m.showWizard(state,save,render)).catch(e=>console.error('wizard',e)); }

console.info('YDB app.js','15.3');