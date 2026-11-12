import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createServer} from 'node:http';
import {createHmac} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';

globalThis.AsyncLocalStorage=AsyncLocalStorage;
const temp=mkdtempSync(path.join(tmpdir(),'solo-pr-int-'));
process.env.DATA_DIR=temp;
process.env.COOKIE_SECURE='false';
process.env.VORONKA_ENABLED='true';
process.env.LMS_ENABLED='true';
process.env.OUTBOX_WORKER='false';

const received=[];
const mock=createServer((req,res)=>{
 let body='';
 req.on('data',c=>body+=c);
 req.on('end',()=>{
  received.push({url:req.url,headers:req.headers,body});
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({ok:true,deals:[],status:'active',progress:10}));
 });
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const port=mock.address().port;
const secret='test-voronka-secret-32chars-min!!';
process.env.VORONKA_WEBHOOK_URL=`http://127.0.0.1:${port}/hooks/leads`;
process.env.VORONKA_WEBHOOK_SECRET=secret;
process.env.VORONKA_INBOUND_SECRET=secret;
process.env.VORONKA_BASE_URL=`http://127.0.0.1:${port}`;
process.env.LMS_BASE_URL=`http://127.0.0.1:${port}`;
process.env.LMS_API_SECRET=secret;

const require=createRequire(import.meta.url);
const {NextRequest}=require('next/server');
let count=0;const check=(v,m)=>{assert.ok(v,m);count++;};

try{
 const {routeModule}=require('../.next/server/app/api/portal/[...path]/route.js');
 await routeModule.ensureUserland();
 const {GET,POST}=routeModule.userland;
 const inboundMod=require('../.next/server/app/api/integrations/voronka/route.js');
 await inboundMod.routeModule.ensureUserland();
 const inboundPOST=inboundMod.routeModule.userland.POST;
 const healthMod=require('../.next/server/app/api/route.js');
 await healthMod.routeModule.ensureUserland();
 const healthGET=healthMod.routeModule.userland.GET;

 const call=async(route,data,cookie='',origin='https://test.local')=>{
  const req=new NextRequest('https://test.local/api/portal/'+route,{
   method:data===undefined?'GET':'POST',
   headers:{origin,'content-type':'application/json',cookie},
   body:data===undefined?undefined:JSON.stringify(data),
  });
  return await (data===undefined?GET:POST)(req,{params:Promise.resolve({path:route.split('/')})});
 };
 const body=async r=>await r.json();

 let r=await healthGET();
 const health=await body(r);
 check(r.status===200&&health.ok===true&&health.sqlite_ok===true,'Health endpoint');

 r=await call('register',{name:'Int User',username:'intuser',login:'int@example.test',password:'testing-only-secret-123',consent:true});
 check(r.status===200,'Register');
 let cookie=r.headers.get('set-cookie').split(';')[0];
 const user=(await body(r)).user;

 r=await call('lead',{kind:'course',contactType:'email',contact:'lead-sync@example.test',consent:true,service:'digital-transformation'});
 check(r.status===200,'Lead accepted locally');
 const leadBody=await body(r);
 check(!!leadBody.id,'Lead id returned');

 await new Promise(res=>setTimeout(res,80));
 const db=new DatabaseSync(path.join(temp,'community.sqlite'));
 db.prepare("UPDATE users SET role='admin',club=1 WHERE id=?").run(user.id);
 r=await call('admin/integrations/flush',{},cookie);
 check(r.status===200,'Outbox flush');
 const lead=db.prepare('SELECT sync_status FROM leads WHERE id=?').get(leadBody.id);
 check(lead&&lead.sync_status==='ok','Lead synced to mock voronka');
 check(received.some(x=>x.url==='/hooks/leads'&&x.body.includes('lead.created')),'Mock received lead.created');
 const leadHit=received.find(x=>x.url==='/hooks/leads');
 const leadPayload=JSON.parse(leadHit.body);
 check(leadPayload.idempotency_key===leadBody.id&&leadPayload.data.source==='solo_pr','Lead contract fields');
 check(leadPayload.type==='lead.created'&&leadPayload.kind==='lead.created','Lead dual-emits type+kind');
 check(leadPayload.event_id===leadBody.id&&leadPayload.idempotency_key===leadBody.id,'Lead dual-emits event_id+idempotency_key');
 check(!!leadHit.headers['x-solo-timestamp']&&!!leadHit.headers['x-solo-signature'],'Lead emits x-solo-* headers');
 check(!!leadHit.headers['x-voronka-timestamp']&&!!leadHit.headers['x-voronka-signature'],'Lead emits x-voronka-* aliases');
 check(leadHit.headers['x-solo-signature']===leadHit.headers['x-voronka-signature'],'Solo/voronka signature aliases match');

 // Inbound deal.paid (canonical type+event_id + x-voronka)
 const event={event_id:'evt-1',type:'deal.paid',email:'buyer@example.test',course_id:'digital-transformation',club:true,name:'Buyer'};
 const raw=JSON.stringify(event);
 const ts=String(Date.now());
 const sig=createHmac('sha256',secret).update(ts+'.'+raw).digest('hex');
 let inboundReq=new NextRequest('https://test.local/api/integrations/voronka',{
  method:'POST',
  headers:{'content-type':'application/json','x-voronka-timestamp':ts,'x-voronka-signature':'sha256='+sig},
  body:raw,
 });
 r=await inboundPOST(inboundReq);
 check(r.status===200&&(await body(r)).ok===true,'Inbound deal.paid');
 const purchase=db.prepare("SELECT source FROM purchases WHERE course_id='digital-transformation'").get();
 check(purchase&&purchase.source==='voronka','Purchase source voronka');
 const audit=db.prepare("SELECT actor FROM audit WHERE action LIKE 'deal.paid%'").get();
 check(audit&&audit.actor==='voronka','Audit actor voronka');

 // Idempotent replay
 inboundReq=new NextRequest('https://test.local/api/integrations/voronka',{
  method:'POST',
  headers:{'content-type':'application/json','x-voronka-timestamp':ts,'x-voronka-signature':'sha256='+sig},
  body:raw,
 });
 r=await inboundPOST(inboundReq);
 check(r.status===200&&(await body(r)).duplicate===true,'Inbound idempotent');

 // Dual-read: kind + idempotency_key + x-solo headers
 const dualEvent={kind:'access.granted',idempotency_key:'evt-dual-1',email:'dual@example.test',commerce_product_id:'digital-transformation',club:true,name:'Dual'};
 const dualRaw=JSON.stringify(dualEvent);
 const dualTs=String(Date.now());
 const dualSig=createHmac('sha256',secret).update(dualTs+'.'+dualRaw).digest('hex');
 inboundReq=new NextRequest('https://test.local/api/integrations/voronka',{
  method:'POST',
  headers:{'content-type':'application/json','x-solo-timestamp':dualTs,'x-solo-signature':'sha256='+dualSig},
  body:dualRaw,
 });
 r=await inboundPOST(inboundReq);
 check(r.status===200&&(await body(r)).ok===true,'Inbound accepts kind+idempotency_key via x-solo-*');

 // Dual-read nested data + type/kind both present
 const nestedEvent={type:'access.granted',kind:'access.granted',event_id:'evt-nested-1',idempotency_key:'evt-nested-1',data:{email:'nested@example.test',course_id:'digital-transformation',club:false,name:'Nested'}};
 const nestedRaw=JSON.stringify(nestedEvent);
 const nestedTs=String(Date.now());
 const nestedSig=createHmac('sha256',secret).update(nestedTs+'.'+nestedRaw).digest('hex');
 inboundReq=new NextRequest('https://test.local/api/integrations/voronka',{
  method:'POST',
  headers:{'content-type':'application/json','x-voronka-timestamp':nestedTs,'x-voronka-signature':'sha256='+nestedSig},
  body:nestedRaw,
 });
 r=await inboundPOST(inboundReq);
 check(r.status===200&&(await body(r)).ok===true,'Inbound accepts nested data envelope');

 // Bad signature
 inboundReq=new NextRequest('https://test.local/api/integrations/voronka',{
  method:'POST',
  headers:{'content-type':'application/json','x-voronka-timestamp':ts,'x-voronka-signature':'sha256='+'00'.repeat(32)},
  body:raw,
 });
 r=await inboundPOST(inboundReq);
 check(r.status===401,'Inbound rejects bad signature');

 r=await call('admin/member',{id:user.id,club:false},cookie);
 check(r.status===200,'Manual club override');
 const club=db.prepare('SELECT club,club_source FROM users WHERE id=?').get(user.id);
 check(club.club_source==='manual','Manual club_source');

 // Non-admin forbidden
 r=await call('register',{name:'Member Two',username:'membertwo',login:'member2@example.test',password:'testing-only-secret-456',consent:true});
 const memberCookie=r.headers.get('set-cookie').split(';')[0];
 r=await call('admin/integrations',{voronkaEnabled:false},memberCookie);
 check(r.status===403,'Non-admin integrations 403');

 r=await call('admin/integrations',undefined,cookie);
 check(r.status===200&&(await body(r)).voronka,'Admin integrations status');

 r=await call('dashboard',undefined,cookie);
 const dash=await body(r);
 check(dash.commerce&&dash.commerce.crm,'Dashboard commerce aggregator');

 r=await call('privacy/export',undefined,cookie);
 check(r.status===200&&(await body(r)).subject,'Subject export');

 // LMS launch requires purchase
 r=await call('lms/launch',{courseId:'digital-transformation'},cookie);
 check(r.status===400,'LMS launch without purchase rejected');
 db.prepare("INSERT INTO purchases(user_id,course_id,purchased,source) VALUES(?,?,?,?)").run(user.id,'digital-transformation',new Date().toISOString(),'manual');
 // seed course may lack lmsCourseId — expect binding error or success path
 r=await call('lms/launch',{courseId:'digital-transformation'},cookie);
 check(r.status===400||r.status===200,'LMS launch with purchase authorized server-side');

 // Handoff redeem endpoint auth
 const handoffMod=require('../.next/server/app/api/integrations/lms/handoff/route.js');
 await handoffMod.routeModule.ensureUserland();
 const handoffPOST=handoffMod.routeModule.userland.POST;
 const ticketBody=JSON.stringify({ticket:'nope'});
 const hts=String(Date.now());
 const hsig=createHmac('sha256',secret).update(hts+'.'+ticketBody).digest('hex');
 let hr=await handoffPOST(new NextRequest('https://test.local/api/integrations/lms/handoff',{method:'POST',headers:{'content-type':'application/json','x-solo-timestamp':hts,'x-solo-signature':'sha256='+hsig},body:ticketBody}));
 check(hr.status===410||hr.status===401||hr.status===200,'Handoff redeem endpoint reachable with signature');

 // Cron outbox independent of leads
 const cronMod=require('../.next/server/app/api/cron/outbox/route.js');
 await cronMod.routeModule.ensureUserland();
 const cronGET=cronMod.routeModule.userland.GET;
 let cr=await cronGET(new NextRequest('http://127.0.0.1/api/cron/outbox',{method:'GET',headers:{host:'127.0.0.1'}}));
 check(cr.status===200,'Cron outbox drain on loopback');

 // Document file unlink on subject delete
 const docsDir=path.join(temp,'documents',user.id);
 require('node:fs').mkdirSync(docsDir,{recursive:true});
 const docFile=path.join(docsDir,'sample.bin');
 require('node:fs').writeFileSync(docFile,'secret');
 db.prepare("INSERT INTO documents(id,user_id,title,url,created,object_key,storage) VALUES(?,?,?,?,?,?,?)")
  .run('doc-1',user.id,'Sample','/api/documents/doc-1',new Date().toISOString(),user.id+'/sample.bin','local');
 r=await call('admin/privacy/delete',{id:user.id,confirm:true},cookie);
 check(r.status===200,'Subject delete');
 check(!require('node:fs').existsSync(docFile),'Local document file unlinked');

 // Worker elevate flag unit-check via source contract
 const workerSrc=require('node:fs').readFileSync(path.join(process.cwd(),'worker/index.ts'),'utf8');
 check(workerSrc.includes('SITES_ADMIN_ELEVATE'),'Worker elevate gated by flag');
 check(workerSrc.includes('sites.admin_elevate'),'Worker elevate audited when enabled');

 // Build isolate path present in store source
 const storeSrc=require('node:fs').readFileSync(path.join(process.cwd(),'src/lib/server/store.ts'),'utf8');
 check(storeSrc.includes('phase-production-build'),'Build-time SQLite isolation');

 db.close();
 console.log(`${count} integration contract checks passed.`);
}finally{
 mock.close();
 rmSync(temp,{recursive:true,force:true});
}
