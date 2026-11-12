import 'server-only';
import {logJson} from '../observability';

const globalWorker=globalThis as unknown as {soloOutboxTimer?:ReturnType<typeof setInterval>;soloOutboxRunning?:boolean};

/** Independent outbox poller — does not rely on new lead traffic. */
export function ensureOutboxWorker(){
 if(process.env.NEXT_PHASE==='phase-production-build')return;
 if(process.env.OUTBOX_WORKER==='0'||process.env.OUTBOX_WORKER==='false')return;
 if(globalWorker.soloOutboxTimer)return;
 const ms=Math.max(5_000,Number(process.env.OUTBOX_POLL_MS||15_000)||15_000);
 globalWorker.soloOutboxTimer=setInterval(()=>{
  void tickOutbox('timer');
 },ms);
 // Allow process to exit in tests / short-lived scripts.
 globalWorker.soloOutboxTimer.unref?.();
 logJson('info',{event:'outbox_worker_started',route:'outbox-worker',latency_ms:ms});
}

export async function tickOutbox(source:'timer'|'cron'|'manual'='timer'){
 if(globalWorker.soloOutboxRunning)return {processed:0,skipped:true,reason:'busy',source};
 globalWorker.soloOutboxRunning=true;
 try{
  const {processOutbox}=await import('./voronka');
  const result=await processOutbox(20);
  return {...result,source};
 }catch(e){
  logJson('error',{event:'outbox_tick_fail',route:'outbox-worker',error:e instanceof Error?e.message:'unknown'});
  return {processed:0,skipped:false,error:e instanceof Error?e.message:'unknown',source};
 }finally{
  globalWorker.soloOutboxRunning=false;
 }
}
