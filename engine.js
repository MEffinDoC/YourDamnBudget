// YDB v15
export const iso=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x.toISOString().slice(0,10);}
export const money=n=>(n<0?'-':'')+'$'+Math.abs(+n||0).toFixed(2);
export function computeWeekPay(payRules,hours){
  const base=+payRules?.baseHourly||0, withhold=+(payRules?.withholdingRatio??0.2); let gross=0;
  if(hours?.mode==='advanced'){gross=base*(+hours.regular||0)+base*1.5*(+hours.ot15||0)+base*2*(+hours.ot2||0);}
  else{gross=base*(+hours.regular||0)+base*((+hours.otMultiplier||1.5))*(+hours.ot||0);}
  if(!isFinite(gross)) gross=0; return {gross, net:Math.max(0,gross*(1-withhold))};
}
export function paydayBounds(ref,weekday){const d=new Date(ref),a=(d.getDay()-weekday+7)%7,b=(weekday-d.getDay()+7)%7;const start=new Date(d);start.setDate(d.getDate()-a);start.setHours(0,0,0,0);const end=new Date(d);end.setDate(d.getDate()+b+(b===0?7:0));end.setHours(0,0,0,0);return {start,end};}