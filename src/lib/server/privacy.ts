import 'server-only';
import {db} from './store';
import {canonicalJson,signPayload} from './integrations/signing';
import {integrationEnv,isIntegrationEnabled} from './integrations/config';
import {notifyLmsSubjectEvent} from './integrations/lms';
import {unlinkLocalDocumentFiles} from './documents';

export function auditAccess(actor:string,action:string){
 db.prepare('INSERT INTO audit(actor,action,created) VALUES(?,?,?)').run(actor,action,new Date().toISOString());
}

export function exportSubject(userId:string){
 const user=db.prepare('SELECT id,email,username,name,about,role,club,theme,created,consent,external_id,oidc_sub,club_source FROM users WHERE id=?').get(userId);
 if(!user)return null;
 const leads=db.prepare('SELECT id,name,email,kind,service,message,consent,ads_consent,created,contact_type,contact,sync_status FROM leads WHERE email=? OR contact=?')
  .all((user as {email:string}).email,(user as {email:string}).email);
 return {
  exported_at:new Date().toISOString(),
  subject:{
   profile:user,
   leads,
   purchases:db.prepare('SELECT course_id,purchased,source,event_id FROM purchases WHERE user_id=?').all(userId),
   documents:db.prepare('SELECT id,title,url,object_key,storage,created FROM documents WHERE user_id=?').all(userId),
   saved:db.prepare('SELECT material_id,done FROM saved WHERE user_id=?').all(userId),
   attendance:db.prepare('SELECT event_id FROM attendance WHERE user_id=?').all(userId),
   requests:db.prepare('SELECT id,kind,message,created FROM requests WHERE user_id=?').all(userId),
   consents:(user as {consent:string}).consent,
  },
 };
}

async function notifyVoronkaPrivacy(kind:string,payload:unknown){
 if(!isIntegrationEnabled('voronka'))return {sent:false};
 const env=integrationEnv();
 if(!env.voronkaWebhookUrl||!env.voronkaWebhookSecret)return {sent:false};
 const body=canonicalJson({type:kind,source:'solo_pr',data:payload});
 const timestamp=String(Date.now());
 const signature=signPayload(env.voronkaWebhookSecret,body,timestamp);
 try{
  await fetch(env.voronkaWebhookUrl,{
   method:'POST',
   headers:{'content-type':'application/json','x-solo-timestamp':timestamp,'x-solo-signature':'sha256='+signature,'x-solo-event':kind},
   body,
   signal:AbortSignal.timeout(8_000),
  });
  return {sent:true};
 }catch{return {sent:false};}
}

export async function deleteOrAnonymizeSubject(userId:string,actor:string){
 const user=db.prepare('SELECT id,email,external_id FROM users WHERE id=?').get(userId) as {id:string;email:string;external_id?:string}|undefined;
 if(!user)return null;
 const snapshot={user_id:user.id,email:user.email,external_id:user.external_id||null};
 const filesRemoved=unlinkLocalDocumentFiles(userId);
 // Cascade via FK for sessions/saved/attendance/requests/purchases/documents.
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
 db.prepare('DELETE FROM saved WHERE user_id=?').run(userId);
 db.prepare('DELETE FROM attendance WHERE user_id=?').run(userId);
 db.prepare('DELETE FROM requests WHERE user_id=?').run(userId);
 db.prepare('DELETE FROM purchases WHERE user_id=?').run(userId);
 db.prepare('DELETE FROM documents WHERE user_id=?').run(userId);
 // Anonymize leads that match email (retain non-PII stats shape).
 db.prepare("UPDATE leads SET name='[удалено]',email='',contact='',message='[удалено]',consent='{}' WHERE email=?").run(user.email);
 db.prepare('DELETE FROM users WHERE id=?').run(userId);
 auditAccess(actor,'subject.delete:'+userId);
 const voronka=await notifyVoronkaPrivacy('subject.delete',snapshot);
 const lms=await notifyLmsSubjectEvent('subject.delete',snapshot);
 return {ok:true,files_removed:filesRemoved,notified:{voronka,lms}};
}

/** Retention: legal says form data ≤3y; document the job trigger. */
export function retentionSweep(dryRun=true){
 const cutoff=new Date(Date.now()-3*365*24*60*60*1000).toISOString();
 const leads=db.prepare('SELECT id FROM leads WHERE created<?').all(cutoff) as {id:string}[];
 const auditOld=db.prepare('SELECT id FROM audit WHERE created<?').all(cutoff) as {id:string}[];
 if(!dryRun){
  db.prepare('DELETE FROM leads WHERE created<?').run(cutoff);
  db.prepare('DELETE FROM audit WHERE created<?').run(cutoff);
 }
 return {cutoff,leads_to_purge:leads.length,audit_to_purge:auditOld.length,dryRun};
}
