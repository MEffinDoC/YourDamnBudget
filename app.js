// YDB v14c — robust tab routing + guards
import { computeWeekPay, iso } from './engine.js';

const app=document.getElementById('app'), wizard=document.getElementById('wizard');
function storeKey(){const repo=(location.pathname.split('/')[1]||'root').toLowerCase();return `ydb:${repo}:v3`;}

// state
let state=JSON.parse(localStorage.getItem(storeKey()))||{};
state.ui=state.ui||{onboarded:false,lang:'en',tone:'spicy'};
state.user=state.user||{paydayWeekday:5,faFundsPerWeek:50};
save();

const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const money=n=>(n<0?'-':'')+'$'+Math.abs(+n||0).toFixed(2);
function save(){ localStorage.setItem(storeKey(), JSON.stringify(state)); }
function el(t,c,h){const e=document.createElement(t); if(c)e.className=c; if(h)e.innerHTML=h; return e;}
function section(tt,body){return el('section','card',(tt?`<h2>${tt}</h2>`:'')+body);}
function lastPayday(d,w){const x=new Date(d),diff=(x.getDay()-w+7)%7; x.setDate(x.getDate()-diff); x.setHours(0,0,0,0); return x;}
function nextPayday(d,w){const x=new Date(d),diff=(w-x.getDay()+7)%7; x.setDate(x.getDate()+diff+(diff===0?7:0)); x.setHours(0,0,0,0); return x;}

// ---- VIEWS ----
function renderHome(){
  const u=state.user, bank=state.bank||{currentBalance:0};
  const pay=computeWeekPay(state.payRules||{}, state.hours||{}), incomeNet=+pay.net||0;
  const start=lastPayday(new Date(),u.paydayWeekday), end=nextPayday(new Date(),u.paydayWeekday);
  const variables=(state.envelopes||[]).reduce((s,e)=>s+(+e.weeklyTarget||0),0);
  const faf=+u.faFundsPerWeek||0, bankBal=+bank.currentBalance||0;
  const starting=bankBal+incomeNet;

  const s=section('Weekly Damage Report',`
    <div class="grid cols-3" style="margin-top:6px">
      <div><div class="kpi-label">Cash This Week</div><div class="kpi-value">${money(starting)}</div>
        <details class="disclosure"><summary>Show breakdown</summary>
          <div class="help">Bank: ${money(bankBal)} + Est. net paycheck: ${money(incomeNet)}</div>
          <div class="help">Pay period: ${iso(start)} → ${iso(end)}</div>
        </details>
      </div>
      <div><div class="kpi-label">Fuck Around Funds</div><div class="kpi-value">${money(faf)}</div><div class="help">Edit in Settings</div></div>
      <div><div class="kpi-label">After Damage</div><div class="kpi-value">${money(starting-variables-faf)}</div><div class="help">= Cash – buckets – FAF</div></div>
    </div>`);
  app.appendChild(s);

  const afford=section('Can I afford this?',`
    <div class="grid cols-3">
      <div><label>Amount</label><input id="aff_amt" type="number" step="0.01" placeholder="e.g. 49.99"></div>
      <div><label>Date</label><input id="aff_date" type="date" value="${iso(new Date())}"></div>
      <div style="align-self:end"><button id="aff_go" class="button primary">Ask my damn budget</button></div>
    </div><div id="aff_msg" class="help" style="margin-top:6px"></div>`);
  app.appendChild(afford);
  afford.querySelector('#aff_go').onclick=()=>{
    const amt=+afford.querySelector('#aff_amt').value||0, left=starting-variables-faf, msg=afford.querySelector('#aff_msg');
    if(amt<=0){msg.textContent='Enter a real amount.';return;}
    msg.textContent=(left-amt>=0)?`Yep. You’ll have ${money(left-amt)} left.`:`Careful — you’re about to fuck around and find out (${money(left-amt)}).`;
  };
}

const placeholder=t=>section(t,'<div class="help">Coming in next pass.</div>');

function renderPlanner(){ app.appendChild(placeholder('Crystal Ball (12-week)')); }

