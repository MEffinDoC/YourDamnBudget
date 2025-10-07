// YDB v14a
import { iso } from './engine.js';
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function showWizard(state, save, onFinishRender){
  const wizard = document.getElementById('wizard');
  state.user = state.user || { paydayWeekday: 5, faFundsPerWeek: 50 };
  state.bank = state.bank || { currentBalance: 0 };
  state.payRules = state.payRules || { baseHourly: 20, withholdingRatio: 0.2 };
  state.bills = state.bills || [];
  state.loans = state.loans || [];
  state.ui = state.ui || { onboarded:false, lang:'en', tone:'spicy' };
  save();
  let step = 0; const steps = ['bank','pay','bill','loan','done'];
  function renderStep(){
    document.body.classList.add('noscroll'); wizard.classList.remove('hidden');
    const progress = Math.min(100, Math.round((step/(steps.length-1))*100));
    let inner = `<div class="panel"><div class="progress"><div style="width:${progress}%"></div></div>`;
    if(steps[step]==='bank'){
      inner += `
        <h2>Start here — Bank Balance</h2>
        <div class="step-hint">What’s in your account right now?</div>
        <div class="grid cols-2">
          <div><label>Current balance</label><input id="w_bank" type="number" step="0.01" value="${state.bank.currentBalance}"></div>
          <div><label>Payday weekday</label>
            <select id="w_weekday">${DOW.map((d,i)=>`<option value="${i}" ${i===(state.user?.paydayWeekday??5)?'selected':''}>${d}</option>`).join('')}</select>
          </div>
        </div>
        <div class="actions"><button id="skip" class="button ghost">Skip</button><span class="spacer"></span><button id="next" class="button primary">Save & Next</button></div>
      `;
    } else if(steps[step]==='pay'){
      inner += `
        <h2>Your Paycheck</h2>
        <div class="step-hint">Set your base hourly and estimate withholding from one real check.</div>
        <div class="grid cols-3">
          <div><label>Base hourly</label><input id="w_base" type="number" step="0.01" value="${state.payRules.baseHourly}"></div>
          <div><label>Withholding (0–1)</label><input id="w_tax" type="number" step="0.01" value="${state.payRules.withholdingRatio}"></div>
          <div><label>Fuck Around Funds (weekly)</label><input id="w_faf" type="number" step="0.01" value="${state.user.faFundsPerWeek}"></div>
        </div>
        <div class="grid cols-3">
          <div><label>Example Gross</label><input id="w_gross" type="number" step="0.01" placeholder="e.g. 1200.00"></div>
          <div><label>Example Net</label><input id="w_net" type="number" step="0.01" placeholder="e.g. 930.00"></div>
          <div class="row"><button id="w_apply" class="button ghost">Estimate</button></div>
        </div>
        <div class="actions"><button id="back" class="button ghost">Back</button><span class="spacer"></span><button id="next" class="button primary">Save & Next</button></div>
      `;
    } else if(steps[step]==='bill'){
      const rows = state.bills.map(b=>`<tr data-id="${b.id}"><td>${b.name}</td><td>$${Number(b.amount||0).toFixed(2)}</td><td>${b.dueDay}</td><td><button data-del="${b.id}" class="button ghost">Remove</button></td></tr>`).join('');
      inner += `
        <h2>The Shit You Can’t Skip</h2>
        <div class="step-hint">Add as many bills as you remember. You can always add more later.</div>
        <div class="grid cols-3">
          <div><label>Name</label><input id="w_bname" placeholder="Rent, Electric"></div>
          <div><label>Amount</label><input id="w_bamt" type="number" step="0.01"></div>
          <div><label>Due day</label><input id="w_bday" type="number" min="1" max="31" placeholder="1–31"></div>
        </div>
        <div class="actions">
          <button id="back" class="button ghost">Back</button>
          <button id="add" class="button">Add bill</button>
          <span class="spacer"></span>
          <button id="skip" class="button ghost">Skip</button>
          <button id="next" class="button primary">Next</button>
        </div>
        <div class="table-scroll" style="margin-top:8px"><table>
          <thead><tr><th>Name</th><th>Amount</th><th>Due</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="4" class="help">No bills yet.</td></tr>`}</tbody></table></div>
      `;
    } else if(steps[step]==='loan'){
      const rows = state.loans.map(l=>`<tr data-id="${l.id}"><td>${l.name}</td><td>$${Number(l.minimumPayment||0).toFixed(2)}</td><td>${l.dueDay}</td><td>${l.balance?('$'+Number(l.balance).toFixed(2)):'-'}</td><td><button data-del="${l.id}" class="button ghost">Remove</button></td></tr>`).join('');
      inner += `
        <h2>Your Damn Debts</h2>
        <div class="step-hint">Add any loans/IOUs. Optional now; add more later.</div>
        <div class="grid cols-3">
          <div><label>Name</label><input id="w_lname" placeholder="Car, CC, Student"></div>
          <div><label>Minimum $</label><input id="w_lmin" type="number" step="0.01"></div>
          <div><label>Due day</label><input id="w_lday" type="number" min="1" max="31"></div>
          <div><label>Balance (opt)</label><input id="w_lbal" type="number" step="0.01"></div>
        </div>
        <div class="actions">
          <button id="back" class="button ghost">Back</button>
          <button id="add" class="button">Add loan</button>
          <span class="spacer"></span>
          <button id="skip" class="button ghost">Skip</button>
          <button id="next" class="button primary">Next</button>
        </div>
        <div class="table-scroll" style="margin-top:8px"><table>
          <thead><tr><th>Name</th><th>Min</th><th>Due</th><th>Balance</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="help">No loans yet.</td></tr>`}</tbody></table></div>
      `;
    } else {
      inner += `
        <h2>All set 🎉</h2>
        <div class="step-hint">You can tweak anything in Settings or the tabs anytime.</div>
        <div class="actions"><span class="spacer"></span><button id="finish" class="button primary">Finish</button></div>
      `;
    }
    inner += `</div>`; wizard.innerHTML = inner;
    const $ = s => wizard.querySelector(s);
    if(steps[step]==='bank'){
      $('#next').onclick = ()=>{ state.bank.currentBalance = Number($('#w_bank').value||0);
        (state.user = state.user || {}).paydayWeekday = Number($('#w_weekday').value||5); save(); step++; renderStep(); };
      $('#skip').onclick = ()=>{ step++; renderStep(); };
    } else if(steps[step]==='pay'){
      $('#w_apply').onclick = ()=>{ const g = Number($('#w_gross').value||0), n = Number($('#w_net').value||0);
        if(g>0 && n>0 && n<g){ const ratio = Math.max(0, Math.min(0.6, 1-(n/g))); $('#w_tax').value = String(ratio.toFixed(3)); alert(`Estimated withholding: ${(ratio*100).toFixed(1)}%`); }
        else alert('Use a real paycheck: net must be less than gross.'); };
      $('#back').onclick = ()=>{ step--; renderStep(); };
      $('#next').onclick = ()=>{ state.payRules.baseHourly = Number($('#w_base').value||0);
        state.payRules.withholdingRatio = Number($('#w_tax').value||0);
        (state.user = state.user || {}).faFundsPerWeek = Number($('#w_faf').value||0); save(); step++; renderStep(); };
    } else if(steps[step]==='bill'){
      $('#add').onclick = ()=>{ const name = ($('#w_bname').value||'').trim(); const amount = Number($('#w_bamt').value||0); const day = Number($('#w_bday').value||0);
        if(!name || !amount || !(day>=1 && day<=31)){ alert('Add a name, amount, and due day (1–31).'); return; }
        state.bills.push({ id: Date.now()+Math.random(), name, amount, dueDay: day }); save(); renderStep(); };
      $('#back').onclick = ()=>{ step--; renderStep(); };
      $('#skip').onclick = ()=>{ step++; renderStep(); };
      $('#next').onclick = ()=>{ step++; renderStep(); };
      wizard.querySelectorAll('[data-del]').forEach(btn=>{ btn.onclick = ()=>{ state.bills = state.bills.filter(b=>b.id!=btn.dataset.del); save(); renderStep(); }; });
    } else if(steps[step]==='loan'){
      $('#add').onclick = ()=>{ const name = ($('#w_lname').value||'').trim(); const min = Number($('#w_lmin').value||0); const day = Number($('#w_lday').value||0); const bal = Number($('#w_lbal').value||0) || undefined;
        if(!name || !min || !(day>=1 && day<=31)){ alert('Add name, minimum, due day (1–31). Or Skip.'); return; }
        state.loans.push({ id: Date.now()+Math.random(), name, minimumPayment:min, dueDay:day, balance:bal }); save(); renderStep(); };
      $('#back').onclick = ()=>{ step--; renderStep(); };
      $('#skip').onclick = ()=>{ step++; renderStep(); };
      $('#next').onclick = ()=>{ step++; renderStep(); };
      wizard.querySelectorAll('[data-del]').forEach(btn=>{ btn.onclick = ()=>{ state.loans = state.loans.filter(l=>l.id!=btn.dataset.del); save(); renderStep(); }; });
    } else {
      $('#finish').onclick = ()=>{ (state.ui = state.ui || {}).onboarded = true; save();
        wizard.classList.add('hidden'); document.body.classList.remove('noscroll');
        document.querySelectorAll('nav .tab').forEach(b=>b.classList.remove('active'));
        document.querySelector('nav .tab[data-view="home"]').classList.add('active');
        onFinishRender && onFinishRender(); };
    }
  }
  renderStep();
}
