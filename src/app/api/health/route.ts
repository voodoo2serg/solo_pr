import {NextResponse} from 'next/server';
import {readFileSync} from 'node:fs';
import path from 'node:path';

function version(){
 try{
  const pkg=JSON.parse(readFileSync(path.join(process.cwd(),'package.json'),'utf8')) as {version?:string};
  return pkg.version||'0.0.0';
 }catch{return '0.0.0';}
}

export async function GET(){
 const {readMetrics,sqliteReadable}=await import('@/lib/server/observability');
 const ok=sqliteReadable();
 return NextResponse.json({
  ok,
  service:'solo_pr',
  version:version(),
  sqlite_ok:ok,
  metrics:readMetrics(),
 },{status:ok?200:503,headers:{'Cache-Control':'no-store'}});
}
