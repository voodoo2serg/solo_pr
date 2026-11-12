import {publicationError} from '@/lib/publications';
import {parseContact,inquiryTopic} from '@/lib/inquiries';
import {NextRequest,NextResponse} from 'next/server';
import {randomBytes,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {db,content,saveContent,publicUser,sessionUser,hashPassword,verifyPassword,tokenHash,limit,type User} from '@/lib/server/store';
import type {CommunityContent} from '@/lib/content-types';
import {
 beginOidcLogin,createLmsHandoff,exchangeOidcCode,fetchCrmSnapshot,fetchLmsStatuses,integrationStatusPublic,
 logoutUrl,oidcConfigPublic,outboxStats,pingLms,pingVoronka,processOutbox,queueLeadSync,sanitizeRedirect,setSetting,takeOidcState,upsertOidcUser,
} from '@/lib/server/integrations';
import {addExternalDocument,documentStorageMeta,storeLocalDocument} from '@/lib/server/documents';
import {mediaStorageMeta,readCmsMedia,storeCmsImage} from '@/lib/server/media';
import {auditAccess,deleteOrAnonymizeSubject,exportSubject,retentionSweep} from '@/lib/server/privacy';
import {bumpMetric,logJson,newRequestId} from '@/lib/server/observability';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const COOKIE='solo_session';
const TTL=7*24*60*60*1000;
function json(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function error(message:string,status=400){return json({error:message},status);}
const emailOK=(s:string)=>s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const loginOK=(s:string)=>/^[a-z0-9_.-]{3,40}$/.test(s);
function safeLink(s:string){if(!s)return true;try{return new URL(s).protocol==='https:';}catch{return false;}}
function cookieOptions(){return {httpOnly:true,secure:process.env.COOKIE_SECURE==='true'||(process.env.NODE_ENV==='production'&&process.env.COOKIE_SECURE!=='false'),sameSite:'lax' as const,path:'/',maxAge:TTL/1000};}
function issueSessionToken(u:User){const token=randomBytes(32).toString('base64url');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),u.id,Date.now()+TTL);return token;}
function startSession(u:User){const token=issueSessionToken(u);const res=json({user:publicUser(u)});res.cookies.set(COOKIE,token,cookieOptions());return res;}
/** SPA uses hash routes; after OIDC set session cookie and redirect to /#/<path>. */
function redirectWithSession(u:User,destination:string,req:NextRequest){
 const token=issueSessionToken(u);
 const dest=sanitizeRedirect(destination);
 const origin=(process.env.SITE_ORIGIN||req.nextUrl.origin).replace(/\/$/,'');
 const path=dest.replace(/^\//,'').replace(/^#\/?/,'');
 const out=NextResponse.redirect(origin+'/#/'+(path||'account'));
 out.cookies.set(COOKIE,token,cookieOptions());
 return out;
}

export async function GET(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 const requestId=newRequestId();
 const started=Date.now();
 const route=(await params).path.join('/');const user=sessionUser(req.cookies.get(COOKIE)?.value);const c=content();
 try{
 if(route==='content'){return json({...c,videos:(c.videos||[]).filter((v:any)=>v.published!==false),courses:c.courses.filter((v:any)=>v.published!==false),materials:c.materials.filter((v:any)=>v.published!==false).map(({body,...m})=>m),events:user?c.events.map(({roomUrl,recordingUrl,...e})=>e):[]});}
 if(route==='me')return json({user:user?publicUser(user):null});
 if(route==='auth/oidc')return json(oidcConfigPublic());
 if(route==='avatar'){if(!user?.avatar)return error('Фото не найдено',404);return new NextResponse(new Uint8Array(user.avatar),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 if(route.startsWith('media/')){
  const file=route.slice(6);
  const bytes=readCmsMedia(file);
  if(!bytes)return error('Файл не найден',404);
  return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
 }
 if(route.startsWith('materials/')){const m=c.materials.find(m=>m.published!==false&&m.id===route.slice(10));if(!m)return error('Материал не найден',404);if(m.access==='club'&&!user?.club&&user?.role!=='admin')return error('Материал доступен участникам клуба',403);return json({material:m});}
 if(route==='auth/oidc/start'){
  try{const startedOidc=beginOidcLogin(String(req.nextUrl.searchParams.get('redirect')||'/account'));return json(startedOidc);}
  catch(e){return error(e instanceof Error?e.message:'OIDC недоступен',503);}
 }
 if(route==='auth/oidc/callback'){
  const code=String(req.nextUrl.searchParams.get('code')||'');
  const state=String(req.nextUrl.searchParams.get('state')||'');
  const stateRow=takeOidcState(state);
  if(!code||!stateRow)return error('Некорректный OIDC callback',400);
  try{
   const identity=await exchangeOidcCode(code,stateRow);
   const userId=upsertOidcUser(identity);
   const u=db.prepare('SELECT * FROM users WHERE id=?').get(userId) as User;
   return redirectWithSession(u,stateRow.redirect||'/account',req);
  }catch(e){bumpMetric('auth_failures');return error(e instanceof Error?e.message:'OIDC ошибка',401);}
 }
 if(!user)return error('Войдите в аккаунт',401);
 if(route==='dashboard'){
  const saved=db.prepare('SELECT material_id,done FROM saved WHERE user_id=?').all(user.id);
  const attendance=db.prepare('SELECT event_id FROM attendance WHERE user_id=?').all(user.id) as {event_id:string}[];
  const courses=db.prepare('SELECT course_id,purchased,source FROM purchases WHERE user_id=?').all(user.id) as {course_id:string;purchased:string;source:string}[];
  const documents=db.prepare('SELECT id,title,url,storage,created FROM documents WHERE user_id=?').all(user.id);
  const requests=db.prepare('SELECT kind,created FROM requests WHERE user_id=?').all(user.id);
  const [crm,lms]=await Promise.all([
   fetchCrmSnapshot(user.email),
   fetchLmsStatuses(user,courses.map(c=>c.course_id)),
  ]);
  return json({
   saved,
   events:c.events.filter(e=>attendance.some(a=>a.event_id===e.id)).map(e=>({...e,roomUrl:undefined,recordingUrl:undefined})),
   courses,
   documents,
   requests,
   commerce:{crm,lms,note:'Деньги и AccessGrant — в voronka; LMS — в lms_end; здесь только статусы и deep links.'},
  });
 }
 if(route==='privacy/export'){
  auditAccess(user.id,'subject.export:self');
  const data=exportSubject(user.id);
  return json(data);
 }
 if(route==='admin'){
  if(user.role!=='admin')return error('Недостаточно прав',403);
  auditAccess(user.id,'admin.view_users_leads');
  return json({
   content:c,
   users:db.prepare('SELECT id,name,username,email,club,role,external_id,club_source FROM users ORDER BY created DESC').all(),
   requests:[...db.prepare('SELECT r.*,u.name,u.email FROM requests r JOIN users u ON u.id=r.user_id ORDER BY r.created DESC').all(),...db.prepare('SELECT * FROM leads ORDER BY created DESC').all()],
   integrations:integrationStatusPublic(),
   outbox:outboxStats(),
   documentsMeta:documentStorageMeta,
   mediaMeta:mediaStorageMeta,
  });
 }
 if(route==='admin/integrations'){
  if(user.role!=='admin')return error('Недостаточно прав',403);
  return json({...integrationStatusPublic(),outbox:outboxStats(),documents:documentStorageMeta});
 }
 if(route==='admin/audit'){
  if(user.role!=='admin')return error('Недостаточно прав',403);
  return json({items:db.prepare('SELECT id,actor,action,created FROM audit ORDER BY id DESC LIMIT 200').all()});
 }
 logJson('info',{request_id:requestId,route,user_id:user?.id,status:404,latency_ms:Date.now()-started});
 return error('Не найдено',404);
 }catch(e){
  bumpMetric('http_5xx');
  logJson('error',{request_id:requestId,route,user_id:user?.id,status:500,error:e instanceof Error?e.message:'unknown',latency_ms:Date.now()-started});
  return error('Не удалось выполнить действие. Проверьте данные и повторите.',500);
 }
}

export async function POST(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 const requestId=newRequestId();
 const started=Date.now();
 // All browser writes must originate from the same origin. M2M uses /api/integrations/*.
 const origin=req.headers.get('origin');let originAllowed=false;try{const parsed=new URL(origin||'');originAllowed=['http:','https:'].includes(parsed.protocol)&&(process.env.SITE_ORIGIN?parsed.origin===process.env.SITE_ORIGIN:parsed.origin===new URL(req.url).origin||parsed.host===req.headers.get('host'));}catch{}if(!originAllowed)return error('Недопустимый источник запроса',403);
 const route=(await params).path.join('/');const token=req.cookies.get(COOKIE)?.value;const user=sessionUser(token);
 if(Number(req.headers.get('content-length')||0)>4_500_000)return error('Слишком большой запрос',413);
 let b:Record<string,unknown>;try{const raw=await req.text();if(Buffer.byteLength(raw)>4_500_000)return error('Слишком большой запрос',413);b=JSON.parse(raw);if(!b||Array.isArray(b)||typeof b!=='object')return error('Некорректный запрос');}catch{return error('Некорректный запрос');}
 try{
 if(route==='register'||route==='login'){
  const login=String(b.login||b.email||'').trim().toLowerCase();const pass=String(b.password||'');
  if(!limit('auth:'+tokenHash(login),10,15)||!limit('auth-global',200,15)){bumpMetric('auth_failures');return error('Слишком много попыток. Попробуйте через 15 минут.',429);}
  if(pass.length>128)return error('Пароль слишком длинный');
  if(route==='register'){
   const username=String(b.username||'').trim().toLowerCase();const name=String(b.name||'').trim();
   if(!emailOK(login)||!loginOK(username)||name.length<2||name.length>80||pass.length<12||b.consent!==true)return error('Укажите имя, email, логин и пароль от 12 символов. Подтвердите согласие.');
   const id=randomUUID();const password=await hashPassword(pass);
   db.prepare('INSERT INTO users(id,email,username,name,password,created,consent) VALUES(?,?,?,?,?,?,?)').run(id,login,username,name,password,new Date().toISOString(),JSON.stringify({acceptedAt:new Date().toISOString(),version:'2026-11-06'}));
   return startSession(db.prepare('SELECT * FROM users WHERE id=?').get(id) as User);
  }
  const u=db.prepare('SELECT * FROM users WHERE email=? OR username=?').get(login,login) as User|undefined;
  const valid=await verifyPassword(pass,u?.password||'00000000000000000000000000000000:'+ '00'.repeat(64));
  if(!u||!valid){bumpMetric('auth_failures');return error('Неверный логин или пароль',401);}
  if(u.password.startsWith('oidc:')||u.password.startsWith('oidc-pending:')){bumpMetric('auth_failures');return error('Для этого аккаунта используйте вход через OIDC',401);}
  return startSession(u);
 }
 if(route==='lead'){
  const name=String(b.name||'').trim()||'Гость',kind=String(b.kind||''),service=String(b.service||'').trim();
  const contact=parseContact(b.contactType||'email',b.contact??b.email);
  if(b.consent!==true||!contact||name.length>80||service.length>120||!['business','club','course'].includes(kind))return error('Укажите контакт и подтвердите согласие на обработку данных.');
  const message=inquiryTopic(kind,service,content().courses);
  const now=new Date().toISOString();
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';if(!limit('lead:'+tokenHash(contact.type+':'+contact.value),3,60)||!limit('lead-ip:'+tokenHash(ip),20,60))return error('Заявка уже отправлена. Повторите позже.',429);
  const leadId=randomUUID();
  db.prepare('INSERT INTO leads(id,name,email,kind,service,message,consent,ads_consent,created,contact_type,contact,sync_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
   .run(leadId,name,contact.email,kind,service,message,JSON.stringify({acceptedAt:now,version:'2026-11-12',document:'/consent',privacy:'/privacy',adsConsent:b.adsConsent===true}),b.adsConsent===true?1:0,now,contact.type,contact.value,'pending');
  queueLeadSync(leadId);
  // Fire-and-forget delivery; local lead already persisted.
  processOutbox().catch(err=>logJson('error',{request_id:requestId,route:'lead',event:'outbox_flush_fail',error:err instanceof Error?err.message:'unknown'}));
  return json({ok:true,id:leadId});
 }
 if(!user)return error('Войдите в аккаунт',401);
 if(route==='logout'){
  db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token!));
  const rp=logoutUrl();
  const res=json({ok:true,oidcLogoutUrl:rp});
  res.cookies.set(COOKIE,'',{...cookieOptions(),maxAge:0});
  return res;
 }
 if(route==='profile'){
  const name=String(b.name||'').trim(),username=String(b.username||'').toLowerCase().trim(),about=String(b.about||''),theme=String(b.theme||'system');
  if(name.length<2||name.length>80||!loginOK(username)||about.length>1500||!['light','dark','system'].includes(theme))return error('Проверьте имя, логин и описание профиля.');
  db.prepare('UPDATE users SET name=?,username=?,about=?,theme=? WHERE id=?').run(name,username,about,theme,user.id);return json({user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id) as User)});
 }
 if(route==='password'){
  if(user.password.startsWith('oidc:')||user.password.startsWith('oidc-pending:'))return error('Пароль управляется через IdP',400);
  const next=String(b.password||'');if(next.length<12||next.length>128)return error('Пароль должен содержать от 12 до 128 символов');
  if(!limit('password:'+user.id,8,15))return error('Слишком много попыток',429);
  if(!await verifyPassword(String(b.current||''),user.password))return error('Текущий пароль неверен');
  db.prepare('UPDATE users SET password=? WHERE id=?').run(await hashPassword(next),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);return startSession(user);
 }
 if(route==='avatar'){
  const data=String(b.data||'');if(!/^data:image\/(png|jpeg|webp);base64,/.test(data)||data.length>2_800_000)return error('Выберите JPG, PNG или WebP до 2 МБ');
  const buffer=Buffer.from(data.split(',')[1],'base64');if(buffer.length>2*1024*1024)return error('Размер фото больше 2 МБ');
  const image=await sharp(buffer,{limitInputPixels:20_000_000}).rotate().resize(320,320,{fit:'cover'}).webp({quality:85}).toBuffer();db.prepare('UPDATE users SET avatar=? WHERE id=?').run(image,user.id);return json({ok:true});
 }
 if(route==='save'){
  const id=String(b.id);const m=content().materials.find(m=>m.id===id);if(!m)return error('Материал не найден',404);if(m.access==='club'&&!user.club&&user.role!=='admin')return error('Нужен доступ в клуб',403);
  if(b.remove)db.prepare('DELETE FROM saved WHERE user_id=? AND material_id=?').run(user.id,id);else db.prepare('INSERT INTO saved VALUES(?,?,?) ON CONFLICT(user_id,material_id) DO UPDATE SET done=excluded.done').run(user.id,id,b.done?1:0);return json({ok:true});
 }
 if(route==='enroll'||route==='join'){
  const e=content().events.find(e=>e.id===String(b.id));if(!e)return error('Событие не найдено',404);if(e.access==='club'&&!user.club&&user.role!=='admin')return error('Нужен доступ в клуб',403);
  if(route==='enroll'){if(b.remove)db.prepare('DELETE FROM attendance WHERE user_id=? AND event_id=?').run(user.id,e.id);else db.prepare('INSERT OR IGNORE INTO attendance VALUES(?,?)').run(user.id,e.id);return json({ok:true});}
  const enrolled=db.prepare('SELECT 1 FROM attendance WHERE user_id=? AND event_id=?').get(user.id,e.id);if(!enrolled)return error('Сначала добавьте событие в свой календарь',403);
  const now=Date.now();const active=now>=new Date(e.start).getTime()-15*60000&&now<=new Date(e.end).getTime();const url=active?e.roomUrl:now>new Date(e.end).getTime()?e.recordingUrl:'';
  if(!url||!safeLink(url))return error('Ссылка пока не добавлена или встреча ещё не началась',409);return json({url});
 }
 if(route==='request'){
  const kind=String(b.kind||''),message=String(b.message||'');if(!['club','mentoring','consulting'].includes(kind)||message.length>3000)return error('Некорректная заявка');
  if(!limit('request:'+user.id,3,60))return error('Заявка уже отправлена. Повторите позже.',429);
  db.prepare('INSERT INTO requests VALUES(?,?,?,?,?)').run(randomUUID(),user.id,kind,message,new Date().toISOString());return json({ok:true});
 }
 if(route==='lms/launch'){
  try{
   const handoff=createLmsHandoff(user.id,String(b.courseId||b.course||''));
   auditAccess(user.id,'lms.handoff:'+String(b.courseId||b.course||''));
   return json(handoff);
  }catch(e){return error(e instanceof Error?e.message:'Не удалось создать handoff',400);}
 }
 if(route==='privacy/delete'){
  if(b.confirm!==true)return error('Подтвердите удаление (confirm:true)');
  const result=await deleteOrAnonymizeSubject(user.id,user.id);
  const res=json(result);
  res.cookies.set(COOKIE,'',{...cookieOptions(),maxAge:0});
  return res;
 }
 if(user.role!=='admin')return error('Недостаточно прав',403);
 if(route==='admin/content'){
  const c=b.content as CommunityContent;
  if(!c||!c.home||!c.brand||!c.pages||!c.legal||!Array.isArray(c.materials)||!Array.isArray(c.events)||c.materials.length>300||c.events.length>300)return error('Некорректное содержимое');
  if(JSON.stringify(c).length>1_500_000)return error('Слишком много данных');
  const ids=new Set<string>();for(const m of c.materials){if(!/^[a-z0-9-]{1,80}$/.test(m.id)||ids.has(m.id)||!['open','club'].includes(m.access)||!m.title||typeof m.body!=='string')return error('Проверьте материалы и уникальность их кодов');ids.add(m.id);}
  ids.clear();for(const e of c.events){if(!/^[a-z0-9-]{1,80}$/.test(e.id)||ids.has(e.id)||!e.title||!['open','club'].includes(e.access)||!Number.isFinite(Date.parse(e.start))||Date.parse(e.end)<=Date.parse(e.start)||!safeLink(e.roomUrl)||!safeLink(e.recordingUrl))return error('Проверьте даты и HTTPS-ссылки событий');ids.add(e.id);}
  if(!Array.isArray(c.courses)||c.courses.length>300)return error('Проверьте программы');
  for(const course of c.courses){
   if(course.lmsLaunchUrl&&!safeLink(course.lmsLaunchUrl))return error('lmsLaunchUrl должен быть HTTPS');
   if(course.lmsCourseId&&!/^[a-zA-Z0-9._:-]{1,120}$/.test(course.lmsCourseId))return error('Проверьте lmsCourseId');
  }
  const invalidPublication=publicationError(c);if(invalidPublication)return error(invalidPublication);
  if(!safeLink(c.brand.telegram)||!safeLink(c.brand.vk)||!safeLink(c.brand.max||''))return error('Контактные ссылки должны начинаться с https://');
  saveContent(c);db.prepare('INSERT INTO audit(actor,action,created) VALUES(?,?,?)').run(user.id,'content.update',new Date().toISOString());return json({ok:true});
 }
 if(route==='admin/media'){
  try{
   const stored=await storeCmsImage(String(b.data||''));
   auditAccess(user.id,'media.upload:'+stored.filename);
   return json({ok:true,media:stored});
  }catch(e){return error(e instanceof Error?e.message:'Не удалось сохранить изображение');}
 }
 if(route==='admin/purchase'){
  const id=String(b.id),course=String(b.course);
  if(!content().courses.some(c=>c.id===course))return error('Курс не найден');
  if(b.remove)db.prepare('DELETE FROM purchases WHERE user_id=? AND course_id=?').run(id,course);
  else db.prepare("INSERT INTO purchases(user_id,course_id,purchased,source) VALUES(?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET source='manual'").run(id,course,new Date().toISOString(),'manual');
  auditAccess(user.id,'purchase.manual:'+id+':'+course);
  return json({ok:true});
 }
 if(route==='admin/document'){
  const id=String(b.id),title=String(b.title||''),url=String(b.url||'');
  const dataUrl=String(b.data||'');
  if(title.length<2||title.length>200)return error('Укажите название документа');
  try{
   if(dataUrl.startsWith('data:')){
    const m=dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if(!m||dataUrl.length>14_000_000)return error('Файл слишком большой');
    const bytes=Buffer.from(m[2],'base64');
    const stored=storeLocalDocument(id,title,bytes,String(b.filename||'document.bin'));
    auditAccess(user.id,'document.local:'+stored.id);
    return json({ok:true,document:stored});
   }
   if(!safeLink(url)||!url)return error('Укажите HTTPS-ссылку или загрузите файл');
   const stored=addExternalDocument(id,title,url);
   auditAccess(user.id,'document.external:'+stored.id);
   return json({ok:true,document:stored});
  }catch(e){return error(e instanceof Error?e.message:'Не удалось сохранить документ');}
 }
 if(route==='admin/member'){
  const id=String(b.id);
  db.prepare("UPDATE users SET club=?,club_source='manual' WHERE id=?").run(b.club?1:0,id);
  db.prepare('INSERT INTO audit(actor,action,created) VALUES(?,?,?)').run(user.id,'membership.update:'+id,new Date().toISOString());
  return json({ok:true});
 }
 if(route==='admin/integrations'){
  if(typeof b.voronkaEnabled==='boolean')setSetting('voronka.enabled',b.voronkaEnabled?'true':'false');
  if(typeof b.lmsEnabled==='boolean')setSetting('lms.enabled',b.lmsEnabled?'true':'false');
  if(typeof b.oidcEnabled==='boolean')setSetting('oidc.enabled',b.oidcEnabled?'true':'false');
  auditAccess(user.id,'integrations.update');
  return json({ok:true,integrations:integrationStatusPublic()});
 }
 if(route==='admin/integrations/ping'){
  const target=String(b.target||'');
  try{
   if(target==='voronka')return json(await pingVoronka());
   if(target==='lms')return json(await pingLms());
   return error('target=voronka|lms');
  }catch(e){return error(e instanceof Error?e.message:'ping failed',502);}
 }
 if(route==='admin/integrations/flush'){
  const result=await processOutbox(50);
  auditAccess(user.id,'integrations.flush');
  return json(result);
 }
 if(route==='admin/privacy/export'){
  const id=String(b.id||'');
  auditAccess(user.id,'subject.export:'+id);
  const data=exportSubject(id);
  if(!data)return error('Пользователь не найден',404);
  return json(data);
 }
 if(route==='admin/privacy/delete'){
  const id=String(b.id||'');
  if(b.confirm!==true)return error('Подтвердите удаление');
  const result=await deleteOrAnonymizeSubject(id,user.id);
  if(!result)return error('Пользователь не найден',404);
  return json(result);
 }
 if(route==='admin/privacy/retention'){
  return json(retentionSweep(b.execute===true?false:true));
 }
 logJson('info',{request_id:requestId,route,user_id:user.id,status:404,latency_ms:Date.now()-started});
 return error('Не найдено',404);
 }catch(e){
  if(String(e).includes('UNIQUE'))return error('Этот email или логин уже занят',409);
  bumpMetric('http_5xx');
  logJson('error',{request_id:requestId,route,user_id:user?.id,status:500,error:e instanceof Error?e.message:'unknown',latency_ms:Date.now()-started});
  return error('Не удалось выполнить действие. Проверьте данные и повторите.',500);
 }
}
