/* Your Damn Budget — Wizard v16.0.1
   Steps: Bank → Payday → Hours → Bills → One-offs
   - First bill button shows “Add bill”; after that “Add another”
   - Bank allows negative values
*/
(function () {
  const $ = s => document.querySelector(s);
  const state = (()=>{ try { return JSON.parse(localStorage.getItem('ydb_state')) || {}; } catch { return {}; } })();
  const save = (s)=> localStorage.setItem('ydb_state', JSON.stringify(s));

  function openWizardIfNeeded() {
    const seen = localStorage.getItem('ydb_wizard_seen');
    if (!seen) open();
  }
  function open() {
    const wrap = document.createElement('div');
    wrap.id = 'wizard';
    wrap.innerHTML = `
      <div class="wiz-backdrop"></div>
      <div class="wiz-card">
        <div class="wiz-head">Let’s set you up</div>
        <div class="wiz-body"></div>
        <div class="wiz-foot">
          <button class="btn-secondary" id="wiz_prev">Back</button>
          <button class="btn" id="wiz_next">Next</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('modal-open');

    const steps = [stepBank, stepPayday, stepHours, stepBills, stepOneOffs];
    let i = 0;
    const body = wrap.querySelector('.wiz-body');
    const prev = wrap.querySelector('#wiz_prev');
    const next = wrap.querySelector('#wiz_next');

    function render() {
      body.innerHTML = '';
      steps[i](body);
      prev.style.visibility = (i === 0) ? 'hidden' : 'visible';
      next.textContent = (i === steps.length - 1) ? 'Finish' : 'Next';
    }
    prev.onclick = ()=>{ if (i>0) { i--; render(); } };
    next.onclick = ()=>{ if (i < steps.length - 1) i++; else close(); render(); };
    render();
  }
  function close() {
    const w = $('#wizard');
    if (w) { w.remove(); document.body.classList.remove('modal-open'); }
    localStorage.setItem('ydb_wizard_seen', '1');
  }

  // ---- steps ----
  function stepBank(el) {
    const bank = state.bank ?? 0;
    el.innerHTML = `
      <div class="wiz-section">
        <h3>What’s in your account right now?</h3>
        <input id="wiz_bank" class="input allow-negative" type="number" inputmode="decimal" placeholder="e.g., 240" value="${bank}">
      </div>
      <div class="muted small">Tip: You can enter negative if you’re overdrawn.</div>
    `;
    el.querySelector('#wiz_bank').addEventListener('change', (e)=>{
      state.bank = +e.target.value || 0; save(state);
    });
  }

  function stepPayday(el) {
    const cadence = state.settings?.payday?.cadence || 'weekly';
    const weekday = state.settings?.payday?.weekday ?? 5;
    const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    el.innerHTML = `
      <div class="wiz-section">
        <h3>When do you get paid?</h3>
        <div class="pill-row payday-cadence">
          <button class="pill ${cadence==='weekly'?'active':''}" data-cad="weekly">Weekly</button>
          <button class="pill ${cadence==='biweekly'?'active':''}" data-cad="biweekly">Bi-weekly</button>
        </div>
        <div class="pill-row payday-weekday" style="margin-top:8px">
          ${wd.map((n,idx)=>`<button class="pill ${idx===weekday?'active':''}" data-wd="${idx}">${n}</button>`).join('')}
        </div>
        <div class="muted small" style="margin-top:8px">Heads up: your Friday paycheck funds next week (Sat–Thu).</div>
      </div>
    `;
    el.querySelectorAll('.payday-cadence .pill').forEach(b=>{
      b.onclick = ()=>{
        const cad = b.getAttribute('data-cad');
        state.settings = state.settings || {}; state.settings.payday = state.settings.payday || {};
        state.settings.payday.cadence = cad; save(state);
        window.YDB && window.YDB.savePaydayFromWizard(cad, state.settings.payday.weekday ?? 5);
        stepPayday(el);
      };
    });
    el.querySelectorAll('.payday-weekday .pill').forEach(b=>{
      b.onclick = ()=>{
        const wd = +b.getAttribute('data-wd');
        state.settings = state.settings || {}; state.settings.payday = state.settings.payday || { cadence:'weekly' };
        state.settings.payday.weekday = wd; save(state);
        window.YDB && window.YDB.savePaydayFromWizard(state.settings.payday.cadence || 'weekly', wd);
        stepPayday(el);
      };
    });
  }

  function stepHours(el) {
    const s = state.settings || (state.settings = {});
    const base = s.baseRate ?? 20;
    const otm = s.otMultiplier ?? 1.5;
    const reg = s.regHours ?? 40;
    const oth = s.otHours ?? 0;
    const wh  = s.withholding ?? 0.2;

    el.innerHTML = `
      <div class="wiz-section">
        <h3>Hours & Pay</h3>
        <label>Base hourly</label>
        <input id="wiz_base" class="input" type="number" inputmode="decimal" value="${base}">
        <label>OT multiplier</label>
        <select id="wiz_otm" class="input">
          <option ${otm==1.5?'selected':''} value="1.5">1.5× (standard)</option>
          <option ${otm==2?'selected':''} value="2">2×</option>
          <option ${otm==1?'selected':''} value="1">No OT</option>
        </select>
        <label>Regular hours</label>
        <input id="wiz_reg" class="input" type="number" inputmode="decimal" value="${reg}">
        <label>OT hours</label>
        <input id="wiz_oth" class="input" type="number" inputmode="decimal" value="${oth}">
        <label>Withholding (0–1)</label>
        <input id="wiz_wh" class="input" type="number" inputmode="decimal" step="0.001" value="${(Math.round(wh*1000)/1000)}">
      </div>
    `;
    el.querySelector('#wiz_base').onchange = e => { state.settings.baseRate = +e.target.value || 0; save(state); };
    el.querySelector('#wiz_otm').onchange  = e => { state.settings.otMultiplier = +e.target.value || 1.5; save(state); };
    el.querySelector('#wiz_reg').onchange  = e => { state.settings.regHours = +e.target.value || 0; save(state); };
    el.querySelector('#wiz_oth').onchange  = e => { state.settings.otHours = +e.target.value || 0; save(state); };
    el.querySelector('#wiz_wh').onchange   = e => { state.settings.withholding = +e.target.value || 0; save(state); };
  }

  function stepBills(el) {
    const bills = state.bills || (state.bills = []);
    el.innerHTML = `
      <div class="wiz-section">
        <h3>Sh*t That Must Get Paid</h3>
        <div class="grid2">
          <input id="wiz_bill_name" class="input" placeholder="e.g., Rent">
          <input id="wiz_bill_amt"  class="input" type="number" inputmode="decimal" placeholder="Amount">
          <input id="wiz_bill_day"  class="input" type="number" inputmode="numeric" placeholder="Due day (1–31)">
          <button id="wiz_bill_add" class="btn">${bills.length ? 'Add another' : 'Add bill'}</button>
        </div>
        <div id="wiz_bill_list" class="list small"></div>
      </div>
    `;
    const list = el.querySelector('#wiz_bill_list');
    function paint() {
      list.innerHTML = bills.map(b=>`<div>${b.name} — $${(+b.amount||0).toFixed(2)} (day ${b.dueDay})</div>`).join('') || `<div class="muted">None yet.</div>`;
      el.querySelector('#wiz_bill_add').textContent = bills.length ? 'Add another' : 'Add bill';
    }
    paint();
    el.querySelector('#wiz_bill_add').onclick = ()=>{
      const name = el.querySelector('#wiz_bill_name').value.trim();
      const amt  = +el.querySelector('#wiz_bill_amt').value || 0;
      const day  = +el.querySelector('#wiz_bill_day').value || 1;
      if (!name) return;
      bills.push({ id: crypto.randomUUID(), name, amount: amt, dueDay: day });
      save(state); paint();
      el.querySelector('#wiz_bill_name').value='';
      el.querySelector('#wiz_bill_amt').value='';
      el.querySelector('#wiz_bill_day').value='';
    };
  }

  function stepOneOffs(el) {
    const offs = state.oneOffs || (state.oneOffs = []);
    el.innerHTML = `
      <div class="wiz-section">
        <h3>Catch-Up Sh*t (one-offs)</h3>
        <div class="grid2">
          <input id="wiz_off_name" class="input" placeholder="e.g., Last month electric">
          <input id="wiz_off_amt"  class="input" type="number" inputmode="decimal" placeholder="Amount">
          <input id="wiz_off_date" class="input" type="date">
          <label class="row"><input id="wiz_off_defer" type="checkbox" checked> Defer to next week if needed</label>
          <button id="wiz_off_add" class="btn">${offs.length ? 'Add another' : 'Add item'}</button>
        </div>
        <div id="wiz_off_list" class="list small"></div>
      </div>
    `;
    const list = el.querySelector('#wiz_off_list');
    function paint() {
      list.innerHTML = offs.map(o=>`<div>${o.name} — $${(+o.amount||0).toFixed(2)} (${o.dateISO || 'no date'}) ${o.defer?'<span class="pill">defer</span>':''}</div>`).join('') || `<div class="muted">None yet.</div>`;
      el.querySelector('#wiz_off_add').textContent = offs.length ? 'Add another' : 'Add item';
    }
    paint();
    el.querySelector('#wiz_off_add').onclick = ()=>{
      const name = el.querySelector('#wiz_off_name').value.trim();
      const amt  = +el.querySelector('#wiz_off_amt').value || 0;
      const date = el.querySelector('#wiz_off_date').value || null;
      const def  = el.querySelector('#wiz_off_defer').checked;
      if (!name || !date) return;
      offs.push({ id: crypto.randomUUID(), name, amount: amt, dateISO: date, defer: !!def, includeThisWeek: !def });
      save(state); paint();
      el.querySelector('#wiz_off_name').value='';
      el.querySelector('#wiz_off_amt').value='';
      el.querySelector('#wiz_off_date').value='';
      el.querySelector('#wiz_off_defer').checked=true;
    };
  }

  window.YDB = window.YDB || {};
  window.YDB.openWizard = open;

  document.addEventListener('DOMContentLoaded', openWizardIfNeeded);
})();