import {NextResponse} from 'next/server';

/** Readiness for reverse proxy / orchestrator. */
export async function GET(){
 const {sqliteReadable}=await import('@/lib/server/observability');
 const ok=sqliteReadable();
 return NextResponse.json({ready:ok},{status:ok?200:503,headers:{'Cache-Control':'no-store'}});
}
