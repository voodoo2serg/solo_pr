import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function authorized(req:NextRequest){
 const secret=process.env.CRON_SECRET||process.env.OUTBOX_CRON_SECRET||'';
 if(!secret){
  // Allow loopback-only without secret for local ops; require secret otherwise.
  const host=req.headers.get('host')||'';
  return host.startsWith('127.0.0.1')||host.startsWith('localhost');
 }
 const header=req.headers.get('authorization')||'';
 const bearer=header.startsWith('Bearer ')?header.slice(7):'';
 const alt=req.headers.get('x-cron-secret')||'';
 return bearer===secret||alt===secret;
}

/** Independent outbox drain for systemd timer / external cron. */
async function run(req:NextRequest){
 if(!authorized(req))return NextResponse.json({error:'unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
 const {tickOutbox,ensureOutboxWorker}=await import('@/lib/server/integrations');
 ensureOutboxWorker();
 const result=await tickOutbox('cron');
 return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
}

export async function GET(req:NextRequest){return run(req);}
export async function POST(req:NextRequest){return run(req);}
