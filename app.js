// YDB v14a
import { load } from './storage.js';
import { project, computeWeekPay, iso } from './engine.js';
import { triggerInstall } from './install.js';

const VERSION = '14a';
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

function renderHome(){
  const u = state.user || (state.user = { paydayWeekday: 5, faFundsPerWeek: 50 });
  const bank = state.bank || (state.bank = { currentBalance: 0 }); save();
  const pay = computeWeekPay(state.payRules||{}, state.hours||{}); const incomeThisWeek = Number(pay?.net||0);
  const start = lastPaydayFrom(new Date(), u.paydayWeekday); const end = nextPaydayFrom(new Date(), u.paydayWeekday);
  const variables = (state.envelopes||[]).reduce((s,e)=>s+Number(e.weeklyTarget||0),0);
  const faf = Number(u.faFundsPerWeek||0); const bankBal = Number(bank.currentBalance||0);
  const starting = bankBal + incomeThisWeek;
  const s = section('Weekly Damage Report', `
    <div class="grid cols-3" style="margin-top:6px">
      <div>
        <div class="kpi-label">Cash This Week</div>
        <div class="kpi-value">${money(starting)}</div>
        <details class="disclosure"><summary>Show breakdown</summary>
          <div class="help">Bank: ${money(bankBal)} + Est. net paycheck: ${money(incomeThisWeek)}</div>
          <div class="help">Pay period: ${iso(start)} → ${iso(end)}</div>
        </details>
      </div>
      <div><div class="kpi-label">Fuck Around Funds</div><div class="kpi-value">${money(faf)}</div></div>
      <div><div class="kpi-label">After Damage</div><div class="kpi-value">${money(starting - variables - faf)}</div></div>
    </div>`); app.appendChild(s);
}

function safe(fn){ try{ fn(); }catch(e){ console.error(e); app.appendChild(section('Oops', '<div class="help">We hit a snag.</div>')); } }
function render(){
  app.innerHTML='';
  const view = document.querySelector('nav .tab.active')?.dataset.view || 'home';
  if(view==='home') safe(renderHome);
}
document.querySelectorAll('nav .tab').forEach(btn=>{ btn.onclick=()=>{ document.querySelectorAll('nav .tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); render(); }; });

(function boot(){
  state.ui = state.ui || { onboarded:false, lang:'en', tone:'spicy' };
  state.user = state.user || { paydayWeekday:5, faFundsPerWeek:50 };
  save();
  render();
  if(!state.ui.onboarded && wizard){
    import('./wizard.js?v=14a').then(m=>m.showWizard(state, save, render)).catch(err=>console.error('Wizard load failed', err));
  }
  console.info('YDB version', VERSION);
})();
