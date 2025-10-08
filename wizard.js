// YDB wizard v15.9.0 — modal first-run setup (and re-run from Settings)
export function runWizard({state, save, onClose}){
  const S = state;

  // Overlay + modal
  const overlay = document.createElement('div');
  overlay.className = 'wiz-overlay';
  overlay.innerHTML = `
    <div class="wiz" role="dialog" aria-modal="true" aria-label="First-time setup">
      <h2>Quick setup</h2>
      <div class="wiz-body" id="wiz-body"></div>
      <div class="wiz-actions">
        <button id="wiz_skip" class="button">Skip for now</button>
        <button id="wiz_next" class="button primary">Next</button>
      </div>
      <div class="wiz-steps" id="wiz-steps"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Steps
  const steps = [
    stepWelcome,
    stepBank,
    stepPayday,
    stepPayBase,
    stepWithholdingExample,
    stepBillsOptional,
    stepDone
  ];
  let i = 0;

  function renderStep(){
    const body = overlay.querySelector('#wiz-body');
    const stepsEl = overlay.querySelector('#wiz-steps');
    stepsEl.textContent = `Step ${i+1} of ${steps.length}`;
    body.innerHTML = '';
    steps[i]({S, save, root: body});
    // Buttons
    const nextBtn = overlay.querySelector('#wiz_next');
    const skipBtn = overlay.querySelector('#wiz_skip');
    nextBtn.textContent = (i === steps.length - 1) ? 'Finish' : 'Next';
    skipBtn.textContent = (i === 0) ? 'Skip for now' : 'Back';
    skipBtn.onclick = () => {
      if(i === 0){ close(); return; }
      i = Math.max(0, i-1);
      renderStep();
    };
    nextBtn.onclick = async () => {
      if(typeof steps[i].onNext === 'function'){
        const ok = await steps[i].onNext({S, save, root: body});
        if(ok === false) return;
      }
      if(i < steps.length - 1){ i++; renderStep(); }
      else { S.ui.onboarded = true; save(); close(); }
    };
  }

  function close(){
    overlay.remove();
    if(typeof onClose === 'function') onClose();
  }

  renderStep();
}

/* ---- individual steps ---- */

function stepWelcome({root}){
  root.innerHTML = `
    <p class="help">We’ll grab a few numbers so your budget tells the damn truth from day one. You can change any of this later in Settings.</p>
    <div class="hint">Takes about 60 seconds.</div>
  `;
}

function stepBank({S, root}){
  root.innerHTML = `
    <label>Current bank balance</label>
    <input id="w_bank" type="number" step="0.01" value="${S.user.bankBalance||0}">
  `;
  stepBank.onNext = ({S, save, root})=>{
    const v = +root.querySelector('#w_bank').value || 0;
    S.user.bankBalance = v; save(); return true;
  };
}

function stepPayday({S, root}){
  root.innerHTML = `
    <label>Payday weekday</label>
    <select id="w_dow">
      ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>`<option value="${i}" ${i==S.user.paydayWeekday?'selected':''}>${d}</option>`).join('')}
    </select>
  `;
  stepPayday.onNext = ({S, save, root})=>{
    S.user.paydayWeekday = +root.querySelector('#w_dow').value || 5; save(); return true;
  };
}

function stepPayBase({S, root}){
  root.innerHTML = `
    <div class="grid cols-2">
      <div>
        <label>Base hourly rate</label>
        <input id="w_base" type="number" step="0.01" value="${S.pay.baseHourly||0}">
      </div>
      <div>
        <label>OT multiplier</label>
        <select id="w_ot">
          <option value="1.5" ${S.pay.otMultiplier==1.5?'selected':''}>1.5× (standard)</option>
          <option value="2" ${S.pay.otMultiplier==2?'selected':''}>2× (double time)</option>
          <option value="2.5" ${S.pay.otMultiplier==2.5?'selected':''}>2.5×</option>
        </select>
        <div class="hint">You can adjust later if your state/company does something special.</div>
      </div>
    </div>
  `;
  stepPayBase.onNext = ({S, save, root})=>{
    S.pay.baseHourly = +root.querySelector('#w_base').value || 0;
    S.pay.otMultiplier = +root.querySelector('#w_ot').value || 1.5;
    save(); return true;
  };
}

function stepWithholdingExample({S, root}){
  root.innerHTML = `
    <p class="help">Give us one real paycheck to estimate your withholding automatically (optional). We’ll compute <b>withholding = 1 - net/gross</b>.</p>
    <div class="grid cols-2">
      <div>
        <label>Example gross</label>
        <input id="w_gross" type="number" step="0.01" placeholder="e.g., 1280.00">
      </div>
      <div>
        <label>Example net</label>
        <input id="w_net" type="number" step="0.01" placeholder="e.g., 1024.00">
      </div>
    </div>
    <div class="hint">Skip if you want to set withholding manually later.</div>
  `;
  stepWithholdingExample.onNext = ({S, save, root})=>{
    const g = +root.querySelector('#w_gross').value || 0;
    const n = +root.querySelector('#w_net').value || 0;
    if(g>0 && n>0 && n<=g){
      S.pay.withholding = Math.max(0, Math.min(0.6, 1 - (n/g)));
      save();
    }
    return true;
  };
}

function stepBillsOptional({S, root}){
  root.innerHTML = `
    <p class="help">Add any must-pay bills now (optional). You can add more later in “Shit That Must Get Paid”.</p>
    <div class="grid cols-3">
      <div><label>Name</label><input id="wb_name" placeholder="Rent"></div>
      <div><label>Amount</label><input id="wb_amt" type="number" step="0.01" placeholder="1200.00"></div>
      <div><label>Due day (1–31)</label><input id="wb_day" type="number" min="1" max="31" value="1"></div>
    </div>
    <div class="wiz-actions" style="justify-content:flex-start;margin-top:8px">
      <button id="wb_add" class="button">Add another</button>
    </div>
    <div class="table-scroll" style="margin-top:8px">
      <table>
        <thead><tr><th>Name</th><th>$</th><th>Due</th><th></th></tr></thead>
        <tbody id="wb_body"></tbody>
      </table>
    </div>
  `;
  const tbody = root.querySelector('#wb_body');
  function draw(){
    tbody.innerHTML = (S.bills||[]).map(b=>`
      <tr>
        <td>${escape(b.name)}</td><td>${money(b.amount)}</td><td>${b.dueDay}</td>
        <td><button class="button" data-del="${b.id}">Delete</button></td>
      </tr>`).join('') || `<tr><td colspan="4" class="help">No bills yet.</td></tr>`;
  }
  function escape(s){return String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));}
  function money(n){return (isNaN(+n)?0:+n).toLocaleString(undefined,{style:'currency',currency:'USD'});}
  draw();

  root.querySelector('#wb_add').onclick=()=>{
    const name=root.querySelector('#wb_name').value.trim();
    const amt=+root.querySelector('#wb_amt').value||0;
    const day=+root.querySelector('#wb_day').value||1;
    if(!name||amt<=0) return;
    S.bills.push({id:Math.random().toString(36).slice(2,9),name,amount:amt,dueDay:day});
    (root.querySelector('#wb_name').value=''); (root.querySelector('#wb_amt').value=''); (root.querySelector('#wb_day').value='1');
    draw();
  };
  root.addEventListener('click',e=>{
    if(e.target.dataset.del){
      S.bills = S.bills.filter(x=>x.id!==e.target.dataset.del);
      draw();
    }
  });
  stepBillsOptional.onNext = ({save})=>{ save(); return true; };
}

function stepDone({root}){
  root.innerHTML = `
    <p>All set. Your dashboard will use this to tell you what you can actually afford this week.</p>
    <div class="hint">You can re-run this from Settings → “Run setup again”.</div>
  `;
}