import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function json(data:unknown,status=200){
 return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

/** Inbound signed M2M from voronka: deal.paid / access.granted / access.revoked. */
export async function POST(req:NextRequest){
 const {applyAccessEvent,verifyInbound}=await import('@/lib/server/integrations');
 const {bumpMetric,logJson,newRequestId}=await import('@/lib/server/observability');
 const requestId=newRequestId();
 const started=Date.now();
 const raw=await req.text();
 if(Buffer.byteLength(raw)>100_000)return json({error:'payload too large'},413);
 const timestamp=req.headers.get('x-voronka-timestamp')||req.headers.get('x-solo-timestamp')||'';
 const signature=req.headers.get('x-voronka-signature')||req.headers.get('x-solo-signature')||'';
 if(!verifyInbound(raw,timestamp,signature)){
  bumpMetric('auth_failures');
  logJson('warn',{request_id:requestId,route:'integrations/voronka',status:401,event:'inbound_auth_fail',latency_ms:Date.now()-started});
  return json({error:'unauthorized'},401);
 }
 let body:{event_id:string;type:'deal.paid'|'access.granted'|'access.revoked';email?:string;external_id?:string;course_id?:string;club?:boolean;name?:string};
 try{body=JSON.parse(raw);}catch{return json({error:'invalid json'},400);}
 if(!body.event_id||!['deal.paid','access.granted','access.revoked'].includes(body.type)){
  return json({error:'event_id and type (deal.paid|access.granted|access.revoked) required'},400);
 }
 try{
  const result=applyAccessEvent(body);
  logJson('info',{request_id:requestId,route:'integrations/voronka',status:200,event:body.type,latency_ms:Date.now()-started});
  return json(result);
 }catch(e){
  bumpMetric('http_5xx');
  const msg=e instanceof Error?e.message:'error';
  logJson('error',{request_id:requestId,route:'integrations/voronka',status:400,error:msg,latency_ms:Date.now()-started});
  return json({error:msg},400);
 }
}
