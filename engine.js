// YDB v14b
export const iso=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x.toISOString().slice(0,10);}
export function computeWeekPay(payRules,hours){
  const base=+payRules?.baseHourly||0, withhold=+(payRules?.withholdingRatio??0.2); let gross=0;
  if(hours?.mode==='advanced'){gross=base*(+hours.regular||0)+base*1.5*(+hours.ot15||0)+base*2*(+hours.ot2||0);}
  else{gross=base*(+hours.regular||0)+base*((+hours.otMultiplier||1.5))*(+hours.ot||0);}
  if(!isFinite(gross)) gross=0; return {gross, net:Math.max(0,gross*(1-withhold))};
}