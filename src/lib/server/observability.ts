import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from './store';
import {hashUserId} from './integrations/signing';

db.exec(`CREATE TABLE IF NOT EXISTS metrics(key TEXT PRIMARY KEY,value INTEGER NOT NULL DEFAULT 0);`);

export type LogFields={
 request_id?:string;
 route?:string;
 user_id?:string|null;
 status?:number;
 latency_ms?:number;
 event?:string;
 error?:string;
 [key:string]:unknown;
};

export function newRequestId(){return randomUUID();}

export function logJson(level:'info'|'warn'|'error',fields:LogFields){
 const line={
  ts:new Date().toISOString(),
  level,
  service:'solo_pr',
  ...fields,
  user_id:fields.user_id?hashUserId(String(fields.user_id)):undefined,
 };
 const text=JSON.stringify(line);
 if(level==='error')console.error(text);
 else if(level==='warn')console.warn(text);
 else console.log(text);
}

export function bumpMetric(key:string,by=1){
 db.prepare('INSERT INTO metrics(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=value+?').run(key,by,by);
}

export function readMetrics(){
 return Object.fromEntries((db.prepare('SELECT key,value FROM metrics').all() as {key:string;value:number}[]).map(r=>[r.key,r.value]));
}

export function sqliteReadable():boolean{
 try{db.prepare('SELECT 1').get();return true;}catch{return false;}
}
