// Your Damn Budget v13 — true in-place wizard (no background nav)

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
  const bank = state.bank || (state