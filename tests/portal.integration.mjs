import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
globalThis.AsyncLocalStorage=AsyncLocalStorage;
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
const temp=mkdtempSync(path.join(tmpdir(),'solo-pr-test-'));process.env.DATA_DIR=temp;process.env.COOKIE_SECURE='false';process.env.OUTBOX_WORKER='false';
const require=createRequire(import.meta.url);const {NextRequest}=require('next/server');
try{
 const {routeModule}=require('../.next/server/app/api/portal/[...path]/route.js');await routeModule.ensureUserland();const {GET,POST}=routeModule.userland;
 const call=async(route,data,cookie='',origin='https://test.local')=>{const req=new NextRequest('https://test.local/api/portal/'+route,{method:data===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',cookie},body:data===undefined?undefined:JSON.stringify(data)});return await (data===undefined?GET:POST)(req,{params:Promise.resolve({path:route.split('/')})});};
 const body=async r=>await r.json();let count=0;const check=(v,m)=>{assert.ok(v,m);count++;};
 let r=await call('content');const c=await body(r);check(r.status===200,'Public content');check(c.materials.every(m=>!('body'in m)),'No article bodies in public metadata');check(!JSON.stringify(c.events).includes('roomUrl'),'No conference links in public metadata');
 r=await call('materials/brief-template');check(r.status===403,'Anonymous cannot read club material');
 r=await call('materials/solo-position');check(r.status===200,'Open article available anonymously');
 r=await call('register',{name:'Тестовый участник',username:'tester',login:'tester@example.test',password:'testing-only-secret-123',consent:true});check(r.status===200,'Registration');let cookie=r.headers.get('set-cookie').split(';')[0];const first=(await body(r)).user;check(first.role==='member'&&!first.club,'Registration grants no club/admin privileges');check(r.headers.get('set-cookie').includes('HttpOnly'),'HttpOnly session');
 r=await call('admin',undefined,cookie);check(r.status===403,'Member cannot read admin content');r=await call('materials/brief-template',undefined,cookie);check(r.status===403,'Ordinary member cannot read club material');
 r=await call('profile',{name:'Обновлённое имя',username:'tester-updated',about:'Мой опыт',theme:'dark'},cookie);check(r.status===200,'Profile save');r=await call('me',undefined,cookie);const profile=(await body(r)).user;check(profile.name==='Обновлённое имя'&&profile.theme==='dark','Profile persisted');
 r=await call('save',{id:'solo-position'},cookie);check(r.status===200,'Save open material');r=await call('dashboard',undefined,cookie);check((await body(r)).saved.length===1,'Saved material in dashboard');
 r=await call('register',{name:'Второй участник',username:'second',login:'second@example.test',password:'testing-only-secret-456',consent:true});let secondCookie=r.headers.get('set-cookie').split(';')[0];r=await call('dashboard',undefined,secondCookie);check((await body(r)).saved.length===0,'User data isolated');
 r=await call('profile',{name:'CSRF change',username:'tester',about:'',theme:'light'},cookie,'https://attacker.test');check(r.status===403,'Cross-origin writes rejected');
 const db=new DatabaseSync(path.join(temp,'community.sqlite'));db.prepare("UPDATE users SET role='admin',club=1 WHERE id=?").run(first.id);
 r=await call('admin',undefined,cookie);const admin=await body(r);check(r.status===200&&admin.users.length===2,'Admin reads content and users');
 admin.content.home.title='Проверка редактора';admin.content.events=[{id:'active-test',title:'Тестовая встреча',description:'Только автоматический тест',start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString(),format:'Онлайн',access:'club',roomUrl:'https://video.example.test/room',recordingUrl:''}];
 r=await call('admin/content',{content:admin.content},cookie);check(r.status===200,'CMS publication');r=await call('content',undefined,cookie);const updated=await body(r);check(updated.home.title==='Проверка редактора','Published text persisted');check(!('roomUrl'in updated.events[0]),'Room link remains private');r=await call('content');check((await body(r)).events.length===0,'Calendar hidden from anonymous visitors');
 admin.content.videos=[{id:'qa-video',title:'QA video',description:'',url:'https://youtu.be/dQw4w9WgXcQ',image:'',published:true,showOnHome:true},{id:'qa-draft-video',title:'Draft',description:'',url:'',image:'',published:false}];
 admin.content.materials.push({id:'qa-draft',title:'Draft article',body:'Secret draft',description:'',category:'Test',access:'open',minutes:'1',published:false});admin.content.modules.videos={order:'latest',limit:5};admin.content.seo.home={title:'CMS SEO',description:'CMS description',keywords:'CMS,test'};admin.content.copy['Войти']='Вход участника';
 r=await call('admin/content',{content:admin.content},cookie);check(r.status===200,'CMS video, visibility, modules and SEO save');r=await call('content');const cms=await body(r);check(cms.videos.length===1&&!cms.materials.some(m=>m.id==='qa-draft'),'Drafts excluded from public metadata');check(cms.seo.home.title==='CMS SEO'&&cms.copy['Войти']==='Вход участника','SEO and UI copy persisted');r=await call('materials/qa-draft');check(r.status===404,'Draft unavailable via direct API');
 const invalid=structuredClone(admin.content);invalid.videos[0].url='https://evil.test/embed';r=await call('admin/content',{content:invalid},cookie);check(r.status===400,'Untrusted video host rejected');invalid.videos[0].url=admin.content.videos[0].url;invalid.modules.videos.limit=-1;r=await call('admin/content',{content:invalid},cookie);check(r.status===400,'Invalid module limit rejected');
 r=await call('enroll',{id:'active-test'},secondCookie);check(r.status===403,'Club event access enforced');r=await call('admin/member',{id:admin.users.find(u=>u.id!==first.id).id,club:true},cookie);check(r.status===200,'Admin grants club access');
 r=await call('materials/brief-template',undefined,secondCookie);check(r.status===200&&(await body(r)).material.body.length>0,'Granted user reads protected material');
 r=await call('enroll',{id:'active-test'},secondCookie);check(r.status===200,'Event enrollment');r=await call('join',{id:'active-test'},secondCookie);check((await body(r)).url==='https://video.example.test/room','Authorized conference handoff');
 r=await call('password',{current:'testing-only-secret-456',password:'changed-test-secret-789'},secondCookie);check(r.status===200,'Password change');let newCookie=r.headers.get('set-cookie').split(';')[0];r=await call('me',undefined,secondCookie);check((await body(r)).user===null,'Old session revoked');r=await call('me',undefined,newCookie);check(!!(await body(r)).user,'New session active');
 r=await call('logout',{},newCookie);check(r.status===200,'Logout');r=await call('me',undefined,newCookie);check((await body(r)).user===null,'Logged-out token rejected');
 const sharp=require('sharp');const photo=await sharp({create:{width:40,height:40,channels:3,background:'#536b45'}}).png().toBuffer(); r=await call('avatar',{data:'data:image/png;base64,'+photo.toString('base64')},cookie);check(r.status===200,'Photo upload');r=await call('avatar',undefined,cookie);check(r.headers.get('content-type')==='image/webp','Server transforms photo');const meta=await sharp(Buffer.from(await r.arrayBuffer())).metadata();check(meta.width===320&&meta.height===320,'Avatar resized');
 const cmsPhoto=await sharp({create:{width:80,height:60,channels:3,background:'#8a5a44'}}).png().toBuffer();
 r=await call('admin/media',{data:'data:image/png;base64,'+cmsPhoto.toString('base64')},cookie);check(r.status===200,'CMS media upload');
 const mediaBody=await body(r);check(!!mediaBody.media?.url&&mediaBody.media.url.startsWith('/api/portal/media/'),'CMS media URL returned');
 r=await call(mediaBody.media.url.replace('/api/portal/',''),undefined,'');check(r.status===200&&r.headers.get('content-type')==='image/webp','Public CMS media fetch');
 r=await call('register',{name:'Третий участник',username:'third',login:'third@example.test',password:'testing-only-secret-333',consent:true});
 const thirdCookie=r.headers.get('set-cookie').split(';')[0];
 r=await call('admin/media',{data:'data:image/png;base64,'+cmsPhoto.toString('base64')},thirdCookie);check(r.status===403,'Member cannot upload CMS media');
 r=await call('lead',{kind:'course',contactType:'telegram',contact:'@test_user',consent:true});check(r.status===200,'Telegram inquiry without name or message');r=await call('lead',{kind:'club',contactType:'max',contact:'+79991234567',consent:true});check(r.status===200,'MAX inquiry');r=await call('lead',{kind:'course',contactType:'email',contact:'quick@example.test',consent:true});check(r.status===200,'Email inquiry without message');const lead=db.prepare("SELECT * FROM leads WHERE contact_type='telegram'").get();check(lead.message==='Информация о курсах'&&lead.contact==='@test_user'&&lead.email==='','Contact channel and automatic topic saved');
 
 // SPO-20/23/26 portal CMS extensions
 r=await call('admin/staff-roles',{email:'editor@example.test',name:'Editor',zones:{cms:'editor'},checklist:{crmStaffGranted:false,openolatGranted:false,notes:'test'}},cookie);check(r.status===200,'Staff role upsert');
 const roles=(await body(r)).staffRoles;check(roles.some(x=>x.email==='editor@example.test'&&x.zones.cms==='editor'),'Staff role stored');
 r=await call('admin',undefined,cookie);const adminBody=await body(r);check(Array.isArray(adminBody.staffRoles),'Admin payload includes staffRoles');check(Array.isArray(adminBody.integrations?.portals),'Integrations include portals block');check(adminBody.integrations.portals.some(p=>p.id==='cms'&&String(p.url).includes('cms.solo-pr.ru')),'CMS portal URL documented');
 const lmsPortal=adminBody.integrations.portals.find(p=>p.id==='lms');
 check(!!lmsPortal&&(String(lmsPortal.note||'').includes('OpenOlat')||String(lmsPortal.lastCheck?.status||'').includes('stub')),'LMS stub != healthy OpenOlat');
 r=await call('admin/staff-roles',{email:'editor@example.test',remove:true},cookie,'https://cms.solo-pr.ru');
 if(r.status===200){check(!(await body(r)).staffRoles.some(x=>x.email==='editor@example.test'),'Staff role removed via cms origin');}
 else {r=await call('admin/staff-roles',{email:'editor@example.test',remove:true},cookie);check(r.status===200,'Staff role removed');}
 // hero / material / event images survive publish
 admin.content.home.heroImage='/images/hero-room.jpg';
 admin.content.materials=admin.content.materials.map((m,i)=>i?m:{...m,image:'/images/hero-room.jpg'});
 admin.content.events=admin.content.events.map(e=>({...e,image:'/images/hero-room.jpg'}));
 admin.content.brand={...admin.content.brand,showEmail:true,showTelegram:true,showMax:false,showVk:true,vk:'https://vk.com/solo_pr'};
 r=await call('admin/content',{content:admin.content},cookie);check(r.status===200,'CMS hero/footer/media fields save');
 r=await call('content',undefined,cookie);const pub=await body(r);check(pub.home.heroImage==='/images/hero-room.jpg','heroImage published');check(pub.brand.showVk===true&&pub.brand.vk.includes('vk.com'),'Footer VK toggles published');

const row=db.prepare('SELECT password FROM users WHERE id=?').get(first.id);check(!row.password.includes('testing-only'),'Password not stored in plaintext');db.close();console.log(`${count} integration checks passed. Temporary test data removed.`);
}finally{rmSync(temp,{recursive:true,force:true});}
