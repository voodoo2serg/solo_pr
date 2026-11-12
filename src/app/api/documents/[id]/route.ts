import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const COOKIE='solo_session';

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {sessionUser}=await import('@/lib/server/store');
 const {getDocumentRow,readLocalDocument,verifyDownloadToken}=await import('@/lib/server/documents');
 const {id}=await params;
 const user=sessionUser(req.cookies.get(COOKIE)?.value);
 const doc=getDocumentRow(id);
 if(!doc)return NextResponse.json({error:'Не найдено'},{status:404});
 const token=req.nextUrl.searchParams.get('token')||'';
 const allowed=!!user&&(user.id===doc.user_id||user.role==='admin')||(!!token&&!!user&&verifyDownloadToken(token,id,user.id));
 if(!allowed)return NextResponse.json({error:'Недостаточно прав'},{status:403});
 if(doc.storage==='external'){
  return NextResponse.redirect(doc.url,302);
 }
 const bytes=readLocalDocument(doc.object_key);
 if(!bytes)return NextResponse.json({error:'Файл не найден'},{status:404});
 const filename=doc.object_key.split('/').pop()||'document.bin';
 return new NextResponse(new Uint8Array(bytes),{
  headers:{
   'Content-Type':'application/octet-stream',
   'Content-Disposition':'attachment; filename="'+filename.replace(/"/g,'')+'"',
   'Cache-Control':'private, no-store',
   'X-Content-Type-Options':'nosniff',
  },
 });
}
