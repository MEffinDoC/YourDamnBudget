// storage.js — namespaced localStorage, backups, schema version
const REPO = (location.pathname.split('/')[1] || 'root').toLowerCase(); // "yourdamnbudget"
const STORAGE_KEY = `ydb:${REPO}:v3`;
const BAK_KEY     = `ydb:${REPO}:backups:v1`;
const SCHEMA = 3;

function defaults(){
  return {
    schemaVersion: SCHEMA,
    meta:{onboarded:false},
    user:{paydayWeekday:5, faFundsPerWeek:50},
    bank:{currentBalance:0},
    bills:[], loans:[], envelopes:[], events:[], timesheets:[],
    payRules:{schema:'federal', baseHourly:20, withholdingRatio:0.2}
  };
}

export function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){
    const d = defaults(); localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); return d;
  }
  let obj; try{ obj = JSON.parse(raw); }catch{ obj = defaults(); }
  if(!obj.schemaVersion || obj.schemaVersion < SCHEMA){
    const list = JSON.parse(localStorage.getItem(BAK_KEY) || '[]');
    list.unshift({id:Date.now().toString(36), name:'Auto-backup (migrate)', ts:Date.now(), data:obj});
    localStorage.setItem(BAK_KEY, JSON.stringify(list.slice(0,20)));
    if(obj.user && obj.user.splurgePerWeek!=null && obj.user.faFundsPerWeek==null){
      obj.user.faFundsPerWeek = obj.user.splurgePerWeek; delete obj.user.splurgePerWeek;
    }
    obj.schemaVersion = SCHEMA;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }
  return obj;
}

export function save(state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

export function makeBackup(name=''){
  const list = JSON.parse(localStorage.getItem(BAK_KEY) || '[]');
  const id = Date.now().toString(36);
  list.unshift({id,name:name||'Backup',ts:Date.now(),data:JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')});
  localStorage.setItem(BAK_KEY, JSON.stringify(list.slice(0,20)));
  return id;
}
export function getBackups(){ return (JSON.parse(localStorage.getItem(BAK_KEY) || '[]')).map(b=>({id:b.id,name:b.name,ts:b.ts})); }
export function restoreBackup(id){
  const list = JSON.parse(localStorage.getItem(BAK_KEY) || '[]');
  const b = list.find(x=>x.id===id); if(!b) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(b.data)); return true;
}
export function deleteBackup(id){
  const list = JSON.parse(localStorage.getItem(BAK_KEY) || '[]').filter(x=>x.id!==id);
  localStorage.setItem(BAK_KEY, JSON.stringify(list));
}
export function importFile(file, cb){
  const r = new FileReader();
  r.onload = ()=>{ try{ const data = JSON.parse(r.result); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); cb?.(true);}catch{cb?.(false)} };
  r.onerror = ()=>cb?.(false);
  r.readAsText(file);
}