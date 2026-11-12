import 'server-only';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {db} from '../store';
import {integrationEnv,isIntegrationEnabled} from './config';

db.exec(`CREATE TABLE IF NOT EXISTS oidc_states(
 state TEXT PRIMARY KEY,
 nonce TEXT NOT NULL,
 code_verifier TEXT NOT NULL,
 redirect TEXT NOT NULL,
 expires INTEGER NOT NULL
);`);

/** IdP decision for commercial center: Keycloak (OIDC). Password login remains secondary until IdP is live. */
export function oidcConfigPublic(){
 const env=integrationEnv();
 return {
  provider:'keycloak',
  enabled:isIntegrationEnabled('oidc'),
  configured:!!(env.oidcIssuer&&env.oidcClientId),
  issuer:env.oidcIssuer?env.oidcIssuer.replace(/\/$/,''):null,
  passwordSecondary:true,
  note:isIntegrationEnabled('oidc')
   ?'Вход через Keycloak (OIDC). Пароль сайта — запасной путь.'
   :'OIDC/Keycloak ещё не включён (OIDC_ENABLED / OIDC_ISSUER). Используется локальный пароль.',
 };
}

function b64url(buf:Buffer){return buf.toString('base64url');}

export function beginOidcLogin(redirectAfter='/account'){
 if(!isIntegrationEnabled('oidc'))throw new Error('OIDC выключен');
 const env=integrationEnv();
 if(!env.oidcIssuer||!env.oidcClientId||!env.oidcRedirectUri)throw new Error('OIDC не настроен');
 const state=b64url(randomBytes(24));
 const nonce=b64url(randomBytes(24));
 const codeVerifier=b64url(randomBytes(32));
 const challenge=b64url(createHash('sha256').update(codeVerifier).digest());
 db.prepare('DELETE FROM oidc_states WHERE expires<?').run(Date.now());
 db.prepare('INSERT INTO oidc_states(state,nonce,code_verifier,redirect,expires) VALUES(?,?,?,?,?)')
  .run(state,nonce,codeVerifier,redirectAfter,Date.now()+10*60*1000);
 const auth=new URL(env.oidcIssuer.replace(/\/$/,'')+'/protocol/openid-connect/auth');
 // Keycloak-style path; generic OIDC issuers may use /.well-known/openid-configuration discovery later.
 auth.searchParams.set('client_id',env.oidcClientId);
 auth.searchParams.set('redirect_uri',env.oidcRedirectUri);
 auth.searchParams.set('response_type','code');
 auth.searchParams.set('scope','openid email profile');
 auth.searchParams.set('state',state);
 auth.searchParams.set('nonce',nonce);
 auth.searchParams.set('code_challenge',challenge);
 auth.searchParams.set('code_challenge_method','S256');
 return {url:auth.toString(),state};
}

export function takeOidcState(state:string){
 const row=db.prepare('SELECT * FROM oidc_states WHERE state=? AND expires>?').get(state,Date.now()) as
  {state:string;nonce:string;code_verifier:string;redirect:string}|undefined;
 if(!row)return null;
 db.prepare('DELETE FROM oidc_states WHERE state=?').run(state);
 return row;
}

export async function exchangeOidcCode(code:string,stateRow:{nonce:string;code_verifier:string}){
 const env=integrationEnv();
 const tokenUrl=env.oidcIssuer.replace(/\/$/,'')+'/protocol/openid-connect/token';
 const body=new URLSearchParams({
  grant_type:'authorization_code',
  code,
  redirect_uri:env.oidcRedirectUri,
  client_id:env.oidcClientId,
  code_verifier:stateRow.code_verifier,
 });
 if(env.oidcClientSecret)body.set('client_secret',env.oidcClientSecret);
 const res=await fetch(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(12_000)});
 if(!res.ok)throw new Error('OIDC token exchange failed: HTTP '+res.status);
 const tokens=await res.json() as {id_token?:string;access_token?:string};
 if(!tokens.id_token)throw new Error('OIDC id_token missing');
 const payload=decodeJwt(tokens.id_token);
 if(payload.nonce&&payload.nonce!==stateRow.nonce)throw new Error('OIDC nonce mismatch');
 return {
  sub:String(payload.sub||''),
  email:String(payload.email||'').toLowerCase(),
  name:String(payload.name||payload.preferred_username||''),
  tokens,
 };
}

function decodeJwt(token:string){
 const part=token.split('.')[1];
 if(!part)return {};
 return JSON.parse(Buffer.from(part,'base64url').toString('utf8')) as Record<string,unknown>;
}

export function logoutUrl(idTokenHint?:string){
 const env=integrationEnv();
 if(!isIntegrationEnabled('oidc')||!env.oidcIssuer)return null;
 const u=new URL(env.oidcIssuer.replace(/\/$/,'')+'/protocol/openid-connect/logout');
 if(env.oidcClientId)u.searchParams.set('client_id',env.oidcClientId);
 if(idTokenHint)u.searchParams.set('id_token_hint',idTokenHint);
 if(process.env.SITE_ORIGIN)u.searchParams.set('post_logout_redirect_uri',process.env.SITE_ORIGIN);
 return u.toString();
}

/** Merge policy: oidc_sub is stable; email is soft key. */
export function upsertOidcUser(identity:{sub:string;email:string;name:string}){
 if(!identity.sub)throw new Error('OIDC sub required');
 const bySub=db.prepare('SELECT * FROM users WHERE oidc_sub=?').get(identity.sub) as {id:string}|undefined;
 if(bySub)return bySub.id;
 if(identity.email){
  const byEmail=db.prepare('SELECT * FROM users WHERE email=?').get(identity.email) as {id:string;oidc_sub?:string}|undefined;
  if(byEmail){
   if(byEmail.oidc_sub&&byEmail.oidc_sub!==identity.sub)throw new Error('Email уже связан с другим OIDC субъектом — требуется ручной merge');
   db.prepare('UPDATE users SET oidc_sub=?,external_id=COALESCE(external_id,?) WHERE id=?').run(identity.sub,identity.sub,byEmail.id);
   db.prepare('INSERT INTO audit(actor,action,created) VALUES(?,?,?)').run(byEmail.id,'oidc.link:'+identity.sub,new Date().toISOString());
   return byEmail.id;
  }
 }
 const id=randomUUID();
 const username=('oidc_'+identity.sub.replace(/[^a-z0-9]/gi,'').slice(0,20).toLowerCase())||('u_'+id.slice(0,8));
 const email=identity.email||(identity.sub+'@users.local');
 const name=(identity.name||email.split('@')[0]).slice(0,80);
 db.prepare("INSERT INTO users(id,email,username,name,password,role,club,created,consent,external_id,oidc_sub) VALUES(?,?,?,?,?,'member',0,?,?,?,?)")
  .run(id,email,username,name,'oidc:'+identity.sub,new Date().toISOString(),JSON.stringify({acceptedAt:new Date().toISOString(),version:'oidc',source:'oidc'}),identity.sub,identity.sub);
 return id;
}
