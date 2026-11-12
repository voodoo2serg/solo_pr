import 'server-only';
import {db} from '../store';
import {content} from '../store';
import {bumpMetric,logJson} from '../observability';
import {canonicalJson,oneTimeCode,signPayload} from './signing';
import {integrationEnv,isIntegrationEnabled,setSetting} from './config';

db.exec(`CREATE TABLE IF NOT EXISTS lms_handoff(
 code TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 course_id TEXT NOT NULL,
 lms_course_id TEXT NOT NULL,
 expires INTEGER NOT NULL,
 used INTEGER NOT NULL DEFAULT 0
);`);

export type LmsCourseBinding={
 courseId:string;
 lmsCourseId:string|null;
 launchUrl:string|null;
};

export function courseBindings():LmsCourseBinding[]{
 const c=content();
 return c.courses.map(course=>({
  courseId:course.id,
  lmsCourseId:(course as {lmsCourseId?:string}).lmsCourseId||null,
  launchUrl:(course as {lmsLaunchUrl?:string}).lmsLaunchUrl||null,
 }));
}

export type LmsStatus={
 course_id:string;
 lms_course_id:string|null;
 status:'unavailable'|'not_enrolled'|'enrolled'|'active'|'completed'|'revoked';
 progress?:number|null;
 launch_available:boolean;
 note?:string;
};

export async function fetchLmsStatuses(user:{id:string;email:string},purchasedCourseIds:string[]):Promise<LmsStatus[]>{
 const bindings=courseBindings().filter(b=>purchasedCourseIds.includes(b.courseId));
 if(!isIntegrationEnabled('lms')){
  return bindings.map(b=>({
   course_id:b.courseId,
   lms_course_id:b.lmsCourseId,
   status:b.lmsCourseId?'unavailable':'unavailable',
   progress:null,
   launch_available:false,
   note:'Интеграция с lms_end выключена. Показаны локальные доступы сайта.',
  }));
 }
 const env=integrationEnv();
 if(!env.lmsBaseUrl||!env.lmsApiSecret){
  return bindings.map(b=>({
   course_id:b.courseId,
   lms_course_id:b.lmsCourseId,
   status:'unavailable',
   progress:null,
   launch_available:!!b.launchUrl,
   note:'LMS_BASE_URL не задан.',
  }));
 }
 const out:LmsStatus[]=[];
 for(const b of bindings){
  if(!b.lmsCourseId){
   out.push({course_id:b.courseId,lms_course_id:null,status:'unavailable',progress:null,launch_available:false,note:'У курса нет lms_course_id в CMS.'});
   continue;
  }
  try{
   const path='/api/m2m/enrollment?email='+encodeURIComponent(user.email)+'&course_id='+encodeURIComponent(b.lmsCourseId);
   const url=env.lmsBaseUrl.replace(/\/$/,'')+path;
   const timestamp=String(Date.now());
   const signature=signPayload(env.lmsApiSecret,'',timestamp);
   const res=await fetch(url,{
    headers:{'x-solo-timestamp':timestamp,'x-solo-signature':'sha256='+signature,'accept':'application/json'},
    signal:AbortSignal.timeout(8_000),
   });
   if(res.status===404){
    out.push({course_id:b.courseId,lms_course_id:b.lmsCourseId,status:'not_enrolled',progress:null,launch_available:false});
    continue;
   }
   if(!res.ok)throw new Error('HTTP '+res.status);
   const data=await res.json() as {status?:string;progress?:number};
   const status=(['enrolled','active','completed','revoked'].includes(String(data.status))?data.status:'enrolled') as LmsStatus['status'];
   out.push({
    course_id:b.courseId,
    lms_course_id:b.lmsCourseId,
    status,
    progress:typeof data.progress==='number'?data.progress:null,
    launch_available:status!=='revoked'&&status!=='not_enrolled',
   });
   setSetting('lms.last_success','enrollment');
  }catch(e){
   const msg=e instanceof Error?e.message:'lms error';
   setSetting('lms.last_error',msg.slice(0,300));
   bumpMetric('lms_fetch_failures');
   logJson('warn',{event:'lms_status_fail',route:'integrations/lms',error:msg,user_id:user.id});
   out.push({
    course_id:b.courseId,
    lms_course_id:b.lmsCourseId,
    status:'unavailable',
    progress:null,
    launch_available:!!b.launchUrl,
    note:'Статус LMS временно недоступен.',
   });
  }
 }
 return out;
}

