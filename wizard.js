/* wizard.js — Your Damn Budget — v15.9.0 (LKG)
   - Provides window.openWizard()
   - Wires #runWizard click
   - Saves to STORE_KEY used by v15.9.0 app.js and reloads the page
*/
(function(){
  const STORE_KEY = 'ydb:data:v15.9.0';

  function loadState(){
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; }
    catch { return null; }
  }
  function seedState(){
    return {
      version: 'v15.9.0',
      bank: 0,
      payday: 5, // Fri
      buckets: [],
      bills: [],
      ones: [],
      debts: [],
      pay: { base: 0, otMult: 1.5, withheld: 0.2, reg: 40, ot: 0 },
      feedbackUrl: 'https://script.google.com/macros/s/AKfycbzXvydQk3zrQ_g2h8JTBQwzxVa5QJgeMxM9kGsBqE_nsXCKTSMR3LZI_K0CcmA0MFWC/exec'
    };
  }
  function saveState(state){
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function openWizard(){
    if (document.querySelector('#ydb-wizard-overlay')) return;

    // Overlay (inline styles so it works even if CSS misses)
    const overlay = document.createElement('div');
    overlay.id = 'ydb-wizard-overlay';
    overlay.setAttribute('style',
      'position:fixed;inset:0;z-index:9999;'+
      'background:rgba(0,0,0,.7);backdrop-filter:blur(6px);'+
      'display:flex;align-items:center;justify-content:center;'
    );

    // Card
    const card = document.createElement('div');
    card.setAttribute('style',
      'width:90%;max-width:420px;'+
      'background:#111f2a;border:1px solid #173241;'+
      'border-radius:20px;padding:18px;color:#eaf6ff;'+
      'box-shadow:0 10px 30px rgba(0,0,0,.45);'
    );
    card.innerHTML = `
      <div style="font-weight:800;font-size:22px;margin-bottom:10px;">Let’s set you up</div>

      <label style="display:block;color:#9ab0bf;font-size:12px;">What’s in your account right now?</label>
      <input id="wizBank" inputmode="decimal" placeholder="0"
             style="width:100%;border-radius:12px;padding:10px 12px;background:#0f202b;color:#eaf6ff;border:1px solid #214252;outline:none;margin-top:6px" />
      <div style="margin-top:6px;color:#9ab0bf;font-size:12px;">Tip: You can enter negative if you’re overdrawn.</div>

      <label style="display:block;color:#9ab0bf;font-size:12px;margin-top:12px">Payday weekday</label>
      <select id="wizDay"
              style="width:100%;border-radius:12px;padding:10px 12px;background:#0f202b;color:#eaf6ff;border:1px solid #214252;outline:none;margin-top:6px">
        <option value="0">Sun</option><option value="1">Mon</option><option value="2">Tue</option>
        <option value="3">Wed</option><option value="4">Thu</option><option value="5" selected>Fri</option>
        <option value="6">Sat</option>
      </select>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button id="wizCancel"
                style="background:#133543;color:#cbe7f5;border:1px solid #235164;padding:10px 12px;border-radius:12px;cursor:pointer">
          Cancel
        </button>
        <button id="wizSave"
                style="background:#15b3c5;color:#07262d;font-weight:800;border:none;padding:12px 14px;border-radius:14px;cursor:pointer">
          Save
        </button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Wire buttons
    document.getElementById('wizCancel').onclick = ()=> overlay.remove();
    document.getElementById('wizSave').onclick = ()=>{
      const bank = parseFloat(document.getElementById('wizBank').value || '0') || 0;
      let payday = parseInt(document.getElementById('wizDay').value, 10);
      if (isNaN(payday) || payday < 0 || payday > 6) payday = 5;

      const s = loadState() || seedState();
      s.bank = bank;
      s.payday = payday;
      saveState(s);

      // Reflect in Settings fields (if present now)
      try { const bb = document.getElementById('bankBal'); if (bb) bb.value = bank; } catch {}
      try { const pd = document.getElementById('payday'); if (pd) pd.value = String(payday); } catch {}

      overlay.remove();
      // Force main app to reload and recalc using the updated state
      location.reload();
    };
  }

  // Expose to window (without clobbering if app.js already defined it)
  if (!window.openWizard) window.openWizard = openWizard;

  // Wire settings button on load (id: #runWizard exists in v15.9)
  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.getElementById('runWizard');
    if (btn && !btn.dataset.ydbWizardBound){
      btn.dataset.ydbWizardBound = '1';
      btn.addEventListener('click', openWizard);
    }
  });
})();