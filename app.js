/* Your Damn Budget — v16.0.1
   - Weekly window: day after last payday → next payday (exclusive)
   - This week = BANK ONLY (paycheck funds NEXT week)
   - Due lists include bills/loans in-window; one-offs respect "defer"
*/
(function () {
  const VERSION = 'v16.0.1';

  // ------------ storage ------------
  const LS_KEY = 'ydb_state';
  const defaultState = () => ({
    meta: { version: VERSION },
    bank: 0,
    settings: {
      payday: { cadence: 'weekly', weekday: 5 }, // 0=Sun..6=Sat
      fafWeekly: 50,
      withholding: 0.2,
      baseRate: 20,
      otMultiplier: 1.5,
      regHours: 40,
      otHours: 0,
    },
    bills: [],          // {id,name,amount,dueDay}
    loans: [],          // {id,name,amount,dueDay}
    oneOffs: [],        // {id,name,amount,dateISO,defer:boolean,includeThisWeek?:boolean}
    envelopes: [],      // {id,name,weekly}
    paid: {},           // periodKey -> {"kind:id": true}
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      if (!s.settings) s.settings = {};
      if (!s.settings.payday) {
        const wd = (typeof s.settings.paydayWeekday === 'number') ? s.settings.paydayWeekday : 5;
        s.settings.payday = { cadence: 'weekly', weekday: wd };
      }
      return s;
    } catch { return defaultState(); }
  }
  function saveState(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
  let state = loadState();

  // ------------ utils ------------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const fmtMoney = (n) => (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`);
  const pct = n => `${(n * 100).toFixed(1)}%`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const num = (v) => (isFinite(+v) ? +v : 0);

  const dfShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' });
  const dfRow = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: '2-digit' });

  // ------------ windows / payday ------------
  function getLastNextPayday(today, weekday, cadence) {
    const t = startOfDay(today);
    const diff = (t.getDay() - weekday + 7) % 7; // days since last payday
    const last = new Date(t);
    last.setDate(t.getDate() - diff);
    let next = new Date(last);
    next.setDate(last.getDate() + (cadence === 'biweekly' ? 14 : 7));

    // If today IS payday, treat funds as next period
    if (+t === +last) {
      const len = cadence === 'biweekly' ? 14 : 7;
      last.setDate(last.getDate() - len);
      next = new Date(t);
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
    const d2 = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `${d2(win.start)}_${d2(win.end)}`;
  }

  function dueDayToDateAround(dueDay, win) {
    const m = win.start.getMonth(), y = win.start.getFullYear();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const day = Math.min(Math.max(1, dueDay), lastDay);
    let candidate = new Date(y, m, day);
    if (candidate < win.start) {
      const m2 = (m + 1) % 12;
      const y2 = m === 11 ? y + 1 : y;
      const last2 = new Date(y2, m2 + 1, 0).getDate();
      candidate = new Date(y2, m2, Math.min(day, last2));
    }
    return candidate;
  }
  const inWindow = (date, win) => {
    const d = startOfDay(date);
    return d >= startOfDay(win.start) && d < startOfDay(win.end);
  };

  // ------------ totals / lists ------------
  const weeklyEnvelopesTotal = () =>
    (state.envelopes || []).reduce((a, e) => a + num(e.weekly), 0);

  function listDueItems(win) {
    const list = [];
    (state.bills || []).forEach(b => {
      const when = dueDayToDateAround(b.dueDay, win);
      if (inWindow(when, win)) list.push({ kind: 'bill', id: b.id, name: b.name, amount: +b.amount || 0, when });
    });
    (state.loans || []).forEach(l => {
      const when = dueDayToDateAround(l.dueDay, win);
      if (inWindow(when, win)) list.push({ kind: 'loan', id: l.id, name: l.name, amount: +l.amount || 0, when });
    });
    (state.oneOffs || []).forEach(o => {
      if (!o.dateISO) return;
      const when = startOfDay(new Date(o.dateISO));
      if (inWindow(when, win)) {
        const include = (o.defer === true) ? (o.includeThisWeek === true) : true;
        list.push({ kind: 'oneoff', id: o.id, name: o.name, amount: +o.amount || 0, when, include, defer: !!o.defer });
      }
    });
    list.sort((a,b) => (+a.when - +b.when) || a.name.localeCompare(b.name));
    return list;
  }

  function calcThisWeek(win) {
    const bank = +state.bank || 0;
    const buckets = weeklyEnvelopesTotal();
    const faf = +state.settings.fafWeekly || 0;
    const dues = listDueItems(win);
    const mustPays = dues.filter(d => d.kind !== 'oneoff').reduce((a,d)=>a+d.amount,0);
    const oneOffIncluded = dues.filter(d => d.kind === 'oneoff' && (d.include !== false)).reduce((a,d)=>a+d.amount,0);
    const cashThisWeek = bank; // paycheck excluded this period
    const after = cashThisWeek - mustPays - oneOffIncluded - buckets - faf;
    return { bank, buckets, faf, dues, mustPays, oneOffIncluded, cashThisWeek, after };
  }

  function estimateNetPay() {
    const s = state.settings || {};
    const gross = (+s.baseRate || 0) * (+s.regHours || 0) +
                  (+s.baseRate || 0) * (+s.otHours || 0) * (+s.otMultiplier || 1);
    const net = gross * (1 - (+s.withholding || 0));
    return { gross, net };
  }

  // ------------ paid tracking ------------
  const isPaid = (key, kind, id) => !!state.paid?.[key]?.[`${kind}:${id}`];
  function setPaid(key, kind, id, v) {
    state.paid ||= {};
    state.paid[key] ||= {};
    if (v) state.paid[key][`${kind}:${id}`] = true;
    else delete state.paid[key][`${kind}:${id}`];
    saveState(state);
  }

  // ------------ renderers ------------
  function renderHome() {
    const home = $('#homePage'); if (!home) return;

    const today = startOfDay(new Date());
    const win = getCurrentWindow(today, state.settings);
    const k = periodKey(win);
    const calc = calcThisWeek(win);

    const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const chipText = `${dfShort.format(win.start)}–${dfShort.format(new Date(win.end.getTime()-86400000))} (${weekdayNames[state.settings.payday.weekday]} payday)`;

    const cashEl = $('#home_cashThisWeek'); if (cashEl) cashEl.textContent = fmtMoney(calc.cashThisWeek);
    const afterEl = $('#home_afterDamage'); if (afterEl) {
      afterEl.textContent = fmtMoney(calc.after);
      afterEl.classList.toggle('neg', calc.after < 0);
      afterEl.classList.toggle('pos', calc.after >= 0);
    }
    const chipEl = $('#home_periodChip'); if (chipEl) chipEl.textContent = chipText;
    const brk = $('#home_breakdown'); if (brk) {
      brk.innerHTML = [
        `<div>Bank: ${fmtMoney(calc.bank)}</div>`,
        `<div>Buckets: ${fmtMoney(calc.buckets)}</div>`,
        `<div>F*ck Around Funds: ${fmtMoney(calc.faf)}</div>`,
        `<div>Must-pays this week: ${fmtMoney(calc.mustPays)}</div>`,
        `<div>One-offs this week: ${fmtMoney(calc.oneOffIncluded)}</div>`,
      ].join('');
    }

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

    const affordBtn = $('#afford_btn');
    if (affordBtn) {
      affordBtn.onclick = () => {
        const amt = num($('#afford_amount')?.value);
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

    const wIn = $('#hours_withholding'); if (wIn) wIn.value = (Math.round(withhold*1000)/1000);
    const gEl = $('#hours_gross'); if (gEl) gEl.textContent = fmtMoney(est.gross);
    const nEl = $('#hours_net'); if (nEl) nEl.textContent = fmtMoney(est.net);
    const pEl = $('#hours_withhold_pct'); if (pEl) pEl.textContent = pct(withhold);

    const saveBtn = $('#hours_save'); if (saveBtn) {
      saveBtn.onclick = () => {
        s.baseRate    = num($('#hours_base')?.value);
        s.otMultiplier= num($('#hours_otmult')?.value) || 1.5;
        s.regHours    = num($('#hours_reg')?.value);
        s.otHours     = num($('#hours_ot')?.value);
        s.withholding = num($('#hours_withholding')?.value);
        saveState(state);
        renderHours(); renderHome();
      };
    }
  }

  function renderBillsPage() {
    const c = $('#billsPage'); if (!c) return;
    const btn = $('#bills_addBtn'); if (btn) {
      btn.textContent = (state.bills?.length || 0) === 0 ? 'Add bill' : 'Add another';
    }
  }

  function renderOneOffsPage() { /* table is static HTML; JS not required here */ }

  function renderSettings() {
    const c = $('#settingsPage'); if (!c) return;
    const bankInput = $('#settings_bank');
    if (bankInput) {
      bankInput.removeAttribute('min');
      bankInput.setAttribute('inputmode','decimal');
      bankInput.value = state.bank ?? 0;
      bankInput.onchange = () => { state.bank = num(bankInput.value); saveState(state); renderHome(); };
    }
    // weekday pills
    $$('.payday-weekday [data-wd]').forEach(el=>{
      const wd = +el.getAttribute('data-wd');
      el.classList.toggle('active', wd === (state.settings.payday?.weekday ?? 5));
      el.onclick = ()=>{ state.settings.payday.weekday = wd; saveState(state); renderHome(); };
    });
    // cadence pills
    $$('.payday-cadence [data-cad]').forEach(el=>{
      const cad = el.getAttribute('data-cad');
      el.classList.toggle('active', cad === (state.settings.payday?.cadence || 'weekly'));
      el.onclick = ()=>{ state.settings.payday.cadence = cad; saveState(state); renderHome(); };
    });
  }

  // ------------ boot ------------
  document.addEventListener('DOMContentLoaded', () => {
    $$('#settings_bank, .allow-negative').forEach(el=>{
      el.removeAttribute('min'); el.setAttribute('inputmode','decimal');
    });
    renderHome(); renderHours(); renderBillsPage(); renderOneOffsPage(); renderSettings();
    window.addEventListener('hashchange', ()=>{ renderHome(); renderHours(); renderBillsPage(); renderOneOffsPage(); renderSettings(); });
  });

  // wizard helpers
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