function userHasCourseAccess(userId:string,courseId:string){
 const purchase=db.prepare('SELECT 1 AS ok FROM purchases WHERE user_id=? AND course_id=?').get(userId,courseId) as {ok:number}|undefined;
 if(purchase)return true;
 const user=db.prepare('SELECT role FROM users WHERE id=?').get(userId) as {role:string}|undefined;
 return user?.role==='admin';
}

/** Create one-time SSO handoff ticket for LMS launch (no password sharing). */
export function createLmsHandoff(userId:string,courseId:string){
 if(!courseId)throw new Error('courseId required');
 if(!userHasCourseAccess(userId,courseId))throw new Error('Нет доступа к курсу');
 const binding=courseBindings().find(b=>b.courseId===courseId);
 if(!binding?.lmsCourseId)throw new Error('Курс не связан с LMS');
 const code=oneTimeCode();
 const expires=Date.now()+5*60*1000;
 db.prepare('INSERT INTO lms_handoff(code,user_id,course_id,lms_course_id,expires,used) VALUES(?,?,?,?,?,0)')
  .run(code,userId,courseId,binding.lmsCourseId,expires);
 const env=integrationEnv();
 const base=(binding.launchUrl||(env.lmsBaseUrl?env.lmsBaseUrl.replace(/\/$/,'')+'/launch':''));
 if(!base)throw new Error('Нет launch URL для курса');
 const url=base+(base.includes('?')?'&':'?')+'ticket='+encodeURIComponent(code)+'&course='+encodeURIComponent(binding.lmsCourseId);
 return {url,expires_at:new Date(expires).toISOString(),ticket:code};
}

export function consumeHandoff(code:string){
 const row=db.prepare('SELECT * FROM lms_handoff WHERE code=?').get(code) as
  {code:string;user_id:string;course_id:string;lms_course_id:string;expires:number;used:number}|undefined;
 if(!row||row.used||row.expires<Date.now())return null;
 // Re-check grant at redeem time (revokes must stick).
 if(!userHasCourseAccess(row.user_id,row.course_id)){
  db.prepare('UPDATE lms_handoff SET used=1 WHERE code=?').run(code);
  return null;
 }
 db.prepare('UPDATE lms_handoff SET used=1 WHERE code=?').run(code);
 const user=db.prepare('SELECT id,email,name,external_id FROM users WHERE id=?').get(row.user_id) as
  {id:string;email:string;name:string;external_id?:string}|undefined;
 if(!user)return null;
 return {
  ticket:row.code,
  user_id:user.id,
  email:user.email,
  name:user.name,
  external_id:user.external_id||null,
  course_id:row.course_id,
  lms_course_id:row.lms_course_id,
 };
}

export async function pingLms(){
 const env=integrationEnv();
 if(!env.lmsBaseUrl)throw new Error('LMS_BASE_URL not set');
 const target=env.lmsBaseUrl.replace(/\/$/,'')+'/health';
 try{
  const res=await fetch(target,{method:'GET',signal:AbortSignal.timeout(8_000)});
  const ok=res.ok||res.status===404;
  setSetting(ok?'lms.last_success':'lms.last_error',ok?'ping':'HTTP '+res.status);
  return {ok,status:res.status};
 }catch(e){
  const msg=e instanceof Error?e.message:'ping failed';
  setSetting('lms.last_error',msg.slice(0,300));
  throw e;
 }
}

export async function notifyLmsSubjectEvent(kind:'subject.export'|'subject.delete',payload:unknown){
 if(!isIntegrationEnabled('lms'))return {sent:false};
 const env=integrationEnv();
 if(!env.lmsBaseUrl||!env.lmsApiSecret)return {sent:false};
 const body=canonicalJson({type:kind,source:'solo_pr',data:payload});
 const timestamp=String(Date.now());
 const signature=signPayload(env.lmsApiSecret,body,timestamp);
 try{
  await fetch(env.lmsBaseUrl.replace(/\/$/,'')+'/api/m2m/privacy',{
   method:'POST',
   headers:{'content-type':'application/json','x-solo-timestamp':timestamp,'x-solo-signature':'sha256='+signature},
   body,
   signal:AbortSignal.timeout(8_000),
  });
  return {sent:true};
 }catch{return {sent:false};}
}
