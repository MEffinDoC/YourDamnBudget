// YDB v14a
export const iso = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); };
export function computeWeekPay(payRules, hours) {
  const base = Number(payRules?.baseHourly || 0);
  const withhold = Number(payRules?.withholdingRatio ?? 0.2);
  let gross = 0;
  if (hours?.mode === 'advanced') {
    const r = Number(hours?.regular || 0);
    const h15 = Number(hours?.ot15 || 0);
    const h2 = Number(hours?.ot2 || 0);
    gross = base * r + base * 1.5 * h15 + base * 2.0 * h2;
  } else {
    const r = Number(hours?.regular || 0);
    const ot = Number(hours?.ot || 0);
    const m = Number(hours?.otMultiplier || 1.5);
    gross = base * r + base * m * ot;
  }
  if (!isFinite(gross)) gross = 0;
  const net = Math.max(0, gross * (1 - withhold));
  return { gross, net };
}
export function project(state) {
  const u = state?.user || {};
  const pay = computeWeekPay(state?.payRules || {}, state?.hours || {});
  const weeklyIncome = Number(pay?.net || 0);
  const faf = Number(u?.faFundsPerWeek || 0);
  const variables = (state?.envelopes || []).reduce((s,e)=>s+Number(e.weeklyTarget||0),0);
  const mustPays = (state?.bills||[]).reduce((s,b)=>s + (Number(b.amount||0)/4.345), 0)
                 + (state?.loans||[]).reduce((s,l)=>s + (Number(l.minimumPayment||0)/4.345), 0);
  const out = []; const start = new Date();
  for(let i=0;i<12;i++){ const d = new Date(start); d.setDate(d.getDate() + i*7);
    const left = weeklyIncome - mustPays - variables - faf;
    out.push({ start: iso(d), income: weeklyIncome, mustPays, variables, faf, left });}
  return out;
}
