// YDB v14b (modal-only, skippable + add-many)
import { iso } from './engine.js';
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function showWizard(state,save,onFinish){
  const el=document.getElementById('wizard');
  state.user=state.user||{paydayWeekday:5,faFundsPerWeek:50};
  state.bank=state.bank||{currentBalance:0};
  state.payRules=state.payRules||{baseHourly:20,withholdingRatio:.2};
  state.bills=state.bills||[]; state.loans=state.loans||[]; state.ui=state.ui||{onboarded:false}; save();
  let step=0; const steps=['bank','pay','bill','loan','done'];
  const $=s=>el.querySelector(s);
  function render(){
    document.body.classList.add('noscroll'); el.classList.remove('hidden');
    const p=Math.round((step/(steps.length-1))*100);
    let html=`<div class="panel"><div class="progress"><div style="width:${p}%"></div></div>`;
    if(steps[step]==='bank'){ html+=`
      <h2>Start here — Bank Balance</h2>
      <div class="grid cols-2">
        <div><label>Current balance</label><input id="b" type="number" step="0.01" value="${state.bank.currentBalance}"></div>
        <div><label>Payday weekday</label><select id="w">${DOW.map((d,i)=>`<option value="${i}" ${i===(state.user.paydayWeekday??5)?'selected':''}>${d}</option>`).join('')}</select></div>
      </div>
      <div class="grid cols-2" style="margin-top:8px"><button id="skip" class="button">Skip</button><button id="next" class="button primary">Save & Next</button></div>
    `;}
    else if(steps[step]==='pay'){ html+=`
      <h2>Your Paycheck</h2>
      <div class="grid cols-3">
        <div><label>Base hourly</label><input id="base" type="number" step="0.01" value="${state.payRules.baseHourly}"></div>
        <div><label>Withholding (0–1)</label><input id="tax" type="number" step="0.01" value="${state.payRules.withholdingRatio}"></div>
        <div><label>Fuck Around Funds (weekly)</label><input id="faf" type="number" step="0.01" value="${state.user.faFundsPerWeek}"></div>
      </div>
      <div class="grid cols-3">
        <div><label>Example Gross</label><input id="g" type="number" step="0.01"></div>
        <div><label>Example Net</label><input id="n" type="number" step="0.01"></div>
        <div><button id="est" class="button">Estimate withholding</button></div>
      </div>
      <div class="grid cols-2" style="margin-top:8px"><button id="back" class="button">Back</button><button id="next" class="button primary">Save & Next</button></div>
    `;}
    else if(steps[step]==='bill'){ const rows=state.bills.map(b=>`<tr><td>${b.name}</td><td>$${(+b.amount).toFixed(2)}</td><td>${b.dueDay}</td></tr>`).join('');
      html+=`
      <h2>The Shit You Can’t Skip</h2>
      <div class="grid cols-3"><div><input id="bn" placeholder="Name"></div><div><input id="ba" type="number" step="0.01" placeholder="Amount"></div><div><input id="bd" type="number" min="1" max="31" placeholder="Due day"></div></div>
      <div class="grid cols-3" style="margin-top:8px"><button id="back" class="button">Back</button><button id="add" class="button">Add bill</button><button id="next" class="button primary">Next</button></div>
      <div class="table-scroll" style="margin-top:8px"><table><thead><tr><th>Name</th><th>Amount</th><th>Due</th></tr></thead><tbody>${rows||'<tr><td colspan="3" class="help">No bills yet.</td></tr>'}</tbody></table></div>
    `;}
    else if(steps[step]==='loan'){ const rows=state.loans.map(l=>`<tr><td>${l.name}</td><td>$${(+l.minimumPayment).toFixed(2)}</td><td>${l.dueDay}</td></tr>`).join('');
      html+=`
      <h2>Your Damn Debts</h2>
      <div class="grid cols-3"><div><input id="ln" placeholder="Name"></div><div><input id="lm" type="number" step="0.01" placeholder="Minimum"></div><div><input id="ld" type="number" min="1" max="31" placeholder="Due day"></div></div>
      <div class="grid cols-3" style="margin-top:8px"><button id="back" class="button">Back</button><button id="add" class="button">Add loan</button><button id="next" class="button primary">Next</button></div>
      <div class="table-scroll" style="margin-top:8px"><table><thead><tr><th>Name</th><th>Min</th><th>Due</th></tr></thead><tbody>${rows||'<tr><td colspan="3" class="help">No loans yet.</td></tr>'}</tbody></table></div>
    `;}
    else{ html+=`<h2>All set 🎉</h2><div class="grid cols-2" style="margin-top:8px"><div></div><button id="finish" class="button primary">Finish</button></div>`; }
    el.innerHTML=html;
    // actions
    if(steps[step]==='bank'){ $('#next').onclick=()=>{state.bank.currentBalance=+$('#b').value||0;state.user.paydayWeekday=+$('#w').value||5;save();step++;render();}; $('#skip').onclick=()=>{step++;render();}; }
    else if(steps[step]==='pay'){ $('#est').onclick=()=>{const g=+$('#g').value||0,n=+$('#n').value||0;if(g>0&&n>0&&n<g){const r=Math.max(0,Math.min(.6,1-n/g));$('#tax').value=r.toFixed(3);alert(`Withholding ≈ ${(r*100).toFixed(1)}%`);}else alert('Use a real check: net < gross.');};
      $('#back').onclick=()=>{step--;render();}; $('#next').onclick=()=>{state.payRules.baseHourly=+$('#base').value||0;state.payRules.withholdingRatio=+$('#tax').value||0;state.user.faFundsPerWeek=+$('#faf').value||0;save();step++;render();}; }
    else if(steps[step]==='bill'){ $('#back').onclick=()=>{step--;render();}; $('#add').onclick=()=>{const n=$('#bn').value.trim(),a=+$('#ba').value||0,d=+$('#bd').value||0;if(!n||!a||d<1||d>31){alert('Name, amount, due day 1–31');return;}state.bills.push({id:Date.now()+Math.random(),name:n,amount:a,dueDay:d});save();render();}; $('#next').onclick=()=>{step++;render();}; }
    else if(steps[step]==='loan'){ $('#back').onclick=()=>{step--;render();}; $('#add').onclick=()=>{const n=$('#ln').value.trim(),m=+$('#lm').value||0,d=+$('#ld').value||0;if(!n||!m||d<1||d>31){alert('Name, minimum, due day 1–31');return;}state.loans.push({id:Date.now()+Math.random(),name:n,minimumPayment:m,dueDay:d});save();render();}; $('#next').onclick=()=>{step++;render();}; }
    else { $('#finish').onclick=()=>{state.ui.onboarded=true;save();el.classList.add('hidden');document.body.classList.remove('noscroll');onFinish&&onFinish();}; }
  }
  render();
}