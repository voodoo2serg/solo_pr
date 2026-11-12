import 'server-only';
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync,unlinkSync,rmSync} from 'node:fs';
import path from 'node:path';
import {db} from './store';
import {integrationEnv} from './integrations/config';

const dataDir=process.env.DATA_DIR||path.join(process.cwd(),'data');
const docsDir=path.join(dataDir,'documents');
mkdirSync(docsDir,{recursive:true,mode:0o700});

function ensureDocColumns(){
 const cols=db.prepare('PRAGMA table_info(documents)').all() as {name:string}[];
 const names=new Set(cols.map(c=>c.name));
 if(!names.has('object_key'))db.exec("ALTER TABLE documents ADD COLUMN object_key TEXT NOT NULL DEFAULT ''");
 if(!names.has('storage'))db.exec("ALTER TABLE documents ADD COLUMN storage TEXT NOT NULL DEFAULT 'external'");
}
ensureDocColumns();

function downloadSecret(){
 return process.env.DOCUMENT_SIGNING_SECRET||process.env.VORONKA_INBOUND_SECRET||'dev-document-secret-change-me';
}

export function allowlistedExternalUrl(url:string){
 try{
  const u=new URL(url);
  if(u.protocol!=='https:')return false;
  const allow=integrationEnv().documentAllowlist;
  if(!allow.length)return true; // no allowlist configured: keep backward-compatible HTTPS URLs
  return allow.some(host=>u.hostname===host||u.hostname.endsWith('.'+host));
 }catch{return false;}
}

export function storeLocalDocument(userId:string,title:string,bytes:Buffer,filename:string){
 if(bytes.length>10*1024*1024)throw new Error('Файл больше 10 МБ');
 const safe=filename.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,80)||'file.bin';
 const objectKey=userId+'/'+randomUUID()+'-'+safe;
 const full=path.join(docsDir,objectKey);
 mkdirSync(path.dirname(full),{recursive:true,mode:0o700});
 writeFileSync(full,bytes,{mode:0o600});
 const id=randomUUID();
 const now=new Date().toISOString();
 // url is internal download path; object_key is SoR for jurisdiction (local RU volume).
 db.prepare('INSERT INTO documents(id,user_id,title,url,created,object_key,storage) VALUES(?,?,?,?,?,?,?)')
  .run(id,userId,title,'/api/documents/'+id,now,objectKey,'local');
 return {id,object_key:objectKey,storage:'local' as const,url:'/api/documents/'+id};
}

export function addExternalDocument(userId:string,title:string,url:string){
 if(!allowlistedExternalUrl(url))throw new Error('Внешний URL не в allowlist или не HTTPS');
 const id=randomUUID();
 db.prepare('INSERT INTO documents(id,user_id,title,url,created,object_key,storage) VALUES(?,?,?,?,?,?,?)')
  .run(id,userId,title,url,new Date().toISOString(),'', 'external');
 return {id,url,storage:'external' as const};
}

export function getDocumentRow(id:string){
 return db.prepare('SELECT * FROM documents WHERE id=?').get(id) as
  {id:string;user_id:string;title:string;url:string;object_key:string;storage:string;created:string}|undefined;
}

export function readLocalDocument(objectKey:string){
 if(!objectKey||objectKey.includes('..'))return null;
 const full=path.join(docsDir,objectKey);
 if(!existsSync(full))return null;
 return readFileSync(full);
}

/** Short-lived signed token for download (optional query param). */
export function signDownload(docId:string,userId:string,ttlMs=15*60*1000){
 const exp=Date.now()+ttlMs;
 const payload=docId+'.'+userId+'.'+exp;
 const sig=createHmac('sha256',downloadSecret()).update(payload).digest('hex');
 return Buffer.from(payload+'.'+sig).toString('base64url');
}

export function verifyDownloadToken(token:string,docId:string,userId:string){
 try{
  const raw=Buffer.from(token,'base64url').toString('utf8');
  const [id,uid,exp,sig]=raw.split('.');
  if(id!==docId||uid!==userId)return false;
  if(Number(exp)<Date.now())return false;
  const expected=createHmac('sha256',downloadSecret()).update(id+'.'+uid+'.'+exp).digest('hex');
  const a=Buffer.from(expected);
  const b=Buffer.from(sig||'');
  return a.length===b.length&&timingSafeEqual(a,b);
 }catch{return false;}
}

export function unlinkLocalDocumentFiles(userId:string){
 const rows=db.prepare("SELECT object_key,storage FROM documents WHERE user_id=? AND storage='local' AND object_key!=''").all(userId) as {object_key:string;storage:string}[];
 let removed=0;
 for(const row of rows){
  if(!row.object_key||row.object_key.includes('..'))continue;
  const full=path.join(docsDir,row.object_key);
  try{
   if(existsSync(full)){unlinkSync(full);removed++;}
  }catch{/* best-effort unlink before DB delete */}
 }
 // Remove empty user directory if present.
 try{rmSync(path.join(docsDir,userId),{recursive:false});}catch{/* non-empty or missing */}
 return removed;
}

export const documentStorageMeta={
 provider:process.env.PD_OBJECT_STORAGE_PROVIDER||'local-volume',
 region:process.env.PD_HOST_REGION||'[регион RU]',
 country:process.env.PD_HOST_COUNTRY||'RU',
 path:docsDir,
 note:'Production ПДн-файлы: локальный volume на RU VPS (или совместимый RU object storage через будущий адаптер). Внешние HTTPS URL — только по DOCUMENT_URL_ALLOWLIST.',
};
