/* Your Damn Budget — v16.0.2 */
(function () {
  const VERSION = 'v16.0.2';

  // ---------- storage ----------
  const LS_KEY = 'ydb_state';
  const def = () => ({
    meta:{version:VERSION},
    bank:0,
    settings:{ payday:{cadence:'weekly',weekday:5}, fafWeekly:50, withholding:0.2, baseRate:20, otMultiplier:1.5, regHours:40, otHours:0 },
    bills:[], loans:[], oneOffs:[], envelopes:[],
    paid:{}
  });
  const load = () => { try{ return JSON.parse(localStorage.getItem(LS_KEY))||def(); }catch{ return def(); } };
  const save = (s) => localStorage.setItem(LS_KEY, JSON.stringify(s));
  let S = load();

  // ---------- utils ----------
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const n = v => (isFinite(+v)?+v:0);
  const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const money = v => (v<0?`-$${Math.abs(v).toFixed(2)}`:`$${v.toFixed(2)}`);
  const pct = v => `${(v*100).toFixed(1)}%`;
  const dfShort = new Intl.DateTimeFormat(undefined,{month:'short',day:'2-digit'});
  const dfRow   = new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'2-digit'});

  // ---------- payday window ----------
  function lastNext(today, weekday, cadence){
    const t=sod(today);
    const diff=(t.getDay()-weekday+7)%7;
    const last=new Date(t); last.setDate(t.getDate()-diff);
    let next=new Date(last); next.setDate(last.getDate()+(cadence==='biweekly'?14:7));
    if (+t===+last){ const len=(cadence==='biweekly'?14:7); last.setDate(last.getDate()-len); next=new Date(t); }
    return {last,next};
  }
  function windowNow(){
    const weekday=S.settings?.payday?.weekday??5;
    const cadence=S.settings?.payday?.cadence||'weekly';
    const {last,next}=lastNext(new Date(),weekday,cadence);
    const start=new Date(last); start.setDate(last.getDate()+1);
    const end=new Date(next);
    return {start,end,last,next,cadence,weekday};
  }
  const inWin = (d,w)=>{ const x=sod(d); return x>=sod(w.start)&&x<sod(w.end); };
  const periodKey = (w)=> `${w.start.toISOString().slice(0,10)}_${w.end.toISOString().slice(0,10)}`;

  function dueDayToDateAround(dueDay,w){
    const m=w.start.getMonth(), y=w.start.getFullYear();
    const lastDay=new Date(y,m+1,0).getDate();
    const day=Math.min(Math.max(1,dueDay),lastDay);
    let c=new Date(y,m,day);
    if (c<w.start){
      const m2=(m+1)%12, y2=(m===11?y+1:y);
      const last2=new Date(y2,m2+1,0).getDate();
      c=new Date(y2,m2,Math.min(day,last2));
    }
    return c;
  }

  // ---------- calc ----------
  function weeklyEnvelopes(){ return (S.envelopes||[]).reduce((a,e)=>a+n(e.weekly),0); }
  function listDue(w){
    const L=[];
    (S.bills||[]).forEach(b=>{const when=dueDayToDateAround(b.dueDay,w); if(inWin(when,w)) L.push({kind:'bill',...b,when});});
    (S.loans||[]).forEach(l=>{const when=dueDayToDateAround(l.dueDay,w); if(inWin(when,w)) L.push({kind:'loan',...l,when});});
    (S.oneOffs||[]).forEach(o=>{
      if(!o.dateISO) return; const when=sod(new Date(o.dateISO));
      if(inWin(when,w)){ const include=(o.defer===true)?(o.includeThisWeek===true):true; L.push({kind:'oneoff',...o,when,include}); }
    });
    L.sort((a,b)=>(+a.when-+b.when)||a.name.localeCompare(b.name));
    return L;
  }
  function estimateNet(){
    const s=S.settings||{};
    const gross=(+s.baseRate||0)*(+s.regHours||0) + (+s.baseRate||0)*(+s.otHours||0)*(+s.otMultiplier||1);
    return {gross, net:gross*(1-(+s.withholding||0))};
  }
  function calcWeek(){
    const w=windowNow(); const k=periodKey(w);
    const bank=+S.bank||0;
    const dues=listDue(w);
    const must=dues.filter(d=>d.kind!=='oneoff').reduce((a,d)=>a+n(d.amount),0);
    const oneInc=dues.filter(d=>d.kind==='oneoff' && d.include!==false).reduce((a,d)=>a+n(d.amount),0);
    const buckets=weeklyEnvelopes();
    const faf=+S.settings.fafWeekly||0;
    const cash=bank; // paycheck excluded
    const after=cash-must-oneInc-buckets-faf;
    return {w,k,bank,cash,dues,must,oneInc,buckets,faf,after};
  }

  // ---------- paid tracking ----------
  const isPaid=(k,kind,id)=>!!S.paid?.[k]?.[`${kind}:${id}`];
  function setPaid(k,kind,id,val){ S.paid ||= {}; S.paid[k] ||= {}; if(val) S.paid[k][`${kind}:${id}`]=true; else delete S.paid[k][`${kind}:${id}`]; save(S); }

  // ---------- render ----------
  function renderHome(){
    const res=calcWeek();
    $('#home_cashThisWeek').textContent=money(res.cash);
    $('#home_afterDamage').textContent=money(res.after);
    $('#home_afterDamage').classList.toggle('neg',res.after<0);
    $('#home_afterDamage').classList.toggle('pos',res.after>=0);
    const wkName=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][S.settings.payday.weekday];
    $('#home_periodChip').textContent =
      `${dfShort.format(res.w.start)}–${dfShort.format(new Date(res.w.end.getTime()-86400000))} (${wkName} payday)`;

    $('#home_breakdown').innerHTML = [
      `<div>Bank: ${money(res.bank)}</div>`,
      `<div>Buckets: ${money(res.buckets)}</div>`,
      `<div>F*ck Around Funds: ${money(res.faf)}</div>`,
      `<div>Must-pays this week: ${money(res.must)}</div>`,
      `<div>One-offs this week: ${money(res.oneInc)}</div>`
    ].join('');

    // due table
    const body=$('#home_dueTableBody'); body.innerHTML='';
    res.dues.forEach(d=>{
      const tr=document.createElement('tr');
      const badge=(d.kind==='oneoff' && d.defer && d.include===false)?`<span class="pill pill-deferred">deferred</span>`:'';
      const paid=isPaid(res.k,d.kind,d.id);
      tr.innerHTML=`
        <td>${dfRow.format(d.when)}</td>
        <td>${d.name} <span class="muted">${d.kind}</span> ${badge}</td>
        <td class="right">${money(+d.amount||0)}</td>
        <td class="right"><button class="btn-small ${paid?'btn-on':''}" data-kind="${d.kind}" data-id="${d.id}">${paid?'Paid ✓':'Paid'}</button></td>`;
      body.appendChild(tr);
    });
    body.querySelectorAll('button').forEach(b=>{
      b.onclick=()=>{ setPaid(res.k, b.getAttribute('data-kind'), b.getAttribute('data-id'), !b.classList.contains('btn-on')); renderHome(); };
    });

    // afford
    const btn=$('#afford_btn');
    if(btn){
      btn.onclick=()=>{
        const amt=n($('#afford_amount').value);
        if(!(amt>0)) return;
        const would=res.after-amt;
        const out=$('#afford_result');
        out.textContent = would>=0?`Yep — you’ll still have ${money(would)} left.`:`Nope — you’d be short ${money(-would)}.`;
        out.className='afford '+(would>=0?'ok':'bad');
      };
    }
  }

  function renderHours(){
    const s=S.settings;
    $('#hours_base').value = s.baseRate ?? 20;
    $('#hours_otmult').value = s.otMultiplier ?? 1.5;
    $('#hours_reg').value = s.regHours ?? 40;
    $('#hours_ot').value   = s.otHours ?? 0;
    $('#hours_withholding').value = (Math.round((s.withholding??0)*1000)/1000);

    const est=estimateNet();
    $('#hours_gross').textContent = money(est.gross);
    $('#hours_net').textContent   = money(est.net);
    $('#hours_withhold_pct').textContent = pct(s.withholding??0);

    $('#hours_save').onclick=()=>{
      s.baseRate=n($('#hours_base').value);
      s.otMultiplier=n($('#hours_otmult').value)||1.5;
      s.regHours=n($('#hours_reg').value);
      s.otHours=n($('#hours_ot').value);
      s.withholding=n($('#hours_withholding').value);
      save(S); renderHours(); renderHome();
    };
  }

  function renderBills(){
    const body=$('#bills_body'); if (!body) return;
    const addBtn=$('#bills_addBtn'); if (addBtn) addBtn.textContent = (S.bills?.length||0) ? 'Add another' : 'Add bill';
    body.innerHTML='';
    (S.bills||[]).forEach((b,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${b.name}</td><td class="right">${money(+b.amount||0)}</td><td class="right">${b.dueDay}</td>
        <td class="right"><button class="btn-small" data-i="${i}">Delete</button></td>`;
      body.appendChild(tr);
    });
    body.querySelectorAll('button').forEach(btn=>{
      btn.onclick=()=>{ const i=+btn.getAttribute('data-i'); S.bills.splice(i,1); save(S); renderBills(); renderHome(); };
    });
    addBtn.onclick=()=>{
      const name=$('#b_name').value.trim(); const amt=n($('#b_amt').value); const day=n($('#b_day').value)||1;
      if(!name) return;
      S.bills.push({id:crypto.randomUUID(),name,amount:amt,dueDay:day}); save(S);
      $('#b_name').value=''; $('#b_amt').value=''; $('#b_day').value='';
      renderBills(); renderHome();
    };
  }

  function renderOneOffs(){
    const body=$('#oneoff_body'); if(!body) return; body.innerHTML='';
    (S.oneOffs||[]).forEach((o,i)=>{
      const tr=document.createElement('tr');
      const chk = `<input type="checkbox" ${o.includeThisWeek!==false?'checked':''} data-i="${i}" class="oo_inc">`;
      tr.innerHTML=`<td>${o.dateISO||''}</td><td>${o.name} ${o.defer?'<span class="pill pill-deferred">deferred</span>':''}</td>
        <td class="right">${money(+o.amount||0)}</td><td class="right">${chk}</td>
        <td class="right"><button class="btn-small" data-i="${i}">Delete</button></td>`;
      body.appendChild(tr);
    });
    body.querySelectorAll('button').forEach(b=>{ b.onclick=()=>{ const i=+b.getAttribute('data-i'); S.oneOffs.splice(i,1); save(S); renderOneOffs(); renderHome(); };});
    body.querySelectorAll('.oo_inc').forEach(ch=>{
      ch.onchange=()=>{ const i=+ch.getAttribute('data-i'); S.oneOffs[i].includeThisWeek = ch.checked; save(S); renderHome(); };
    });
    $('#o_add').onclick=()=>{
      const name=$('#o_name').value.trim(); const amt=n($('#o_amt').value); const date=$('#o_date').value; const def=$('#o_defer').checked;
      if(!name||!date) return;
      S.oneOffs.push({id:crypto.randomUUID(),name,amount:amt,dateISO:date,defer:def,includeThisWeek:!def});
      save(S); $('#o_name').value=''; $('#o_amt').value=''; $('#o_date').value=''; $('#o_defer').checked=true;
      renderOneOffs(); renderHome();
    };
  }

  function renderDebts(){
    const body=$('#debts_body'); if(!body) return; body.innerHTML='';
    (S.loans||[]).forEach((d,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${d.name}</td><td class="right">${money(+d.amount||0)}</td><td class="right">${d.dueDay}</td>
        <td class="right"><button class="btn-small" data-i="${i}">Delete</button></td>`;
      body.appendChild(tr);
    });
    body.querySelectorAll('button').forEach(b=>{ b.onclick=()=>{ const i=+b.getAttribute('data-i'); S.loans.splice(i,1); save(S); renderDebts(); renderHome(); };});
    $('#d_add').onclick=()=>{
      const name=$('#d_name').value.trim(); const amt=n($('#d_amt').value); const day=n($('#d_day').value)||1;
      if(!name) return;
      S.loans.push({id:crypto.randomUUID(),name,amount:amt,dueDay:day}); save(S);
      $('#d_name').value=''; $('#d_amt').value=''; $('#d_day').value='';
      renderDebts(); renderHome();
    };
  }

  function renderSettings(){
    $('#settings_bank').value = S.bank ?? 0;
    $('#settings_bank').onchange = ()=>{ S.bank=n($('#settings_bank').value); save(S); renderHome(); };

    $('#settings_faf').value = S.settings.fafWeekly ?? 50;
    $('#settings_faf').onchange = ()=>{ S.settings.fafWeekly=n($('#settings_faf').value); save(S); renderHome(); };

    // cadence pills
    $$('.payday-cadence [data-cad]').forEach(el=>{
      const cad=el.getAttribute('data-cad');
      el.classList.toggle('active', cad===(S.settings.payday.cadence||'weekly'));
      el.onclick=()=>{ S.settings.payday.cadence=cad; save(S); renderHome(); renderSettings(); };
    });
    // weekday pills
    $$('.payday-weekday [data-wd]').forEach(el=>{
      const wd=+el.getAttribute('data-wd');
      el.classList.toggle('active', wd===(S.settings.payday.weekday??5));
      el.onclick=()=>{ S.settings.payday.weekday=wd; save(S); renderHome(); renderSettings(); };
    });

    $('#app_version').textContent = VERSION;
  }

  // ---------- feedback ----------
  function setupFeedback(){
    const toast=(msg,ok)=>{ const t=$('#fb_toast'); t.textContent=msg; t.className='toast '+(ok?'ok':'bad'); setTimeout(()=>t.className='toast',2500); };
    const endpoint = 'https://script.google.com/macros/s/AKfycbzXvydQk3zrQ_g2h8JTBQwzxVa5QJgeMxM9kGsBqE_nsXCKTSMR3LZI_K0CcmA0MFWC/exec';

    $('#fb_send').onclick=async()=>{
      const type=$('#fb_type').value;
      const msg=$('#fb_msg').value.trim();
      const includeMeta=$('#fb_includeMeta').checked;
      const anon=$('#fb_anon').checked;
      if(!msg){ toast('Say something first.',false); return; }
      const meta = includeMeta ? {
        app:'YDB', version: VERSION,
        ua: navigator.userAgent, lang: navigator.language,
        viewport: `${window.innerWidth}x${window.innerHeight}`
      } : null;
      try{
        const res = await fetch(endpoint, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ type, message: msg, anonymous: !!anon, meta })
        });
        const ok = res.ok;
        if(ok){ $('#fb_msg').value=''; toast('Feedback sent — thanks!',true); }
        else  { toast('Could not send. Try again later.',false); }
      }catch{ toast('Could not send. Try again later.',false); }
    };

    $('#fb_email').onclick=()=>{
      const body = encodeURIComponent($('#fb_msg').value || '');
      window.location.href = `mailto:yourdamnbudget@gmail.com?subject=YDB%20Feedback&body=${body}`;
    };
    $('#fb_copy').onclick=()=>{
      const t = `Type: ${$('#fb_type').value}\n\n${$('#fb_msg').value}`;
      navigator.clipboard.writeText(t); const toastEl=$('#fb_toast'); toast('Copied to clipboard',true);
    };
  }

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', ()=>{
    // numeric inputs that can be negative
    $$('.allow-negative').forEach(el=>{ el.removeAttribute('min'); el.setAttribute('inputmode','decimal'); });

    renderHome(); renderHours(); renderBills(); renderOneOffs(); renderDebts(); renderSettings(); setupFeedback();
    window.addEventListener('hashchange', ()=>{ renderHome(); renderHours(); renderBills(); renderOneOffs(); renderDebts(); renderSettings(); });
  });

  // expose for wizard
  window.YDB = window.YDB || {};
  window.YDB.savePaydayFromWizard = (cad,wd)=>{ S.settings.payday={cadence:cad, weekday:wd}; save(S); renderHome(); renderSettings(); };
})();