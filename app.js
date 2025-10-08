// Your Damn Budget v15.6
console.info("YDB app.js v15.6");

const app=document.getElementById('app');

function section(title,body){const s=document.createElement('section');s.className='card';s.innerHTML=`<h2>${title}</h2>${body}`;return s;}

// 🏠 Home
function renderHome(){
  app.appendChild(section('Weekly Damage Report',`
    <p>Cash This Week</p><h3>$0.00</h3>
    <p><b>Fuck Around Funds:</b> $50.00</p>
    <p><b>After Damage:</b> -$50.00</p>
  `));
}

// 🔮 Planner
function renderPlanner(){
  app.appendChild(section('Crystal Ball','12-week overview coming soon'));
}

// ⏱️ Hours
function renderTimesheet(){
  app.appendChild(section('Hours & Paycheck','Overtime calculator here'));
}

// 💸 Bills
function renderBills(){
  app.appendChild(section('Shit That Must Get Paid','Bills list will appear here'));
}

// 🔥 Events
function renderEvents(){
  app.appendChild(section('Catch-Up Shit','Overdue and one-time expenses here'));
}

// 💰 Envelopes
function renderEnvelopes(){
  app.appendChild(section('Where It Goes','Weekly buckets summary'));
}

// 💳 Loans
function renderLoans(){
  app.appendChild(section('Your Damn Debts','Debt tracking section'));
}

// ❤️ Donate
function renderDonate(){
  app.appendChild(section('Donate (optional)',`
    <button class="button primary" onclick="window.open('https://paypal.me/mdsdoc','_blank')">PayPal</button><br><br>
    <button class="button" style="background:#00d64f;color:black;" onclick="window.open('https://cash.app/$mdsdoc','_blank')">Cash App</button>
    <p>Donations are appreciated, but they never unlock features and aren’t required.</p>
  `));
}

// 💬 Feedback
function renderFeedback(){
  const FEEDBACK_ENDPOINT="https://script.google.com/macros/s/AKfycbzXvydQk3zrQ_g2h8JTBQwzxVa5QJgeMxM9kGsBqE_nsXCKTSMR3LZI_K0CcmA0MFWC/exec";
  const ver="15.6";
  const s=section('Feedback',`
    <div class="feedback">
      <label>Type</label>
      <select id="fb_type">
        <option>Idea</option><option>Bug</option><option>Praise</option><option>Question</option>
      </select>
      <label>Message</label>
      <textarea id="fb_msg" placeholder="Tell us what rules, what sucks, or what broke…"></textarea>
      <label class="row"><input id="fb_include" type="checkbox" checked>Include app version and device info</label>
      <label class="row"><input id="fb_anon" type="checkbox">Send anonymously (ignore name/email)</label>
      <button id="fb_send" class="button primary">Send Feedback</button>
    </div>`);
  app.appendChild(s);

  function toast(txt,ok=true){
    const t=document.createElement('div');
    Object.assign(t.style,{position:'fixed',left:'50%',bottom:'20px',transform:'translateX(-50%)',
      background:ok?'#0ea5a8':'#ef4444',color:ok?'#012a2c':'#fff',
      padding:'10px 14px',borderRadius:'10px',zIndex:100,fontWeight:'600'});
    t.textContent=txt;document.body.appendChild(t);setTimeout(()=>t.remove(),2000);
  }

  s.querySelector('#fb_send').onclick=async()=>{
    const type=s.querySelector('#fb_type').value;
    const msg=s.querySelector('#fb_msg').value.trim();
    const anon=s.querySelector('#fb_anon').checked;
    const include=s.querySelector('#fb_include').checked && !anon;
    if(!msg){toast('Say something first.',false);return;}
    const meta=include?`\n---\nApp: YDB v${ver}\nUA: ${navigator.userAgent}`:`\n---\nApp: YDB v${ver}`;
    try{
      const res=await fetch(FEEDBACK_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type,msg,meta})
      });
      if(res.ok){toast('Thanks for your damn feedback 💬');}
      else{throw new Error();}
    }catch{toast('Could not send. Try later.',false);}
  };
}

// ⚙️ Settings
function renderSettings(){
  app.appendChild(section('Settings','Adjust preferences, reset data, or tweak visuals here.'));
}

// 🧭 Safe router
function safeCall(name,fn){
  try{if(typeof fn!=='function'){app.appendChild(section('Oops',`View <b>${name}</b> missing.`));return;}fn();}
  catch(err){app.appendChild(section('Error',`<pre>${err}</pre>`));console.error(err);}
}

function render(){
  app.innerHTML='';
  const v=document.querySelector('nav .tab.active')?.dataset.view||'home';
  const map={
    home:renderHome,planner:renderPlanner,timesheet:renderTimesheet,
    bills:renderBills,events:renderEvents,envelopes:renderEnvelopes,
    loans:renderLoans,donate:renderDonate,feedback:renderFeedback,
    settings:renderSettings
  };
  safeCall(v,map[v]);
}

document.querySelector('nav.tabs').addEventListener('click',e=>{
  const b=e.target.closest('.tab');if(!b)return;
  document.querySelectorAll('nav .tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');render();
});

render();