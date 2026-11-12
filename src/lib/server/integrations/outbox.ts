import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '../store';

db.exec(`CREATE TABLE IF NOT EXISTS outbox(
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL,
 payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '',
 created TEXT NOT NULL,
 updated TEXT NOT NULL
);`);

export type OutboxRow={
 id:string;kind:string;payload:string;status:string;attempts:number;next_attempt:number;last_error:string;created:string;updated:string;
};

export function enqueueOutbox(kind:string,payload:unknown,id?:string){
 const now=new Date().toISOString();
 const rowId=id||randomUUID();
 const existing=db.prepare('SELECT id,status FROM outbox WHERE id=?').get(rowId) as {id:string;status:string}|undefined;
 if(existing){
  if(existing.status==='ok')return existing.id;
  db.prepare("UPDATE outbox SET payload=?,status='pending',next_attempt=0,updated=? WHERE id=?").run(JSON.stringify(payload),now,rowId);
  return rowId;
 }
 db.prepare('INSERT INTO outbox(id,kind,payload,status,attempts,next_attempt,last_error,created,updated) VALUES(?,?,?,?,0,0,?,?,?)')
  .run(rowId,kind,JSON.stringify(payload),'pending','',now,now);
 return rowId;
}

export function claimPending(limit=20):OutboxRow[]{
 const now=Date.now();
 return db.prepare("SELECT * FROM outbox WHERE status IN ('pending','error') AND next_attempt<=? ORDER BY created ASC LIMIT ?").all(now,limit) as OutboxRow[];
}

export function markOutboxOk(id:string){
 const now=new Date().toISOString();
 db.prepare("UPDATE outbox SET status='ok',last_error='',updated=? WHERE id=?").run(now,id);
}

export function markOutboxFail(id:string,error:string,maxAttempts=8){
 const row=db.prepare('SELECT attempts FROM outbox WHERE id=?').get(id) as {attempts:number};
 const attempts=(row?.attempts||0)+1;
 const dead=attempts>=maxAttempts;
 const delayMs=Math.min(60*60*1000,1000*Math.pow(2,Math.min(attempts,10)));
 const now=new Date().toISOString();
 db.prepare("UPDATE outbox SET status=?,attempts=?,next_attempt=?,last_error=?,updated=? WHERE id=?")
  .run(dead?'dead':'error',attempts,Date.now()+delayMs,error.slice(0,500),now,id);
}

export function outboxStats(){
 const rows=db.prepare('SELECT status,COUNT(*) as n FROM outbox GROUP BY status').all() as {status:string;n:number}[];
 return Object.fromEntries(rows.map(r=>[r.status,r.n]));
}
