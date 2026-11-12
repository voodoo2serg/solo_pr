import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '../store';
import {bumpMetric,logJson} from '../observability';
import {canonicalJson,signPayload,verifySignature} from './signing';
import {integrationEnv,isIntegrationEnabled,setSetting} from './config';
import {claimPending,enqueueOutbox,markOutboxFail,markOutboxOk} from './outbox';

db.exec(`CREATE TABLE IF NOT EXISTS integration_events(
 event_id TEXT PRIMARY KEY,
 source TEXT NOT NULL,
 kind TEXT NOT NULL,
 payload TEXT NOT NULL,
 created TEXT NOT NULL
);`);

export type LeadRow={
 id:string;name:string;email:string;kind:string;service:string;message:string;consent:string;
 ads_consent:number;created:string;contact_type:string;contact:string;
 sync_status?:string;sync_attempts?:number;sync_error?:string;synced_at?:string|null;
};

function ensureLeadSyncColumns(){
 const cols=db.prepare('PRAGMA table_info(leads)').all() as {name:string}[];
 const names=new Set(cols.map(c=>c.name));
 if(!names.has('sync_status'))db.exec("ALTER TABLE leads ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'");
 if(!names.has('sync_attempts'))db.exec('ALTER TABLE leads ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0');
 if(!names.has('sync_error'))db.exec("ALTER TABLE leads ADD COLUMN sync_error TEXT NOT NULL DEFAULT ''");
 if(!names.has('synced_at'))db.exec('ALTER TABLE leads ADD COLUMN synced_at TEXT');
}
ensureLeadSyncColumns();

export function leadCreatedPayload(lead:LeadRow){
 return {
  type:'lead.created',
  idempotency_key:lead.id,
  source:'solo_pr',
  data:{
   id:lead.id,
   contact_type:lead.contact_type||'email',
   contact:lead.contact||lead.email,
   email:lead.email,
   name:lead.name,
   kind:lead.kind,
   service:lead.service,
   message:lead.message,
   consent:lead.consent,
   ads_consent:!!lead.ads_consent,
   created:lead.created,
   source:'solo_pr',
  },
 };
}

export function queueLeadSync(leadId:string){
 const lead=db.prepare('SELECT * FROM leads WHERE id=?').get(leadId) as LeadRow|undefined;
 if(!lead)return;
 db.prepare("UPDATE leads SET sync_status='pending' WHERE id=? AND sync_status!='ok'").run(leadId);
 enqueueOutbox('lead.created',leadCreatedPayload(lead),leadId);
}

async function deliver(url:string,secret:string,payload:unknown){
 const body=canonicalJson(payload);
 const timestamp=String(Date.now());
 const signature=signPayload(secret,body,timestamp);
 const res=await fetch(url,{
  method:'POST',
  headers:{
   'content-type':'application/json',
   'x-solo-timestamp':timestamp,
   'x-solo-signature':'sha256='+signature,
   'x-solo-event':(payload as {type?:string}).type||'event',
   'idempotency-key':(payload as {idempotency_key?:string}).idempotency_key||'',
  },
  body,
  signal:AbortSignal.timeout(12_000),
 });
 if(!res.ok){
  const text=await res.text().catch(()=>'');
  throw new Error('voronka HTTP '+res.status+': '+text.slice(0,200));
 }
}

export async function processOutbox(limit=20){
 if(!isIntegrationEnabled('voronka'))return {processed:0,skipped:true};
 const env=integrationEnv();
 if(!env.voronkaWebhookUrl||!env.voronkaWebhookSecret)return {processed:0,skipped:true};
 let processed=0;
 for(const row of claimPending(limit)){
  if(row.kind!=='lead.created')continue;
  try{
   await deliver(env.voronkaWebhookUrl,env.voronkaWebhookSecret,JSON.parse(row.payload));
   markOutboxOk(row.id);
   db.prepare("UPDATE leads SET sync_status='ok',sync_error='',synced_at=?,sync_attempts=sync_attempts+1 WHERE id=?")
    .run(new Date().toISOString(),row.id);
   setSetting('voronka.last_success','ok');
   processed++;
  }catch(e){
   const msg=e instanceof Error?e.message:'unknown';
   markOutboxFail(row.id,msg);
   db.prepare("UPDATE leads SET sync_status=CASE WHEN sync_attempts+1>=8 THEN 'error' ELSE 'pending' END,sync_error=?,sync_attempts=sync_attempts+1 WHERE id=?")
    .run(msg.slice(0,500),row.id);
   setSetting('voronka.last_error',msg.slice(0,300));
   bumpMetric('lead_sync_failures');
   logJson('error',{event:'lead_sync_fail',route:'integrations/voronka',error:msg,request_id:row.id});
  }
 }
 return {processed,skipped:false};
}

