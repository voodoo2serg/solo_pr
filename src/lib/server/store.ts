import 'server-only';
import {withCmsDefaults} from '../cms-defaults';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {withBranding,withPresentation} from '../brand-content';
import {seed} from './seed';
import type {CommunityContent} from '../content-types';

const dir=process.env.DATA_DIR||path.join(process.cwd(),'data');
mkdirSync(dir,{recursive:true,mode:0o700});

const globalDb=globalThis as unknown as {soloDb?:DatabaseSync;soloDbMigrated?:boolean};

/** During Next build, parallel workers must not contend on one SQLite file. */
function sqlitePath(){
 if(process.env.NEXT_PHASE==='phase-production-build'||process.env.SOLO_BUILD_ISOLATE_DB==='1'){
  return path.join(dir,`.build-${process.pid}-${process.env.NEXT_DEPLOYMENT_ID||'local'}.sqlite`);
 }
 return path.join(dir,'community.sqlite');
}

function sleepMs(ms:number){
 const end=Date.now()+ms;
 while(Date.now()<end){/* spin — build-only retry path */}
}

function openDatabase():DatabaseSync{
 const file=sqlitePath();
 let last:unknown;
 for(let attempt=0;attempt<12;attempt++){
  try{
   const database=new DatabaseSync(file);
   database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,about TEXT NOT NULL DEFAULT '',password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',club INTEGER NOT NULL DEFAULT 0,theme TEXT NOT NULL DEFAULT 'system',avatar BLOB,created TEXT NOT NULL,consent TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS saved(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,material_id TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,material_id));
CREATE TABLE IF NOT EXISTS attendance(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,event_id TEXT NOT NULL,PRIMARY KEY(user_id,event_id));
CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,message TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,kind TEXT NOT NULL,service TEXT NOT NULL,message TEXT NOT NULL,consent TEXT NOT NULL,ads_consent INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchases(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,course_id TEXT NOT NULL,purchased TEXT NOT NULL,PRIMARY KEY(user_id,course_id));
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,url TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,created TEXT NOT NULL);`);
   return database;
  }catch(e){
   last=e;
   const msg=String(e);
   if(msg.includes('locked')||msg.includes('BUSY')){sleepMs(50*(attempt+1));continue;}
   throw e;
  }
 }
 throw last instanceof Error?last:new Error('sqlite open failed');
}

function migrate(database:DatabaseSync){
 if(globalDb.soloDbMigrated)return;
 const leadColumns=database.prepare('PRAGMA table_info(leads)').all() as {name:string}[];
 if(!leadColumns.some(c=>c.name==='contact_type'))database.exec("ALTER TABLE leads ADD COLUMN contact_type TEXT NOT NULL DEFAULT 'email'");
 if(!leadColumns.some(c=>c.name==='contact'))database.exec("ALTER TABLE leads ADD COLUMN contact TEXT NOT NULL DEFAULT ''");
 if(!leadColumns.some(c=>c.name==='sync_status'))database.exec("ALTER TABLE leads ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'");
 if(!leadColumns.some(c=>c.name==='sync_attempts'))database.exec('ALTER TABLE leads ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0');
 if(!leadColumns.some(c=>c.name==='sync_error'))database.exec("ALTER TABLE leads ADD COLUMN sync_error TEXT NOT NULL DEFAULT ''");
 if(!leadColumns.some(c=>c.name==='synced_at'))database.exec('ALTER TABLE leads ADD COLUMN synced_at TEXT');
 const userCols=database.prepare('PRAGMA table_info(users)').all() as {name:string}[];
 if(!userCols.some(c=>c.name==='external_id'))database.exec('ALTER TABLE users ADD COLUMN external_id TEXT');
 if(!userCols.some(c=>c.name==='oidc_sub'))database.exec('ALTER TABLE users ADD COLUMN oidc_sub TEXT');
 if(!userCols.some(c=>c.name==='club_source'))database.exec("ALTER TABLE users ADD COLUMN club_source TEXT NOT NULL DEFAULT 'manual'");
 const purchaseCols=database.prepare('PRAGMA table_info(purchases)').all() as {name:string}[];
 if(!purchaseCols.some(c=>c.name==='source'))database.exec("ALTER TABLE purchases ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
 if(!purchaseCols.some(c=>c.name==='event_id'))database.exec('ALTER TABLE purchases ADD COLUMN event_id TEXT');
 const docCols=database.prepare('PRAGMA table_info(documents)').all() as {name:string}[];
 if(!docCols.some(c=>c.name==='object_key'))database.exec("ALTER TABLE documents ADD COLUMN object_key TEXT NOT NULL DEFAULT ''");
 if(!docCols.some(c=>c.name==='storage'))database.exec("ALTER TABLE documents ADD COLUMN storage TEXT NOT NULL DEFAULT 'external'");
 globalDb.soloDbMigrated=true;
}

function getDb():DatabaseSync{
 if(!globalDb.soloDb){
  globalDb.soloDb=openDatabase();
  migrate(globalDb.soloDb);
 }
 return globalDb.soloDb;
}

/** Lazy proxy so CMS `content()` can load without opening SQLite during isolated reads, and so first DB use retries on lock. */
export const db=new Proxy({} as DatabaseSync,{
 get(_target,prop){
  const real=getDb();
  const value=(real as unknown as Record<string|symbol,unknown>)[prop];
  return typeof value==='function'?(value as (...a:unknown[])=>unknown).bind(real):value;
 },
});

const file=path.join(dir,'content.json');
export function content():CommunityContent{
 if(!existsSync(file)){writeFileSync(file,JSON.stringify(seed,null,2),{mode:0o600});}
 const current=JSON.parse(readFileSync(file,'utf8'));
 if(!current.designRevision){current.home=seed.home;current.pages=seed.pages;current.courses=seed.courses;current.brand.name='Соло-PR';current.designRevision=2;saveContent(current);}
 const branded=withPresentation(withBranding(current));if(branded!==current)saveContent(branded);return withCmsDefaults(branded);
}
export function saveContent(next:CommunityContent){const tmp=file+'.'+randomBytes(6).toString('hex')+'.tmp';writeFileSync(tmp,JSON.stringify(next,null,2),{mode:0o600});renameSync(tmp,file);}
export type User={id:string;email:string;username:string;name:string;about:string;password:string;role:string;club:number;theme:string;avatar:Uint8Array|null;created:string;external_id?:string|null;oidc_sub?:string|null;club_source?:string};
export function publicUser(u:User){return {id:u.id,email:u.email,username:u.username,name:u.name,about:u.about,role:u.role,club:!!u.club,theme:u.theme,hasAvatar:!!u.avatar,externalId:u.external_id||null,hasOidc:!!u.oidc_sub};}
const scrypt=promisify(scryptCallback);
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64) as Buffer;return salt+':'+key.toString('hex');}
export async function verifyPassword(password:string,encoded:string){const [salt,hex]=encoded.split(':');if(!salt||!hex)return false;const key=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(hex,'hex');return key.length===expected.length&&timingSafeEqual(key,expected);}
export function tokenHash(t:string){return createHash('sha256').update(t).digest('hex');}
export function sessionUser(token?:string):User|null {if(!token)return null;return (db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(tokenHash(token),Date.now()) as User|undefined)||null;}
export function limit(key:string,max:number,minutes:number){const now=Date.now();db.prepare('DELETE FROM limits WHERE expires<?').run(now);db.prepare('INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+minutes*60000);return Number((db.prepare('SELECT count FROM limits WHERE key=?').get(key) as {count:number}).count)<=max;}
