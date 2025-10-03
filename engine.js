// engine.js — projections + pay rules
export function project(state){
  const weeks = [];
  const now = new Date();
  for(let i=0;i<12;i++){
    const weekStart = new Date(now); weekStart.setDate(now.getDate() + i*7);
    const income = estimateWeeklyIncome(state);
    const mustPays = weeklyBillsPortion(state, weekStart);
    const variables = (state.envelopes||[]).reduce((s,e)=>s+Number(e.weeklyTarget||0),0);
    const faf = Number(state.user?.faFundsPerWeek||0);
    const free = income - (mustPays + variables + faf);
    weeks.push({weekStart, income, mustPays, variables, splurge:faf, freeToSpend:free});
  }
  return weeks;
}

export function monthlyReality(state){
  const monthNeed = monthlyBills(state) + monthlyEnvelopes(state) + monthlyFAF(state);
  const earned = monthToDateIncome(state);
  const shortfall = Math.max(0, monthNeed - earned);
  const base = Number(state.payRules?.baseHourly||20);
  const perHourNet = base * (1 - Number(state.payRules?.withholdingRatio??0.2));
  const hoursNeeded = shortfall>0 ? Math.ceil(shortfall / Math.max(1,perHourNet)) : 0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const day = now.getDate();
  const weeksLeft = Math.max(1, Math.ceil((daysInMonth - day)/7));
  const perWeek = shortfall>0 ? Math.ceil(hoursNeeded/weeksLeft) : 0;
  return {monthNeed, earned, shortfall, hoursNeeded, perWeek};
}

function monthlyBills(state){
  return (state.bills||[]).reduce((s,b)=>s+Number(b.amount||0),0) + (state.loans||[]).reduce((s,l)=>s+Number(l.minimumPayment||0),0);
}
function monthlyEnvelopes(state){
  return (state.envelopes||[]).reduce((s,e)=>s+Number(e.weeklyTarget||0),0)*4;
}
function monthlyFAF(state){ return Number(state.user?.faFundsPerWeek||0)*4; }

function weeklyBillsPortion(state){ return (monthlyBills(state))/4; }

function estimateWeeklyIncome(state){
  const ts = (state.timesheets||[]).slice(-1)[0];
  if(ts){ return computeWeekPay(ts.days||[], state.payRules).net; }
  const base = Number(state.payRules?.baseHourly||20);
  const withholding = Number(state.payRules?.withholdingRatio??0.2);
  return base*40*(1-withholding);
}

// --------- paycheck calc with OT rules ---------
export function computeWeekPay(days, rules){
  const base = Number(rules?.baseHourly||20);
  const wh = Number(rules?.withholdingRatio??0.2);
  const schema = rules?.schema||'federal';

  let gross = 0;
  const totalHours = days.reduce((a,b)=>a+Number(b||0),0);

  if(schema==='federal'){
    const ot = Math.max(0, totalHours - 40);
    const reg = totalHours - ot;
    gross = reg*base + ot*base*1.5;
  } else if(schema==='california'){
    for(const h of days){
      const d = Number(h||0);
      const reg = Math.min(8,d);
      const ot15 = Math.min(Math.max(0,d-8), 4);
      const ot2 = Math.max(0, d-12);
      gross += reg*base + ot15*base*1.5 + ot2*base*2;
    }
  } else if(schema==='alaska'){
    let dailyGross=0;
    for(const h of days){
      const d = Number(h||0);
      const reg = Math.min(8,d);
      const ot15 = Math.max(0,d-8);
      dailyGross += reg*base + ot15*base*1.5;
    }
    const weeklyOT = Math.max(0,totalHours-40);
    const weeklyGross = (totalHours-weeklyOT)*base + weeklyOT*base*1.5;
    gross = Math.max(dailyGross, weeklyGross);
  } else if(schema==='colorado'){
    let dailyGross=0;
    for(const h of days){
      const d = Number(h||0);
      const reg = Math.min(12,d);
      const ot15 = Math.max(0,d-12);
      dailyGross += reg*base + ot15*base*1.5;
    }
    const weeklyOT = Math.max(0,totalHours-40);
    const weeklyGross = (totalHours-weeklyOT)*base + weeklyOT*base*1.5;
    gross = Math.max(dailyGross, weeklyGross);
  } else if(schema==='nevada'){
    const daily = rules?.nvDaily8;
    if(daily){
      let dailyGross=0;
      for(const h of days){
        const d = Number(h||0);
        const reg = Math.min(8,d);
        const ot15 = Math.max(0,d-8);
        dailyGross += reg*base + ot15*base*1.5;
      }
      const weeklyOT = Math.max(0,totalHours-40);
      const weeklyGross = (totalHours-weeklyOT)*base + weeklyOT*base*1.5;
      gross = Math.max(dailyGross, weeklyGross);
    } else {
      const ot = Math.max(0,totalHours-40);
      gross = (totalHours-ot)*base + ot*base*1.5;
    }
  } else if(schema==='custom'){
    const weekly = rules?.custom?.weekly || {threshold:40, multiplier:1.5};
    const daily = rules?.custom?.daily || [{threshold:8,multiplier:1},{threshold:12,multiplier:1.5}];
    const above = Number(rules?.custom?.dailyAboveMultiplier||2);

    let dailyGross=0;
    for(const h of days){
      const d = Number(h||0);
      let remain = d, lastThresh = 0, acc = 0;
      for(let i=0;i<daily.length;i++){
        const th = daily[i].threshold;
        const mult = (i===0?1:daily[i-1].multiplier);
        const span = Math.max(0, Math.min(remain, th - lastThresh));
        acc += span*base*mult;
        remain -= span; lastThresh = th;
      }
      const topMult = daily[daily.length-1]?.multiplier || 1.5;
      const aboveMult = Math.max(above, topMult);
      acc += Math.max(0, remain)*base*aboveMult;
      dailyGross += acc;
    }
    const wot = Math.max(0,totalHours - Number(weekly.threshold||40));
    const weeklyGross = (totalHours - wot)*base + wot*base*Number(weekly.multiplier||1.5);
    gross = Math.max(dailyGross, weeklyGross);
  } else {
    const ot = Math.max(0, totalHours - 40);
    gross = (totalHours-ot)*base + ot*base*1.5;
  }

  const net = gross * (1 - wh);
  return {gross, net, totalHours};
}

export function iso(d){ return new Date(d).toISOString().slice(0,10); }

function monthToDateIncome(state){
  const now = new Date();
  const month = now.getMonth(), year = now.getFullYear();
  return (state.timesheets||[]).filter(ts=>{
    const t = new Date(ts.weekStart);
    return t.getFullYear()===year && t.getMonth()===month;
  }).reduce((s,ts)=> s + computeWeekPay(ts.days||[], state.payRules).net, 0);
}