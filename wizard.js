// YDB wizard v15.2 — adds brief hints under fields
import { iso } from './engine.js';
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function showWizard(state,save,onFinish){
  const el=document.getElementById('wizard');
  state.ui=state.ui||{onboarded:false,lang:'en',tone:'spicy'};
  state.user=state.user||{paydayWeekday:5,faFundsPerWeek:50};
  state.bank=state.bank||{currentBalance:0};
  state.payRules=state.payRules||{baseHourly:20,withholdingRatio:.2};
  state.bills=state.bills||[]; state.loans=state.loans||[];
  save();

  let step=0; const steps=['bank','pay','bill','loan','done']; const $=s=>el.querySelector(s);
  const ui=html=>{el.innerHTML=`<div class="panel"><div class="progress"><div style="width:${Math.round(step/(steps.length-1)*100)}%"></div></div>${html}</div>`;document.body.classList.add('noscroll');el.classList.remove('hidden');};

  function bank(){ui(`<h2>Start here — Bank Balance</h2>
    <div class="grid cols-2">
      <div><label>Current balance</label><input id="b" type="number" step="0.01" value="${state.bank.currentBalance}"><div class="help">What’s in your account right now.</div></div>
      <div><label>Payday weekday</label><select id="w">${DOW.map((d,i)=>`<option value="${i}" ${i===(state.user.paydayWeekday??5)?'selected':''}>${d}</option>`).join('')}</select><div class="help">Which day do checks land?</div></div>
    </div>
    <div class="grid cols-2" style="margin-top:8px"><button id="skip" class="button">Skip</button><button id="next" class="button primary">Save & Next</button></div>`);
    $('#skip').onclick=()=>{step=1;render();}; $('#next').onclick=()=>{state.bank.currentBalance=+$('#b').value||0;state.user.paydayWeekday=+$('#w').value||5;save();step=1;render();};}

  function pay(){ui(`<h2>Your Paycheck</h2>
    <div class="grid cols-3">
      <div><label>Base hourly</label><input id="base" type="number" step="0.01" value="${state.payRules.baseHourly}"><div class="help">Your hourly rate.</div></div>
      <div><label>Withholding (0–1)</label><input id="tax" type="number" step="0.01" value="${state.payRules.withholdingRatio}"><div class="help">0.20 = 20% taxes/benefits.</div></div>
      <div><label>Fuck Around Funds (weekly)</label><input id="faf" type="number" step="0.01" value="${state.user.faFundsPerWeek}"><div class="help">Your fun money budget.</div></div>
    </div>
    <div class="grid cols-3">
      <div><label>Example Gross</label><input id="g" type="number" step="0.01"><div class="help">From a real check.</div></div>
      <div><label>Example Net</label><input id="n" type="number" step="0.01"><div class="help">What you took home.</div></div>
      <div><button id="est" class="button">Estimate withholding</button><div class="help">Uses your example check.</div></div>
    </div>
    <div class="grid cols-2" style="margin-top:8px"><button id="back" class="button">Back</button><button id="next" class="button primary">Save & Next</button></div>`);
    $('#est').onclick=()=>{const g=+$('#g').value||0,n=+$('#n').value||0;if(g>0&&n>0&&n<g){$('#tax').value=Math.max(0,Math.min(.6,1-n/g)).toFixed(3);}else alert('Use a real check: net < gross.')};
    $('#back').onclick=()=>{step=0;render();}; $('#next').onclick=()=>{state.payRules.baseHourly=+$('#base').value||0;state.payRules.withholdingRatio=+$('#tax').value||0;state.user.faFundsPerWeek=+$('#faf').value||0;save();step=2;render();};}

  function bill(){const rows=state.bills.map(b=>`<tr data-id="${b.id}"><td>${b.name}</td><td>$${(+b.amount).toFixed(2)}</td><td>${b.dueDay}</td><td><button data-del="${b.id}" class="button">Remove</button></td></tr>`).join('');
    ui(`<h2>The Shit You Can’t Skip</h2>
      <div class="grid cols-3"><div><input id="bn" placeholder="Name (Rent, Electric)"><div class="help">What’s the bill?</div></div>
      <div><input id="ba" type="number" step="0.01" placeholder="Amount"><div class="help">What you usually pay.</div></div>
      <div><input id="bd" type="number" min="1" max="31" placeholder="Due day"><div class="help">Day of month (1–31).</div></div></div>
      <div class="grid cols-3" style="margin-top:8px"><button id="back" class="button">Back</button><button id="add" class="button">Add bill</button><button id="next" class="button primary">Next</button></div>
      <div class="table-scroll" style="margin-top:8px"><table><thead><tr><th>Name</th><th>Amount</th><th>Due</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="help">No bills yet.</td></tr>'}</tbody></table></div>`);
    $('#back').onclick=()=>{step=1;render();};
    $('#add').onclick=()=>{const n=$('#bn').value.trim(),a=+$('#ba').value||0,d=+$('#bd').value||0;if(!n||!a||d<1||d>31){alert('Name, amount, due day 1–31');return;}state.bills.push({id:Date.now()+Math.random(),name:n,amount:a,dueDay:d});save();bill();};
    el.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{state.bills=state.bills.filter(x=>x.id!=b.dataset.del);save();bill();});
    $('#next').onclick=()=>{step=3;render();};
  }

  function loan(){const rows=state.loans.map(l=>`<tr data-id="${l.id}"><td>${l.name}</td><td>$${(+l.minimumPayment).toFixed(2)}</td><td>${l.dueDay}</td><td>${l.balance?('$'+(+l.balance).toFixed(2)):'-'}</td><td><button data-del="${l.id}" class="button">Remove</button></td></tr>`).join('');
    ui(`<h2>Your Damn Debts</h2>
      <div class="grid cols-3"><div><input id="ln" placeholder="Name (Car, CC)"><div class="help">Which debt/loan?</div></div>
      <div><input id="lm" type="number" step="0.01" placeholder="Minimum"><div class="help">Your usual minimum.</div></div>
      <div><input id="ld" type="number" min="1" max="31" placeholder="Due day"><div class="help">Day of month (1–31).</div></div>
      <div><input id="lb" type="number" step="0.01" placeholder="Balance (opt)"><div class="help">What’s left (optional).</div></div></div>
      <div class="grid cols-3" style="margin-top:8px"><button id="back" class="button">Back</button><button id="add" class="button">Add loan</button><button id="next" class="button primary">Next</button></div>
      <div class="table-scroll" style="margin-top:8px"><table><thead><tr><th>Name</th><th>Min</th><th>Due</th><th>Balance</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="help">No loans yet.</td></tr>'}</tbody></table></div>`);
    $('#back').onclick=()=>{step=2;render();};
    $('#add').onclick=()=>{const n=$('#ln').value.trim(),m=+$('#lm').value||0,d=+$('#ld').value||0,b=+$('#lb').value||undefined;if(!n||!m||d<1||d>31){alert('Name, minimum, due day 1–31');return;}state.loans.push({id:Date.now()+Math.random(),name:n,minimumPayment:m,dueDay:d,balance:b});save();loan();};
    el.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{state.loans=state.loans.filter(x=>x.id!=b.dataset.del);save();loan();});
    $('#next').onclick=()=>{step=4;render();};
  }

  function done(){ui(`<h2>All set 🎉</h2><div class="grid cols-2" style="margin-top:8px"><div></div><button id="finish" class="button primary">Finish</button></div>`); $('#finish').onclick=()=>{state.ui.onboarded=true;save();el.classList.add('hidden');document.body.classList.remove('noscroll');onFinish&&onFinish();};}

  function render(){[bank,pay,bill,loan,done][step]();}
  render();
}