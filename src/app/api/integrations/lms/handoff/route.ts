import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function json(data:unknown,status=200){
 return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

/** LMS redeems a one-time handoff ticket (signed M2M; no shared DB). */
export async function POST(req:NextRequest){
 const {consumeHandoff}=await import('@/lib/server/integrations/lms');
 const {verifySignature}=await import('@/lib/server/integrations/signing');
 const {integrationEnv}=await import('@/lib/server/integrations/config');
 const {bumpMetric,logJson,newRequestId}=await import('@/lib/server/observability');
 const requestId=newRequestId();
 const raw=await req.text();
 const env=integrationEnv();
 if(!env.lmsApiSecret)return json({error:'LMS not configured'},503);
 const timestamp=req.headers.get('x-lms-timestamp')||req.headers.get('x-solo-timestamp')||'';
 const signature=req.headers.get('x-lms-signature')||req.headers.get('x-solo-signature')||'';
 if(!verifySignature(env.lmsApiSecret,raw,timestamp,signature)){
  bumpMetric('auth_failures');
  logJson('warn',{request_id:requestId,route:'integrations/lms/handoff',status:401,event:'handoff_auth_fail'});
  return json({error:'unauthorized'},401);
 }
 let ticket='';
 try{
  const body=JSON.parse(raw||'{}') as {ticket?:string;code?:string};
  ticket=String(body.ticket||body.code||'');
 }catch{return json({error:'invalid json'},400);}
 if(!ticket)return json({error:'ticket required'},400);
 const redeemed=consumeHandoff(ticket);
 if(!redeemed)return json({error:'invalid or expired ticket'},410);
 logJson('info',{request_id:requestId,route:'integrations/lms/handoff',status:200,event:'handoff_redeem',user_id:redeemed.user_id});
 return json({ok:true,...redeemed});
}

export async function GET(req:NextRequest){
 // Convenience GET with query ticket still requires signature over empty body + ticket header optional — prefer POST.
 return json({error:'Use POST with signed JSON {ticket}'},405);
}