function renderTimesheet(){
  const r=state.payRules||{baseHourly:20,withholdingRatio:.2};
  state.hours=state.hours||{mode:'simple',regular:40,ot:0,otMultiplier:1.5}; save();
  const s=section('Hours → Paycheck',`
   <div class="grid cols-3">
     <div><label>Base hourly</label><input id="bh" type="number" step="0.01" value="${r.baseHourly||0}"></div>
     <div><label>Withholding (0–1)</label><input id="wr" type="number" step="0.01" value="${r.withholdingRatio??.2}"></div>
     <div><label>Mode</label><select id="mode"><option value="simple" ${state.hours.mode!=='advanced'?'selected':''}>Simple</option><option value="advanced" ${state.hours.mode==='advanced'?'selected':''}>Advanced</option></select></div>
   </div><div id="hrs"></div>
   <div class="grid cols-3" style="margin-top:8px"><button id="save" class="button primary">Save & Update Home</button></div>
   <div id="out" class="help" style="margin-top:6px"></div>`);
  app.appendChild(s);
  const hrs=s.querySelector('#hrs'), out=s.querySelector('#out');

  function draw(){
    if(s.querySelector('#mode').value==='advanced'){
      hrs.innerHTML=`<div class="grid cols-3">
        <div><label>Regular</label><input id="hr" type="number" step="0.1" value="${state.hours.regular||0}"></div>
        <div><label>OT 1.5×</label><input id="h15" type="number" step="0.1" value="${state.hours.ot15||0}"></div>
        <div><label>OT 2×</label><input id="h2" type="number" step="0.1" value="${state.hours.ot2||0}"></div></div>`;
    }else{
      hrs.innerHTML=`<div class="grid cols-3">
        <div><label>Regular</label><input id="hr" type="number" step="0.1" value="${state.hours.regular||0}"></div>
        <div><label>OT hours</label><input id="hot" type="number" step="0.1" value="${state.hours.ot||0}"></div>
        <div><label>OT Multiplier</label><select id="mult">
          <option value="1.25"${(+state.hours.otMultiplier||1.5)==1.25?' selected':''}>1.25×</option>
          <option value="1.5"${(+state.hours.otMultiplier||1.5)==1.5?' selected':''}>1.5×</option>
          <option value="2"${(+state.hours.otMultiplier||1.5)==2?' selected':''}>2×</option>
        </select></div></div>`;
    }
  }
  function preview(){
    const rules={baseHourly:+s.querySelector('#bh').value||0,withholdingRatio:+s.querySelector('#wr').value||0};
    let hours={mode:s.querySelector('#mode').value};
    if(hours.mode==='advanced'){hours.regular=+s.querySelector('#hr').value||0;hours.ot15=+s.querySelector('#h15').value||0;hours.ot2=+s.querySelector('#h2').value||0;}
    else{hours.regular=+s.querySelector('#hr').value||0;hours.ot=+s.querySelector('#hot').value||0;hours.otMultiplier=+s.querySelector('#mult').value||1.5;}
    const p=computeWeekPay(rules,hours); out.textContent=`Gross ${money(p.gross)} → Net ${money(p.net)}`;
  }
  s.querySelector('#mode').onchange=()=>{draw();preview();}; draw(); s.addEventListener('input',preview); preview();

  s.querySelector('#save').onclick=()=>{ 
    state.payRules={baseHourly:+s.querySelector('#bh').value||0,withholdingRatio:+s.querySelector('#wr').value||0};
    if(s.querySelector('#mode').value==='advanced'){state.hours={mode:'advanced',regular:+s.querySelector('#hr').value||0,ot15:+s.querySelector('#h15').value||0,ot2:+s.querySelector('#h2').value||0};}
    else{state.hours={mode:'simple',regular:+s.querySelector('#hr').value||0,ot:+s.querySelector('#hot').value||0,otMultiplier:+s.querySelector('#mult').value||1.5};}
    save(); alert('Saved. Home will use this net estimate.');
  };
}

const renderBills   =()=>app.appendChild(placeholder('Bills'));
const renderEvents  =()=>app.appendChild(placeholder('Catch-Up Shit'));
const renderEnvelopes=()=>app.appendChild(placeholder('Where It Goes'));
const renderLoans   =()=>app.appendChild(placeholder('Your Damn Debts'));
const renderDonate  =()=>app.appendChild(section('Donate (optional)','<div class="grid cols-2"><a class="button" href="https://paypal.me/mdsdoc" target="_blank" rel="noopener">PayPal</a><a class="button" href="https://cash.app/$mdsdoc" target="_blank" rel="noopener">Cash App</a></div><div class="help" style="margin-top:6px">Donations never unlock features and aren’t required.</div>'));
function renderSettings(){
  const s=section('Settings',`<div class="grid cols-3">
   <div><label>Bank balance</label><input id="bal" type="number" step="0.01" value="${state.bank?.currentBalance||0}"></div>
   <div><label>Weekly FAF</label><input id="faf" type="number" step="0.01" value="${state.user.faFundsPerWeek||0}"></div>
   <div><label>Payday Weekday</label><select id="day">${DOW.map((d,i)=>`<option value="${i}" ${i===(state.user.paydayWeekday??5)?'selected':''}>${d}</option>`).join('')}</select></div>
  </div><div class="grid cols-3" style="margin-top:8px"><button id="save" class="button primary">Save</button></div>`);
  app.appendChild(s);
  s.querySelector('#save').onclick=()=>{state.bank=state.bank||{};state.bank.currentBalance=+s.querySelector('#bal').value||0;state.user.faFundsPerWeek=+s.querySelector('#faf').value||0;state.user.paydayWeekday=+s.querySelector('#day').value||5;save();alert('Saved.');};
}

// ---- ROUTER (with delegation + guards) ----
function render(){
  app.innerHTML='';
  const view=document.querySelector('nav .tab.active')?.dataset.view||'home';
  try{
    if(view==='home')renderHome();
    else if(view==='planner')renderPlanner();
    else if(view==='timesheet')renderTimesheet();
    else if(view==='bills')renderBills();
    else if(view==='events')renderEvents();
    else if(view==='envelopes')renderEnvelopes();
    else if(view==='loans')renderLoans();
    else if(view==='donate')renderDonate();
    else if(view==='settings')renderSettings();
    else{ console.warn('Unknown view',view); renderHome(); }
  }catch(err){ console.error('Render error',view,err); app.appendChild(section('Oops','<div class="help">We hit a snag rendering that view.</div>')); }
}
render();

// Event delegation so clicks always work (even if buttons are re-rendered)
document.querySelector('nav.tabs').addEventListener('click',e=>{
  const btn=e.target.closest('.tab'); if(!btn) return;
  document.querySelectorAll('nav .tab').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  render();
});

// First-run wizard
if(!state.ui.onboarded && wizard){
  import('./wizard.js?v=14c').then(m=>m.showWizard(state,save,render)).catch(e=>console.error('wizard load',e));
}