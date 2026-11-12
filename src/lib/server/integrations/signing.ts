import 'server-only';
import {createHmac,timingSafeEqual,createHash,randomBytes} from 'node:crypto';

/** Canonical JSON: sorted object keys, stable for HMAC. */
export function canonicalJson(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
 const obj=value as Record<string,unknown>;
 return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(obj[k])).join(',')+'}';
}

export function signPayload(secret:string,body:string,timestamp:string):string{
 return createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
}

export function verifySignature(secret:string,body:string,timestamp:string,signature:string,maxSkewMs=5*60*1000):boolean{
 if(!secret||!signature||!timestamp)return false;
 const ts=Number(timestamp);
 if(!Number.isFinite(ts)||Math.abs(Date.now()-ts)>maxSkewMs)return false;
 const expected=signPayload(secret,body,timestamp);
 const a=Buffer.from(expected,'hex');
 const b=Buffer.from(signature.replace(/^sha256=/,''),'hex');
 if(a.length!==b.length)return false;
 return timingSafeEqual(a,b);
}

export function hashUserId(id:string):string{
 return createHash('sha256').update(id).digest('hex').slice(0,16);
}

export function oneTimeCode(bytes=24):string{
 return randomBytes(bytes).toString('base64url');
}
