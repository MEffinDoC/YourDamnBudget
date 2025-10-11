<!-- /app.js -->
<script>
/* Your Damn Budget — v16.0.0 (surgical logic pass)
   - Weekly window = day after last payday → next payday (exclusive)
   - THIS week cash = bank only (no paycheck); paycheck funds NEXT week
   - Bills/loans/one-offs are counted if dueDate is in [start, nextPayday)
   - One-offs: "Defer to next week" toggle respected (carry forward)
   - Withholding display cleaned up; negative bank supported
   NOTE: DOM ids/classes unchanged; guards added so nothing explodes if a section is missing.
*/
(function () {
  const VERSION = 'v16.0.0';

  // ---------- storage ----------
  const LS_KEY = 'ydb_state';
  const defaultState = () => ({
    meta: { version: VERSION },
    bank: 0,
    settings: {
      // back-compat: either settings.paydayWeekday or settings.payday.weekday
      payday: { cadence: 'weekly', weekday: 5 }, // 0=Sun..6=Sat; 5=Fri default
      fafWeekly: 50,
      withholding: 0.2,      // fraction, e.g., 0.2 for 20%
      baseRate: 20,
      otMultiplier: 1.5,
      regHours: 40,
      otHours: 0,
    },
    bills: [],          // {id,name,amount,dueDay}  dueDay: 1..31
    loans: [],          // {id,name,amount,dueDay}
    oneOffs: [],        // {id,name,amount,dateISO,defer:true|false, includeThisWeek?:bool}
    envelopes: [],      // {id,name,weekly}
    paid: {},           // map: periodKey -> {kind:id: true}
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      // migrate payday if old key exists
      if (s.settings && typeof s.settings.paydayWeekday === 'number') {
        s.settings.payday = s.settings.payday || { cadence: 'weekly', weekday: s.settings.paydayWeekday };
      }
      if (!s.settings?.payday) s.settings.payday = { cadence: 'weekly', weekday: 5 };
      return s;
    } catch { return defaultState(); }
  }
  function saveState(s) {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }
  let state = loadState();

  // ---------- utils ----------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const fmtMoney = (n) => (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`);
  const pct = n => `${(n * 100).toFixed(1)}%`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const clampDOMoney = (v) => isFinite(+v) ? +v : 0;

  // date format short like "Oct 04" or with weekday for rows
  const dfShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' });
  const dfRow = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: '2-digit' });

  // ---------- pay period math ----------
  function getLastNextPayday(today, weekday, cadence) {
    // weekday: 0=Sun..6=Sat. cadence: 'weekly'|'biweekly'
    const t = startOfDay(today);
    const diff = (t.getDay() - weekday + 7) % 7; // days since last payday
    const last = new Date(t);
    last.setDate(t.getDate() - diff);
    let next = new Date(last);
    next.setDate(last.getDate() + 7);
    if (cadence === 'biweekly') next.setDate(last.getDate() + 14);
    // If today IS payday, we treat that as "next" (paycheck funds next period)
    if (+t === +last) {
      // today is payday → this period ended yesterday; last = last - periodLen
      const len = cadence === 'biweekly' ? 14 : 7;
      last.setDate(last.getDate() - len);
      next = new Date(t); next.setDate(t.getDate()); // next = today
    }
    return { last, next };
  }
  function getCurrentWindow(today, settings) {
    const weekday = settings.payday?.weekday ?? 5;
    const cadence = settings.payday?.cadence ?? 'weekly';
    const { last, next } = getLastNextPayday(today, weekday, cadence);
    const start = new Date(last); start.setDate(last.getDate() + 1); // day after last payday
    const end = new Date(next);   // exclusive
    return { start, end, last, next, cadence, weekday };
  }

  function periodKey(win) {
    // e.g., "2025-10-04_2025-10-10"
    const d2 = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `${d2(win.start)}_${d2(win.end)}`;
  }

  // Map monthly dueDay (1..31) to a concrete date within/after the start month
  function dueDayToDateAround(dueDay, win) {
    const m = win.start.getMonth(), y = win.start.getFullYear();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const day = Math.min(Math.max(1, dueDay), lastDay);
    let candidate = new Date(y, m, day);
    if (candidate < win.start) {
      // shift to next month
      const y2 = candidate.getMonth() === 11 ? y + 1 : y;
      const m2 = (m + 1) % 12;
      const last2 = new Date(y2, m2 + 1, 0).getDate();
      const day2 = Math.min(day, last2);
      candidate = new Date(y2, m2, day2);
    }
    return candidate;
  }

  function inWindow(date, win) {
    const d = startOfDay(date);
    return d >= startOfDay(win.start) && d < startOfDay(win.end);
  }

  // ---------- totals & lists ----------
  function weeklyEnvelopesTotal() {
    return (state.envelopes || []).reduce((a, e) => a + clampDOMoney(e.weekly || 0), 0);
  }

  function listDueItems(win) {
    const list = [];
    // bills (monthly)
    (state.bills || []).forEach(b => {
      const when = dueDayToDateAround(b.dueDay, win);
      if (inWindow(when, win)) list.push({ kind: 'bill', id: b.id, name: b.name, amount: +b.amount || 0, when });
    });
    // loans (monthly)
    (state.loans || []).forEach(l => {
      const when = dueDayToDateAround(l.dueDay, win);
      if (inWindow(when, win)) list.push({ kind: 'loan', id: l.id, name: l.name, amount: +l.amount || 0, when });
    });
    // one-offs (dated)
    (state.oneOffs || []).forEach(o => {
      if (!o.dateISO) return;
      const when = startOfDay(new Date(o.dateISO));
      if (inWindow(when, win)) {
        const include = (o.defer === true) ? (o.includeThisWeek === true) : true; // defer=on → include only if user toggled on
        list.push({ kind: 'oneoff', id: o.id, name: o.name, amount: +o.amount || 0, when, include, defer: !!o.defer });
      }
    });
    // sort by date, then name
    list.sort((a,b) => (+a.when - +b.when) || a.name.localeCompare(b.name));
    return list;
  }

  function calcThisWeek(win) {
    const bank = +state.bank || 0;
    const buckets = weeklyEnvelopesTotal();
    const faf = +state.settings.fafWeekly || 0;

    const dues = listDueItems(win);
    const mustPays = dues.filter(d => d.kind === 'bill' || d.kind === 'loan')
                         .reduce((a,d)=>a+d.amount,0);
    const oneOffIncluded = dues
      .filter(d => d.kind === 'oneoff' && (d.include !== false))
      .reduce((a,d)=>a+d.amount,0);

    const cashThisWeek = bank; // paycheck excluded this period
    const after = cashThisWeek - mustPays - oneOffIncluded - buckets - faf;

    return { bank, buckets, faf, dues, mustPays, oneOffIncluded, cashThisWeek, after };
  }

  // For Hours page & "next week preview" later
  function estimateNetPay() {
    const s = state.settings || {};
    const gross = (+s.baseRate || 0) * (+s.regHours || 0) +
                  (+s.baseRate || 0) * (+s.otHours || 0) * (+s.otMultiplier || 1);
    const net = gross * (1 - (+s.withholding || 0));
    return { gross, net };
  }

  // ---------- paid tracking ----------
  function isPaid(winKey, kind, id) {
    return !!state.paid?.[winKey]?.[`${kind}:${id}`];
  }
  function setPaid(winKey, kind, id, v) {
    state.paid ||= {};
    state.paid[winKey] ||= {};
    if (v) state.paid[winKey][`${kind}:${id}`] = true;
    else delete state.paid[winKey][`${kind}:${id}`];
    saveState(state);
  }

  // ---------- renderers ----------
  function renderHome() {
    const home = $('#homePage'); if (!home) return;

    const today = startOfDay(new Date());
    const win = getCurrentWindow(today, state.settings);
    const k = periodKey(win);
    const calc = calcThisWeek(win);

    // header chip: "Oct 04–Oct 10 (Fri payday)"
    const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const chip = `${dfShort.format(win.start)}–${dfShort.format(new Date(win.end.getTime()-86400000))} (${weekdayNames[state.settings.payday.weekday]} payday)`;

    // Top card numbers
    const cashLine = fmtMoney(calc.cashThisWeek);
    const afterLine = fmtMoney(calc.after);

    // breakdown details
    const breakdown = [
      `<div>Bank: ${fmtMoney(calc.bank)}</div>`,
      `<div>Buckets: ${fmtMoney(calc.buckets)}</div>`,
      `<div>F*ck Around Funds: ${fmtMoney(calc.faf)}</div>`,
      `<div>Must-pays this week: ${fmtMoney(calc.mustPays)}</div>`,
      `<div>One-offs this week: ${fmtMoney(calc.oneOffIncluded)}</div>`,
    ].join('');

    // Put into DOM (keep your structure; guard by id existence)
    const cashEl = $('#home_cashThisWeek'); if (cashEl) cashEl.textContent = cashLine;
    const afterEl = $('#home_afterDamage'); if (afterEl) {
      afterEl.textContent = afterLine;
      afterEl.classList.toggle('neg', calc.after < 0);
      afterEl.classList.toggle('pos', calc.after >= 0);
    }
    const chipEl = $('#home_periodChip'); if (chipEl) chipEl.textContent = chip;
    const brk = $('#home_breakdown'); if (brk) brk.innerHTML = breakdown;

    // Due list table
    const dueT = $('#home_dueTableBody');
    if (dueT) {
      dueT.innerHTML = '';
      const dues = listDueItems(win);
      dues.forEach(d => {
        const tr = document.createElement('tr');
        const paid = isPaid(k, d.kind, d.id);
        const badge = (d.kind === 'oneoff' && d.defer && d.include === false) ? `<span class="pill pill-deferred">deferred</span>` : '';
        tr.innerHTML = `
          <td>${dfRow.format(d.when)}</td>
          <td>${d.name} <span class="muted">${d.kind}</span> ${badge}</td>
          <td class="money">${fmtMoney(d.amount)}</td>
          <td><button class="btn-small ${paid?'btn-on':''}" data-kind="${d.kind}" data-id="${d.id}">${paid?'Paid ✓':'Paid'}</button></td>
        `;
        dueT.appendChild(tr);
      });
      dueT.querySelectorAll('button.btn-small').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          const id = e.currentTarget.getAttribute('data-id');
          const kind = e.currentTarget.getAttribute('data-kind');
          const val = !isPaid(k, kind, id);
          setPaid(k, kind, id, val);
          renderHome();
        });
      });
    }

    // "Can I afford this?"
    const affordBtn = $('#afford_btn');
    if (affordBtn) {
      affordBtn.onclick = () => {
        const amt = clampDOMoney($('#afford_amount')?.value);
        if (!isFinite(amt) || amt <= 0) return;
        const would = calc.after - amt;
        const out = $('#afford_result');
        if (out) {
          out.textContent = would >= 0 ? `Yep — you’ll still have ${fmtMoney(would)} left.` :
                                         `Nope — you’d be short ${fmtMoney(-would)}.`;
          out.className = 'afford ' + (would>=0 ? 'ok':'bad');
        }
      };
    }
  }

  function renderHours() {
    const c = $('#hoursPage'); if (!c) return;
    const s = state.settings;
    const est = estimateNetPay();
    const withhold = +s.withholding || 0;

    // Inputs: tidy up withholding display
    const wIn = $('#hours_withholding'); if (wIn) {
      wIn.value = (Math.round(withhold * 1000) / 1000).toString();
    }
    const gEl = $('#hours_gross'); if (gEl) gEl.textContent = fmtMoney(est.gross);
    const nEl = $('#hours_net'); if (nEl) nEl.textContent = fmtMoney(est.net);
    const pEl = $('#hours_withhold_pct'); if (pEl) pEl.textContent = pct(withhold);

    // Save handler
    const saveBtn = $('#hours_save'); if (saveBtn) {
      saveBtn.onclick = () => {
        s.baseRate = clampDOMoney($('#hours_base')?.value);
        s.otMultiplier = clampDOMoney($('#hours_otmult')?.value) || 1.5;
        s.regHours = clampDOMoney($('#hours_reg')?.value);
        s.otHours = clampDOMoney($('#hours_ot')?.value);
        s.withholding = clampDOMoney($('#hours_withholding')?.value);
        saveState(state);
        renderHours(); renderHome();
      };
    }
  }

  function renderBillsPage() {
    const c = $('#billsPage'); if (!c) return;
    // Button text: "Add bill" if none, else "Add another"
    const btn = $('#bills_addBtn'); if (btn) {
      btn.textContent = (state.bills?.length || 0) === 0 ? 'Add bill' : 'Add another';
    }
  }

  function renderOneOffsPage() {
    const c = $('#oneOffsPage'); if (!c) return;
    // Defer toggles UI (if your markup has them)
    // We rely on your existing handlers; nothing destructive here.
  }

  function renderSettings() {
    // payday pills
    const c = $('#settingsPage'); if (!c) return;
    const d = state.settings.payday || { cadence:'weekly', weekday:5 };
    const wdNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const chip = $('#home_periodChip'); // updated in renderHome
    // Allow negative bank typing (remove min attribute if present)
    const bankInput = $('#settings_bank'); if (bankInput) {
      bankInput.removeAttribute('min');
      bankInput.setAttribute('inputmode','decimal');
      bankInput.onchange = () => {
        state.bank = clampDOMoney(bankInput.value);
        saveState(state); renderHome();
      };
    }
    // Weekday pills (if present)
    $$('.payday-weekday [data-wd]').forEach(el=>{
      const wd = +el.getAttribute('data-wd');
      el.classList.toggle('active', wd === d.weekday);
      el.onclick = ()=>{ state.settings.payday.weekday = wd; saveState(state); renderHome(); };
    });
    // Cadence pills
    $$('.payday-cadence [data-cad]').forEach(el=>{
      const cad = el.getAttribute('data-cad');
      el.classList.toggle('active', cad === d.cadence);
      el.onclick = ()=>{ state.settings.payday.cadence = cad; saveState(state); renderHome(); };
    });
  }

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    // initial tidy for any numeric fields which should allow negative
    $$('#settings_bank, .allow-negative').forEach(el=>{
      el.removeAttribute('min'); el.setAttribute('inputmode','decimal');
    });
    renderHome(); renderHours(); renderBillsPage(); renderOneOffsPage(); renderSettings();

    // Nav re-render hooks if your code uses hash nav
    window.addEventListener('hashchange', ()=>{ renderHome(); renderHours(); renderBillsPage(); renderOneOffsPage(); renderSettings(); });
  });

  // Expose tiny helpers for wizard save
  window.YDB = window.YDB || {};
  window.YDB.savePaydayFromWizard = (cadence, weekday) => {
    state.settings.payday = { cadence, weekday };
    saveState(state); renderHome(); renderSettings();
  };
  window.YDB.addOneOffIncludeToggle = function(id, include) {
    const o = (state.oneOffs||[]).find(x=>x.id===id);
    if (o) { o.includeThisWeek = !!include; saveState(state); renderHome(); }
  };
})();
</script>    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      // migrate payday if old key exists
      if (s.settings && typeof s.settings.paydayWeekday === 'number') {
        s.settings.payday = s.settings.payday || { cadence: 'weekly', weekday: s.settings.paydayWeekday };
      }
      if (!s.settings?.payday) s.settings.payday = { cadence: 'weekly', weekday: 5 };
      return s;
    } catch { return defaultState(); }
  }
  function saveState(s) {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }
  let state = loadState();

  // ---------- utils ----------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const fmtMoney = (n) => (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`);
  const pct = n => `${(n * 100).toFixed(1)}%`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const clampDOMoney = (v) => isFinite(+v) ? +v : 0;

  // date format short like "Oct 04" or with weekday for rows
  const dfShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' });
  const dfRow = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: '2-digit' });

  // ---------- pay period math ----------
  function getLastNextPayday(today, weekday, cadence) {
    // weekday: 0=Sun..6=Sat. cadence: 'weekly'|'biweekly'
    const t = startOfDay(today);
    const diff = (t.getDay() - weekday + 7) % 7; // days since last payday
    const last = new Date(t);
    last.setDate(t.getDate() - diff);
    let next = new Date(last);
    next.setDate(last.getDate() + 7);
    if (cadence === 'biweekly') next.setDate(last.getDate() + 14);
    // If today IS payday, we treat that as "next" (paycheck funds next period)
    if (+t === +last) {
      // today is payday → this period ended yesterday; last = last - periodLen
      const len = cadence === 'biweekly' ? 14 : 7;
      last.setDate(last.getDate() - len);
      next = new Date(t); next.setDate(t.getDate()); // next = today
    }
    return { last, next };
  }
  function getCurrentWindow(today, settings) {
    const weekday = settings.payday?.weekday ?? 5;
    const cadence = settings.payday?.cadence ?? 'weekly';
    const { last, next } = getLastNextPayday(today, weekday, cadence);
    const start = new Date(last); start.setDate(last.getDate() + 1); // day after last payday
    const end = new Date(next);   // exclusive
    return { start, end, last, next, cadence, weekday };
  }

  function periodKey(win) {
    // e.g., "2025-10-04_2025-10-10"
    const d2 = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `${d2(win.start)}_${d2(win.end)}`;
  }

  // Map monthly dueDay (1..31) to a concrete date within/after the start month
  function dueDayToDateAround(dueDay, win) {
    const m = win.start.getMonth(), y = win.start.getFullYear();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const day = Math.min(Math.max(1, dueDay), lastDay);
    let candidate = new Date(y, m, day);
    if (candidate < win.start) {
      // shift to next month
      const y2 = candidate.getMonth() === 11 ? y + 1 : y;
      const m2 = (m + 1) % 12;
      const last2 = new Date(y2, m2 + 1, 0).getDate();
      const day2 = Math.min(day, last2);
      candidate = new Date(y2, m2, day2);
    }
    return candidate;
  }

  function inWindow(date, win) {
    const d = startOfDay(date);
    return d >= startOfDay(win.start) && d < startOfDay(win.end);
  }

  // ---------- totals & lists ----------
  function weeklyEnvelopesTotal() {
    return (state.envelopes || []).reduce((a, e) => a + clampDOMoney(e.weekly || 0), 0);
  }

  function listDueItems(win) {
    const list = [];
    // bills (monthly)
    (state.bills || []).forEach(b => {
      const when = dueDayToDateAround(b.dueDay, win);
      if (inWindow(when, win)) list.push({ kind: 'bill', id: b.id, name: b.name, amount: +b.amount || 0, when });
    });
    // loans (monthly)
    (state.loans || []).forEach(l => {
      const when = dueDayToDateAround(l.dueDay, win);
      if (inWindow(when, win)) list.push({ kind: 'loan', id: l.id, name: l.name, amount: +l.amount || 0, when });
    });
    // one-offs (dated)
    (state.oneOffs || []).forEach(o => {
      if (!o.dateISO) return;
      const when = startOfDay(new Date(o.dateISO));
      if (inWindow(when, win)) {
        const include = (o.defer === true) ? (o.includeThisWeek === true) : true; // defer=on → include only if user toggled on
        list.push({ kind: 'oneoff', id: o.id, name: o.name, amount: +o.amount || 0, when, include, defer: !!o.defer });
      }
    });
    // sort by date, then name
    list.sort((a,b) => (+a.when - +b.when) || a.name.localeCompare(b.name));
    return list;
  }

  function calcThisWeek(win) {
    const bank = +state.bank || 0;
    const buckets = weeklyEnvelopesTotal();
    const faf = +state.settings.fafWeekly || 0;

    const dues = listDueItems(win);
    const mustPays = dues.filter(d => d.kind === 'bill' || d.kind === 'loan')
                         .reduce((a,d)=>a+d.amount,0);
    const oneOffIncluded = dues
      .filter(d => d.kind === 'oneoff' && (d.include !== false))
      .reduce((a,d)=>a+d.amount,0);

    const cashThisWeek = bank; // paycheck excluded this period
    const after = cashThisWeek - mustPays - oneOffIncluded - buckets - faf;

    return { bank, buckets, faf, dues, mustPays, oneOffIncluded, cashThisWeek, after };
  }

  // For Hours page & "next week preview" later
  function estimateNetPay() {
    const s = state.settings || {};
    const gross = (+s.baseRate || 0) * (+s.regHours || 0) +
                  (+s.baseRate || 0) * (+s.otHours || 0) * (+s.otMultiplier || 1);
    const net = gross * (1 - (+s.withholding || 0));
    return { gross, net };
  }

  // ---------- paid tracking ----------
  function isPaid(winKey, kind, id) {
    return !!state.paid?.[winKey]?.[`${kind}:${id}`];
  }
  function setPaid(winKey, kind, id, v) {
    state.paid ||= {};
    state.paid[winKey] ||= {};
    if (v) state.paid[winKey][`${kind}:${id}`] = true;
    else delete state.paid[winKey][`${kind}:${id}`];
    saveState(state);
  }

  // ---------- renderers ----------
  function renderHome() {
    const home = $('#homePage'); if (!home) return;

    const today = startOfDay(new Date());
    const win = getCurrentWindow(today, state.settings);
    const k = periodKey(win);
    const calc = calcThisWeek(win);

    // header chip: "Oct 04–Oct 10 (Fri payday)"
    const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const chip = `${dfShort.format(win.start)}–${dfShort.format(new Date(win.end.getTime()-86400000))} (${weekdayNames[state.settings.payday.weekday]} payday)`;

    // Top card numbers
    const cashLine = fmtMoney(calc.cashThisWeek);
    const afterLine = fmtMoney(calc.after);

    // breakdown details
    const breakdown = [
      `<div>Bank: ${fmtMoney(calc.bank)}</div>`,
      `<div>Buckets: ${fmtMoney(calc.buckets)}</div>`,
      `<div>F*ck Around Funds: ${fmtMoney(calc.faf)}</div>`,
      `<div>Must-pays this week: ${fmtMoney(calc.mustPays)}</div>`,
      `<div>One-offs this week: ${fmtMoney(calc.oneOffIncluded)}</div>`,
    ].join('');

    // Put into DOM (keep your structure; guard by id existence)
    const cashEl = $('#home_cashThisWeek'); if (cashEl) cashEl.textContent = cashLine;
    const afterEl = $('#home_afterDamage'); if (afterEl) {
      afterEl.textContent = afterLine;
      afterEl.classList.toggle('neg', calc.after < 0);
      afterEl.classList.toggle('pos', calc.after >= 0);
    }
    const chipEl = $('#home_periodChip'); if (chipEl) chipEl.textContent = chip;
    const brk = $('#home_breakdown'); if (brk) brk.innerHTML = breakdown;

    // Due list table
    const dueT = $('#home_dueTableBody');
    if (dueT) {
      dueT.innerHTML = '';
      const dues = listDueItems(win);
      dues.forEach(d => {
        const tr = document.createElement('tr');
        const paid = isPaid(k, d.kind, d.id);
        const badge = (d.kind === 'oneoff' && d.defer && d.include === false) ? `<span class="pill pill-deferred">deferred</span>` : '';
        tr.innerHTML = `
          <td>${dfRow.format(d.when)}</td>
          <td>${d.name} <span class="muted">${d.kind}</span> ${badge}</td>
          <td class="money">${fmtMoney(d.amount)}</td>
          <td><button class="btn-small ${paid?'btn-on':''}" data-kind="${d.kind}" data-id="${d.id}">${paid?'Paid ✓':'Paid'}</button></td>
        `;
        dueT.appendChild(tr);
      });
      dueT.querySelectorAll('button.btn-small').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          const id = e.currentTarget.getAttribute('data-id');
          const kind = e.currentTarget.getAttribute('data-kind');
          const val = !isPaid(k, kind, id);
          setPaid(k, kind, id, val);
          renderHome();
        });
      });
    }

    // "Can I afford this?"
    const affordBtn = $('#afford_btn');
    if (affordBtn) {
      affordBtn.onclick = () => {
        const amt = clampDOMoney($('#afford_amount')?.value);
        if (!isFinite(amt) || amt <= 0) return;
        const would = calc.after - amt;
        const out = $('#afford_result');
        if (out) {
          out.textContent = would >= 0 ? `Yep — you’ll still have ${fmtMoney(would)} left.` :
                                         `Nope — you’d be short ${fmtMoney(-would)}.`;
          out.className = 'afford ' + (would>=0 ? 'ok':'bad');
        }
      };
    }
  }

  function renderHours() {
    const c = $('#hoursPage'); if (!c) return;
    const s = state.settings;
    const est = estimateNetPay();
    const withhold = +s.withholding || 0;

    // Inputs: tidy up withholding display
    const wIn = $('#hours_withholding'); if (wIn) {
      wIn.value = (Math.round(withhold * 1000) / 1000).toString();
    }
    const gEl = $('#hours_gross'); if (gEl) gEl.textContent = fmtMoney(est.gross);
    const nEl = $('#hours_net'); if (nEl) nEl.textContent = fmtMoney(est.net);
    const pEl = $('#hours_withhold_pct'); if (pEl) pEl.textContent = pct(withhold);

    // Save handler
    const saveBtn = $('#hours_save'); if (saveBtn) {
      saveBtn.onclick = () => {
        s.baseRate = clampDOMoney($('#hours_base')?.value);
        s.otMultiplier = clampDOMoney($('#hours_otmult')?.value) || 1.5;
        s.regHours = clampDOMoney($('#hours_reg')?.value);
        s.otHours = clampDOMoney($('#hours_ot')?.value);
        s.withholding = clampDOMoney($('#hours_withholding')?.value);
        saveState(state);
        renderHours(); renderHome();
      };
    }
  }

  function renderBillsPage() {
    const c = $('#billsPage'); if (!c) return;
    // Button text: "Add bill" if none, else "Add another"
    const btn = $('#bills_addBtn'); if (btn) {
      btn.textContent = (state.bills?.length || 0) === 0 ? 'Add bill' : 'Add another';
    }
  }

  function renderOneOffsPage() {
    const c = $('#oneOffsPage'); if (!c) return;
    // Defer toggles UI (if your markup has them)
    // We rely on your existing handlers; nothing destructive here.
  }

  function renderSettings() {
    // payday pills
    const c = $('#settingsPage'); if (!c) return;
    const d = state.settings.payday || { cadence:'weekly', weekday:5 };
    const wdNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const chip = $('#home_periodChip'); // updated in renderHome
    // Allow negative bank typing (remove min attribute if present)
    const bankInput = $('#settings_bank'); if (bankInput) {
      bankInput.removeAttribute('min');
      bankInput.setAttribute('inputmode','decimal');
      bankInput.onchange = () => {
        state.bank = clampDOMoney(bankInput.value);
        saveState(state); renderHome();
      };
    }
    // Weekday pills (if present)
    $$('.payday-weekday [data-wd]').forEach(el=>{
      const wd = +el.getAttribute('data-wd');
      el.classList.toggle('active', wd === d.weekday);
      el.onclick = ()=>{ state.settings.payday.weekday = wd; saveState(state); renderHome(); };
    });
    // Cadence pills
    $$('.payday-cadence [data-cad]').forEach(el=>{
      const cad = el.getAttribute('data-cad');
      el.classList.toggle('active', cad === d.cadence);
      el.onclick = ()=>{ state.settings.payday.cadence = cad; saveState(state); renderHome(); };
    });
  }

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    // initial tidy for any numeric fields which should allow negative
    $$('#settings_bank, .allow-negative').forEach(el=>{
      el.removeAttribute('min'); el.setAttribute('inputmode','decimal');
    });
    renderHome(); renderHours(); renderBillsPage(); renderOneOffsPage(); renderSettings();

    // Nav re-render hooks if your code uses hash nav
    window.addEventListener('hashchange', ()=>{ renderHome(); renderHours(); renderBillsPage(); renderOneOffsPage(); renderSettings(); });
  });

  // Expose tiny helpers for wizard save
  window.YDB = window.YDB || {};
  window.YDB.savePaydayFromWizard = (cadence, weekday) => {
    state.settings.payday = { cadence, weekday };
    saveState(state); renderHome(); renderSettings();
  };
  window.YDB.addOneOffIncludeToggle = function(id, include) {
    const o = (state.oneOffs||[]).find(x=>x.id===id);
    if (o) { o.includeThisWeek = !!include; saveState(state); renderHome(); }
  };
})();
</script>
