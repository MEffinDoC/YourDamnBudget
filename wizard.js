/* wizard.js — YDB v15.9.0 — modal wizard */
(function(){
  const STORE_KEY = 'ydb:data:v15.9.0';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; } };
  const seed = () => ({
    version:'v15.9.0', bank:0, payday:5, buckets:[], bills:[], ones:[], debts:[],
    pay:{base:0, otMult:1.5, withheld:.20, reg:40, ot:0},
    feedbackUrl:'https://script.google.com/macros/s/AKfycbzXvydQk3zrQ_g2h8JTBQwzxVa5QJgeMxM9kGsBqE_nsXCKTSMR3LZI_K0CcmA0MFWC/exec'
  });
  const save = (s)=> localStorage.setItem(STORE_KEY, JSON.stringify(s));

  function openWizard(){
    if (document.querySelector('#wizard-overlay')) return;
    // overlay
    const ov = document.createElement('div');
    ov.id = 'wizard-overlay';
    ov.innerHTML = `
      <div id="wizard-card">
        <div style="font-weight:800;font-size:22px;margin-bottom:10px">Let’s set you up</div>
        <label>What’s in your account right now?</label>
        <input id="wizBank" inputmode="decimal" placeholder="0"/>
        <div style="margin-top:6px;color:#9ab0bf;font-size:12px">Tip: You can enter negative if you’re overdrawn.</div>
        <label style="margin-top:12px">Payday weekday</label>
        <select id="wizDay">
          <option value="0">Sun</option><option value="1">Mon</option><option value="2">Tue</option>
          <option value="3">Wed</option><option value="4">Thu</option><option value="5" selected>Fri</option>
          <option value="6">Sat</option>
        </select>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button id="wizCancel" class="btn ghost">Cancel</button>
          <button id="wizSave" class="btn">Save</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    // events
    document.getElementById('wizCancel').onclick = ()=> ov.remove();
    document.getElementById('wizSave').onclick = ()=>{
      const bank = parseFloat(document.getElementById('wizBank').value||'0')||0;
      let payday = parseInt(document.getElementById('wizDay').value,10);
      if (isNaN(payday) || payday<0 || payday>6) payday = 5;
      const s = load() || seed();
      s.bank = bank; s.payday = payday;
      save(s);
      ov.remove();
      location.reload(); // ensure app re-renders with new state
    };
  }

  // expose & wire settings button
  if (!window.openWizard) window.openWizard = openWizard;
  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.getElementById('runWizard');
    if (btn && !btn.dataset.wz) { btn.dataset.wz='1'; btn.addEventListener('click', openWizard); }
  });
})();