export function verifyInbound(rawBody:string,timestamp:string,signature:string){
 const env=integrationEnv();
 if(!env.voronkaInboundSecret)return false;
 return verifySignature(env.voronkaInboundSecret,rawBody,timestamp,signature);
}

function ensureUserColumns(){
 const cols=db.prepare('PRAGMA table_info(users)').all() as {name:string}[];
 const names=new Set(cols.map(c=>c.name));
 if(!names.has('external_id'))db.exec('ALTER TABLE users ADD COLUMN external_id TEXT');
 if(!names.has('oidc_sub'))db.exec('ALTER TABLE users ADD COLUMN oidc_sub TEXT');
 if(!names.has('club_source'))db.exec("ALTER TABLE users ADD COLUMN club_source TEXT NOT NULL DEFAULT 'manual'");
}
function ensurePurchaseColumns(){
 const cols=db.prepare('PRAGMA table_info(purchases)').all() as {name:string}[];
 const names=new Set(cols.map(c=>c.name));
 if(!names.has('source'))db.exec("ALTER TABLE purchases ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
 if(!names.has('event_id'))db.exec('ALTER TABLE purchases ADD COLUMN event_id TEXT');
}
ensureUserColumns();
ensurePurchaseColumns();

export type AccessEvent={
 event_id:string;
 type:'deal.paid'|'access.granted'|'access.revoked';
 email?:string;
 external_id?:string;
 course_id?:string;
 club?:boolean;
 name?:string;
};

type AccessUser={id:string;external_id?:string|null};
function findOrCreateUser(ev:AccessEvent):AccessUser|null{
 if(ev.external_id){
  const byExt=db.prepare('SELECT id,external_id FROM users WHERE external_id=?').get(ev.external_id) as AccessUser|undefined;
  if(byExt)return byExt;
 }
 if(ev.email){
  const email=ev.email.trim().toLowerCase();
  const byEmail=db.prepare('SELECT id,external_id FROM users WHERE email=?').get(email) as AccessUser|undefined;
  if(byEmail){
   if(ev.external_id&&!byEmail.external_id)db.prepare('UPDATE users SET external_id=? WHERE id=?').run(ev.external_id,byEmail.id);
   return byEmail;
  }
  const id=randomUUID();
  const username=('crm_'+id.replace(/-/g,'').slice(0,12));
  const name=(ev.name||email.split('@')[0]||'Участник').slice(0,80);
  // Placeholder password — OIDC/password reset expected; account not loginable until password set or OIDC.
  db.prepare("INSERT INTO users(id,email,username,name,password,role,club,created,consent,external_id,club_source) VALUES(?,?,?,?,?,'member',0,?,?,?,'voronka')")
   .run(id,email,username,name,'oidc-pending:'+randomUUID(),new Date().toISOString(),JSON.stringify({acceptedAt:new Date().toISOString(),version:'voronka-provision',source:'voronka'}),ev.external_id||null);
  return {id,external_id:ev.external_id||null};
 }
 return null;
}

export function applyAccessEvent(ev:AccessEvent){
 if(!ev.event_id||!ev.type)throw new Error('event_id and type required');
 const seen=db.prepare('SELECT event_id FROM integration_events WHERE event_id=?').get(ev.event_id);
 if(seen)return {ok:true,duplicate:true};
 const user=findOrCreateUser(ev);
 if(!user)throw new Error('email or external_id required');
 const now=new Date().toISOString();
 if(ev.type==='deal.paid'||ev.type==='access.granted'){
  if(ev.course_id){
   const existing=db.prepare('SELECT source FROM purchases WHERE user_id=? AND course_id=?').get(user.id,ev.course_id) as {source:string}|undefined;
   if(!existing){
    db.prepare('INSERT INTO purchases(user_id,course_id,purchased,source,event_id) VALUES(?,?,?,?,?)')
     .run(user.id,ev.course_id,now,'voronka',ev.event_id);
   }else if(existing.source!=='manual'){
    db.prepare("UPDATE purchases SET source='voronka',event_id=? WHERE user_id=? AND course_id=?").run(ev.event_id,user.id,ev.course_id);
   }
  }
  if(ev.club===true){
   const u=db.prepare('SELECT club,club_source FROM users WHERE id=?').get(user.id) as {club:number;club_source:string};
   if(u.club_source!=='manual'||!u.club){
    db.prepare("UPDATE users SET club=1,club_source='voronka' WHERE id=?").run(user.id);
   }
  }
 }
 if(ev.type==='access.revoked'){
  if(ev.course_id){
   const existing=db.prepare('SELECT source FROM purchases WHERE user_id=? AND course_id=?').get(user.id,ev.course_id) as {source:string}|undefined;
   if(existing&&existing.source!=='manual')db.prepare('DELETE FROM purchases WHERE user_id=? AND course_id=?').run(user.id,ev.course_id);
  }
  if(ev.club===true||ev.club===false){
   const u=db.prepare('SELECT club_source FROM users WHERE id=?').get(user.id) as {club_source:string};
   if(u.club_source!=='manual')db.prepare("UPDATE users SET club=0,club_source='voronka' WHERE id=?").run(user.id);
  }
 }
 db.prepare('INSERT INTO integration_events(event_id,source,kind,payload,created) VALUES(?,?,?,?,?)')
  .run(ev.event_id,'voronka',ev.type,JSON.stringify(ev),now);
 db.prepare('INSERT INTO audit(actor,action,created) VALUES(?,?,?)').run('voronka',ev.type+':'+ev.event_id,now);
 setSetting('voronka.last_success',ev.type);
 return {ok:true,duplicate:false,user_id:user.id};
}

export async function pingVoronka(){
 const env=integrationEnv();
 if(!env.voronkaBaseUrl&&!env.voronkaWebhookUrl)throw new Error('VORONKA_BASE_URL / WEBHOOK_URL not set');
 const target=(env.voronkaBaseUrl||env.voronkaWebhookUrl).replace(/\/$/,'')+'/health';
 try{
  const res=await fetch(target,{method:'GET',signal:AbortSignal.timeout(8_000)});
  const ok=res.ok||res.status===404; // 404 means host up but no health yet
  setSetting(ok?'voronka.last_success':'voronka.last_error',ok?'ping':'HTTP '+res.status);
  return {ok,status:res.status,urlMasked:target.replace(/https?:\/\/[^/]+/,'https://***')};
 }catch(e){
  const msg=e instanceof Error?e.message:'ping failed';
  setSetting('voronka.last_error',msg.slice(0,300));
  throw e;
 }
}

/** Read-only CRM snapshot for account BFF (mock-friendly). */
export async function fetchCrmSnapshot(email:string){
 if(!isIntegrationEnabled('voronka'))return {enabled:false,deals:[],note:'Интеграция с voronka выключена.'};
 const env=integrationEnv();
 if(!env.voronkaBaseUrl||!env.voronkaWebhookSecret)return {enabled:true,configured:false,deals:[],note:'VORONKA_BASE_URL не задан — статусы сделок недоступны.'};
 const path='/api/m2m/contacts/by-email?email='+encodeURIComponent(email);
 const url=env.voronkaBaseUrl.replace(/\/$/,'')+path;
 const timestamp=String(Date.now());
 const body='';
 const signature=signPayload(env.voronkaWebhookSecret,body,timestamp);
 try{
  const res=await fetch(url,{
   headers:{'x-solo-timestamp':timestamp,'x-solo-signature':'sha256='+signature,'accept':'application/json'},
   signal:AbortSignal.timeout(8_000),
  });
  if(!res.ok){
   setSetting('voronka.last_error','crm snapshot HTTP '+res.status);
   return {enabled:true,configured:true,deals:[],note:'CRM временно недоступна ('+res.status+').'};
  }
  const data=await res.json() as {deals?:unknown[]};
  setSetting('voronka.last_success','crm_snapshot');
  return {enabled:true,configured:true,deals:data.deals||[],note:null};
 }catch{
  return {enabled:true,configured:true,deals:[],note:'CRM недоступна. Показаны только локальные данные сайта.'};
 }
}
