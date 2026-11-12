import 'server-only';
import {db} from '../store';

db.exec(`CREATE TABLE IF NOT EXISTS integration_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated TEXT NOT NULL);`);

export type IntegrationToggle={enabled:boolean;updated:string};

function envFlag(name:string,fallback=false){
 const v=process.env[name];
 if(v===undefined||v==='')return fallback;
 return v==='1'||v.toLowerCase()==='true'||v==='yes';
}

export function integrationEnv(){
 return {
  voronkaWebhookUrl:process.env.VORONKA_WEBHOOK_URL||'',
  voronkaWebhookSecret:process.env.VORONKA_WEBHOOK_SECRET||'',
  voronkaInboundSecret:process.env.VORONKA_INBOUND_SECRET||process.env.VORONKA_WEBHOOK_SECRET||'',
  voronkaBaseUrl:process.env.VORONKA_BASE_URL||'',
  voronkaEnabled:envFlag('VORONKA_ENABLED',!!process.env.VORONKA_WEBHOOK_URL),
  lmsBaseUrl:process.env.LMS_BASE_URL||'',
  lmsApiSecret:process.env.LMS_API_SECRET||'',
  lmsEnabled:envFlag('LMS_ENABLED',!!process.env.LMS_BASE_URL),
  oidcIssuer:process.env.OIDC_ISSUER||'',
  oidcClientId:process.env.OIDC_CLIENT_ID||'',
  oidcClientSecret:process.env.OIDC_CLIENT_SECRET||'',
  oidcRedirectUri:process.env.OIDC_REDIRECT_URI||'',
  oidcEnabled:envFlag('OIDC_ENABLED',!!process.env.OIDC_ISSUER),
  documentAllowlist:(process.env.DOCUMENT_URL_ALLOWLIST||'').split(',').map(s=>s.trim()).filter(Boolean),
  sitesAdminElevate:envFlag('SITES_ADMIN_ELEVATE',false),
  pdHostCountry:process.env.PD_HOST_COUNTRY||'RU',
  pdHostProvider:process.env.PD_HOST_PROVIDER||'[укажите провайдера RU cloud / VPS]',
  pdHostRegion:process.env.PD_HOST_REGION||'[регион]',
 };
}

export function getSetting(key:string,fallback=''){
 const row=db.prepare('SELECT value FROM integration_settings WHERE key=?').get(key) as {value:string}|undefined;
 return row?.value??fallback;
}

export function setSetting(key:string,value:string){
 const now=new Date().toISOString();
 db.prepare('INSERT INTO integration_settings(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(key,value,now);
 return now;
}

export function isIntegrationEnabled(name:'voronka'|'lms'|'oidc'){
 const override=getSetting(name+'.enabled','');
 if(override==='true')return true;
 if(override==='false')return false;
 const env=integrationEnv();
 if(name==='voronka')return env.voronkaEnabled;
 if(name==='lms')return env.lmsEnabled;
 return env.oidcEnabled;
}

export function maskUrl(url:string){
 if(!url)return '';
 try{
  const u=new URL(url);
  return u.origin+u.pathname.replace(/\/[^/]+$/,'/***');
 }catch{return '[invalid]';}
}

export function integrationStatusPublic(){
 const env=integrationEnv();
 const last=(key:string)=>{
  const row=db.prepare('SELECT value,updated FROM integration_settings WHERE key=?').get(key) as {value:string;updated:string}|undefined;
  return row?{status:row.value,at:row.updated}:null;
 };
 return {
  voronka:{
   enabled:isIntegrationEnabled('voronka'),
   configured:!!(env.voronkaWebhookUrl&&env.voronkaWebhookSecret),
   urlMasked:maskUrl(env.voronkaWebhookUrl||env.voronkaBaseUrl),
   lastSuccess:last('voronka.last_success'),
   lastError:last('voronka.last_error'),
  },
  lms:{
   enabled:isIntegrationEnabled('lms'),
   configured:!!(env.lmsBaseUrl&&env.lmsApiSecret),
   urlMasked:maskUrl(env.lmsBaseUrl),
   lastSuccess:last('lms.last_success'),
   lastError:last('lms.last_error'),
  },
  oidc:{
   enabled:isIntegrationEnabled('oidc'),
   configured:!!(env.oidcIssuer&&env.oidcClientId),
   issuerMasked:maskUrl(env.oidcIssuer),
  },
  ai:{
   location:'voronka',
   note:'Движок продаж и AI-промпты живут в voronka. На сайте — только статус интеграций и deep link.',
   deepLink:env.voronkaBaseUrl?env.voronkaBaseUrl.replace(/\/$/,'')+'/crm/':null,
  },
  hosting:{
   country:env.pdHostCountry,
   provider:env.pdHostProvider,
   region:env.pdHostRegion,
   productionPath:'vps-ru',
  },
 };
}
