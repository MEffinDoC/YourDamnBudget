/* app.js — YDB v15.9.0 (LKG) */
(() => {
  const STORE_KEY = 'ydb:data:v15.9.0';
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; }
    catch { return null; }
  }
  function save(state) { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  // Default seed for a clean start
  function seed() {
    return {
      version: 'v15.9.0',
      bank: 0,
      payday: 5,                // 0=Sun..6=Sat (default Fri)
      buckets: [],              // variable spends (gas, food..)
      bills: [],                // monthly
      ones: [],                 // one-offs
      debts: [],
      pay: { base: 0, otMult: 1.5, withheld: .20, reg: 40, ot: 0 },
      feedbackUrl: 'https://script.google.com/macros/s/AKfycbzXvydQk3zrQ_g2h8JTBQwzxVa5QJgeMxM9kGsBqE_nsXCKTSMR3LZI_K0CcmA0MFWC/exec'
    };
  }

  // Week window based on payday
  function getWeek(paydayIdx = 5, ref = new Date()) {
    const d = new Date(ref);
    const diff = (d.getDay() - paydayIdx + 7) % 7; // days since last payday
    const start = new Date(d); start.setDate(d.getDate() - diff);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const fmt = (x) => x.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
    return { start, end, label: `${fmt(start)}–${fmt(end)} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][paydayIdx]} payday)` };
  }

  function calcNet(pay) {
    const gross = pay.base * pay.reg + (pay.base * pay.otMult) * pay.ot;
    const net = gross * (1 - pay.withheld);
    return { gross, net };
  }

  // Rendering helpers
  function money(n) { return (n<0?'-':'') + '$' + Math.abs(n).toFixed(2); }

  // HOME
  function renderHome(state) {
    const week = getWeek(state.payday);
    const pay = calcNet(state.pay);

    // Bills due within week window
    const today = new Date();
    const wStart = new Date(week.start.getFullYear(), week.start.getMonth(), week.start.getDate());
    const wEnd   = new Date(week.end.getFullYear(),   week.end.getMonth(),   week.end.getDate());
    const monthDays = state.bills
      .map(b => ({...b, date:new Date(today.getFullYear(), today.getMonth(), b.day)}))
      .filter(x => x.date >= wStart && x.date <= wEnd);

    const bucketsTotal = (state.buckets||[]).reduce((a,b)=>a + (+b.amount||0), 0);
    const faf = 50; // default weekly FAF (editable in settings if you want)

    // Rule: show THIS week as cash only from bank if payday is after today in this window
    let includePayThisWeek = (today >= wStart && today >= week.start && today.getDay() === state.payday);
    // keep simple: only count pay if it's payday today
    const cashThisWeek = state.bank + (includePayThisWeek ? pay.net : 0)
                        - monthDays.reduce((a,b)=>a + (+b.amount||0), 0)
                        - bucketsTotal - faf;

    const dueRows = monthDays.map(x =>
      `<tr><td>${x.day.toString().padStart(2,'0')}</td><td>${x.name}</td><td>${money(+x.amount||0)}</td>
       <td><button class="btn ghost btn-paid" data-name="${x.name}" data-day="${x.day}">Paid ✓</button></td></tr>`).join('') || 
      `<tr><td colspan="4" style="text-align:center;color:var(--muted)">Nothing due this pay period.</td></tr>`;

    $('#page-home').innerHTML = `
      <h2>Weekly Damage Report</h2>
      <div class="kv"><div>${week.label}</div><div></div></div>
      <div class="kv"><div>Cash This Week</div><div>${money(Math.max(0,cashThisWeek))}</div></div>
      <details class="kv"><summary>Show breakdown</summary>
        <div class="kv"><div>Bank</div><div>${money(state.bank)}</div></div>
        <div class="kv"><div>Est. net paycheck</div><div>${money(pay.net)}</div></div>
        <div class="kv"><div>Must-pays this week</div><div>${money(monthDays.reduce((a,b)=>a+(+b.amount||0),0))}</div></div>
        <div class="kv"><div>Buckets + FAF</div><div>${money(bucketsTotal + faf)}</div></div>
      </details>
      <div class="kv"><div>F*ck Around Funds</div><div>${money(faf)}</div></div>
      <div class="kv"><div>After Damage</div><div class="${cashThisWeek>=0?'good':'bad'}">${money(cashThisWeek)}</div></div>

      <h2 style="margin-top:18px">Due this pay period</h2>
      <table class="table">
        <thead><tr><th>Date</th><th>What</th><th>$</th><th>Paid</th></tr></thead>
        <tbody>${dueRows}</tbody>
      </table>

      <h2 style="margin-top:18px">Can I afford this?</h2>
      <label>Amount</label>
      <input id="canAmt" inputmode="decimal" placeholder="e.g., 49.99"/>
      <label>Date</label>
      <input id="canDate" type="date" />
      <div style="margin-top:10px"><button id="canBtn" class="btn">Ask my damn budget</button></div>
    `;

    // buy check
    $('#canDate').valueAsDate = new Date();
    $('#canBtn').onclick = () => {
      const amt = parseFloat($('#canAmt').value || '0') || 0;
      const verdict = (cashThisWeek - amt);
      alert(verdict >= 0 ? `You're good. Left after buy: ${money(verdict)}`
                         : `Warning: you'd be short ${money(-verdict)} — you're about to find out.`);
    };

    $$('.btn-paid').forEach(btn => {
      btn.onclick = () => {
        // Just remove from list in this simple pass (not persistent flag)
        btn.closest('tr').remove();
      };
    });
  }

  // FORECAST
  function renderForecast(state){
    const pay = calcNet(state.pay);
    const weeks = 12;
    const estIncome = pay.net * weeks;
    const bucketsWeekly = (state.buckets||[]).reduce((a,b)=>a + (+b.amount||0), 0) + 50;
    const projected = estIncome - bucketsWeekly * weeks;
    $('#page-forecast').innerHTML = `
      <h2>12-week snapshot</h2>
      <div class="kv"><div>Est. Income</div><div>${money(estIncome)}</div></div>
      <div class="kv"><div>Buckets + FAF</div><div>${money(bucketsWeekly)}</div></div>
      <div class="kv"><div>Projected Left</div><div class="${projected>=0?'good':'bad'}">${money(projected)}</div></div>
    `;
  }

  // HOURS
  function renderHours(state){
    const p = state.pay;
    const {gross,net} = calcNet(p);
    $('#page-hours').innerHTML = `
      <h2>Hours & Paycheck</h2>
      <label>Base hourly</label><input id="payBase" inputmode="decimal" value="${p.base||0}"/>
      <label>OT multiplier</label>
      <select id="otMult">
        <option value="1.5"${p.otMult==1.5?' selected':''}>1.5× (standard)</option>
        <option value="2"${p.otMult==2?' selected':''}>2×</option>
        <option value="1.25"${p.otMult==1.25?' selected':''}>1.25×</option>
      </select>
      <label>Withholding (auto or manual)</label><input id="withheld" inputmode="decimal" value="${p.withheld||0}"/>
      <div class="grid two">
        <div><label>Regular hours</label><input id="regH" inputmode="decimal" value="${p.reg||40}"/></div>
        <div><label>OT hours</label><input id="otH" inputmode="decimal" value="${p.ot||0}"/></div>
      </div>
      <div style="margin-top:10px"><button id="saveHours" class="btn">Save hours</button></div>
      <div class="kv" style="margin-top:10px"><div>Est. Gross / week</div><div>${money(gross)}</div></div>
      <div class="kv"><div>Est. Net / week</div><div>${money(net)}</div></div>
      <div class="kv"><div>Withholding</div><div>${(p.withheld*100).toFixed(1)}%</div></div>
    `;
    $('#saveHours').onclick = () => {
      state.pay.base = parseFloat($('#payBase').value||'0')||0;
      state.pay.otMult = parseFloat($('#otMult').value||'1.5')||1.5;
      state.pay.withheld = parseFloat($('#withheld').value||'0')||0;
      state.pay.reg = parseFloat($('#regH').value||'40')||40;
      state.pay.ot = parseFloat($('#otH').value||'0')||0;
      save(state); renderHours(state);
    };
  }

  // BILLS
  function renderBills(state){
    const rows = (state.bills||[]).map(b =>
      `<tr><td>${b.name}</td><td>${money(+b.amount||0)}</td><td>${b.day}</td>
       <td><button class="btn ghost del" data-name="${b.name}" data-day="${b.day}">Delete</button></td></tr>`).join('');
    $('#page-bills').innerHTML = `
      <h2>Shit That Must Get Paid</h2>
      <label>Name</label><input id="bName" placeholder="Rent"/>
      <label>Amount</label><input id="bAmt" inputmode="decimal" placeholder="1200.00"/>
      <label>Due day (1–31)</label><input id="bDay" inputmode="numeric" placeholder="1"/>
      <div style="margin-top:10px" class="row"><button id="addBill" class="btn">Add</button></div>
      <table class="table" style="margin-top:10px">
        <thead><tr><th>Name</th><th>$</th><th>Due day</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">None yet.</td></tr>'}</tbody>
      </table>
    `;
    $('#addBill').onclick = () => {
      const name = $('#bName').value.trim();
      const amount = parseFloat($('#bAmt').value||'0')||0;
      const day = parseInt($('#bDay').value||'1',10)||1;
      if(!name) return;
      (state.bills = state.bills||[]).push({name,amount,day});
      save(state); renderBills(state);
    };
    $$('#page-bills .del').forEach(b => b.onclick = () => {
      state.bills = state.bills.filter(x => !(x.name===b.dataset.name && String(x.day)===String(b.dataset.day)));
      save(state); renderBills(state);
    });
  }

  // CATCH-UP
  function renderCatchup(state){
    const rows = (state.ones||[]).map(o =>
      `<tr><td>${o.name}</td><td>${money(+o.amount||0)}</td><td>${o.defer?'can defer':'now'}</td>
       <td><button class="btn ghost del" data-name="${o.name}">Delete</button></td></tr>`).join('');
    $('#page-catchup').innerHTML = `
      <h2>Catch-Up Sh*t</h2>
      <label>Description</label><input id="oName" placeholder="Last month electric"/>
      <label>Amount</label><input id="oAmt" inputmode="decimal" placeholder="120.00"/>
      <div class="row"><input id="oDef" type="checkbox" /><label for="oDef">Defer to next week if needed</label></div>
      <div style="margin-top:10px"><button id="addOne" class="btn">Add</button></div>
      <table class="table" style="margin-top:10px">
        <thead><tr><th>What</th><th>$</th><th>Rule</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">None yet.</td></tr>'}</tbody>
      </table>
    `;
    $('#addOne').onclick = () => {
      const name = $('#oName').value.trim();
      const amount = parseFloat($('#oAmt').value||'0')||0;
      const defer = $('#oDef').checked;
      if(!name) return;
      (state.ones = state.ones||[]).push({name,amount,defer});
      save(state); renderCatchup(state);
    };
    $$('#page-catchup .del').forEach(b => b.onclick = () => {
      state.ones = state.ones.filter(x => x.name!==b.dataset.name);
      save(state); renderCatchup(state);
    });
  }

  // BUCKETS
  function renderBuckets(state){
    const rows = (state.buckets||[]).map(b =>
      `<tr><td>${b.name}</td><td>${money(+b.amount||0)}</td>
       <td><button class="btn ghost del" data-name="${b.name}">Delete</button></td></tr>`).join('');
    $('#page-buckets').innerHTML = `
      <h2>Where It Goes (buckets)</h2>
      <label>Name</label><input id="bkName" placeholder="Food"/>
      <label>Weekly amount</label><input id="bkAmt" inputmode="decimal" placeholder="75.00"/>
      <div style="margin-top:10px"><button id="addBk" class="btn">Add</button></div>
      <table class="table" style="margin-top:10px">
        <thead><tr><th>Name</th><th>Weekly $</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="3" style="text-align:center;color:var(--muted)">None yet.</td></tr>'}</tbody>
      </table>
    `;
    $('#addBk').onclick = () => {
      const name = $('#bkName').value.trim();
      const amount = parseFloat($('#bkAmt').value||'0')||0;
      if(!name) return;
      (state.buckets = state.buckets||[]).push({name,amount});
      save(state); renderBuckets(state);
    };
    $$('#page-buckets .del').forEach(b => b.onclick = () => {
      state.buckets = state.buckets.filter(x => x.name!==b.dataset.name);
      save(state); renderBuckets(state);
    });
  }

  // DEBTS (list only in this pass)
  function renderDebts(state){
    const rows = (state.debts||[]).map(d =>
      `<tr><td>${d.name}</td><td>${money(+d.min||0)}</td><td>${money(+d.balance||0)}</td></tr>`).join('');
    $('#page-debts').innerHTML = `
      <h2>Your Damn Debts</h2>
      <label>Name</label><input id="dbName" placeholder="Car loan"/>
      <div class="grid two">
        <div><label>Min payment</label><input id="dbMin" inputmode="decimal" placeholder="250.00"/></div>
        <div><label>Balance</label><input id="dbBal" inputmode="decimal" placeholder="8500.00"/></div>
      </div>
      <div style="margin-top:10px"><button id="addDebt" class="btn">Add</button></div>
      <table class="table" style="margin-top:10px">
        <thead><tr><th>Debt</th><th>Min</th><th>Balance</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="3" style="text-align:center;color:var(--muted)">None yet.</td></tr>'}</tbody>
      </table>
    `;
    $('#addDebt').onclick = () => {
      const name = $('#dbName').value.trim();
      const min = parseFloat($('#dbMin').value||'0')||0;
      const balance = parseFloat($('#dbBal').value||'0')||0;
      if(!name) return;
      (state.debts = state.debts||[]).push({name,min,balance});
      save(state); renderDebts(state);
    };
  }

  // DONATE
  function renderDonate(){
    $('#page-donate').innerHTML = `
      <h2>Donate (optional)</h2>
      <div class="grid">
        <a class="btn btn-paypal" href="https://paypal.me/mdsdoc" target="_blank" rel="noopener">PayPal</a>
        <a class="btn btn-cashapp" href="https://cash.app/$mdsdoc" target="_blank" rel="noopener">Cash App</a>
      </div>
      <p style="color:var(--muted);margin-top:10px">Donations are appreciated, but they never unlock features and aren’t required.</p>
    `;
  }

  // FEEDBACK (Apps Script)
  function renderFeedback(state){
    $('#page-feedback').innerHTML = `
      <h2>Feedback</h2>
      <label>Type</label>
      <select id="fbType"><option>Idea</option><option>Bug</option><option>Other</option></select>
      <label>Message</label>
      <textarea id="fbMsg" placeholder="Tell us what rules, what sucks, or what broke…"></textarea>
      <div class="row" style="margin-top:8px">
        <input id="fbDiag" type="checkbox" checked />
        <label for="fbDiag">Include app version and device info</label>
      </div>
      <div class="row" style="margin-top:8px">
        <input id="fbAnon" type="checkbox" />
        <label for="fbAnon">Send anonymously (ignore name/email)</label>
      </div>
      <div style="margin-top:10px"><button id="fbSend" class="btn">Send Feedback</button></div>
    `;
    $('#fbSend').onclick = async () => {
      const btn = $('#fbSend'); btn.disabled = true;
      const payload = {
        type: $('#fbType').value,
        message: $('#fbMsg').value || '',
        version: 'v15.9.0',
        anon: $('#fbAnon').checked,
        diagnostics: $('#fbDiag').checked ? {
          ua: navigator.userAgent, lang: navigator.language, ts: Date.now()
        } : null
      };
      try {
        const res = await fetch(state.feedbackUrl, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        if(!res.ok) throw new Error('bad');
        $('#fbMsg').value = '';
        alert('Thanks — sent!');
      } catch(e){
        alert('Could not send. Try again later.');
      } finally { btn.disabled = false; }
    };
  }

  // SETTINGS
  function renderSettings(state){
    $('#page-settings').innerHTML = `
      <h2>Settings</h2>
      <label>Current bank balance</label><input id="bankBal" inputmode="decimal" value="${state.bank||0}"/>
      <label>Payday weekday</label>
      <select id="payday">
        <option value="0">Sun</option><option value="1">Mon</option><option value="2">Tue</option>
        <option value="3">Wed</option><option value="4">Thu</option><option value="5">Fri</option>
        <option value="6">Sat</option>
      </select>
      <div class="row" style="margin-top:10px">
        <button id="saveSettings" class="btn">Save settings</button>
        <button id="runWizard" class="btn ghost">Run setup again</button>
      </div>
    `;
    $('#payday').value = String(state.payday);
    $('#saveSettings').onclick = () => {
      state.bank = parseFloat($('#bankBal').value||'0')||0;
      state.payday = parseInt($('#payday').value,10)||5;
      save(state);
      alert('Saved.');
    };
    // wizard.js attaches the click handler to #runWizard and shows modal pop-up
  }

  // NAV
  function switchTab(id){
    $$('.page').forEach(p => p.classList.add('hidden'));
    $(`#page-${id}`).classList.remove('hidden');
    $$('.tab').forEach(t => t.classList.remove('active'));
    $(`.tab[data-tab="${id}"]`).classList.add('active');
  }

  function renderAll(state){
    renderHome(state);
    renderForecast(state);
    renderHours(state);
    renderBills(state);
    renderCatchup(state);
    renderBuckets(state);
    renderDebts(state);
    renderDonate();
    renderFeedback(state);
    renderSettings(state);
  }

  // BOOT
  let state = load() || seed();
  save(state);
  renderAll(state);

  // nav wires
  $$('#tabs .tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  switchTab('home');
})();